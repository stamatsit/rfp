import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkReport } from "../checks.js"
import { executeRun, groupLaneNotes, startRun } from "../engine.js"
import {
  access,
  cancelRun,
  draftIdea,
  listIdeas,
  listTopics,
  moreIdeas,
  ownsTopic,
  prepareRun,
  rateIdea,
  removeIdea,
  removeTopic,
  runStatus,
  saveIdea,
  setIdeaStatus,
  shareTopic,
  topicDetail,
  topicSources,
  usage,
} from "../service.js"
import { ActiveRunError, MemoryStore, within } from "../store.js"
import { dropUnknownNumbers, unquoteUnverified } from "../drafts.js"
import { ideaTaste } from "../taste.js"
import type { BlogOutline, ContentIdea, HeadlineSet, IdeaDraft, LinkedInPost, RunEvent } from "../types.js"
import { labelItems } from "../label.js"
import { FakeLlm, FakeSearch, fakeDeps, fakeNews, fakeReader, fakeYoutube, resultIndex } from "./fakes.js"

/** Run this block with each person seeing only their own and shared topics (LISTENING_VISIBILITY=private). */
function privateVisibility() {
  beforeEach(() => {
    process.env["LISTENING_VISIBILITY"] = "private"
  })
  afterEach(() => {
    delete process.env["LISTENING_VISIBILITY"]
  })
}

async function initial(store: MemoryStore, deps = fakeDeps(store), query = "online nursing degree") {
  const events: RunEvent[] = []
  const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "eric.yerke@stamats.com", query, timeWindow: "1y" })
  const status = await executeRun(deps, { topic, runId, trigger: "initial" }, (e) => events.push(e))
  return { topicId: topic.id, runId, status, events }
}

describe("engine: first scan", () => {
  it("completes, persists a report that satisfies every invariant, and streams progress", async () => {
    const store = new MemoryStore()
    const { topicId, status, events } = await initial(store)
    expect(status).toBe("complete")
    const topic = (await store.getTopic(topicId))!
    const items = await store.allItems(topicId)
    const r = topic.report!
    expect(checkReport(r, items)).toEqual([])
    expect(r.analysisSource).toBe("llm")
    expect(r.totals.relevant).toBeGreaterThan(0)
    expect(items.some((i) => i.labels && !i.labels.relevant)).toBe(true)
    // Off-topic items are never counted.
    expect(r.platforms.reduce((n, p) => n + p.count, 0)).toBe(r.totals.relevant)
    // The unsupported idea (bad evidence) was dropped; the two good ones kept.
    expect(r.ideas.map((i) => i.headline)).toEqual(["Who finds your clinical placement", "The real cost"])
    // Model numbers and dashes were stripped from the summary.
    expect(r.summary).not.toMatch(/%/)
    expect(r.summary).not.toMatch(/—/)
    // News is context, not conversation: the news article plus news outlets posting on social.
    expect(r.news.filter((n) => n.url.includes("news.google.com"))).toHaveLength(1)
    expect(r.news.filter((n) => /newsdesk/.test(n.url)).length).toBeGreaterThan(0)
    const counted = new Set(r.subtopics.flatMap((s) => s.itemIds))
    expect(r.news.filter((n) => counted.has(n.itemId))).toEqual([])
    expect(r.sentiment.positive + r.sentiment.neutral + r.sentiment.negative + r.sentiment.mixed).toBe(r.totals.relevant)
    // Deep read turned replies into items; a refused read is reported.
    expect(items.some((i) => i.lane === "read:reddit")).toBe(true)
    expect(r.coverage.notes.join(" ")).toMatch(/read in full|could not be opened/)
    const types = events.map((e) => e.type)
    expect(types[0]).toBe("started")
    expect(types).toContain("plan")
    expect(types).toContain("lane")
    expect(types[types.length - 1]).toBe("done")
    const run = (await store.listRuns(topicId))[0]!
    expect(run.status).toBe("complete")
    expect(run.searchCalls).toBeGreaterThan(0)
    expect(topic.lastRunStatus).toBe("complete")
  })

  it("drops quotes the model invents", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ fabricateQuotes: true }) }))
    const items = await store.allItems(topicId)
    expect(items.every((i) => i.labels?.quote == null)).toBe(true)
    expect((await store.getTopic(topicId))!.report!.quotes).toEqual([])
  })
})

describe("engine: rescan adds data", () => {
  it("adds only new items, digs deeper with cursors, adds a phrasing, and keeps old labels", async () => {
    const store = new MemoryStore()
    const search = new FakeSearch()
    const { topicId } = await initial(store, fakeDeps(store, { search }))
    const before = await store.allItems(topicId)
    const firstCalls = search.calls.length
    const { topic, runId } = await startRun(store, { trigger: "rescan", createdBy: "e", topicId })
    const status = await executeRun(fakeDeps(store, { search }), { topic, runId, trigger: "rescan" }, () => {})
    expect(status).toBe("complete")
    const after = await store.allItems(topicId)
    expect(after.length).toBeGreaterThan(before.length)
    const urls = after.map((i) => i.url)
    expect(new Set(urls).size).toBe(urls.length)
    // Deeper pages were requested.
    expect(search.calls.slice(firstCalls).some((c) => c.start > 11)).toBe(true)
    const t = (await store.getTopic(topicId))!
    expect(t.plan!.searches.length).toBe(4)
    expect(t.report!.totals.newThisRun).toBe(after.length - before.length)
    expect(t.report!.totals.runs).toBe(2)
    expect(checkReport(t.report!, after)).toEqual([])
    // Previously labeled items kept their labels, unless this scan read them in full (relabeled on the full text).
    for (const b of before) {
      const a = after.find((x) => x.id === b.id)!
      if (a.text === b.text) expect(a.labels).toEqual(b.labels)
      else expect(a.labels?.v).toBe(2)
    }
  })

  it("rebuild rewrites the analysis without searching", async () => {
    const store = new MemoryStore()
    const search = new FakeSearch()
    const { topicId } = await initial(store, fakeDeps(store, { search }))
    const calls = search.calls.length
    const { topic, runId } = await startRun(store, { trigger: "rebuild", createdBy: "e", topicId })
    expect(await executeRun(fakeDeps(store, { search }), { topic, runId, trigger: "rebuild" }, () => {})).toBe("complete")
    expect(search.calls.length).toBe(calls)
  })
})

describe("engine: who is talking, and about what", () => {
  it("reads in full only threads labeled as mainly about the topic", async () => {
    const store = new MemoryStore()
    const reads: string[] = []
    const { topicId } = await initial(store, fakeDeps(store, { reader: fakeReader(reads) }))
    expect(reads.length).toBeGreaterThan(0)
    // Results 2 (off topic) and 3 (passing mention) are never opened.
    expect(reads.map(resultIndex).filter((i) => i === 2 || i === 3)).toEqual([])
    // A thread read in full is relabeled on its full text in the same scan.
    const items = await store.allItems(topicId)
    for (const it of items.filter((i) => i.depth === "full" && i.kind === "post")) expect(it.labels?.v).toBe(2)
  })

  it("collects passing mentions but never counts or quotes them", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store)
    const items = await store.allItems(topicId)
    const r = (await store.getTopic(topicId))!.report!
    const mentions = new Set(items.filter((i) => i.labels?.relevant && i.labels.about === false).map((i) => i.id))
    expect(mentions.size).toBeGreaterThan(0)
    expect(r.totals.excluded.mentions).toBeGreaterThan(0)
    const used = [...r.quotes.map((q) => q.itemId), ...r.questions.map((q) => q.itemId), ...r.subtopics.flatMap((s) => s.itemIds), ...r.ideas.flatMap((i) => i.evidenceItemIds)]
    expect(used.filter((id) => mentions.has(id))).toEqual([])
    // "Will be bored?" is too short to stand as a question even before the mention filter.
    expect(items.every((i) => i.labels?.question !== "Will be bored?")).toBe(true)
    expect(checkReport(r, items)).toEqual([])
  })

  it("keeps a named institution's own posts out of the figures and shows them apart", async () => {
    const store = new MemoryStore()
    const deps = fakeDeps(store, { llm: new FakeLlm({ namedEntity: "Coe College" }) })
    const { topicId } = await initial(store, deps, "Coe College")
    const items = await store.allItems(topicId)
    const r = (await store.getTopic(topicId))!.report!
    const own = new Set(items.filter((i) => i.labels?.speaker === "self").map((i) => i.id))
    expect(own.size).toBeGreaterThan(0)
    expect(r.ownVoice?.name).toBe("Coe College")
    expect(r.ownVoice!.count).toBe(own.size)
    expect(r.ownVoice!.posts.every((p) => own.has(p.itemId))).toBe(true)
    expect(r.ownVoice!.note).toBe("Its own posts celebrate events, people ask who finds placements.")
    expect(r.totals.excluded.self).toBe(own.size)
    const used = [...r.quotes.map((q) => q.itemId), ...r.questions.map((q) => q.itemId), ...r.subtopics.flatMap((s) => s.itemIds), ...r.ideas.flatMap((i) => i.evidenceItemIds)]
    expect(used.filter((id) => own.has(id))).toEqual([])
    // News outlets posting on social go to the news list, not the figures.
    expect(r.totals.excluded.media).toBeGreaterThan(0)
    expect(r.news.some((n) => /newsdesk/.test(n.url))).toBe(true)
    expect(checkReport(r, items)).toEqual([])
  })

  it("has no own-posts section for a topic that is not an institution", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store)
    const r = (await store.getTopic(topicId))!.report!
    expect(r.ownVoice).toBeNull()
    expect(r.totals.excluded.self).toBe(0)
  })

  it("drops an idea when its posts do not actually support it", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ rejectIdeas: ["The real cost"] }) }))
    const r = (await store.getTopic(topicId))!.report!
    expect(r.ideas.map((i) => i.headline)).toEqual(["Who finds your clinical placement"])
    expect(r.ideas[0]!.id).toBe("idea1")
  })

  it("keeps ideas, with a warning, when the idea check itself fails", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ failOn: new Set(["listening_idea_check"]) }) }))
    const r = (await store.getTopic(topicId))!.report!
    expect(r.ideas).toHaveLength(2)
    expect(r.warnings.join(" ")).toMatch(/not double-checked/)
  })

  it("relabels items labeled before speaker and focus existed", async () => {
    const store = new MemoryStore()
    const { topicId } = await initial(store)
    // Simulate a topic scanned before this change: version-1 labels.
    for (const it of store.items.values()) {
      if (!it.labels) continue
      const { v: _v, about: _a, speaker: _s, ...old } = it.labels
      it.labels = old
    }
    const { topic, runId } = await startRun(store, { trigger: "rebuild", createdBy: "e", topicId })
    expect(await executeRun(fakeDeps(store), { topic, runId, trigger: "rebuild" }, () => {})).toBe("complete")
    const items = await store.allItems(topicId)
    expect(items.every((i) => i.labels?.v === 2)).toBe(true)
    const r = (await store.getTopic(topicId))!.report!
    expect(r.totals.relevant).toBeGreaterThan(0)
    expect(checkReport(r, items)).toEqual([])
  })
})

describe("engine: failure paths", () => {
  it("refuses a second concurrent scan on the same topic", async () => {
    const store = new MemoryStore()
    const { topic } = await startRun(store, { trigger: "initial", createdBy: "e", query: "x y", timeWindow: "1y" })
    await expect(startRun(store, { trigger: "rescan", createdBy: "e", topicId: topic.id })).rejects.toBeInstanceOf(ActiveRunError)
  })

  it("cancels immediately through the cancel endpoint in the same process", async () => {
    const store = new MemoryStore()
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "online nursing degree", timeWindow: "1y" })
    const deps = fakeDeps(store, { llm: new FakeLlm({ delayMs: 400 }) })
    const t0 = Date.now()
    const p = executeRun(deps, { topic, runId, trigger: "initial" }, () => {})
    setTimeout(() => void cancelRun({ store, userEmail: "e", deps: () => deps }, runId), 50)
    expect(await p).toBe("cancelled")
    expect(Date.now() - t0).toBeLessThan(1500)
    expect((await store.getRun(runId))!.status).toBe("cancelled")
    expect((await store.getTopic(topic.id))!.lastRunStatus).toBe("cancelled")
  }, 20000)

  it("cancels through the database flag when the request lands on another instance", async () => {
    const store = new MemoryStore()
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "online nursing degree", timeWindow: "1y" })
    const deps = fakeDeps(store, { llm: new FakeLlm({ delayMs: 1500 }) })
    const p = executeRun(deps, { topic, runId, trigger: "initial" }, () => {})
    setTimeout(() => void store.requestCancel(runId), 50)
    expect(await p).toBe("cancelled")
  }, 20000)

  it("still produces an honest partial report when idea writing fails", async () => {
    const store = new MemoryStore()
    const { topicId, status } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ failOn: new Set(["listening_synthesis"]) }) }))
    expect(status).toBe("complete")
    const r = (await store.getTopic(topicId))!.report!
    expect(r.analysisSource).toBe("partial")
    expect(r.ideas).toEqual([])
    expect(r.warnings.join(" ")).toMatch(/Idea writing was unavailable/)
    expect(r.subtopics.length).toBeGreaterThan(0)
    expect(checkReport(r, await store.allItems(topicId))).toEqual([])
  })

  it("falls back to the topic as written when planning fails", async () => {
    const store = new MemoryStore()
    const { topicId, status } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ failOn: new Set(["listening_plan"]) }) }))
    expect(status).toBe("complete")
    const t = (await store.getTopic(topicId))!
    expect(t.plan!.searches).toHaveLength(1)
    expect(t.report!.warnings.join(" ")).toMatch(/Search rewrites were unavailable/)
  })

  it("fails with a readable reason when no source answers", async () => {
    const store = new MemoryStore()
    const deps = fakeDeps(store, { search: new FakeSearch({ quota: true }), youtube: fakeYoutube({ fail: true }), news: null })
    const { status, events } = await initial(store, deps)
    expect(status).toBe("failed")
    const err = events.find((e) => e.type === "error") as Extract<RunEvent, { type: "error" }>
    expect(err.message).toMatch(/allowance is used up/)
  })

  it("groups source failures that share a reason into one note", () => {
    const lanes = [
      { lane: "reddit", label: "Reddit", status: "failed" as const, count: 0, ms: 1, note: "quota used up" },
      { lane: "forums", label: "Forums", status: "failed" as const, count: 0, ms: 1, note: "quota used up" },
      { lane: "reviews", label: "Reviews", status: "failed" as const, count: 0, ms: 1, note: "error 404" },
      { lane: "news", label: "News", status: "ok" as const, count: 9, ms: 1 },
    ]
    expect(groupLaneNotes(lanes, ["quota used up", "Reddit threads: 3 of 5 read in full"])).toEqual([
      "Reddit, Forums: quota used up",
      "Reviews: error 404",
      "Reddit threads: 3 of 5 read in full",
    ])
  })

  it("time-boxes a hung database: within() falls back instead of waiting", async () => {
    const t0 = Date.now()
    expect(await within(new Promise<string>(() => {}), 50, "fallback")).toBe("fallback")
    expect(await within(Promise.reject(new Error("x")), 50, "fallback")).toBe("fallback")
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it("tells the browser a scan failed even when the database hangs while recording it", async () => {
    const store = new MemoryStore()
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "x y", timeWindow: "1y" })
    store.finishRun = () => new Promise(() => {})
    store.existingCanonicalUrls = async () => {
      throw new Error("database unavailable")
    }
    const events: RunEvent[] = []
    const t0 = Date.now()
    const status = await executeRun(fakeDeps(store), { topic, runId, trigger: "initial" }, (e) => events.push(e))
    expect(status).toBe("failed")
    expect(events.some((e) => e.type === "error" && /database unavailable/.test(e.message))).toBe(true)
    expect(Date.now() - t0).toBeLessThan(9500)
  }, 15000)

  it("marks a degraded scan when one source fails but others answer", async () => {
    const store = new MemoryStore()
    const { topicId, status } = await initial(store, fakeDeps(store, { youtube: fakeYoutube({ fail: true }) }))
    expect(status).toBe("complete")
    const r = (await store.getTopic(topicId))!.report!
    expect(r.coverage.degraded).toBe(true)
    expect(r.coverage.lanes.find((l) => l.lane === "youtube")!.status).toBe("failed")
    expect(r.coverage.notes).toContain("YouTube: daily quota used up")
  })
})

describe("service: topics belong to the person who made them (private visibility)", () => {
  privateVisibility()
  it("lists, opens, rescans, cancels and deletes only your own topics", async () => {
    const store = new MemoryStore()
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store) })
    const eric = as("eric.yerke@stamats.com")
    const joe = as("joe.volk@stamats.com")
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "eric.yerke@stamats.com", query: "online nursing degree", timeWindow: "1y" })

    // Joe sees nothing of Eric's, and every action answers "not found".
    expect((await listTopics(joe)).topics).toEqual([])
    expect(await topicDetail(joe, topic.id)).toMatchObject({ ok: false, status: 404 })
    expect(await runStatus(joe, runId)).toMatchObject({ ok: false, status: 404 })
    expect(await cancelRun(joe, runId)).toMatchObject({ ok: false, status: 404 })
    expect(await store.isCancelRequested(runId)).toBe(false)
    await store.finishRun(runId, { status: "complete" })
    expect(await prepareRun(joe, { trigger: "rescan", topicId: topic.id })).toMatchObject({ ok: false, status: 404 })
    expect(await prepareRun(joe, { trigger: "rebuild", topicId: topic.id })).toMatchObject({ ok: false, status: 404 })
    expect(await removeTopic(joe, topic.id)).toMatchObject({ ok: false, status: 404 })
    expect(await store.getTopic(topic.id)).not.toBeNull()

    // Eric, in any letter case, still has it.
    const ericUpper = as("Eric.Yerke@Stamats.com")
    expect((await listTopics(ericUpper)).topics.map((t) => t.id)).toEqual([topic.id])
    expect(await topicDetail(eric, topic.id)).toMatchObject({ ok: true })
    expect(await runStatus(eric, runId)).toMatchObject({ ok: true })

    // Joe's own scans stay his.
    const joes = await prepareRun(joe, { trigger: "initial", query: "FAFSA changes", timeWindow: "1y" })
    expect(joes.ok).toBe(true)
    expect((await listTopics(joe)).topics.map((t) => t.query)).toEqual(["FAFSA changes"])
    expect((await listTopics(eric)).topics.map((t) => t.query)).toEqual(["online nursing degree"])
    expect(await removeTopic(eric, topic.id)).toMatchObject({ ok: true })
    expect(ownsTopic({ createdBy: "a@b.com" }, "")).toBe(false)
  })
})

describe("service: sharing and the idea board (private visibility)", () => {
  privateVisibility()
  const setupScanned = async () => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store) })
    const eric = as("eric.yerke@stamats.com")
    const joe = as("joe.volk@stamats.com")
    const { topicId } = await initial(store, fakeDeps(store), "online nursing degree")
    // initial() creates as eric.yerke@stamats.com.
    return { store, eric, joe, topicId }
  }

  it("a shared topic is readable by teammates and never changeable by them", async () => {
    const { store, eric, joe, topicId } = await setupScanned()
    expect(await shareTopic(joe, topicId, true)).toMatchObject({ ok: false, status: 404 })
    expect(await shareTopic(eric, topicId, "yes")).toMatchObject({ ok: false, status: 400 })
    expect(await topicDetail(joe, topicId)).toMatchObject({ ok: false, status: 404 })

    expect(await shareTopic(eric, topicId, true)).toEqual({ ok: true, body: { shared: true } })
    const lists = await listTopics(joe)
    expect(lists.topics).toEqual([])
    expect(lists.shared.map((t) => t.id)).toEqual([topicId])
    expect((await listTopics(eric)).shared).toEqual([])
    expect(await topicDetail(joe, topicId)).toMatchObject({ ok: true, body: { role: "viewer" } })
    expect(await topicDetail(eric, topicId)).toMatchObject({ ok: true, body: { role: "owner" } })

    // Read only: no rescan, refresh, delete or unshare by a teammate.
    expect(await prepareRun(joe, { trigger: "rescan", topicId })).toMatchObject({ ok: false, status: 404 })
    expect(await prepareRun(joe, { trigger: "rebuild", topicId })).toMatchObject({ ok: false, status: 404 })
    expect(await removeTopic(joe, topicId)).toMatchObject({ ok: false, status: 404 })
    expect(await shareTopic(joe, topicId, false)).toMatchObject({ ok: false, status: 404 })

    // A teammate can save an idea from it; unsharing ends their access but not their copy.
    const saved = await saveIdea(joe, { topicId, ideaId: "idea1" })
    expect(saved.ok).toBe(true)
    expect(await shareTopic(eric, topicId, false)).toEqual({ ok: true, body: { shared: false } })
    expect(await topicDetail(joe, topicId)).toMatchObject({ ok: false, status: 404 })
    expect((await listTopics(joe)).shared).toEqual([])
    expect((await listIdeas(joe)).ideas).toHaveLength(1)
    expect((await store.getTopic(topicId))!.shared).toBe(false)
  })

  it("saves a frozen copy of an idea with its sources, once, and tracks its status", async () => {
    const { store, eric, joe, topicId } = await setupScanned()
    const report = (await store.getTopic(topicId))!.report!
    const idea = report.ideas[0]!
    const first = await saveIdea(eric, { topicId, ideaId: idea.id })
    if (!first.ok) throw new Error(first.error)
    const s = first.body.idea
    expect(s.idea.headline).toBe(idea.headline)
    expect(s.idea.outline).toEqual(idea.outline)
    expect(s.status).toBe("new")
    expect(s.topicQuery).toBe("online nursing degree")
    const items = await store.allItems(topicId)
    expect(s.sources.map((x) => x.url)).toEqual(idea.evidenceItemIds.map((id) => items.find((i) => i.id === id)!.url))
    expect(s.sources.every((x) => x.text.length > 0)).toBe(true)

    // Saving twice keeps one card; the topic page knows it is saved.
    const again = await saveIdea(eric, { topicId, ideaId: idea.id })
    expect(again.ok && again.body.idea.id).toBe(s.id)
    expect((await listIdeas(eric)).ideas).toHaveLength(1)
    const detail = await topicDetail(eric, topicId)
    expect(detail.ok && (detail.body as { savedIdeas: Record<string, string> }).savedIdeas).toEqual({ [idea.id]: s.id })

    // Status: only real statuses, only by its owner.
    expect(await setIdeaStatus(eric, s.id, "pitched")).toEqual({ ok: true, body: { status: "pitched" } })
    expect(await setIdeaStatus(eric, s.id, "shipped")).toMatchObject({ ok: false, status: 400 })
    expect(await setIdeaStatus(joe, s.id, "published")).toMatchObject({ ok: false, status: 404 })
    expect(await removeIdea(joe, s.id)).toMatchObject({ ok: false, status: 404 })
    expect((await listIdeas(joe)).ideas).toEqual([])

    // A rescan that rewrites the ideas does not touch the saved copy; neither does deleting the topic.
    await store.updateTopic(topicId, { report: { ...report, ideas: [] } })
    expect(await saveIdea(eric, { topicId, ideaId: idea.id })).toMatchObject({ ok: false, status: 404, code: "idea_gone" })
    expect(await removeTopic(eric, topicId)).toMatchObject({ ok: true })
    const [kept] = (await listIdeas(eric)).ideas
    expect(kept).toMatchObject({ id: s.id, status: "pitched", topicId: null, topicQuery: "online nursing degree" })
    expect(kept!.idea.headline).toBe(idea.headline)

    expect(await removeIdea(eric, s.id)).toEqual({ ok: true, body: { ok: true } })
    expect((await listIdeas(eric)).ideas).toEqual([])
    expect(await saveIdea(eric, { topicId: 7, ideaId: "idea1" })).toMatchObject({ ok: false, status: 400 })
  })
})

describe("service: drafts from an idea", () => {
  const scanned = async (llm = new FakeLlm()) => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store, { llm }) })
    const { topicId } = await initial(store, fakeDeps(store), "online nursing degree")
    const idea = (await store.getTopic(topicId))!.report!.ideas[0]!
    return { store, llm, eric: as("eric.yerke@stamats.com"), joe: as("joe.volk@stamats.com"), topicId, idea }
  }
  const draftCalls = (llm: FakeLlm) => llm.calls.filter((c) => c.startsWith("listening_draft_"))

  it("drafting from a topic saves the idea, writes once, and returns the stored draft after that", async () => {
    const { store, llm, eric, topicId, idea } = await scanned()
    const first = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "headlines" })
    if (!first.ok) throw new Error(first.error)
    // The idea is on the board now, and the draft hangs off that saved copy.
    const board = await listIdeas(eric)
    expect(board.ideas.map((i) => i.idea.headline)).toEqual([idea.headline])
    expect(first.body.idea.id).toBe(board.ideas[0]!.id)
    expect(first.body.draft).toMatchObject({ kind: "headlines", savedIdeaId: board.ideas[0]!.id })
    expect(board.drafts[board.ideas[0]!.id]!.map((d) => d.kind)).toEqual(["headlines"])
    expect(draftCalls(llm)).toEqual(["listening_draft_headlines"])

    // Asking again costs nothing: same draft, no model call. From the topic or from the board.
    const again = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "headlines" })
    const fromBoard = await draftIdea(eric, { savedId: first.body.idea.id, kind: "headlines" })
    expect(again.ok && again.body.draft.id).toBe(first.body.draft.id)
    expect(fromBoard.ok && fromBoard.body.draft.id).toBe(first.body.draft.id)
    expect(draftCalls(llm)).toHaveLength(1)

    // "Write another" replaces it: one draft per kind.
    const fresh = await draftIdea(eric, { savedId: first.body.idea.id, kind: "headlines", fresh: true })
    expect(fresh.ok && fresh.body.draft.id).toBe(first.body.draft.id)
    expect(draftCalls(llm)).toHaveLength(2)
    await draftIdea(eric, { savedId: first.body.idea.id, kind: "blog_outline" })
    await draftIdea(eric, { savedId: first.body.idea.id, kind: "linkedin_post" })
    expect((await store.listDrafts([first.body.idea.id])).map((d) => d.kind).sort()).toEqual(["blog_outline", "headlines", "linkedin_post"])

    // The topic page gets the drafts for the ideas you saved from it.
    const detail = await topicDetail(eric, topicId)
    if (!detail.ok) throw new Error(detail.error)
    const body = detail.body as { savedIdeas: Record<string, string>; drafts: Record<string, IdeaDraft[]> }
    expect(body.drafts[body.savedIdeas[idea.id]!]!).toHaveLength(3)
    // No searches were used: drafting is the model only.
    expect((await usage(eric)).today.filter((s) => s.trigger !== "initial")).toEqual([])
  })

  it("keeps a blog outline to notes, with no invented numbers, quotes, dashes or sources", async () => {
    const { eric, topicId, idea } = await scanned()
    const r = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "blog_outline" })
    if (!r.ok) throw new Error(r.error)
    const o = r.body.draft.content as BlogOutline
    const n = r.body.idea.sources.length
    expect(n).toBeGreaterThanOrEqual(2)
    expect(o.workingTitle).toBe("Who arranges your clinical placement, and when to ask")
    // The statistic no post contains is gone; the sentence before it stays.
    expect(o.angle).toBe("Placement support varies by program.")
    expect(JSON.stringify(o)).not.toMatch(/73|9 in 10|—|–/)
    // The heading-less section is dropped; four remain, in order.
    expect(o.sections.map((s) => s.heading)).toEqual(["What students are asking", "How placement usually works", "Questions to ask a program", "Next steps"])
    expect(o.sections[1]!.points).toEqual(["Describe the common arrangements"])
    // An invented quotation loses its marks; words a post really contains keep them.
    expect(o.sections[0]!.points[1]).toBe("Unpack nobody tells you who finds the site in plain words")
    expect(o.sections[2]!.points[1]).toBe('Name the fear: "the clinical placement was a nightmare"')
    // Posts the model cited by number become links to real saved sources only, once each.
    const saved = r.body.idea.sources
    expect(o.sections[0]!.sources).toEqual(saved.slice(0, 2).map((x) => ({ url: x.url, platform: x.platform })))
    expect(o.sections[1]!.sources).toEqual([{ url: saved[1]!.url, platform: saved[1]!.platform }])
    expect(o.sections[2]!.sources).toEqual([])
    expect(o.sections[3]!.sources).toEqual([{ url: saved[0]!.url, platform: saved[0]!.platform }])
  })

  it("cleans a LinkedIn post and a headline set the same way", async () => {
    const { eric, topicId, idea } = await scanned()
    const p = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "linkedin_post" })
    if (!p.ok) throw new Error(p.error)
    const post = p.body.draft.content as LinkedInPost
    const paragraphs = post.post.split("\n\n")
    expect(paragraphs).toHaveLength(5)
    expect(paragraphs[0]).toBe("Online nursing students keep asking one thing, who actually finds the clinical placement?")
    expect(post.post).not.toMatch(/#|—|68%|"my advisor/)
    expect(paragraphs[1]).toContain("One student said my advisor promised a placement in week one and that is the worry in a sentence.")
    expect(paragraphs[2]).toBe("That gap is where trust is lost.")
    expect(post.hashtags).toEqual(["HigherEd", "nursingeducation", "Enrollment"])

    const h = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "headlines" })
    if (!h.ok) throw new Error(h.error)
    const texts = (h.body.draft.content as HeadlineSet).headlines.map((x) => x.text)
    // Not the idea's own headline, no repeats, no numerals, no dashes.
    expect(texts).not.toContain(idea.headline)
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts).toHaveLength(7)
    expect(texts.join(" ")).not.toMatch(/\d|—/)
    expect(texts).toContain("Clinical placement, what online programs owe you")
  })

  it("belongs to the person who saved the idea, and goes when the idea goes", async () => {
    const { store, eric, joe, topicId, idea } = await scanned()
    const mine = await draftIdea(eric, { topicId, ideaId: idea.id, kind: "headlines" })
    if (!mine.ok) throw new Error(mine.error)
    // Joe cannot draft from Eric's saved idea, or from his private topic.
    expect(await draftIdea(joe, { savedId: mine.body.idea.id, kind: "headlines" })).toMatchObject({ ok: false, status: 404 })
    expect(await draftIdea(joe, { topicId, ideaId: idea.id, kind: "headlines" })).toMatchObject({ ok: false, status: 404 })
    expect((await listIdeas(joe)).drafts).toEqual({})
    // Shared: Joe can draft, on his own board, without touching Eric's draft.
    await shareTopic(eric, topicId, true)
    const his = await draftIdea(joe, { topicId, ideaId: idea.id, kind: "headlines" })
    if (!his.ok) throw new Error(his.error)
    expect(his.body.idea.id).not.toBe(mine.body.idea.id)
    expect(his.body.draft.id).not.toBe(mine.body.draft.id)
    // Removing the idea removes its drafts; a rescan or deleting the topic does not.
    await store.updateTopic(topicId, { report: { ...(await store.getTopic(topicId))!.report!, ideas: [] } })
    expect((await listIdeas(eric)).drafts[mine.body.idea.id]).toHaveLength(1)
    expect(await draftIdea(eric, { savedId: mine.body.idea.id, kind: "blog_outline" })).toMatchObject({ ok: true })
    expect(await removeIdea(eric, mine.body.idea.id)).toMatchObject({ ok: true })
    expect(await store.listDrafts([mine.body.idea.id])).toEqual([])
    expect(await store.listDrafts([his.body.idea.id])).toHaveLength(1)
  })

  it("refuses a kind it does not know, and says try again when the model fails or returns too little", async () => {
    const { eric, topicId, idea } = await scanned()
    for (const kind of ["article", "", null, undefined, 3]) expect(await draftIdea(eric, { topicId, ideaId: idea.id, kind }), String(kind)).toMatchObject({ ok: false, status: 400, code: "bad_kind" })
    // Nothing was saved to the board by a refused request.
    expect((await listIdeas(eric)).ideas).toEqual([])
    expect(await draftIdea(eric, { topicId, ideaId: "idea999", kind: "headlines" })).toMatchObject({ ok: false, status: 404, code: "idea_gone" })
    expect(await draftIdea(eric, { savedId: "not-a-uuid", kind: "headlines" })).toMatchObject({ ok: false, status: 404 })

    const thin = await scanned(new FakeLlm({ thinDrafts: true }))
    for (const kind of ["blog_outline", "linkedin_post", "headlines"]) {
      expect(await draftIdea(thin.eric, { topicId: thin.topicId, ideaId: thin.idea.id, kind }), kind).toMatchObject({ ok: false, status: 502, code: "draft_failed" })
    }
    // A failed draft stores nothing, not even the idea, so the next try starts clean.
    expect(await listIdeas(thin.eric)).toEqual({ ideas: [], drafts: {} })
    const down = await scanned(new FakeLlm({ failOn: new Set(["listening_draft_headlines"]) }))
    await expect(draftIdea(down.eric, { topicId: down.topicId, ideaId: down.idea.id, kind: "headlines" })).rejects.toThrow("fake failure")
    expect((await listIdeas(down.eric)).ideas).toEqual([])
  })

  it("number and quotation checks, on their own", () => {
    const known = new Set(["2026", "27"])
    expect(dropUnknownNumbers("FAFSA for 2026 to 27 opened late. Roughly 4 in 10 families gave up. Ask for help early.", known)).toBe("FAFSA for 2026 to 27 opened late. Ask for help early.")
    expect(dropUnknownNumbers("No numbers here at all.", new Set())).toBe("No numbers here at all.")
    const posts = ["Nobody told me the deadline moved. I found out from a friend."]
    expect(unquoteUnverified('She said "nobody told me the deadline moved" and left.', posts)).toBe('She said "nobody told me the deadline moved" and left.')
    expect(unquoteUnverified("She said “the office never called me back” and left.", posts)).toBe("She said the office never called me back and left.")
    // One or two quoted words are emphasis, not a quotation.
    expect(unquoteUnverified('The so-called "free" option and the "priority deadline" both confuse people.', posts)).toBe('The so-called "free" option and the "priority deadline" both confuse people.')
  })
})

describe("service: thumbs and more ideas", () => {
  const scanned = async (llm = new FakeLlm({ rejectIdeas: ["Rejected by the second check"] })) => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store, { llm }) })
    const { topicId } = await initial(store, fakeDeps(store), "online nursing degree")
    const ideas = (await store.getTopic(topicId))!.report!.ideas
    return { store, llm, eric: as("eric.yerke@stamats.com"), joe: as("joe.volk@stamats.com"), topicId, ideas }
  }
  const votesOf = async (ctx: Parameters<typeof topicDetail>[0], topicId: string) => {
    const d = await topicDetail(ctx, topicId)
    if (!d.ok) throw new Error(d.error)
    return (d.body as { votes: Record<string, number> }).votes
  }
  const LIKED = "Who finds your clinical placement (guide, for student)"
  const PASSED = "The real cost (article, for parent)"

  it("thumbs: one vote per idea per person, changeable and clearable, on topics you can read", async () => {
    const { store, eric, joe, topicId, ideas } = await scanned()
    expect(ideas.map((i) => i.headline)).toEqual(["Who finds your clinical placement", "The real cost"])
    expect(await votesOf(eric, topicId)).toEqual({})
    expect(await rateIdea(eric, { topicId, ideaId: "idea1", vote: 1 })).toEqual({ ok: true, body: { vote: 1 } })
    expect(await rateIdea(eric, { topicId, ideaId: "idea2", vote: -1 })).toEqual({ ok: true, body: { vote: -1 } })
    expect(await votesOf(eric, topicId)).toEqual({ idea1: 1, idea2: -1 })
    // Changing a vote replaces it; 0 clears it.
    await rateIdea(eric, { topicId, ideaId: "idea1", vote: -1 })
    expect(await votesOf(eric, topicId)).toEqual({ idea1: -1, idea2: -1 })
    expect(await rateIdea(eric, { topicId, ideaId: "idea1", vote: 0 })).toEqual({ ok: true, body: { vote: null } })
    expect(await votesOf(eric, topicId)).toEqual({ idea2: -1 })
    expect(await store.listVotes({ topicId })).toHaveLength(1)

    for (const vote of [2, "1", null, undefined, true]) expect(await rateIdea(eric, { topicId, ideaId: "idea1", vote }), String(vote)).toMatchObject({ ok: false, status: 400, code: "bad_vote" })
    expect(await rateIdea(eric, { topicId, ideaId: "idea99", vote: 1 })).toMatchObject({ ok: false, status: 404, code: "idea_gone" })
    expect(await rateIdea(eric, { topicId: 5, ideaId: "idea1", vote: 1 })).toMatchObject({ ok: false, status: 400 })
    // Joe cannot vote on a private topic; on a shared one his vote is his own.
    expect(await rateIdea(joe, { topicId, ideaId: "idea1", vote: 1 })).toMatchObject({ ok: false, status: 404 })
    await shareTopic(eric, topicId, true)
    expect(await rateIdea(joe, { topicId, ideaId: "idea1", vote: 1 })).toMatchObject({ ok: true })
    expect(await votesOf(joe, topicId)).toEqual({ idea1: 1 })
    expect(await votesOf(eric, topicId)).toEqual({ idea2: -1 })

    // A refresh rewrites the ideas; a vote follows its idea by headline.
    const rb = await startRun(store, { trigger: "rebuild", createdBy: "eric.yerke@stamats.com", topicId })
    await executeRun(fakeDeps(store), { topic: rb.topic, runId: rb.runId, trigger: "rebuild" }, () => {})
    expect(await votesOf(eric, topicId)).toEqual({ idea2: -1 })
    // Deleting the topic keeps the vote as taste, detached from the topic.
    await removeTopic(eric, topicId)
    expect((await store.listVotes({ createdBy: "eric.yerke@stamats.com" })).map((v) => [v.topicId, v.vote, v.idea.headline])).toEqual([[null, -1, "The real cost"]])
  })

  it("taste: thumbs up and saved ideas are liked, thumbs down is passed on, a split vote says nothing", async () => {
    const { store, eric, joe, topicId } = await scanned()
    expect(await ideaTaste(store, topicId, "eric.yerke@stamats.com")).toEqual({ liked: [], passed: [] })
    await rateIdea(eric, { topicId, ideaId: "idea1", vote: 1 })
    await rateIdea(eric, { topicId, ideaId: "idea2", vote: -1 })
    expect(await ideaTaste(store, topicId, "eric.yerke@stamats.com")).toEqual({ liked: [LIKED], passed: [PASSED] })
    // A teammate reading the shared topic disagrees about idea 1: it drops out of both lists.
    await shareTopic(eric, topicId, true)
    await rateIdea(joe, { topicId, ideaId: "idea1", vote: -1 })
    expect(await ideaTaste(store, topicId, "eric.yerke@stamats.com")).toEqual({ liked: [], passed: [PASSED] })
    await rateIdea(joe, { topicId, ideaId: "idea1", vote: 0 })
    // Saving counts as liking, until the idea is dropped on the board.
    await rateIdea(eric, { topicId, ideaId: "idea1", vote: 0 })
    const saved = await saveIdea(eric, { topicId, ideaId: "idea1" })
    if (!saved.ok) throw new Error(saved.error)
    expect((await ideaTaste(store, topicId, "eric.yerke@stamats.com")).liked).toEqual([LIKED])
    await setIdeaStatus(eric, saved.body.idea.id, "dropped")
    expect((await ideaTaste(store, topicId, "eric.yerke@stamats.com")).liked).toEqual([])
    // Joe's taste is his own: Eric's thumbs down on this topic reaches him only because he can read it.
    expect(await ideaTaste(store, topicId, "joe.volk@stamats.com")).toEqual({ liked: [], passed: [PASSED] })
  })

  it("more ideas: adds only ideas that are new and pass the second check, numbered after the topic's own", async () => {
    const { store, llm, eric, topicId } = await scanned()
    const before = (await store.getTopic(topicId))!
    const r = await moreIdeas(eric, topicId)
    if (!r.ok) throw new Error(r.error)
    // Dropped: the repeat of an existing idea, the one resting on a single post, the one the second check rejected.
    expect(r.body.added.map((i) => [i.id, i.headline, i.added])).toEqual([
      ["idea3", "Questions to ask before you enroll", true],
      ["idea4", "What the real cost leaves out", true],
    ])
    for (const i of r.body.added) expect(i.evidenceItemIds.length).toBeGreaterThanOrEqual(2)
    expect(r.body.ideas.map((i) => i.id)).toEqual(["idea1", "idea2", "idea3", "idea4"])
    const after = (await store.getTopic(topicId))!
    expect(after.report!.ideas).toEqual(r.body.ideas)
    // Everything else in the report is untouched, and it still passes every honesty check.
    expect({ ...after.report!, ideas: [] }).toEqual({ ...before.report!, ideas: [] })
    expect(checkReport(after.report!, await store.allItems(topicId))).toEqual([])
    // The model was told what exists, both passes ran, and no search or scan was used.
    expect(llm.calls).toEqual(["listening_more_ideas", "listening_idea_check"])
    expect(llm.prompts.get("listening_more_ideas")).toContain("- Who finds your clinical placement: a\n- The real cost: a")
    expect(await store.listRuns(topicId)).toHaveLength(1)
    expect((await usage(eric)).budget.used).toBe((await store.listRuns(topicId))[0]!.searchCalls)

    // The new ideas can be saved, rated and drafted from like any other.
    expect(await saveIdea(eric, { topicId, ideaId: "idea3" })).toMatchObject({ ok: true })
    expect(await rateIdea(eric, { topicId, ideaId: "idea4", vote: 1 })).toMatchObject({ ok: true })
    // Asking again when nothing else holds up adds nothing and says so with an empty list.
    const again = await moreIdeas(eric, topicId)
    expect(again).toMatchObject({ ok: true, body: { added: [] } })
    expect((await store.getTopic(topicId))!.report!.ideas).toHaveLength(4)
  })

  it("thumbs steer what is written next, in more ideas and in a refresh", async () => {
    const { store, llm, eric, topicId } = await scanned()
    await moreIdeas(eric, topicId)
    expect(llm.prompts.get("listening_more_ideas")).not.toContain("Liked:")
    await rateIdea(eric, { topicId, ideaId: "idea1", vote: 1 })
    await rateIdea(eric, { topicId, ideaId: "idea2", vote: -1 })
    await moreIdeas(eric, topicId)
    const prompt = llm.prompts.get("listening_more_ideas")!
    expect(prompt).toContain("This is taste, not evidence: never cite it")
    expect(prompt).toContain(`Liked:\n- ${LIKED}`)
    expect(prompt).toContain(`Passed on:\n- ${PASSED}`)
    // A refresh (and so a rescan) writes its ideas with the same guidance.
    const rb = await startRun(store, { trigger: "rebuild", createdBy: "eric.yerke@stamats.com", topicId })
    await executeRun(fakeDeps(store, { llm }), { topic: rb.topic, runId: rb.runId, trigger: "rebuild" }, () => {})
    expect(llm.prompts.get("listening_synthesis")).toContain(`Passed on:\n- ${PASSED}`)
  })

  it("more ideas: the owner only, never during a scan, and nothing is added unless the second check ran", async () => {
    const { store, eric, joe, topicId, ideas } = await scanned()
    const stored = async () => (await store.getTopic(topicId))!.report!.ideas
    // Not the owner: a teammate on a shared topic cannot change its report.
    await shareTopic(eric, topicId, true)
    expect(await moreIdeas(joe, topicId)).toMatchObject({ ok: false, status: 404 })
    expect(await moreIdeas(eric, "not-a-uuid")).toMatchObject({ ok: false, status: 404 })

    // The second check is down: no unchecked idea is added.
    const down = await scanned(new FakeLlm({ llmErrorOn: new Set(["listening_idea_check"]) }))
    expect(await moreIdeas(down.eric, down.topicId)).toMatchObject({ ok: false, status: 502, code: "ideas_failed" })
    expect((await down.store.getTopic(down.topicId))!.report!.ideas).toEqual(down.ideas)
    const dead = await scanned(new FakeLlm({ llmErrorOn: new Set(["listening_more_ideas"]) }))
    expect(await moreIdeas(dead.eric, dead.topicId)).toMatchObject({ ok: false, status: 502, code: "ideas_failed" })

    // The report changed while the ideas were being written (a scan finished): the stale result is discarded.
    const slow = await scanned(new FakeLlm({ delayMs: 40 }))
    const pending = moreIdeas(slow.eric, slow.topicId)
    const current = (await slow.store.getTopic(slow.topicId))!.report!
    await slow.store.updateTopic(slow.topicId, { report: { ...current, generatedAt: "2030-01-01T00:00:00.000Z" } })
    expect(await pending).toMatchObject({ ok: false, status: 409, code: "changed" })
    expect((await slow.store.getTopic(slow.topicId))!.report!.ideas).toEqual(slow.ideas)

    // A full topic, and a topic mid-scan.
    const full: ContentIdea[] = Array.from({ length: 24 }, (_, n) => ({ ...ideas[0]!, id: `idea${n + 1}`, headline: `Idea number ${n + 1}` }))
    await store.updateTopic(topicId, { report: { ...(await store.getTopic(topicId))!.report!, ideas: full } })
    expect(await moreIdeas(eric, topicId)).toMatchObject({ ok: false, status: 409, code: "idea_limit" })
    await store.updateTopic(topicId, { report: { ...(await store.getTopic(topicId))!.report!, ideas } })
    await startRun(store, { trigger: "rescan", createdBy: "eric.yerke@stamats.com", topicId })
    expect(await moreIdeas(eric, topicId)).toMatchObject({ ok: false, status: 409, code: "active_run" })
    expect(await stored()).toEqual(ideas)

    // No report yet.
    const fresh = await startRun(store, { trigger: "initial", createdBy: "eric.yerke@stamats.com", query: "never scanned", timeWindow: "1y" })
    await store.finishRun(fresh.runId, { status: "failed", newItems: 0, totalItems: 0, relevantItems: 0, sentimentScore: null, searchCalls: 0, youtubeUnits: 0, costUsd: 0, coverage: null as never })
    expect(await moreIdeas(eric, fresh.topic.id)).toMatchObject({ ok: false, status: 409, code: "no_report" })
  })
})

describe("service: an admin sees every scan, read only (private visibility)", () => {
  privateVisibility()
  it("lists and opens everyone's topics, private ones too, says who ran each scan, and changes nothing", async () => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store) })
    const eric = as("eric.yerke@stamats.com")
    const joe = as("joe.volk@stamats.com")
    const mariah = as("mariah.tang@stamats.com")
    // Joe runs a private scan.
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "joe.volk@stamats.com", query: "FAFSA changes", timeWindow: "1y" })
    await executeRun(fakeDeps(store), { topic, runId, trigger: "initial" }, () => {})

    expect((await access(eric)).admin).toBe(true)
    expect((await access(joe)).admin).toBe(false)
    const list = await listTopics(eric)
    expect(list.topics).toEqual([])
    expect(list.shared).toEqual([])
    expect(list.team?.map((t) => [t.query, t.createdBy, t.shared])).toEqual([["FAFSA changes", "joe.volk@stamats.com", false]])
    // Not admins: no team list, and Mariah cannot see Joe's private topic.
    expect((await listTopics(joe)).team).toBeUndefined()
    expect((await listTopics(mariah)).team).toBeUndefined()
    expect(await topicDetail(mariah, topic.id)).toMatchObject({ ok: false, status: 404 })

    // Eric opens it read only and sees who ran each scan.
    const d = await topicDetail(eric, topic.id)
    if (!d.ok) throw new Error(d.error)
    const body = d.body as { role: string; runs: Array<{ createdBy: string; trigger: string }> }
    expect(body.role).toBe("viewer")
    expect(body.runs.map((r) => [r.trigger, r.createdBy])).toEqual([["initial", "joe.volk@stamats.com"]])
    expect(await saveIdea(eric, { topicId: topic.id, ideaId: "idea1" })).toMatchObject({ ok: true })

    // ...and cannot change it.
    expect(await prepareRun(eric, { trigger: "rescan", topicId: topic.id })).toMatchObject({ ok: false, status: 404 })
    expect(await prepareRun(eric, { trigger: "rebuild", topicId: topic.id })).toMatchObject({ ok: false, status: 404 })
    expect(await removeTopic(eric, topic.id)).toMatchObject({ ok: false, status: 404 })
    expect(await shareTopic(eric, topic.id, true)).toMatchObject({ ok: false, status: 404 })
    expect(await store.getTopic(topic.id)).toMatchObject({ shared: false })
  })
})

describe("service: usage and the sources export (private visibility)", () => {
  privateVisibility()
  const people = (store: MemoryStore) => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store) })
    return { eric: as("eric.yerke@stamats.com"), joe: as("joe.volk@stamats.com"), mariah: as("mariah.tang@stamats.com") }
  }

  it("shows who scanned today and this week, and hides private topic names from teammates", async () => {
    const store = new MemoryStore()
    const { eric, joe, mariah } = people(store)
    const mine = await initial(store, fakeDeps(store), "Coe College")
    const j = await startRun(store, { trigger: "initial", createdBy: "joe.volk@stamats.com", query: "FAFSA changes", timeWindow: "1y" })
    await executeRun(fakeDeps(store), { topic: j.topic, runId: j.runId, trigger: "initial" }, () => {})
    // A refresh uses no searches and is not a scan.
    const rb = await startRun(store, { trigger: "rebuild", createdBy: "joe.volk@stamats.com", topicId: j.topic.id })
    await executeRun(fakeDeps(store), { topic: rb.topic, runId: rb.runId, trigger: "rebuild" }, () => {})

    const m = await usage(mariah)
    expect(m.today.map((s) => [s.who, s.trigger, s.topic]).sort()).toEqual([
      ["eric.yerke@stamats.com", "initial", null],
      ["joe.volk@stamats.com", "initial", null],
    ])
    expect(m.today.every((s) => s.searchCalls > 0 && s.topicId === null)).toBe(true)
    expect(m.week).toEqual([
      { who: "eric.yerke@stamats.com", scans: 1, searchCalls: m.today.find((s) => s.who.startsWith("eric"))!.searchCalls },
      { who: "joe.volk@stamats.com", scans: 1, searchCalls: m.today.find((s) => s.who.startsWith("joe"))!.searchCalls },
    ])
    expect(m.budget.used).toBe(m.week.reduce((n, p) => n + p.searchCalls, 0))
    expect(m.budget.limit).toBe(100)

    // You see your own topic's name; an admin sees every name; sharing reveals it to the team.
    expect((await usage(joe)).today.map((s) => s.topic).sort()).toEqual(["FAFSA changes", null].sort())
    expect((await usage(eric)).today.map((s) => s.topic).sort()).toEqual(["Coe College", "FAFSA changes"])
    await shareTopic(eric, mine.topicId, true)
    expect((await usage(mariah)).today.map((s) => s.topic).sort()).toEqual(["Coe College", null].sort())
  })

  it("exports every relevant source with its full text and why it is not counted", async () => {
    const store = new MemoryStore()
    const { eric, joe } = people(store)
    const { topicId } = await initial(store, fakeDeps(store, { llm: new FakeLlm({ namedEntity: "Coe College" }) }), "Coe College")
    const items = await store.allItems(topicId)
    const r = await topicSources(eric, topicId)
    if (!r.ok) throw new Error(r.error)
    const rows = r.body.sources
    // Every relevant item, none of the off-topic ones, each once, counted ones first.
    expect(rows.length).toBe(items.filter((i) => i.labels?.relevant).length)
    expect(new Set(rows.map((x) => x.url)).size).toBe(rows.length)
    const firstNot = rows.findIndex((x) => !x.counted)
    expect(rows.slice(firstNot).every((x) => !x.counted)).toBe(true)
    expect(rows.filter((x) => x.counted).length).toBe((await store.getTopic(topicId))!.report!.totals.relevant)
    // Full text, not an excerpt, and a plain reason on everything left out.
    for (const row of rows) expect(row.text).toBe(items.find((i) => i.url === row.url)!.text)
    expect(rows.filter((x) => x.counted).every((x) => x.notCounted === "" && x.subtopic !== "")).toBe(true)
    const reasons = new Set(rows.filter((x) => !x.counted).map((x) => x.notCounted))
    expect([...reasons].sort()).toEqual(["Coe College's own account", "news outlet", "passing mention"])
    expect(rows.find((x) => x.notCounted === "news outlet")!.platform).toMatch(/News|Facebook/)

    // Only people who can open the topic can export its sources.
    expect(await topicSources(joe, topicId)).toMatchObject({ ok: false, status: 404 })
    await shareTopic(eric, topicId, true)
    expect(await topicSources(joe, topicId)).toMatchObject({ ok: true })
  })
})

describe("service: team visibility, the default", () => {
  it("everyone with access opens, exports and saves from every topic, read only; boards stay personal", async () => {
    delete process.env["LISTENING_VISIBILITY"]
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const as = (userEmail: string) => ({ store, userEmail, deps: () => fakeDeps(store) })
    const eric = as("eric.yerke@stamats.com")
    const joe = as("joe.volk@stamats.com")
    const leslie = as("leslie.schmidt@stamats.com")
    const outsider = as("someone.else@stamats.com")
    // Eric and Mariah each run a scan and share nothing.
    const mine = await initial(store, fakeDeps(store), "online nursing degree")
    const m = await startRun(store, { trigger: "initial", createdBy: "mariah.tang@stamats.com", query: "FAFSA changes", timeWindow: "1y" })
    await executeRun(fakeDeps(store), { topic: m.topic, runId: m.runId, trigger: "initial" }, () => {})
    expect((await store.getTopic(mine.topicId))!.shared).toBe(false)

    // Leslie, who has run nothing, sees both under everyone's topics.
    expect(await access(leslie)).toMatchObject({ allowed: true, admin: false, visibility: "team" })
    const list = await listTopics(leslie)
    expect(list.topics).toEqual([])
    expect(list.team?.map((t) => [t.query, t.createdBy]).sort()).toEqual([["FAFSA changes", "mariah.tang@stamats.com"], ["online nursing degree", "eric.yerke@stamats.com"]])
    // Joe opens Eric's topic read only, exports its sources and saves an idea to his own board.
    const d = await topicDetail(joe, mine.topicId)
    if (!d.ok) throw new Error(d.error)
    expect(d.body).toMatchObject({ role: "viewer", visibility: "team" })
    const src = await topicSources(joe, mine.topicId)
    expect(src.ok && src.body.sources.length).toBeGreaterThan(0)
    const saved = await saveIdea(joe, { topicId: mine.topicId, ideaId: "idea1" })
    expect(saved.ok).toBe(true)
    // Usage names every topic for everyone.
    expect((await usage(joe)).today.every((s) => s.topic !== null)).toBe(true)

    // Read only: nothing of Eric's can be changed by Joe.
    expect(await prepareRun(joe, { trigger: "rescan", topicId: mine.topicId })).toMatchObject({ ok: false, status: 404 })
    expect(await prepareRun(joe, { trigger: "rebuild", topicId: mine.topicId })).toMatchObject({ ok: false, status: 404 })
    expect(await removeTopic(joe, mine.topicId)).toMatchObject({ ok: false, status: 404 })
    expect(await shareTopic(joe, mine.topicId, true)).toMatchObject({ ok: false, status: 404 })
    expect(await cancelRun(joe, mine.runId)).toMatchObject({ ok: false, status: 404 })
    expect(await runStatus(joe, mine.runId)).toMatchObject({ ok: false, status: 404 })
    expect(await store.getTopic(mine.topicId)).toMatchObject({ shared: false, query: "online nursing degree" })

    // Idea boards stay personal: Eric does not see Joe's saved idea and cannot touch it.
    expect((await listIdeas(eric)).ideas).toEqual([])
    if (saved.ok) {
      expect(await setIdeaStatus(eric, saved.body.idea.id, "pitched")).toMatchObject({ ok: false, status: 404 })
      expect(await removeIdea(eric, saved.body.idea.id)).toMatchObject({ ok: false, status: 404 })
    }

    // Someone not on the list sees nothing (the routes refuse them before this, too).
    expect((await listTopics(outsider)).team).toBeUndefined()
    expect(await topicDetail(outsider, mine.topicId)).toMatchObject({ ok: false, status: 404 })

    // LISTENING_VISIBILITY=private brings back private topics without a code change.
    process.env["LISTENING_VISIBILITY"] = "private"
    try {
      expect((await listTopics(joe)).team).toBeUndefined()
      expect(await topicDetail(joe, mine.topicId)).toMatchObject({ ok: false, status: 404 })
      expect((await listTopics(eric)).team).toHaveLength(1)
    } finally {
      delete process.env["LISTENING_VISIBILITY"]
    }
  })
})

describe("words to leave out of a scan", () => {
  const LEAVE = ["sourdough", "visa paperwork"]
  const OPS = ' -sourdough -"visa paperwork"'

  it("go on every search, drop what still comes back, and are told to the planner", async () => {
    const store = new MemoryStore()
    const search = new FakeSearch()
    const llm = new FakeLlm()
    const yt: string[] = []
    const news: string[] = []
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "eric.yerke@stamats.com", query: "online nursing degree", timeWindow: "1y", excludeTerms: LEAVE })
    expect(topic.excludeTerms).toEqual(LEAVE)
    const status = await executeRun(fakeDeps(store, { search, llm, youtube: fakeYoutube({ queries: yt }), news: fakeNews(news) }), { topic, runId, trigger: "initial" }, () => {})
    expect(status).toBe("complete")
    // Every search, on every source, carried the operators after the phrasing.
    expect(search.calls.length).toBeGreaterThan(4)
    for (const c of search.calls) expect(c.q.endsWith(OPS), c.q).toBe(true)
    expect(yt).toEqual([`online nursing degree${OPS}`])
    expect(news).toEqual([`online nursing degree${OPS}`])
    // The planner's stored phrasings stay clean: the operators are added at search time.
    const saved = (await store.getTopic(topic.id))!
    expect(saved.plan!.searches.every((s) => !s.q.includes(" -"))).toBe(true)
    expect(llm.prompts.get("listening_plan")).toContain("Leave out: sourdough, visa paperwork.")
    // The labeler is not told the list: leaving out is decided by the words, not by the model.
    expect(llm.systems.get("listening_labels")).not.toMatch(/sourdough|left out/i)

    // The fake search still returns a sourdough post and a visa paperwork thread on every page; none was kept.
    const items = await store.allItems(topic.id)
    expect(items.length).toBeGreaterThan(5)
    expect(items.filter((i) => /sourdough|visa paperwork/i.test(`${i.title} ${i.text}`))).toEqual([])
    expect(saved.report!.coverage.notes.join(" | ")).toMatch(/Left out \d+ items that mention sourdough and visa paperwork/)
    expect(checkReport(saved.report!, items)).toEqual([])

    // The same scan without the list keeps them, so the difference is the list.
    const plain = new MemoryStore()
    const p = await startRun(plain, { trigger: "initial", createdBy: "eric.yerke@stamats.com", query: "online nursing degree", timeWindow: "1y" })
    await executeRun(fakeDeps(plain), { topic: p.topic, runId: p.runId, trigger: "initial" }, () => {})
    expect((await plain.allItems(p.topic.id)).some((i) => /sourdough/i.test(i.text))).toBe(true)
    expect(p.topic.excludeTerms).toEqual([])

    // A rescan keeps leaving them out.
    const again = new FakeSearch()
    const rs = await startRun(store, { trigger: "rescan", createdBy: "eric.yerke@stamats.com", topicId: topic.id })
    await executeRun(fakeDeps(store, { search: again }), { topic: rs.topic, runId: rs.runId, trigger: "rescan" }, () => {})
    expect(again.calls.length).toBeGreaterThan(0)
    for (const c of again.calls) expect(c.q.endsWith(OPS), c.q).toBe(true)
    expect((await store.allItems(topic.id)).filter((i) => /sourdough|visa paperwork/i.test(i.text))).toEqual([])
  })

  it("a post that mentions one is never relevant, and the model is not asked about it", async () => {
    const llm = new FakeLlm()
    const item = (id: string, text: string) => ({ id, topicId: "t", url: `https://www.reddit.com/r/x/comments/${id}/`, platform: "reddit", kind: "post", title: "", text, author: null, publishedAt: null, depth: "full", lane: "reddit", firstSeenRunId: "r", labels: null }) as never
    const out = await labelItems(
      llm,
      [item("a", "I love my online nursing program. Who finds the clinical placement?"), item("b", "Great program, and here is my Sourdough recipe too."), item("c", "The clinical placement was great.")],
      { query: "online nursing degree", plan: null, exclude: ["sourdough"] },
    )
    expect(out.labels.get("b")).toMatchObject({ relevant: false, about: false, leftOut: "sourdough", question: null, quote: null })
    expect(out.labels.get("a")!.relevant).toBe(true)
    expect(out.labels.get("a")!.leftOut).toBeUndefined()
    expect(out.labels.size).toBe(3)
    expect(out.missing).toBe(0)
    // Only the other two went to the model.
    expect(llm.prompts.get("listening_labels")).not.toMatch(/sourdough/i)
    expect((llm.prompts.get("listening_labels")!.match(/\[a\d+\]/g) ?? []).length).toBe(2)
  })

  it("are validated before a scan starts, and stored with the topic", async () => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
    const store = new MemoryStore()
    const ctx = { store, userEmail: "eric.yerke@stamats.com", deps: () => fakeDeps(store) }
    for (const exclude of ["nursing", "a", ["sports", 3], "a1,b2,c3,d4,e5,f6,g7,h8,i9"]) {
      expect(await prepareRun(ctx, { trigger: "initial", query: "online nursing degree", timeWindow: "1y", exclude }), String(exclude)).toMatchObject({ ok: false, status: 400, code: "bad_exclude" })
    }
    // Nothing was created by a refused request.
    expect((await listTopics(ctx)).topics).toEqual([])
    const ok = await prepareRun(ctx, { trigger: "initial", query: "online nursing degree", timeWindow: "1y", exclude: 'sports, "Greek life", sports' })
    if (!ok.ok) throw new Error(ok.error)
    expect(ok.body.topic.excludeTerms).toEqual(["sports", "Greek life"])
    expect((await listTopics(ctx)).topics[0]!.excludeTerms).toEqual(["sports", "Greek life"])
    const d = await topicDetail(ctx, ok.body.topic.id)
    expect(d.ok && (d.body as { topic: { excludeTerms: string[] } }).topic.excludeTerms).toEqual(["sports", "Greek life"])
    // No list is the same as before.
    const none = await prepareRun(ctx, { trigger: "initial", query: "college enrollment trends", timeWindow: "1y" })
    expect(none.ok && none.body.topic.excludeTerms).toEqual([])
  })
})

describe("service: prepareRun", () => {
  const env = { ...process.env }
  const withKeys = () => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
  }
  it("validates the topic and refuses a run when today's allowance is spent", async () => {
    withKeys()
    const store = new MemoryStore()
    const ctx = { store, userEmail: "e", deps: () => fakeDeps(store) }
    const bad = await prepareRun(ctx, { trigger: "initial", query: " ", timeWindow: "1y" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.status).toBe(400)
    store.searchCallsSince = async () => 95
    const spent = await prepareRun(ctx, { trigger: "initial", query: "nursing", timeWindow: "1y" })
    expect(spent.ok).toBe(false)
    if (!spent.ok) expect(spent.code).toBe("budget")
    // Rebuild never spends search calls, so it is always allowed.
    store.searchCallsSince = async () => 0
    const ok = await prepareRun(ctx, { trigger: "initial", query: "nursing", timeWindow: "weird" })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      store.searchCallsSince = async () => 99
      await store.finishRun(ok.body.runId, { status: "complete" })
      const rebuild = await prepareRun(ctx, { trigger: "rebuild", topicId: ok.body.topic.id })
      expect(rebuild.ok).toBe(true)
      expect(ok.body.topic.timeWindow).toBe("1y")
    }
    process.env = env
  })
})
