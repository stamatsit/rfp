/**
 * Topic Ideation e2e, deterministic: every /api/listening call and the auth
 * check are served from fixtures, so these run offline, cost no search quota,
 * and can force each failure path. A separate live run covers the real API.
 *
 *   cd packages/client && npx playwright test e2e/topic-ideation.spec.ts
 */
import { expect, test } from "@playwright/test"
import { RUN_1, RUN_2, RUN_EVENTS, TOPIC_ID, buildDetail, errorsOf, setup, sse } from "./fixtures/listeningMocks"


test.describe("Topic Ideation", () => {
  test("home: clear search, examples fill without scanning, saved topics open", async ({ page }) => {
    const m = await setup(page, { topics: [buildDetail().topic] })
    await page.goto("/listening")
    await expect(page.getByRole("heading", { name: "Topic Ideation" })).toBeVisible()
    const box = page.getByPlaceholder("A topic, or a school or hospital by name")
    await expect(box).toBeFocused()
    await expect(page.getByRole("button", { name: "Scan" })).toBeDisabled()
    await page.getByRole("button", { name: "FAFSA changes" }).click()
    await expect(box).toHaveValue("FAFSA changes")
    expect(m.posts).toHaveLength(0)
    await expect(page.getByText("About 3 scans left today")).toBeVisible()
    await page.getByRole("link", { name: /online nursing degree/ }).click()
    await expect(page).toHaveURL(new RegExp(`/listening/${TOPIC_ID}$`))
    await expect(page.getByRole("heading", { level: 1, name: "online nursing degree" })).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("new scan: Enter starts it, page moves to the topic, report renders when done", async ({ page }) => {
    const m = await setup(page)
    await page.goto("/listening")
    const box = page.getByPlaceholder("A topic, or a school or hospital by name")
    await box.fill("online nursing degree")
    await page.getByLabel("Time range").selectOption("3m")
    await box.press("Enter")
    await expect(page).toHaveURL(new RegExp(`/listening/${TOPIC_ID}$`))
    expect(m.posts[0]).toEqual({ url: "/topics", body: { query: "online nursing degree", timeWindow: "3m" } })
    await expect(page.getByText("People weigh flexibility against clinical quality")).toBeVisible()
    await expect(page.getByRole("heading", { name: /Content ideas/ })).toBeVisible()
    await expect(page.getByText("Who finds your clinical placement in an online program")).toBeVisible()
    await expect(page.getByText("Leans positive").first()).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("report: evidence links, copy, section nav, subtopic filter, source search, off-topic toggle", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    // Idea evidence opens in a new tab with the source URL.
    await page.getByRole("button", { name: /Outline and 3 sources/ }).click()
    const ev = page.locator('a[href="https://www.reddit.com/r/nursing/comments/t1/thread_1/"]').first()
    await expect(ev).toHaveAttribute("target", "_blank")
    await expect(ev).toHaveAttribute("rel", /noopener/)
    // Copy report puts real content on the clipboard.
    await page.getByRole("button", { name: "Copy report" }).click()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain("# online nursing degree")
    expect(clip).toContain("Who finds your clinical placement in an online program")
    expect(clip).toContain("https://www.reddit.com/r/nursing/comments/t1/thread_1/")
    // Section nav jumps to questions.
    await page.getByRole("navigation", { name: "Report sections" }).getByRole("link", { name: /Questions/ }).click()
    await expect(page.locator("#questions")).toBeInViewport()
    // Subtopic expands and filters sources.
    await page.locator("[id='subtopic-s2']").getByRole("button", { name: /Cost and aid/ }).click()
    await page.getByRole("button", { name: /See all 5 posts in this subtopic/ }).click()
    await expect(page.getByText(/Showing 5 of 5 sources/)).toBeVisible()
    // Clearing the subtopic chip shows everything relevant (11), not the off-topic one.
    await page.locator("#sources").locator("..").getByRole("button", { name: /Cost and aid/ }).last().click()
    await expect(page.getByText(/Showing 11 of 11 sources/)).toBeVisible()
    await page.getByPlaceholder("Search within sources").fill("preceptor")
    await expect(page.getByText(/Showing 1 of 1 source/)).toBeVisible()
    await page.getByPlaceholder("Search within sources").fill("")
    await page.getByLabel(/Show 1 off-topic/).check()
    await expect(page.getByText("judged off-topic")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("rescan: compact progress while the old report stays readable, then a clear result", async ({ page }) => {
    const m = await setup(page, { scanBody: sse(RUN_EVENTS("rescan", RUN_2)) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("People weigh flexibility")).toBeVisible()
    m.detail = buildDetail({ runs: 2, newItems: 4 })
    await page.getByRole("button", { name: "Rescan for more" }).click()
    await expect(page.getByText("Added 4 new posts")).toBeVisible()
    expect(m.posts.map((p) => p.url)).toContain(`/topics/${TOPIC_ID}/rescan`)
    await expect(page.getByText(/The last scan added/)).toBeVisible()
    await expect(page.getByRole("button", { name: /New this scan · 4/ })).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("allowance spent: a plain reason, no navigation, nothing half-created", async ({ page }) => {
    await setup(page, { scanStatus: 429 })
    await page.goto("/listening")
    await page.getByPlaceholder("A topic, or a school or hospital by name").fill("FAFSA changes")
    await page.getByRole("button", { name: "Scan" }).click()
    await expect(page.getByText(/allowance is nearly used/)).toBeVisible()
    await expect(page).toHaveURL(/\/listening$/)
  })

  test("partial scan: the banner says which source did not answer", async ({ page }) => {
    await setup(page, { detail: buildDetail({ degraded: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    const banner = page.getByRole("button", { name: /Partial scan: YouTube did not answer/ })
    await expect(banner).toBeVisible()
    await banner.click()
    await expect(page.getByText("YouTube: daily quota used up")).toBeVisible()
  })

  test("dropped connection: the page keeps following the scan and loads the result", async ({ page }) => {
    const m = await setup(page, { scanBody: sse(RUN_EVENTS("initial", RUN_1).slice(0, 4)), runStatus: "running" })
    await page.goto("/listening")
    m.detail = buildDetail({ withReport: false })
    await page.getByPlaceholder("A topic, or a school or hospital by name").fill("online nursing degree")
    await page.getByRole("button", { name: "Scan" }).click()
    await expect(page.getByText("Still working on the server")).toBeVisible()
    m.detail = buildDetail()
    m.runStatus = "complete"
    await expect(page.getByText("People weigh flexibility")).toBeVisible({ timeout: 15000 })
  })

  test("delete asks first, then removes and returns home", async ({ page }) => {
    const m = await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: /Delete topic/ }).click()
    await expect(page.getByRole("dialog", { name: "Delete this topic?" })).toBeVisible()
    await page.getByRole("button", { name: "Keep it" }).click()
    expect(m.deletes).toHaveLength(0)
    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: /Delete topic/ }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete topic" }).click()
    await expect(page).toHaveURL(/\/listening$/)
    expect(m.deletes).toEqual([`/topics/${TOPIC_ID}`])
  })

  test("not on the allowlist: a calm explanation, no tool", async ({ page }) => {
    await setup(page, {}, { forbidden: true })
    await page.goto("/listening")
    await expect(page.getByText("Topic Ideation is not available on your account yet.")).toBeVisible()
  })

  test("phone width: report has no sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("People weigh flexibility")).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
