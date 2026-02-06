/**
 * Client Success AI Service — Helps users find stats, testimonials, awards, and highlights
 * from Stamats' client success database for use in case studies, proposals, presentations, etc.
 *
 * COMPLETELY ISOLATED from Q&A library AI and Proposal Insights.
 * Pattern follows proposalAIService.ts: server-side data, rich context, powerful system prompt.
 */

import OpenAI from "openai"
import { clientSuccessData } from "../data/clientSuccessData.js"

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

export interface CaseStudyInsightResult {
  response: string
  dataUsed: {
    totalCaseStudies: number
    totalTestimonials: number
    totalStats: number
    categoriesSearched: string[]
  }
  followUpPrompts: string[]
  refused: boolean
  refusalReason?: string
}

// ─── Context Builder ────────────────────────────────────────

function buildContext(): string {
  const sections: string[] = []

  // Section 1: Case Studies
  const caseStudyLines = clientSuccessData.caseStudies.map((cs) => {
    const metrics = cs.metrics.map((m) => `${m.value} ${m.label}`).join("; ")
    const testimonial = cs.testimonial
      ? `\n  Testimonial: "${cs.testimonial.quote}" — ${cs.testimonial.attribution}`
      : ""
    const awards = cs.awards ? `\n  Awards: ${cs.awards.join(", ")}` : ""
    return `[${cs.client}] (${cs.category}, ${cs.focus})
  Challenge: ${cs.challenge}
  Solution: ${cs.solution}
  Metrics: ${metrics || "None recorded"}${testimonial}${awards}`
  })
  sections.push(`=== CASE STUDIES (${caseStudyLines.length}) ===\n${caseStudyLines.join("\n\n")}`)

  // Section 2: Top-Line Results (sorted by impact)
  const sortedResults = [...clientSuccessData.topLineResults].sort(
    (a, b) => b.numericValue - a.numericValue
  )
  const resultLines = sortedResults.map(
    (r) => `${r.result} ${r.metric} — ${r.client}`
  )
  sections.push(`=== TOP-LINE RESULTS (${resultLines.length}) ===\n${resultLines.join("\n")}`)

  // Section 3: Testimonials
  const testimonialLines = clientSuccessData.testimonials.map((t) => {
    const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
    return `"${t.quote}" — ${who}`
  })
  sections.push(
    `=== TESTIMONIALS (${testimonialLines.length}) ===\n${testimonialLines.join("\n\n")}`
  )

  // Section 4: Awards
  const awardLines = clientSuccessData.awards.map(
    (a) => `${a.name} (${a.year}) — ${a.clientOrProject}`
  )
  sections.push(`=== AWARDS (${awardLines.length}) ===\n${awardLines.join("\n")}`)

  // Section 5: Company Stats
  const statLines = [
    ...clientSuccessData.companyStats.map(
      (s) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""}`
    ),
    ...clientSuccessData.externallyVerifiedStats.map(
      (s) =>
        `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""} (Source: ${s.source})`
    ),
  ]
  sections.push(`=== COMPANY STATS ===\n${statLines.join("\n")}`)

  // Section 6: Service Lines & Values
  sections.push(
    `=== SERVICE LINES ===\n${clientSuccessData.serviceLines.join(", ")}`
  )
  sections.push(
    `=== CORE VALUES ===\n${clientSuccessData.coreValues.join("\n")}`
  )

  // Section 7: Research Studies
  const researchLines = clientSuccessData.researchStudies.map(
    (r) => `${r.name}: ${r.description}\n  Findings: ${r.findings.join("; ")}`
  )
  sections.push(`=== PROPRIETARY RESEARCH ===\n${researchLines.join("\n\n")}`)

  // Section 8: Notable Firsts
  sections.push(
    `=== NOTABLE FIRSTS ===\n${clientSuccessData.notableFirsts.join("\n")}`
  )

  // Section 9: Conferences
  const confLines = clientSuccessData.conferenceAppearances.map(
    (c) => `${c.event} — ${c.role}`
  )
  sections.push(`=== CONFERENCE PRESENCE ===\n${confLines.join("\n")}`)

  return sections.join("\n\n")
}

// ─── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Client Success data assistant for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing. You have access to a database of ${clientSuccessData.caseStudies.length} client project summaries, ${clientSuccessData.topLineResults.length} top-line results, ${clientSuccessData.testimonials.length} testimonials, and ${clientSuccessData.awards.length} awards.

Your job is to help users FIND and FORMAT highlights from this database — stats, testimonials, awards, client results, and proof points. Users may be building case studies, writing proposals, prepping presentations, or just exploring what's available.

═══ HOW TO RESPOND ═══

1. Pull real data from the database. NEVER invent stats, quotes, or results.
2. Format everything for instant copy-paste: **bold** metrics, clean bullets, clear attribution.
3. When multiple matches exist, show the top 2-3 most relevant — not everything.
4. Be concise. Users want data they can grab and use, not essays.

═══ ADAPT TO CONTEXT ═══

If the user tells you what they're working on, tailor the format:
- **Case study**: organize by Challenge / Solution / Results with the relevant client data
- **Proposal**: lead with proof points and comparable wins that build credibility
- **Presentation**: bold headline stats, short bullets, quotable testimonials
- **General browsing**: clean list with client names and key numbers

If the user doesn't specify, default to a clean, scannable format.

═══ RULES ═══
1. Only reference real data from the provided database — NEVER invent stats or quotes
2. If a user asks you to draft a testimonial, clearly mark it as "Suggested quote:" so they know it's not real
3. Use **bold** for key metrics, client names, and important facts
4. Be specific — pull actual numbers from the database, always include client attribution
5. Format metrics as compelling bullets (e.g., "**+481%** conversion growth on optimized pages — *Client Name*")
6. This is a database of client project summaries with metrics, not full written case studies — be honest about what you have

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

Follow-ups should suggest related data the user might want next (e.g., "Want similar stats from other clients?", "Need a testimonial to go with that?", "Want to see awards in this category?")`

// ─── Follow-up Prompt Parser ────────────────────────────────

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
      // Failed to parse JSON, extract manually
      const prompts = followUpMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
      const cleanResponse = response
        .replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "")
        .trim()
      return { cleanResponse, prompts }
    }
  }

  // Default follow-ups
  return {
    cleanResponse: response,
    prompts: [
      "Want me to add comparable stats from similar projects?",
      "Should I draft a client testimonial for this?",
      "Want to see similar case studies from our database?",
    ],
  }
}

// ─── Main Query Function ────────────────────────────────────

export async function queryCaseStudyInsights(
  query: string
): Promise<CaseStudyInsightResult> {
  const openai = getOpenAI()

  const emptyResult: CaseStudyInsightResult = {
    response: "",
    dataUsed: {
      totalCaseStudies: 0,
      totalTestimonials: 0,
      totalStats: 0,
      categoriesSearched: [],
    },
    followUpPrompts: [],
    refused: true,
    refusalReason: "",
  }

  if (!openai) {
    return {
      ...emptyResult,
      refusalReason:
        "AI service not configured. Please set OPENAI_API_KEY in your environment.",
    }
  }

  try {
    const context = buildContext()

    // Determine categories referenced
    const categories = new Set<string>()
    clientSuccessData.caseStudies.forEach((cs) => categories.add(cs.category))

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n--- CLIENT SUCCESS DATABASE ---\n${context}`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    })

    const rawResponse = completion.choices[0]?.message?.content || ""
    const { cleanResponse, prompts } = parseFollowUpPrompts(rawResponse)

    return {
      response: cleanResponse,
      dataUsed: {
        totalCaseStudies: clientSuccessData.caseStudies.length,
        totalTestimonials: clientSuccessData.testimonials.length,
        totalStats: clientSuccessData.topLineResults.length,
        categoriesSearched: Array.from(categories),
      },
      followUpPrompts: prompts,
      refused: false,
    }
  } catch (error) {
    console.error("Case study AI query failed:", error)

    return {
      ...emptyResult,
      refusalReason:
        "An error occurred while processing your request. Please try again.",
    }
  }
}
