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
import type { IdeaStatus, RunEvent, RunTrigger, SavedIdea, SavedIdeaSource, TimeWindow, TopicRow } from "./types.js"

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

/**
 * Topics belong to the person who created them: each user lists, opens,
 * rescans, cancels and deletes only their own. Someone else's topic answers
 * "not found", so its existence never leaks, unless its creator shared it:
 * then everyone with access can open and export it (read only). The Google
 * allowance stays shared: it is one project-wide quota.
 */
export function ownsTopic(topic: Pick<TopicRow, "createdBy">, userEmail: string): boolean {
  const who = userEmail.trim().toLowerCase()
  return who.length > 0 && topic.createdBy.trim().toLowerCase() === who
}

async function ownTopic(ctx: ServiceCtx, id: string): Promise<TopicRow | null> {
  if (!UUID.test(id)) return null
  const topic = await ctx.store.getTopic(id)
  return topic && ownsTopic(topic, ctx.userEmail) ? topic : null
}

/** Your own topic, or one someone shared. */
async function readableTopic(ctx: ServiceCtx, id: string): Promise<TopicRow | null> {
  if (!UUID.test(id)) return null
  const topic = await ctx.store.getTopic(id)
  return topic && (ownsTopic(topic, ctx.userEmail) || topic.shared) ? topic : null
}

async function ownRun(ctx: ServiceCtx, runId: string) {
  if (!UUID.test(runId)) return null
  const run = await ctx.store.getRun(runId)
  if (!run) return null
  return (await ownTopic(ctx, run.topicId)) ? run : null
}

export async function listTopics(ctx: ServiceCtx): Promise<{ topics: TopicRow[]; shared: TopicRow[] }> {
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  const [topics, shared] = await Promise.all([ctx.store.listTopics(ctx.userEmail), ctx.store.listSharedTopics(ctx.userEmail)])
  return { topics, shared }
}

export async function topicDetail(ctx: ServiceCtx, id: string): Promise<Result<unknown>> {
  if (!UUID.test(id)) return { ok: false, status: 404, error: "Topic not found" }
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  const topic = await readableTopic(ctx, id)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const [items, runs, activeRun, saved, board] = await Promise.all([
    ctx.store.allItems(id),
    ctx.store.listRuns(id),
    ctx.store.getActiveRun(id),
    ctx.store.savedFingerprints(ctx.userEmail, id),
    ctx.store.listSavedIdeas(ctx.userEmail),
  ])
  // Which of the report's ideas this person already saved: report idea id -> saved idea id.
  const savedIdeas: Record<string, string> = {}
  for (const idea of topic.report?.ideas ?? []) {
    const fp = ideaFingerprint(id, idea.headline)
    if (!saved.has(fp)) continue
    const row = board.find((b) => b.fingerprint === fp)
    if (row) savedIdeas[idea.id] = row.id
  }
  const role = ownsTopic(topic, ctx.userEmail) ? "owner" : "viewer"
  return { ok: true, body: { topic, role, items: itemViews(items, topic.report), runs, activeRun, savedIdeas } }
}

/** Owner only: make a topic readable by everyone with access, or private again. */
export async function shareTopic(ctx: ServiceCtx, id: string, shared: unknown): Promise<Result<{ shared: boolean }>> {
  if (typeof shared !== "boolean") return { ok: false, status: 400, error: "Say whether to share: true or false", code: "bad_share" }
  if (!(await ownTopic(ctx, id))) return { ok: false, status: 404, error: "Topic not found" }
  await ctx.store.setShared(id, shared)
  return { ok: true, body: { shared } }
}

// ─── Idea board ─────────────────────────────────────────────────────────────

const STATUSES: IdeaStatus[] = ["new", "pitched", "in_progress", "published", "dropped"]

/** One save per idea per person: the topic plus the headline, ignoring case and punctuation. */
export function ideaFingerprint(topicId: string, headline: string): string {
  return `${topicId}:${headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`
}

export async function listIdeas(ctx: ServiceCtx): Promise<{ ideas: SavedIdea[] }> {
  return { ideas: await ctx.store.listSavedIdeas(ctx.userEmail) }
}

/** Save a frozen copy of one of a topic's current ideas, with its sources, to this person's board. */
export async function saveIdea(ctx: ServiceCtx, body: { topicId?: unknown; ideaId?: unknown }): Promise<Result<{ idea: SavedIdea }>> {
  if (typeof body.topicId !== "string" || typeof body.ideaId !== "string") return { ok: false, status: 400, error: "Choose an idea to save", code: "bad_idea" }
  const topic = await readableTopic(ctx, body.topicId)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const idea = topic.report?.ideas.find((i) => i.id === body.ideaId)
  if (!idea) return { ok: false, status: 404, error: "That idea is no longer in this report. Reload the page.", code: "idea_gone" }
  const items = new Map((await ctx.store.allItems(topic.id)).map((it) => [it.id, it]))
  const quotes = new Map((topic.report?.quotes ?? []).map((q) => [q.itemId, q.text]))
  const sources: SavedIdeaSource[] = idea.evidenceItemIds.flatMap((id) => {
    const it = items.get(id)
    if (!it) return []
    const excerpt = it.labels?.quote ?? quotes.get(id) ?? (it.kind === "comment" || !it.title ? it.text : `${it.title}: ${it.text}`)
    const text = excerpt.replace(/\s+/g, " ").trim()
    return [{ url: it.url, platform: it.platform, text: text.length > 300 ? text.slice(0, 300).replace(/\s+\S*$/, "") + "..." : text, publishedAt: it.publishedAt ?? null }]
  })
  const subtopic = idea.subtopicId ? topic.report?.subtopics.find((s) => s.id === idea.subtopicId)?.name ?? null : null
  const saved = await ctx.store.saveIdea({
    createdBy: ctx.userEmail,
    topicId: topic.id,
    topicQuery: topic.query,
    fingerprint: ideaFingerprint(topic.id, idea.headline),
    idea: { headline: idea.headline, angle: idea.angle, audience: idea.audience, format: idea.format, whyNow: idea.whyNow, outline: idea.outline, subtopic },
    sources,
  })
  return { ok: true, body: { idea: saved } }
}

async function ownIdea(ctx: ServiceCtx, id: string): Promise<SavedIdea | null> {
  if (!UUID.test(id)) return null
  const idea = await ctx.store.getSavedIdea(id)
  return idea && ownsTopic(idea, ctx.userEmail) ? idea : null
}

export async function setIdeaStatus(ctx: ServiceCtx, id: string, status: unknown): Promise<Result<{ status: IdeaStatus }>> {
  if (!STATUSES.includes(status as IdeaStatus)) return { ok: false, status: 400, error: "Unknown status", code: "bad_status" }
  if (!(await ownIdea(ctx, id))) return { ok: false, status: 404, error: "Idea not found" }
  await ctx.store.setIdeaStatus(id, status as IdeaStatus)
  return { ok: true, body: { status: status as IdeaStatus } }
}

export async function removeIdea(ctx: ServiceCtx, id: string): Promise<Result<{ ok: true }>> {
  if (!(await ownIdea(ctx, id))) return { ok: false, status: 404, error: "Idea not found" }
  await ctx.store.deleteSavedIdea(id)
  return { ok: true, body: { ok: true } }
}

export async function removeTopic(ctx: ServiceCtx, id: string): Promise<Result<{ ok: true }>> {
  if (!(await ownTopic(ctx, id))) return { ok: false, status: 404, error: "Topic not found" }
  const active = await ctx.store.getActiveRun(id)
  if (active) return { ok: false, status: 409, error: "Cancel the running scan before deleting this topic", code: "active_run" }
  await ctx.store.deleteTopic(id)
  return { ok: true, body: { ok: true } }
}

export async function cancelRun(ctx: ServiceCtx, runId: string): Promise<Result<{ ok: true }>> {
  if (!(await ownRun(ctx, runId))) return { ok: false, status: 404, error: "Scan not found" }
  await ctx.store.requestCancel(runId)
  abortLocalRun(runId)
  return { ok: true, body: { ok: true } }
}

export async function runStatus(ctx: ServiceCtx, runId: string): Promise<Result<unknown>> {
  const run = await ownRun(ctx, runId)
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
    if (!(await ownTopic(ctx, req.topicId))) return { ok: false, status: 404, error: "Topic not found" }
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
