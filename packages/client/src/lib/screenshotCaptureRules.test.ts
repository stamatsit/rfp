import { describe, it, expect } from "vitest"
import {
  MAX_PAGES_PER_RUN,
  normalizeUrlKey,
  domainOf,
  uniquePages,
  planRun,
  indexHistory,
  isCaptured,
  filterUncaptured,
  type CaptureHistoryEntry,
} from "./screenshotCaptureRules"

describe("normalizeUrlKey", () => {
  it("lowercases scheme and host, strips www, hash and trailing slash", () => {
    expect(normalizeUrlKey("HTTPS://WWW.Example.com/About/#team")).toBe("https://example.com/About")
  })
  it("keeps the query string and path case", () => {
    expect(normalizeUrlKey("https://example.com/Programs?dept=Nursing")).toBe("https://example.com/Programs?dept=Nursing")
  })
  it("treats the root with and without slash as the same key", () => {
    expect(normalizeUrlKey("https://example.com/")).toBe("https://example.com")
    expect(normalizeUrlKey("https://example.com")).toBe("https://example.com")
  })
  it("returns an empty string for an invalid url", () => {
    expect(normalizeUrlKey("not a url")).toBe("")
  })
})

describe("domainOf", () => {
  it("returns the lowercase hostname without www", () => {
    expect(domainOf("https://WWW.Coe.edu/admission")).toBe("coe.edu")
  })
  it("returns an empty string for an invalid url", () => {
    expect(domainOf("")).toBe("")
  })
})

describe("uniquePages", () => {
  it("collapses urls that share a key and keeps the first spelling", () => {
    const out = uniquePages([
      "https://www.example.com/a/",
      "https://example.com/a",
      "https://example.com/b",
    ])
    expect(out).toEqual(["https://www.example.com/a/", "https://example.com/b"])
  })
  it("drops invalid urls", () => {
    expect(uniquePages(["nope", "https://example.com/x"])).toEqual(["https://example.com/x"])
  })
})

describe("planRun", () => {
  const pages = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/p${i}`)

  it("exposes the cap as 50", () => {
    expect(MAX_PAGES_PER_RUN).toBe(50)
  })
  it("allows exactly 50 pages and counts captures per viewport choice", () => {
    const desktop = planRun(pages(50), "desktop")
    expect(desktop.ok).toBe(true)
    expect(desktop.captures).toBe(50)
    const both = planRun(pages(50), "both")
    expect(both.ok).toBe(true)
    expect(both.captures).toBe(100)
  })
  it("blocks 51 pages with the cap in the result", () => {
    const plan = planRun(pages(51), "desktop")
    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.reason).toBe("over-cap")
      expect(plan.max).toBe(50)
      expect(plan.pages.length).toBe(51)
    }
  })
  it("counts duplicates once, so 60 spellings of 40 pages is under the cap", () => {
    const dupes = [...pages(40), ...pages(20).map((u) => `${u}/`)]
    const plan = planRun(dupes, "mobile")
    expect(plan.ok).toBe(true)
    expect(plan.pages.length).toBe(40)
  })
  it("reports empty when nothing valid was given", () => {
    const plan = planRun(["", "garbage"], "desktop")
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe("empty")
  })
})

describe("history index", () => {
  const entry = (url: string, viewport: "desktop" | "mobile", capturedAt: string): CaptureHistoryEntry => ({
    id: `${url}-${viewport}-${capturedAt}`,
    url,
    viewport,
    capturedAt,
    capturedByName: "Eric",
  })

  it("keeps the most recent capture per page and viewport", () => {
    const index = indexHistory([
      entry("https://example.com/a", "desktop", "2026-09-01T00:00:00Z"),
      entry("https://www.example.com/a/", "desktop", "2026-09-20T00:00:00Z"),
      entry("https://example.com/a", "mobile", "2026-09-10T00:00:00Z"),
    ])
    const rec = index.get("https://example.com/a")
    expect(rec?.desktop?.capturedAt).toBe("2026-09-20T00:00:00Z")
    expect(rec?.mobile?.capturedAt).toBe("2026-09-10T00:00:00Z")
  })

  it("answers isCaptured per viewport choice, requiring both for 'both'", () => {
    const index = indexHistory([entry("https://example.com/a", "desktop", "2026-09-20T00:00:00Z")])
    expect(isCaptured(index, "https://example.com/a", "desktop")).toBe(true)
    expect(isCaptured(index, "https://example.com/a", "mobile")).toBe(false)
    expect(isCaptured(index, "https://example.com/a", "both")).toBe(false)
    const full = indexHistory([
      entry("https://example.com/a", "desktop", "2026-09-20T00:00:00Z"),
      entry("https://example.com/a", "mobile", "2026-09-20T00:00:00Z"),
    ])
    expect(isCaptured(full, "https://example.com/a", "both")).toBe(true)
  })

  it("filterUncaptured drops only the pages already captured for that choice", () => {
    const index = indexHistory([entry("https://example.com/a", "desktop", "2026-09-20T00:00:00Z")])
    const urls = ["https://example.com/a", "https://example.com/b"]
    expect(filterUncaptured(urls, index, "desktop")).toEqual(["https://example.com/b"])
    expect(filterUncaptured(urls, index, "mobile")).toEqual(urls)
  })
})
