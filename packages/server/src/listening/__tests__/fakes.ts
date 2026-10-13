/**
 * Deterministic stand-ins for the model and every source, so engine tests run
 * offline, cost nothing, and can force each failure path.
 */
import type { EngineDeps } from "../engine.js"
import type { LlmClient, LlmUsage, StructuredArgs } from "../llm.js"
import { LlmError, newUsage } from "../llm.js"
import type { NewsSource } from "../sources/news.js"
import type { SearchPage, SearchProvider, SearchRequest } from "../sources/pse.js"
import type { PageReader, ReadResult } from "../sources/reader.js"
import type { YoutubeHarvest, YoutubeSource } from "../sources/youtube.js"
import type { Store } from "../store.js"
import type { RawItem } from "../types.js"

export interface FakeLlmOpts {
  failOn?: Set<string>
  /** Return a quote that is NOT in the source text, to prove verification drops it. */
  fabricateQuotes?: boolean
  delayMs?: number
  /** Plan the topic as this named institution. */
  namedEntity?: string
  /** The idea check finds only one supporting post for ideas with these headlines. */
  rejectIdeas?: string[]
  /** Drafts come back with almost nothing in them. */
  thinDrafts?: boolean
  /** These calls fail the way the real model client fails (an LlmError). */
  llmErrorOn?: Set<string>
}

/**
 * Item text markers the fake labeler reads: OFFTOPIC (not relevant), MENTION
 * (relevant, passing mention), and in the link: OfficialAccount (the named
 * institution's own account), newsdesk (a news outlet).
 */

export class FakeLlm implements LlmClient {
  calls: string[] = []
  /** The last prompt sent for each call name. */
  prompts = new Map<string, string>()
  private meter = newUsage()
  constructor(private opts: FakeLlmOpts = {}) {}
  usage(): LlmUsage {
    return { ...this.meter }
  }
  async structured<T>(args: StructuredArgs<T>): Promise<T> {
    this.calls.push(args.name)
    this.prompts.set(args.name, args.user)
    this.meter.calls++
    if (this.opts.delayMs) {
      await new Promise((r, j) => {
        const t = setTimeout(r, this.opts.delayMs)
        args.signal?.addEventListener("abort", () => {
          clearTimeout(t)
          j(args.signal!.reason)
        })
      })
    }
    if (args.signal?.aborted) throw args.signal.reason
    if (this.opts.failOn?.has(args.name)) throw new Error(`fake failure in ${args.name}`)
    if (this.opts.llmErrorOn?.has(args.name)) throw new LlmError("api", `fake model outage in ${args.name}`)
    switch (args.name) {
      case "listening_plan":
        return {
          interpretation: "How people judge online nursing degrees.",
          isNamedEntity: !!this.opts.namedEntity,
          entityName: this.opts.namedEntity ?? null,
          disambiguation: "Not unrelated online degrees.",
          searches: [
            { q: "is an online nursing degree worth it", why: "value" },
            { q: "online nursing clinicals", why: "clinicals" },
          ],
          broaderSuggestions: ["nursing school", "online degrees", "RN to BSN"],
        } as T
      case "listening_plan_extend":
        return { searches: [{ q: "online nursing program regrets", why: "regrets" }] } as T
      case "listening_labels": {
        const items = [...args.user.matchAll(/\[(a\d+)\]([^\n]*)\n(?:Title: ([^\n]*)\n)?([^\n]*)/g)].map((m) => {
          const alias = m[1]!
          const header = m[2] ?? ""
          const text = `${m[3] ?? ""} ${m[4] ?? ""}`
          const q = text.match(/[^.!?]{12,}\?/)?.[0]?.trim() ?? ""
          const firstSentence = (m[4] ?? "").split(/(?<=[.!?])\s/)[0] ?? ""
          return {
            id: alias,
            relevant: !/OFFTOPIC/.test(text),
            about: !/MENTION/.test(text),
            speaker: /OfficialAccount/.test(header) ? "self" : /newsdesk/i.test(header) ? "media" : "person",
            sentiment: /hate|bad|scam/i.test(text) ? "negative" : /love|great/i.test(text) ? "positive" : "neutral",
            subtopic: /clinical/i.test(text) ? "clinical placement" : /cost|price/i.test(text) ? "cost and aid" : "program quality",
            audience: "student",
            question: q,
            quote: this.opts.fabricateQuotes ? "This sentence was never written by anyone at all." : firstSentence.length >= 12 ? firstSentence : "",
          }
        })
        return { items } as T
      }
      case "listening_clusters":
        return {
          clusters: [
            { name: "Clinical placement", description: "Who finds clinical sites.", labels: ["clinical placement"] },
            { name: "Cost and aid", description: "Paying for school.", labels: ["cost and aid"] },
            { name: "Program quality", description: "Is it respected.", labels: ["program quality"] },
          ],
        } as T
      case "listening_synthesis": {
        const ev = [...args.user.matchAll(/\[(e\d+)\]/g)].map((m) => m[1]!)
        const subs = [...args.user.matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]!)
        const qs = [...args.user.matchAll(/\[(q\d+)\]/g)].map((m) => m[1]!)
        return {
          summary: "People weigh flexibility against clinical quality — and worry about cost. About 40% are negative.",
          ownVoiceNote: /own accounts/.test(args.user) ? "Its own posts celebrate events — people ask who finds placements." : "",
          subtopics: subs.map((id) => ({ id, summary: `Notes for ${id}.` })),
          questionOrder: qs.slice().reverse(),
          ideas: [
            { headline: "Who finds your clinical placement", angle: "a", audience: "student", format: "guide", subtopicId: subs[0] ?? "s1", whyNow: "w", outline: ["one", "two", "three"], evidence: ev.slice(0, 3) },
            { headline: "Unsupported idea", angle: "a", audience: "student", format: "article", subtopicId: "s9", whyNow: "w", outline: ["x"], evidence: ["e999"] },
            { headline: "The real cost", angle: "a", audience: "parent", format: "article", subtopicId: subs[1] ?? "s2", whyNow: "w", outline: ["a", "b", "c"], evidence: ev.slice(1, 4) },
          ],
        } as T
      }
      case "listening_idea_check": {
        const ideas = [...args.user.matchAll(/^\[(i\d+)\] ([^\n]*)((?:\n {2}[^\n]*)*)/gm)].map((m) => {
          const ev = [...(m[3] ?? "").matchAll(/\[(e\d+_\d+)\]/g)].map((x) => x[1]!)
          const reject = this.opts.rejectIdeas?.includes(m[2]!.trim())
          return { id: m[1]!, supporting: reject ? ev.slice(0, 1) : ev }
        })
        return { ideas } as T
      }
      // One repeat of an existing idea, one new idea, one resting on a single post, one the
      // second check can reject (rejectIdeas), and one more new idea.
      case "listening_more_ideas": {
        const ev = [...args.user.matchAll(/\[(e\d+)\]/g)].map((m) => m[1]!)
        const subs = [...args.user.matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]!)
        const idea = (headline: string, evidence: string[], n = 0) => ({ headline, angle: "a", audience: "student", format: "FAQ page", subtopicId: subs[n] ?? "s1", whyNow: "w", outline: ["one", "two", "three"], evidence })
        return {
          ideas: [
            idea("Who finds your clinical placement", ev.slice(0, 3)),
            idea("Questions to ask before you enroll", ev.slice(0, 3)),
            idea("One post is not enough", ev.slice(0, 1)),
            idea("Rejected by the second check", ev.slice(1, 4)),
            idea("What the real cost leaves out", ev.slice(2, 5), 1),
          ],
        } as T
      }
      // Drafts deliberately break every rule once, so the checks have something to catch:
      // a dash, a statistic no post contains, an invented quotation, and post numbers that do not exist.
      case "listening_draft_blog_outline":
        if (this.opts.thinDrafts) return { workingTitle: "Thin", reader: "r", angle: "a", sections: [{ heading: "Only one", points: ["p"], sources: [] }], close: "c" } as T
        return {
          workingTitle: "Who arranges your clinical placement — and when to ask",
          reader: "Prospective online nursing students who worry about finding a clinical site.",
          angle: "Placement support varies by program. About 73% of programs leave it to students.",
          sections: [
            { heading: "What students are asking", points: ["Open with the question people keep raising", "Unpack \"nobody tells you who finds the site\" in plain words"], sources: [1, 2, 99] },
            { heading: "How placement usually works", points: ["Describe the common arrangements", "Mention that 9 in 10 students struggle"], sources: [2] },
            { heading: "Questions to ask a program", points: ["List what to ask before enrolling", "Name the fear: \"the clinical placement was a nightmare\""], sources: [] },
            { heading: "", points: ["A section with no heading"], sources: [] },
            { heading: "Next steps", points: ["Point to the admissions contact"], sources: [0, 1.5, 1, 1] },
          ],
          close: "End with the one question to ask an advisor.",
        } as T
      case "listening_draft_linkedin_post":
        if (this.opts.thinDrafts) return { post: "Too short.", hashtags: [] } as T
        return {
          post: [
            "Online nursing students keep asking one thing — who actually finds the clinical placement? #nursing",
            "It comes up again and again. One student said \"my advisor promised a placement in week one\" and that is the worry in a sentence.",
            "A recent study found 68% of students were never told. That gap is where trust is lost.",
            "The fix is not complicated. Say who arranges placements, when it happens, and what the student has to do. Put it where a prospective student will see it before they apply.",
            "What does your program page say about clinical placement today?",
          ].join("\n\n"),
          hashtags: ["#HigherEd", "nursing education", "x", "Enrollment", "OneTooMany"],
        } as T
      case "listening_draft_headlines":
        if (this.opts.thinDrafts) return { headlines: [{ text: "Only one", style: "direct" }] } as T
        return {
          headlines: [
            { text: "Who finds your clinical placement", style: "question" },
            { text: "Who arranges clinical placements for online nursing students?", style: "question" },
            { text: "How to ask a nursing program about clinical placement", style: "how-to" },
            { text: "Clinical placement — what online programs owe you", style: "direct" },
            { text: "7 things to ask before you enroll", style: "direct" },
            { text: "No, you should not have to find your own clinical site", style: "myth" },
            { text: "How to ask a nursing program about clinical placement", style: "how-to" },
            { text: "I love my online program, but who finds the placement?", style: "reader voice" },
            { text: "What online nursing students wish they had asked first", style: "reader voice" },
            { text: "Clinical placement, explained for online students", style: "direct" },
          ],
        } as T
      default:
        throw new Error(`FakeLlm: unexpected ${args.name}`)
    }
  }
}

let seq = 0
export function fakeItem(over: Partial<RawItem> & { url: string }): RawItem {
  return {
    platform: "reddit",
    kind: "post",
    title: `Thread ${++seq}`,
    text: "I love the flexibility of my online program. Who finds the clinical placement for online students?",
    // Thirty days ago, so date-range checks behave the same whenever the tests run.
    publishedAt: new Date(Date.now() - 30 * 86400e3).toISOString(),
    engagement: { score: 10, comments: 4 },
    lane: "search:reddit:0",
    depth: "snippet",
    ...over,
  }
}

/**
 * Search provider that returns `perPage` distinct items per (query, group, page).
 * Result i of each page: 0 and 1 are people's posts about the topic, 2 is off
 * topic, 3 is a passing mention. On the social group, result 0 comes from the
 * institution's own account and result 1 from a news outlet. URLs carry
 * "i<index>s" so tests can tell which result a URL was.
 */
export class FakeSearch implements SearchProvider {
  readonly name: string = "fake"
  calls: SearchRequest[] = []
  constructor(private opts: { perPage?: number; fail?: boolean; quota?: boolean } = {}) {}
  async search(req: SearchRequest, laneId: string): Promise<SearchPage> {
    this.calls.push(req)
    if (this.opts.quota) throw new Error("Google search daily allowance is used up (resets at midnight Pacific)")
    if (this.opts.fail) throw new Error("Google search error 500")
    const n = this.opts.perPage ?? 4
    const site = req.sites[0] ?? "reddit.com"
    const slug = req.q.toLowerCase().replace(/[^a-z0-9]/g, "")
    const social = site === "facebook.com"
    const items: RawItem[] = Array.from({ length: n }, (_, i) => {
      const id = `${slug.slice(0, 6)}${req.start}i${i}s${site.length}`
      const account = social && i === 0 ? "OfficialAccount" : social && i === 1 ? "newsdesk" : "nursing"
      return fakeItem({
        url: `https://www.${site}/r/${account}/comments/${id}/t/`,
        platform: site.includes("reddit") ? "reddit" : social ? "facebook" : "forums",
        text:
          i === 0
            ? "The clinical placement was a nightmare and I hate how they handled it. Who finds placements for online students?"
            : i === 1
              ? "Cost matters most to me. What did you pay per credit hour for the program?"
              : i === 2
                ? "OFFTOPIC visa paperwork thread about something else entirely."
                : "MENTION I studied nursing online years ago, anyway here is my sourdough recipe. Will be bored?",
        lane: laneId,
      })
    })
    return { items, returned: n, nextStart: req.start < 91 ? req.start + 10 : null, fromCache: false }
  }
}

/** Which FakeSearch result a URL was (0 to 3), or null. */
export function resultIndex(url: string): number | null {
  const m = url.match(/i(\d)s\d+/)
  return m ? Number(m[1]) : null
}

export function fakeYoutube(opts: { fail?: boolean } = {}): YoutubeSource {
  return {
    async harvest(): Promise<YoutubeHarvest> {
      if (opts.fail) throw new Error("YouTube quotaExceeded")
      return {
        items: [
          fakeItem({ url: "https://www.youtube.com/watch?v=abc123", platform: "youtube", kind: "video", text: "Is an online nursing degree respected? Here is my experience.", lane: "youtube" }),
          fakeItem({
            url: "https://www.youtube.com/watch?v=abc123&lc=c1",
            platform: "youtube",
            kind: "comment",
            text: "This was great, I love that you explained clinicals. Did your school find your preceptor?",
            lane: "youtube",
            depth: "full",
            parentUrl: "https://www.youtube.com/watch?v=abc123",
          }),
        ],
        units: 101,
        nextPageToken: "NEXT",
        videos: 1,
        commentVideos: 1,
        notes: [],
      }
    },
  } as unknown as YoutubeSource
}

export function fakeNews(): NewsSource {
  return {
    async harvest(): Promise<RawItem[]> {
      return [fakeItem({ url: "https://news.google.com/rss/articles/xyz", platform: "news", kind: "article", text: "State board reviews online nursing programs.", lane: "news" })]
    },
  } as unknown as NewsSource
}

export function fakeReader(calls: string[] = []): PageReader {
  return {
    async read(url: string): Promise<ReadResult> {
      calls.push(url)
      if (url.includes("collegeconfidential")) throw new Error("access refused (403)")
      return {
        body: "Full thread body. The clinical placement process took months. Who finds placements for online students?",
        comments: [
          fakeItem({
            url: `${url.replace(/\/$/, "")}/_/c${url.length}/`,
            kind: "comment",
            text: "Great question, my school found mine but it took forever. Did yours charge a placement fee?",
            depth: "full",
            lane: "read:reddit",
          }),
        ],
        via: "reddit-archive",
      }
    },
  } as unknown as PageReader
}

export function fakeDeps(store: Store, over: Partial<EngineDeps> = {}): EngineDeps {
  return {
    store,
    llm: new FakeLlm(),
    search: new FakeSearch(),
    youtube: fakeYoutube(),
    news: fakeNews(),
    reader: fakeReader(),
    ...over,
  }
}
