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
import { RUN_1, RUN_2, RUN_EVENTS, TOPIC_ID, buildDetail, errorsOf, manyTopics, setup, sse } from "./fixtures/listeningMocks"

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
    await expect(page.getByRole("button", { name: "Scan", exact: true })).toBeDisabled()
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
    // Nothing of your own yet, so the library opens on what was shared.
    await expect(page.getByRole("tab", { name: /Shared with you/ })).toHaveAttribute("aria-selected", "true")
    const section = page.getByRole("tabpanel", { name: /Shared with you/ })
    await expect(section.getByText("Shared by Mariah Tang")).toBeVisible()
    await expect(section.getByText("Read, export and save ideas. Only the owner can rescan.")).toBeVisible()
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
    const section = page.getByRole("tabpanel", { name: /Everyone's topics/ })
    await expect(section.getByText("As an admin you can open every scan, private ones too.")).toBeVisible()
    await expect(section.getByText("Joe Volk · private")).toBeVisible()
    await expect(section.getByText("Mariah Tang · shared")).toBeVisible()
    // The admin list already includes shared topics; no second list.
    await expect(page.getByRole("tab", { name: /Shared with you/ })).toHaveCount(0)
    await section.getByRole("link", { name: /online nursing degree/ }).click()
    await expect(page.getByText("Joe Volk's private topic · admin view, read only")).toBeVisible()
    await expect(page.getByRole("button", { name: /Rescan for more/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible()
    await page.getByRole("button", { name: /How this was made/ }).click()
    await expect(page.getByText("by Joe Volk")).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("team visibility: everyone sees every scan with its owner, read only, and nothing claims to be private", async ({ page }) => {
    const erics = buildDetail({ viewer: true, owner: "eric.yerke@stamats.com", shared: false })
    const mariahs = buildDetail({ viewer: true, shared: false })
    const mine = buildDetail({ owner: "joe.volk@stamats.com" })
    const m = await setup(page, {
      visibility: "team",
      topics: [{ ...mine.topic, id: "joe-1", query: "FAFSA changes", shared: true }],
      team: [erics.topic, { ...mariahs.topic, id: "t-mariah", query: "college enrollment trends" }],
      shared: [{ ...mariahs.topic, id: "t-mariah", query: "college enrollment trends" }],
      detail: erics,
    })
    await page.goto("/listening")
    // Joe is not an admin, yet the list of everyone's scans is there, with no private or shared labels.
    const section = page.getByRole("region", { name: /Everyone's topics/ })
    await expect(section.getByText("Every scan anyone on the team runs shows here. Open, export and save ideas from any of them; only the person who ran it can rescan.")).toBeVisible()
    await expect(section.getByText("Eric Yerke", { exact: true })).toBeVisible()
    await expect(section.getByText("Mariah Tang", { exact: true })).toBeVisible()
    await expect(page.getByText(/· private|· shared|admin/)).toHaveCount(0)
    await expect(page.getByText("Shared with your team")).toHaveCount(0)
    // No second list of the same topics.
    await expect(page.getByRole("heading", { name: /Shared with you/ })).toHaveCount(0)

    // Eric's topic opens read only, says whose it is, and still exports and saves.
    await section.getByRole("link", { name: /online nursing degree/ }).click()
    await expect(page.getByText("Eric Yerke's topic · read only")).toBeVisible()
    await expect(page.getByText(/private topic|admin view/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Rescan for more/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Share/ })).toHaveCount(0)
    await page.getByRole("button", { name: "Save", exact: true }).first().click()
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true")

    // On your own topic there is nothing to share: everyone already sees it. Rescan and the menu stay.
    m.detail = buildDetail()
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByRole("button", { name: /Rescan for more/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "More actions" })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Share/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Shared", exact: true })).toHaveCount(0)
    expect(errorsOf(page)).toEqual([])
  })

  test("not an admin: no everyone's-topics list", async ({ page }) => {
    const mariahs = buildDetail({ viewer: true })
    await setup(page, { shared: [mariahs.topic] })
    await page.goto("/listening")
    await expect(page.getByRole("tab", { name: /Shared with you/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Everyone's topics/ })).toHaveCount(0)
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

  test("drafts: a blog outline, a LinkedIn post and headlines from an idea, in place and kept with it", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const m = await setup(page, { draftDelayMs: 500 })
    await page.goto(`/listening/${TOPIC_ID}`)
    const clip = () => page.evaluate(() => navigator.clipboard.readText())
    const draftPosts = () => m.posts.filter((p) => p.url === "/ideas/draft").map((p) => p.body)
    const button = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) }).first()

    // Blog outline: says it is writing, then shows notes with the posts each section answers.
    await button("Blog outline").click()
    const outline = page.getByRole("region", { name: "Blog outline" })
    await expect(outline.getByText("Writing an outline. About ten seconds.")).toBeVisible()
    await expect(outline.getByText("Drafting saves this idea to your board, so the draft stays with it.")).toBeVisible()
    await expect(outline.getByText("Who arranges your clinical placement, and when to ask")).toBeVisible()
    await expect(outline.getByText("Notes to write from, built only from this idea and its posts. The article is yours to write.")).toBeVisible()
    await expect(outline.getByText("What students are asking")).toBeVisible()
    await expect(outline.getByText("Open with the question people keep raising")).toBeVisible()
    await expect(outline.locator('a[href="https://www.reddit.com/r/nursing/comments/t1/thread_1/"]').first()).toHaveAttribute("target", "_blank")
    await expect(outline.getByText("End with the one question to ask an advisor.")).toBeVisible()
    expect(draftPosts()).toEqual([{ topicId: TOPIC_ID, ideaId: "idea1", kind: "blog_outline" }])
    // Drafting saved the idea to the board.
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(button("Blog outline")).toContainText("(written)")

    await outline.getByRole("button", { name: "Copy", exact: true }).click()
    const copied = await clip()
    expect(copied).toContain("Blog outline: Who arranges your clinical placement, and when to ask")
    expect(copied).toContain("1. What students are asking\n   - Open with the question people keep raising")
    expect(copied).toContain("Posts: https://www.reddit.com/r/nursing/comments/t1/thread_1/")
    expect(copied).toContain("To close: End with the one question to ask an advisor.")

    // Hiding and showing it again asks the server for nothing.
    await button("Blog outline").click()
    await expect(outline).toHaveCount(0)
    await button("Blog outline").click()
    await expect(outline.getByText("What students are asking")).toBeVisible()
    expect(draftPosts()).toHaveLength(1)

    // Write another asks first, then replaces it. Later requests go to the saved copy.
    await outline.getByRole("button", { name: "Write another" }).click()
    expect(draftPosts()).toHaveLength(1)
    await outline.getByRole("button", { name: "Replace this one?" }).click()
    await expect(outline.getByText("Clinical placement, explained before you enroll")).toBeVisible()
    await expect(outline.getByText("Who arranges your clinical placement, and when to ask")).toHaveCount(0)
    expect(draftPosts()[1]).toEqual({ savedId: "saved-1", kind: "blog_outline", fresh: true })

    // LinkedIn post.
    await button("LinkedIn post").click()
    const post = page.getByRole("region", { name: "LinkedIn post" })
    await expect(post.getByText("Online nursing students keep asking one thing: who actually finds the clinical placement?")).toBeVisible()
    await expect(post.getByText("#HigherEdMarketing #NursingEducation")).toBeVisible()
    await expect(post.getByText(/^\d+ words, \d+ characters$/)).toBeVisible()
    await expect(post.getByText("A first draft to edit in your own voice. Check it against the posts before you publish.")).toBeVisible()
    await post.getByRole("button", { name: "Copy", exact: true }).click()
    expect(await clip()).toMatch(/^Online nursing students keep asking[\s\S]*clinical placement today\?\n\n#HigherEdMarketing #NursingEducation$/)
    // One panel at a time.
    await expect(outline).toHaveCount(0)

    // Headlines: ten, each with its length and its own copy button.
    await button("Headlines").click()
    const heads = page.getByRole("region", { name: "Headlines" })
    await expect(heads.getByRole("listitem")).toHaveCount(10)
    await expect(heads.getByRole("listitem").first()).toContainText("Who arranges clinical placements for online students?")
    await expect(heads.getByRole("listitem").first()).toContainText("53")
    await heads.getByRole("button", { name: "Copy headline: Before you enroll, ask who finds the site" }).click()
    expect(await clip()).toBe("Before you enroll, ask who finds the site")
    await heads.getByRole("button", { name: "Copy all" }).click()
    expect((await clip()).split("\n")).toHaveLength(10)
    expect(draftPosts().map((b) => (b as { kind: string }).kind)).toEqual(["blog_outline", "blog_outline", "linkedin_post", "headlines"])

    // After a reload the drafts are still there, and opening one writes nothing.
    await page.reload()
    await expect(button("Headlines")).toContainText("(written)")
    await button("Headlines").click()
    await expect(page.getByRole("region", { name: "Headlines" }).getByRole("listitem")).toHaveCount(10)
    expect(draftPosts()).toHaveLength(4)

    // On the idea board the same drafts sit with the idea.
    await page.goto("/listening/ideas")
    await expect(page.getByRole("button", { name: /^LinkedIn post/ })).toContainText("(written)")
    await page.getByRole("button", { name: /^Blog outline/ }).click()
    await expect(page.getByRole("region", { name: "Blog outline" }).getByText("Clinical placement, explained before you enroll")).toBeVisible()
    expect(draftPosts()).toHaveLength(4)
    // Removing the idea says the drafts go with it.
    await page.getByRole("button", { name: "Remove" }).click()
    await page.getByRole("button", { name: "Remove, drafts too?" }).click()
    await expect(page.getByText("No saved ideas yet")).toBeVisible()
    expect(m.drafts).toEqual({})
    expect(errorsOf(page)).toEqual([])
  })

  test("drafts: a failure says so, saves nothing, and Try again works", async ({ page }) => {
    const m = await setup(page, { draftStatus: 502 })
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: /^Headlines/ }).first().click()
    const panel = page.getByRole("region", { name: "Headlines" })
    await expect(panel.getByRole("alert")).toContainText("The draft could not be written this time. Try again.")
    // Nothing was saved to the board by the failed attempt.
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveCount(0)
    expect(m.ideas).toEqual([])
    m.draftStatus = 200
    await panel.getByRole("button", { name: "Try again" }).click()
    await expect(panel.getByRole("listitem")).toHaveCount(10)
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true")
    // Un-saving an idea that has drafts asks first.
    await page.getByRole("button", { name: "Saved", exact: true }).click()
    expect(m.deletes).toEqual([])
    await page.getByRole("button", { name: "Remove, drafts too?" }).click()
    await expect(page.getByText("Removed from your idea board")).toBeVisible()
    expect(m.deletes).toEqual(["/ideas/saved-1"])
    await expect(page.getByRole("region", { name: "Headlines" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Headlines/ }).first()).not.toContainText("(written)")
  })

  test("drafts: a teammate reading a shared topic can draft to their own board", async ({ page }) => {
    const theirs = buildDetail({ viewer: true })
    const m = await setup(page, { shared: [theirs.topic], detail: theirs })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("Shared by Mariah Tang · read only")).toBeVisible()
    await page.getByRole("button", { name: /^LinkedIn post/ }).first().click()
    await expect(page.getByRole("region", { name: "LinkedIn post" }).getByText(/who actually finds the clinical placement\?/)).toBeVisible()
    expect(m.ideas).toHaveLength(1)
  })

  test("thumbs: rate an idea, change your mind, clear it; kept across a reload and put back if the save fails", async ({ page }) => {
    const m = await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    const HEAD = "Who finds your clinical placement in an online program"
    const up = page.getByRole("button", { name: `More ideas like this: ${HEAD}` })
    const down = page.getByRole("button", { name: `Fewer ideas like this: ${HEAD}` })
    const votes = () => m.posts.filter((p) => p.url === "/ideas/vote").map((p) => p.body)
    await expect(up).toHaveAttribute("aria-pressed", "false")
    await up.click()
    await expect(up).toHaveAttribute("aria-pressed", "true")
    await expect.poll(votes).toEqual([{ topicId: TOPIC_ID, ideaId: "idea1", vote: 1 }])
    // The other thumb replaces it; the same thumb again clears it.
    await down.click()
    await expect(down).toHaveAttribute("aria-pressed", "true")
    await expect(up).toHaveAttribute("aria-pressed", "false")
    await down.click()
    await expect(down).toHaveAttribute("aria-pressed", "false")
    await expect.poll(() => votes().map((b) => (b as { vote: number }).vote)).toEqual([1, -1, 0])
    expect(m.votes).toEqual({})

    await up.click()
    await expect.poll(() => m.votes).toEqual({ idea1: 1 })
    await page.reload()
    await expect(page.getByRole("button", { name: `More ideas like this: ${HEAD}` })).toHaveAttribute("aria-pressed", "true")
    // The second idea has its own thumbs.
    await expect(page.getByRole("button", { name: "More ideas like this: The real cost per credit, explained" })).toHaveAttribute("aria-pressed", "false")

    // The server refuses: the thumb goes back and the page says so.
    m.voteStatus = 500
    await page.getByRole("button", { name: `Fewer ideas like this: ${HEAD}` }).click()
    await expect(page.getByText("Something went wrong. Try again.")).toBeVisible()
    await expect(page.getByRole("button", { name: `More ideas like this: ${HEAD}` })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: `Fewer ideas like this: ${HEAD}` })).toHaveAttribute("aria-pressed", "false")
    expect(m.votes).toEqual({ idea1: 1 })
  })

  test("more ideas: written from the posts already collected, added with a New tag, and honest when nothing holds up", async ({ page }) => {
    const m = await setup(page, { moreDelayMs: 500 })
    await page.goto(`/listening/${TOPIC_ID}`)
    const more = page.getByRole("button", { name: "More ideas", exact: true })
    await expect(page.getByText(/Your thumbs steer what comes next/)).toBeVisible()
    await more.click()
    const writing = page.getByRole("button", { name: "Writing more ideas" })
    await expect(writing).toBeDisabled()
    await expect(page.getByText("From the posts already collected, each checked against them. About 20 seconds, and no searches.")).toBeVisible()
    await expect(page.getByText("2 ideas added")).toBeVisible()
    expect(m.posts.filter((p) => p.url.endsWith("/ideas/more"))).toHaveLength(1)
    // Two more cards, marked New, and the keyboard lands on the first of them.
    await expect(page.getByRole("heading", { name: /Content ideas/ })).toContainText("4")
    const first = page.locator("#idea-idea3")
    await expect(first.getByRole("heading", { name: "Questions to ask a program before you enroll" })).toBeFocused()
    await expect(first.getByText("New", { exact: true })).toBeVisible()
    await expect(page.locator("#idea-idea4").getByText("New", { exact: true })).toBeVisible()
    await expect(page.locator("#idea-idea1").getByText("New", { exact: true })).toHaveCount(0)
    await expect(first).toBeInViewport()
    // A new idea works like any other: it can be rated, saved and drafted from.
    await first.getByRole("button", { name: /^More ideas like this/ }).click()
    await expect.poll(() => m.votes).toEqual({ idea3: 1 })
    await first.getByRole("button", { name: "Save", exact: true }).click()
    await expect(first.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true")

    // Nothing more holds up: no card is added and the page says what to do.
    m.moreIdeas = "none"
    await more.click()
    await expect(page.getByText("No further idea held up against the posts collected. Rescan to bring in more conversation, then ask again.")).toBeVisible()
    await expect(page.getByRole("heading", { name: /Content ideas/ })).toContainText("4")
    // Refused (a scan is running): the reason shows in place.
    m.moreIdeas = 409
    await more.click()
    await expect(page.getByText("A scan is running for this topic. Ask again when it finishes.")).toBeVisible()
    await expect(more).toBeEnabled()
    expect(errorsOf(page).filter((e) => !/409/.test(e))).toEqual([])
  })

  test("a teammate reading a shared topic can rate ideas but not add to the report", async ({ page }) => {
    const theirs = buildDetail({ viewer: true })
    const m = await setup(page, { shared: [theirs.topic], detail: theirs })
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("Shared by Mariah Tang · read only")).toBeVisible()
    await expect(page.getByRole("button", { name: "More ideas", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: /^Fewer ideas like this: Who finds your clinical placement/ }).click()
    await expect.poll(() => m.votes).toEqual({ idea1: -1 })
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

  test("time range: short presets, and custom dates that must be valid before a scan can start", async ({ page }) => {
    const m = await setup(page)
    await page.goto("/listening")
    const box = page.getByPlaceholder("A topic, or a school or hospital by name")
    const range = page.getByLabel("Time range")
    await expect(range.locator("option")).toHaveText(["Past 24 hours", "Past week", "Past month", "Past 3 months", "Past year", "Any time", "Custom dates"])
    await box.fill("FAFSA changes")
    await range.selectOption("custom")
    // No dates yet: the scan cannot start.
    await expect(page.getByRole("button", { name: "Scan", exact: true })).toBeDisabled()
    await page.getByLabel("From", { exact: true }).fill("2026-05-31")
    await page.getByLabel("To", { exact: true }).fill("2026-03-01")
    await expect(page.getByText("The start date must be on or before the end date.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Scan", exact: true })).toBeDisabled()
    await page.getByLabel("From", { exact: true }).fill("2026-03-01")
    await page.getByLabel("To", { exact: true }).fill("2026-05-31")
    await expect(page.getByText("Only posts dated inside these dates are kept.")).toBeVisible()
    m.detail = buildDetail({ range: { from: "2026-03-01", to: "2026-05-31" } })
    await page.getByRole("button", { name: "Scan", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/listening/${TOPIC_ID}$`))
    expect(m.posts[0]).toEqual({ url: "/topics", body: { query: "FAFSA changes", timeWindow: "custom", from: "2026-03-01", to: "2026-05-31" } })
    // The topic says which dates it covers.
    await expect(page.getByText(/· Mar 1, 2026 to May 31, 2026 ·/)).toBeVisible()
    expect(errorsOf(page)).toEqual([])
  })

  test("time range: a preset sends no dates, and a topic can be scanned again over another range", async ({ page }) => {
    const m = await setup(page)
    await page.goto("/listening")
    await page.getByPlaceholder("A topic, or a school or hospital by name").fill("FAFSA changes")
    await page.getByLabel("Time range").selectOption("1d")
    await expect(page.getByLabel("From", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Scan", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/listening/${TOPIC_ID}$`))
    expect(m.posts[0]).toEqual({ url: "/topics", body: { query: "FAFSA changes", timeWindow: "1d" } })
    // From the topic's menu: back to the search box with the topic filled in, ready for new dates.
    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: /Scan another time range/ }).click()
    await expect(page).toHaveURL(/\/listening\?q=online%20nursing%20degree$/)
    await expect(page.getByPlaceholder("A topic, or a school or hospital by name")).toHaveValue("online nursing degree")
    await expect(page.getByLabel("Time range")).toBeVisible()
  })

  test("leave out words: checked in the form, sent with the scan, shown on the topic and carried to the next scan", async ({ page }) => {
    const m = await setup(page)
    await page.goto("/listening")
    const box = page.getByPlaceholder("A topic, or a school or hospital by name")
    const scan = page.getByRole("button", { name: "Scan", exact: true })
    await box.fill("online nursing degree")
    // Hidden until asked for.
    await expect(page.getByLabel("Leave out", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Leave out words" }).click()
    const leave = page.getByLabel("Leave out", { exact: true })
    await expect(leave).toBeFocused()
    await expect(page.getByText("Posts that mention any of these are not collected or counted. For example: sports, rankings.")).toBeVisible()
    await expect(scan).toBeEnabled()

    // A word from the topic itself, too many, too long: each says why and holds the scan.
    await leave.fill("nursing")
    await expect(page.getByText('"nursing" is part of the topic, so leaving it out would leave out everything.')).toBeVisible()
    await expect(scan).toBeDisabled()
    await leave.fill("a1, b2, c3, d4, e5, f6, g7, h8, i9")
    await expect(page.getByText("Leave out up to 8 words or phrases.")).toBeVisible()
    await expect(scan).toBeDisabled()
    await leave.fill("one two three four five")
    await expect(page.getByText("Keep each phrase to four words or fewer.")).toBeVisible()
    await expect(scan).toBeDisabled()

    // Typed the way people type: quotes, a minus sign, a repeat.
    await leave.fill('sports, -"Greek life", Sports')
    await expect(page.getByText("Leaving out sports, Greek life. Posts that mention any of them are not collected or counted.")).toBeVisible()
    await expect(scan).toBeEnabled()
    m.detail = buildDetail({ exclude: ["sports", "Greek life"] })
    await scan.click()
    await expect(page).toHaveURL(new RegExp(`/listening/${TOPIC_ID}$`))
    expect(m.posts[0]).toEqual({ url: "/topics", body: { query: "online nursing degree", timeWindow: "1y", exclude: ["sports", "Greek life"] } })
    // The topic says what it leaves out, in its header and in how it was made.
    await expect(page.getByText(/· leaving out sports, Greek life ·/)).toBeVisible()
    await page.getByRole("button", { name: /How this was made/ }).click()
    await expect(page.getByText("Left out of this topic on request: sports, Greek life. Every search excluded them, and no post that mentions one is counted.")).toBeVisible()

    // Scanning the topic again over another range brings the list along.
    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: /Scan another time range/ }).click()
    await expect(page).toHaveURL(/\/listening\?q=online%20nursing%20degree&x=sports%2C%20Greek%20life$/)
    await expect(page.getByLabel("Leave out", { exact: true })).toHaveValue("sports, Greek life")
    // Closing the field stops leaving anything out: the next scan sends no list.
    await page.getByRole("button", { name: "Stop leaving words out" }).click()
    await expect(page.getByLabel("Leave out", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Scan", exact: true }).click()
    await expect.poll(() => m.posts.filter((p) => p.url === "/topics").length).toBe(2)
    expect(m.posts.filter((p) => p.url === "/topics")[1]!.body).toEqual({ query: "online nursing degree", timeWindow: "1y" })
    expect(errorsOf(page)).toEqual([])
  })

  test("leave out words: the library tells two scans of a topic apart and finds one by what it leaves out", async ({ page }) => {
    const base = buildDetail().topic
    const topics = [
      { ...base, id: "a", query: "higher ed marketing" },
      { ...base, id: "b", query: "higher ed marketing", excludeTerms: ["sports", "rankings", "greek life"] },
      ...manyTopics(8),
    ]
    await setup(page, { topics })
    await page.goto("/listening")
    const rows = page.getByRole("list", { name: "Your topics" }).getByRole("listitem")
    await expect(rows).toHaveCount(10)
    await expect(rows.nth(1)).toContainText("Past year, without sports +2")
    await expect(rows.nth(0)).not.toContainText("without")
    await page.getByLabel("Filter topics").fill("marketing rankings")
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText("without sports +2")
  })

  test("thin report: a broader-topic suggestion puts that topic in the search box", async ({ page }) => {
    const m = await setup(page, { detail: buildDetail({ thin: true }) })
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "nursing school" }).click()
    await expect(page.getByPlaceholder("A topic, or a school or hospital by name")).toHaveValue("nursing school")
    // Filled in, not scanned: the user still chooses the time range and presses Scan.
    expect(m.posts).toHaveLength(0)
  })

  test("usage: who has scanned today and this week, without naming a teammate's private topic", async ({ page }) => {
    await setup(page)
    await page.goto("/listening")
    await page.getByRole("button", { name: "Who has scanned?" }).click()
    const panel = page.locator("#usage-panel")
    await expect(panel.getByText(/34 of 100 searches used, about 3 scans left/)).toBeVisible()
    await expect(panel.getByText("Mariah Tang", { exact: true })).toBeVisible()
    await expect(panel.getByText("a private topic")).toBeVisible()
    await expect(panel.getByRole("link", { name: "online nursing degree" })).toHaveAttribute("href", `/listening/${TOPIC_ID}`)
    await expect(panel.getByText("Eric Yerke 4 scans")).toBeVisible()
    await expect(panel.getByText("Mariah Tang 1 scan", { exact: true })).toBeVisible()
    await expect(panel.getByText(/Refresh analysis and exports use none/)).toBeVisible()
    await page.getByRole("button", { name: "Who has scanned?" }).click()
    await expect(panel).toHaveCount(0)
    expect(errorsOf(page)).toEqual([])
  })

  test("export sources: a spreadsheet of every post with its text, and a clean list of links", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await page.getByRole("button", { name: "Export" }).click()
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /All sources \(spreadsheet\)/ }).click()])
    expect(dl.suggestedFilename()).toBe("Topic Ideation - online nursing degree - sources - 2026-10-07.csv")
    if (process.env["KEEP_EXPORTS"]) fs.copyFileSync((await dl.path())!, `${process.env["KEEP_EXPORTS"]}/${dl.suggestedFilename()}`)
    const csv = fs.readFileSync((await dl.path())!, "utf8")
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trimEnd().split("\r\n")
    expect(lines[0]).toBe('"Link","Platform","Type","Date","Author","Counted in report","If not counted, why","Feeling","Audience","Subtopic","Question asked","Title","Text"')
    // 13 relevant sources (11 counted, 2 not), never the off-topic one.
    expect(lines).toHaveLength(14)
    expect(csv).toContain('"https://www.reddit.com/r/nursing/comments/t1/thread_1/","Reddit","post","2026-09-12","user1","yes",""')
    expect(csv).toContain('"no","passing mention"')
    expect(csv).toContain('"no","news outlet"')
    expect(csv).not.toContain("coe_visa")
    // Full text with its quotes escaped, and a formula-looking post made inert.
    expect(csv).toContain('Full text of the post, with ""quotes"", a comma, and a second sentence."')
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"",""click"")"`)
    expect(csv).not.toMatch(/,"=HYPERLINK/)
    await expect(page.getByText("Spreadsheet downloaded: 13 sources")).toBeVisible()

    await page.getByRole("button", { name: "Export" }).click()
    await page.getByRole("menuitem", { name: /Copy source links/ }).click()
    await expect(page.getByText("Copied 11 links")).toBeVisible()
    const links = (await page.evaluate(() => navigator.clipboard.readText())).split("\n")
    expect(links).toHaveLength(11)
    expect(links[0]).toBe("https://www.reddit.com/r/nursing/comments/t1/thread_1/")
    expect(links.every((l) => /^https:\/\//.test(l))).toBe(true)
    expect(errorsOf(page)).toEqual([])
  })

  test("the platform chart says it is our sample, not where all conversation is", async ({ page }) => {
    await setup(page)
    await page.goto(`/listening/${TOPIC_ID}`)
    await expect(page.getByText("Where our sample came from")).toBeVisible()
    await expect(page.getByText("The platforms this tool can read. Not a measure of where all the conversation happens.")).toBeVisible()
    await expect(page.getByText("Where the conversation is")).toHaveCount(0)
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
    await page.getByRole("button", { name: "Scan", exact: true }).click()
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
    await page.getByRole("button", { name: "Scan", exact: true }).click()
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

  test("library: a hundred scans stay findable by tab, filter, person and sort", async ({ page }) => {
    const mine = manyTopics(60)
    mine[1] = { ...mine[1]!, id: TOPIC_ID }
    const team = manyTopics(40, ["joe.volk@stamats.com", "mariah.tang@stamats.com", "sam.lee@stamats.com"], "team")
    await setup(page, { admin: true, topics: mine, team })
    await page.goto("/listening")
    const yours = page.getByRole("tab", { name: /Your topics/ })
    const everyone = page.getByRole("tab", { name: /Everyone's topics/ })
    await expect(yours).toHaveAttribute("aria-selected", "true")
    await expect(yours).toContainText("60")
    await expect(everyone).toContainText("40")

    // A page at a time, as compact lines, instead of sixty cards.
    const rows = page.getByRole("list", { name: "Your topics" }).getByRole("listitem")
    await expect(rows).toHaveCount(24)
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText("Showing 24 of 60")).toBeVisible()
    await page.getByRole("button", { name: "Show 24 more" }).click()
    await expect(rows).toHaveCount(48)
    await page.getByRole("button", { name: "Show 12 more" }).click()
    await expect(rows).toHaveCount(60)
    await expect(page.getByText(/Showing \d+ of 60/)).toHaveCount(0)
    // A topic still scanning and one that failed say so in place of figures.
    await expect(rows.nth(3)).toContainText("Scanning")
    await expect(rows.nth(8)).toContainText("Did not finish")

    // Filter: one topic scanned over three ranges, told apart by the range on each line.
    const filter = page.getByLabel("Filter topics")
    await filter.fill("fafsa")
    await expect(rows).toHaveCount(3)
    await expect(page.getByText("3 of 60 topics")).toBeVisible()
    await expect(rows.nth(0)).toContainText("Past year")
    await expect(rows.nth(1)).toContainText("Past 3 months")
    await expect(rows.nth(2)).toContainText("Past week")
    await filter.fill("FAFSA  week")
    await expect(rows).toHaveCount(1)
    await filter.fill("zzz")
    await expect(page.getByText("No topics match")).toBeVisible()
    await expect(page.getByText("0 of 60 topics")).toBeVisible()
    await page.getByRole("button", { name: "Clear filters" }).click()
    await expect(filter).toHaveValue("")
    await expect(rows).toHaveCount(24)
    await filter.fill("fafsa")
    await filter.press("Escape")
    await expect(filter).toHaveValue("")

    // Sort.
    const sort = page.getByLabel("Sort by", { exact: true })
    await sort.selectOption("name")
    await expect(rows.first()).toContainText("adult learners returning to school")
    await sort.selectOption("posts")
    const most = [...mine].sort((a, b) => b.relevantCount - a.relevantCount)[0]!
    await expect(rows.first()).toContainText(most.query)
    await expect(rows.first()).toContainText(`${most.relevantCount} posts`)
    await sort.selectOption("negative")
    const scored = mine.filter((t) => t.sentimentScore !== null)
    const lowest = [...scored].sort((a, b) => (a.sentimentScore as number) - (b.sentimentScore as number))[0]!
    await expect(rows.first().getByRole("link")).toHaveAttribute("href", `/listening/${lowest.id}`)
    // Topics with no feeling yet sink to the end, whichever way the sort runs.
    await page.getByRole("button", { name: "Show 24 more" }).click()
    await page.getByRole("button", { name: "Show 12 more" }).click()
    await expect(rows.nth(58)).toContainText(/Scanning|Did not finish/)
    await expect(rows.nth(59)).toContainText(/Scanning|Did not finish/)

    // Everyone's topics: pick a person, or type their name.
    await everyone.click()
    const theirs = page.getByRole("list", { name: "Everyone's topics" }).getByRole("listitem")
    await expect(theirs).toHaveCount(24)
    const person = page.getByLabel("Person", { exact: true })
    await expect(person.locator("option")).toHaveText(["All people", "Joe Volk (14)", "Mariah Tang (13)", "Sam Lee (13)"])
    await person.selectOption("joe.volk@stamats.com")
    await expect(theirs).toHaveCount(14)
    await expect(page.getByText("14 of 40 topics")).toBeVisible()
    await expect(theirs.first()).toContainText(/Joe Volk · (shared|private)/)
    await person.selectOption("")
    await filter.fill("mariah")
    await expect(theirs).toHaveCount(13)
    await filter.fill("")

    // Arrow keys move between the tabs.
    await everyone.focus()
    await page.keyboard.press("ArrowLeft")
    await expect(yours).toHaveAttribute("aria-selected", "true")
    await expect(yours).toBeFocused()
    await expect(page.getByLabel("Person", { exact: true })).toHaveCount(0)

    // Cards on request; the view and the sort are remembered.
    await page.getByRole("button", { name: "Cards", exact: true }).click()
    await expect(page.getByRole("list", { name: "Your topics" }).getByRole("heading", { level: 3 })).toHaveCount(24)
    await page.reload()
    await expect(page.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue("negative")

    // Opening a topic and coming back lands on the same filtered list.
    await page.getByLabel("Filter topics").fill("nursing")
    await expect(rows).toHaveCount(3)
    await page.locator(`a[href="/listening/${TOPIC_ID}"]`).click()
    await expect(page.getByRole("heading", { level: 1, name: "online nursing degree" })).toBeVisible()
    await page.goBack()
    await expect(page.getByLabel("Filter topics")).toHaveValue("nursing")
    await expect(rows).toHaveCount(3)
    expect(errorsOf(page)).toEqual([])
  })

  test("library: a few topics stay simple, and every card shows its time range", async ({ page }) => {
    const base = buildDetail().topic
    await setup(page, {
      topics: [
        { ...base, id: "a", query: "FAFSA changes" },
        { ...base, id: "b", query: "FAFSA changes", timeWindow: "custom", windowFrom: "2026-03-01", windowTo: "2026-05-31" },
        { ...base, id: "c", query: "Coe College", timeWindow: "3m" },
      ],
    })
    await page.goto("/listening")
    await expect(page.getByRole("heading", { name: /Your topics/ })).toContainText("3")
    // No tabs and no filter bar until there is something to sift.
    await expect(page.getByRole("tab", { name: /Your topics/ })).toHaveCount(0)
    await expect(page.getByLabel("Filter topics")).toHaveCount(0)
    await expect(page.getByLabel("Sort by", { exact: true })).toHaveCount(0)
    const cards = page.getByRole("list", { name: "Your topics" }).getByRole("listitem")
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toContainText("Past year")
    await expect(cards.nth(1)).toContainText("Mar 1, 2026 to May 31, 2026")
    await expect(cards.nth(2)).toContainText("Past 3 months")
    expect(errorsOf(page)).toEqual([])
  })

  test("library: a filter left over from a long list never hides a short one", async ({ page }) => {
    const team = manyTopics(40, ["joe.volk@stamats.com", "mariah.tang@stamats.com"], "team")
    await setup(page, { admin: true, topics: [buildDetail().topic], team })
    await page.goto("/listening")
    await page.getByRole("tab", { name: /Everyone's topics/ }).click()
    await page.getByLabel("Filter topics").fill("zzz")
    await expect(page.getByText("No topics match")).toBeVisible()
    // Your one topic has no filter bar, so nothing may be filtered out of it.
    await page.getByRole("tab", { name: /Your topics/ }).click()
    await expect(page.getByLabel("Filter topics")).toHaveCount(0)
    await expect(page.getByRole("list", { name: "Your topics" }).getByRole("listitem")).toHaveCount(1)
    await expect(page.getByText("No topics match")).toHaveCount(0)
  })

  test("phone width: a long library has no sideways scrolling in either view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const mine = manyTopics(60)
    mine[0] = { ...mine[0]!, query: "what prospective graduate students say about tuition discounts at small private colleges in the midwest", timeWindow: "custom", windowFrom: "2026-03-01", windowTo: "2026-05-31" }
    await setup(page, { admin: true, topics: mine, team: manyTopics(40, ["joe.volk@stamats.com", "mariah.tang@stamats.com"], "team") })
    await page.goto("/listening")
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await expect(page.getByRole("list", { name: "Your topics" }).getByRole("listitem")).toHaveCount(24)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole("tab", { name: /Everyone's topics/ }).click()
    await expect(page.getByLabel("Person", { exact: true })).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole("button", { name: "Cards", exact: true }).click()
    await expect(page.getByRole("list", { name: "Everyone's topics" }).getByRole("heading", { level: 3 })).toHaveCount(24)
    expect(await overflow()).toBeLessThanOrEqual(0)
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
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    // Each draft, open, at phone width.
    for (const [name, text] of [["Blog outline", "What students are asking"], ["LinkedIn post", "#HigherEdMarketing"], ["Headlines", "Before you enroll, ask who finds the site"]] as const) {
      await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click()
      await expect(page.getByRole("region", { name }).getByText(text).first()).toBeVisible()
      expect(await overflow(), name).toBeLessThanOrEqual(0)
    }
  })
})
