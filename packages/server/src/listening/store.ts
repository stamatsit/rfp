/**
 * Persistence for topics, runs and items. PgStore talks to the 009 tables with
 * postgres.js (used by both the Express route and the Vercel function);
 * MemoryStore backs unit tests and the fixture-mode e2e run.
 */
import crypto from "node:crypto"
import type postgres from "postgres"
import type { ResponseCache } from "./cache.js"
import type { ThreadUpdate } from "./harvest.js"
import {
  LABEL_VERSION,
  type Coverage,
  type IdeaStatus,
  type Item,
  type ItemLabels,
  type SavedIdea,
  type Plan,
  type RawItem,
  type Report,
  type RunStatus,
  type RunSummary,
  type RunTrigger,
  type TimeWindow,
  type TopicRow,
} from "./types.js"

export class ActiveRunError extends Error {
  constructor(public runId: string | null) {
    super("A scan is already running for this topic")
    this.name = "ActiveRunError"
  }
}

export type TopicPatch = Partial<
  Pick<TopicRow, "plan" | "report" | "itemCount" | "relevantCount" | "sentimentScore" | "headline" | "lastRunAt" | "lastRunStatus">
>

export interface RunFinish {
  status: Exclude<RunStatus, "running">
  newItems?: number
  totalItems?: number
  relevantItems?: number
  sentimentScore?: number | null
  searchCalls?: number
  youtubeUnits?: number
  costUsd?: number
  coverage?: Coverage | null
  error?: string | null
}

export interface Store {
  createTopic(input: { createdBy: string; query: string; timeWindow: TimeWindow }): Promise<TopicRow>
  getTopic(id: string): Promise<TopicRow | null>
  /** Topics created by this user (case-insensitive email), newest activity first. */
  listTopics(createdBy: string): Promise<TopicRow[]>
  /** Topics other people have shared, newest activity first. */
  listSharedTopics(excludeCreatedBy: string): Promise<TopicRow[]>
  /** Every topic other people created, shared or not (admins only), newest activity first. */
  listOthersTopics(excludeCreatedBy: string): Promise<TopicRow[]>
  /** Share or unshare; does not count as activity (updated_at stays). */
  setShared(id: string, shared: boolean): Promise<void>
  listSavedIdeas(createdBy: string): Promise<SavedIdea[]>
  getSavedIdea(id: string): Promise<SavedIdea | null>
  /** Inserts, or returns the existing save when this person already saved the same idea. */
  saveIdea(input: Omit<SavedIdea, "id" | "status" | "createdAt" | "updatedAt">): Promise<SavedIdea>
  setIdeaStatus(id: string, status: IdeaStatus): Promise<void>
  deleteSavedIdea(id: string): Promise<void>
  /** Fingerprints this person saved from one topic, to mark ideas as saved. */
  savedFingerprints(createdBy: string, topicId: string): Promise<Set<string>>
  updateTopic(id: string, patch: TopicPatch): Promise<void>
  deleteTopic(id: string): Promise<void>
  createRun(topicId: string, createdBy: string, trigger: RunTrigger): Promise<string>
  getActiveRun(topicId: string): Promise<RunSummary | null>
  getRun(runId: string): Promise<RunSummary | null>
  finishRun(runId: string, f: RunFinish): Promise<void>
  requestCancel(runId: string): Promise<void>
  isCancelRequested(runId: string): Promise<boolean>
  listRuns(topicId: string): Promise<RunSummary[]>
  existingCanonicalUrls(topicId: string): Promise<Set<string>>
  insertItems(topicId: string, runId: string, items: Array<RawItem & { canonicalUrl: string }>): Promise<Item[]>
  /** Items with no labels, then items labeled under an older label version; newest first within each. */
  unlabeledItems(topicId: string, limit: number): Promise<Item[]>
  saveLabels(labels: Map<string, ItemLabels>): Promise<void>
  /** Marks threads read in full. A new body clears the item's labels so it is relabeled on the full text. */
  updateThreads(updates: ThreadUpdate[]): Promise<void>
  allItems(topicId: string): Promise<Item[]>
  searchCallsSince(since: Date): Promise<number>
  /** Marks runs stuck in "running" (crashed function, killed deploy) as failed. */
  failStaleRuns(olderThanMs: number): Promise<number>
}

/** Runs older than this are considered dead: the function limit is 300s. */
export const STALE_RUN_MS = 6 * 60 * 1000

const iso = (d: unknown): string | null => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null)

// ─── Postgres ──────────────────────────────────────────────────────────────

type Sql = postgres.Sql<Record<string, unknown>>

function topicFromRow(r: Record<string, any>, withReport = true): TopicRow {
  return {
    id: r.id,
    createdBy: r.created_by,
    query: r.query,
    timeWindow: r.time_window,
    plan: (r.plan as Plan) ?? null,
    report: withReport ? ((r.report as Report) ?? null) : null,
    itemCount: r.item_count ?? 0,
    relevantCount: r.relevant_count ?? 0,
    sentimentScore: r.sentiment_score ?? null,
    headline: r.headline ?? null,
    lastRunAt: iso(r.last_run_at),
    lastRunStatus: r.last_run_status ?? null,
    shared: r.shared === true,
    sharedAt: iso(r.shared_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  }
}

function savedIdeaFromRow(r: Record<string, any>): SavedIdea {
  return {
    id: r.id,
    createdBy: r.created_by,
    topicId: r.topic_id ?? null,
    topicQuery: r.topic_query,
    fingerprint: r.fingerprint,
    idea: r.idea,
    sources: r.sources ?? [],
    status: r.status,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  }
}

function runFromRow(r: Record<string, any>): RunSummary {
  return {
    id: r.id,
    topicId: r.topic_id,
    createdBy: r.created_by ?? "",
    status: r.status,
    trigger: r.trigger,
    startedAt: iso(r.started_at)!,
    completedAt: iso(r.completed_at),
    newItems: r.new_items ?? 0,
    totalItems: r.total_items ?? 0,
    relevantItems: r.relevant_items ?? 0,
    sentimentScore: r.sentiment_score ?? null,
    searchCalls: r.search_calls ?? 0,
    costUsd: Number(r.cost_usd ?? 0),
    error: r.error ?? null,
  }
}

function itemFromRow(r: Record<string, any>): Item {
  return {
    id: r.id,
    topicId: r.topic_id,
    firstSeenRunId: r.first_seen_run_id,
    url: r.url,
    platform: r.platform,
    kind: r.kind,
    title: r.title ?? "",
    text: r.body ?? "",
    author: r.author ?? null,
    publishedAt: iso(r.published_at),
    engagement: r.engagement ?? null,
    parentUrl: r.parent_url ?? null,
    lane: r.lane,
    depth: r.depth,
    labels: (r.labels as ItemLabels) ?? null,
    createdAt: iso(r.created_at)!,
  }
}

export class PgStore implements Store {
  constructor(private sql: Sql) {}

  async createTopic(input: { createdBy: string; query: string; timeWindow: TimeWindow }): Promise<TopicRow> {
    const [r] = await this.sql`
      INSERT INTO listening_topics (created_by, query, time_window)
      VALUES (${input.createdBy}, ${input.query}, ${input.timeWindow})
      RETURNING *`
    return topicFromRow(r!)
  }

  async getTopic(id: string): Promise<TopicRow | null> {
    const [r] = await this.sql`SELECT * FROM listening_topics WHERE id = ${id}::uuid`
    return r ? topicFromRow(r) : null
  }

  async listTopics(createdBy: string): Promise<TopicRow[]> {
    const rows = await this.sql`
      SELECT id, created_by, query, time_window, item_count, relevant_count, sentiment_score, headline,
             last_run_at, last_run_status, shared, shared_at, created_at, updated_at
      FROM listening_topics WHERE lower(created_by) = ${createdBy.trim().toLowerCase()}
      ORDER BY updated_at DESC LIMIT 200`
    return rows.map((r) => topicFromRow(r, false))
  }

  async listSharedTopics(excludeCreatedBy: string): Promise<TopicRow[]> {
    const rows = await this.sql`
      SELECT id, created_by, query, time_window, item_count, relevant_count, sentiment_score, headline,
             last_run_at, last_run_status, shared, shared_at, created_at, updated_at
      FROM listening_topics WHERE shared AND lower(created_by) <> ${excludeCreatedBy.trim().toLowerCase()}
      ORDER BY updated_at DESC LIMIT 200`
    return rows.map((r) => topicFromRow(r, false))
  }

  async listOthersTopics(excludeCreatedBy: string): Promise<TopicRow[]> {
    const rows = await this.sql`
      SELECT id, created_by, query, time_window, item_count, relevant_count, sentiment_score, headline,
             last_run_at, last_run_status, shared, shared_at, created_at, updated_at
      FROM listening_topics WHERE lower(created_by) <> ${excludeCreatedBy.trim().toLowerCase()}
      ORDER BY updated_at DESC LIMIT 500`
    return rows.map((r) => topicFromRow(r, false))
  }

  async setShared(id: string, shared: boolean): Promise<void> {
    await this.sql`UPDATE listening_topics SET shared = ${shared}, shared_at = ${shared ? new Date() : null} WHERE id = ${id}::uuid`
  }

  async listSavedIdeas(createdBy: string): Promise<SavedIdea[]> {
    const rows = await this.sql`
      SELECT * FROM listening_saved_ideas WHERE lower(created_by) = ${createdBy.trim().toLowerCase()}
      ORDER BY created_at DESC LIMIT 500`
    return rows.map(savedIdeaFromRow)
  }

  async getSavedIdea(id: string): Promise<SavedIdea | null> {
    const [r] = await this.sql`SELECT * FROM listening_saved_ideas WHERE id = ${id}::uuid`
    return r ? savedIdeaFromRow(r) : null
  }

  async saveIdea(input: Omit<SavedIdea, "id" | "status" | "createdAt" | "updatedAt">): Promise<SavedIdea> {
    const [r] = await this.sql`
      INSERT INTO listening_saved_ideas (created_by, topic_id, topic_query, fingerprint, idea, sources)
      VALUES (${input.createdBy}, ${input.topicId}, ${input.topicQuery}, ${input.fingerprint},
              ${this.sql.json(input.idea as never)}, ${this.sql.json(input.sources as never)})
      ON CONFLICT (created_by, fingerprint) DO NOTHING
      RETURNING *`
    if (r) return savedIdeaFromRow(r)
    const [existing] = await this.sql`
      SELECT * FROM listening_saved_ideas WHERE created_by = ${input.createdBy} AND fingerprint = ${input.fingerprint}`
    return savedIdeaFromRow(existing!)
  }

  async setIdeaStatus(id: string, status: IdeaStatus): Promise<void> {
    await this.sql`UPDATE listening_saved_ideas SET status = ${status}, updated_at = now() WHERE id = ${id}::uuid`
  }

  async deleteSavedIdea(id: string): Promise<void> {
    await this.sql`DELETE FROM listening_saved_ideas WHERE id = ${id}::uuid`
  }

  async savedFingerprints(createdBy: string, topicId: string): Promise<Set<string>> {
    const rows = await this.sql`
      SELECT fingerprint FROM listening_saved_ideas
      WHERE lower(created_by) = ${createdBy.trim().toLowerCase()} AND topic_id = ${topicId}::uuid`
    return new Set(rows.map((r) => r["fingerprint"] as string))
  }

  async updateTopic(id: string, p: TopicPatch): Promise<void> {
    const set: Record<string, unknown> = { updated_at: new Date() }
    if (p.plan !== undefined) set["plan"] = p.plan === null ? null : this.sql.json(p.plan as never)
    if (p.report !== undefined) set["report"] = p.report === null ? null : this.sql.json(p.report as never)
    if (p.itemCount !== undefined) set["item_count"] = p.itemCount
    if (p.relevantCount !== undefined) set["relevant_count"] = p.relevantCount
    if (p.sentimentScore !== undefined) set["sentiment_score"] = p.sentimentScore
    if (p.headline !== undefined) set["headline"] = p.headline
    if (p.lastRunAt !== undefined) set["last_run_at"] = p.lastRunAt ? new Date(p.lastRunAt) : null
    if (p.lastRunStatus !== undefined) set["last_run_status"] = p.lastRunStatus
    await this.sql`UPDATE listening_topics SET ${this.sql(set)} WHERE id = ${id}::uuid`
  }

  async deleteTopic(id: string): Promise<void> {
    await this.sql`DELETE FROM listening_topics WHERE id = ${id}::uuid`
  }

  async createRun(topicId: string, createdBy: string, trigger: RunTrigger): Promise<string> {
    await this.failStaleRuns(STALE_RUN_MS)
    try {
      const [r] = await this.sql`
        INSERT INTO listening_runs (topic_id, created_by, trigger)
        VALUES (${topicId}::uuid, ${createdBy}, ${trigger})
        RETURNING id`
      return r!["id"] as string
    } catch (err: any) {
      if (err?.code === "23505") {
        const active = await this.getActiveRun(topicId)
        throw new ActiveRunError(active?.id ?? null)
      }
      throw err
    }
  }

  async getActiveRun(topicId: string): Promise<RunSummary | null> {
    const [r] = await this.sql`SELECT * FROM listening_runs WHERE topic_id = ${topicId}::uuid AND status = 'running' LIMIT 1`
    return r ? runFromRow(r) : null
  }

  async getRun(runId: string): Promise<RunSummary | null> {
    const [r] = await this.sql`SELECT * FROM listening_runs WHERE id = ${runId}::uuid`
    return r ? runFromRow(r) : null
  }

  async finishRun(runId: string, f: RunFinish): Promise<void> {
    await this.sql`
      UPDATE listening_runs SET
        status = ${f.status},
        completed_at = now(),
        new_items = ${f.newItems ?? 0},
        total_items = ${f.totalItems ?? 0},
        relevant_items = ${f.relevantItems ?? 0},
        sentiment_score = ${f.sentimentScore ?? null},
        search_calls = ${f.searchCalls ?? 0},
        youtube_units = ${f.youtubeUnits ?? 0},
        cost_usd = ${f.costUsd ?? 0},
        coverage = ${f.coverage ? this.sql.json(f.coverage as never) : null},
        error = ${f.error ?? null}
      WHERE id = ${runId}::uuid AND status = 'running'`
  }

  async requestCancel(runId: string): Promise<void> {
    await this.sql`UPDATE listening_runs SET cancel_requested = true WHERE id = ${runId}::uuid AND status = 'running'`
  }

  async isCancelRequested(runId: string): Promise<boolean> {
    const [r] = await this.sql`SELECT cancel_requested FROM listening_runs WHERE id = ${runId}::uuid`
    return !!r?.["cancel_requested"]
  }

  async listRuns(topicId: string): Promise<RunSummary[]> {
    const rows = await this.sql`SELECT * FROM listening_runs WHERE topic_id = ${topicId}::uuid ORDER BY started_at DESC LIMIT 50`
    return rows.map(runFromRow)
  }

  async existingCanonicalUrls(topicId: string): Promise<Set<string>> {
    const rows = await this.sql`SELECT canonical_url FROM listening_items WHERE topic_id = ${topicId}::uuid`
    return new Set(rows.map((r) => r["canonical_url"] as string))
  }

  async insertItems(topicId: string, runId: string, items: Array<RawItem & { canonicalUrl: string }>): Promise<Item[]> {
    if (!items.length) return []
    const out: Item[] = []
    for (let i = 0; i < items.length; i += 200) {
      const rows = items.slice(i, i + 200).map((it) => ({
        topic_id: topicId,
        first_seen_run_id: runId,
        url: it.url,
        canonical_url: it.canonicalUrl,
        platform: it.platform,
        kind: it.kind,
        title: it.title ?? "",
        body: it.text ?? "",
        author: it.author ?? null,
        published_at: it.publishedAt ? new Date(it.publishedAt) : null,
        engagement: it.engagement ? this.sql.json(it.engagement as never) : null,
        parent_url: it.parentUrl ?? null,
        lane: it.lane,
        depth: it.depth,
      }))
      const inserted = await this.sql`
        INSERT INTO listening_items ${this.sql(rows as never)}
        ON CONFLICT (topic_id, canonical_url) DO NOTHING
        RETURNING *`
      out.push(...inserted.map(itemFromRow))
    }
    return out
  }

  async unlabeledItems(topicId: string, limit: number): Promise<Item[]> {
    const rows = await this.sql`
      SELECT * FROM listening_items
      WHERE topic_id = ${topicId}::uuid AND (labels IS NULL OR (labels->>'v') IS DISTINCT FROM ${String(LABEL_VERSION)})
      ORDER BY (labels IS NULL) DESC, created_at DESC LIMIT ${limit}`
    return rows.map(itemFromRow)
  }

  async updateThreads(updates: ThreadUpdate[]): Promise<void> {
    for (const u of updates) {
      await this.sql`
        UPDATE listening_items SET
          depth = 'full',
          body = COALESCE(${u.text}, body),
          labels = CASE WHEN ${u.text}::text IS NULL THEN labels ELSE NULL END,
          published_at = COALESCE(published_at, ${u.publishedAt ? new Date(u.publishedAt) : null}),
          engagement = COALESCE(${u.engagement ? this.sql.json(u.engagement as never) : null}, engagement)
        WHERE id = ${u.id}::uuid`
    }
  }

  async saveLabels(labels: Map<string, ItemLabels>): Promise<void> {
    const entries = [...labels.entries()]
    for (let i = 0; i < entries.length; i += 200) {
      const values = entries.slice(i, i + 200).map(([id, l]) => [id, JSON.stringify(l)])
      await this.sql`
        UPDATE listening_items AS t SET labels = v.labels::jsonb
        FROM (VALUES ${this.sql(values as never)}) AS v(id, labels)
        WHERE t.id = v.id::uuid`
    }
  }

  async allItems(topicId: string): Promise<Item[]> {
    const rows = await this.sql`SELECT * FROM listening_items WHERE topic_id = ${topicId}::uuid ORDER BY created_at`
    return rows.map(itemFromRow)
  }

  async searchCallsSince(since: Date): Promise<number> {
    const [r] = await this.sql`SELECT COALESCE(SUM(search_calls), 0)::int AS n FROM listening_runs WHERE started_at >= ${since}`
    return Number(r?.["n"] ?? 0)
  }

  async failStaleRuns(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs)
    const rows = await this.sql`
      UPDATE listening_runs SET status = 'failed', completed_at = now(), error = 'The scan stopped unexpectedly (server restart or time limit)'
      WHERE status = 'running' AND started_at < ${cutoff}
      RETURNING topic_id`
    for (const r of rows) {
      await this.sql`UPDATE listening_topics SET last_run_status = 'failed' WHERE id = ${r["topic_id"] as string}::uuid AND last_run_status = 'running'`
    }
    return rows.length
  }
}

/** Resolves to `fallback` if `p` has not settled within `ms`. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

const CACHE_MS = 3000

/**
 * Database-backed response cache for production (Vercel has no shared disk).
 * Every call is time-boxed: a slow or stuck cache is skipped, never waited on.
 */
export class PgCache implements ResponseCache {
  constructor(private sql: Sql) {}
  async get<T>(key: string): Promise<T | null> {
    const q = (async () => {
      const [r] = await this.sql`SELECT value FROM listening_cache WHERE key = ${key} AND expires_at > now()`
      return (r?.["value"] as T) ?? null
    })()
    return within(q, CACHE_MS, null)
  }
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const q = (async () => {
      const exp = new Date(Date.now() + ttlMs)
      await this.sql`
        INSERT INTO listening_cache (key, value, expires_at) VALUES (${key}, ${this.sql.json(value as never)}, ${exp})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`
      if (Math.random() < 0.02) await this.sql`DELETE FROM listening_cache WHERE expires_at < now()`
    })()
    await within(q, CACHE_MS, undefined)
  }
}

// ─── Memory (tests, fixture-mode e2e) ──────────────────────────────────────

export class MemoryStore implements Store {
  topics = new Map<string, TopicRow>()
  runs = new Map<string, RunSummary & { createdBy: string; cancel: boolean; coverage: Coverage | null; youtubeUnits: number }>()
  items = new Map<string, Item & { canonicalUrl: string }>()

  async createTopic(input: { createdBy: string; query: string; timeWindow: TimeWindow }): Promise<TopicRow> {
    const now = new Date().toISOString()
    const t: TopicRow = {
      id: crypto.randomUUID(),
      createdBy: input.createdBy,
      query: input.query,
      timeWindow: input.timeWindow,
      plan: null,
      report: null,
      itemCount: 0,
      relevantCount: 0,
      sentimentScore: null,
      headline: null,
      lastRunAt: null,
      lastRunStatus: null,
      shared: false,
      sharedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.topics.set(t.id, t)
    return structuredClone(t)
  }
  async listSharedTopics(excludeCreatedBy: string) {
    const who = excludeCreatedBy.trim().toLowerCase()
    return [...this.topics.values()]
      .filter((t) => t.shared && t.createdBy.trim().toLowerCase() !== who)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ ...structuredClone(t), report: null }))
  }
  async listOthersTopics(excludeCreatedBy: string) {
    const who = excludeCreatedBy.trim().toLowerCase()
    return [...this.topics.values()]
      .filter((t) => t.createdBy.trim().toLowerCase() !== who)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ ...structuredClone(t), report: null }))
  }
  async setShared(id: string, shared: boolean) {
    const t = this.topics.get(id)
    if (!t) return
    t.shared = shared
    t.sharedAt = shared ? new Date().toISOString() : null
  }
  ideas = new Map<string, SavedIdea>()
  async listSavedIdeas(createdBy: string) {
    const who = createdBy.trim().toLowerCase()
    return [...this.ideas.values()]
      .filter((i) => i.createdBy.trim().toLowerCase() === who)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((i) => structuredClone(i))
  }
  async getSavedIdea(id: string) {
    const i = this.ideas.get(id)
    return i ? structuredClone(i) : null
  }
  async saveIdea(input: Omit<SavedIdea, "id" | "status" | "createdAt" | "updatedAt">) {
    const existing = [...this.ideas.values()].find((i) => i.createdBy === input.createdBy && i.fingerprint === input.fingerprint)
    if (existing) return structuredClone(existing)
    const now = new Date().toISOString()
    const row: SavedIdea = { ...structuredClone(input), id: crypto.randomUUID(), status: "new", createdAt: now, updatedAt: now }
    this.ideas.set(row.id, row)
    return structuredClone(row)
  }
  async setIdeaStatus(id: string, status: IdeaStatus) {
    const i = this.ideas.get(id)
    if (i) Object.assign(i, { status, updatedAt: new Date().toISOString() })
  }
  async deleteSavedIdea(id: string) {
    this.ideas.delete(id)
  }
  async savedFingerprints(createdBy: string, topicId: string) {
    const who = createdBy.trim().toLowerCase()
    return new Set([...this.ideas.values()].filter((i) => i.createdBy.trim().toLowerCase() === who && i.topicId === topicId).map((i) => i.fingerprint))
  }
  async getTopic(id: string) {
    const t = this.topics.get(id)
    return t ? structuredClone(t) : null
  }
  async listTopics(createdBy: string) {
    const who = createdBy.trim().toLowerCase()
    return [...this.topics.values()]
      .filter((t) => t.createdBy.trim().toLowerCase() === who)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ ...structuredClone(t), report: null }))
  }
  async updateTopic(id: string, p: TopicPatch) {
    const t = this.topics.get(id)
    if (!t) return
    Object.assign(t, structuredClone(p), { updatedAt: new Date().toISOString() })
  }
  async deleteTopic(id: string) {
    this.topics.delete(id)
    for (const [k, r] of this.runs) if (r.topicId === id) this.runs.delete(k)
    for (const [k, it] of this.items) if (it.topicId === id) this.items.delete(k)
    // Saved ideas outlive their topic (ON DELETE SET NULL).
    for (const i of this.ideas.values()) if (i.topicId === id) i.topicId = null
  }
  async createRun(topicId: string, createdBy: string, trigger: RunTrigger) {
    await this.failStaleRuns(STALE_RUN_MS)
    const active = [...this.runs.values()].find((r) => r.topicId === topicId && r.status === "running")
    if (active) throw new ActiveRunError(active.id)
    const id = crypto.randomUUID()
    this.runs.set(id, {
      id, topicId, createdBy, trigger, status: "running", startedAt: new Date().toISOString(), completedAt: null,
      newItems: 0, totalItems: 0, relevantItems: 0, sentimentScore: null, searchCalls: 0, costUsd: 0, error: null,
      cancel: false, coverage: null, youtubeUnits: 0,
    })
    return id
  }
  async getActiveRun(topicId: string) {
    const r = [...this.runs.values()].find((x) => x.topicId === topicId && x.status === "running")
    return r ? structuredClone(r) : null
  }
  async getRun(runId: string) {
    const r = this.runs.get(runId)
    return r ? structuredClone(r) : null
  }
  async finishRun(runId: string, f: RunFinish) {
    const r = this.runs.get(runId)
    if (!r || r.status !== "running") return
    Object.assign(r, {
      status: f.status,
      completedAt: new Date().toISOString(),
      newItems: f.newItems ?? 0,
      totalItems: f.totalItems ?? 0,
      relevantItems: f.relevantItems ?? 0,
      sentimentScore: f.sentimentScore ?? null,
      searchCalls: f.searchCalls ?? 0,
      youtubeUnits: f.youtubeUnits ?? 0,
      costUsd: f.costUsd ?? 0,
      coverage: f.coverage ?? null,
      error: f.error ?? null,
    })
  }
  async requestCancel(runId: string) {
    const r = this.runs.get(runId)
    if (r && r.status === "running") r.cancel = true
  }
  async isCancelRequested(runId: string) {
    return !!this.runs.get(runId)?.cancel
  }
  async listRuns(topicId: string) {
    return [...this.runs.values()].filter((r) => r.topicId === topicId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((r) => structuredClone(r))
  }
  async existingCanonicalUrls(topicId: string) {
    return new Set([...this.items.values()].filter((i) => i.topicId === topicId).map((i) => i.canonicalUrl))
  }
  async insertItems(topicId: string, runId: string, items: Array<RawItem & { canonicalUrl: string }>) {
    const existing = await this.existingCanonicalUrls(topicId)
    const out: Item[] = []
    for (const it of items) {
      if (existing.has(it.canonicalUrl)) continue
      existing.add(it.canonicalUrl)
      const row = { ...structuredClone(it), id: crypto.randomUUID(), topicId, firstSeenRunId: runId, labels: null, createdAt: new Date().toISOString() }
      this.items.set(row.id, row)
      out.push(structuredClone(row))
    }
    return out
  }
  async unlabeledItems(topicId: string, limit: number) {
    const mine = [...this.items.values()].filter((i) => i.topicId === topicId).reverse()
    const none = mine.filter((i) => !i.labels)
    const stale = mine.filter((i) => i.labels && i.labels.v !== LABEL_VERSION)
    return [...none, ...stale].slice(0, limit).map((i) => structuredClone(i))
  }
  async updateThreads(updates: ThreadUpdate[]) {
    for (const u of updates) {
      const it = this.items.get(u.id)
      if (!it) continue
      it.depth = "full"
      if (u.text !== null) {
        it.text = u.text
        it.labels = null
      }
      if (!it.publishedAt && u.publishedAt) it.publishedAt = u.publishedAt
      if (u.engagement) it.engagement = u.engagement
    }
  }
  async saveLabels(labels: Map<string, ItemLabels>) {
    for (const [id, l] of labels) {
      const it = this.items.get(id)
      if (it) it.labels = structuredClone(l)
    }
  }
  async allItems(topicId: string) {
    return [...this.items.values()].filter((i) => i.topicId === topicId).map((i) => structuredClone(i))
  }
  async searchCallsSince(since: Date) {
    return [...this.runs.values()].filter((r) => new Date(r.startedAt) >= since).reduce((s, r) => s + r.searchCalls, 0)
  }
  async failStaleRuns(olderThanMs: number) {
    let n = 0
    for (const r of this.runs.values()) {
      if (r.status === "running" && Date.now() - new Date(r.startedAt).getTime() > olderThanMs) {
        r.status = "failed"
        r.error = "The scan stopped unexpectedly (server restart or time limit)"
        r.completedAt = new Date().toISOString()
        n++
      }
    }
    return n
  }
}
