/**
 * Topic Ideation (social listening for content ideas): shared types.
 *
 * A Topic is a saved search. Each Run harvests the web for it; items are
 * deduped by canonical URL and accumulate on the topic, so a rescan only adds
 * what is new. Labels are stored per item; the report is rebuilt over every
 * relevant item after each run. All counts and percentages are computed here
 * in code from item labels, never by the model.
 */

export type Platform =
  | "reddit"
  | "youtube"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "threads"
  | "bluesky"
  | "quora"
  | "forums"
  | "reviews"
  | "news"
  | "other"

export type ItemKind = "post" | "comment" | "video" | "article" | "review"

export type Sentiment = "positive" | "neutral" | "negative" | "mixed"

export type Audience = "student" | "parent" | "patient" | "professional" | "general"

export type TimeWindow = "3m" | "1y" | "any"

/** A raw search hit or comment before dedupe and labeling. */
export interface RawItem {
  url: string
  platform: Platform
  kind: ItemKind
  title: string
  text: string
  author?: string | null
  publishedAt?: string | null
  engagement?: Engagement | null
  /** Thread/video URL for comments. */
  parentUrl?: string | null
  /** Lane id that produced it, e.g. "search:reddit:0". */
  lane: string
  /** "full" once the page or comment body was read, else "snippet". */
  depth: "snippet" | "full"
}

export interface Engagement {
  score?: number
  comments?: number
  likes?: number
  views?: number
}

/** Labels from the first analysis pass, stored per item. */
export interface ItemLabels {
  relevant: boolean
  sentiment: Sentiment
  /** Free-text subtopic from pass 1; clustered later. */
  subtopic: string
  audience: Audience
  /** Verbatim question asked in the item, verified against the text, or null. */
  question: string | null
  /** Verbatim quote worth showing, verified against the text, or null. */
  quote: string | null
}

export interface Item extends RawItem {
  id: string
  topicId: string
  firstSeenRunId: string
  labels: ItemLabels | null
  createdAt: string
}

export interface LaneResult {
  lane: string
  label: string
  status: "ok" | "failed" | "skipped"
  count: number
  ms: number
  note?: string
}

export interface Coverage {
  lanes: LaneResult[]
  degraded: boolean
  notes: string[]
  /** Google PSE calls (counted against the 100/day allowance). */
  searchCalls: number
  /** Serper calls (paid credits), when Serper served any. */
  serperCalls?: number
  youtubeUnits: number
}

export interface PlannedSearch {
  q: string
  why: string
  /** Run that added this phrasing. */
  addedRunId?: string
  /**
   * Next Google result offset per site group (1, 11, 21 ... 91), or null once
   * that group is exhausted. Lets each rescan dig one page deeper.
   */
  cursors?: Record<string, number | null>
}

export interface Plan {
  interpretation: string
  isNamedEntity: boolean
  /** What to treat as off-topic, e.g. "not the Japanese COE visa document". */
  disambiguation: string
  searches: PlannedSearch[]
  broaderSuggestions: string[]
  /** YouTube paging state for rescans. */
  youtube?: { nextPageToken: string | null }
}

export interface Subtopic {
  id: string
  name: string
  summary: string
  itemIds: string[]
  share: number
  count: number
  sentiment: SentimentBreakdown
  newCount: number
}

export interface SentimentBreakdown {
  positive: number
  neutral: number
  negative: number
  mixed: number
  /** -100..100 computed as (pos - neg) / labeled * 100. */
  score: number
}

export interface QuestionEntry {
  text: string
  itemId: string
  url: string
  platform: Platform
  audience: Audience
  subtopicId: string | null
  engagement: number
  isNew: boolean
}

export interface QuoteEntry {
  text: string
  itemId: string
  url: string
  platform: Platform
  sentiment: Sentiment
  subtopicId: string | null
  isNew: boolean
}

export interface ContentIdea {
  id: string
  headline: string
  angle: string
  audience: Audience
  format: string
  subtopicId: string | null
  whyNow: string
  outline: string[]
  evidenceItemIds: string[]
}

export interface PlatformStat {
  platform: Platform
  count: number
  sentiment: SentimentBreakdown
}

export interface MonthStat {
  month: string
  count: number
}

export interface NewsEntry {
  itemId: string
  title: string
  url: string
  source: string | null
  publishedAt: string | null
  isNew: boolean
}

export interface Report {
  version: 1
  topicId: string
  runId: string
  generatedAt: string
  query: string
  interpretation: string
  summary: string
  totals: {
    collected: number
    relevant: number
    newThisRun: number
    fullyRead: number
    runs: number
  }
  sentiment: SentimentBreakdown
  subtopics: Subtopic[]
  questions: QuestionEntry[]
  quotes: QuoteEntry[]
  ideas: ContentIdea[]
  news: NewsEntry[]
  platforms: PlatformStat[]
  months: MonthStat[]
  thin: boolean
  broaderSuggestions: string[]
  coverage: Coverage
  analysisSource: "llm" | "partial" | "none"
  warnings: string[]
}

export interface RunSummary {
  id: string
  topicId: string
  status: RunStatus
  trigger: RunTrigger
  startedAt: string
  completedAt: string | null
  newItems: number
  totalItems: number
  relevantItems: number
  sentimentScore: number | null
  searchCalls: number
  costUsd: number
  error: string | null
}

export type RunStatus = "running" | "complete" | "failed" | "cancelled"

export type RunTrigger = "initial" | "rescan" | "rebuild"

export interface TopicRow {
  id: string
  createdBy: string
  query: string
  timeWindow: TimeWindow
  plan: Plan | null
  report: Report | null
  itemCount: number
  relevantCount: number
  sentimentScore: number | null
  headline: string | null
  lastRunAt: string | null
  lastRunStatus: RunStatus | null
  createdAt: string
  updatedAt: string
}

/** Progress events streamed to the browser while a run works. */
export type RunEvent =
  | { type: "started"; topicId: string; runId: string; trigger: RunTrigger }
  | { type: "stage"; stage: Stage; detail?: string }
  | { type: "plan"; plan: Plan }
  | { type: "lane"; lane: LaneResult }
  | { type: "counts"; collected?: number; newItems?: number; fullyRead?: number; labeled?: number }
  | { type: "done"; topicId: string; runId: string }
  | { type: "error"; message: string; topicId?: string; runId?: string }
  | { type: "ping" }

export type Stage = "plan" | "search" | "read" | "label" | "cluster" | "write" | "save"

export class RunCancelled extends Error {
  constructor() {
    super("Run cancelled")
    this.name = "RunCancelled"
  }
}
