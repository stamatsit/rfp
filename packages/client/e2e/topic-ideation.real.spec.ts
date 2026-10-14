/**
 * Topic Ideation design review on real reports: renders topic details dumped
 * from production (JSON files in REAL_DIR) through the same mocks as the
 * visual pass, at desktop and phone width. Skipped unless REAL_DIR and SHOTS
 * are set; the data never lives in the repo.
 *
 *   cd packages/client && REAL_DIR=/path/to/json SHOTS=/path/to/shots npx playwright test e2e/topic-ideation.real.spec.ts
 */
import fs from "node:fs"
import path from "node:path"
import { test, type Page } from "@playwright/test"
import { TOPIC_ID, setup } from "./fixtures/listeningMocks"

const REAL = process.env["REAL_DIR"]
const DIR = process.env["SHOTS"]
test.skip(!REAL || !DIR, "set REAL_DIR and SHOTS to capture real-report screenshots")

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]
const THEME = (process.env["THEME"] ?? "light") as "light" | "dark"

async function theme(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: THEME })
  await page.addInitScript((v) => {
    localStorage.setItem("theme", v)
    localStorage.setItem("stamats-app-settings", JSON.stringify({ theme: v }))
  }, THEME)
}

const reports = REAL ? fs.readdirSync(REAL).filter((f) => f.endsWith(".json") && f !== "topics.json") : []
const topicsList = REAL && fs.existsSync(path.join(REAL, "topics.json")) ? JSON.parse(fs.readFileSync(path.join(REAL, "topics.json"), "utf8")) : { topics: [], team: [] }

for (const vp of VIEWPORTS) {
  test(`${vp.name} home`, async ({ page }) => {
    await page.setViewportSize(vp)
    await theme(page)
    await setup(page, { topics: topicsList.topics, team: topicsList.team ?? null, visibility: "team" } as never)
    await page.goto("/listening")
    await page.getByRole("search").waitFor()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-home.png`, fullPage: true })
  })

  for (const file of reports) {
    const slug = file.replace(/\.json$/, "")
    test(`${vp.name} ${slug}`, async ({ page }) => {
      const detail = JSON.parse(fs.readFileSync(path.join(REAL!, file), "utf8"))
      detail.topic.id = TOPIC_ID
      await page.setViewportSize(vp)
      await theme(page)
      await setup(page, { detail, topics: topicsList.topics, team: topicsList.team ?? null, visibility: "team" } as never)
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-${slug}-top.png` })
      await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-${slug}-full.png`, fullPage: true })
      // Each tab, if the redesign's tabs are there.
      const tabs = page.getByRole("tablist", { name: "Report sections" })
      if (await tabs.count()) {
        for (const name of ["Ideas", "Questions", "Quotes", "Subtopics", "Sources"]) {
          await tabs.getByRole("tab", { name: new RegExp(`^${name}`) }).click()
          await page.waitForTimeout(250)
          await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-${slug}-tab-${name.toLowerCase()}.png`, fullPage: true })
        }
        await tabs.getByRole("tab", { name: /^Ideas/ }).click()
        const first = page.getByRole("list", { name: "Content ideas" }).getByRole("button").first()
        if (await first.count()) {
          await first.click()
          await page.getByRole("dialog").waitFor()
          await page.waitForTimeout(450)
          await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-${slug}-panel.png` })
          await page.getByRole("dialog").getByRole("tab", { name: /^Blog/ }).click()
          await page.waitForTimeout(250)
          await page.screenshot({ path: `${DIR}/real-${vp.name}-${THEME}-${slug}-panel-draft.png` })
        }
      }
    })
  }
}
