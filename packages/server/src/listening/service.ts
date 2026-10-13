/**
 * Framework-agnostic request handling for /api/listening. The Express route
 * (local dev) and api/listening.ts (Vercel) are thin adapters over this, so
 * the two cannot drift apart in behaviour.
 */
import { isListeningAdmin, listeningVisibility, seesEveryTopic } from "./access.js"
import { DAILY_SEARCH_BUDGET, PLATFORM_LABEL } from "./config.js"
import { engagementOf, isPublicConversation } from "./metrics.js"
import { entityOf } from "./plan.js"
import { configuredSources } from "./deps.js"
import { DRAFT_KINDS, DraftError, writeDraft } from "./drafts.js"
import { abortLocalRun, executeRun, startRun, TopicNotFound, type EngineDeps } from "./engine.js"
import { MAX_SEARCH_CALLS_PER_RUN } from "./harvest.js"
import { LlmError } from "./llm.js"
import { itemViews } from "./report.js"
import { verifyIdeas, writeMoreIdeas, type SubtopicInput } from "./synthesize.js"
import { ideaTaste } from "./taste.js"
import { ActiveRunError, type Store } from "./store.js"
import { TIME_WINDOWS, validateCustomRange } from "./window.js"
import type { ContentIdea, DraftKind, IdeaDraft, IdeaStatus, IdeaVote, RunEvent, RunTrigger, SavedIdea, SavedIdeaSource, TimeWindow, TopicRow } from "./types.js"

export interface ServiceCtx {
  store: Store
  deps: () => EngineDeps
  userEmail: string
}

export type Result<T> = { ok: true; body: T } | { ok: false; status: number; error: string; code?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export interface UsageScan {
  who: string
  startedAt: string
  trigger: RunTrigger
  status: string
  searchCalls: number
  /** The topic's name, or null when it is someone's private topic you cannot open. */
  topic: string | null
  topicId: string | null
}

/**
 * Who has scanned: today's scans (the shared Google allowance resets at
 * midnight Pacific) and a seven-day tally per person, so the team can see
 * what is left before starting a big scan. Refreshes use no searches and are
 * left out. A private topic's name shows only to those who can open it.
 */
export async function usage(ctx: ServiceCtx): Promise<{
  budget: Awaited<ReturnType<typeof budget>>
  today: UsageScan[]
  week: Array<{ who: string; scans: number; searchCalls: number }>
}> {
  const since = pacificMidnight()
  const everything = seesEveryTopic(ctx.userEmail)
  const [b, runs] = await Promise.all([budget(ctx.store), ctx.store.runsSince(new Date(Date.now() - 7 * 86400e3))])
  const scans = runs.filter((r) => r.trigger !== "rebuild")
  const today = scans
    .filter((r) => new Date(r.startedAt) >= since)
    .map((r) => {
      const canSee = everything || r.shared || ownsTopic({ createdBy: r.topicOwner }, ctx.userEmail)
      return { who: r.createdBy, startedAt: r.startedAt, trigger: r.trigger, status: r.status, searchCalls: r.searchCalls, topic: canSee ? r.query : null, topicId: canSee ? r.topicId : null }
    })
  const tally = new Map<string, { who: string; scans: number; searchCalls: number }>()
  for (const r of scans) {
    const who = r.createdBy.trim().toLowerCase()
    const t = tally.get(who) ?? { who, scans: 0, searchCalls: 0 }
    t.scans++
    t.searchCalls += r.searchCalls
    tally.set(who, t)
  }
  return { budget: b, today, week: [...tally.values()].sort((a, c) => c.scans - a.scans || a.who.localeCompare(c.who)) }
}

export async function access(ctx: ServiceCtx) {
  return { allowed: true, admin: isListeningAdmin(ctx.userEmail), visibility: listeningVisibility(), sources: configuredSources(), budget: await budget(ctx.store) }
}

/**
 * Topics belong to the person who created them: each user lists, opens,
 * rescans, cancels and deletes only their own. Someone else's topic answers
 * "not found", so its existence never leaks, unless its creator shared it:
 * then everyone with access can open and export it (read only). Admins
 * (access.ts) can read every topic, shared or not, also read only. The Google
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

/** Your own topic, one someone shared, or anyone's when you see every topic (team visibility, or an admin). */
async function readableTopic(ctx: ServiceCtx, id: string): Promise<TopicRow | null> {
  if (!UUID.test(id)) return null
  const topic = await ctx.store.getTopic(id)
  return topic && (ownsTopic(topic, ctx.userEmail) || topic.shared || seesEveryTopic(ctx.userEmail)) ? topic : null
}

async function ownRun(ctx: ServiceCtx, runId: string) {
  if (!UUID.test(runId)) return null
  const run = await ctx.store.getRun(runId)
  if (!run) return null
  return (await ownTopic(ctx, run.topicId)) ? run : null
}

/**
 * Your topics, topics others shared, and, for whoever sees every topic, every
 * other topic (`team`, shared or private), so they see every scan ever run.
 */
export async function listTopics(ctx: ServiceCtx): Promise<{ topics: TopicRow[]; shared: TopicRow[]; team?: TopicRow[] }> {
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  const everything = seesEveryTopic(ctx.userEmail)
  const [topics, shared, team] = await Promise.all([
    ctx.store.listTopics(ctx.userEmail),
    ctx.store.listSharedTopics(ctx.userEmail),
    everything ? ctx.store.listOthersTopics(ctx.userEmail) : Promise.resolve(undefined),
  ])
  return team ? { topics, shared, team } : { topics, shared }
}

export async function topicDetail(ctx: ServiceCtx, id: string): Promise<Result<unknown>> {
  if (!UUID.test(id)) return { ok: false, status: 404, error: "Topic not found" }
  await ctx.store.failStaleRuns(6 * 60 * 1000).catch(() => 0)
  const topic = await readableTopic(ctx, id)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const [items, runs, activeRun, saved, board, voted] = await Promise.all([
    ctx.store.allItems(id),
    ctx.store.listRuns(id),
    ctx.store.getActiveRun(id),
    ctx.store.savedFingerprints(ctx.userEmail, id),
    ctx.store.listSavedIdeas(ctx.userEmail),
    ctx.store.listVotes({ topicId: id, createdBy: ctx.userEmail, limit: 200 }),
  ])
  // Which of the report's ideas this person already saved: report idea id -> saved idea id.
  const savedIdeas: Record<string, string> = {}
  for (const idea of topic.report?.ideas ?? []) {
    const fp = ideaFingerprint(id, idea.headline)
    if (!saved.has(fp)) continue
    const row = board.find((b) => b.fingerprint === fp)
    if (row) savedIdeas[idea.id] = row.id
  }
  // This person's thumbs on the report's ideas: report idea id -> 1 or -1.
  const voteOf = new Map(voted.map((v) => [v.fingerprint, v.vote]))
  const votes: Record<string, IdeaVote> = {}
  for (const idea of topic.report?.ideas ?? []) {
    const v = voteOf.get(ideaFingerprint(id, idea.headline))
    if (v) votes[idea.id] = v
  }
  const role = ownsTopic(topic, ctx.userEmail) ? "owner" : "viewer"
  const drafts = draftsByIdea(await ctx.store.listDrafts(Object.values(savedIdeas)))
  return { ok: true, body: { topic, role, visibility: listeningVisibility(), items: itemViews(items, topic.report), runs, activeRun, savedIdeas, drafts, votes } }
}

/** One relevant source with its stored text (clipped at LIMITS.maxItemChars) and labels, for the sources export. */
export interface SourceRow {
  url: string
  platform: string
  kind: string
  title: string
  text: string
  author: string | null
  publishedAt: string | null
  /** Counted in the report's figures (a person's post mainly about the topic). */
  counted: boolean
  /** Why it is not counted, or "". */
  notCounted: string
  sentiment: string
  audience: string
  subtopic: string
  question: string
}

/**
 * Every relevant source for a topic you can read, with its stored text, so the list
 * can be handed to another tool for deeper analysis. Off-topic items are left out.
 */
export async function topicSources(ctx: ServiceCtx, id: string): Promise<Result<{ sources: SourceRow[] }>> {
  const topic = await readableTopic(ctx, id)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const items = await ctx.store.allItems(id)
  const subOf = new Map<string, string>()
  for (const s of topic.report?.subtopics ?? []) for (const itemId of s.itemIds) subOf.set(itemId, s.name)
  const entity = entityOf(topic.plan)
  const rows = items
    .filter((it) => it.labels?.relevant)
    .map((it) => {
      const l = it.labels!
      const counted = isPublicConversation(it)
      const notCounted = counted
        ? ""
        : it.platform === "news" || l.speaker === "media"
          ? "news outlet"
          : l.speaker === "self"
            ? `${entity ?? "the institution"}'s own account`
            : l.speaker === "organization"
              ? "organization"
              : l.about === false
                ? "passing mention"
                : "not yet analysed under the current rules"
      return {
        row: {
          url: it.url,
          platform: PLATFORM_LABEL[it.platform] ?? it.platform,
          kind: it.kind,
          title: it.title,
          text: it.text,
          author: it.author ?? null,
          publishedAt: it.publishedAt ?? null,
          counted,
          notCounted,
          sentiment: l.sentiment,
          audience: l.audience,
          subtopic: subOf.get(it.id) ?? "",
          question: l.question ?? "",
        } satisfies SourceRow,
        engagement: engagementOf(it),
      }
    })
    .sort((a, b) => Number(b.row.counted) - Number(a.row.counted) || b.engagement - a.engagement)
  return { ok: true, body: { sources: rows.map((r) => r.row) } }
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

/** Saved idea id -> its drafts, oldest first. */
function draftsByIdea(drafts: IdeaDraft[]): Record<string, IdeaDraft[]> {
  const out: Record<string, IdeaDraft[]> = {}
  for (const d of drafts) (out[d.savedIdeaId] ??= []).push(d)
  return out
}

export async function listIdeas(ctx: ServiceCtx): Promise<{ ideas: SavedIdea[]; drafts: Record<string, IdeaDraft[]> }> {
  const ideas = await ctx.store.listSavedIdeas(ctx.userEmail)
  return { ideas, drafts: draftsByIdea(await ctx.store.listDrafts(ideas.map((i) => i.id))) }
}

type IdeaSnapshot = Omit<SavedIdea, "id" | "status" | "createdAt" | "updatedAt">

/** A frozen copy of one of a topic's current ideas with its sources, ready to save. */
async function snapshotIdea(ctx: ServiceCtx, body: { topicId?: unknown; ideaId?: unknown }): Promise<Result<IdeaSnapshot>> {
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
  return {
    ok: true,
    body: {
      createdBy: ctx.userEmail,
      topicId: topic.id,
      topicQuery: topic.query,
      fingerprint: ideaFingerprint(topic.id, idea.headline),
      idea: { headline: idea.headline, angle: idea.angle, audience: idea.audience, format: idea.format, whyNow: idea.whyNow, outline: idea.outline, subtopic },
      sources,
    },
  }
}

/** Save a frozen copy of one of a topic's current ideas, with its sources, to this person's board. */
export async function saveIdea(ctx: ServiceCtx, body: { topicId?: unknown; ideaId?: unknown }): Promise<Result<{ idea: SavedIdea }>> {
  const snap = await snapshotIdea(ctx, body)
  if (!snap.ok) return snap
  return { ok: true, body: { idea: await ctx.store.saveIdea(snap.body) } }
}

async function ownIdea(ctx: ServiceCtx, id: string): Promise<SavedIdea | null> {
  if (!UUID.test(id)) return null
  const idea = await ctx.store.getSavedIdea(id)
  return idea && ownsTopic(idea, ctx.userEmail) ? idea : null
}

/**
 * Write a blog outline, a LinkedIn post or headlines from an idea. Drafts hang
 * off the saved copy, so drafting an idea straight from a topic also saves it
 * to the board; that keeps a draft attached to exactly the idea and posts it
 * was written from, whatever a later rescan does to the topic. The idea is
 * saved only once the draft exists, so a failed draft leaves nothing behind.
 * One draft per kind per saved idea: asking again returns it, `fresh` writes a
 * new one over it. Uses the analysis model only, never a search.
 */
export async function draftIdea(
  ctx: ServiceCtx,
  body: { savedId?: unknown; topicId?: unknown; ideaId?: unknown; kind?: unknown; fresh?: unknown },
): Promise<Result<{ idea: SavedIdea; draft: IdeaDraft }>> {
  if (!DRAFT_KINDS.includes(body.kind as DraftKind)) return { ok: false, status: 400, error: "Choose what to draft: a blog outline, a LinkedIn post or headlines", code: "bad_kind" }
  const kind = body.kind as DraftKind
  // The idea to write from: the saved copy when there is one, else a snapshot not yet on the board.
  let saved: SavedIdea | null = null
  let snapshot: IdeaSnapshot | null = null
  if (typeof body.savedId === "string") {
    saved = await ownIdea(ctx, body.savedId)
    if (!saved) return { ok: false, status: 404, error: "Idea not found" }
  } else {
    const snap = await snapshotIdea(ctx, { topicId: body.topicId, ideaId: body.ideaId })
    if (!snap.ok) return snap
    snapshot = snap.body
    saved = (await ctx.store.listSavedIdeas(ctx.userEmail)).find((i) => i.fingerprint === snap.body.fingerprint) ?? null
  }
  if (saved && body.fresh !== true) {
    const existing = (await ctx.store.listDrafts([saved.id])).find((d) => d.kind === kind)
    if (existing) return { ok: true, body: { idea: saved, draft: existing } }
  }
  if (!configuredSources().model) return { ok: false, status: 503, error: "The analysis model is not configured on this server", code: "no_model" }
  try {
    const now = new Date().toISOString()
    const content = await writeDraft(ctx.deps().llm, kind, saved ?? { ...snapshot!, id: "", status: "new", createdAt: now, updatedAt: now })
    const idea = saved ?? (await ctx.store.saveIdea(snapshot!))
    return { ok: true, body: { idea, draft: await ctx.store.putDraft({ savedIdeaId: idea.id, kind, content }) } }
  } catch (err) {
    if (err instanceof LlmError || err instanceof DraftError) {
      console.error("[listening] draft", kind, err.message)
      return { ok: false, status: 502, error: "The draft could not be written this time. Try again.", code: "draft_failed" }
    }
    throw err
  }
}

/**
 * Thumbs up (1), thumbs down (-1) or clear (0) on one of a topic's ideas, for
 * anyone who can read the topic. One vote per idea per person. Votes steer the
 * ideas written next (see taste.ts); they change nothing already on the page.
 */
export async function rateIdea(ctx: ServiceCtx, body: { topicId?: unknown; ideaId?: unknown; vote?: unknown }): Promise<Result<{ vote: IdeaVote | null }>> {
  if (typeof body.topicId !== "string" || typeof body.ideaId !== "string" || (body.vote !== 1 && body.vote !== -1 && body.vote !== 0)) {
    return { ok: false, status: 400, error: "Choose an idea and a thumbs up or a thumbs down", code: "bad_vote" }
  }
  const topic = await readableTopic(ctx, body.topicId)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const idea = topic.report?.ideas.find((i) => i.id === body.ideaId)
  if (!idea) return { ok: false, status: 404, error: "That idea is no longer in this report. Reload the page.", code: "idea_gone" }
  const fingerprint = ideaFingerprint(topic.id, idea.headline)
  if (body.vote === 0) {
    await ctx.store.clearVote(ctx.userEmail, fingerprint)
    return { ok: true, body: { vote: null } }
  }
  await ctx.store.setVote({
    createdBy: ctx.userEmail,
    topicId: topic.id,
    fingerprint,
    vote: body.vote,
    idea: { headline: idea.headline, angle: idea.angle, format: idea.format, audience: idea.audience },
  })
  return { ok: true, body: { vote: body.vote } }
}

/** Ideas written per "More ideas" request, and the most a topic holds. */
export const MORE_IDEAS_PER_ASK = 4
export const MAX_IDEAS_PER_TOPIC = 24

/**
 * Owner only: write more ideas from the posts already collected, each a
 * different angle from the ones the topic has, steered by what the team liked
 * and passed on. Every new idea goes through the same second check against
 * its cited posts as a scan's ideas; if that check cannot run, nothing is
 * added. Uses the analysis model only, never a search. `added` is empty when
 * no further idea holds up.
 */
export async function moreIdeas(ctx: ServiceCtx, id: string): Promise<Result<{ added: ContentIdea[]; ideas: ContentIdea[] }>> {
  const topic = await ownTopic(ctx, id)
  if (!topic) return { ok: false, status: 404, error: "Topic not found" }
  const report = topic.report
  if (!report) return { ok: false, status: 409, error: "Scan this topic first", code: "no_report" }
  if (report.version !== 2) return { ok: false, status: 409, error: "Refresh this topic's analysis first, then ask for more ideas", code: "legacy_report" }
  if (await ctx.store.getActiveRun(id)) return { ok: false, status: 409, error: "A scan is running for this topic. Ask again when it finishes.", code: "active_run" }
  if (report.ideas.length >= MAX_IDEAS_PER_TOPIC) {
    return { ok: false, status: 409, error: `This topic already has ${report.ideas.length} ideas. Save the ones worth keeping, then rescan for a fresh set.`, code: "idea_limit" }
  }
  if (!configuredSources().model) return { ok: false, status: 503, error: "The analysis model is not configured on this server", code: "no_model" }

  const items = await ctx.store.allItems(id)
  const conv = new Map(items.filter(isPublicConversation).map((it) => [it.id, it]))
  const subtopics: SubtopicInput[] = report.subtopics
    .map((s) => ({ id: s.id, name: s.name, description: s.summary, count: s.count, share: s.share, sentiment: s.sentiment, items: s.itemIds.flatMap((x) => conv.get(x) ?? []) }))
    .filter((s) => s.items.length > 0)
  if (conv.size < 3 || subtopics.length === 0) return { ok: true, body: { added: [], ideas: report.ideas } }

  let checked: ContentIdea[]
  try {
    const llm = ctx.deps().llm
    const taste = await ideaTaste(ctx.store, id, ctx.userEmail).catch(() => null)
    const max = Math.min(MORE_IDEAS_PER_ASK, MAX_IDEAS_PER_TOPIC - report.ideas.length)
    const written = await writeMoreIdeas(llm, { query: topic.query, plan: topic.plan, subtopics, existing: report.ideas, taste, max })
    checked = written.ideas.length ? (await verifyIdeas(llm, topic.query, written.ideas, new Map(items.map((it) => [it.id, it])))).ideas : []
  } catch (err) {
    if (err instanceof LlmError) {
      console.error("[listening] more ideas", err.message)
      return { ok: false, status: 502, error: "More ideas could not be written this time. Try again.", code: "ideas_failed" }
    }
    throw err
  }
  if (checked.length === 0) return { ok: true, body: { added: [], ideas: report.ideas } }

  // A scan that started or finished meanwhile owns the report now; adding to a stale copy would undo it.
  const now = await ctx.store.getTopic(id)
  if (!now?.report || now.report.generatedAt !== report.generatedAt || now.report.ideas.length !== report.ideas.length || (await ctx.store.getActiveRun(id))) {
    return { ok: false, status: 409, error: "This topic changed while the ideas were being written. Ask again.", code: "changed" }
  }
  const taken = new Set(report.ideas.map((i) => i.id))
  let n = report.ideas.length
  const added = checked.map((idea) => {
    do n++
    while (taken.has(`idea${n}`))
    taken.add(`idea${n}`)
    return { ...idea, id: `idea${n}`, added: true }
  })
  const ideas = [...report.ideas, ...added]
  await ctx.store.updateTopic(id, { report: { ...now.report, ideas } })
  return { ok: true, body: { added, ideas } }
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
  | { trigger: "initial"; query: unknown; timeWindow: unknown; from?: unknown; to?: unknown }
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
      const tw = TIME_WINDOWS.includes(req.timeWindow as TimeWindow) ? (req.timeWindow as TimeWindow) : "1y"
      let range: { from: string; to: string } | null = null
      if (tw === "custom") {
        const v = validateCustomRange(req.from, req.to)
        if (!v.ok) return { ok: false, status: 400, error: v.error, code: "bad_range" }
        range = { from: v.from, to: v.to }
      }
      const r = await startRun(ctx.store, { trigger: "initial", createdBy: ctx.userEmail, query, timeWindow: tw, windowFrom: range?.from ?? null, windowTo: range?.to ?? null })
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
