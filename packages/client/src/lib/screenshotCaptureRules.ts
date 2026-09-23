/**
 * Rules for the Image Toolkit "Capture from URL" tool. Pure functions, no React.
 *
 * - MAX_PAGES_PER_RUN is a hard cap on unique pages per run (not captures, so
 *   50 pages at "both" viewports is 100 captures).
 * - normalizeUrlKey is the identity used to decide two URLs are the same page.
 *   The server uses the same rules (packages/server/src/lib/screenshotLibrary.ts)
 *   when it records a capture, so keep the two in step.
 */

export const MAX_PAGES_PER_RUN = 50

export type Viewport = "desktop" | "mobile"
export type ViewportChoice = Viewport | "both"

/** Lowercase scheme and host, drop www., the hash and a trailing slash; keep path case and query. */
export function normalizeUrlKey(input: string): string {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return ""
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return ""
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  const port = u.port ? `:${u.port}` : ""
  let path = u.pathname
  if (path.length > 1) path = path.replace(/\/+$/, "")
  if (path === "/") path = ""
  return `${u.protocol}//${host}${port}${path}${u.search}`
}

/** Hostname without www, lowercase. Empty string for an invalid URL. */
export function domainOf(input: string): string {
  try {
    return new URL(input.trim()).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Dedupe by page key, keeping the first spelling seen. Invalid URLs are dropped. */
export function uniquePages(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    const key = normalizeUrlKey(u)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
}

export type RunPlan =
  | { ok: true; pages: string[]; captures: number; max: number }
  | { ok: false; reason: "empty" | "over-cap"; pages: string[]; captures: number; max: number }

/** Decide whether a set of URLs may run as one batch. */
export function planRun(urls: string[], choice: ViewportChoice): RunPlan {
  const pages = uniquePages(urls)
  const perPage = choice === "both" ? 2 : 1
  const captures = pages.length * perPage
  const max = MAX_PAGES_PER_RUN
  if (pages.length === 0) return { ok: false, reason: "empty", pages, captures, max }
  if (pages.length > max) return { ok: false, reason: "over-cap", pages, captures, max }
  return { ok: true, pages, captures, max }
}

export interface CaptureHistoryEntry {
  id: string
  url: string
  viewport: Viewport
  capturedAt: string
  capturedByName: string | null
}

/** Page key -> most recent capture per viewport. */
export type HistoryIndex = Map<string, Partial<Record<Viewport, CaptureHistoryEntry>>>

export function indexHistory(entries: CaptureHistoryEntry[]): HistoryIndex {
  const index: HistoryIndex = new Map()
  for (const e of entries) {
    const key = normalizeUrlKey(e.url)
    if (!key) continue
    const rec = index.get(key) ?? {}
    const prev = rec[e.viewport]
    if (!prev || Date.parse(e.capturedAt) > Date.parse(prev.capturedAt)) {
      rec[e.viewport] = e
      index.set(key, rec)
    }
  }
  return index
}

/** For "both", a page only counts as captured when both viewports exist. */
export function isCaptured(index: HistoryIndex, url: string, choice: ViewportChoice): boolean {
  const rec = index.get(normalizeUrlKey(url))
  if (!rec) return false
  if (choice === "both") return !!rec.desktop && !!rec.mobile
  return !!rec[choice]
}

export function filterUncaptured(urls: string[], index: HistoryIndex, choice: ViewportChoice): string[] {
  return urls.filter((u) => !isCaptured(index, u, choice))
}
