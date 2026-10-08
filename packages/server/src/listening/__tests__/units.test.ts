import { describe, expect, it } from "vitest"
import { canonicalUrl, platformOf, redditThreadId, youtubeVideoId } from "../util/url.js"
import { clip, isVerbatim, originalSpan, questionSentences } from "../util/text.js"
import { explainPseError, siteScopedQuery, snippetDate } from "../sources/pse.js"
import { parseNewsRss } from "../sources/news.js"
import { extractPage, isReadable } from "../sources/reader.js"
import { verifyQuestion, verifyQuote } from "../label.js"
import { buildSearchJobs, MAX_SEARCH_CALLS_PER_RUN } from "../harvest.js"
import { collectQuestions, ideaCap, monthStats, sentimentOf, stripModelNumbers } from "../metrics.js"
import { assemblePlan, fallbackPlan } from "../plan.js"
import { noDashes } from "../report.js"
import { cleanQuery, pacificMidnight } from "../service.js"
import { HttpError } from "../util/http.js"
import type { Item, Plan } from "../types.js"

describe("canonicalUrl", () => {
  it("collapses Reddit slug, subdomain and tracking variants of one thread", () => {
    const a = canonicalUrl("https://www.reddit.com/r/Nursing/comments/1ABCdef/some_title/?utm_source=share&utm_medium=web")
    const b = canonicalUrl("http://old.reddit.com/r/nursing/comments/1abcdef/")
    const c = canonicalUrl("https://reddit.com/r/nursing/comments/1abcdef/another-slug#comments")
    expect(a).toBe("https://reddit.com/r/nursing/comments/1abcdef")
    expect(b).toBe(a)
    expect(c).toBe(a)
  })
  it("keeps Reddit comment permalinks distinct from their thread", () => {
    const thread = canonicalUrl("https://www.reddit.com/r/nursing/comments/1abcdef/t/")
    const comment = canonicalUrl("https://www.reddit.com/r/nursing/comments/1abcdef/t/k9zz1/")
    expect(comment).not.toBe(thread)
    expect(comment).toContain("k9zz1")
  })
  it("normalizes YouTube and keeps the comment id", () => {
    expect(canonicalUrl("https://youtu.be/abc123")).toBe("https://youtube.com/watch?v=abc123")
    expect(canonicalUrl("https://www.youtube.com/watch?v=abc123&feature=share&lc=C1")).toBe("https://youtube.com/watch?v=abc123&lc=C1")
  })
  it("keeps forum reply anchors but drops other hashes", () => {
    expect(canonicalUrl("https://allnurses.com/t/1#reply-3")).toBe("https://allnurses.com/t/1#reply-3")
    expect(canonicalUrl("https://allnurses.com/t/1#top")).toBe("https://allnurses.com/t/1")
  })
  it("maps hosts to platforms and extracts ids", () => {
    expect(platformOf("https://talk.collegeconfidential.com/t/x/1")).toBe("forums")
    expect(platformOf("https://www.healthgrades.com/x")).toBe("reviews")
    expect(platformOf("https://example.com")).toBe("other")
    expect(redditThreadId("https://www.reddit.com/r/a/comments/1q2w3e/x")).toBe("1q2w3e")
    expect(youtubeVideoId("https://youtube.com/shorts/AbC_123xyz")).toBe("AbC_123xyz")
  })
})

describe("verbatim checks", () => {
  const src = "I ’ve been looking at programs.  Who finds the clinical placement? It took “forever” — honestly."
  it("accepts exact text despite quote, apostrophe, dash and space differences", () => {
    expect(isVerbatim("who finds the clinical placement?", src)).toBe(true)
    expect(isVerbatim('It took "forever" - honestly.', src)).toBe(true)
  })
  it("rejects paraphrase", () => {
    expect(isVerbatim("Who arranges clinical placements?", src)).toBe(false)
  })
  it("accepts an elided quote only when every part appears in order", () => {
    expect(isVerbatim("looking at programs ... the clinical placement", src)).toBe(true)
    expect(isVerbatim("the clinical placement ... looking at programs", src)).toBe(false)
  })
  it("returns the author's original casing", () => {
    expect(originalSpan("who finds the clinical placement?", src)).toBe("Who finds the clinical placement?")
  })
  it("finds question sentences", () => {
    expect(questionSentences(src)).toContain("Who finds the clinical placement?")
  })
  it("clips at a word boundary", () => {
    expect(clip("one two three four five six", 12)).toBe("one two...")
  })
})

describe("label verification", () => {
  const src = "Has anyone done this program? I need to know if clinicals are local. It is honestly the best decision I made."
  it("keeps verbatim quotes and drops fabricated ones", () => {
    expect(verifyQuote("It is honestly the best decision I made.", src)).toBe("It is honestly the best decision I made.")
    expect(verifyQuote("This program changed my life forever.", src)).toBeNull()
  })
  it("falls back to a real question when the model paraphrases", () => {
    expect(verifyQuestion("Has anyone done this program?", src)).toBe("Has anyone done this program?")
    expect(verifyQuestion("Has anyone completed this program?", src)).toBe("Has anyone done this program?")
    expect(verifyQuestion("What is the tuition?", src)).toBeNull()
    expect(verifyQuestion("", src)).toBeNull()
  })
})

describe("Google search helpers", () => {
  it("builds site-scoped queries", () => {
    expect(siteScopedQuery("nursing", ["reddit.com"])).toBe("nursing site:reddit.com")
    expect(siteScopedQuery("nursing", ["a.com", "b.com"])).toBe("nursing (site:a.com OR site:b.com)")
  })
  it("reads snippet dates", () => {
    expect(snippetDate("Mar 3, 2025 ... text")).toBe("2025-03-03T00:00:00.000Z")
    const rel = snippetDate("4 days ago ... text", new Date("2026-10-07T00:00:00Z"))
    expect(rel).toBe("2026-10-03T00:00:00.000Z")
    expect(snippetDate("no date here")).toBeNull()
  })
  it("explains quota, wrong-project and bad-key errors", () => {
    expect(explainPseError(new HttpError(429, "x", "rateLimitExceeded")).message).toMatch(/allowance is used up/)
    expect(explainPseError(new HttpError(403, "x", "This project does not have the access to Custom Search JSON API.")).message).toMatch(/grandfathered/)
    expect(explainPseError(new HttpError(400, "x", "API key not valid")).message).toMatch(/invalid/)
  })
})

describe("news RSS", () => {
  it("parses items and strips the source suffix from titles", () => {
    const xml = `<rss><channel><item><title>Colleges see enrollment rise - The Times</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 05 Oct 2026 12:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Colleges see enrollment rise&lt;/a&gt; more text</description><source url="https://t.com">The Times</source></item></channel></rss>`
    const items = parseNewsRss(xml)
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe("Colleges see enrollment rise")
    expect(items[0]!.author).toBe("The Times")
    expect(items[0]!.publishedAt).toBe("2026-10-05T12:00:00.000Z")
  })
})

describe("page reader", () => {
  it("extracts XenForo posts as body plus replies", () => {
    const html = `<html><head><title>Thread</title></head><body><nav>menu</nav>
      <div class="message-body"><div class="bbWrapper">First post asking whether online programs are respected by hospitals at all.</div></div>
      <div class="message-body"><div class="bbWrapper">Reply one: my hospital did not care at all, they wanted the license.</div></div>
      <div class="message-body"><div class="bbWrapper">ok</div></div></body></html>`
    const r = extractPage(html, "https://forums.studentdoctor.net/threads/x.1/")
    expect(r.body).toContain("First post asking")
    expect(r.comments).toHaveLength(1)
    expect(r.comments[0]!.url).toBe("https://forums.studentdoctor.net/threads/x.1/#reply-1")
  })
  it("refuses login-walled platforms", () => {
    expect(isReadable("https://www.facebook.com/groups/x")).toBe(false)
    expect(isReadable("https://www.linkedin.com/posts/x")).toBe(false)
    expect(isReadable("https://www.reddit.com/r/x/comments/1/")).toBe(true)
  })
})

describe("search job planning", () => {
  const plan: Plan = {
    interpretation: "",
    isNamedEntity: false,
    disambiguation: "",
    searches: [
      { q: "a", why: "", cursors: { reddit: 21, forums: null, social: 11, reviews: 11 } },
      { q: "b", why: "", cursors: { reddit: 11, forums: 11, social: null, reviews: null } },
      { q: "c", why: "", addedRunId: "run2" },
    ],
    broaderSuggestions: [],
  }
  it("first run: every phrasing x group plus an extra Reddit page", () => {
    const jobs = buildSearchJobs({ ...plan, searches: plan.searches.slice(0, 2) }, "initial", "run1")
    expect(jobs).toHaveLength(2 * 4 + 1)
    expect(jobs.filter((j) => j.start !== 1)).toEqual([{ searchIndex: 0, groupId: "reddit", start: 11, moveCursor: true }])
  })
  it("rescan: fresh page 1 without moving cursors, new phrasing, then deeper pages, never exhausted ones", () => {
    const jobs = buildSearchJobs(plan, "rescan", "run2")
    const fresh = jobs.filter((j) => j.searchIndex === 0 && j.start === 1)
    expect(fresh.every((j) => !j.moveCursor)).toBe(true)
    expect(jobs.filter((j) => j.searchIndex === 2).map((j) => j.start)).toEqual([1, 1, 1, 1])
    expect(jobs.some((j) => j.searchIndex === 0 && j.groupId === "forums" && j.start > 1)).toBe(false)
    expect(jobs.find((j) => j.searchIndex === 0 && j.groupId === "reddit" && j.start === 21)).toBeTruthy()
    expect(jobs.length).toBeLessThanOrEqual(MAX_SEARCH_CALLS_PER_RUN)
  })
})

describe("metrics", () => {
  const mk = (id: string, sentiment: "positive" | "negative" | "neutral" | "mixed", question: string | null, score = 0, publishedAt: string | null = "2026-09-10T00:00:00Z"): Item => ({
    id, topicId: "t", firstSeenRunId: "r1", url: `https://reddit.com/${id}`, platform: "reddit", kind: "post", title: "", text: "",
    publishedAt, engagement: { score }, lane: "x", depth: "snippet", createdAt: "",
    labels: { relevant: true, sentiment, subtopic: "x", audience: "student", question, quote: null },
  })
  it("computes sentiment counts and score in code", () => {
    const s = sentimentOf([mk("a", "positive", null), mk("b", "negative", null), mk("c", "negative", null), mk("d", "neutral", null)])
    expect(s).toEqual({ positive: 1, neutral: 1, negative: 2, mixed: 0, score: -25 })
  })
  it("dedupes near-identical questions, keeping the most engaged", () => {
    const qs = collectQuestions(
      [mk("a", "neutral", "Who finds clinical placements for online students?", 1), mk("b", "neutral", "Who finds the clinical placements for online students?", 50), mk("c", "neutral", "How much does it cost per credit?", 5)],
      new Map(),
      "r1",
    )
    expect(qs.map((q) => q.itemId)).toEqual(["b", "c"])
  })
  it("buckets the last 12 months", () => {
    const m = monthStats([mk("a", "neutral", null, 0, "2026-09-10T00:00:00Z"), mk("b", "neutral", null, 0, "2024-01-01T00:00:00Z"), mk("c", "neutral", null, 0, null)], new Date("2026-10-07T00:00:00Z"))
    expect(m).toHaveLength(12)
    expect(m[m.length - 1]!.month).toBe("2026-10")
    expect(m.find((x) => x.month === "2026-09")!.count).toBe(1)
    expect(m.reduce((s, x) => s + x.count, 0)).toBe(1)
  })
  it("keeps only people's own questions: no news headlines or video titles", () => {
    const news = { ...mk("n", "neutral", "Will your family win or lose under FAFSA?"), platform: "news" as const, kind: "article" as const }
    const video = { ...mk("v", "neutral", "Is an online nursing degree respected?"), platform: "youtube" as const, kind: "video" as const }
    const comment = { ...mk("c", "neutral", "Did your school find your preceptor?"), platform: "youtube" as const, kind: "comment" as const }
    expect(collectQuestions([news, video, comment], new Map(), "r1").map((q) => q.itemId)).toEqual(["c"])
  })
  it("scales the number of ideas to the sample", () => {
    expect([ideaCap(8), ideaCap(20), ideaCap(30), ideaCap(200)]).toEqual([2, 3, 5, 8])
  })
  it("strips model sentences that state numbers", () => {
    expect(stripModelNumbers("People worry. About 40% are negative. Many love it.")).toBe("People worry. Many love it.")
  })
})

describe("plan assembly", () => {
  it("quotes a named entity and drops duplicate or site: phrasings", () => {
    const p = assemblePlan("coe college", {
      interpretation: "A college in Iowa.",
      isNamedEntity: true,
      entityName: "Coe College",
      disambiguation: "Not the Japanese COE visa.",
      searches: [{ q: "Coe College", why: "dup" }, { q: "coe college tuition site:reddit.com", why: "x" }, { q: "coe college reviews", why: "y" }],
      broaderSuggestions: ["Iowa colleges"],
    })
    expect(p.searches[0]!.q).toBe('"Coe College"')
    expect(p.searches.map((s) => s.q)).toEqual(['"Coe College"', "coe college tuition", "coe college reviews"])
  })
  it("falls back to the topic as written", () => {
    expect(fallbackPlan("Houston Methodist").searches[0]!.q).toBe('"Houston Methodist"')
    expect(fallbackPlan("college enrollment trends").searches[0]!.q).toBe("college enrollment trends")
  })
})

describe("service helpers", () => {
  it("cleans and bounds the query", () => {
    expect(cleanQuery("  online   nursing \n degree ")).toBe("online nursing degree")
    expect(cleanQuery("a")).toBeNull()
    expect(cleanQuery("x".repeat(141))).toBeNull()
    expect(cleanQuery(42)).toBeNull()
  })
  it("finds midnight Pacific in summer and winter", () => {
    expect(pacificMidnight(new Date("2026-10-08T02:00:00Z")).toISOString()).toBe("2026-10-07T07:00:00.000Z")
    expect(pacificMidnight(new Date("2026-12-15T20:00:00Z")).toISOString()).toBe("2026-12-15T08:00:00.000Z")
  })
  it("removes em and en dashes from model text", () => {
    expect(noDashes("Flexible — but costly; 2025–2026")).toBe("Flexible, but costly; 2025-2026")
  })
})
