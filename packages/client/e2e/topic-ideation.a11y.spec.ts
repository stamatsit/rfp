/**
 * Topic Ideation accessibility: axe-core (WCAG 2.0 to 2.2, A and AA) on every
 * main state, in light and dark. Each test fails on any violation and prints
 * what failed and where.
 */
import { createRequire } from "node:module"
import { expect, test, type Page } from "@playwright/test"
import { TOPIC_ID, buildDetail, manyTopics, setup } from "./fixtures/listeningMocks"

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js")

interface AxeViolation {
  id: string
  impact: string | null
  help: string
  nodes: Array<{ target: string[]; failureSummary?: string }>
}

async function audit(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(400)
  await page.addScriptTag({ path: AXE })
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: unknown[] }> } }).axe
    // The app shell (header, assistant button) is not this tool; audit the page body.
    const r = await axe.run({ include: [["main"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
    return r.violations
  }) as AxeViolation[]
  const lines = violations.flatMap((v) => v.nodes.slice(0, 4).map((n) => `  [${v.impact}] ${v.id}: ${v.help} -> ${n.target.join(" ")}`))
  expect(violations, `${label}\n${lines.join("\n")}`).toEqual([])
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
      await page.addInitScript((v) => {
        localStorage.setItem("theme", v)
        localStorage.setItem("stamats-app-settings", JSON.stringify({ theme: v }))
      }, scheme)
    })

    test("home with topics", async ({ page }) => {
      await setup(page, { topics: manyTopics(3), team: manyTopics(4, ["mariah.tang@stamats.com"], "team"), visibility: "team" })
      await page.goto("/listening")
      await page.getByRole("search").waitFor()
      await audit(page, "home")
    })

    test("report: every tab", async ({ page }) => {
      await setup(page, { detail: buildDetail({ institution: true }) })
      await page.goto(`/listening/${TOPIC_ID}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      await audit(page, "overview")
      for (const name of ["Ideas", "Questions", "Quotes", "Subtopics", "Sources"]) {
        await page.getByRole("tablist", { name: "Report sections" }).getByRole("tab", { name: new RegExp(`^${name}`) }).click()
        if (name === "Subtopics") await page.locator("[id='subtopic-s1']").getByRole("button").first().click()
        if (name === "Sources") await page.getByRole("button", { name: /How this was made/ }).click()
        await audit(page, name)
      }
    })

    test("idea panel and its drafts", async ({ page }) => {
      await setup(page, { detail: buildDetail() })
      await page.goto(`/listening/${TOPIC_ID}?tab=ideas`)
      await page.getByRole("list", { name: "Content ideas" }).getByRole("button").first().click()
      const panel = page.getByRole("dialog")
      await panel.waitFor()
      await page.waitForTimeout(400)
      const run = async (label: string) => {
        await page.addScriptTag({ path: AXE })
        const violations = (await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: unknown[] }> } }).axe
          return (await axe.run({ include: [['[role="dialog"]']] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations
        })) as AxeViolation[]
        const lines = violations.flatMap((v) => v.nodes.slice(0, 4).map((n) => `  [${v.impact}] ${v.id}: ${v.help} -> ${n.target.join(" ")}`))
        expect(violations, `${label}\n${lines.join("\n")}`).toEqual([])
      }
      await run("panel")
      for (const [tab, write] of [["Blog outline", "Write a blog outline"], ["LinkedIn post", "Write a LinkedIn post"], ["Headlines", "Write headlines"]] as const) {
        await panel.getByRole("tab", { name: new RegExp(`^${tab}`) }).click()
        await run(`${tab} offer`)
        await panel.getByRole("tabpanel", { name: new RegExp(`^${tab}`) }).getByRole("button", { name: write }).click()
        await panel.getByRole("tabpanel", { name: new RegExp(`^${tab}`) }).getByRole("button", { name: /Write another/ }).waitFor()
        await run(`${tab} written`)
      }
    })

    test("idea board, empty and with ideas", async ({ page }) => {
      const m = await setup(page)
      await page.goto("/listening/ideas")
      await page.getByRole("heading", { level: 1 }).waitFor()
      await audit(page, "empty board")
      await page.goto(`/listening/${TOPIC_ID}?tab=ideas`)
      await page.getByRole("button", { name: "Save", exact: true }).first().click()
      await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible()
      expect(m.ideas.length).toBe(1)
      await page.goto("/listening/ideas")
      await page.getByRole("region", { name: /^New/ }).waitFor()
      await audit(page, "board")
    })

    test("first visit and scan progress", async ({ page }) => {
      await setup(page)
      await page.goto("/listening")
      await page.getByRole("search").waitFor()
      await audit(page, "first visit")
    })
  })
}
