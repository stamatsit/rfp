/**
 * Deterministic mapper: ScanReport → partial ReportData (the structural skeleton).
 * Produces the data-driven pieces that don't need LLM judgment — scores, issue counts,
 * category cards, priorities, severity chart values. The narrative pipeline (narrative.ts)
 * then fills in the prose blocks (hero titles, executive cards, opportunity descriptions).
 */
import type { CategoryScore as ScanCategoryScore, ScanIssue, ScanReport, Severity as ScanSeverity } from "../types/scanner.js"
import type {
  CategoryDetail,
  CategoryId,
  CategoryScore,
  CategoryTone,
  ClientInfo,
  ConsultingFirm,
  IconName,
  PriorityItem,
  ReportData,
  ReportIssue,
  Severity,
  SeverityCounts,
} from "./types.js"
import { gradeFromScore } from "./templates/utils.js"

/** Map scanner severity → report severity. Scanner has 3 levels; the template uses 4.
 *  "error" → critical, "warning" → high, "info" → medium. Low is reserved for LLM narrative.
 */
export function mapSeverity(s: ScanSeverity): Severity {
  return s === "error" ? "critical" : s === "warning" ? "high" : "medium"
}

/** Category card definitions. One per visible score card on the report. */
interface CategoryDef {
  id: CategoryId
  name: string
  tagline: string
  icon: IconName
  tone: CategoryTone
  /** Scanner categories (from ScanReport.categoryScores) that feed into this display category. */
  sources: string[]
}

const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "a11y", name: "Accessibility", tagline: "WCAG 2.2 AA", icon: "eye", tone: "critical", sources: ["images", "forms", "landmarks", "contrast"] },
  { id: "seo", name: "SEO & Markup", tagline: "Search visibility", icon: "search", tone: "high", sources: ["document", "schema"] },
  { id: "content", name: "Content", tagline: "Information depth", icon: "file", tone: "accent", sources: [] },
  { id: "ux", name: "UX & Interface", tagline: "Usability", icon: "layout", tone: "purple", sources: ["structure"] },
  { id: "modern", name: "Modern Features", tagline: "Innovation", icon: "sparkle", tone: "medium", sources: [] },
  { id: "trust", name: "Trust Signals", tagline: "Social proof", icon: "trophy", tone: "low", sources: [] },
  { id: "privacy", name: "Privacy & Legal", tagline: "Compliance", icon: "shield", tone: "critical", sources: [] },
  { id: "performance", name: "Performance", tagline: "Speed & tech debt", icon: "zap", tone: "high", sources: ["performance"] },
  { id: "competitive", name: "Competitive", tagline: "Peer comparison", icon: "stethoscope", tone: "critical", sources: [] },
  { id: "naming", name: "Naming", tagline: "Consistency", icon: "edit", tone: "high", sources: [] },
]

function scoreByCategory(scan: ScanReport): Record<string, ScanCategoryScore> {
  const out: Record<string, ScanCategoryScore> = {}
  for (const c of scan.categoryScores) out[c.category] = c
  return out
}

/** Aggregate scanner issues from several source categories into a single display category. */
function aggregateCategoryIssues(scan: ScanReport, sources: string[]): ScanIssue[] {
  if (sources.length === 0) return []
  return scan.issues.filter((i) => sources.includes(i.category))
}

/** Weighted average score from aggregated scanner categories. If no sources present, returns 0. */
function aggregateScore(scan: ScanReport, sources: string[]): number {
  const byCat = scoreByCategory(scan)
  const present = sources.map((s) => byCat[s]).filter(Boolean)
  if (present.length === 0) return 0
  const total = present.reduce((sum, c) => sum + (c?.score ?? 0), 0)
  return Math.round(total / present.length)
}

export function buildCategoryScores(scan: ScanReport, overrides: Partial<Record<CategoryId, { score: number; issueCount: number }>> = {}): CategoryScore[] {
  return DEFAULT_CATEGORIES.map((def) => {
    const ovr = overrides[def.id]
    const scanIssues = aggregateCategoryIssues(scan, def.sources)
    const score = ovr?.score ?? (def.sources.length > 0 ? aggregateScore(scan, def.sources) : 0)
    const issueCount = ovr?.issueCount ?? scanIssues.length
    return {
      id: def.id,
      name: def.name,
      score,
      issueCount,
      icon: def.icon,
      tone: def.tone,
      tagline: def.tagline,
    }
  })
}

export function buildCategoryDetails(scan: ScanReport, overrides: Partial<Record<CategoryId, { score: number; issues: ReportIssue[]; subtitle?: string }>> = {}): CategoryDetail[] {
  return DEFAULT_CATEGORIES.map((def) => {
    const ovr = overrides[def.id]
    const scanIssues = aggregateCategoryIssues(scan, def.sources)
    const issues: ReportIssue[] =
      ovr?.issues ??
      scanIssues.map((si) => ({
        severity: mapSeverity(si.severity),
        title: si.ruleId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: si.message,
      }))
    return {
      id: def.id,
      name: def.name,
      subtitle: ovr?.subtitle ?? `${issues.length} findings`,
      icon: def.icon,
      tone: def.tone,
      score: ovr?.score ?? (def.sources.length > 0 ? aggregateScore(scan, def.sources) : 0),
      issueCount: issues.length,
      issues,
    }
  }).filter((c) => c.issues.length > 0 || c.score > 0) // hide empty display-only categories
}

export function severityCounts(issues: ReportIssue[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of issues) counts[i.severity]++
  return counts
}

/** Aggregate report-level severity counts from all category details. */
export function aggregateSeverity(categories: CategoryDetail[]): SeverityCounts {
  const total: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const c of categories) {
    const s = severityCounts(c.issues)
    total.critical += s.critical
    total.high += s.high
    total.medium += s.medium
    total.low += s.low
  }
  return total
}

/** Rank all issues by impact: WCAG Level A first, then Level AA, then by severity, then by instance count. */
export function rankedPriorities(scan: ScanReport, categories: CategoryDetail[], limit = 20): PriorityItem[] {
  type Tally = { title: string; severity: Severity; weight: number }
  const tallies = new Map<string, Tally>()

  for (const cat of categories) {
    for (const iss of cat.issues) {
      const key = iss.title.toLowerCase()
      const sevWeight = iss.severity === "critical" ? 100 : iss.severity === "high" ? 50 : iss.severity === "medium" ? 20 : 5
      const existing = tallies.get(key)
      if (existing) {
        existing.weight += sevWeight
      } else {
        tallies.set(key, { title: iss.title, severity: iss.severity, weight: sevWeight })
      }
    }
  }

  // Bonus weight for scanner issues with WCAG A level
  for (const si of scan.issues) {
    if (si.wcagLevel === "A") {
      const key = si.message.toLowerCase()
      const ex = tallies.get(key)
      if (ex) ex.weight += 25
    }
  }

  const ranked = Array.from(tallies.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)

  return ranked.map((t, i) => ({ rank: i + 1, name: t.title, severity: t.severity }))
}

/** Derive overall score as weighted average of category scores (mirrors template rubric). */
export function overallScore(categories: CategoryScore[]): number {
  const weights: Record<CategoryId, number> = {
    a11y: 0.20,
    seo: 0.15,
    content: 0.15,
    ux: 0.12,
    modern: 0.05,
    trust: 0.08,
    privacy: 0.10,
    performance: 0.08,
    competitive: 0.04,
    naming: 0.03,
    schema: 0.00,
  }
  let weighted = 0
  let totalWeight = 0
  for (const c of categories) {
    const w = weights[c.id as CategoryId] ?? 0
    weighted += c.score * w
    totalWeight += w
  }
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0
}

/** Build the minimum ReportData skeleton from a ScanReport + client/firm info.
 *  The LLM narrative step fills in prose (hero titles, executive summary cards, opportunities).
 *  Callers merge the narrative result on top of this skeleton before rendering.
 */
export function buildReportSkeleton(
  scan: ScanReport,
  client: ClientInfo,
  firm: ConsultingFirm,
  opts: {
    datePublished: string // ISO
    dateDisplay: string // human-readable
    title: string
    description: string
    screenshots?: { desktop: string; mobile?: string }
  },
): Omit<ReportData, "assistant" | "executiveSummary" | "opportunities" | "hero" | "healthScore" | "severity" | "competitive" | "priorities" | "schemaDeepDive" | "catalog" | "screenshots"> & {
  // Partial skeleton — caller supplies remaining sections.
  __skeleton: true
} {
  const categories = buildCategoryScores(scan)
  const details = buildCategoryDetails(scan)

  return {
    __skeleton: true,
    client,
    firm,
    meta: {
      title: opts.title,
      description: opts.description,
      datePublished: opts.datePublished,
      dateDisplay: opts.dateDisplay,
    },
    nav: [
      { href: "#health-score", label: "Score" },
      { href: "#exec", label: "Summary" },
      { href: "#severity", label: "Severity" },
      { href: "#cat-scores", label: "Categories" },
      { href: "#opportunities", label: "Opportunities" },
      { href: "#competitive", label: "Competitive" },
      { href: "#priorities", label: "Priorities" },
    ],
    categoryScores: {
      heading: "Performance by category",
      subtitle: "Each scored on a 100-point scale. Red means failing. Yellow means far below standard.",
      categories,
    },
    categoryDetails: {
      categories: details,
    },
  }
}

export { gradeFromScore }
