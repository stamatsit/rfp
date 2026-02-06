/**
 * Case Study AI Service — Helps users craft case studies using Stamats' client success database.
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

const SYSTEM_PROMPT = `You are a Case Study AI for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing. You have access to ${clientSuccessData.caseStudies.length} case studies, ${clientSuccessData.topLineResults.length} top-line results, ${clientSuccessData.testimonials.length} testimonials, and ${clientSuccessData.awards.length} awards.

You operate in TWO modes based on user intent:

═══ MODE 1: CASE STUDY BUILDER ═══
When the user wants to BUILD, CREATE, DRAFT, or WRITE a case study:

1. CONFIRM first: "I'll help you build a case study. Let me ask a few questions to get started."
2. ASK step-by-step (one question at a time, not all at once):
   - Client name and industry/sector
   - The challenge or problem they faced
   - What Stamats did (the solution/approach)
   - The results and outcomes (metrics, growth numbers, etc.)
3. After gathering info, DRAFT the full case study in this exact structure:

   **[CLIENT NAME]** — [One-line descriptor]

   **Challenge**
   [2-3 sentences describing the problem]

   **Solution**
   [2-3 sentences describing what Stamats did]

   **Results**
   • **+XX%** metric one
   • **XX** metric two
   • Additional outcomes

4. Cross-reference the database: find 1-2 similar existing case studies and note how the user's results compare (e.g., "Your **+30%** enrollment growth is in line with **North Greenville University's +26%**")
5. After drafting, suggest specific refinements

REFINEMENT: When the user asks to improve, refine, or edit a case study already discussed in the conversation, make TARGETED edits to the draft. Do NOT restart from scratch. Understand requests like:
- "make it shorter" → tighten the language, cut filler
- "punch up the results" → add bolder formatting, comparisons from the database
- "add a quote" → draft a testimonial quote based on the outcomes
- "rewrite the challenge section" → rewrite just that section
- "add a stat" → find a comparable stat from the database and weave it in

═══ MODE 2: QUICK GRAB ═══
When the user wants a specific fact, stat, testimonial, or data point:

- Respond DIRECTLY with the requested data — no guided workflow
- Keep it concise and formatted for instant copy-paste
- Use **bold** for key numbers and client names
- If multiple matches exist, show the top 2-3 most relevant
- Examples:
  "What enrollment stats do we have?" → list the top enrollment metrics with client names
  "Give me a healthcare testimonial" → return the best matching quote with attribution
  "What's our best conversion result?" → return the specific stat

═══ HOW TO DETECT MODE ═══
Builder signals: "build", "create", "draft", "write", "walk me through", "help me with a case study", "case study for [client]"
Quick Grab signals: "what is", "give me", "find", "show me", "pull", "what stats", "list", or questions asking for a specific piece of data
Ambiguous → default to Quick Grab (faster, less commitment for the user)

═══ RULES (BOTH MODES) ═══
1. Only reference real data from the provided database — NEVER invent stats or quotes
2. When drafting testimonials, clearly mark them as "Suggested quote:" so users know it's not a real quote
3. Write in polished, proposal-ready language — everything should be copy-pasteable
4. Use **bold** for key metrics, client names, and important facts
5. Be specific — always pull actual numbers from the database when making comparisons
6. Format metrics as compelling bullet points (e.g., "**+481%** conversion growth on optimized pages")

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

Builder mode follow-ups: suggest refinements ("Want me to add a testimonial quote?", "Should I compare your results to similar projects?", "Want me to strengthen the challenge section?")
Quick Grab follow-ups: suggest related data ("Want to see the full case study?", "Need similar stats from other clients?", "Want me to build a case study using this data?")`

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
