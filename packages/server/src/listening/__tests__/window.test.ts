import { afterEach, describe, expect, it } from "vitest"
import { MemoryCache } from "../cache.js"
import { executeRun, startRun } from "../engine.js"
import { prepareRun } from "../service.js"
import { newsDateOperators } from "../sources/news.js"
import { PseProvider } from "../sources/pse.js"
import { SerperProvider, tbsFor, tbsForRange } from "../sources/serper.js"
import { YoutubeSource } from "../sources/youtube.js"
import { MemoryStore } from "../store.js"
import { resetFetch, setFetch } from "../util/http.js"
import { TIME_WINDOWS, compactDay, inWindow, parseDay, resolveWindow, validateCustomRange } from "../window.js"
import { fakeDeps } from "./fakes.js"

afterEach(() => resetFetch())

const NOW = new Date("2026-10-12T15:00:00.000Z")
const day = (n: number) => new Date(Date.now() - n * 86400e3).toISOString()

describe("time ranges", () => {
  it("resolves every preset to a reach-back and Google's code, and any time to nothing", () => {
    expect(TIME_WINDOWS).toEqual(["1d", "1w", "1m", "3m", "1y", "any", "custom"])
    const reach = (tw: (typeof TIME_WINDOWS)[number]) => {
      const w = resolveWindow(tw, null, null, NOW)
      return [w.restrict, w.days, w.after ? Math.round((NOW.getTime() - w.after.getTime()) / 86400e3) : null, w.before, w.fixed]
    }
    expect(reach("1d")).toEqual(["d1", 1, 1, null, false])
    expect(reach("1w")).toEqual(["w1", 7, 7, null, false])
    expect(reach("1m")).toEqual(["m1", 31, 31, null, false])
    expect(reach("3m")).toEqual(["m3", 92, 92, null, false])
    expect(reach("1y")).toEqual(["y1", 366, 366, null, false])
    expect(reach("any")).toEqual([null, null, null, null, false])
  })

  it("resolves a custom range to whole days, inclusive of both ends", () => {
    const w = resolveWindow("custom", "2026-03-01", "2026-05-31", NOW)
    expect(w).toMatchObject({ restrict: null, fixed: true, days: 92 })
    expect(w.after!.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(w.before!.toISOString()).toBe("2026-05-31T23:59:59.999Z")
    expect(compactDay(w.after!)).toBe("20260301")
    // A custom range with no usable dates searches any time rather than failing mid-scan.
    expect(resolveWindow("custom", null, "nope", NOW)).toMatchObject({ after: null, before: null, fixed: false })
  })

  it("accepts only real, ordered, plausible custom dates and says why not", () => {
    expect(parseDay("2026-02-30")).toBeNull()
    expect(parseDay("2026-2-3")).toBeNull()
    expect(parseDay(20260203)).toBeNull()
    expect(validateCustomRange("2026-03-01", "2026-05-31", NOW)).toEqual({ ok: true, from: "2026-03-01", to: "2026-05-31" })
    expect(validateCustomRange("2026-03-01", "2026-03-01", NOW)).toMatchObject({ ok: true })
    expect(validateCustomRange("2026-03-01", null, NOW)).toEqual({ ok: false, error: "Choose both a start date and an end date" })
    expect(validateCustomRange("2026-06-01", "2026-05-31", NOW)).toEqual({ ok: false, error: "The start date must be on or before the end date" })
    expect(validateCustomRange("2026-11-01", "2026-11-30", NOW)).toEqual({ ok: false, error: "The start date cannot be in the future" })
    expect(validateCustomRange("1999-01-01", "2026-01-01", NOW)).toEqual({ ok: false, error: "Choose a start date in 2005 or later" })
  })

  it("checks a fixed range on everything dated, and a preset only on replies", () => {
    const fixed = resolveWindow("custom", "2026-03-01", "2026-05-31", NOW)
    const post = (publishedAt: string | null) => ({ publishedAt, kind: "post" as const })
    const reply = (publishedAt: string | null) => ({ publishedAt, kind: "comment" as const })
    expect(inWindow(post("2026-04-15T12:00:00Z"), fixed)).toBe(true)
    expect(inWindow(post("2026-02-27T12:00:00Z"), fixed)).toBe(false)
    expect(inWindow(post("2026-06-02T12:00:00Z"), fixed)).toBe(false)
    // A day of slack for time zones, and undated items stay.
    expect(inWindow(post("2026-02-28T12:00:00Z"), fixed)).toBe(true)
    expect(inWindow(post(null), fixed)).toBe(true)
    expect(inWindow(post("not a date"), fixed)).toBe(true)

    const week = resolveWindow("1w", null, null, NOW)
    expect(inWindow(post("2020-01-01T00:00:00Z"), week)).toBe(true)
    expect(inWindow(reply("2026-10-09T00:00:00Z"), week)).toBe(true)
    expect(inWindow(reply("2026-09-01T00:00:00Z"), week)).toBe(false)
    expect(inWindow(reply("2001-01-01T00:00:00Z"), resolveWindow("any", null, null, NOW))).toBe(true)
  })

  it("speaks each source's date dialect", async () => {
    const fixed = resolveWindow("custom", "2026-03-01", "2026-05-31", NOW)
    // Google News: the last N days, or after/before (before excludes its own day).
    expect(newsDateOperators(resolveWindow("1d", null, null, NOW))).toBe(" when:1d")
    expect(newsDateOperators(resolveWindow("1y", null, null, NOW))).toBe(" when:366d")
    expect(newsDateOperators(resolveWindow("any", null, null, NOW))).toBe("")
    expect(newsDateOperators(fixed)).toBe(" after:2026-03-01 before:2026-06-01")
    // Serper.
    expect(tbsFor("d1")).toBe("qdr:d")
    expect(tbsFor("w1")).toBe("qdr:w")
    expect(tbsFor("m1")).toBe("qdr:m")
    expect(tbsForRange(fixed.after!, fixed.before!)).toBe("cdr:1,cd_min:3/1/2026,cd_max:5/31/2026")

    const urls: string[] = []
    const bodies: any[] = []
    setFetch(async (url, init) => {
      urls.push(String(url))
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ items: [], organic: [] }), { status: 200 })
    })
    // Google: a fixed range rides on the date sort; a preset on dateRestrict; never both.
    const pse = new PseProvider("k", "cx", new MemoryCache())
    await pse.search({ q: "fafsa", sites: ["reddit.com"], start: 1, dateRestrict: null, dateRange: { after: fixed.after!, before: fixed.before! } }, "search:reddit:0")
    await pse.search({ q: "fafsa", sites: ["reddit.com"], start: 1, dateRestrict: "w1" }, "search:reddit:0")
    const a = new URL(urls[0]!).searchParams
    const b = new URL(urls[1]!).searchParams
    expect([a.get("sort"), a.get("dateRestrict")]).toEqual(["date:r:20260301:20260531", null])
    expect([b.get("sort"), b.get("dateRestrict")]).toEqual([null, "w1"])
    // Serper gets the same fixed range.
    await new SerperProvider("k", new MemoryCache()).search({ q: "fafsa", sites: ["reddit.com"], start: 1, dateRestrict: null, dateRange: { after: fixed.after!, before: fixed.before! } }, "search:reddit:0")
    expect(bodies[0].tbs).toBe("cdr:1,cd_min:3/1/2026,cd_max:5/31/2026")
    // YouTube: published after and before.
    urls.length = 0
    await new YoutubeSource("k", new MemoryCache()).harvest("fafsa", fixed, {})
    const y = new URL(urls[0]!).searchParams
    expect([y.get("publishedAfter"), y.get("publishedBefore")]).toEqual(["2026-03-01T00:00:00.000Z", "2026-05-31T23:59:59.999Z"])
    urls.length = 0
    await new YoutubeSource("k", new MemoryCache()).harvest("fafsa", resolveWindow("any", null, null, NOW), {})
    const y2 = new URL(urls[0]!).searchParams
    expect([y2.get("publishedAfter"), y2.get("publishedBefore")]).toEqual([null, null])
  })
})

describe("scans over a chosen range", () => {
  const env = () => {
    process.env["OPENAI_API_KEY"] = "test"
    process.env["GOOGLE_PSE_API_KEY"] = "test"
  }

  it("stores a custom range on the topic and refuses a bad one before anything is created", async () => {
    env()
    const store = new MemoryStore()
    const ctx = { store, userEmail: "eric.yerke@stamats.com", deps: () => fakeDeps(store) }
    const from = day(60).slice(0, 10)
    const to = day(10).slice(0, 10)
    const ok = await prepareRun(ctx, { trigger: "initial", query: "FAFSA changes", timeWindow: "custom", from, to })
    if (!ok.ok) throw new Error(ok.error)
    expect(ok.body.topic).toMatchObject({ timeWindow: "custom", windowFrom: from, windowTo: to })
    await store.finishRun(ok.body.runId, { status: "complete" })

    for (const bad of [{ from: to, to: from }, { from, to: undefined }, { from: "2026-02-30", to }]) {
      const r = await prepareRun(ctx, { trigger: "initial", query: "FAFSA changes", timeWindow: "custom", ...bad })
      expect(r).toMatchObject({ ok: false, status: 400, code: "bad_range" })
    }
    expect((await store.listTopics("eric.yerke@stamats.com")).length).toBe(1)
    // A preset ignores stray dates; an unknown range falls back to the past year.
    const preset = await prepareRun(ctx, { trigger: "initial", query: "nursing", timeWindow: "1w", from, to })
    expect(preset.ok && preset.body.topic).toMatchObject({ timeWindow: "1w", windowFrom: null, windowTo: null })
  })

  it("a custom range keeps only what is dated inside it and says what it left out", async () => {
    const run = async (from: string, to: string) => {
      const store = new MemoryStore()
      const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "online nursing degree", timeWindow: "custom", windowFrom: from, windowTo: to })
      const status = await executeRun(fakeDeps(store), { topic, runId, trigger: "initial" }, () => {})
      return { status, items: await store.allItems(topic.id), report: (await store.getTopic(topic.id))!.report! }
    }
    // The fakes' posts are dated 30 days ago.
    const inside = await run(day(45).slice(0, 10), day(15).slice(0, 10))
    expect(inside.status).toBe("complete")
    expect(inside.items.length).toBeGreaterThan(10)
    expect(inside.report.coverage.notes.join(" ")).not.toMatch(/outside the time range/)

    const outside = await run(day(400).slice(0, 10), day(300).slice(0, 10))
    expect(outside.status).toBe("complete")
    expect(outside.items).toEqual([])
    expect(outside.report.coverage.notes.join(" ")).toMatch(/Left out \d+ items dated outside the time range/)
    expect(outside.report.thin).toBe(true)
  })

  it("a short preset drops replies older than it, and keeps what the search engines returned", async () => {
    const store = new MemoryStore()
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "online nursing degree", timeWindow: "1w" })
    expect(await executeRun(fakeDeps(store), { topic, runId, trigger: "initial" }, () => {})).toBe("complete")
    const items = await store.allItems(topic.id)
    // Search hits stay (the engine applied the range); 30-day-old replies do not.
    expect(items.filter((i) => i.kind === "post").length).toBeGreaterThan(5)
    expect(items.filter((i) => i.kind === "comment")).toEqual([])
    const notes = (await store.getTopic(topic.id))!.report!.coverage.notes.join(" ")
    expect(notes).toMatch(/Left out \d+ (item|items) dated outside the time range/)
    expect(notes).toMatch(/Left out \d+ (reply|replies) dated outside the time range/)
  })
})
