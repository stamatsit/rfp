/**
 * Unified AI Service — Cross-Referential Intelligence Hub
 *
 * Combines three data sources with CROSS-REFERENCE capabilities:
 * 1. Q&A Library (approved answers + photos)
 * 2. Proposal History (win/loss, trends, team performance)
 * 3. Case Studies (40 case studies, testimonials, awards)
 *
 * The power: answering questions that NO SINGLE SOURCE could answer alone.
 */

import OpenAI from "openai"
import type { Response } from "express"
import { searchAnswers } from "./answerService.js"
import { searchPhotos } from "./photoService.js"
import { getAllProposals } from "./proposalSyncService.js"
import { getPipelineStats } from "./pipelineSyncService.js"
import { clientSuccessData } from "../data/clientSuccessData.js"
import type { Proposal } from "../db/index.js"
import { streamCompletion, truncateHistory, CHART_PROMPT, parseChartData } from "./utils/streamHelper.js"

// ─── Lazy-initialized OpenAI client ─────────────────────────

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// ─── Interfaces ─────────────────────────────────────────────

export interface UnifiedAIResult {
  response: string
  dataUsed: {
    proposals: {
      count: number
      winRate: number
      relevantClients: string[]
    }
    caseStudies: {
      count: number
      clients: string[]
      testimonials: number
    }
    library: {
      answers: number
      photos: number
      topics: string[]
    }
  }
  crossReferenceInsights: string[]
  followUpPrompts: string[]
  chartData?: Record<string, unknown>
  refused: boolean
  refusalReason?: string
}

interface CrossReference {
  type: "win-without-casestudy" | "casestudy-without-recent-win" | "service-gap" | "testimonial-opportunity"
  description: string
  priority: "high" | "medium" | "low"
}

// ─── Cross-Reference Engine ─────────────────────────────────

function findCrossReferences(proposals: Proposal[]): CrossReference[] {
  const insights: CrossReference[] = []

  // Get recent wins (last 2 years)
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const recentWins = proposals.filter(p =>
    p.won === "Yes" &&
    p.date &&
    new Date(p.date) >= twoYearsAgo
  )

  const recentWinClients = new Set(recentWins.map(p => p.client?.toLowerCase().trim()).filter(Boolean))
  const caseStudyClients = new Set(clientSuccessData.caseStudies.map(cs => cs.client.toLowerCase().trim()))
  const testimonialClients = new Set(clientSuccessData.testimonials.map(t => t.organization.toLowerCase().trim()))

  // 1. Wins without case studies
  const winsWithoutCaseStudies = recentWins.filter(p =>
    p.client && !caseStudyClients.has(p.client.toLowerCase().trim())
  )

  if (winsWithoutCaseStudies.length >= 3) {
    const clients = [...new Set(winsWithoutCaseStudies.map(p => p.client))].slice(0, 5)
    insights.push({
      type: "win-without-casestudy",
      description: `You've won ${winsWithoutCaseStudies.length} projects in the last 2 years without case studies: ${clients.join(", ")}`,
      priority: "high"
    })
  }

  // 2. Wins without testimonials (testimonial opportunity)
  const winsWithoutTestimonials = recentWins.filter(p =>
    p.client && !testimonialClients.has(p.client.toLowerCase().trim())
  )

  if (winsWithoutTestimonials.length >= 5) {
    const clients = [...new Set(winsWithoutTestimonials.map(p => p.client))].slice(0, 5)
    insights.push({
      type: "testimonial-opportunity",
      description: `${winsWithoutTestimonials.length} recent wins could provide testimonials: ${clients.join(", ")}`,
      priority: "medium"
    })
  }

  // 3. Service gaps — services we win but have few case studies for
  const serviceWins: Record<string, number> = {}
  recentWins.forEach(p => {
    (p.servicesOffered || []).forEach(s => {
      serviceWins[s] = (serviceWins[s] || 0) + 1
    })
  })

  const caseStudyFocuses = clientSuccessData.caseStudies.map(cs => cs.focus.toLowerCase())

  Object.entries(serviceWins)
    .filter(([_, count]) => count >= 5)
    .forEach(([service, count]) => {
      const hasCaseStudy = caseStudyFocuses.some(f =>
        f.includes(service.toLowerCase()) || service.toLowerCase().includes(f)
      )
      if (!hasCaseStudy) {
        insights.push({
          type: "service-gap",
          description: `You've won ${count} "${service}" projects but have few/no case studies featuring this service`,
          priority: "medium"
        })
      }
    })

  // 4. Case studies without recent wins (may be outdated)
  const caseStudiesWithoutRecentWins = clientSuccessData.caseStudies.filter(cs =>
    !recentWinClients.has(cs.client.toLowerCase().trim())
  )

  if (caseStudiesWithoutRecentWins.length > 10) {
    insights.push({
      type: "casestudy-without-recent-win",
      description: `${caseStudiesWithoutRecentWins.length} case studies are from clients you haven't won recently — consider refreshing`,
      priority: "low"
    })
  }

  return insights.slice(0, 5) // Limit to top 5 insights
}

// ─── Win Rate Calculations ──────────────────────────────────

function calculateWinRates(proposals: Proposal[]) {
  const decided = proposals.filter(p => p.won === "Yes" || p.won === "No")
  const won = decided.filter(p => p.won === "Yes")

  const overall = decided.length > 0 ? won.length / decided.length : 0

  // By service
  const byService: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    (p.servicesOffered || []).forEach(s => {
      if (!byService[s]) byService[s] = { won: 0, total: 0, rate: 0 }
      byService[s].total++
      if (p.won === "Yes") byService[s].won++
    })
  })
  Object.values(byService).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  // By school type
  const bySchoolType: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    if (p.schoolType) {
      if (!bySchoolType[p.schoolType]) bySchoolType[p.schoolType] = { won: 0, total: 0, rate: 0 }
      const stEntry = bySchoolType[p.schoolType]!
      stEntry.total++
      if (p.won === "Yes") stEntry.won++
    }
  })
  Object.values(bySchoolType).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  // By CE
  const byCE: Record<string, { won: number; total: number; rate: number }> = {}
  decided.forEach(p => {
    if (p.ce) {
      if (!byCE[p.ce]) byCE[p.ce] = { won: 0, total: 0, rate: 0 }
      const ceEntry = byCE[p.ce]!
      ceEntry.total++
      if (p.won === "Yes") ceEntry.won++
    }
  })
  Object.values(byCE).forEach(v => { v.rate = v.total > 0 ? v.won / v.total : 0 })

  return {
    overall,
    wonCount: won.length,
    lostCount: decided.length - won.length,
    totalDecided: decided.length,
    byService,
    bySchoolType,
    byCE
  }
}

// ─── Context Builder ────────────────────────────────────────

async function buildUnifiedContext(
  _query: string,
  proposals: Proposal[],
  libraryAnswers: Array<{ id: string; question: string; answer: string; topicId: string }>,
  libraryPhotos: Array<{ id: string; displayTitle: string; description: string | null }>
): Promise<string> {
  const winRates = calculateWinRates(proposals)
  const crossRefs = findCrossReferences(proposals)

  // Get pipeline stats if available
  let pipelineStats = null
  try {
    pipelineStats = await getPipelineStats()
  } catch {
    // Pipeline data not available
  }

  // Date range for proposals
  const dates = proposals.filter(p => p.date).map(p => new Date(p.date!))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`

  let context = `
═══════════════════════════════════════════════════════════════
                    UNIFIED DATA SOURCES
═══════════════════════════════════════════════════════════════

━━━ SOURCE 1: PROPOSAL HISTORY ━━━
Total Proposals: ${proposals.length}
Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}
Won: ${winRates.wonCount} | Lost: ${winRates.lostCount} | Win Rate: ${formatRate(winRates.overall)}

WIN RATES BY SCHOOL TYPE:
${Object.entries(winRates.bySchoolType)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 8)
  .map(([type, stats]) => `- ${type}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

WIN RATES BY SERVICE:
${Object.entries(winRates.byService)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 10)
  .map(([service, stats]) => `- ${service}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

WIN RATES BY ACCOUNT EXECUTIVE:
${Object.entries(winRates.byCE)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 8)
  .map(([ce, stats]) => `- ${ce}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
  .join("\n") || "No data"}

RECENT PROPOSAL WINS (last 20):
${proposals
  .filter(p => p.won === "Yes")
  .slice(0, 20)
  .map(p => `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) — ${(p.servicesOffered || []).slice(0, 3).join(", ") || "No services"}`)
  .join("\n") || "No recent wins"}

${pipelineStats && pipelineStats.total > 0 ? `
PIPELINE METRICS (RFP Intake):
- Total RFPs Reviewed: ${pipelineStats.total}
- Pursuit Rate: ${((pipelineStats.processed / pipelineStats.total) * 100).toFixed(1)}%
- Pass Rate: ${((pipelineStats.passing / pipelineStats.total) * 100).toFixed(1)}%
` : ""}

━━━ SOURCE 2: CASE STUDIES (${clientSuccessData.caseStudies.length} total) ━━━

CASE STUDY DATABASE:
${clientSuccessData.caseStudies.map(cs => {
  const metrics = cs.metrics.map(m => `${m.value} ${m.label}`).join("; ")
  const testimonial = cs.testimonial ? `\n  Quote: "${cs.testimonial.quote.slice(0, 100)}..." — ${cs.testimonial.attribution}` : ""
  return `[${cs.client}] (${cs.category}, ${cs.focus})
  Challenge: ${cs.challenge.slice(0, 150)}...
  Metrics: ${metrics || "None recorded"}${testimonial}`
}).join("\n\n")}

TOP-LINE RESULTS (${clientSuccessData.topLineResults.length} stats):
${clientSuccessData.topLineResults
  .sort((a, b) => b.numericValue - a.numericValue)
  .slice(0, 15)
  .map(r => `- ${r.result} ${r.metric} — ${r.client}`)
  .join("\n")}

TESTIMONIALS (${clientSuccessData.testimonials.length} total):
${clientSuccessData.testimonials.slice(0, 10).map(t => {
  const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
  return `"${t.quote.slice(0, 150)}..." — ${who}`
}).join("\n\n")}

AWARDS (${clientSuccessData.awards.length} total):
${clientSuccessData.awards.slice(0, 10).map(a => `- ${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}

━━━ SOURCE 3: Q&A LIBRARY ━━━
Relevant Answers Found: ${libraryAnswers.length}
Relevant Photos Found: ${libraryPhotos.length}

${libraryAnswers.length > 0 ? `LIBRARY ANSWERS:
${libraryAnswers.map((a, i) => `[Answer ${i + 1}]
Q: ${a.question}
A: ${a.answer.slice(0, 500)}${a.answer.length > 500 ? "..." : ""}`).join("\n\n")}` : "No relevant library answers found."}

${libraryPhotos.length > 0 ? `
LIBRARY PHOTOS:
${libraryPhotos.map((p, i) => `[Photo ${i + 1}] ${p.displayTitle} — ${p.description || "No description"}`).join("\n")}` : ""}

═══════════════════════════════════════════════════════════════
                   CROSS-REFERENCE INSIGHTS
═══════════════════════════════════════════════════════════════
${crossRefs.length > 0
  ? crossRefs.map(cr => `⚠️ [${cr.priority.toUpperCase()}] ${cr.description}`).join("\n")
  : "No critical cross-reference gaps detected."}

═══════════════════════════════════════════════════════════════
`

  return context.trim()
}

// ─── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Unified AI for Stamats, a marketing agency with 100+ years of experience. You have UNIFIED ACCESS to three data sources that you MUST cross-reference:

1. **PROPOSAL HISTORY**: Win/loss records, win rates by school type/service/AE, pipeline data
2. **CASE STUDIES**: ${clientSuccessData.caseStudies.length} case studies, ${clientSuccessData.testimonials.length} testimonials, ${clientSuccessData.awards.length} awards
3. **Q&A LIBRARY**: Approved answers and photos for RFP responses

═══ YOUR SUPERPOWER: CROSS-REFERENCING ═══

You can answer questions that NO SINGLE SOURCE could answer:
- "Do we have case studies for clients we've actually won?" (proposals + case studies)
- "What testimonials are from clients we won recently?" (proposals + testimonials)
- "What's our win rate for services we have strong case studies for?" (proposals + case studies)
- "Prep me for a proposal" (all three: win rate + case studies + library answers)

═══ CRITICAL RULES ═══

1. **ALWAYS CROSS-REFERENCE** — Don't just answer from one source. Connect the dots.
2. **FLAG DISCONNECTS** — If you notice gaps (e.g., "You've won 5 but only have 1 case study"), say so.
3. **BE SPECIFIC** — Use real client names, real numbers, real quotes from the data.
4. **LAYER YOUR ANSWERS** — For proposal prep: combine win probability + relevant case studies + library content.
5. **NEVER INVENT** — Only use data from the provided sources.

═══ RESPONSE STYLE ═══

- Use **bold** for key numbers, client names, and insights
- Use bullet points for lists
- Keep responses actionable and strategic
- When giving recommendations, cite the data that supports them

VISUALIZATIONS:${CHART_PROMPT}

At the end of your response, include exactly 3-4 follow-up prompts:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

Make follow-ups build on the current answer — help the user dig deeper or take action.`

// ─── Follow-up Prompt Parser ────────────────────────────────

function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch && followUpMatch[1]) {
    try {
      const promptsJson = `[${followUpMatch[1]}]`
      const prompts = JSON.parse(promptsJson)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    } catch {
      const prompts = followUpMatch[1]
        .split(",")
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(s => s.length > 0)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    }
  }

  return {
    cleanResponse: response,
    prompts: [
      "What gaps exist in our proof points?",
      "Which clients should we ask for testimonials?",
      "Prep me for a proposal based on this insight"
    ]
  }
}

// ─── Main Query Function ────────────────────────────────────

export async function queryUnifiedAI(query: string): Promise<UnifiedAIResult> {
  const openai = getOpenAI()

  const emptyResult: UnifiedAIResult = {
    response: "",
    dataUsed: {
      proposals: { count: 0, winRate: 0, relevantClients: [] },
      caseStudies: { count: 0, clients: [], testimonials: 0 },
      library: { answers: 0, photos: 0, topics: [] }
    },
    crossReferenceInsights: [],
    followUpPrompts: [],
    refused: true,
    refusalReason: ""
  }

  if (!openai) {
    return {
      ...emptyResult,
      refusalReason: "AI service not configured. Please set OPENAI_API_KEY in your environment."
    }
  }

  try {
    // Load all three data sources in parallel — gracefully degrade if any are unavailable
    const [proposals, libraryAnswers, libraryPhotos] = await Promise.all([
      getAllProposals().catch(() => [] as Proposal[]),
      searchAnswers(query, { status: "Approved", limit: 10 }).catch(() => [] as Array<{ id: string; question: string; answer: string; topicId: string; linkedPhotosCount?: number }>),
      searchPhotos(query, { status: "Approved", limit: 5 }).catch(() => [] as Array<{ id: string; displayTitle: string; description: string | null; linkedAnswersCount?: number }>),
    ])

    // Build unified context
    const context = await buildUnifiedContext(
      query,
      proposals,
      libraryAnswers.map(a => ({
        id: a.id,
        question: a.question,
        answer: a.answer,
        topicId: a.topicId
      })),
      libraryPhotos.map(p => ({
        id: p.id,
        displayTitle: p.displayTitle,
        description: p.description
      }))
    )

    // Calculate stats for response metadata
    const winRates = calculateWinRates(proposals)
    const crossRefs = findCrossReferences(proposals)

    // Get unique topics from library answers
    const uniqueTopics = [...new Set(libraryAnswers.map(a => a.topicId))]

    // Recent proposal clients
    const recentClients = proposals
      .filter(p => p.won === "Yes")
      .slice(0, 10)
      .map(p => p.client)
      .filter((c): c is string => !!c)

    // Case study clients
    const caseStudyClients = clientSuccessData.caseStudies.slice(0, 10).map(cs => cs.client)

    // Call GPT-4o with unified context
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n--- UNIFIED DATA ---\n${context}`
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.4,
      max_tokens: 3000
    })

    const rawResponse = completion.choices[0]?.message?.content || ""
    const { cleanResponse, prompts } = parseFollowUpPrompts(rawResponse)
    const { cleanText: finalResponse, chartData } = parseChartData(cleanResponse)

    return {
      response: finalResponse,
      chartData: chartData || undefined,
      dataUsed: {
        proposals: {
          count: proposals.length,
          winRate: winRates.overall,
          relevantClients: recentClients
        },
        caseStudies: {
          count: clientSuccessData.caseStudies.length,
          clients: caseStudyClients,
          testimonials: clientSuccessData.testimonials.length
        },
        library: {
          answers: libraryAnswers.length,
          photos: libraryPhotos.length,
          topics: uniqueTopics
        }
      },
      crossReferenceInsights: crossRefs.map(cr => cr.description),
      followUpPrompts: prompts,
      refused: false
    }
  } catch (error) {
    console.error("Unified AI query failed:", error)

    return {
      ...emptyResult,
      refusalReason: "An error occurred while processing your request. Please try again."
    }
  }
}

// ─── Stats Function (for status bar) ────────────────────────

export async function getUnifiedAIStats(): Promise<{
  proposals: { count: number; winRate: number }
  caseStudies: { count: number; testimonials: number }
  library: { answers: number; photos: number }
}> {
  try {
    const proposals = await getAllProposals()
    const winRates = calculateWinRates(proposals)

    // Get library counts (simple search with empty query)
    const [answers, photos] = await Promise.all([
      searchAnswers("", { status: "Approved", limit: 1000 }),
      searchPhotos("", { status: "Approved", limit: 1000 })
    ])

    return {
      proposals: {
        count: proposals.length,
        winRate: winRates.overall
      },
      caseStudies: {
        count: clientSuccessData.caseStudies.length,
        testimonials: clientSuccessData.testimonials.length
      },
      library: {
        answers: answers.length,
        photos: photos.length
      }
    }
  } catch {
    return {
      proposals: { count: 0, winRate: 0 },
      caseStudies: { count: clientSuccessData.caseStudies.length, testimonials: clientSuccessData.testimonials.length },
      library: { answers: 0, photos: 0 }
    }
  }
}

/**
 * Stream Unified AI via SSE
 */
export async function streamUnifiedAI(
  query: string,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  // Fetch all data sources — gracefully degrade if any are unavailable
  const [proposals, libraryAnswers, libraryPhotos] = await Promise.all([
    getAllProposals().catch(() => [] as Proposal[]),
    searchAnswers(query, { status: "Approved", limit: 10 }).catch(() => [] as Array<{ id: string; question: string; answer: string; topicId: string; linkedPhotosCount?: number }>),
    searchPhotos(query, { status: "Approved", limit: 5 }).catch(() => [] as Array<{ id: string; displayTitle: string; description: string | null; linkedAnswersCount?: number }>),
  ])

  const context = await buildUnifiedContext(
    query,
    proposals,
    libraryAnswers.map(a => ({ id: a.id, question: a.question, answer: a.answer, topicId: a.topicId })),
    libraryPhotos.map(p => ({ id: p.id, displayTitle: p.displayTitle, description: p.description }))
  )

  const winRates = calculateWinRates(proposals)
  const crossRefs = findCrossReferences(proposals)
  const uniqueTopics = [...new Set(libraryAnswers.map(a => a.topicId))]
  const recentClients = proposals.filter(p => p.won === "Yes").slice(0, 10).map(p => p.client).filter((c): c is string => !!c)
  const caseStudyClients = clientSuccessData.caseStudies.slice(0, 10).map(cs => cs.client)

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n--- UNIFIED DATA ---\n${context}` },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.4,
    maxTokens: 3000,
    metadata: {
      dataUsed: {
        proposals: { count: proposals.length, winRate: winRates.overall, relevantClients: recentClients },
        caseStudies: { count: clientSuccessData.caseStudies.length, clients: caseStudyClients, testimonials: clientSuccessData.testimonials.length },
        library: { answers: libraryAnswers.length, photos: libraryPhotos.length, topics: uniqueTopics },
      },
      crossReferenceInsights: crossRefs.map(cr => cr.description),
    },
    parseFollowUpPrompts,
    res,
  })
}
