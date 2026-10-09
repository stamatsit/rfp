/**
 * Topic Ideation client types. Mirrors packages/server/src/listening/types.ts
 * and report.ts (ItemView); keep the two in step.
 */

export type Platform =
  | "reddit" | "youtube" | "facebook" | "instagram" | "linkedin" | "tiktok" | "threads" | "bluesky"
  | "quora" | "forums" | "reviews" | "news" | "other"

export type Sentiment = "positive" | "neutral" | "negative" | "mixed"
export type Audience = "student" | "parent" | "patient" | "professional" | "general"
export type TimeWindow = "3m" | "1y" | "any"
export type RunStatus = "running" | "complete" | "failed" | "cancelled"
export type RunTrigger = "initial" | "rescan" | "rebuild"
export type Stage = "plan" | "search" | "read" | "label" | "cluster" | "write" | "save"

export interface SentimentBreakdown {
  positive: number
  neutral: number
  negative: number
  mixed: number
  score: number
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
  searchCalls: number
  serperCalls?: number
  youtubeUnits: number
}

export interface PlannedSearch {
  q: string
  why: string
  addedRunId?: string
}

export interface Plan {
  interpretation: string
  isNamedEntity: boolean
  entityName?: string | null
  disambiguation: string
  searches: PlannedSearch[]
  broaderSuggestions: string[]
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

export interface NewsEntry {
  itemId: string
  title: string
  url: string
  source: string | null
  publishedAt: string | null
  isNew: boolean
}

export type Speaker = "person" | "self" | "organization" | "media"

export interface SampleExclusions {
  mentions: number
  self: number
  organizations: number
  media: number
}

export interface OwnPost {
  itemId: string
  url: string
  platform: Platform
  title: string
  excerpt: string
  publishedAt: string | null
  isNew: boolean
}

export interface Report {
  /** 1: counted every relevant post. 2: counts only people's posts mainly about the topic. */
  version: 1 | 2
  topicId: string
  runId: string
  generatedAt: string
  query: string
  interpretation: string
  summary: string
  totals: {
    collected: number
    /** Version 2: posts by people mainly about the topic. Version 1: every relevant post. */
    relevant: number
    newThisRun: number
    fullyRead: number
    runs: number
    excluded?: SampleExclusions
  }
  ownVoice?: { name: string; note: string; count: number; posts: OwnPost[] } | null
  sentiment: SentimentBreakdown
  subtopics: Subtopic[]
  questions: QuestionEntry[]
  quotes: QuoteEntry[]
  ideas: ContentIdea[]
  news: NewsEntry[]
  platforms: Array<{ platform: Platform; count: number; sentiment: SentimentBreakdown }>
  months: Array<{ month: string; count: number }>
  thin: boolean
  broaderSuggestions: string[]
  coverage: Coverage
  analysisSource: "llm" | "partial" | "none"
  warnings: string[]
}

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
  /** Readable by the whole team; only the creator can change it. Absent before sharing existed. */
  shared?: boolean
  sharedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type IdeaStatus = "new" | "pitched" | "in_progress" | "published" | "dropped"

export interface SavedIdeaSource {
  url: string
  platform: Platform
  text: string
  publishedAt: string | null
}

/** A frozen copy of a content idea on someone's board. */
export interface SavedIdea {
  id: string
  createdBy: string
  topicId: string | null
  topicQuery: string
  fingerprint: string
  idea: { headline: string; angle: string; audience: Audience; format: string; whyNow: string; outline: string[]; subtopic: string | null }
  sources: SavedIdeaSource[]
  status: IdeaStatus
  createdAt: string
  updatedAt: string
}

export interface RunSummary {
  id: string
  topicId: string
  /** Who started the scan (session email). Absent from older servers. */
  createdBy?: string
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

export interface ItemView {
  id: string
  url: string
  platform: Platform
  kind: "post" | "comment" | "video" | "article" | "review"
  title: string
  excerpt: string
  author: string | null
  publishedAt: string | null
  engagement: number
  depth: "snippet" | "full"
  relevant: boolean | null
  /** Absent from servers before report version 2. */
  about?: boolean | null
  speaker?: Speaker | null
  counted?: boolean
  sentiment: Sentiment | null
  audience: Audience | null
  subtopicId: string | null
  isNew: boolean
}

export interface TopicDetail {
  topic: TopicRow
  /** "viewer" when someone else shared this topic with you: read and export only. */
  role?: "owner" | "viewer"
  items: ItemView[]
  runs: RunSummary[]
  activeRun: RunSummary | null
  /** Report idea id -> your saved copy's id, for ideas already on your board. */
  savedIdeas?: Record<string, string>
}

export interface Budget {
  used: number
  limit: number
  resetsAt: string
  scansLeft: number
}

export interface AccessInfo {
  allowed: boolean
  /** Can open and export every topic anyone has scanned (read only). */
  admin?: boolean
  sources: { search: boolean; google?: boolean; serper?: boolean; youtube: boolean; model: boolean; redditArchive: boolean }
  budget: Budget
}

export type RunEvent =
  | { type: "started"; topicId: string; runId: string; trigger: RunTrigger }
  | { type: "stage"; stage: Stage; detail?: string }
  | { type: "plan"; plan: Plan }
  | { type: "lane"; lane: LaneResult }
  | { type: "counts"; collected?: number; newItems?: number; fullyRead?: number; labeled?: number }
  | { type: "done"; topicId: string; runId: string }
  | { type: "error"; message: string; topicId?: string; runId?: string }
  | { type: "ping" }
