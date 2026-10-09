/**
 * Fixture data and API mocks for the Topic Ideation e2e and visual specs.
 * Synthetic content only (no scraped third-party text).
 */
import type { Page, Route } from "@playwright/test"

export const TOPIC_ID = "11111111-1111-4111-8111-111111111111"
export const RUN_1 = "22222222-2222-4222-8222-222222222222"
export const RUN_2 = "33333333-3333-4333-8333-333333333333"

export const sent = (positive: number, neutral: number, negative: number, mixed = 0) => {
  const total = positive + neutral + negative + mixed
  return { positive, neutral, negative, mixed, score: total ? Math.round((100 * (positive - negative)) / total) : 0 }
}

export function item(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `item-${n}`,
    url: `https://www.reddit.com/r/nursing/comments/t${n}/thread_${n}/`,
    platform: "reddit",
    kind: "post",
    title: `Thread ${n} about online nursing clinicals`,
    excerpt: `Post ${n}: who finds the clinical placement when you study online? I am worried about it.`,
    author: `user${n}`,
    publishedAt: "2026-09-12T00:00:00.000Z",
    engagement: 40 - n,
    depth: n % 2 ? "full" : "snippet",
    relevant: true,
    about: true,
    speaker: "person",
    counted: true,
    sentiment: n % 3 === 0 ? "negative" : n % 3 === 1 ? "positive" : "neutral",
    audience: "student",
    subtopicId: n <= 6 ? "s1" : "s2",
    isNew: false,
    ...over,
  }
}

const OWN_NAME = "Coe College"

export function buildDetail(
  opts: {
    runs?: number
    newItems?: number
    degraded?: boolean
    withReport?: boolean
    /** 1 = a report saved before speaker and focus labels existed. */
    version?: 1 | 2
    /** A named institution with posts from its own accounts. */
    institution?: boolean
    noIdeas?: boolean
    thin?: boolean
    /** Someone else shared this topic with the signed-in user. */
    viewer?: boolean
    shared?: boolean
    /** Who created the topic and ran its scans; defaults to Eric, or Mariah for a viewer. */
    owner?: string
  } = {},
) {
  const legacy = opts.version === 1
  const owner = opts.owner ?? (opts.viewer ? "mariah.tang@stamats.com" : "eric.yerke@stamats.com")
  const query = opts.institution ? OWN_NAME : "online nursing degree"
  const items = [
    ...Array.from({ length: 10 }, (_, i) => item(i + 1)),
    item(11, { platform: "youtube", kind: "comment", url: "https://youtube.com/watch?v=vid1&lc=c1", title: "", excerpt: "Great video, my school found my preceptor for me." }),
    item(12, { relevant: false, about: false, counted: false, sentiment: null, subtopicId: null, url: "https://www.reddit.com/r/japan/comments/off1/coe_visa/", title: "COE visa delay", excerpt: "Off topic thread about a visa." }),
    ...(legacy
      ? []
      : [
          item(13, { about: false, counted: false, subtopicId: null, platform: "quora", url: "https://www.quora.com/Where-would-you-rather-live", title: "Where would you rather live?", excerpt: "Long answer about cities that mentions the campus once." }),
          item(14, { speaker: "media", counted: false, subtopicId: null, platform: "facebook", url: "https://www.facebook.com/newsdesk/posts/nursing-board", title: "State board reviews online programs", excerpt: "A TV station's post about a board review." }),
        ]),
    ...(opts.institution
      ? Array.from({ length: 4 }, (_, i) =>
          item(30 + i, {
            speaker: "self",
            counted: false,
            subtopicId: null,
            platform: "facebook",
            url: `https://www.facebook.com/CoeCollege/posts/own-${i}`,
            title: ["Homecoming registration is open", "Proud of our new rankings", "Welcome to orientation week", "Our new aviation program"][i],
            excerpt: "A post from the college's own page.",
            publishedAt: `2026-09-2${i}T00:00:00.000Z`,
          }),
        )
      : []),
    ...(opts.newItems ? Array.from({ length: opts.newItems }, (_, i) => item(20 + i, { isNew: true, subtopicId: "s2" })) : []),
  ].map((it) => (legacy ? { ...it, about: undefined, speaker: undefined, counted: undefined } : it))
  const relevant = items.filter((i) => i.relevant)
  const counted = legacy ? relevant : items.filter((i) => i.counted)
  const own = items.filter((i) => i.speaker === "self")
  const report = {
    version: legacy ? 1 : 2,
    topicId: TOPIC_ID,
    runId: opts.runs && opts.runs > 1 ? RUN_2 : RUN_1,
    generatedAt: "2026-10-07T20:00:00.000Z",
    query,
    interpretation: "How people judge online nursing degrees.",
    summary: "People weigh flexibility against clinical quality and worry about who arranges placements.",
    totals: {
      collected: items.length,
      relevant: counted.length,
      newThisRun: opts.newItems ?? relevant.length,
      fullyRead: 5,
      runs: opts.runs ?? 1,
      ...(legacy ? {} : { excluded: { mentions: 1, self: own.length, organizations: 0, media: 1 } }),
    },
    ...(legacy
      ? {}
      : {
          ownVoice: own.length
            ? {
                name: OWN_NAME,
                note: "Its own posts celebrate rankings and events, while people ask about cost and campus life.",
                count: own.length,
                posts: own.slice(0, 3).map((p) => ({ itemId: p.id, url: p.url, platform: p.platform, title: p.title, excerpt: p.excerpt, publishedAt: p.publishedAt, isNew: false })),
              }
            : null,
        }),
    sentiment: sent(4, 4, 3),
    subtopics: [
      { id: "s1", name: "Clinical placement", summary: "Students ask who finds clinical sites.", itemIds: relevant.filter((i) => i.subtopicId === "s1").map((i) => i.id), share: 55, count: relevant.filter((i) => i.subtopicId === "s1").length, sentiment: sent(2, 2, 2), newCount: 0 },
      { id: "s2", name: "Cost and aid", summary: "Price per credit dominates.", itemIds: relevant.filter((i) => i.subtopicId === "s2").map((i) => i.id), share: 45, count: relevant.filter((i) => i.subtopicId === "s2").length, sentiment: sent(2, 2, 1), newCount: opts.newItems ?? 0 },
    ],
    questions: [
      { text: "Who finds the clinical placement when you study online?", itemId: "item-1", url: "https://www.reddit.com/r/nursing/comments/t1/thread_1/", platform: "reddit", audience: "student", subtopicId: "s1", engagement: 39, isNew: false },
      { text: "Did your school find your preceptor?", itemId: "item-11", url: "https://youtube.com/watch?v=vid1&lc=c1", platform: "youtube", audience: "student", subtopicId: "s1", engagement: 29, isNew: false },
    ],
    quotes: [{ text: "I am worried about it.", itemId: "item-3", url: "https://www.reddit.com/r/nursing/comments/t3/thread_3/", platform: "reddit", sentiment: "negative", subtopicId: "s1", isNew: false }],
    ideas: opts.noIdeas
      ? []
      : [
          { id: "idea1", headline: "Who finds your clinical placement in an online program", angle: "Answer the question students keep asking.", audience: "student", format: "guide", subtopicId: "s1", whyNow: "It is the most repeated worry.", outline: ["Who arranges placements", "What to ask before enrolling", "Red flags"], evidenceItemIds: ["item-1", "item-3", "item-11"] },
          { id: "idea2", headline: "The real cost per credit, explained", angle: "Show the full price.", audience: "parent", format: "article", subtopicId: "s2", whyNow: "Price confusion is common.", outline: ["Tuition", "Fees"], evidenceItemIds: ["item-7", "item-8"] },
        ],
    news: [{ itemId: "item-1", title: "State board reviews online nursing programs", url: "https://news.google.com/rss/articles/x", source: "The Times", publishedAt: "2026-10-01T00:00:00.000Z", isNew: false }],
    platforms: [
      { platform: "reddit", count: 10 + (opts.newItems ?? 0), sentiment: sent(3, 4, 3) },
      { platform: "youtube", count: 1, sentiment: sent(1, 0, 0) },
    ],
    months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`.replace("2026-11", "2025-11").replace("2026-12", "2025-12"), count: i % 3 })),
    thin: !!opts.thin,
    broaderSuggestions: ["nursing school", "online degrees"],
    coverage: {
      lanes: [
        { lane: "reddit", label: "Reddit", status: "ok", count: 40, ms: 500 },
        { lane: "youtube", label: "YouTube", status: opts.degraded ? "failed" : "ok", count: opts.degraded ? 0 : 90, ms: 900, note: opts.degraded ? "daily quota used up" : undefined },
      ],
      degraded: !!opts.degraded,
      notes: opts.degraded ? ["YouTube: daily quota used up"] : [],
      searchCalls: 12,
      youtubeUnits: 100,
    },
    analysisSource: "llm",
    warnings: [],
  }
  const runs = [
    ...(opts.runs && opts.runs > 1 ? [{ id: RUN_2, topicId: TOPIC_ID, createdBy: owner, status: "complete", trigger: "rescan", startedAt: "2026-10-07T21:00:00.000Z", completedAt: "2026-10-07T21:02:00.000Z", newItems: opts.newItems ?? 0, totalItems: items.length, relevantItems: relevant.length, sentimentScore: 9, searchCalls: 20, costUsd: 0.03, error: null }] : []),
    { id: RUN_1, topicId: TOPIC_ID, createdBy: owner, status: "complete", trigger: "initial", startedAt: "2026-10-07T20:00:00.000Z", completedAt: "2026-10-07T20:02:00.000Z", newItems: 12, totalItems: 12, relevantItems: 11, sentimentScore: 9, searchCalls: 12, costUsd: 0.04, error: null },
  ]
  return {
    topic: {
      id: TOPIC_ID,
      createdBy: owner,
      shared: opts.shared ?? !!opts.viewer,
      sharedAt: opts.shared ?? !!opts.viewer ? "2026-10-07T21:00:00.000Z" : null,
      query,
      timeWindow: "1y",
      plan: {
        interpretation: "x",
        isNamedEntity: !!opts.institution,
        entityName: opts.institution ? OWN_NAME : null,
        disambiguation: "Not visas.",
        searches: [{ q: opts.institution ? `"${OWN_NAME}"` : "online nursing degree", why: "Your topic as written" }, { q: "online nursing clinicals", why: "clinicals" }],
        broaderSuggestions: [],
      },
      report: opts.withReport === false ? null : report,
      itemCount: items.length,
      relevantCount: counted.length,
      sentimentScore: 9,
      headline: report.summary,
      lastRunAt: "2026-10-07T20:02:00.000Z",
      lastRunStatus: "complete",
      createdAt: "2026-10-07T20:00:00.000Z",
      updatedAt: "2026-10-07T20:02:00.000Z",
    },
    role: (opts.viewer ? "viewer" : "owner") as "viewer" | "owner",
    items,
    runs,
    activeRun: null,
    savedIdeas: {} as Record<string, string>,
  }
}

export const sse = (events: unknown[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("")

export const RUN_EVENTS = (trigger: "initial" | "rescan" | "rebuild", runId: string) => [
  { type: "started", topicId: TOPIC_ID, runId, trigger },
  { type: "stage", stage: "plan" },
  { type: "plan", plan: { interpretation: "", isNamedEntity: false, disambiguation: "", searches: [{ q: "online nursing degree", why: "" }], broaderSuggestions: [] } },
  { type: "stage", stage: "search" },
  { type: "lane", lane: { lane: "reddit", label: "Reddit", status: "ok", count: 40, ms: 500 } },
  { type: "stage", stage: "label", detail: "12" },
  { type: "counts", labeled: 12 },
  { type: "stage", stage: "write" },
  { type: "done", topicId: TOPIC_ID, runId },
]

export interface Mock {
  topics: unknown[]
  /** Topics teammates shared with the signed-in user. */
  shared: unknown[]
  /** Admin only: every topic other people created. */
  team: unknown[] | null
  admin: boolean
  detail: ReturnType<typeof buildDetail>
  scanStatus: number
  scanBody: string
  posts: Array<{ url: string; body: unknown }>
  patches: Array<{ url: string; body: unknown }>
  deletes: string[]
  runStatus: string
  /** The idea board, as the server holds it. */
  ideas: Array<Record<string, unknown> & { id: string; status: string }>
}

export async function setup(page: Page, over: Partial<Mock> = {}, opts: { forbidden?: boolean } = {}): Promise<Mock> {
  const m: Mock = {
    topics: [],
    shared: [],
    team: null,
    admin: false,
    detail: buildDetail(),
    scanStatus: 200,
    scanBody: sse(RUN_EVENTS("initial", RUN_1)),
    posts: [],
    patches: [],
    deletes: [],
    runStatus: "complete",
    ideas: [],
    ...over,
  }
  // Instant scrolling (the page honours reduced motion), so "scrolled into view" checks never race a smooth scroll.
  await page.emulateMedia({ reducedMotion: "reduce" })
  const consoleErrors: string[] = []
  page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()))
  ;(page as unknown as { consoleErrors: string[] }).consoleErrors = consoleErrors

  await page.route("**/api/auth/status", (r) =>
    r.fulfill({ json: { authenticated: true, mustChangePassword: false, user: { id: "u1", name: "Eric Yerke", email: "eric.yerke@stamats.com", role: "admin", hasCompletedTour: true } } }),
  )
  await page.route("**/api/csrf-token", (r) => r.fulfill({ json: { csrfToken: "test-token" } }))
  // App-shell chat widget (not this tool) lists conversations on every page.
  await page.route("**/api/conversations**", (r) => r.fulfill({ json: [] }))
  await page.route("**/api/listening/**", async (r: Route) => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname.replace("/api/listening", "")
    const method = req.method()
    if (opts.forbidden) return r.fulfill({ status: 403, json: { error: "Access denied" } })
    if (method === "GET" && path === "/access")
      return r.fulfill({ json: { allowed: true, admin: m.admin, sources: { search: true, youtube: true, model: true, redditArchive: true }, budget: { used: 32, limit: 100, resetsAt: "2026-10-08T07:00:00.000Z", scansLeft: 3 } } })
    if (method === "GET" && path === "/topics") return r.fulfill({ json: { topics: m.topics, shared: m.shared, ...(m.team ? { team: m.team } : {}) } })
    if (method === "GET" && path === `/topics/${TOPIC_ID}`) {
      // Mark ideas already on the board, as the server does.
      const savedIdeas: Record<string, string> = {}
      for (const s of m.ideas) if (s["topicId"] === TOPIC_ID && typeof s["reportIdeaId"] === "string") savedIdeas[s["reportIdeaId"] as string] = s.id
      return r.fulfill({ json: { ...m.detail, savedIdeas } })
    }
    if (method === "GET" && path.startsWith("/runs/")) return r.fulfill({ json: { run: { ...m.detail.runs[0], status: m.runStatus } } })
    if (method === "GET" && path === "/ideas") return r.fulfill({ json: { ideas: m.ideas } })
    if (method === "POST" && path === `/topics/${TOPIC_ID}/share`) {
      const body = req.postDataJSON() as { shared: boolean }
      m.posts.push({ url: path, body })
      m.detail = { ...m.detail, topic: { ...m.detail.topic, shared: body.shared } }
      return r.fulfill({ json: { shared: body.shared } })
    }
    if (method === "POST" && path === "/ideas") {
      const body = req.postDataJSON() as { topicId: string; ideaId: string }
      m.posts.push({ url: path, body })
      const idea = m.detail.topic.report?.ideas.find((i) => i.id === body.ideaId)
      if (!idea) return r.fulfill({ status: 404, json: { error: "That idea is no longer in this report. Reload the page.", code: "idea_gone" } })
      const saved = {
        id: `saved-${m.ideas.length + 1}`,
        reportIdeaId: idea.id,
        createdBy: "eric.yerke@stamats.com",
        topicId: body.topicId,
        topicQuery: m.detail.topic.query,
        fingerprint: `${body.topicId}:${idea.headline.toLowerCase()}`,
        idea: { headline: idea.headline, angle: idea.angle, audience: idea.audience, format: idea.format, whyNow: idea.whyNow, outline: idea.outline, subtopic: "Clinical placement" },
        sources: idea.evidenceItemIds.map((id) => {
          const it = m.detail.items.find((x) => x.id === id)!
          return { url: it.url, platform: it.platform, text: it.excerpt, publishedAt: it.publishedAt }
        }),
        status: "new",
        createdAt: "2026-10-08T15:00:00.000Z",
        updatedAt: "2026-10-08T15:00:00.000Z",
      }
      m.ideas.unshift(saved)
      return r.fulfill({ json: { idea: saved } })
    }
    if (method === "PATCH" && path.startsWith("/ideas/")) {
      const body = req.postDataJSON() as { status: string }
      m.patches.push({ url: path, body })
      const s = m.ideas.find((i) => `/ideas/${i.id}` === path)
      if (!s) return r.fulfill({ status: 404, json: { error: "Idea not found" } })
      s.status = body.status
      return r.fulfill({ json: { status: body.status } })
    }
    if (method === "DELETE" && path.startsWith("/ideas/")) {
      m.deletes.push(path)
      m.ideas = m.ideas.filter((i) => `/ideas/${i.id}` !== path)
      return r.fulfill({ json: { ok: true } })
    }
    if (method === "POST") {
      m.posts.push({ url: path, body: req.postDataJSON?.() ?? null })
      if (path.endsWith("/cancel")) return r.fulfill({ json: { ok: true } })
      if (m.scanStatus !== 200) return r.fulfill({ status: m.scanStatus, json: { error: "Today's Google search allowance is nearly used (96 of 100). It resets at midnight Pacific.", code: "budget" } })
      return r.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: m.scanBody })
    }
    if (method === "DELETE") {
      m.deletes.push(path)
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ status: 404, json: { error: "Not found" } })
  })
  return m
}

export const errorsOf = (page: Page) => ((page as unknown as { consoleErrors: string[] }).consoleErrors ?? []).filter((e) => !/favicon|DevTools|Failed to load resource/i.test(e))

