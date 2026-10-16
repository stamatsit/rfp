/**
 * Migration Matrix "Sync now", deterministic: the auth check and every
 * /api/migration call are mocked, the snapshot is the synthetic contract
 * fixture, and the page clock is faked where a test needs to skip the 4s polls
 * or the 5 minute timeout. The live path (GitHub Action -> ingest -> status)
 * is covered by the server tests and checked by hand on production.
 *
 *   cd packages/client && npx playwright test e2e/migration-matrix.sync.spec.ts
 */
import fs from "node:fs"
import { createRequire } from "node:module"
import { expect, test, type Page, type Route } from "@playwright/test"

const FIXTURE = JSON.parse(fs.readFileSync(new URL("../../../tools/migration-matrix/contract/fixture-v1.json", import.meta.url), "utf8"))
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js")

const T0 = new Date("2026-10-16T15:00:00Z")   // a Friday, 10am in Iowa: inside the stale banner's working hours
const REQUESTED_AT = "2026-10-16T15:00:30.000Z"
const DOC = "https://example.sharepoint.com/personal/demo/Documents"
const MATRICES = [
  { name: "content-matrix-alpha.xlsx", web_url: `${DOC}/content-matrix-alpha.xlsx` },
  { name: "content-matrix-beta.xlsx", web_url: `${DOC}/content-matrix-beta.xlsx` },
]
const FAILED = "spreadsheet link 2 of 3 stopped working (HTTP 404); check the file is still shared with 'Anyone with the link'"

type Status = Record<string, unknown>
interface Mock {
  createdAt: string
  secondsOld: number
  matrices: number
  latestCalls: number
  syncPosts: number
  syncReply: { status?: number; body: Record<string, unknown> }
  statuses: Status[]
  statusQueries: string[]
}

function latestBody(m: Mock) {
  return {
    snapshot: {
      id: `snap-${m.createdAt}`, created_at: m.createdAt, contract: FIXTURE.contract, source: "github-action",
      week_label: FIXTURE.week_lbl, facts: FIXTURE.facts, findings: FIXTURE.findings,
      data: { ...FIXTURE.data, source_files: {
        tracker: { name: "migrator-assignment-tracker.xlsx", web_url: `${DOC}/migrator-assignment-tracker.xlsx` },
        matrices: MATRICES.slice(0, m.matrices), folder_url: "",
      } },
    },
    seconds_old: m.secondsOld, last_heartbeat_seconds: m.secondsOld, diff: [], archive: [],
  }
}

async function setup(page: Page, over: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = {
    createdAt: "2026-10-16T13:00:00Z", secondsOld: 2 * 60 * 60, matrices: 2,
    latestCalls: 0, syncPosts: 0,
    syncReply: { body: { triggered: true, requested_at: REQUESTED_AT, note: "sync started" } },
    statuses: [{ state: "pending" }], statusQueries: [],
    ...over,
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  // Anything this page does not need answers 404 (registered first, so the specific routes below win).
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, json: { error: "not mocked" } }))
  await page.route("**/api/auth/status", (r) =>
    r.fulfill({ json: { authenticated: true, mustChangePassword: false, user: { id: "u1", name: "Eric Yerke", email: "eric.yerke@stamats.com", role: "admin", hasCompletedTour: true } } }))
  await page.route("**/api/csrf-token", (r) => r.fulfill({ json: { csrfToken: "test-token" } }))
  await page.route("**/api/conversations**", (r) => r.fulfill({ json: [] }))
  await page.route("**/api/migration/**", async (r: Route) => {
    const url = new URL(r.request().url())
    const path = url.pathname.replace("/api/migration", "")
    const method = r.request().method()
    if (method === "GET" && path === "/latest") { m.latestCalls++; return r.fulfill({ json: latestBody(m) }) }
    if (method === "POST" && path === "/sources/sync") { m.syncPosts++; return r.fulfill({ status: m.syncReply.status ?? 200, json: m.syncReply.body }) }
    if (method === "GET" && path === "/sync-status") {
      m.statusQueries.push(url.searchParams.get("since") || "")
      return r.fulfill({ json: m.statuses.length > 1 ? m.statuses.shift() : m.statuses[0] })
    }
    return r.fulfill({ status: 404, json: { error: "not mocked" } })
  })
  return m
}

const syncButton = (page: Page) => page.getByRole("button", { name: /^(Sync now|Syncing)$/ })
/** The note under the header (the toast stack is a separate role=status div). */
const note = (page: Page) => page.locator("p[role=status]")

/** Open the page; returns how many times it loaded the snapshot (twice in dev: React StrictMode runs effects twice). */
async function open(page: Page, m: Mock): Promise<number> {
  await page.goto("/migration")
  await expect(page.getByRole("heading", { level: 1, name: "Web Page Builds" })).toBeVisible()
  await page.waitForLoadState("networkidle")
  return m.latestCalls
}

test.use({ timezoneId: "America/Chicago" })

test.describe("Migration Matrix: Sync now", () => {
  test("sits in the header beside the tracker link; a matrix link only when there is exactly one", async ({ page }) => {
    const m = await setup(page)
    await open(page, m)
    await expect(syncButton(page)).toHaveText("Sync now")
    await expect(syncButton(page)).toBeEnabled()
    await expect(page.getByRole("link", { name: "Open the tracker" })).toHaveAttribute("href", /migrator-assignment-tracker\.xlsx/)
    // two matrices: the header would have to pick one, so it links none
    await expect(page.getByRole("link", { name: "Open the matrix" })).toHaveCount(0)

    await setup(page, { matrices: 1 })
    await page.reload()
    await expect(page.getByRole("link", { name: "Open the matrix" })).toHaveAttribute("href", /content-matrix-alpha\.xlsx/)
  })

  test("runs, says so, then reloads the numbers when a run that started after the click lands", async ({ page }) => {
    await page.clock.install({ time: T0 })
    const m = await setup(page, { statuses: [{ state: "pending" }, { state: "done", at: "2026-10-16T15:01:05Z", outcome: "stored", snapshot_id: "snap-new" }] })
    const loads = await open(page, m)
    await expect(page.getByText(/The spreadsheets have not been read for 120 minutes/)).toBeVisible()
    await expect(note(page)).toBeEmpty()
    await expect(page.getByText(/updated at 8:00 AM/)).toBeVisible()

    await syncButton(page).click()
    await expect(syncButton(page)).toHaveText("Syncing")
    await expect(syncButton(page)).toBeDisabled()
    await expect(syncButton(page)).toHaveAttribute("aria-busy", "true")
    await expect(note(page)).toContainText("Reading the spreadsheets now")
    expect(m.syncPosts).toBe(1)

    await page.clock.fastForward(4000)
    await expect.poll(() => m.statusQueries.length).toBe(1)
    expect(m.statusQueries[0]).toBe(REQUESTED_AT)   // asks about runs after the server's own click time
    await expect(syncButton(page)).toHaveText("Syncing")

    m.createdAt = "2026-10-16T15:01:05Z"
    m.secondsOld = 5
    await page.clock.fastForward(4000)
    await expect(page.getByText("Synced. The dashboard now matches the spreadsheets.")).toBeVisible()
    await expect.poll(() => m.latestCalls).toBe(loads + 1)   // exactly one reload, even under StrictMode
    await expect(page.getByText(/updated just now/)).toBeVisible()
    await expect(page.getByText(/have not been read for/)).toHaveCount(0)
    await expect(syncButton(page)).toHaveText("Sync now")
    await expect(syncButton(page)).toBeEnabled()
    await expect(note(page)).toBeEmpty()
  })

  test("a sync that found nothing new says so", async ({ page }) => {
    await page.clock.install({ time: T0 })
    const m = await setup(page, { statuses: [{ state: "done", at: "2026-10-16T15:01:00Z", outcome: "deduped", snapshot_id: "snap-old" }] })
    await open(page, m)
    await syncButton(page).click()
    await page.clock.fastForward(4000)
    await expect(page.getByText("Synced. Nothing has changed in the spreadsheets since the last read.")).toBeVisible()
  })

  test("a failed sync says why, keeps the last good numbers, and the note goes once a newer read arrives", async ({ page }) => {
    await page.clock.install({ time: T0 })
    const m = await setup(page, { statuses: [{ state: "failed", at: "2026-10-16T15:00:50Z", reason: FAILED }] })
    const loads = await open(page, m)
    // count failure toasts as they appear (each one lives 4s, so counting what is visible later would miss them)
    await page.evaluate(() => {
      const w = window as unknown as { __failToasts: number }
      w.__failToasts = 0
      new MutationObserver((muts) => {
        for (const mu of muts) for (const n of mu.addedNodes)
          if (n instanceof HTMLElement && n.textContent?.startsWith("The sync did not finish")) w.__failToasts++
      }).observe(document.body, { childList: true, subtree: true })
    })
    await syncButton(page).click()
    await page.clock.fastForward(4000)
    await expect(note(page)).toContainText(`The sync did not finish: ${FAILED}. The numbers below are from the last good read.`)
    await expect(page.getByText(`The sync did not finish: ${FAILED}`, { exact: true })).toBeVisible()   // the toast
    await expect(syncButton(page)).toBeEnabled()
    expect(m.latestCalls).toBe(loads)   // a failure does not reload
    // it keeps listening for a queued run, but the same failure is not announced twice:
    // once two more polls have been served, the first of them has been fully handled
    const asked = m.statusQueries.length
    await page.clock.fastForward(4000)
    await expect.poll(() => m.statusQueries.length).toBe(asked + 1)
    await page.clock.fastForward(4000)
    await expect.poll(() => m.statusQueries.length).toBe(asked + 2)
    expect(await page.evaluate(() => (window as unknown as { __failToasts: number }).__failToasts)).toBe(1)
    await expect(note(page)).toContainText("The sync did not finish")

    // the scheduled sync recovers later; the page's 5 minute refresh picks it up
    m.createdAt = "2026-10-16T15:04:00Z"
    m.secondsOld = 60
    await page.clock.fastForward("05:01")
    await expect.poll(() => m.latestCalls).toBe(loads + 1)
    await expect(note(page)).toBeEmpty()
  })

  test("a failure that a run queued behind it recovers turns into Synced", async ({ page }) => {
    await page.clock.install({ time: T0 })
    const m = await setup(page, { statuses: [{ state: "failed", at: "2026-10-16T15:00:50Z", reason: FAILED }] })
    const loads = await open(page, m)
    await syncButton(page).click()
    await page.clock.fastForward(4000)
    await expect(note(page)).toContainText("The sync did not finish")

    // the next run (queued behind the failed one) gets through: success wins on the server
    m.statuses = [{ state: "done", at: "2026-10-16T15:01:40Z", outcome: "stored", snapshot_id: "snap-new" }]
    m.createdAt = "2026-10-16T15:01:40Z"
    m.secondsOld = 5
    await page.clock.fastForward(4000)
    await expect(page.getByText("Synced. The dashboard now matches the spreadsheets.")).toBeVisible()
    await expect.poll(() => m.latestCalls).toBe(loads + 1)
    await expect(note(page)).toBeEmpty()
    // and then it stops asking
    const asked = m.statusQueries.length
    await page.clock.fastForward(10_000)
    expect(m.statusQueries.length).toBe(asked)
  })

  test("no word back after five minutes ends the wait with advice", async ({ page }) => {
    await page.clock.install({ time: T0 })
    const m = await setup(page)   // pending forever
    await open(page, m)
    await syncButton(page).click()
    await expect(note(page)).toContainText("Reading the spreadsheets now")
    await page.clock.fastForward("05:05")
    await expect(note(page)).toContainText("No word back from the sync after 5 minutes")
    await expect(page.getByText("No word back from the sync after 5 minutes", { exact: true })).toBeVisible()
    await expect(syncButton(page)).toBeEnabled()
    const asked = m.statusQueries.length
    await page.clock.fastForward(10_000)
    expect(m.statusQueries.length).toBe(asked)   // stopped asking
  })

  test("says plainly when the server cannot start a sync", async ({ page }) => {
    const m = await setup(page, { syncReply: { body: { triggered: false, note: "manual trigger not configured; the schedule runs every 10 minutes on weekdays" } } })
    await open(page, m)
    await syncButton(page).click()
    await expect(note(page)).toContainText("Sync now is not set up here: manual trigger not configured; the schedule runs every 10 minutes on weekdays.")
    await expect(syncButton(page)).toBeEnabled()
  })

  test("a server error starting the sync is reported, not swallowed", async ({ page }) => {
    const m = await setup(page, { syncReply: { status: 500, body: { error: "Database unavailable" } } })
    await open(page, m)
    await syncButton(page).click()
    await expect(note(page)).toContainText("The sync did not finish: Database unavailable")
    await expect(syncButton(page)).toBeEnabled()
  })

  test("a server error page that is not JSON still gets a readable message", async ({ page }) => {
    const m = await setup(page)
    await open(page, m)
    await page.route("**/api/migration/sources/sync", (r) => r.fulfill({ status: 502, contentType: "text/html", body: "<html><body>Bad gateway</body></html>" }))
    await syncButton(page).click()
    await expect(note(page)).toContainText("The sync did not finish: Request failed with status 502")
    await expect(syncButton(page)).toBeEnabled()
  })

  test("works from the keyboard, and pressing twice starts one sync", async ({ page }) => {
    const m = await setup(page)
    await open(page, m)
    await syncButton(page).focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    await expect(syncButton(page)).toHaveText("Syncing")
    // let the sync finish: any second request would have arrived long before
    m.statuses = [{ state: "done", at: "2026-10-16T15:01:00Z", outcome: "stored", snapshot_id: "snap-new" }]
    await expect(page.getByText("Synced. The dashboard now matches the spreadsheets.")).toBeVisible({ timeout: 10_000 })
    expect(m.syncPosts).toBe(1)
  })

  test("a reload in the middle of a sync picks it back up", async ({ page }) => {
    const m = await setup(page)
    await open(page, m)
    await syncButton(page).click()
    await expect(note(page)).toContainText("Reading the spreadsheets now")
    await page.reload()
    await expect(page.getByRole("heading", { level: 1, name: "Web Page Builds" })).toBeVisible()
    await expect(syncButton(page)).toHaveText("Syncing")
    await expect(note(page)).toContainText("Reading the spreadsheets now")
    m.statuses = [{ state: "done", at: "2026-10-16T15:01:00Z", outcome: "stored", snapshot_id: "snap-new" }]
    await expect(page.getByText("Synced. The dashboard now matches the spreadsheets.")).toBeVisible({ timeout: 10_000 })
    expect(m.syncPosts).toBe(1)   // resumed the same sync, did not start another
    expect(new Set(m.statusQueries)).toEqual(new Set([REQUESTED_AT]))
  })
})

for (const scheme of ["light", "dark"] as const) {
  test(`sync controls pass axe in ${scheme} (idle, syncing, failed)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
    await page.addInitScript((v) => {
      localStorage.setItem("theme", v)
      localStorage.setItem("stamats-app-settings", JSON.stringify({ theme: v }))
    }, scheme)
    await page.clock.install({ time: T0 })
    const m = await setup(page, { statuses: [{ state: "pending" }, { state: "failed", at: "2026-10-16T15:00:50Z", reason: FAILED }] })
    await open(page, m)
    const audit = async (label: string) => {
      await page.addScriptTag({ path: AXE })
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe
        const r = await axe.run({ include: [["button[aria-busy]"], ["p[role=status]"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
        return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      })
      expect(violations, label).toEqual([])
    }
    await audit("idle")
    await syncButton(page).click()
    await expect(note(page)).toContainText("Reading the spreadsheets now")
    await audit("syncing")
    await page.clock.fastForward(4000)
    await expect.poll(() => m.statusQueries.length).toBe(1)
    await page.clock.fastForward(4000)
    await expect(note(page)).toContainText("The sync did not finish")
    await audit("failed")
  })
}
