/**
 * Topic Ideation e2e, deterministic: every /api/listening call and the auth
 * check are served from fixtures, so these run offline, cost no search quota,
 * and can force each failure path. A separate live run covers the real API.
 *
 *   cd packages/client && npx playwright test e2e/topic-ideation.spec.ts
 */
import fs from "node:fs"
import zlib from "node:zlib"
import { expect, test } from "@playwright/test"
import JSZip from "jszip"
import { RUN_1, RUN_2, RUN_EVENTS, TOPIC_ID, buildDetail, errorsOf, setup, sse } from "./fixtures/listeningMocks"

/** Text drawn in a jsPDF file: inflate each content stream and join its (string) Tj operands. */
function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1")
  const out: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf("endstream", start)
    if (end < 0) break
    const chunk = buf.subarray(start, end)
    let s: string
    try {
      s = zlib.inflateSync(chunk).toString("latin1")
    } catch {
      s = chunk.toString("latin1")
    }
    for (const t of s.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(t[1]!.replace(/\\([()\\])/g, "$1"))
    re.lastIndex = end + "endstream".length
  }
  return out.join("\n")
}


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
    // Export > Copy as text puts real content on the clipboard.
    await page.getByRole("button", { name: "Export" }).click()
    await page.getByRole("menuitem", { name: /Copy as text/ }).click()
    await expect(page.getByText("Report copied")).toBeVisible()
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
    // Clearing the subtopic chip shows everything relevant (11 counted + 2 not counted), not the off-topic one.
    await page.locator("#sources").locator("..").getByRole("button", { name: /Cost and aid/ }).last().click()
    await expect(page.getByText(/Showing 13 of 13 sources/)).toBeVisible()
    await page.getByPlaceholder("Search within sources").fill("preceptor")
    await expect(page.getByText(/Showing 1 of 1 source/)).toBeVisible()
    await page.getByPlaceholder("Search within sources").fill("")
    await page.getByLabel(/Show 1 off-topic/).check()
    await expect(page.getByText("judged off-topic")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("who is counted: the overview says what was left out, and See them lists it with reasons", async ({ page }) => {
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText(/^11 posts by people · /)).toBeVisible()
    await expect(page.getByText(/Not counted: 1 passing mention and 1 post from news outlets and other organizations\./)).toBeVisible()
    await page.getByRole("button", { name: "See them" }).click()
    await expect(page.locator("#sources")).toBeInViewport()
    await expect(page.getByLabel("Which sources")).toHaveValue("notCounted")
    await expect(page.getByText(/Showing 2 of 2 sources/)).toBeVisible()
    await expect(page.locator("#sources").locator("..").getByText("passing mention", { exact: true })).toBeVisible()
    await expect(page.locator("#sources").locator("..").getByText("news outlet", { exact: true })).toBeVisible()
    await page.getByLabel("Which sources").selectOption("counted")
    await expect(page.getByText(/Showing 11 of 11 sources/)).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("institution: its own posts sit in their own section and never in the figures", async ({ page }) => {
    await setup(page, { detail: buildDetail({ institution: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText(/Not counted: 4 posts from Coe College's own accounts/)).toBeVisible()
    const nav = page.getByRole("navigation", { name: "Report sections" })
    await nav.getByRole("link", { name: "Coe College's own posts" }).click()
    await expect(page.getByRole("heading", { name: /What Coe College says about itself/ })).toBeInViewport()
    await expect(page.getByText("Its own posts celebrate rankings and events")).toBeVisible()
    const post = page.locator("#own-voice").locator("..").locator('a[href="https://www.facebook.com/CoeCollege/posts/own-0"]')
    await expect(post).toHaveAttribute("target", "_blank")
    // Three shown, all four one click away in sources.
    await page.getByRole("button", { name: "See all 4 posts in sources" }).click()
    await expect(page.getByLabel("Which sources")).toHaveValue("own")
    await expect(page.getByText(/Showing 4 of 4 sources/)).toBeVisible()
    await expect(page.locator("#sources").locator("..").getByText("Coe College's own account").first()).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("older report: explains the change and recounts without new searches", async ({ page }) => {
    const m = await setup(page, { detail: buildDetail({ version: 1 }), scanBody: sse(RUN_EVENTS("rebuild", RUN_2)) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("This report was made before the accuracy update")).toBeVisible()
    await expect(page.getByText(/^11 relevant posts · /)).toBeVisible()
    await expect(page.getByText(/Not counted:/)).toHaveCount(0)
    m.detail = buildDetail()
    await page.getByRole("button", { name: "Refresh analysis" }).click()
    // The request goes out after a CSRF token fetch, so wait for it rather than checking at once.
    await expect.poll(() => m.posts.map((p) => p.url)).toContain(`/topics/${TOPIC_ID}/rebuild`)
    await expect(page.getByText("This report was made before the accuracy update")).toHaveCount(0)
    await expect(page.getByText(/^11 posts by people · /)).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("export PDF: a real-text file with every section and every source linked", async ({ page }) => {
    await setup(page, { detail: buildDetail({ institution: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "Export" }).click()
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /PDF/ }).click()])
    expect(dl.suggestedFilename()).toBe("Topic Ideation - Coe College - 2026-10-07.pdf")
    if (process.env["KEEP_EXPORTS"]) fs.copyFileSync((await dl.path())!, `${process.env["KEEP_EXPORTS"]}/${dl.suggestedFilename()}`)
    const buf = fs.readFileSync((await dl.path())!)
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-")
    const text = pdfText(buf)
    for (const s of [
      "Coe College",
      "What people are saying",
      "People weigh flexibility against clinical quality",
      "1. Who finds your clinical placement in an online program",
      "Questions people ask (2)",
      "Who finds the clinical placement when you study online?",
      "What Coe College says about itself",
      "In the news",
      "How this was made",
      "Not counted: 4 posts from Coe College's own accounts",
      "Page 1 of",
    ]) expect(text, s).toContain(s)
    // Every idea source, question and own post is a clickable link.
    const raw = buf.toString("latin1")
    for (const url of ["https://www.reddit.com/r/nursing/comments/t1/thread_1/", "https://youtube.com/watch?v=vid1&lc=c1", "https://www.facebook.com/CoeCollege/posts/own-0", "https://news.google.com/rss/articles/x"]) {
      expect(raw, url).toContain(`/URI (${url})`)
    }
    await expect(page.getByText("PDF downloaded")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("export Word: an editable file with the report and working links", async ({ page }) => {
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "Export" }).click()
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Word document/ }).click()])
    expect(dl.suggestedFilename()).toBe("Topic Ideation - online nursing degree - 2026-10-07.docx")
    if (process.env["KEEP_EXPORTS"]) fs.copyFileSync((await dl.path())!, `${process.env["KEEP_EXPORTS"]}/${dl.suggestedFilename()}`)
    const zip = await JSZip.loadAsync(fs.readFileSync((await dl.path())!))
    const body = await zip.file("word/document.xml")!.async("string")
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string")
    for (const s of ["online nursing degree", "What people are saying", "Who finds your clinical placement in an online program", "Who arranges placements", "Questions people ask (2)", "In their words", "How this was made"]) {
      expect(body, s).toContain(s)
    }
    expect(rels).toContain('Target="https://www.reddit.com/r/nursing/comments/t1/thread_1/"')
    expect(rels).toContain('TargetMode="External"')
    await expect(page.getByText("Word document downloaded")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("share: the owner shares a topic with the team and can make it private again", async ({ page }) => {
    const m = await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "Share", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Share with your team" })
    await expect(dialog.getByText(/Only you can rescan, refresh or delete it/)).toBeVisible()
    const toggle = dialog.getByRole("switch", { name: "Share with your team" })
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await toggle.click()
    await expect(page.getByText("Shared with your team").first()).toBeVisible()
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(page.getByRole("button", { name: "Shared", exact: true })).toBeVisible()
    await toggle.click()
    await expect(page.getByText("This topic is private again")).toBeVisible()
    expect(m.posts.filter((p) => p.url.endsWith("/share")).map((p) => p.body)).toEqual([{ shared: true }, { shared: false }])
    expect(errorsOf(page)).toEqual([])
  })

  test("shared with you: listed apart, read only, export still works", async ({ page }) => {
    const theirs = buildDetail({ viewer: true })
    await setup(page, { shared: [theirs.topic], detail: theirs })
    await page.goto("/listening")
    const section = page.getByRole("region", { name: /Shared with you/ })
    await expect(section.getByText("Shared by Mariah Tang")).toBeVisible()
    await section.getByRole("link", { name: /online nursing degree/ }).click()
    await expect(page.getByText("Shared by Mariah Tang · read only")).toBeVisible()
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Rescan for more/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Share/ })).toHaveCount(0)
    // Ideas can still be saved to your own board.
    await expect(page.getByRole("button", { name: "Save", exact: true }).first()).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("admin: sees everyone's topics, private ones too, and who ran each scan", async ({ page }) => {
    const joes = buildDetail({ viewer: true, owner: "joe.volk@stamats.com", shared: false })
    const mariahs = buildDetail({ viewer: true })
    await setup(page, {
      admin: true,
      team: [joes.topic, { ...mariahs.topic, id: "t-mariah", query: "college enrollment trends" }],
      shared: [mariahs.topic],
      detail: joes,
    })
    await page.goto("/listening")
    const section = page.getByRole("region", { name: /Everyone's topics/ })
    await expect(section.getByText("Joe Volk · private")).toBeVisible()
    await expect(section.getByText("Mariah Tang · shared")).toBeVisible()
    // The admin list already includes shared topics; no second list.
    await expect(page.getByRole("heading", { name: /Shared with you/ })).toHaveCount(0)
    await section.getByRole("link", { name: /online nursing degree/ }).click()
    await expect(page.getByText("Joe Volk's private topic · admin view, read only")).toBeVisible()
    await expect(page.getByRole("button", { name: /Rescan for more/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible()
    await page.getByRole("button", { name: /How this was made/ }).click()
    await expect(page.getByText("by Joe Volk")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("not an admin: no everyone's-topics list", async ({ page }) => {
    const mariahs = buildDetail({ viewer: true })
    await setup(page, { shared: [mariahs.topic] })
    await page.goto("/listening")
    await expect(page.getByRole("heading", { name: /Shared with you/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Everyone's topics/ })).toHaveCount(0)
  })

  test("idea board: save from a topic, track status, filter, remove", async ({ page }) => {
    const m = await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    const save = page.getByRole("button", { name: "Save", exact: true }).first()
    await save.click()
    await expect(page.getByText("Saved to your idea board")).toBeVisible()
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true")
    expect(m.posts.find((p) => p.url === "/ideas")?.body).toEqual({ topicId: TOPIC_ID, ideaId: "idea1" })

    await page.locator("#ideas").locator("..").getByRole("link", { name: "Idea board" }).click()
    await expect(page).toHaveURL(/\/listening\/ideas$/)
    await expect(page.getByRole("heading", { level: 1, name: "Idea board" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Who finds your clinical placement in an online program" })).toBeVisible()
    await expect(page.getByRole("link", { name: "online nursing degree" })).toHaveAttribute("href", `/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: /Outline and 3 sources/ }).click()
    await expect(page.locator('a[href="https://www.reddit.com/r/nursing/comments/t1/thread_1/"]')).toHaveAttribute("target", "_blank")

    await page.getByLabel(/Status of Who finds your clinical placement/).selectOption("pitched")
    await expect.poll(() => m.patches.map((p) => p.body)).toEqual([{ status: "pitched" }])
    await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: /Pitched/ }).click()
    await expect(page.getByRole("heading", { name: "Who finds your clinical placement in an online program" })).toBeVisible()

    // Remove asks once more before it deletes.
    await page.getByRole("button", { name: "Remove" }).click()
    expect(m.deletes).toEqual([])
    await page.getByRole("button", { name: "Click to remove" }).click()
    await expect(page.getByText("No saved ideas yet")).toBeVisible()
    expect(m.deletes).toEqual(["/ideas/saved-1"])
    expect(errorsOf(page)).toEqual([])
  })

  test("idea board: the topic page knows what is already saved", async ({ page }) => {
    const m = await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "Save", exact: true }).first().click()
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible()
    // Unsave from the topic page.
    await page.getByRole("button", { name: "Saved", exact: true }).click()
    await expect(page.getByText("Removed from your idea board")).toBeVisible()
    expect(m.ideas).toEqual([])
    await page.goto("/listening")
    await expect(page.getByRole("link", { name: /Idea board/ })).toContainText("0")
  })

  test("no supported idea: says why instead of blaming the scan", async ({ page }) => {
    await setup(page, { detail: buildDetail({ noIdeas: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText(/No idea had at least two posts that clearly back it up/)).toBeVisible()
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
    await setup(page, { detail: buildDetail({ institution: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("People weigh flexibility")).toBeVisible()
    await expect(page.getByRole("heading", { name: /What Coe College says about itself/ })).toBeAttached()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
