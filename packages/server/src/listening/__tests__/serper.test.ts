import { afterEach, describe, expect, it } from "vitest"
import { MemoryCache } from "../cache.js"
import { buildSearch } from "../deps.js"
import { executeRun, startRun } from "../engine.js"
import { prepareRun } from "../service.js"
import { FallbackProvider, SerperProvider, explainSerperError, tbsFor } from "../sources/serper.js"
import { MemoryStore } from "../store.js"
import { HttpError, resetFetch, setFetch } from "../util/http.js"
import { FakeSearch, fakeDeps } from "./fakes.js"

class FakeSerper extends FakeSearch {
  override readonly name = "serper"
}

afterEach(() => resetFetch())

describe("Serper provider", () => {
  it("sends a Google-style site-scoped query and maps results, dates and paging", async () => {
    let sent: { url: string; body: any; key: string | null } | null = null
    setFetch(async (url, init) => {
      sent = { url, body: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get("X-API-KEY") }
      return new Response(
        JSON.stringify({
          organic: Array.from({ length: 10 }, (_, i) => ({
            title: `Thread ${i} : r/nursing`,
            link: `https://www.reddit.com/r/nursing/comments/abc${i}/t/`,
            snippet: "Who finds the clinical placement?",
            date: i === 0 ? "Mar 3, 2025" : undefined,
          })),
        }),
        { status: 200 },
      )
    })
    const p = new SerperProvider("test-key", new MemoryCache())
    const page = await p.search({ q: "online nursing", sites: ["reddit.com"], start: 11, dateRestrict: "y1" }, "search:reddit:0")
    expect(sent!.url).toBe("https://google.serper.dev/search")
    expect(sent!.key).toBe("test-key")
    expect(sent!.body).toMatchObject({ q: "online nursing site:reddit.com", num: 10, page: 2, tbs: "qdr:y" })
    expect(page.items).toHaveLength(10)
    expect(page.items[0]).toMatchObject({ platform: "reddit", kind: "post", title: "Thread 0", publishedAt: "2025-03-03T00:00:00.000Z", lane: "search:reddit:0" })
    expect(page.nextStart).toBe(21)
    expect(page.provider).toBe("serper")
  })

  it("serves repeats from cache without spending a credit", async () => {
    let calls = 0
    setFetch(async () => {
      calls++
      return new Response(JSON.stringify({ organic: [] }), { status: 200 })
    })
    const p = new SerperProvider("k", new MemoryCache())
    const req = { q: "x", sites: [], start: 1, dateRestrict: null }
    await p.search(req, "l")
    const again = await p.search(req, "l")
    expect(calls).toBe(1)
    expect(again.fromCache).toBe(true)
    expect(again.nextStart).toBeNull()
  })

  it("maps time windows and explains errors in plain words", () => {
    expect(tbsFor("y1")).toBe("qdr:y")
    expect(tbsFor(null)).toBeNull()
    expect(tbsFor("m3", new Date("2026-10-07T00:00:00Z"))).toBe("cdr:1,cd_min:7/6/2026,cd_max:10/7/2026")
    expect(explainSerperError(new HttpError(400, "x", '{"message":"Not enough credits"}')).message).toMatch(/credits are used up/)
    expect(explainSerperError(new HttpError(403, "x", "Unauthorized")).message).toMatch(/refused/)
  })
})

describe("Google first, Serper behind it", () => {
  it("moves the rest of the run to Serper on a hard Google failure", async () => {
    const google = new FakeSearch({ quota: true })
    const serper = new FakeSerper()
    const f = new FallbackProvider(google, serper)
    const req = { q: "x", sites: ["reddit.com"], start: 1, dateRestrict: null }
    const a = await f.search(req, "l")
    const b = await f.search({ ...req, start: 11 }, "l")
    expect([a.provider, b.provider]).toEqual(["serper", "serper"])
    expect(google.calls).toHaveLength(1)
    expect(serper.calls).toHaveLength(2)
    expect(f.note()).toMatch(/moved to Serper partway through \(Google: daily allowance is used up/)
  })

  it("retries a one-off failure on Serper but keeps Google for the next call", async () => {
    let failOnce = true
    const google = new FakeSearch()
    const origSearch = google.search.bind(google)
    google.search = async (req, lane) => {
      if (failOnce) {
        failOnce = false
        throw new Error("timed out after 12s")
      }
      return origSearch(req, lane)
    }
    const f = new FallbackProvider(google, new FakeSerper())
    const req = { q: "x", sites: [], start: 1, dateRestrict: null }
    expect((await f.search(req, "l")).provider).toBe("serper")
    expect((await f.search(req, "l")).provider).toBe("fake")
    expect(f.note()).toBeNull()
  })

  it("a full scan survives Google running out mid-run and counts each provider", async () => {
    const store = new MemoryStore()
    const search = new FallbackProvider(new FakeSearch({ quota: true }), new FakeSerper())
    const { topic, runId } = await startRun(store, { trigger: "initial", createdBy: "e", query: "online nursing degree", timeWindow: "1y" })
    expect(await executeRun(fakeDeps(store, { search }), { topic, runId, trigger: "initial" }, () => {})).toBe("complete")
    const r = (await store.getTopic(topic.id))!.report!
    expect(r.coverage.searchCalls).toBe(0)
    expect(r.coverage.serperCalls).toBeGreaterThan(0)
    expect(r.coverage.lanes.filter((l) => l.status === "ok").map((l) => l.lane)).toEqual(expect.arrayContaining(["reddit", "forums", "social", "reviews"]))
    expect(r.coverage.notes.join(" ")).toMatch(/moved to Serper/)
  })
})

describe("provider selection and allowance", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it("auto mode puts Serper behind Google; explicit modes pick one", () => {
    process.env["GOOGLE_PSE_API_KEY"] = "g"
    process.env["SERPER_API_KEY"] = "s"
    delete process.env["LISTENING_SEARCH"]
    expect(buildSearch(new MemoryCache())!.name).toBe("google-pse+serper")
    process.env["LISTENING_SEARCH"] = "serper"
    expect(buildSearch(new MemoryCache())!.name).toBe("serper")
    process.env["LISTENING_SEARCH"] = "google"
    expect(buildSearch(new MemoryCache())!.name).toBe("google-pse")
    delete process.env["GOOGLE_PSE_API_KEY"]
    delete process.env["LISTENING_SEARCH"]
    expect(buildSearch(new MemoryCache())!.name).toBe("serper")
  })

  it("a spent Google allowance does not block a scan when Serper is the backup", async () => {
    process.env["OPENAI_API_KEY"] = "o"
    process.env["GOOGLE_PSE_API_KEY"] = "g"
    process.env["SERPER_API_KEY"] = "s"
    delete process.env["LISTENING_SEARCH"]
    const store = new MemoryStore()
    store.searchCallsSince = async () => 99
    const r = await prepareRun({ store, userEmail: "e", deps: () => fakeDeps(store) }, { trigger: "initial", query: "nursing", timeWindow: "1y" })
    expect(r.ok).toBe(true)
    delete process.env["SERPER_API_KEY"]
    const blocked = await prepareRun({ store, userEmail: "e", deps: () => fakeDeps(store) }, { trigger: "initial", query: "nursing 2", timeWindow: "1y" })
    expect(blocked.ok).toBe(false)
  })
})
