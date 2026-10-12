/**
 * Time ranges. A topic is scanned over a preset relative range (past 24 hours
 * up to past year, or any time) or a fixed custom range (from and to dates).
 * Each source takes the range in its own dialect; this module resolves it once.
 */
import type { RawItem, TimeWindow } from "./types.js"

export const TIME_WINDOWS: TimeWindow[] = ["1d", "1w", "1m", "3m", "1y", "any", "custom"]

/** Days each preset reaches back, and Google's dateRestrict code for it. */
const PRESET: Record<Exclude<TimeWindow, "any" | "custom">, { days: number; restrict: string }> = {
  "1d": { days: 1, restrict: "d1" },
  "1w": { days: 7, restrict: "w1" },
  "1m": { days: 31, restrict: "m1" },
  "3m": { days: 92, restrict: "m3" },
  "1y": { days: 366, restrict: "y1" },
}

export interface DateWindow {
  /** Google dateRestrict for a relative range ("d1", "m3" ...); null for any time or a fixed range. */
  restrict: string | null
  /** Earliest and latest moments in range; null means open on that side. */
  after: Date | null
  before: Date | null
  /** A fixed custom range (both bounds set by the user). */
  fixed: boolean
  /** Whole days the range covers, for sources that take "the last N days"; null for any time. */
  days: number | null
}

const DAY = 86400e3
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** A calendar day as written (YYYY-MM-DD), or null if it is not a real date. */
export function parseDay(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

/**
 * Check a custom range: both days real, in order, not in the future, and not
 * before the web had conversation worth finding. Returns the reason it fails.
 */
export function validateCustomRange(from: unknown, to: unknown, now = new Date()): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const f = parseDay(from)
  const t = parseDay(to)
  if (!f || !t) return { ok: false, error: "Choose both a start date and an end date" }
  if (f > t) return { ok: false, error: "The start date must be on or before the end date" }
  // A day of slack: the user's "today" may already be tomorrow in UTC.
  if (f > new Date(now.getTime() + DAY).toISOString().slice(0, 10)) return { ok: false, error: "The start date cannot be in the future" }
  if (f < "2005-01-01") return { ok: false, error: "Choose a start date in 2005 or later" }
  return { ok: true, from: f, to: t }
}

export function resolveWindow(tw: TimeWindow, from?: string | null, to?: string | null, now = new Date()): DateWindow {
  if (tw === "custom") {
    const f = parseDay(from)
    const t = parseDay(to)
    if (f && t) {
      const after = new Date(`${f}T00:00:00.000Z`)
      const before = new Date(`${t}T23:59:59.999Z`)
      return { restrict: null, after, before, fixed: true, days: Math.max(1, Math.round((before.getTime() - after.getTime()) / DAY)) }
    }
    // A custom topic without usable dates (should not happen: validated on create) searches any time.
    return { restrict: null, after: null, before: null, fixed: false, days: null }
  }
  if (tw === "any") return { restrict: null, after: null, before: null, fixed: false, days: null }
  const p = PRESET[tw]
  return { restrict: p.restrict, after: new Date(now.getTime() - p.days * DAY), before: null, fixed: false, days: p.days }
}

/** YYYYMMDD, the form Google's date sort takes. */
export function compactDay(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

/**
 * Whether an item belongs in the range. Search engines apply relative ranges
 * themselves and their snippet dates are approximate, so a search hit is only
 * checked against a fixed range. A reply always carries its own exact date, so
 * a reply older than the range is left out whatever the range is. Undated
 * items are kept. A day of slack absorbs time zones.
 */
export function inWindow(it: Pick<RawItem, "publishedAt" | "kind">, w: DateWindow): boolean {
  if (!it.publishedAt || (!w.after && !w.before)) return true
  const t = new Date(it.publishedAt).getTime()
  if (Number.isNaN(t)) return true
  if (!w.fixed && it.kind !== "comment") return true
  if (w.after && t < w.after.getTime() - DAY) return false
  if (w.before && t > w.before.getTime() + DAY) return false
  return true
}
