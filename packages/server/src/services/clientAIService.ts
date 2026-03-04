/**
 * Client AI Service — Per-client intelligence chat.
 * Given a client name + all their assets (case studies, results, testimonials, awards, proposals),
 * GPT-4o answers questions about the client, surfaces insights, and helps draft content.
 */

import OpenAI from "openai"
import type { Response } from "express"
import { streamCompletion, truncateHistory, CHART_PROMPT, parseChartData } from "./utils/streamHelper.js"

// ─── Lazy OpenAI ─────────────────────────────────────────────

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// ─── Types ───────────────────────────────────────────────────

export interface ClientChatContext {
  clientName: string
  sector?: string
  caseStudies: Array<{
    focus: string
    challenge?: string | null
    solution?: string | null
    metrics: Array<{ label: string; value: string }>
    testimonialQuote?: string | null
    testimonialAttribution?: string | null
  }>
  results: Array<{
    metric: string
    result: string
    direction: "increase" | "decrease"
    numericValue?: number
  }>
  testimonials: Array<{
    quote: string
    name?: string | null
    title?: string | null
    organization?: string | null
    status?: string
  }>
  awards: Array<{
    name: string
    year: number | string
    issuingAgency?: string | null
    category?: string | null
    awardLevel?: string | null
  }>
  proposals: Array<{
    date?: string | null
    projectType?: string | null
    category?: string | null
    won?: string | null
    servicesOffered?: string[]
  }>
  qaAnswers?: Array<{
    question: string
    answer: string
    topic: string
  }>
  documents?: Array<{
    title: string
    docType: string
    summary: string | null
    keyPoints: string[] | null
  }>
  brandKit?: {
    primaryColor: string | null
    primaryFont: string | null
    tone: string | null
    styleNotes: string | null
    websiteUrl: string | null
  } | null
}

// ─── Context Builder ─────────────────────────────────────────

function buildClientContext(ctx: ClientChatContext): string {
  const sections: string[] = []

  sections.push(`=== CLIENT: ${ctx.clientName.toUpperCase()} ===`)
  if (ctx.sector) sections.push(`Sector: ${ctx.sector}`)

  if (ctx.caseStudies.length > 0) {
    const lines = ctx.caseStudies.map((cs, i) => {
      const metrics = cs.metrics.map(m => `${m.value} ${m.label}`).join("; ")
      const parts = [`[Case Study ${i + 1}] Focus: ${cs.focus}`]
      if (cs.challenge) parts.push(`  Challenge: ${cs.challenge}`)
      if (cs.solution) parts.push(`  Solution: ${cs.solution}`)
      if (metrics) parts.push(`  Results: ${metrics}`)
      if (cs.testimonialQuote) parts.push(`  Quote: "${cs.testimonialQuote}"${cs.testimonialAttribution ? ` — ${cs.testimonialAttribution}` : ""}`)
      return parts.join("\n")
    })
    sections.push(`=== CASE STUDIES (${lines.length}) ===\n${lines.join("\n\n")}`)
  }

  if (ctx.results.length > 0) {
    const lines = ctx.results.map(r => {
      const arrow = r.direction === "increase" ? "↑" : "↓"
      return `${arrow} ${r.result} ${r.metric}`
    })
    sections.push(`=== KEY RESULTS (${lines.length}) ===\n${lines.join("\n")}`)
  }

  if (ctx.testimonials.length > 0) {
    const lines = ctx.testimonials.map(t => {
      const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
      return `"${t.quote}"${who ? ` — ${who}` : ""}`
    })
    sections.push(`=== TESTIMONIALS (${lines.length}) ===\n${lines.join("\n\n")}`)
  }

  if (ctx.awards.length > 0) {
    const lines = ctx.awards.map(a => {
      const parts = [a.name, a.year]
      if (a.awardLevel) parts.push(a.awardLevel)
      if (a.issuingAgency) parts.push(`from ${a.issuingAgency}`)
      return parts.join(" · ")
    })
    sections.push(`=== AWARDS (${lines.length}) ===\n${lines.join("\n")}`)
  }

  if (ctx.proposals.length > 0) {
    const won = ctx.proposals.filter(p => p.won === "Yes").length
    const lost = ctx.proposals.filter(p => p.won === "No").length
    const pending = ctx.proposals.filter(p => !p.won || p.won === "Pending").length
    const lines = ctx.proposals.map(p => {
      const label = p.projectType || p.category || "Proposal"
      const date = p.date ? new Date(p.date).getFullYear() : "?"
      const status = p.won ?? "Pending"
      const svcs = p.servicesOffered?.length ? ` [${p.servicesOffered.slice(0, 3).join(", ")}]` : ""
      return `${label} (${date}) — ${status}${svcs}`
    })
    sections.push(
      `=== PROPOSALS (${lines.length} total — ${won} won, ${lost} lost, ${pending} pending) ===\n${lines.join("\n")}`
    )
  }

  if (ctx.qaAnswers && ctx.qaAnswers.length > 0) {
    const lines = ctx.qaAnswers.map(q => `Q: ${q.question}\nA: ${q.answer}${q.topic ? ` [${q.topic}]` : ""}`)
    sections.push(`=== LINKED Q&A ANSWERS (${lines.length}) ===\n${lines.join("\n\n")}`)
  }

  if (ctx.documents && ctx.documents.length > 0) {
    const lines = ctx.documents.map(d => {
      const kp = d.keyPoints?.length ? `\n  Key points: ${d.keyPoints.slice(0, 5).join("; ")}` : ""
      return `[${d.docType}] ${d.title}${d.summary ? `\n  ${d.summary}` : ""}${kp}`
    })
    sections.push(`=== CLIENT DOCUMENTS (${lines.length}) ===\n${lines.join("\n\n")}`)
  }

  if (ctx.brandKit) {
    const parts: string[] = []
    if (ctx.brandKit.websiteUrl) parts.push(`Website: ${ctx.brandKit.websiteUrl}`)
    if (ctx.brandKit.primaryColor) parts.push(`Primary color: ${ctx.brandKit.primaryColor}`)
    if (ctx.brandKit.primaryFont) parts.push(`Primary font: ${ctx.brandKit.primaryFont}`)
    if (ctx.brandKit.tone) parts.push(`Brand tone: ${ctx.brandKit.tone}`)
    if (ctx.brandKit.styleNotes) parts.push(`Style notes: ${ctx.brandKit.styleNotes}`)
    if (parts.length) sections.push(`=== BRAND KIT ===\n${parts.join("\n")}`)
  }

  return sections.join("\n\n")
}

// ─── System Prompt ────────────────────────────────────────────

function buildSystemPrompt(clientName: string, context: string): string {
  return `You are an expert client intelligence assistant for Stamats, a marketing agency. You have deep knowledge of every asset Stamats has for the client "${clientName}" — their case studies, measurable results, testimonials, awards, and proposal history.

Your job is to help Stamats team members:
- Understand what work has been done for this client and what results were achieved
- Identify the strongest proof points to use in proposals or presentations
- Draft case study summaries, proposal sections, or talking points
- Spot patterns and opportunities (e.g., what services have been most successful, win/loss patterns)
- Answer any specific question about this client's history with Stamats

═══ HOW TO RESPOND ═══
1. Use ONLY the data provided below — never invent stats, quotes, or results
2. Format for instant use: **bold** key metrics, clean bullets, clear attribution
3. Be concise and specific — pull actual numbers, real quotes, real outcomes
4. When the data doesn't have what they need, say so clearly
5. Think strategically — if asked about a proposal angle, connect their actual wins to the ask

═══ RULES ═══
- Only reference real data from the provided client record
- Use **bold** for metrics, key outcomes, and important facts
- If drafting content, note clearly which parts are based on real data vs synthesized
- Always refer to measurable results by their actual numbers

${CHART_PROMPT}

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

Follow-ups should be specific to THIS client's data (e.g., "Want me to draft a proposal intro using their enrollment results?", "Should I pull the strongest testimonial for a presentation?").

--- CLIENT DATA ---
${context}`
}

// ─── Follow-up Parser ────────────────────────────────────────

function parseFollowUpPrompts(response: string): {
  cleanResponse: string
  prompts: string[]
} {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch && followUpMatch[1]) {
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
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(s => s.length > 0)
      const cleanResponse = response
        .replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "")
        .trim()
      return { cleanResponse, prompts }
    }
  }

  return {
    cleanResponse: response,
    prompts: [
      "What are the strongest proof points I can use in a proposal?",
      "Can you draft a brief case study summary for this client?",
      "What patterns do you see in their proposal history?",
    ],
  }
}

// ─── Stream Function ──────────────────────────────────────────

export async function streamClientChat(
  query: string,
  clientContext: ClientChatContext,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  const context = buildClientContext(clientContext)
  const systemPrompt = buildSystemPrompt(clientContext.clientName, context)

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.4,
    maxTokens: 3000,
    metadata: {
      clientName: clientContext.clientName,
      assetCounts: {
        caseStudies: clientContext.caseStudies.length,
        results: clientContext.results.length,
        testimonials: clientContext.testimonials.length,
        awards: clientContext.awards.length,
        proposals: clientContext.proposals.length,
      },
    },
    parseFollowUpPrompts,
    res,
  })
}

// ─── Gap Analysis ────────────────────────────────────────────────

export async function analyzeClientGaps(
  clientContext: ClientChatContext
): Promise<string> {
  const openai = getOpenAI()
  if (!openai) return "AI service not configured."

  const context = buildClientContext(clientContext)

  const systemPrompt = `You are a client asset analyst for Stamats, a marketing agency. You have been given all the assets Stamats has for the client "${clientContext.clientName}".

Your job is to perform a gap analysis — identify what's missing, what's thin, and what action items the team should prioritize. Be specific and actionable.

FORMAT YOUR RESPONSE AS:

## Asset Gaps
List specific asset types that are missing or thin (e.g., "No testimonials on file", "Only 1 case study — need more to show breadth").

## Strength Areas
Briefly note what's strong (e.g., "Strong win rate at 75%", "3 detailed case studies with metrics").

## Action Items
Numbered list of specific, concrete next steps. Reference real data when possible (e.g., "Ask the VP of Enrollment who praised the 35% increase for a formal testimonial").

RULES:
- Only reference real data from the provided record — never invent
- Be concise and practical
- Prioritize the highest-impact gaps first
- If the client has very little data, focus on the most important things to gather first

--- CLIENT DATA ---
${context}`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze the asset portfolio for ${clientContext.clientName} and identify gaps, strengths, and action items.` },
    ],
    temperature: 0.4,
    max_tokens: 2000,
  })

  return response.choices[0]?.message?.content ?? "No analysis generated."
}
