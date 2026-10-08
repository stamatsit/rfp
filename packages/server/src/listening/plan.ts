/**
 * Planning: turn the topic into the searches real people would type, decide
 * whether it names one institution (quote it, disambiguate it), and suggest
 * broader topics in case the sample comes back thin.
 */
import { z } from "zod"
import { LIMITS } from "./config.js"
import type { LlmClient } from "./llm.js"
import type { Plan, PlannedSearch } from "./types.js"
import { normForMatch } from "./util/text.js"

const PlanSchema = z.object({
  interpretation: z.string().describe("One sentence: what this topic is and who talks about it online."),
  isNamedEntity: z.boolean().describe("True when the topic names one specific institution, organization, product or person."),
  entityName: z.string().nullable().describe("The exact name to quote in searches when isNamedEntity, else null."),
  disambiguation: z.string().describe("What to treat as off-topic: same-name things, acronyms, unrelated senses. Empty string if none."),
  searches: z
    .array(z.object({ q: z.string(), why: z.string() }))
    .describe("Search phrasings in the audience's own words, 2 to 8 words each, no site: operators, no quotes unless a proper name."),
  broaderSuggestions: z.array(z.string()).describe("Three broader or adjacent topics that would have more conversation."),
})

const SYSTEM = `You plan social listening searches for a higher education and healthcare marketing agency's content team.
Students, parents, adult learners, patients and professionals discuss topics on Reddit, forums, YouTube and social media.
Write searches the way those people actually type when asking each other, not the way a marketer would phrase it.
Never add site: operators. Never invent facts about the topic.`

export async function makePlan(llm: LlmClient, query: string, signal?: AbortSignal): Promise<Plan> {
  const out = await llm.structured({
    name: "listening_plan",
    schema: PlanSchema,
    system: SYSTEM,
    user: `Topic: ${query}

Return ${LIMITS.maxSearches - 1} alternative searches that would surface different parts of the conversation about this topic (questions, complaints, comparisons, experiences). Keep the topic's meaning; do not drift to a different subject.`,
    maxTokens: 1200,
    signal,
  })
  return assemblePlan(query, out)
}

export function assemblePlan(query: string, out: z.infer<typeof PlanSchema>): Plan {
  const main = out.isNamedEntity && out.entityName ? `"${out.entityName.replace(/"/g, "")}"` : query.trim()
  const seen = new Set([normForMatch(main.replace(/"/g, ""))])
  const searches: PlannedSearch[] = [{ q: main, why: "Your topic as written" }]
  for (const s of out.searches) {
    const q = s.q.replace(/\bsite:\S+/gi, "").replace(/\s+/g, " ").trim()
    const key = normForMatch(q.replace(/"/g, ""))
    if (!q || q.length > 90 || seen.has(key)) continue
    seen.add(key)
    searches.push({ q, why: s.why.trim().slice(0, 160) })
    if (searches.length >= LIMITS.maxSearches) break
  }
  return {
    interpretation: out.interpretation.trim(),
    isNamedEntity: out.isNamedEntity,
    disambiguation: out.disambiguation.trim(),
    searches,
    broaderSuggestions: out.broaderSuggestions.map((s) => s.trim()).filter(Boolean).slice(0, 3),
  }
}

/** Used when the model is unavailable: search the topic as written. */
export function fallbackPlan(query: string): Plan {
  const words = query.trim().split(/\s+/)
  const looksLikeName = words.length <= 5 && words.filter((w) => /^[A-Z]/.test(w)).length >= Math.max(1, words.length - 1)
  return {
    interpretation: "",
    isNamedEntity: looksLikeName,
    disambiguation: "",
    searches: [{ q: looksLikeName ? `"${query.trim()}"` : query.trim(), why: "Your topic as written" }],
    broaderSuggestions: [],
  }
}

const ExtendSchema = z.object({
  searches: z.array(z.object({ q: z.string(), why: z.string() })),
})

/** Rescans add one fresh phrasing (up to a total of 6) so the sample keeps widening. */
export async function extendPlan(llm: LlmClient, query: string, plan: Plan, runId: string, signal?: AbortSignal): Promise<Plan> {
  if (plan.searches.length >= 6) return plan
  const out = await llm.structured({
    name: "listening_plan_extend",
    schema: ExtendSchema,
    system: SYSTEM,
    user: `Topic: ${query}
${plan.disambiguation ? `Off-topic: ${plan.disambiguation}\n` : ""}Already searched:
${plan.searches.map((s) => `- ${s.q}`).join("\n")}

Return 2 new searches, phrased differently from the ones above, that would find parts of the conversation those searches miss.`,
    maxTokens: 500,
    signal,
  })
  const seen = new Set(plan.searches.map((s) => normForMatch(s.q.replace(/"/g, ""))))
  const added = out.searches
    .map((s) => ({ q: s.q.replace(/\bsite:\S+/gi, "").replace(/\s+/g, " ").trim(), why: s.why.trim().slice(0, 160) }))
    .filter((s) => s.q && s.q.length <= 90 && !seen.has(normForMatch(s.q.replace(/"/g, ""))))
    .slice(0, 1)
    .map((s) => ({ ...s, addedRunId: runId }))
  return { ...plan, searches: [...plan.searches, ...added] }
}
