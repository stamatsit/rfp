/**
 * Fixture data and API mocks for the Topic Ideation e2e and visual specs.
 * Synthetic content only (no scraped third-party text).
 */
import type { Page, Route } from "@playwright/test"

export const TOPIC_ID = "11111111-1111-4111-8111-111111111111"
export const RUN_1 = "22222222-2222-4222-8222-222222222222"
export const RUN_2 = "33333333-3333-4333-8333-333333333333"

const LIBRARY_SUBJECTS = [
  "FAFSA changes",
  "online nursing degree",
  "college enrollment trends",
  "transfer credit policies",
  "campus housing costs",
  "student loan forgiveness",
  "dual enrollment programs",
  "test optional admissions",
  "community college pathways",
  "graduate job outcomes",
  "rural hospital closures",
  "telehealth for seniors",
  "nurse staffing shortages",
  "urgent care wait times",
  "maternity ward access",
  "mental health counseling on campus",
  "international student visas",
  "adult learners returning to school",
  "esports scholarships",
  "study abroad safety",
  "cybersecurity bootcamps",
  "trade school versus college",
  "campus dining plans",
  "first generation student support",
  "veterans education benefits",
]
const LIBRARY_RANGES = [
  { timeWindow: "1y", windowFrom: null, windowTo: null },
  { timeWindow: "3m", windowFrom: null, windowTo: null },
  { timeWindow: "1w", windowFrom: null, windowTo: null },
  { timeWindow: "custom", windowFrom: "2026-03-01", windowTo: "2026-05-31" },
]

/**
 * A library's worth of saved topics, newest first, the way the list endpoint
 * returns them: the same subjects scanned over several time ranges, with mixed
 * feelings, sizes and owners. Topic 4 is still scanning and topic 9 failed.
 */
export function manyTopics(n: number, owners: string[] = ["eric.yerke@stamats.com"], idPrefix = "lib") {
  return Array.from({ length: n }, (_, i) => {
    const running = i === 3
    const failed = i === 8
    const subject = LIBRARY_SUBJECTS[i % LIBRARY_SUBJECTS.length]!
    const at = new Date(Date.UTC(2026, 9, 7, 20, 0) - i * 5 * 3600e3).toISOString()
    return {
      id: `${idPrefix}-${i + 1}`,
      createdBy: owners[i % owners.length]!,
      shared: i % 4 === 0,
      sharedAt: i % 4 === 0 ? at : null,
      query: subject,
      ...LIBRARY_RANGES[Math.floor(i / LIBRARY_SUBJECTS.length) % LIBRARY_RANGES.length]!,
      plan: null,
      report: null,
      itemCount: running || failed ? 0 : ((i * 71) % 400) + 40,
      relevantCount: running || failed ? 0 : ((i * 53) % 240) + 3,
      sentimentScore: running || failed ? null : ((i * 37) % 141) - 70,
      headline: running || failed ? null : `People discussing ${subject} split between cost worries and practical how-to questions, with a few strong personal stories.`,
      lastRunAt: at,
      lastRunStatus: running ? "running" : failed ? "failed" : "complete",
      createdAt: at,
      updatedAt: at,
    }
  })
}

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
    /** A fixed custom date range instead of the past year. */
    range?: { from: string; to: string }
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
      timeWindow: opts.range ? "custom" : "1y",
      windowFrom: opts.range?.from ?? null,
      windowTo: opts.range?.to ?? null,
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
  /** Who has scanned, as GET /usage returns it. */
  usage: unknown
  /** What the server says about who sees whose scans; unset is an older server (private). */
  visibility?: "team" | "private"
  /** Saved idea id -> its drafts, as the server holds them. */
  drafts: Record<string, Array<Record<string, unknown> & { kind: string; version: number }>>
  /** Not 200: the next draft requests fail with this status. */
  draftStatus: number
  /** Hold a draft request this long, so the writing state can be seen. */
  draftDelayMs: number
  /** Your thumbs, by report idea id. */
  votes: Record<string, number>
  /** Not 200: rating an idea fails with this status. */
  voteStatus: number
  /** What "More ideas" does: add two, add none, or fail with this status. */
  moreIdeas: "two" | "none" | number
  moreDelayMs: number
}

/** A draft as the server would return it. `version` changes the wording, to prove "Write another" replaced it. */
export function fixtureDraft(kind: string, version: number, sources: Array<{ url: string; platform: string }>) {
  const again = version > 1
  if (kind === "blog_outline")
    return {
      workingTitle: again ? "Clinical placement, explained before you enroll" : "Who arranges your clinical placement, and when to ask",
      reader: "Prospective online nursing students who worry about finding a clinical site.",
      angle: "Placement support varies by program, and the page that explains it is often hard to find.",
      sections: [
        { heading: "What students are asking", points: ["Open with the question people keep raising", "Name the worry in plain words"], sources: sources.slice(0, 2) },
        { heading: "How placement usually works", points: ["Describe the common arrangements", "Say what the student is expected to do"], sources: sources.slice(1, 2) },
        { heading: "Questions to ask a program", points: ["List what to ask before enrolling"], sources: [] },
        { heading: "Next steps", points: ["Point to the admissions contact"], sources: sources.slice(0, 1) },
      ],
      close: "End with the one question to ask an advisor.",
    }
  if (kind === "linkedin_post")
    return {
      post: [
        again ? "The clinical placement question is not going away." : "Online nursing students keep asking one thing: who actually finds the clinical placement?",
        "It comes up again and again, and the answer is rarely on the program page.",
        "Say who arranges placements, when it happens, and what the student has to do.",
        "What does your program page say about clinical placement today?",
      ].join("\n\n"),
      hashtags: ["HigherEdMarketing", "NursingEducation"],
    }
  return {
    headlines: [
      { text: again ? "Clinical placement, answered up front" : "Who arranges clinical placements for online students?", style: "question" },
      { text: "How to ask a nursing program about clinical placement", style: "how-to" },
      { text: "Clinical placement: what online programs owe you", style: "direct" },
      { text: "No, you should not have to find your own clinical site", style: "myth" },
      { text: "What online nursing students wish they had asked first", style: "reader voice" },
      { text: "Clinical placement, explained for online students", style: "direct" },
      { text: "The question every online nursing applicant should ask before they pay a deposit", style: "question" },
      { text: "Before you enroll, ask who finds the site", style: "how-to" },
      { text: "Why placement support decides the online nursing experience", style: "direct" },
      { text: "I love my online program, but who finds the placement?", style: "reader voice" },
    ],
  }
}

export const USAGE = {
  budget: { used: 34, limit: 100, resetsAt: "2026-10-13T07:00:00.000Z", scansLeft: 3 },
  today: [
    { who: "mariah.tang@stamats.com", startedAt: "2026-10-12T14:13:00.000Z", trigger: "initial", status: "complete", searchCalls: 17, topic: null, topicId: null },
    { who: "eric.yerke@stamats.com", startedAt: "2026-10-12T16:40:00.000Z", trigger: "rescan", status: "complete", searchCalls: 17, topic: "online nursing degree", topicId: TOPIC_ID },
  ],
  week: [
    { who: "eric.yerke@stamats.com", scans: 4, searchCalls: 68 },
    { who: "mariah.tang@stamats.com", scans: 1, searchCalls: 17 },
  ],
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
    usage: USAGE,
    drafts: {},
    draftStatus: 200,
    draftDelayMs: 0,
    votes: {},
    voteStatus: 200,
    moreIdeas: "two",
    moreDelayMs: 0,
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
      return r.fulfill({ json: { allowed: true, admin: m.admin, ...(m.visibility ? { visibility: m.visibility } : {}), sources: { search: true, youtube: true, model: true, redditArchive: true }, budget: { used: 32, limit: 100, resetsAt: "2026-10-08T07:00:00.000Z", scansLeft: 3 } } })
    if (method === "GET" && path === "/topics") return r.fulfill({ json: { topics: m.topics, shared: m.shared, ...(m.team ? { team: m.team } : {}) } })
    if (method === "GET" && path === `/topics/${TOPIC_ID}`) {
      // Mark ideas already on the board, as the server does.
      const savedIdeas: Record<string, string> = {}
      for (const s of m.ideas) if (s["topicId"] === TOPIC_ID && typeof s["reportIdeaId"] === "string") savedIdeas[s["reportIdeaId"] as string] = s.id
      return r.fulfill({ json: { ...m.detail, savedIdeas, drafts: m.drafts, votes: m.votes, ...(m.visibility ? { visibility: m.visibility } : {}) } })
    }
    if (method === "GET" && path.startsWith("/runs/")) return r.fulfill({ json: { run: { ...m.detail.runs[0], status: m.runStatus } } })
    if (method === "GET" && path === "/ideas") return r.fulfill({ json: { ideas: m.ideas, drafts: m.drafts } })
    if (method === "GET" && path === "/usage") return r.fulfill({ json: m.usage })
    if (method === "GET" && path === `/topics/${TOPIC_ID}/sources`) {
      // Every relevant source with its full text, counted ones first, as the server returns them.
      const subName = new Map((m.detail.topic.report?.subtopics ?? []).map((x) => [x.id, x.name]))
      const sources = m.detail.items
        .filter((i) => i.relevant)
        .map((i, n) => ({
          url: i.url,
          platform: i.platform === "reddit" ? "Reddit" : i.platform === "youtube" ? "YouTube" : i.platform === "quora" ? "Quora" : "Facebook",
          kind: i.kind,
          title: i.title,
          // One post begins like a spreadsheet formula, to prove the export neutralises it.
          text: n === 1 ? '=HYPERLINK("https://evil.example","click")' : `${i.excerpt} Full text of the post, with "quotes", a comma, and a second sentence.`,
          author: i.author,
          publishedAt: i.publishedAt,
          counted: i.counted !== false,
          notCounted: i.counted !== false ? "" : i.speaker === "media" ? "news outlet" : i.speaker === "self" ? "Coe College's own account" : "passing mention",
          sentiment: i.sentiment ?? "neutral",
          audience: i.audience,
          subtopic: (i.subtopicId && subName.get(i.subtopicId)) || "",
          question: "",
        }))
        .sort((a, b) => Number(b.counted) - Number(a.counted))
      return r.fulfill({ json: { sources } })
    }
    if (method === "POST" && path === `/topics/${TOPIC_ID}/share`) {
      const body = req.postDataJSON() as { shared: boolean }
      m.posts.push({ url: path, body })
      m.detail = { ...m.detail, topic: { ...m.detail.topic, shared: body.shared } }
      return r.fulfill({ json: { shared: body.shared } })
    }
    // A frozen copy of one of the report's ideas, put on the board, as the server makes it.
    const saveFromReport = (topicId: string, ideaId: string) => {
      const idea = m.detail.topic.report?.ideas.find((i) => i.id === ideaId)
      if (!idea) return null
      const saved = {
        id: `saved-${m.ideas.length + 1}`,
        reportIdeaId: idea.id,
        createdBy: "eric.yerke@stamats.com",
        topicId,
        topicQuery: m.detail.topic.query,
        fingerprint: `${topicId}:${idea.headline.toLowerCase()}`,
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
      return saved
    }
    if (method === "POST" && path === "/ideas") {
      const body = req.postDataJSON() as { topicId: string; ideaId: string }
      m.posts.push({ url: path, body })
      const saved = saveFromReport(body.topicId, body.ideaId)
      if (!saved) return r.fulfill({ status: 404, json: { error: "That idea is no longer in this report. Reload the page.", code: "idea_gone" } })
      return r.fulfill({ json: { idea: saved } })
    }
    if (method === "POST" && path === "/ideas/vote") {
      const body = req.postDataJSON() as { topicId: string; ideaId: string; vote: number }
      m.posts.push({ url: path, body })
      if (m.voteStatus !== 200) return r.fulfill({ status: m.voteStatus, json: { error: "Something went wrong. Try again." } })
      if (body.vote === 0) delete m.votes[body.ideaId]
      else m.votes[body.ideaId] = body.vote
      return r.fulfill({ json: { vote: body.vote === 0 ? null : body.vote } })
    }
    if (method === "POST" && path === `/topics/${TOPIC_ID}/ideas/more`) {
      m.posts.push({ url: path, body: null })
      if (m.moreDelayMs) await new Promise((done) => setTimeout(done, m.moreDelayMs))
      const report = m.detail.topic.report!
      if (typeof m.moreIdeas === "number") return r.fulfill({ status: m.moreIdeas, json: { error: "A scan is running for this topic. Ask again when it finishes.", code: "active_run" } })
      if (m.moreIdeas === "none") return r.fulfill({ json: { added: [], ideas: report.ideas } })
      const base = report.ideas[0]!
      const n = report.ideas.length
      const added = [
        { ...base, id: `idea${n + 1}`, headline: "Questions to ask a program before you enroll", angle: "Give applicants the list.", format: "FAQ page", added: true },
        { ...base, id: `idea${n + 2}`, headline: "What the full price leaves out", angle: "Name the costs people find later.", format: "article", added: true },
      ]
      report.ideas = [...report.ideas, ...added]
      return r.fulfill({ json: { added, ideas: report.ideas } })
    }
    if (method === "POST" && path === "/ideas/draft") {
      const body = req.postDataJSON() as { savedId?: string; topicId?: string; ideaId?: string; kind: string; fresh?: boolean }
      m.posts.push({ url: path, body })
      if (m.draftDelayMs) await new Promise((done) => setTimeout(done, m.draftDelayMs))
      // A failed draft saves nothing, as on the server.
      if (m.draftStatus !== 200) return r.fulfill({ status: m.draftStatus, json: { error: "The draft could not be written this time. Try again.", code: "draft_failed" } })
      const found = body.savedId ? m.ideas.find((i) => i.id === body.savedId) : m.ideas.find((i) => i["topicId"] === body.topicId && i["reportIdeaId"] === body.ideaId)
      const saved = found ?? (body.topicId && body.ideaId ? saveFromReport(body.topicId, body.ideaId) : null)
      if (!saved) return r.fulfill({ status: 404, json: { error: "Idea not found" } })
      const list = m.drafts[saved.id] ?? []
      const existing = list.find((d) => d.kind === body.kind)
      if (existing && !body.fresh) return r.fulfill({ json: { idea: saved, draft: existing } })
      const version = (existing?.version ?? 0) + 1
      const draft = {
        id: `draft-${saved.id}-${body.kind}`,
        savedIdeaId: saved.id,
        kind: body.kind,
        version,
        content: fixtureDraft(body.kind, version, (saved as unknown as { sources: Array<{ url: string; platform: string }> }).sources),
        createdAt: "2026-10-13T16:00:00.000Z",
        updatedAt: "2026-10-13T16:00:00.000Z",
      }
      m.drafts[saved.id] = [...list.filter((d) => d.kind !== body.kind), draft]
      return r.fulfill({ json: { idea: saved, draft } })
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
      // Drafts go with their idea.
      delete m.drafts[path.replace("/ideas/", "")]
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

