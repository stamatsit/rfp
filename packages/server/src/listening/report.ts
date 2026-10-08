/**
 * Assemble a Report from stored items, clusters and the writing pass.
 * Figures are computed here; model text is sanitised (no em or en dashes).
 */
import { LIMITS } from "./config.js"
import type { Cluster } from "./cluster.js"
import { assignClusters } from "./cluster.js"
import { collectQuestions, collectQuotes, engagementOf, isPublicConversation, monthStats, platformStats, sampleExclusions, sentimentOf } from "./metrics.js"
import { entityOf } from "./plan.js"
import type { SubtopicInput, SynthResult } from "./synthesize.js"
import type { Coverage, ContentIdea, Item, NewsEntry, OwnPost, Plan, QuestionEntry, Report, Subtopic } from "./types.js"
import { hostOf } from "./util/url.js"

export function noDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s–\s/g, ", ").replace(/–/g, "-")
}

export interface Grouping {
  subtopics: Array<Omit<Subtopic, "summary"> & { description: string }>
  subtopicOf: Map<string, string | null>
}

/** Turn clusters into ordered subtopics (s1 largest) over relevant conversation items. */
export function groupSubtopics(conv: Item[], clusters: Cluster[], latestRunId: string): Grouping {
  const assign = assignClusters(conv, clusters)
  const buckets = new Map<number, Item[]>()
  for (const it of conv) {
    const c = assign.get(it.id) ?? -1
    buckets.set(c, [...(buckets.get(c) ?? []), it])
  }
  const ordered = [...buckets.entries()]
    .filter(([c, list]) => c >= 0 || list.length >= 3)
    .sort((a, b) => (a[0] < 0 ? 1 : b[0] < 0 ? -1 : b[1].length - a[1].length))
  const total = conv.length
  const subtopicOf = new Map<string, string | null>()
  const subtopics = ordered.map(([c, list], i) => {
    const id = `s${i + 1}`
    for (const it of list) subtopicOf.set(it.id, id)
    const cl = c >= 0 ? clusters[c]! : null
    return {
      id,
      name: cl?.name ?? "Everything else",
      description: cl?.description ?? "Smaller threads that did not fit a larger subtopic.",
      itemIds: list.map((it) => it.id),
      count: list.length,
      share: total ? Math.round((100 * list.length) / total) : 0,
      sentiment: sentimentOf(list),
      newCount: list.filter((it) => it.firstSeenRunId === latestRunId).length,
    }
  })
  for (const it of conv) if (!subtopicOf.has(it.id)) subtopicOf.set(it.id, null)
  return { subtopics, subtopicOf }
}

export function subtopicInputs(g: Grouping, conv: Item[]): SubtopicInput[] {
  const byId = new Map(conv.map((it) => [it.id, it]))
  return g.subtopics.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    count: s.count,
    share: s.share,
    sentiment: s.sentiment,
    items: s.itemIds.map((id) => byId.get(id)!).filter(Boolean),
  }))
}

/** The named institution's own posts, newest first. */
export function ownPosts(items: Item[]): Item[] {
  return items
    .filter((it) => it.labels?.relevant && it.labels.speaker === "self" && it.platform !== "news")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || engagementOf(b) - engagementOf(a))
}

function excerptOf(text: string, max = 280): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "..." : t
}

export function buildReport(args: {
  topicId: string
  runId: string
  query: string
  plan: Plan | null
  items: Item[]
  grouping: Grouping
  synth: SynthResult | null
  coverage: Coverage
  runs: number
  newThisRun: number
  warnings: string[]
  now?: Date
}): Report {
  const { items, grouping, synth } = args
  const relevant = items.filter((it) => it.labels?.relevant)
  // Every figure below is computed over people's posts about the topic.
  const conv = items.filter(isPublicConversation)
  const latest = args.runId

  let questions: QuestionEntry[] = collectQuestions(conv, grouping.subtopicOf, latest)
  if (synth?.questionOrder.length) {
    const rank = new Map(synth.questionOrder.map((id, i) => [id, i]))
    questions = [...questions].sort((a, b) => (rank.get(a.itemId) ?? 999) - (rank.get(b.itemId) ?? 999) || b.engagement - a.engagement)
  }
  questions = questions.slice(0, LIMITS.maxQuestions)

  // Coverage: news articles, plus news outlets posting on social and forums.
  const news: NewsEntry[] = relevant
    .filter((it) => it.platform === "news" || it.labels?.speaker === "media")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 8)
    .map((it) => ({
      itemId: it.id,
      title: it.title || excerptOf(it.text, 140),
      url: it.url,
      source: it.author ?? (it.platform === "news" ? null : hostOf(it.url) || null),
      publishedAt: it.publishedAt ?? null,
      isNew: it.firstSeenRunId === latest,
    }))

  const entity = entityOf(args.plan)
  const own = entity ? ownPosts(items) : []
  const ownVoice: Report["ownVoice"] = own.length
    ? {
        name: entity!,
        note: noDashes(synth?.ownVoiceNote ?? ""),
        count: own.length,
        posts: own.slice(0, LIMITS.maxOwnPosts).map(
          (it): OwnPost => ({
            itemId: it.id,
            url: it.url,
            platform: it.platform,
            title: it.title,
            excerpt: excerptOf(it.text),
            publishedAt: it.publishedAt ?? null,
            isNew: it.firstSeenRunId === latest,
          }),
        ),
      }
    : null

  const subtopics: Subtopic[] = grouping.subtopics.map((s) => ({
    id: s.id,
    name: noDashes(s.name),
    summary: noDashes(synth?.subtopicSummaries.get(s.id) ?? s.description),
    itemIds: s.itemIds,
    share: s.share,
    count: s.count,
    sentiment: s.sentiment,
    newCount: s.newCount,
  }))

  const ideas: ContentIdea[] = (synth?.ideas ?? []).map((i) => ({
    ...i,
    headline: noDashes(i.headline),
    angle: noDashes(i.angle),
    whyNow: noDashes(i.whyNow),
    outline: i.outline.map(noDashes),
  }))

  const fullyRead = items.filter((it) => it.depth === "full").length
  const summary = synth?.summary
    ? noDashes(synth.summary)
    : conv.length
      ? `Collected ${conv.length} posts and comments by people about this topic. The written analysis is unavailable for this scan; the figures, questions and sources below are complete.`
      : "No conversation by people about this topic was found yet."

  const analysisSource: Report["analysisSource"] = synth ? "llm" : relevant.length ? "partial" : "none"

  return {
    version: 2,
    topicId: args.topicId,
    runId: args.runId,
    generatedAt: (args.now ?? new Date()).toISOString(),
    query: args.query,
    interpretation: noDashes(args.plan?.interpretation ?? ""),
    summary,
    totals: {
      collected: items.length,
      relevant: conv.length,
      newThisRun: args.newThisRun,
      fullyRead,
      runs: args.runs,
      excluded: sampleExclusions(items),
    },
    ownVoice,
    sentiment: sentimentOf(conv),
    subtopics,
    questions,
    quotes: collectQuotes(conv, grouping.subtopicOf, latest),
    ideas,
    news,
    platforms: platformStats(conv),
    months: monthStats(conv, args.now),
    thin: conv.length < LIMITS.thinThreshold,
    broaderSuggestions: args.plan?.broaderSuggestions ?? [],
    coverage: args.coverage,
    analysisSource,
    warnings: args.warnings,
  }
}

/** Compact item shape the browser needs to render evidence and the source list. */
export interface ItemView {
  id: string
  url: string
  platform: Item["platform"]
  kind: Item["kind"]
  title: string
  excerpt: string
  author: string | null
  publishedAt: string | null
  engagement: number
  depth: Item["depth"]
  relevant: boolean | null
  /** Mainly about the topic; null until labeled under the current label version. */
  about: boolean | null
  speaker: string | null
  /** Counted in the report's figures (people, mainly about the topic). */
  counted: boolean
  sentiment: string | null
  audience: string | null
  subtopicId: string | null
  isNew: boolean
}

export function itemViews(items: Item[], report: Report | null): ItemView[] {
  const subOf = new Map<string, string>()
  for (const s of report?.subtopics ?? []) for (const id of s.itemIds) subOf.set(id, s.id)
  return items.map((it) => ({
    id: it.id,
    url: it.url,
    platform: it.platform,
    kind: it.kind,
    title: it.title,
    excerpt: it.text.length > 420 ? it.text.slice(0, 420).replace(/\s+\S*$/, "") + "..." : it.text,
    author: it.author ?? null,
    publishedAt: it.publishedAt ?? null,
    engagement: engagementOf(it),
    depth: it.depth,
    relevant: it.labels ? it.labels.relevant : null,
    about: it.labels?.about ?? null,
    speaker: it.labels?.speaker ?? null,
    counted: isPublicConversation(it),
    sentiment: it.labels?.sentiment ?? null,
    audience: it.labels?.audience ?? null,
    subtopicId: subOf.get(it.id) ?? null,
    isNew: report ? it.firstSeenRunId === report.runId : false,
  }))
}
