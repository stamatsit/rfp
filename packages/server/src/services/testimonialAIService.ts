/**
 * Testimonial AI Finder Service
 * Given a description of what the user needs, finds the most relevant testimonials
 * from the database using GPT-4o.
 *
 * Single-shot (not streaming) — returns structured JSON with matches + reasoning.
 */

import OpenAI from "openai"
import { db } from "../db/index.js"
import { clientSuccessTestimonials } from "../db/schema.js"
import { ne } from "drizzle-orm"

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

export interface TestimonialMatch {
  testimonialId: string
  quote: string
  name: string | null
  title: string | null
  organization: string
  sector: string | null
  relevanceReason: string
}

export interface TestimonialFinderResult {
  matches: TestimonialMatch[]
  totalSearched: number
  tokensUsed: number
  error?: string
}

// ─── Main Finder Function ───────────────────────────────────

export async function findTestimonials(
  description: string,
  filters?: { sector?: string; limit?: number }
): Promise<TestimonialFinderResult> {
  const openai = getOpenAI()

  if (!openai) {
    return {
      matches: [],
      totalSearched: 0,
      tokensUsed: 0,
      error: "AI service not configured. Set OPENAI_API_KEY in your environment.",
    }
  }

  if (!db) {
    return {
      matches: [],
      totalSearched: 0,
      tokensUsed: 0,
      error: "Database unavailable.",
    }
  }

  try {
    // Query approved testimonials from DB
    let testimonials
    if (filters?.sector) {
      testimonials = await db
        .select()
        .from(clientSuccessTestimonials)
        .where(ne(clientSuccessTestimonials.status, "hidden"))
    } else {
      testimonials = await db
        .select()
        .from(clientSuccessTestimonials)
        .where(ne(clientSuccessTestimonials.status, "hidden"))
    }

    // Apply sector filter in-memory (simpler than building dynamic query)
    if (filters?.sector) {
      testimonials = testimonials.filter(t => t.sector === filters.sector)
    }

    if (testimonials.length === 0) {
      return { matches: [], totalSearched: 0, tokensUsed: 0 }
    }

    // Build context string
    const contextLines = testimonials.map((t) => {
      const who = [t.name, t.title].filter(Boolean).join(", ")
      const tags = (t.tags as string[] || []).length > 0 ? ` [tags: ${(t.tags as string[]).join(", ")}]` : ""
      return `ID:${t.id} | "${t.quote}" — ${who ? `${who}, ` : ""}${t.organization} [${t.sector || "unknown"}]${tags}`
    })

    const maxResults = filters?.limit || 5

    const systemPrompt = `You are a testimonial matching assistant for Stamats, a marketing agency specializing in higher education and healthcare marketing.

You have access to ${testimonials.length} approved client testimonials. The user will describe what they need a testimonial for, and you must select the ${maxResults} most relevant testimonials.

RULES:
1. Only select testimonials from the provided list — never invent quotes
2. Rank by relevance to the user's description
3. For each match, explain WHY it's relevant in 1-2 sentences
4. Return EXACTLY valid JSON (no markdown, no code fences)
5. If fewer than ${maxResults} are relevant, return fewer

Return format:
{"matches":[{"id":"uuid","reason":"why this testimonial is relevant"}]}

--- TESTIMONIALS ---
${contextLines.join("\n")}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: description },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    })

    const rawResponse = completion.choices[0]?.message?.content || "{}"
    const tokensUsed = completion.usage?.total_tokens || 0

    let parsed: { matches?: Array<{ id: string; reason: string }> }
    try {
      parsed = JSON.parse(rawResponse)
    } catch {
      return {
        matches: [],
        totalSearched: testimonials.length,
        tokensUsed,
        error: "Failed to parse AI response",
      }
    }

    // Map AI results back to full testimonial data
    const testimonialMap = new Map(testimonials.map(t => [t.id, t]))
    const matches: TestimonialMatch[] = []
    for (const m of parsed.matches || []) {
      const t = testimonialMap.get(m.id)
      if (!t) continue
      matches.push({
        testimonialId: t.id,
        quote: t.quote,
        name: t.name,
        title: t.title,
        organization: t.organization,
        sector: t.sector,
        relevanceReason: m.reason,
      })
    }

    return {
      matches,
      totalSearched: testimonials.length,
      tokensUsed,
    }
  } catch (error) {
    console.error("Testimonial AI finder failed:", error)
    return {
      matches: [],
      totalSearched: 0,
      tokensUsed: 0,
      error: "An error occurred while finding testimonials. Please try again.",
    }
  }
}
