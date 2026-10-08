import { describe, expect, it } from "vitest"
import { checkReport } from "../checks.js"
import { executeRun, groupLaneNotes, startRun } from "../engine.js"
import { cancelRun, prepareRun } from "../service.js"
import { ActiveRunError, MemoryStore, within } from "../store.js"
import type { RunEvent } from "../types.js"
import { FakeLlm, FakeSearch, fakeDeps, fakeYoutube } from "./fakes.js"

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
    // News is context, not conversation.
    expect(r.news.length).toBe(1)
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
    // Previously labeled items kept their labels.
    for (const b of before) expect(after.find((a) => a.id === b.id)!.labels).toEqual(b.labels)
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
