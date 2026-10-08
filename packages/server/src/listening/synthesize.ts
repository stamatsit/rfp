/**
 * Pass 2: write the summary, subtopic notes, ranked questions and content
 * ideas from labeled evidence. The model sees computed figures and real
 * excerpts under aliases; every idea must cite at least two of them, and
 * code drops any idea whose evidence does not check out.
 */
import { z } from "zod"
import { LIMITS } from "./config.js"
import type { LlmClient } from "./llm.js"
import { engagementOf, ideaCap, stripModelNumbers } from "./metrics.js"
import type { Audience, ContentIdea, Item, Plan, QuestionEntry, SentimentBreakdown } from "./types.js"
import { clip } from "./util/text.js"

const FORMATS = ["article", "FAQ page", "guide", "video", "social series", "email", "landing page section", "infographic", "podcast episode"] as const
const AUDIENCES = ["student", "parent", "patient", "professional", "general"] as const

const SynthSchema = z.object({
  summary: z.string().describe("2 or 3 plain sentences: what the conversation is about and how it feels. No numbers or percentages."),
  subtopics: z.array(z.object({ id: z.string(), summary: z.string().describe("1 or 2 sentences on what people say about this subtopic. No numbers.") })),
  questionOrder: z.array(z.string()).describe("Question ids, most worth answering first"),
  ideas: z.array(
    z.object({
      headline: z.string().describe("A working headline a writer could publish, in plain language, sentence case (capitalise only the first word and proper nouns)"),
      angle: z.string().describe("One sentence: the take and why it will land with this audience"),
      audience: z.enum(AUDIENCES),
      format: z.enum(FORMATS),
      subtopicId: z.string().describe("The subtopic id this idea comes from"),
      whyNow: z.string().describe("One sentence grounded in the evidence. No numbers."),
      outline: z.array(z.string()).describe("3 to 5 short section points"),
      evidence: z.array(z.string()).describe("2 to 6 evidence ids (e#) that support this idea"),
    }),
  ),
})

export interface SubtopicInput {
  id: string
  name: string
  description: string
  count: number
  share: number
  sentiment: SentimentBreakdown
  items: Item[]
}

export interface SynthResult {
  summary: string
  subtopicSummaries: Map<string, string>
  questionOrder: string[]
  ideas: ContentIdea[]
  dropped: number
}

function pct(n: number, d: number): number {
  return d ? Math.round((100 * n) / d) : 0
}

export async function synthesize(
  llm: LlmClient,
  input: {
    query: string
    plan: Plan | null
    subtopics: SubtopicInput[]
    questions: QuestionEntry[]
    overall: SentimentBreakdown
    relevantCount: number
  },
  signal?: AbortSignal,
): Promise<SynthResult> {
  const evidence = new Map<string, Item>()
  const aliasOf = new Map<string, string>()
  let n = 0
  const alias = (it: Item) => {
    const existing = aliasOf.get(it.id)
    if (existing) return existing
    const a = `e${++n}`
    aliasOf.set(it.id, a)
    evidence.set(a, it)
    return a
  }

  const subBlocks = input.subtopics.map((s) => {
    const reps = [...s.items]
      .sort((a, b) => (b.depth === "full" ? 1 : 0) - (a.depth === "full" ? 1 : 0) || engagementOf(b) - engagementOf(a))
      .slice(0, 7)
    const lines = reps.map((it) => {
      const body = it.labels?.quote ?? clip(it.title ? `${it.title}: ${it.text}` : it.text, 260)
      return `  [${alias(it)}] (${it.platform}, ${it.labels?.audience ?? "general"}, ${it.labels?.sentiment ?? "neutral"}) ${body}`
    })
    const sent = s.sentiment
    const tot = sent.positive + sent.neutral + sent.negative + sent.mixed
    return `[${s.id}] ${s.name}: ${s.count} posts, ${s.share}% of the conversation, ${pct(sent.positive, tot)}% positive / ${pct(sent.negative, tot)}% negative
  ${s.description}
${lines.join("\n")}`
  })

  const qAlias = new Map<string, QuestionEntry>()
  const qLines = input.questions.slice(0, 30).map((q, i) => {
    const a = `q${i + 1}`
    qAlias.set(a, q)
    return `[${a}] (${q.platform}, ${q.audience}) ${q.text}`
  })

  const o = input.overall
  const oTot = o.positive + o.neutral + o.negative + o.mixed
  const maxIdeas = ideaCap(input.relevantCount)

  const out = await llm.structured({
    name: "listening_synthesis",
    schema: SynthSchema,
    system: `You are a senior content strategist at a higher education and healthcare marketing agency. You turn real online conversation into content ideas a writer can act on.
Ground everything in the evidence given. Do not invent facts, statistics, institutions or quotes. Do not state numbers or percentages; the page shows measured figures separately.
Write plainly. No hype words. Never use em dashes or en dashes.`,
    user: `Topic: ${input.query}
${input.plan?.interpretation ? `About: ${input.plan.interpretation}\n` : ""}Relevant posts analysed: ${input.relevantCount}. Overall conversation: ${pct(o.positive, oTot)}% positive, ${pct(o.negative, oTot)}% negative.

Subtopics with evidence:
${subBlocks.join("\n\n")}

Questions people ask:
${qLines.join("\n") || "(none found)"}

Return:
- summary of the conversation,
- a summary for every subtopic id above,
- questionOrder: the question ids most worth answering, best first (up to ${LIMITS.maxQuestions}),
- up to ${maxIdeas} content ideas, each tied to one subtopic and citing 2 to 6 evidence ids that genuinely support it. Fewer strong ideas beat many thin ones: skip any idea the evidence does not clearly support. Prefer ideas that answer a real question or correct a real misconception. Spread ideas across subtopics.`,
    maxTokens: 6000,
    signal,
  })

  const subIds = new Set(input.subtopics.map((s) => s.id))
  const ideas: ContentIdea[] = []
  let dropped = 0
  for (const idea of out.ideas) {
    const ids = [...new Set(idea.evidence.map((e) => e.trim()))]
      .map((a) => evidence.get(a))
      .filter((it): it is Item => !!it && !!it.labels?.relevant)
      .map((it) => it.id)
    if (ids.length < LIMITS.minIdeaEvidence) {
      dropped++
      continue
    }
    ideas.push({
      id: `idea${ideas.length + 1}`,
      headline: clip(idea.headline, 160),
      angle: clip(idea.angle, 320),
      audience: idea.audience as Audience,
      format: idea.format,
      subtopicId: subIds.has(idea.subtopicId) ? idea.subtopicId : null,
      whyNow: clip(stripModelNumbers(idea.whyNow), 320),
      outline: idea.outline.map((o) => clip(o, 160)).filter(Boolean).slice(0, 6),
      evidenceItemIds: ids,
    })
    if (ideas.length >= maxIdeas) break
  }

  const subtopicSummaries = new Map<string, string>()
  for (const s of out.subtopics) if (subIds.has(s.id)) subtopicSummaries.set(s.id, clip(stripModelNumbers(s.summary), 400))

  const questionOrder = out.questionOrder
    .map((a) => qAlias.get(a.trim())?.itemId)
    .filter((x): x is string => !!x)

  return { summary: clip(stripModelNumbers(out.summary), 700), subtopicSummaries, questionOrder, ideas, dropped }
}
