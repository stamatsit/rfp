/**
 * Pass 2: write the summary, subtopic notes, ranked questions and content
 * ideas from labeled evidence. The model sees computed figures and real
 * excerpts under aliases; every idea must cite at least two of them, and
 * code drops any idea whose evidence does not check out.
 *
 * Pass 3 (verifyIdeas) rereads each idea next to its cited posts and keeps
 * only the posts that genuinely support it. Citing two relevant posts is not
 * enough on its own: an idea about campus life once cited a theme
 * park thread and a band reunion.
 *
 * writeMoreIdeas adds ideas later from the posts already collected, steering
 * away from the ones already written. Both take the team's taste (ideas they
 * liked or passed on) as guidance only: it shapes which ideas get written and
 * never counts as evidence.
 */
import { z } from "zod"
import { LIMITS } from "./config.js"
import type { LlmClient } from "./llm.js"
import { engagementOf, ideaCap, isPublicConversation, stripModelNumbers } from "./metrics.js"
import type { Audience, ContentIdea, IdeaTaste, Item, Plan, QuestionEntry, SentimentBreakdown } from "./types.js"
import { clip } from "./util/text.js"

const FORMATS = ["article", "FAQ page", "guide", "video", "social series", "email", "landing page section", "infographic", "podcast episode"] as const
const AUDIENCES = ["student", "parent", "patient", "professional", "general"] as const

const IdeaSchema = z.object({
  headline: z.string().describe("A working headline a writer could publish, in plain language, sentence case (capitalise only the first word and proper nouns)"),
  angle: z.string().describe("One sentence: the take and why it will land with this audience"),
  audience: z.enum(AUDIENCES),
  format: z.enum(FORMATS),
  subtopicId: z.string().describe("The subtopic id this idea comes from"),
  whyNow: z.string().describe("One sentence grounded in the evidence. No numbers."),
  outline: z.array(z.string()).describe("3 to 5 short section points"),
  evidence: z.array(z.string()).describe("2 to 6 evidence ids (e#) that support this idea"),
})

const SynthSchema = z.object({
  summary: z.string().describe("2 or 3 plain sentences: what the conversation is about and how it feels. No numbers or percentages."),
  ownVoiceNote: z
    .string()
    .describe("1 or 2 sentences: what the institution's own posts emphasize compared with what people raise. Empty string when no own posts are given. No numbers."),
  subtopics: z.array(z.object({ id: z.string(), summary: z.string().describe("1 or 2 sentences on what people say about this subtopic. No numbers.") })),
  questionOrder: z.array(z.string()).describe("Question ids, most worth answering first"),
  ideas: z.array(IdeaSchema),
})

const MoreIdeasSchema = z.object({ ideas: z.array(IdeaSchema) })

const SYSTEM = `You are a senior content strategist at a higher education and healthcare marketing agency. You turn real online conversation into content ideas a writer can act on.
Ground everything in the evidence given. Do not invent facts, statistics, institutions or quotes. Do not state numbers or percentages; the page shows measured figures separately.
Every idea must be about the topic itself and answer something people actually raised about it. Never build an idea from a post or question about something else.
Write plainly. No hype words. Never use em dashes or en dashes.`

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
  ownVoiceNote: string
  subtopicSummaries: Map<string, string>
  questionOrder: string[]
  ideas: ContentIdea[]
  dropped: number
}

function pct(n: number, d: number): number {
  return d ? Math.round((100 * n) / d) : 0
}

/** Each subtopic with its strongest posts under aliases (e1, e2, ...) the model cites. */
function evidenceBlocks(subtopics: SubtopicInput[], perSubtopic: number): { blocks: string[]; evidence: Map<string, Item> } {
  const evidence = new Map<string, Item>()
  const aliasOf = new Map<string, string>()
  const alias = (it: Item) => {
    const existing = aliasOf.get(it.id)
    if (existing) return existing
    const a = `e${evidence.size + 1}`
    aliasOf.set(it.id, a)
    evidence.set(a, it)
    return a
  }
  const blocks = subtopics.map((s) => {
    const reps = [...s.items]
      .sort((a, b) => (b.depth === "full" ? 1 : 0) - (a.depth === "full" ? 1 : 0) || engagementOf(b) - engagementOf(a))
      .slice(0, perSubtopic)
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
  return { blocks, evidence }
}

/** Keeps the ideas whose cited posts are real posts by people, at least minIdeaEvidence of them. */
function acceptIdeas(raw: Array<z.infer<typeof IdeaSchema>>, evidence: Map<string, Item>, subIds: Set<string>, max: number): { ideas: ContentIdea[]; dropped: number } {
  const ideas: ContentIdea[] = []
  let dropped = 0
  for (const idea of raw) {
    const ids = [...new Set(idea.evidence.map((e) => e.trim()))]
      .map((a) => evidence.get(a))
      .filter((it): it is Item => !!it && isPublicConversation(it))
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
    if (ideas.length >= max) break
  }
  return { ideas, dropped }
}

/** Ideas the team liked or passed on, as guidance for which ideas to write. Empty when there is none. */
function tasteBlock(taste: IdeaTaste | null | undefined): string {
  if (!taste || (!taste.liked.length && !taste.passed.length)) return ""
  const list = (title: string, lines: string[]) => (lines.length ? `\n${title}:\n${lines.map((l) => `- ${l}`).join("\n")}` : "")
  return `\n\nWhat this team has liked and passed on before. This is taste, not evidence: never cite it, and never let it outweigh what the posts support.${list("Liked", taste.liked)}${list("Passed on", taste.passed)}
Lean toward the kinds of ideas they liked and away from the kinds they passed on. Never repeat an idea they passed on.`
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
    /** The named institution's own posts, for ownVoiceNote only; never evidence. */
    ownVoice?: { name: string; items: Item[] } | null
    /** Ideas the team liked or passed on before: guidance only, never evidence. */
    taste?: IdeaTaste | null
  },
  signal?: AbortSignal,
): Promise<SynthResult> {
  const { blocks: subBlocks, evidence } = evidenceBlocks(input.subtopics, 7)

  const qAlias = new Map<string, QuestionEntry>()
  const qLines = input.questions.slice(0, 30).map((q, i) => {
    const a = `q${i + 1}`
    qAlias.set(a, q)
    return `[${a}] (${q.platform}, ${q.audience}) ${q.text}`
  })

  const o = input.overall
  const oTot = o.positive + o.neutral + o.negative + o.mixed
  const maxIdeas = ideaCap(input.relevantCount)

  const own = input.ownVoice?.items.length ? input.ownVoice : null
  const ownBlock = own
    ? `\n\nPosts from ${own.name}'s own accounts (context for ownVoiceNote only; not evidence, never cite them):\n${own.items
        .slice(0, 10)
        .map((it, i) => `  [o${i + 1}] (${it.platform}) ${clip(it.title ? `${it.title}: ${it.text}` : it.text, 220)}`)
        .join("\n")}`
    : ""

  const out = await llm.structured({
    name: "listening_synthesis",
    schema: SynthSchema,
    system: SYSTEM,
    user: `Topic: ${input.query}
${input.plan?.interpretation ? `About: ${input.plan.interpretation}\n` : ""}Posts by people about the topic: ${input.relevantCount}. Overall: ${pct(o.positive, oTot)}% positive, ${pct(o.negative, oTot)}% negative.

Subtopics with evidence:
${subBlocks.join("\n\n")}

Questions people ask:
${qLines.join("\n") || "(none found)"}${ownBlock}${tasteBlock(input.taste)}

Return:
- summary of the conversation,
- ownVoiceNote${own ? "" : " (empty string: no own posts given)"},
- a summary for every subtopic id above,
- questionOrder: the question ids most worth answering, best first (up to ${LIMITS.maxQuestions}),
- up to ${maxIdeas} content ideas, each tied to one subtopic and citing 2 to 6 evidence ids that genuinely support it. Fewer strong ideas beat many thin ones: skip any idea the evidence does not clearly support. Prefer ideas that answer a real question or correct a real misconception. Spread ideas across subtopics.`,
    maxTokens: 6000,
    signal,
  })

  const subIds = new Set(input.subtopics.map((s) => s.id))
  const { ideas, dropped } = acceptIdeas(out.ideas, evidence, subIds, maxIdeas)

  const subtopicSummaries = new Map<string, string>()
  for (const s of out.subtopics) if (subIds.has(s.id)) subtopicSummaries.set(s.id, clip(stripModelNumbers(s.summary), 400))

  const questionOrder = out.questionOrder
    .map((a) => qAlias.get(a.trim())?.itemId)
    .filter((x): x is string => !!x)

  return {
    summary: clip(stripModelNumbers(out.summary), 700),
    ownVoiceNote: own ? clip(stripModelNumbers(out.ownVoiceNote), 400) : "",
    subtopicSummaries,
    questionOrder,
    ideas,
    dropped,
  }
}

const headlineKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/**
 * More ideas from the posts already collected, each a different angle from
 * the ones the topic has. Returns candidates only: the caller still runs
 * verifyIdeas, exactly as a scan does. Ids restart at idea1; the caller
 * renumbers them after the topic's own.
 */
export async function writeMoreIdeas(
  llm: LlmClient,
  input: { query: string; plan: Plan | null; subtopics: SubtopicInput[]; existing: ContentIdea[]; taste?: IdeaTaste | null; max: number },
  signal?: AbortSignal,
): Promise<{ ideas: ContentIdea[]; dropped: number }> {
  // More posts per subtopic than a scan shows the model, so new angles have something new to stand on.
  const { blocks, evidence } = evidenceBlocks(input.subtopics, 12)
  const out = await llm.structured({
    name: "listening_more_ideas",
    schema: MoreIdeasSchema,
    system: SYSTEM,
    user: `Topic: ${input.query}
${input.plan?.interpretation ? `About: ${input.plan.interpretation}\n` : ""}
Subtopics with evidence:
${blocks.join("\n\n")}

Ideas already written for this topic. Do not repeat or lightly reword any of them:
${input.existing.map((i) => `- ${i.headline}: ${i.angle}`).join("\n") || "(none yet)"}${tasteBlock(input.taste)}

Return up to ${input.max} more content ideas, each tied to one subtopic and citing 2 to 6 evidence ids that genuinely support it. Each must take a clearly different angle from every idea listed above. Prefer ideas that answer a real question or correct a real misconception. If the evidence does not clearly support another idea, return fewer, or none.`,
    maxTokens: 3500,
    signal,
  })
  const taken = new Set(input.existing.map((i) => headlineKey(i.headline)))
  const novel = out.ideas.filter((i) => {
    const k = headlineKey(i.headline)
    if (!k || taken.has(k)) return false
    taken.add(k)
    return true
  })
  const accepted = acceptIdeas(novel, evidence, new Set(input.subtopics.map((s) => s.id)), input.max)
  return { ideas: accepted.ideas, dropped: accepted.dropped + (out.ideas.length - novel.length) }
}

const VerifySchema = z.object({
  ideas: z.array(
    z.object({
      id: z.string(),
      supporting: z.array(z.string()).describe("Evidence ids (e#) listed under this idea that genuinely support it"),
    }),
  ),
})

/**
 * Keep only the evidence that genuinely supports each idea, and only ideas
 * left with at least minIdeaEvidence posts. Throws if the model fails; the
 * caller decides what to keep then.
 */
export async function verifyIdeas(
  llm: LlmClient,
  query: string,
  ideas: ContentIdea[],
  items: Map<string, Item>,
  signal?: AbortSignal,
): Promise<{ ideas: ContentIdea[]; dropped: number }> {
  if (!ideas.length) return { ideas, dropped: 0 }
  const aliasToId = new Map<string, string>()
  const blocks = ideas.map((idea, i) => {
    const lines = idea.evidenceItemIds.map((id, j) => {
      const a = `e${i + 1}_${j + 1}`
      aliasToId.set(a, id)
      const it = items.get(id)
      const body = it ? clip(it.title && it.kind !== "comment" ? `${it.title}: ${it.text}` : it.text, 360) : "(missing)"
      return `  [${a}] ${body}`
    })
    return `[i${i + 1}] ${idea.headline}\n  Angle: ${idea.angle}\n${lines.join("\n")}`
  })
  const out = await llm.structured({
    name: "listening_idea_check",
    schema: VerifySchema,
    system: `You check content ideas against the posts cited for them, for a content team researching "${query}".
A post supports an idea only when it is about ${query} and raises the question, need, worry or experience the idea answers.
A post that mentions the topic in passing, is about something else, or only shares a word with the idea does not support it. Be strict.`,
    user: `${blocks.join("\n\n")}\n\nFor every idea id, list the evidence ids that genuinely support it (possibly none).`,
    maxTokens: 1500,
    signal,
  })
  const supported = new Map<string, Set<string>>()
  for (const row of out.ideas) {
    const ids = row.supporting.map((a) => aliasToId.get(a.trim())).filter((x): x is string => !!x)
    supported.set(row.id.trim(), new Set(ids))
  }
  const kept: ContentIdea[] = []
  ideas.forEach((idea, i) => {
    const ok = supported.get(`i${i + 1}`) ?? new Set<string>()
    const evidenceItemIds = idea.evidenceItemIds.filter((id) => ok.has(id))
    if (evidenceItemIds.length >= LIMITS.minIdeaEvidence) kept.push({ ...idea, id: `idea${kept.length + 1}`, evidenceItemIds })
  })
  return { ideas: kept, dropped: ideas.length - kept.length }
}
