/**
 * Pitch Deck AI Service — Generates structured pitch deck JSON from user prompts.
 *
 * Pattern follows caseStudyAIService.ts: server-side data, rich context, system prompt.
 * GPT-4o generates a human-readable outline + structured DECK_DATA JSON block.
 */

import OpenAI from "openai"
import type { Response } from "express"
import { v4 as uuid } from "uuid"
import { clientSuccessData } from "../data/clientSuccessData.js"
import { streamCompletion, truncateHistory } from "./utils/streamHelper.js"
import type { PitchDeckOutput } from "./pitchDeckRenderer.js"

// ─── Lazy-initialized OpenAI client ─────────────────────────

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// ─── Deck Buffer Store (in-memory, 30-min TTL) ──────────────

interface StoredDeck {
  buffer: Buffer
  title: string
  deckData: PitchDeckOutput
  expiresAt: number
}

const deckStore = new Map<string, StoredDeck>()
const DECK_TTL = 30 * 60 * 1000 // 30 minutes

function cleanupExpired() {
  const now = Date.now()
  for (const [id, deck] of deckStore) {
    if (now > deck.expiresAt) deckStore.delete(id)
  }
}

export function storeDeck(buffer: Buffer, title: string, deckData: PitchDeckOutput): string {
  cleanupExpired()
  const id = uuid()
  deckStore.set(id, { buffer, title, deckData, expiresAt: Date.now() + DECK_TTL })
  return id
}

export function getDeck(id: string): StoredDeck | undefined {
  cleanupExpired()
  return deckStore.get(id)
}

// ─── Context Builder ─────────────────────────────────────────

let cachedContext: string | null = null
let contextExpiry = 0
const CONTEXT_TTL = 5 * 60 * 1000

async function buildContext(): Promise<string> {
  const now = Date.now()
  if (cachedContext && now < contextExpiry) return cachedContext

  const sections: string[] = []

  // Key stats for pitch decks
  const resultLines = clientSuccessData.topLineResults
    .sort((a, b) => b.numericValue - a.numericValue)
    .slice(0, 20)
    .map(r => `${r.result} ${r.metric} — ${r.client}`)
  sections.push(`=== TOP CLIENT RESULTS (${resultLines.length}) ===\n${resultLines.join("\n")}`)

  // Testimonials
  const testimonialLines = clientSuccessData.testimonials.map(
    t => `"${t.quote}" — ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`
  )
  sections.push(`=== TESTIMONIALS (${testimonialLines.length}) ===\n${testimonialLines.join("\n\n")}`)

  // Awards
  const awardLines = clientSuccessData.awards.map(
    a => `${a.name} (${a.year}) — ${a.clientOrProject}`
  )
  sections.push(`=== AWARDS (${awardLines.length}) ===\n${awardLines.join("\n")}`)

  // Company stats
  const statLines = [
    ...clientSuccessData.companyStats.map(s => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""}`),
    ...clientSuccessData.externallyVerifiedStats.map(s => `${s.label}: ${s.value} (Source: ${s.source})`),
  ]
  sections.push(`=== COMPANY STATS ===\n${statLines.join("\n")}`)

  // Service lines
  sections.push(`=== SERVICE LINES ===\n${clientSuccessData.serviceLines.join(", ")}`)

  cachedContext = sections.join("\n\n")
  contextExpiry = now + CONTEXT_TTL
  return cachedContext
}

// ─── System Prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Pitch Deck Designer for Stamats, a marketing agency with 100+ years of experience specializing in higher education and healthcare marketing.

Your job: Help users create compelling, branded pitch decks. You have access to Stamats' client success data (results, testimonials, awards, stats) to pull real proof points into slides.

═══ HOW TO RESPOND ═══

1. First, write a brief human-readable OUTLINE of the deck (3-5 sentences describing the narrative arc and key slides). This is what the user sees in chat.
2. Then append the full structured deck as a DECK_DATA JSON block (see format below).
3. For REFINEMENT requests (e.g., "change slide 3", "add a competitive slide"), re-output the COMPLETE DECK_DATA with changes applied — not just the changed slide.

═══ DECK_DATA FORMAT ═══

After your outline text, append on a new line:

DECK_DATA: {"deckTitle":"Deck Title","slides":[...]}

Each slide in the array is an object with a "type" and type-specific fields:

SLIDE TYPES:
- "title": { type, title, subtitle?, speakerNotes? }
- "content": { type, title, bullets: string[], speakerNotes? }
- "two-column": { type, title, leftColumn: { title, bullets }, rightColumn: { title, bullets }, speakerNotes? }
- "image-text": { type, title, bullets: string[], speakerNotes? } — left side is a placeholder image area
- "chart": { type, title, chartData: { type: "bar"|"line"|"pie"|"area", labels: string[], values: number[], seriesName? }, speakerNotes? }
- "comparison": { type, title, comparisonRows: [{ feature, us, them }], speakerNotes? }
- "quote": { type, title, quote: { text, attribution }, speakerNotes? }
- "section-divider": { type, title, subtitle?, speakerNotes? }
- "closing": { type, title, subtitle?, bullets?: string[], speakerNotes? }

═══ DECK TEMPLATES ═══

When the user's request matches one of these common deck types, use the template as your starting structure. You may add, remove, or modify slides based on their specific needs.

TEMPLATE: "Enrollment Marketing Pitch" (10-12 slides)
1. title — Bold opening: "Your Partner in Enrollment Growth"
2. content — The enrollment challenge (market context, declining demographics)
3. content — Why Stamats (100+ years, higher ed focus, data-driven)
4. two-column — Our approach vs. traditional agencies
5. chart — Client enrollment results (pull real numbers from database)
6. quote — Client testimonial (higher ed enrollment success)
7. content — Service offerings (SEO, digital, brand, web)
8. comparison — Stamats vs. competitors (features/capabilities table)
9. image-text — Case study highlight with key metrics
10. content — Proposed engagement timeline
11. closing — CTA with next steps and contact info

TEMPLATE: "Healthcare Marketing Pitch" (10-12 slides)
1. title — "Marketing That Moves the Needle in Healthcare"
2. content — Healthcare marketing landscape & challenges
3. content — Stamats healthcare expertise & team
4. two-column — Digital strategy vs. traditional approach
5. chart — Healthcare client results (patient volume, leads, etc.)
6. quote — Healthcare client testimonial
7. comparison — Stamats vs. competitors for healthcare
8. content — Recommended services & strategy
9. content — Implementation roadmap
10. closing — Partnership next steps

TEMPLATE: "Brand Refresh Proposal" (8-10 slides)
1. title — "A Bold New Chapter for [University Name]"
2. content — Why now? (market position, competitive pressure)
3. two-column — Current brand perception vs. aspiration
4. content — Our brand refresh process (discovery, strategy, design, launch)
5. image-text — Portfolio examples (before/after from our work)
6. chart — Brand refresh impact metrics from past clients
7. quote — Client testimonial on brand transformation
8. content — Timeline & investment overview
9. closing — Let's build something remarkable

TEMPLATE: "General Capabilities Pitch" (12-15 slides)
1. title — "Stamats: Data-Driven Marketing for Higher Education"
2. content — Who we are (100+ years, 500+ institutions served)
3. section-divider — "Our Expertise"
4. two-column — Higher ed specialization + healthcare capabilities
5. content — Full service offerings
6. section-divider — "Proven Results"
7. chart — Top-line client results
8. quote — Marquee client testimonial
9. comparison — Why Stamats vs. generalist agencies
10. content — Awards & recognition
11. section-divider — "Working Together"
12. content — Engagement models & process
13. content — Team & leadership
14. closing — Ready to grow? Contact us.

═══ DESIGN PRINCIPLES ═══

1. Start with a strong title slide, end with a closing CTA
2. Use section dividers to break long decks into logical sections
3. Mix slide types for visual variety — don't make 10 content slides in a row
4. Keep bullet points concise (5-7 words each, max 6 per slide)
5. Include speaker notes with talking points on every slide
6. Pull REAL stats, testimonials, and awards from the database when relevant — never invent data
7. A typical pitch deck is 8-15 slides
8. When a user's request maps to a template above, follow it — but customize with specifics from the database

═══ RULES ═══
1. Only reference real data from the provided database — NEVER fabricate stats or quotes
2. The DECK_DATA JSON must be valid JSON — double-check your output
3. Always include speakerNotes on every slide
4. Keep the outline brief — the deck itself is the deliverable

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

Follow-ups should suggest refinements (e.g., "Want to add a competitive comparison slide?", "Should I include more ROI data?", "Want to change the opening to be more bold?").`

// ─── Follow-up Prompt Parser ─────────────────────────────────

function parseFollowUpPrompts(response: string): {
  cleanResponse: string
  prompts: string[]
} {
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
      "Want to add more data-driven slides?",
      "Should I include a testimonial slide?",
      "Want to refine the narrative arc?",
    ],
  }
}

// ─── Deck Data Parser ────────────────────────────────────────

export function parseDeckData(response: string): {
  cleanText: string
  deckData: PitchDeckOutput | null
} {
  // Match DECK_DATA: {...} — greedy since it's the last structured block
  const match = response.match(/DECK_DATA:\s*(\{[\s\S]*\})\s*$/m)
  if (match?.[1]) {
    try {
      const data = JSON.parse(match[1]) as PitchDeckOutput
      if (data.deckTitle && Array.isArray(data.slides) && data.slides.length > 0) {
        const cleanText = response.replace(/DECK_DATA:\s*\{[\s\S]*\}\s*$/m, "").trim()
        return { cleanText, deckData: data }
      }
    } catch {
      // Malformed JSON — ignore
    }
  }
  return { cleanText: response, deckData: null }
}

// ─── Response Length Tokens ──────────────────────────────────

const RESPONSE_LENGTH_TOKENS: Record<string, number> = {
  concise: 3000,
  balanced: 5000,
  detailed: 8000,
}

// ─── Stream Function ─────────────────────────────────────────

export async function streamPitchDeckDesign(
  query: string,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  responseLength?: string
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  const context = await buildContext()

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n--- STAMATS CLIENT SUCCESS DATA ---\n${context}` },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.5,
    maxTokens: RESPONSE_LENGTH_TOKENS[responseLength ?? ""] ?? 5000,
    metadata: {
      dataUsed: {
        totalResults: clientSuccessData.topLineResults.length,
        totalTestimonials: clientSuccessData.testimonials.length,
        totalAwards: clientSuccessData.awards.length,
      },
    },
    parseFollowUpPrompts,
    res,
  })
}
