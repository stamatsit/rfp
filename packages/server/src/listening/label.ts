/**
 * Pass 1: label each item. The model reads items in batches under short
 * aliases (a1, a2 ...) and returns labels; code then verifies every question
 * and quote is verbatim in the fetched text before keeping it.
 *
 * Two labels decide what counts as public conversation: `about` (the topic is
 * the subject, not a passing mention) and `speaker` (a person, the named
 * institution itself, another organization, or a news outlet). The author and
 * the link go into the prompt because the account name is usually what gives
 * an institution's own post away (an athletics or alumni page).
 */
import { z } from "zod"
import { LIMITS } from "./config.js"
import type { LlmClient } from "./llm.js"
import { entityOf } from "./plan.js"
import { LABEL_VERSION, type Audience, type Item, type ItemLabels, type Plan, type Sentiment, type Speaker } from "./types.js"
import { mapLimit } from "./util/http.js"
import { clip, isRealQuestion, isVerbatim, originalSpan, questionSentences, queryTokens, normForMatch } from "./util/text.js"

const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const
const AUDIENCES = ["student", "parent", "patient", "professional", "general"] as const
const SPEAKERS = ["person", "self", "organization", "media"] as const

const LabelSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      relevant: z.boolean(),
      about: z.boolean().describe("True when the topic is the main subject of what this author wrote; false for a passing mention"),
      speaker: z.enum(SPEAKERS),
      sentiment: z.enum(SENTIMENTS),
      subtopic: z.string().describe("2 to 5 lowercase words naming the specific aspect discussed, e.g. 'clinical placement', 'cost and financial aid'"),
      audience: z.enum(AUDIENCES),
      question: z.string().describe("A question the author asks about the topic, copied word for word from the text, or empty string"),
      quote: z.string().describe("One or two sentences about the topic copied word for word that show how the author feels (max 240 characters), or empty string"),
    }),
  ),
})

function systemPrompt(query: string, plan: Plan | null): string {
  const entity = entityOf(plan)
  const self = entity
    ? `"self" = ${entity} itself or any of its own official accounts and offices (athletics, alumni association, admissions, departments, its official staff posts)`
    : `"self" = never used for this topic`
  return `You label online posts and comments for a content strategist researching: "${query}".
${plan?.interpretation ? `Topic: ${plan.interpretation}\n` : ""}${plan?.disambiguation ? `Off-topic: ${plan.disambiguation}\n` : ""}
For each item:
- relevant: true only if the item actually discusses or refers to this topic. Same-name or same-acronym things, spam, ads and unrelated threads are false.
- about: true only if the topic is the main subject of what this author wrote. False when it is mentioned in passing: a bio or credential line ("studied at ..."), one name in a list of many, a location or landmark, an aside in a post about something else.
- speaker: who wrote it. "person" = an individual speaking for themselves (student, parent, alum, patient, professional). ${self}. "organization" = any other school, company, agency or brand account. "media" = a news outlet, TV or radio station, journalist or publisher. Use the author and link to decide.
- sentiment: how the author feels about the topic itself, not about other things in the post. Neutral if they express no view of the topic.
- subtopic: the specific aspect of the topic discussed, 2 to 5 lowercase words. Reuse the same wording for the same aspect across items.
- audience: who is talking (student, parent, patient, professional, general).
- question: a question the author asks about this topic, copied exactly as written. Empty if they ask nothing, or only ask about something else.
- quote: one or two sentences about this topic, copied exactly as written, that best show the author's view. Otherwise empty.
Never paraphrase question or quote. Copy characters exactly. Return one entry for every id you are given.`
}

/** Host and path, without the query: enough to show which account posted. */
function shortLink(url: string): string {
  try {
    const u = new URL(url)
    return clip(`${u.hostname.replace(/^www\./, "")}${u.pathname}`, 90)
  } catch {
    return clip(url, 90)
  }
}

function render(alias: string, it: Item): string {
  const date = it.publishedAt ? it.publishedAt.slice(0, 7) : "undated"
  const by = it.author ? ` by ${clip(it.author, 60)}` : ""
  const head = `[${alias}] ${it.platform} ${it.kind}${by} (${date}) ${shortLink(it.url)}`
  const title = it.title ? `\nTitle: ${clip(it.title, 160)}` : ""
  return `${head}${title}\n${clip(it.text, it.kind === "comment" ? 700 : 900)}`
}

/** Verify a model question against the source; fall back to a real question sentence. */
export function verifyQuestion(modelQ: string, source: string): string | null {
  const q = modelQ.trim()
  if (!q) return null
  if (isVerbatim(q, source)) {
    const span = clip(originalSpan(q, source), 300)
    return isRealQuestion(span) ? span : null
  }
  const toks = new Set(queryTokens(q))
  let best: { s: string; score: number } | null = null
  for (const s of questionSentences(source)) {
    const st = queryTokens(s)
    if (!st.length) continue
    const overlap = st.filter((t) => toks.has(t)).length / Math.max(toks.size, 1)
    if (!best || overlap > best.score) best = { s, score: overlap }
  }
  return best && best.score >= 0.5 && isRealQuestion(best.s) ? clip(best.s, 300) : null
}

export function verifyQuote(modelQuote: string, source: string): string | null {
  const q = modelQuote.trim()
  if (!q || q.length < 12) return null
  if (!isVerbatim(q, source)) return null
  return clip(originalSpan(q, source), 300)
}

function normSubtopic(s: string): string {
  const t = normForMatch(s).replace(/[^a-z0-9 &'/-]/g, "").trim().slice(0, 60)
  return t || "general"
}

export interface LabelOutcome {
  labels: Map<string, ItemLabels>
  missing: number
  failedBatches: number
  /** Items left unlabeled because the run's time budget ran out; the next scan labels them. */
  deferred: number
}

export async function labelItems(
  llm: LlmClient,
  items: Item[],
  ctx: { query: string; plan: Plan | null },
  opts: { signal?: AbortSignal; onProgress?: (labeled: number) => void; stopAt?: number } = {},
): Promise<LabelOutcome> {
  const labels = new Map<string, ItemLabels>()
  let failedBatches = 0
  let deferred = 0
  const outOfTime = () => opts.stopAt !== undefined && Date.now() > opts.stopAt
  const system = systemPrompt(ctx.query, ctx.plan)
  const entity = entityOf(ctx.plan)

  const runBatch = async (batch: Item[]): Promise<Item[]> => {
    const alias = new Map<string, Item>()
    batch.forEach((it, i) => alias.set(`a${i + 1}`, it))
    const user = [...alias.entries()].map(([a, it]) => render(a, it)).join("\n\n---\n\n")
    const out = await llm.structured({
      name: "listening_labels",
      schema: LabelSchema,
      system,
      user,
      maxTokens: 220 * batch.length + 400,
      signal: opts.signal,
    })
    for (const row of out.items) {
      const it = alias.get(row.id.trim())
      if (!it || labels.has(it.id)) continue
      const source = `${it.title}\n${it.text}`
      labels.set(it.id, {
        v: LABEL_VERSION,
        relevant: row.relevant,
        about: row.relevant && row.about,
        // "self" only exists for a named institution.
        speaker: row.speaker === "self" && !entity ? "organization" : (row.speaker as Speaker),
        sentiment: row.sentiment as Sentiment,
        subtopic: normSubtopic(row.subtopic),
        audience: row.audience as Audience,
        question: verifyQuestion(row.question, source),
        quote: verifyQuote(row.quote, source),
      })
    }
    opts.onProgress?.(labels.size)
    return batch.filter((it) => !labels.has(it.id))
  }

  const batches: Item[][] = []
  for (let i = 0; i < items.length; i += LIMITS.labelBatch) batches.push(items.slice(i, i + LIMITS.labelBatch))

  const leftovers: Item[] = []
  await mapLimit(batches, LIMITS.labelConcurrency, async (b) => {
    if (outOfTime()) {
      deferred += b.length
      return
    }
    try {
      leftovers.push(...(await runBatch(b)))
    } catch (err) {
      if (opts.signal?.aborted) throw err
      failedBatches++
      leftovers.push(...b)
    }
  })

  // One retry for anything the model skipped or a failed batch, in smaller batches.
  if (leftovers.length) {
    const retry: Item[][] = []
    for (let i = 0; i < leftovers.length; i += 15) retry.push(leftovers.slice(i, i + 15))
    await mapLimit(retry, LIMITS.labelConcurrency, async (b) => {
      if (outOfTime()) return
      try {
        await runBatch(b)
      } catch (err) {
        if (opts.signal?.aborted) throw err
      }
    })
  }
  const unlabeled = items.filter((it) => !labels.has(it.id)).length
  return { labels, missing: Math.max(0, unlabeled - deferred), failedBatches, deferred }
}
