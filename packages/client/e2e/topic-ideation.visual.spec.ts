/**
 * Topic Ideation visual pass: captures every state at desktop and phone width
 * in light and dark, for design review. Skipped unless SHOTS is set.
 *
 *   cd packages/client && SHOTS=/path/to/dir npx playwright test e2e/topic-ideation.visual.spec.ts
 */
import { test, type Page } from "@playwright/test"
import { RUN_1, TOPIC_ID, buildDetail, setup } from "./fixtures/listeningMocks"

const DIR = process.env["SHOTS"]
test.skip(!DIR, "set SHOTS=<dir> to capture screenshots")

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]
const THEMES = ["light", "dark"] as const

async function theme(page: Page, t: (typeof THEMES)[number]) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: t })
  await page.addInitScript((v) => {
    localStorage.setItem("theme", v)
    const k = "stamats-app-settings"
    let cur: Record<string, unknown> = {}
    try {
      cur = JSON.parse(localStorage.getItem(k) || "{}")
    } catch {
      cur = {}
    }
    localStorage.setItem(k, JSON.stringify({ ...cur, theme: v }))
  }, t)
}

/** Let the page-transition fade finish so captures show final colours. */
const settle = (page: Page) => page.waitForTimeout(600)

/** Keeps a scan stream open mid-way so the live steps can be captured. */
async function holdScanOpen(page: Page) {
  await page.addInitScript(
    ({ topicId, runId }) => {
      const real = window.fetch.bind(window)
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
        if (init?.method === "POST" && /\/api\/listening\/topics$/.test(url)) {
          const events = [
            { type: "started", topicId, runId, trigger: "initial" },
            { type: "stage", stage: "plan" },
            { type: "plan", plan: { interpretation: "", isNamedEntity: false, disambiguation: "", broaderSuggestions: [], searches: [
              { q: "online nursing degree", why: "" }, { q: "is an online nursing degree worth it", why: "" }, { q: "online nursing school clinicals", why: "" }, { q: "online RN to BSN programs", why: "" } ] } },
            { type: "stage", stage: "search" },
            { type: "lane", lane: { lane: "reddit", label: "Reddit", status: "ok", count: 40, ms: 500 } },
            { type: "lane", lane: { lane: "forums", label: "Forums", status: "ok", count: 30, ms: 500 } },
            { type: "lane", lane: { lane: "social", label: "Social", status: "ok", count: 30, ms: 500 } },
            { type: "lane", lane: { lane: "reviews", label: "Reviews", status: "ok", count: 30, ms: 500 } },
            { type: "lane", lane: { lane: "youtube", label: "YouTube", status: "failed", count: 0, ms: 900, note: "daily quota used up" } },
            { type: "lane", lane: { lane: "news", label: "News", status: "ok", count: 15, ms: 700 } },
            { type: "stage", stage: "read", detail: "8" },
            { type: "stage", stage: "label", detail: "260" },
            { type: "counts", labeled: 150 },
          ]
          const body = new ReadableStream({
            start(c) {
              const enc = new TextEncoder()
              for (const e of events) c.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
              // never close: the scan is "in progress"
            },
          })
          return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
        }
        return real(input, init)
      }
    },
    { topicId: TOPIC_ID, runId: RUN_1 },
  )
}

for (const vp of VIEWPORTS) {
  for (const t of THEMES) {
    test(`${vp.name} ${t}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      const topics = [
        buildDetail().topic,
        { ...buildDetail().topic, id: "t2", query: "college enrollment trends", headline: "Students and faculty debate whether falling enrollment is about cost, value, or demographics.", sentimentScore: -32, relevantCount: 188, lastRunAt: "2026-10-06T15:00:00.000Z" },
        { ...buildDetail().topic, id: "t3", query: "Coe College", headline: null, lastRunStatus: "running", relevantCount: 0, sentimentScore: null },
      ]
      await setup(page, { topics })
      await page.goto("/listening")
      await page.getByRole("heading", { name: "Topic Ideation" }).waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-1-home.png`, fullPage: true })

      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("People weigh flexibility").waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-3-report-top.png` })
      await page.getByRole("button", { name: /Outline and 3 sources/ }).click()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-4-report-full.png`, fullPage: true })
    })

    test(`${vp.name} ${t} institution`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      await setup(page, { detail: buildDetail({ institution: true, thin: true }) })
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("People weigh flexibility").waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-5-institution-top.png` })
      await page.locator("#own-voice").scrollIntoViewIfNeeded()
      await settle(page)
      await page.locator("#own-voice").locator("..").screenshot({ path: `${DIR}/${vp.name}-${t}-6-own-voice.png` })
      await page.getByRole("button", { name: "See them" }).click()
      await settle(page)
      await page.locator("#sources").locator("..").screenshot({ path: `${DIR}/${vp.name}-${t}-7-not-counted.png` })
    })

    test(`${vp.name} ${t} legacy`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      await setup(page, { detail: buildDetail({ version: 1 }) })
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("This report was made before the accuracy update").waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-8-legacy.png` })
    })

    test(`${vp.name} ${t} sharing and board`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      const mine = buildDetail({ institution: true })
      const theirs = buildDetail({ viewer: true })
      const m = await setup(page, { topics: [{ ...mine.topic, shared: true }], shared: [{ ...theirs.topic, id: "t9", query: "FAFSA changes", headline: "Parents and students are frustrated by lower aid estimates and confusing corrections." }], detail: mine })
      await page.goto("/listening")
      await page.getByRole("heading", { name: /Shared with you/ }).waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-9-home-shared.png`, fullPage: true })

      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("People weigh flexibility").waitFor()
      await page.getByRole("button", { name: "Share", exact: true }).click()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-10-share.png` })
      await page.keyboard.press("Escape")

      // Save two ideas, then show the board with mixed statuses.
      for (const n of [0, 1]) {
        await page.getByRole("button", { name: "Save", exact: true }).first().click()
        await page.getByRole("button", { name: "Saved", exact: true }).nth(n).waitFor()
      }
      m.ideas[0]!.status = "pitched"
      m.ideas.push({ ...m.ideas[1]!, id: "saved-x", status: "published", topicId: null, topicQuery: "Spring enrollment push" })
      await page.locator("#ideas").scrollIntoViewIfNeeded()
      await settle(page)
      await page.locator("#ideas").locator("..").screenshot({ path: `${DIR}/${vp.name}-${t}-11-ideas-saved.png` })
      await page.goto("/listening/ideas")
      await page.getByRole("heading", { level: 1, name: "Idea board" }).waitFor()
      await page.getByRole("button", { name: /Outline and 3 sources/ }).first().click()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-12-board.png`, fullPage: true })

      m.detail = theirs
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("read only").waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-13-viewer.png` })
    })

    test(`${vp.name} ${t} admin`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      const joes = buildDetail({ viewer: true, owner: "joe.volk@stamats.com", shared: false })
      const mariahs = buildDetail({ viewer: true })
      await setup(page, {
        admin: true,
        topics: [buildDetail({ institution: true }).topic],
        team: [{ ...joes.topic, query: "FAFSA changes", headline: "Parents and students are frustrated by lower aid estimates and confusing corrections." }, { ...mariahs.topic, id: "t-m", query: "college enrollment trends" }],
        detail: joes,
      })
      await page.goto("/listening")
      await page.getByRole("heading", { name: /Everyone's topics/ }).waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-14-admin-home.png`, fullPage: true })
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByText("admin view, read only").waitFor()
      await page.getByRole("button", { name: /How this was made/ }).click()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-15-admin-topic.png` })
    })

    test(`${vp.name} ${t} progress`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await theme(page, t)
      await holdScanOpen(page)
      await setup(page, { detail: buildDetail({ withReport: false }) })
      await page.goto("/listening")
      await page.getByPlaceholder("A topic, or a school or hospital by name").fill("online nursing degree")
      await page.getByRole("button", { name: "Scan" }).click()
      await page.getByText("150 of 260 posts").waitFor()
      await settle(page)
      await page.screenshot({ path: `${DIR}/${vp.name}-${t}-2-progress.png`, fullPage: true })
    })
  }
}
