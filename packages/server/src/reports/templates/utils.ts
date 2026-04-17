/**
 * Shared rendering utilities. Every string that comes from user-supplied or LLM-supplied
 * data goes through `esc()` before hitting the output HTML to prevent injection.
 */
import type { CategoryTone, GradeLetter, Severity } from "../types.js"

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Escape for use inside HTML text content or single/double-quoted attributes. */
export function esc(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ""
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c)
}

/** Escape for use inside an HTML data-attribute (single quote only matters). */
export function attr(value: string | number | undefined | null): string {
  return esc(value)
}

/** Map a severity to the short badge class. */
export function sevClass(s: Severity): string {
  return { critical: "sev-c", high: "sev-h", medium: "sev-m", low: "sev-l" }[s]
}

/** Capitalize the first letter. */
function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

export function sevLabel(s: Severity): string {
  return cap(s)
}

/** Color/background class snippets used for icon wrappers. */
export function toneBg(tone: CategoryTone): string {
  return {
    critical: "var(--critical-bg);color:var(--critical)",
    high: "var(--high-bg);color:var(--high)",
    medium: "var(--medium-bg);color:var(--medium)",
    low: "var(--low-bg);color:var(--low)",
    accent: "var(--accent-dim);color:var(--accent)",
    purple: "rgba(168,85,247,.08);color:#a78bfa",
  }[tone]
}

/** Raw CSS variable color for a tone. */
export function toneColor(tone: CategoryTone): string {
  return {
    critical: "var(--critical)",
    high: "var(--high)",
    medium: "var(--medium)",
    low: "var(--low)",
    accent: "var(--accent)",
    purple: "#a78bfa",
  }[tone]
}

/** CSS variable gradient for a tone. */
export function toneGrad(tone: CategoryTone): string {
  return {
    critical: "var(--grad-critical)",
    high: "var(--grad-high)",
    medium: "var(--grad-medium)",
    low: "var(--grad-low)",
    accent: "var(--grad-hero)",
    purple: "var(--grad-hero)",
  }[tone]
}

/** Tone used by a numeric score (0-100). Mirrors the rubric in the canonical report. */
export function toneFromScore(score: number): CategoryTone {
  if (score >= 70) return "low" // green
  if (score >= 40) return "high" // yellow
  return "critical" // red
}

/** Letter grade from a numeric score (0-100). */
export function gradeFromScore(score: number): GradeLetter {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

/** Background/color pair for a letter grade tile. */
export function gradeBadgeStyle(g: GradeLetter): string {
  if (g === "A" || g === "B") return "background:var(--low-bg);color:var(--low)"
  if (g === "C") return "background:var(--medium-bg);color:var(--medium)"
  if (g === "D") return "background:var(--high-bg);color:var(--high)"
  return "background:var(--critical-bg);color:var(--critical)"
}

/** SVG ring-fill value: circumference * fraction (circle r=120, circumference=754). */
export function ringFill(score: number): number {
  const circumference = 754
  return Math.round((Math.max(0, Math.min(100, score)) / 100) * circumference)
}

/** Donut segment dash-length: circumference r=90 = 565. Given fraction 0..1. */
export function donutSeg(fraction: number): number {
  return Math.round(fraction * 565)
}

/** Bar chart heights are normalized so the max count is 100%, the rest scale proportionally. */
export function barHeights(counts: Record<string, number>): Record<string, number> {
  const max = Math.max(1, ...Object.values(counts))
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(counts)) out[k] = Math.round((v / max) * 100)
  return out
}

/** Percentages for the donut. Returns array in same order as input. */
export function donutFractions(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0) || 1
  return counts.map((c) => c / total)
}

/** Compose multiple HTML strings, stripping empty ones. */
export function join(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join("")
}

/** Inline-safe stringification for JSON embedded in a <script> tag.
 * Escapes the `</` sequence so the JSON can't prematurely close the tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}
