/**
 * AI Companion Service — Super-powered universal assistant
 *
 * Loads ALL data sources (Q&A library, proposals, case studies) and can:
 * 1. Answer questions about ANY data in the system
 * 2. Guide users to the right tools and pages
 * 3. Surface specific entries with IDs for direct linking
 * 4. Cross-reference data sources for strategic insights
 */

import OpenAI from "openai"
import type { Response } from "express"
import { searchAnswers } from "./answerService.js"
import { searchPhotos } from "./photoService.js"
import { getAllProposals } from "./proposalSyncService.js"
import { clientSuccessData } from "../data/clientSuccessData.js"
import type { Proposal } from "../db/index.js"
import { streamCompletion, truncateHistory, CHART_PROMPT } from "./utils/streamHelper.js"

// ─── Lazy-initialized OpenAI client ─────────────────────────

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// ─── Win Rate Calculator ─────────────────────────────────────

function calculateWinRates(proposals: Proposal[]) {
  const decided = proposals.filter(p => p.won === "Yes" || p.won === "No")
  const won = decided.filter(p => p.won === "Yes")
  const overall = decided.length > 0 ? won.length / decided.length : 0

  const byService: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    (p.servicesOffered || []).forEach(s => {
      if (!byService[s]) byService[s] = { won: 0, total: 0, rate: 0 }
      byService[s]!.total++
      if (p.won === "Yes") byService[s]!.won++
    })
  })
  Object.values(byService).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  const bySchoolType: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    if (p.schoolType) {
      if (!bySchoolType[p.schoolType]) bySchoolType[p.schoolType] = { won: 0, total: 0, rate: 0 }
      bySchoolType[p.schoolType]!.total++
      if (p.won === "Yes") bySchoolType[p.schoolType]!.won++
    }
  })
  Object.values(bySchoolType).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  const byCE: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    if (p.ce) {
      if (!byCE[p.ce]) byCE[p.ce] = { won: 0, total: 0, rate: 0 }
      byCE[p.ce]!.total++
      if (p.won === "Yes") byCE[p.ce]!.won++
    }
  })
  Object.values(byCE).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  return { overall, wonCount: won.length, lostCount: decided.length - won.length, totalDecided: decided.length, byService, bySchoolType, byCE }
}

// ─── Context Builder ─────────────────────────────────────────

async function buildDataContext(
  _query: string,
  proposals: Proposal[],
  libraryAnswers: Array<{ id: string; question: string; answer: string; topicId: string }>,
  libraryPhotos: Array<{ id: string; displayTitle: string; description: string | null }>
): Promise<string> {
  const winRates = calculateWinRates(proposals)
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`

  const dates = proposals.filter(p => p.date).map(p => new Date(p.date!))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

  let context = `
═══ DATA SOURCE 1: PROPOSAL HISTORY ═══
Total Proposals: ${proposals.length}
Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}
Won: ${winRates.wonCount} | Lost: ${winRates.lostCount} | Win Rate: ${formatRate(winRates.overall)}

WIN RATES BY SCHOOL TYPE (top 8):
${Object.entries(winRates.bySchoolType)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 8)
  .map(([type, stats]) => `- ${type}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

WIN RATES BY SERVICE (top 10):
${Object.entries(winRates.byService)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 10)
  .map(([service, stats]) => `- ${service}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

WIN RATES BY ACCOUNT EXECUTIVE (top 8):
${Object.entries(winRates.byCE)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 8)
  .map(([ce, stats]) => `- ${ce}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

RECENT WINS (last 15):
${proposals
  .filter(p => p.won === "Yes")
  .slice(0, 15)
  .map(p => `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) — ${(p.servicesOffered || []).slice(0, 3).join(", ") || "No services"}`)
  .join("\n") || "No recent wins"}

═══ DATA SOURCE 2: CLIENT SUCCESS (${clientSuccessData.caseStudies.length} case studies) ═══

CASE STUDIES:
${clientSuccessData.caseStudies.map(cs => {
  const metrics = cs.metrics.map(m => `${m.value} ${m.label}`).join("; ")
  const testimonial = cs.testimonial ? `\n  Quote: "${cs.testimonial.quote.slice(0, 120)}..." — ${cs.testimonial.attribution}` : ""
  return `[${cs.client}] (${cs.category}, ${cs.focus})
  Challenge: ${cs.challenge.slice(0, 120)}...
  Metrics: ${metrics || "None"}${testimonial}`
}).join("\n\n")}

TOP-LINE RESULTS (${clientSuccessData.topLineResults.length} stats):
${clientSuccessData.topLineResults
  .sort((a, b) => b.numericValue - a.numericValue)
  .slice(0, 12)
  .map(r => `- ${r.result} ${r.metric} — ${r.client}`)
  .join("\n")}

TESTIMONIALS (${clientSuccessData.testimonials.length} total):
${clientSuccessData.testimonials.slice(0, 8).map(t => {
  const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
  return `"${t.quote.slice(0, 120)}..." — ${who}`
}).join("\n\n")}

AWARDS (${clientSuccessData.awards.length} total):
${clientSuccessData.awards.slice(0, 8).map(a => `- ${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}

═══ DATA SOURCE 3: Q&A LIBRARY (${libraryAnswers.length} relevant answers) ═══

${libraryAnswers.length > 0 ? libraryAnswers.map((a, i) => `[Answer ${i + 1}] (ID: ${a.id})
Q: ${a.question}
A: ${a.answer.slice(0, 400)}${a.answer.length > 400 ? "..." : ""}`).join("\n\n") : "No relevant library answers found for this query."}

${libraryPhotos.length > 0 ? `
RELEVANT PHOTOS:
${libraryPhotos.map((p, i) => `[Photo ${i + 1}] (ID: ${p.id}) ${p.displayTitle} — ${p.description || "No description"}`).join("\n")}` : ""}
`

  return context.trim()
}

// ─── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Stamats Content Library AI Companion — the most powerful assistant in the app. You combine the knowledge of a helpful colleague with FULL ACCESS to all data in the system. You're warm, conversational, and incredibly capable.

You can do EVERYTHING:
- Search and retrieve Q&A library entries, case studies, proposals, testimonials, awards, and stats
- Provide win rate analytics, team performance, and strategic insights
- Find specific client results, quotes, and proof points
- Guide users to the right tools and pages with clickable links
- Cross-reference all data sources for comprehensive answers
- Answer detailed how-to questions about every feature

== SOURCE ATTRIBUTION ==
When you reference data from the system, ALWAYS tell the user where it came from so they can find it:
- For Q&A library entries: mention the question title and provide a link like [View in Search Library](/search?q=KEYWORD) where KEYWORD is a key search term from the question
- For case studies: mention the client name and say "from Client Success data"
- For proposals: mention the client and date
- For testimonials: include the attribution
- This helps users copy content and find original entries

== LINKING FORMAT ==
When mentioning a page, ALWAYS provide a clickable markdown link:
- [Search Library](/search)
- [Ask AI](/ai)
- [Import Data](/import)
- [New Entry](/new)
- [Photo Library](/photos)
- [RFP Analyzer](/analyze)
- [Saved Documents](/documents)
- [Proposal Insights](/insights)
- [Case Studies](/case-studies)
- [Unified AI](/unified-ai)
- [Document Studio](/studio)
- [Help](/help)
- [Support](/support)
- [Home](/)

When referencing specific Q&A content, include a search link: [View in Library](/search?q=SEARCH_TERM)

== APPLICATION MAP ==

**[Home](/)** — Dashboard with feature tiles, system status, and quick stats.
**[Search Library](/search)** — Full-text search across Q&A entries, client success data, and photos. Filter by topic, status. Copy answers, edit inline, link photos.
**[Ask AI](/ai)** — AI Q&A from approved library content. Topic filtering, source attribution, content adaptation (shorten/expand/bullets/tone).
**[Import Data](/import)** — Bulk import Q&A from Excel (Question, Answer, Category columns). Deduplicates automatically.
**[New Entry](/new)** — Add individual Q&A entries manually.
**[Photo Library](/photos)** — Upload and manage proposal images (PNG, JPG, GIF, WebP up to 10MB).
**[RFP Analyzer](/analyze)** — Upload RFP docs. Select text → Find Matches, Ask AI, or Add to Library.
**[Saved Documents](/documents)** — Browse previously uploaded RFP documents.
**[Proposal Insights](/insights)** — AI analytics on 10+ years of proposal win/loss data. Win rates, trends, team performance, predictive scoring.
**[Case Studies](/case-studies)** — AI access to 40+ client success stories, testimonials, stats, awards.
**[Unified AI](/unified-ai)** — Cross-references ALL data sources for comprehensive analysis.
**[Document Studio](/studio)** — Rich text editor with templates, inline AI, slash commands, Q&A browser, photo picker, export.
**Settings** (gear icon) — Customize tiles, theme, widgets, AI prefs, keyboard shortcuts, account.
**[Help](/help)** — Searchable FAQ. **[Support](/support)** — Email support team.

== RESPONSE RULES ==
1. Be conversational and warm — you're a helpful colleague, not a manual.
2. When the user asks for DATA (stats, entries, case studies, etc.), ACTUALLY PROVIDE THE DATA from your context. Don't just point them to another page.
3. When providing data, format it cleanly with bold, bullets, and tables as appropriate.
4. ALWAYS cite where data came from — "From the Q&A Library:", "From proposal data:", "From client success:"
5. Include search links for Q&A entries: [Search for "keyword"](/search?q=keyword)
6. Use markdown links for all page references — they're clickable.
7. If the user asks about something across multiple data sources, cross-reference them.
8. For questions that are better handled by a specialized tool, suggest the page AND answer what you can from available data.
9. Keep guidance responses concise (3-5 sentences). Go longer for data-rich answers.
10. NEVER make up data. Only use what's in the provided context.
11. When providing Q&A content, include enough of the answer that the user could copy it directly.
12. Occasionally use encouraging language: "Nice!", "Good thinking!", "Great workflow."

${CHART_PROMPT}

== SETTINGS CONTROL ==
You can change app settings for the user. When the user asks you to change a setting (e.g. "turn on dark mode", "enable the nav rail", "turn off sounds"), include this block AT THE END of your response (after FOLLOW_UP_PROMPTS), on its own line:

APPLY_SETTINGS: [{"key":"theme","value":"dark","label":"Dark mode enabled"}]

Available settings keys and valid values:
- "theme": "light" | "dark" | "system"
- "navRailEnabled": true | false
- "companionEnabled": true | false
- "widgetsEnabled": true | false
- "aiAutoSuggest": true | false
- "aiShowSources": true | false
- "aiResponseLength": "concise" | "balanced" | "detailed"
- "searchHighlightMatches": true | false
- "searchIncludePhotos": true | false
- "reduceMotion": true | false
- "fontSize": "small" | "medium" | "large"
- "highContrast": true | false
- "soundEnabled": true | false
- "showCopyConfirmation": true | false
- "commandPaletteEnabled": true | false
- "aiPoweredSearch": true | false
- "smartSuggestions": true | false

The "label" field is a short confirmation message shown to the user (e.g. "Dark mode enabled", "Nav rail turned on").
Only include APPLY_SETTINGS when the user explicitly asks to change a setting. You can include multiple settings in one array.
After applying, tell the user what you did in your response text (e.g. "Done! I've switched you to dark mode.").

Always end your response with 2-3 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

Follow-ups should feel natural and build on the current answer.`

// ─── Follow-up Prompt Parser ────────────────────────────────

function parseFollowUpPrompts(response: string): {
  cleanResponse: string
  prompts: string[]
} {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch?.[1]) {
    try {
      const promptsJson = `[${followUpMatch[1]}]`
      const prompts = JSON.parse(promptsJson)
      const cleanResponse = response
        .replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "")
        .trim()
      return { cleanResponse, prompts }
    } catch {
      const prompts = followUpMatch[1]
        .split(",")
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s: string) => s.length > 0)
      const cleanResponse = response
        .replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "")
        .trim()
      return { cleanResponse, prompts }
    }
  }

  return {
    cleanResponse: response,
    prompts: [
      "What else can I help you find?",
      "Want to dive deeper into any of this data?",
      "What are you working on right now?",
    ],
  }
}

// ─── Stream Companion Response ──────────────────────────────

export async function streamCompanionQuery(
  query: string,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  behaviorContext?: string
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  // Load all data sources in parallel — gracefully degrade if any fail
  const [proposals, libraryAnswers, libraryPhotos] = await Promise.all([
    getAllProposals().catch(() => [] as Proposal[]),
    searchAnswers(query, { status: "Approved", limit: 15 }).catch(() => [] as Array<{ id: string; question: string; answer: string; topicId: string }>),
    searchPhotos(query, { status: "Approved", limit: 5 }).catch(() => [] as Array<{ id: string; displayTitle: string; description: string | null }>),
  ])

  // Build rich data context
  const dataContext = await buildDataContext(
    query,
    proposals,
    libraryAnswers.map(a => ({ id: a.id, question: a.question, answer: a.answer, topicId: a.topicId })),
    libraryPhotos.map(p => ({ id: p.id, displayTitle: p.displayTitle, description: p.description }))
  )

  const winRates = calculateWinRates(proposals)

  let fullPrompt = `${SYSTEM_PROMPT}\n\n═══ LIVE DATA ═══\n${dataContext}`
  if (behaviorContext) {
    fullPrompt += `\n\n== USER BEHAVIOR CONTEXT ==\n${behaviorContext}`
  }

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: fullPrompt },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.4,
    maxTokens: 3000,
    metadata: {
      type: "companion",
      stats: {
        proposals: proposals.length,
        winRate: winRates.overall,
        libraryAnswers: libraryAnswers.length,
        caseStudies: clientSuccessData.caseStudies.length,
        testimonials: clientSuccessData.testimonials.length,
      },
    },
    parseFollowUpPrompts,
    res,
  })
}
