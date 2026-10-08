/**
 * Framework-agnostic request handling for /api/listening. The Express route
 * (local dev) and api/listening.ts (Vercel) are thin adapters over this, so
 * the two cannot drift apart in behaviour.
 */
import { DAILY_SEARCH_BUDGET } from "./config.js"
import { configuredSources } from "./deps.js"
import { abortLocalRun, executeRun, startRun, TopicNotFound, type EngineDeps } from "./engine.js"
import { MAX_SEARCH_CALLS_PER_RUN } from "./harvest.js"
import { itemViews } from "./report.js"
import { ActiveRunError, type Store } from "./store.js"
import type { RunEvent, RunTrigger, TimeWindow, TopicRow } from "./types.js"

export interface ServiceCtx {
  store: Store
  deps: () => EngineDeps
  userEmail: string
}

export type Result<T> = { ok: true; body: T } | { ok: false; status: number; error: string; code?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WINDOWS: TimeWindow[] = ["3m", "1y", "any"]

/** Start of today in Pacific time, when Google's daily allowance resets. */
export function pacificMidnight(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offset)
}

export async function budget(store: Store): Promise<{ used: number; limit: number; resetsAt: string; scansLeft: number }> {
  const since = pacificMidnight()
  const used = await store.searchCallsSince(since).catch(() => 0)
  const resetsAt = new Date(since.getTime() + 24 * 3600e3).toISOString()
  const scansLeft = Math.max(0, Math.floor((DAILY_SEARCH_BUDGET - used) / 20))
  return { used, limit: DAILY_SEARCH_BUDGET, resetsAt, scansLeft }
}

export async function access(ctx: ServiceCtx) {
  return { allowed: true, sources: configuredSources(), budget: await budget(ctx.store) }
}

export async function listTopics(ctx: ServiceCtx): Promise<{ topics: TopicRow[] }> {
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  return { topics: await ctx.store.listTopics() }
}

export async function topicDetail(ctx: ServiceCtx, id: string): Promise<Result<unknown>> {
  if (!UUID.test(id)) return { ok: false, status: 404, error: "Topic not found" }
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  const topic = await ctx.store.getTopic(id)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const [items, runs, activeRun] = await Promise.all([
    ctx.store.allItems(id),
    ctx.store.listRuns(id),
    ctx.store.getActiveRun(id),
  ])
  return { ok: true, body: { topic, items: itemViews(items, topic.report), runs, activeRun } }
}

export async function removeTopic(ctx: ServiceCtx, id: string): Promise<Result<{ ok: true }>> {
  if (!UUID.test(id)) return { ok: false, status: 404, error: "Topic not found" }
  const active = await ctx.store.getActiveRun(id)
  if (active) return { ok: false, status: 409, error: "Cancel the running scan before deleting this topic", code: "active_run" }
  await ctx.store.deleteTopic(id)
  return { ok: true, body: { ok: true } }
}

export async function cancelRun(ctx: ServiceCtx, runId: string): Promise<Result<{ ok: true }>> {
  if (!UUID.test(runId)) return { ok: false, status: 404, error: "Scan not found" }
  const run = await ctx.store.getRun(runId)
  if (!run) return { ok: false, status: 404, error: "Scan not found" }
  await ctx.store.requestCancel(runId)
  abortLocalRun(runId)
  return { ok: true, body: { ok: true } }
}

export async function runStatus(ctx: ServiceCtx, runId: string): Promise<Result<unknown>> {
  if (!UUID.test(runId)) return { ok: false, status: 404, error: "Scan not found" }
  const run = await ctx.store.getRun(runId)
  return run ? { ok: true, body: { run } } : { ok: false, status: 404, error: "Scan not found" }
}

export type RunRequest =
  | { trigger: "initial"; query: unknown; timeWindow: unknown }
  | { trigger: "rescan" | "rebuild"; topicId: string }

export interface PreparedRun {
  topic: TopicRow
  runId: string
  trigger: RunTrigger
}

export function cleanQuery(q: unknown): string | null {
  if (typeof q !== "string") return null
  const t = q.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim()
  if (t.length < 2 || t.length > 140) return null
  return t
}

/** Validate, check the allowance, and create the run row. Errors return before any stream opens. */
export async function prepareRun(ctx: ServiceCtx, req: RunRequest): Promise<Result<PreparedRun>> {
  const sources = configuredSources()
  if (!sources.model) return { ok: false, status: 503, error: "The analysis model is not configured on this server", code: "no_model" }
  if (req.trigger !== "rebuild") {
    if (!sources.search && !sources.youtube) {
      return { ok: false, status: 503, error: "No search source is configured on this server", code: "no_sources" }
    }
    const b = await budget(ctx.store)
    // Google's free allowance only blocks a scan when there is no paid backup.
    if (!sources.serper && b.used + MAX_SEARCH_CALLS_PER_RUN > b.limit + 4) {
      return {
        ok: false,
        status: 429,
        error: `Today's Google search allowance is nearly used (${b.used} of ${b.limit}). It resets at midnight Pacific. You can still rebuild existing topics.`,
        code: "budget",
      }
    }
  }
  try {
    if (req.trigger === "initial") {
      const query = cleanQuery(req.query)
      if (!query) return { ok: false, status: 400, error: "Enter a topic between 2 and 140 characters", code: "bad_query" }
      const tw = WINDOWS.includes(req.timeWindow as TimeWindow) ? (req.timeWindow as TimeWindow) : "1y"
      const r = await startRun(ctx.store, { trigger: "initial", createdBy: ctx.userEmail, query, timeWindow: tw })
      return { ok: true, body: { ...r, trigger: "initial" } }
    }
    if (!UUID.test(req.topicId)) return { ok: false, status: 404, error: "Topic not found" }
    const r = await startRun(ctx.store, { trigger: req.trigger, createdBy: ctx.userEmail, topicId: req.topicId })
    return { ok: true, body: { ...r, trigger: req.trigger } }
  } catch (err) {
    if (err instanceof TopicNotFound) return { ok: false, status: 404, error: "Topic not found" }
    if (err instanceof ActiveRunError) return { ok: false, status: 409, error: "A scan is already running for this topic", code: "active_run" }
    throw err
  }
}

export interface Sink {
  write(e: RunEvent): void
}

/**
 * Execute a prepared run, streaming events to the sink with a heartbeat.
 * The run does not stop if the browser goes away; only Cancel stops it.
 */
export async function streamRun(ctx: ServiceCtx, prepared: PreparedRun, sink: Sink): Promise<void> {
  const safeWrite = (e: RunEvent) => {
    try {
      sink.write(e)
    } catch {
      // Browser gone: keep working, the result is saved either way.
    }
  }
  const ping = setInterval(() => safeWrite({ type: "ping" }), 10_000)
  try {
    await executeRun(ctx.deps(), prepared, safeWrite)
  } finally {
    clearInterval(ping)
  }
}
