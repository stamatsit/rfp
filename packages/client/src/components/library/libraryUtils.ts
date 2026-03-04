import React from "react"

// ─── Topic Colors ───
const topicColors: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
}

const colorPalette = [
  { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
]

export function getTopicColor(topicId: string, index: number): { bg: string; text: string; border: string } {
  const cached = topicColors[topicId]
  if (cached) return cached
  const idx = Math.abs(index) % colorPalette.length
  return colorPalette[idx] ?? topicColors.default!
}

export const dotColorMap: Record<string, string> = {
  "bg-blue-50": "bg-blue-400", "bg-purple-50": "bg-purple-400",
  "bg-teal-50": "bg-teal-400", "bg-orange-50": "bg-orange-400",
  "bg-amber-50": "bg-amber-400", "bg-emerald-50": "bg-emerald-400",
  "bg-slate-100": "bg-slate-400",
}

// ─── Highlight ───
let _hlCache: { query: string; regex: RegExp } | null = null
function getHighlightRegex(query: string): RegExp | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  if (_hlCache && _hlCache.query === trimmed) return _hlCache.regex
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`(${escaped})`, "gi")
  _hlCache = { query: trimmed, regex }
  return regex
}

export function highlightText(text: string, query: string): React.ReactNode {
  const regex = getHighlightRegex(query)
  if (!regex) return text
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase()
      ? React.createElement("mark", { key: i, className: "bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5" }, part)
      : part
  )
}

// ─── Search helper ───
export function matchesSearch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const terms = query.toLowerCase().split(/\s+/)
  const lower = text.toLowerCase()
  return terms.every((term) => lower.includes(term))
}

// ─── Format helper ───
export function formatSuccessItem(cs: { client: string; focus: string; challenge: string; solution: string; metrics: { label: string; value: string }[]; testimonial?: { quote: string; attribution: string } }) {
  let text = `## ${cs.client} — ${cs.focus}\n\n`
  text += `**Challenge:** ${cs.challenge}\n\n`
  text += `**Solution:** ${cs.solution}\n\n`
  text += `**Results:**\n`
  for (const m of cs.metrics) {
    text += `- ${m.label}: ${m.value}\n`
  }
  if (cs.testimonial) {
    text += `\n**Testimonial:**\n"${cs.testimonial.quote}"\n— ${cs.testimonial.attribution}\n`
  }
  return text
}

// ─── Types ───
export type SortOption = "relevance" | "most-used" | "newest" | "oldest" | "alphabetical"
export type LibrarySection = "qa" | "client-success" | "proposals"
export type ClientSuccessTab = "success" | "results" | "testimonials" | "awards"
export type SuccessSort = "most-used" | "client-az" | "client-za" | "metrics-most" | "metrics-least" | "category"
export type ResultsSort = "most-used" | "value-high" | "value-low" | "client-az" | "client-za" | "metric-az"
export type TestimonialsSort = "most-used" | "org-az" | "org-za" | "name-az" | "shortest" | "longest"
export type AwardsSort = "most-used" | "newest" | "oldest" | "client-az" | "name-az"
