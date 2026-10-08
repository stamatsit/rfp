/**
 * Harvest: run every lane for a plan and dedupe against what the topic already
 * holds. Threads are read in full later (deepRead), once labels say which ones
 * are really about the topic: reading by engagement alone opened eight
 * off-topic threads for one institution ("COE" car permits, visa forms).
 *
 * First run: every phrasing x every site group at page 1, plus a second
 * Reddit page for the main phrasing. Rescan: page 1 again for the main
 * phrasing (catches new posts), page 1 for phrasings added this run, then one
 * page deeper per (phrasing, group) via stored cursors, capped per run.
 */
import { LIMITS, SITE_GROUPS, TIME_WINDOW_RESTRICT } from "./config.js"
import type { NewsSource } from "./sources/news.js"
import type { SearchPage, SearchProvider } from "./sources/pse.js"
import { isReadable, type PageReader } from "./sources/reader.js"
import type { YoutubeSource } from "./sources/youtube.js"
import type { Engagement, Item, LaneResult, Plan, RawItem, RunTrigger, TimeWindow } from "./types.js"
import { describeError, mapLimit } from "./util/http.js"
import { normForMatch, queryTokens } from "./util/text.js"
import { canonicalUrl, isListingPage, platformOf, youtubeVideoId } from "./util/url.js"

export const MAX_SEARCH_CALLS_PER_RUN = 24

export interface HarvestDeps {
  search: SearchProvider | null
  youtube: YoutubeSource | null
  news: NewsSource | null
  reader: PageReader | null
}

export interface HarvestInput {
  query: string
  plan: Plan
  runId: string
  timeWindow: TimeWindow
  trigger: RunTrigger
  existing: Set<string>
  signal?: AbortSignal
  onLane?: (lane: LaneResult) => void
}

export interface HarvestOutput {
  items: Array<RawItem & { canonicalUrl: string }>
  plan: Plan
  lanes: LaneResult[]
  searchCalls: number
  serperCalls: number
  youtubeUnits: number
  notes: string[]
}

interface Job {
  searchIndex: number
  groupId: string
  start: number
  moveCursor: boolean
}

export function buildSearchJobs(plan: Plan, trigger: RunTrigger, runId: string): Job[] {
  const jobs: Job[] = []
  const groups = SITE_GROUPS.map((g) => g.id)
  if (trigger === "initial") {
    plan.searches.forEach((_, i) => groups.forEach((g) => jobs.push({ searchIndex: i, groupId: g, start: 1, moveCursor: true })))
    for (let p = 1; p <= LIMITS.redditExtraPages; p++) jobs.push({ searchIndex: 0, groupId: "reddit", start: 1 + 10 * p, moveCursor: true })
    return jobs.slice(0, MAX_SEARCH_CALLS_PER_RUN)
  }
  // Rescan: fresh, then new phrasings, then deeper.
  groups.forEach((g) => jobs.push({ searchIndex: 0, groupId: g, start: 1, moveCursor: false }))
  plan.searches.forEach((s, i) => {
    if (s.addedRunId === runId) groups.forEach((g) => jobs.push({ searchIndex: i, groupId: g, start: 1, moveCursor: true }))
  })
  plan.searches.forEach((s, i) => {
    if (s.addedRunId === runId) return
    for (const g of groups) {
      const c = s.cursors?.[g]
      if (typeof c === "number" && c > 1 && c <= 91) jobs.push({ searchIndex: i, groupId: g, start: c, moveCursor: true })
    }
  })
  return jobs.slice(0, MAX_SEARCH_CALLS_PER_RUN)
}

function itemScore(it: RawItem, toks: string[]): number {
  const w: Record<string, number> = { reddit: 3, forums: 3, reviews: 1.5, other: 1 }
  const e = it.engagement
  const eng = Math.log2(1 + (e?.score ?? 0) + 2 * (e?.comments ?? 0) + (e?.likes ?? 0))
  const hay = normForMatch(`${it.title} ${it.text}`)
  const match = toks.length ? toks.filter((t) => hay.includes(t)).length / toks.length : 0
  return (w[it.platform] ?? 1) * 2 + eng + match * 4
}

export async function harvest(deps: HarvestDeps, input: HarvestInput): Promise<HarvestOutput> {
  const plan: Plan = structuredClone(input.plan)
  const lanes: LaneResult[] = []
  const notes: string[] = []
  const raw: RawItem[] = []
  let searchCalls = 0
  let serperCalls = 0
  let youtubeUnits = 0
  const dateRestrict = TIME_WINDOW_RESTRICT[input.timeWindow]

  // ── Google search lanes ──────────────────────────────────────────────────
  const searchTask = (async () => {
    if (!deps.search) {
      for (const g of SITE_GROUPS) {
        const lane: LaneResult = { lane: g.id, label: g.label, status: "skipped", count: 0, ms: 0, note: "Google search is not configured" }
        lanes.push(lane)
        input.onLane?.(lane)
      }
      return
    }
    const jobs = buildSearchJobs(plan, input.trigger, input.runId)
    const perGroup = new Map<string, { remaining: number; ok: number; failed: number; count: number; ms: number; err?: string }>()
    for (const g of SITE_GROUPS) perGroup.set(g.id, { remaining: jobs.filter((j) => j.groupId === g.id).length, ok: 0, failed: 0, count: 0, ms: 0 })
    let quotaOut: string | null = null
    const finishGroup = (gid: string) => {
      const st = perGroup.get(gid)!
      const g = SITE_GROUPS.find((x) => x.id === gid)!
      const status: LaneResult["status"] = st.ok > 0 ? "ok" : st.failed > 0 ? "failed" : "skipped"
      const lane: LaneResult = { lane: gid, label: g.label, status, count: st.count, ms: st.ms }
      if (status === "failed") lane.note = st.err
      else if (status === "skipped") lane.note = quotaOut ?? "nothing new to fetch"
      else if (st.failed) lane.note = `${st.failed} of ${st.ok + st.failed} searches failed: ${st.err}`
      lanes.push(lane)
      input.onLane?.(lane)
    }
    for (const g of SITE_GROUPS) if (perGroup.get(g.id)!.remaining === 0) finishGroup(g.id)

    await mapLimit(jobs, 6, async (job) => {
      const st = perGroup.get(job.groupId)!
      const group = SITE_GROUPS.find((g) => g.id === job.groupId)!
      const search = plan.searches[job.searchIndex]!
      try {
        if (input.signal?.aborted) throw input.signal.reason
        if (quotaOut) throw new Error(quotaOut)
        const t = Date.now()
        const page: SearchPage = await deps.search!.search(
          { q: search.q, sites: group.sites, start: job.start, dateRestrict },
          `search:${job.groupId}:${job.searchIndex}`,
          input.signal,
        )
        if (!page.fromCache) {
          if (page.provider === "serper") serperCalls++
          else searchCalls++
        }
        st.ms = Math.max(st.ms, Date.now() - t)
        st.ok++
        st.count += page.items.length
        raw.push(...page.items)
        search.cursors = search.cursors ?? {}
        if (job.moveCursor || search.cursors[job.groupId] === undefined) search.cursors[job.groupId] = page.nextStart
      } catch (err) {
        if (input.signal?.aborted) throw err
        const msg = describeError(err)
        if (/allowance is used up/.test(msg)) quotaOut = msg
        st.failed++
        st.err = st.err ?? msg
      } finally {
        st.remaining--
        if (st.remaining === 0) finishGroup(job.groupId)
      }
    })
    if (quotaOut) notes.push(quotaOut)
    const providerNote = deps.search.note?.()
    if (providerNote) notes.push(providerNote)
  })()

  // ── YouTube ──────────────────────────────────────────────────────────────
  const youtubeTask = (async () => {
    const t = Date.now()
    if (!deps.youtube) {
      const lane: LaneResult = { lane: "youtube", label: "YouTube", status: "skipped", count: 0, ms: 0, note: "YouTube is not configured" }
      lanes.push(lane)
      input.onLane?.(lane)
      return
    }
    try {
      const known = new Set<string>()
      for (const u of input.existing) {
        const id = youtubeVideoId(u)
        if (id) known.add(id)
      }
      const pageToken = input.trigger === "rescan" ? plan.youtube?.nextPageToken ?? null : null
      const r = await deps.youtube.harvest(plan.searches[0]!.q, input.timeWindow, { pageToken, knownVideoIds: known, signal: input.signal })
      youtubeUnits += r.units
      plan.youtube = { nextPageToken: r.nextPageToken }
      raw.push(...r.items)
      const lane: LaneResult = {
        lane: "youtube",
        label: "YouTube",
        status: "ok",
        count: r.items.length,
        ms: Date.now() - t,
        note: r.notes.length ? r.notes.join("; ") : undefined,
      }
      lanes.push(lane)
      input.onLane?.(lane)
    } catch (err) {
      if (input.signal?.aborted) throw err
      const msg = describeError(err)
      const lane: LaneResult = {
        lane: "youtube",
        label: "YouTube",
        status: "failed",
        count: 0,
        ms: Date.now() - t,
        note: /quota/i.test(msg) ? "daily quota used up" : msg,
      }
      lanes.push(lane)
      input.onLane?.(lane)
    }
  })()

  // ── News ─────────────────────────────────────────────────────────────────
  const newsTask = (async () => {
    const t = Date.now()
    if (!deps.news) return
    try {
      const items = await deps.news.harvest(plan.searches[0]!.q, input.timeWindow, input.signal)
      raw.push(...items)
      const lane: LaneResult = { lane: "news", label: "News", status: "ok", count: items.length, ms: Date.now() - t }
      lanes.push(lane)
      input.onLane?.(lane)
    } catch (err) {
      if (input.signal?.aborted) throw err
      const lane: LaneResult = { lane: "news", label: "News", status: "failed", count: 0, ms: Date.now() - t, note: describeError(err) }
      lanes.push(lane)
      input.onLane?.(lane)
    }
  })()

  await Promise.all([searchTask, youtubeTask, newsTask])

  // ── Dedupe against the batch and the topic ───────────────────────────────
  const fresh = new Map<string, RawItem & { canonicalUrl: string }>()
  for (const it of raw) {
    if (isListingPage(it.url)) continue
    const c = canonicalUrl(it.url)
    if (input.existing.has(c)) continue
    const prev = fresh.get(c)
    if (!prev) fresh.set(c, { ...it, canonicalUrl: c })
    else {
      if (!prev.publishedAt && it.publishedAt) prev.publishedAt = it.publishedAt
      if (!prev.engagement && it.engagement) prev.engagement = it.engagement
      if (it.text.length > prev.text.length && prev.depth === "snippet") prev.text = it.text
    }
  }

  // ── Cap new items per run ────────────────────────────────────────────────
  let items = [...fresh.values()]
  if (items.length > LIMITS.maxNewItemsPerRun) {
    const eng = (it: RawItem) => (it.engagement?.score ?? 0) + (it.engagement?.likes ?? 0) + 2 * (it.engagement?.comments ?? 0)
    const primary = items.filter((i) => i.kind !== "comment")
    const comments = items.filter((i) => i.kind === "comment").sort((a, b) => eng(b) - eng(a))
    items = [...primary, ...comments].slice(0, LIMITS.maxNewItemsPerRun)
    notes.push(`Kept the ${LIMITS.maxNewItemsPerRun} strongest new items this run; a rescan picks up more`)
  }

  const order = ["reddit", "forums", "social", "reviews", "youtube", "news"]
  lanes.sort((a, b) => order.indexOf(a.lane) - order.indexOf(b.lane))
  return { items, plan, lanes, searchCalls, serperCalls, youtubeUnits, notes }
}

/**
 * Threads worth opening in full: labeled as mainly about the topic, still a
 * search snippet, on a site we can read. This scan's finds go first, then
 * earlier ones that never got a turn, strongest first.
 */
export function pickThreads(items: Item[], query: string, runId: string, limit: number = LIMITS.deepReads): Item[] {
  const toks = queryTokens(query)
  return items
    .filter(
      (it) =>
        it.depth === "snippet" &&
        (it.kind === "post" || it.kind === "review") &&
        it.labels?.relevant === true &&
        it.labels.about === true &&
        isReadable(it.url),
    )
    .sort((a, b) => Number(b.firstSeenRunId === runId) - Number(a.firstSeenRunId === runId) || itemScore(b, toks) - itemScore(a, toks))
    .slice(0, limit)
}

export interface ThreadUpdate {
  id: string
  /** The full body, or null when the page held nothing longer than the snippet. */
  text: string | null
  publishedAt: string | null
  engagement: Engagement | null
}

export interface ReadOutcome {
  updates: ThreadUpdate[]
  comments: Array<RawItem & { canonicalUrl: string }>
  fullyRead: number
  notes: string[]
}

/** Open each thread, keep its full body and its replies (as new items). */
export async function deepRead(
  reader: PageReader,
  threads: Item[],
  known: Set<string>,
  signal?: AbortSignal,
  onRead?: (done: number, total: number) => void,
): Promise<ReadOutcome> {
  const updates: ThreadUpdate[] = []
  const comments = new Map<string, RawItem & { canonicalUrl: string }>()
  const notes: string[] = []
  const outcome = new Map<string, { ok: number; failed: number; reasons: Set<string> }>()
  let fullyRead = 0
  let done = 0
  onRead?.(0, threads.length)
  await mapLimit(threads, 4, async (it) => {
    const key = it.platform === "reddit" ? "Reddit threads" : it.platform === "forums" ? "Forum threads" : "Pages"
    const o = outcome.get(key) ?? { ok: 0, failed: 0, reasons: new Set() }
    outcome.set(key, o)
    try {
      const r = await reader.read(it.url, signal)
      updates.push({
        id: it.id,
        text: r.body && r.body.length > it.text.length ? r.body : null,
        publishedAt: !it.publishedAt && r.publishedAt ? r.publishedAt : null,
        engagement: r.engagement && (!it.engagement || Object.keys(it.engagement).length === 0) ? r.engagement : null,
      })
      for (const c of r.comments) {
        const cu = canonicalUrl(c.url)
        if (known.has(cu) || comments.has(cu)) continue
        comments.set(cu, { ...c, platform: c.platform === "other" ? platformOf(it.url) : c.platform, canonicalUrl: cu })
      }
      o.ok++
      fullyRead++
    } catch (err) {
      if (signal?.aborted) throw err
      o.failed++
      o.reasons.add(describeError(err))
    } finally {
      done++
      onRead?.(done, threads.length)
    }
  })
  for (const [what, o] of outcome) {
    if (o.failed === 0) continue
    const reason = [...o.reasons][0] ?? "refused"
    notes.push(
      o.ok === 0
        ? `${what} could not be opened in full (${reason}); search snippets were used instead`
        : `${what}: ${o.ok} of ${o.ok + o.failed} read in full`,
    )
  }
  return { updates, comments: [...comments.values()], fullyRead, notes }
}
