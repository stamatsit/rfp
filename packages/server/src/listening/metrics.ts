/**
 * Every number in a report comes from here, computed from stored labels.
 * The model never supplies a count or a percentage.
 */
import { LIMITS } from "./config.js"
import type { Item, MonthStat, Platform, PlatformStat, QuestionEntry, QuoteEntry, SampleExclusions, SentimentBreakdown } from "./types.js"
import { isRealQuestion, normForMatch, queryTokens } from "./util/text.js"

export function isConversation(it: Item): boolean {
  return it.platform !== "news"
}

/**
 * The sample every figure is computed over: posts, comments, reviews and
 * videos by people, mainly about the topic. Leaves out passing mentions, the
 * named institution's own accounts, other organizations, news, and anything
 * whose labels predate speaker and focus (relabeled on the next scan).
 */
export function isPublicConversation(it: Item): boolean {
  const l = it.labels
  return !!l && l.relevant && l.about === true && l.speaker === "person" && isConversation(it) && it.kind !== "article"
}

/**
 * People's own words, for quotes and questions: public conversation without
 * video titles and descriptions, which are written to be clicked.
 */
export function isVoice(it: Item): boolean {
  return isPublicConversation(it) && it.kind !== "video"
}

/** Relevant items kept out of the figures, by reason. News articles have their own section and are not counted here. */
export function sampleExclusions(items: Item[]): SampleExclusions {
  const out: SampleExclusions = { mentions: 0, self: 0, organizations: 0, media: 0 }
  for (const it of items) {
    const l = it.labels
    if (!l?.relevant || !l.speaker || it.platform === "news" || isPublicConversation(it)) continue
    if (l.speaker === "self") out.self++
    else if (l.speaker === "media") out.media++
    else if (l.speaker === "organization") out.organizations++
    else out.mentions++
  }
  return out
}

/** Fewer, stronger ideas when the sample is small. */
export function ideaCap(relevant: number): number {
  if (relevant < 12) return 2
  if (relevant < 25) return 3
  if (relevant < 40) return 5
  return LIMITS.maxIdeas
}

export function engagementOf(it: Item): number {
  const e = it.engagement
  if (!e) return 0
  return (e.score ?? 0) + (e.likes ?? 0) + 3 * (e.comments ?? 0) + Math.round((e.views ?? 0) / 1000)
}

export function sentimentOf(items: Item[]): SentimentBreakdown {
  const s = { positive: 0, neutral: 0, negative: 0, mixed: 0, score: 0 }
  for (const it of items) if (it.labels) s[it.labels.sentiment]++
  const total = s.positive + s.neutral + s.negative + s.mixed
  s.score = total ? Math.round((100 * (s.positive - s.negative)) / total) : 0
  return s
}

export function platformStats(items: Item[]): PlatformStat[] {
  const by = new Map<Platform, Item[]>()
  for (const it of items) by.set(it.platform, [...(by.get(it.platform) ?? []), it])
  return [...by.entries()]
    .map(([platform, list]) => ({ platform, count: list.length, sentiment: sentimentOf(list) }))
    .sort((a, b) => b.count - a.count)
}

/** Monthly volume for the last 12 months that have any dated item. */
export function monthStats(items: Item[], now = new Date()): MonthStat[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    if (!it.publishedAt) continue
    const d = new Date(it.publishedAt)
    if (Number.isNaN(d.getTime()) || d > now) continue
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const months: MonthStat[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    months.push({ month: k, count: counts.get(k) ?? 0 })
  }
  return months
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union ? inter / union : 0
}

export function collectQuestions(items: Item[], subtopicOf: Map<string, string | null>, latestRunId: string): QuestionEntry[] {
  const cands = items
    .filter((it) => it.labels?.question && isRealQuestion(it.labels.question) && isVoice(it))
    .map((it) => ({ it, toks: queryTokens(it.labels!.question!) }))
    .sort((a, b) => engagementOf(b.it) - engagementOf(a.it))
  const kept: typeof cands = []
  for (const c of cands) {
    if (kept.some((k) => jaccard(k.toks, c.toks) >= 0.7)) continue
    kept.push(c)
  }
  return kept.map(({ it }) => ({
    text: it.labels!.question!,
    itemId: it.id,
    url: it.url,
    platform: it.platform,
    audience: it.labels!.audience,
    subtopicId: subtopicOf.get(it.id) ?? null,
    engagement: engagementOf(it),
    isNew: it.firstSeenRunId === latestRunId,
  }))
}

/** Up to maxQuotes verified quotes: the strongest per subtopic first, then mixed sentiment. */
export function collectQuotes(items: Item[], subtopicOf: Map<string, string | null>, latestRunId: string): QuoteEntry[] {
  const withQuote = items
    .filter((it) => it.labels?.quote && isVoice(it))
    .sort((a, b) => engagementOf(b) - engagementOf(a))
  const picked: Item[] = []
  const seenSub = new Set<string | null>()
  for (const it of withQuote) {
    const s = subtopicOf.get(it.id) ?? null
    if (seenSub.has(s)) continue
    seenSub.add(s)
    picked.push(it)
  }
  for (const it of withQuote) {
    if (picked.length >= LIMITS.maxQuotes) break
    if (!picked.includes(it)) picked.push(it)
  }
  const seenText = new Set<string>()
  return picked
    .filter((it) => {
      const k = normForMatch(it.labels!.quote!)
      if (seenText.has(k)) return false
      seenText.add(k)
      return true
    })
    .slice(0, LIMITS.maxQuotes)
    .map((it) => ({
      text: it.labels!.quote!,
      itemId: it.id,
      url: it.url,
      platform: it.platform,
      sentiment: it.labels!.sentiment,
      subtopicId: subtopicOf.get(it.id) ?? null,
      isNew: it.firstSeenRunId === latestRunId,
    }))
}

/** Drop any sentence that states a percentage or a count the model was told not to give. */
export function stripModelNumbers(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/)
  return sentences.filter((s) => !/\d+(\.\d+)?\s*%|\b\d{2,}\s+(posts|people|comments|users|threads|mentions|percent)\b/i.test(s)).join(" ").trim()
}
