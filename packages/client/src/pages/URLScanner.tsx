import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Globe,
  ArrowLeft,
  Download,
  RefreshCw,
  Check,
  Loader2,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Trash2,
  Sparkles,
  X,
  Printer,
  FileText,
  Shield,
  Eye,
  Layout,
  Menu,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { addCsrfHeader } from "@/lib/csrfToken"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "error" | "warning" | "info"

type Category =
  | "headings"
  | "images"
  | "landmarks"
  | "forms"
  | "performance"
  | "contrast"
  | "security"
  | "structure"

interface ScanOptions {
  wcagAudit: boolean
  headings: boolean
  wcagLevel: "A" | "AA" | "AAA"
}

interface ScanIssue {
  ruleId: string
  category: Category
  severity: Severity
  message: string
  element?: string
  selector?: string
  line?: number
  suggestion?: string
  wcagCriteria?: string
  wcagLevel?: "A" | "AA" | "AAA"
  howToFix?: string[]
  learnMore?: { label: string; url: string }[]
}

interface HeadingNode {
  level: number
  text: string
  line?: number
  children?: HeadingNode[]
  issues: string[]
}

interface SiteStructureLink {
  href: string
  text: string
  count: number
}

interface SiteStructureNav {
  href: string
  text: string
}

interface PageHierarchy {
  hasHeader?: boolean
  hasNav?: boolean
  hasMain?: boolean
  hasFooter?: boolean
  hasAside?: boolean
  hasBreadcrumb?: boolean
  navLinkCount?: number
  sections?: { tag: string; id?: string; ariaLabel?: string }[]
}

interface SiteStructure {
  internalLinks: SiteStructureLink[]
  externalLinks: SiteStructureLink[]
  navigation: SiteStructureNav[]
  pageHierarchy: PageHierarchy
}

interface CategoryScore {
  category: string
  score: number
  errors: number
  warnings: number
  infos: number
}

interface ScanReport {
  url: string
  scannedAt: string
  fetchTimeMs: number
  htmlSize: number
  domElements: number
  overallScore: number
  categoryScores: CategoryScore[]
  issues: ScanIssue[]
  headingTree: HeadingNode[]
  meta: {
    title?: string
    description?: string
    lang?: string
    charset?: string
    viewport?: string
    ogTags: Record<string, string>
    canonical?: string
  }
  summary?: {
    topPriorities: string[]
    whatsWorking: string[]
  }
  siteStructure?: SiteStructure
}

interface ScanStep {
  id: string
  label: string
  status: "pending" | "active" | "done" | "error"
}

interface RecentScan {
  url: string
  score: number
  errors: number
  scannedAt: string
}

type View = "home" | "scanning" | "results" | "detail"
type ResultTab = "issues" | "headings" | "structure" | "history"
type FilterSeverity = "all" | "error" | "warning" | "info"

const RECENT_SCANS_KEY = "scanner-recent-scans"
const MAX_RECENT_SCANS = 10

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadRecentScans(): RecentScan[] {
  try {
    const raw = localStorage.getItem(RECENT_SCANS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentScan(scan: RecentScan) {
  const scans = loadRecentScans().filter((s) => s.url !== scan.url)
  scans.unshift(scan)
  localStorage.setItem(
    RECENT_SCANS_KEY,
    JSON.stringify(scans.slice(0, MAX_RECENT_SCANS)),
  )
}

function removeRecentScan(url: string) {
  const scans = loadRecentScans().filter((s) => s.url !== url)
  localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(scans))
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function scoreColor(score: number): string {
  if (score >= 90) return "hsl(152 69% 41%)"
  if (score >= 70) return "hsl(38 92% 50%)"
  return "hsl(0 84% 60%)"
}

function scoreTextClass(score: number): string {
  if (score >= 90) return "text-emerald-500"
  if (score >= 70) return "text-amber-500"
  return "text-red-500"
}

function severityDotClass(severity: Severity): string {
  if (severity === "error") return "bg-red-500"
  if (severity === "warning") return "bg-amber-500"
  return "bg-blue-400"
}

function severityBadgeClass(severity: Severity): string {
  if (severity === "error")
    return "bg-red-500/10 text-red-500 dark:bg-red-500/10 dark:text-red-400"
  if (severity === "warning")
    return "bg-amber-500/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
  return "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400"
}

function severityLabel(severity: Severity): string {
  return severity.toUpperCase()
}

function headingBadgeClass(level: number): string {
  const map: Record<number, string> = {
    1: "bg-blue-600/15 text-blue-500 dark:bg-blue-500/15 dark:text-blue-400",
    2: "bg-blue-500/15 text-blue-400 dark:bg-blue-400/15 dark:text-blue-300",
    3: "bg-cyan-500/15 text-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-400",
    4: "bg-teal-500/15 text-teal-500 dark:bg-teal-500/15 dark:text-teal-400",
    5: "bg-violet-500/15 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400",
    6: "bg-pink-500/15 text-pink-500 dark:bg-pink-500/15 dark:text-pink-400",
  }
  return map[level] ?? map[1]!
}

function categoryDisplayName(cat: string): string {
  const map: Record<string, string> = {
    headings: "Structure",
    images: "Accessibility",
    landmarks: "Accessibility",
    forms: "Accessibility",
    performance: "Performance",
    contrast: "Accessibility",
    accessibility: "Accessibility",
    structure: "Structure",
    security: "Security",
  }
  return map[cat] || cat
}

function normalizeUrl(input: string): string {
  let url = input.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    url = "https://" + url
  }
  return url
}

// Category grouping config for issue list
const CATEGORY_GROUPS: {
  id: string
  label: string
  icon: typeof Eye
  categories: string[]
  color: string
}[] = [
  { id: "accessibility", label: "Accessibility", icon: Eye, categories: ["images", "contrast", "forms", "landmarks"], color: "text-purple-500" },
  { id: "structure", label: "Structure", icon: Layout, categories: ["headings", "structure"], color: "text-blue-500" },
  { id: "security", label: "Security", icon: Shield, categories: ["security"], color: "text-amber-500" },
  { id: "other", label: "Other", icon: FileText, categories: ["performance"], color: "text-slate-500" },
]

function groupIssuesByCategory(issues: ScanIssue[]): { group: typeof CATEGORY_GROUPS[0]; issues: ScanIssue[] }[] {
  const result: { group: typeof CATEGORY_GROUPS[0]; issues: ScanIssue[] }[] = []
  for (const group of CATEGORY_GROUPS) {
    const matching = issues.filter((i) => group.categories.includes(i.category))
    if (matching.length > 0) {
      result.push({ group, issues: matching })
    }
  }
  // Catch any issues not in a group
  const allGrouped = new Set(CATEGORY_GROUPS.flatMap((g) => g.categories))
  const ungrouped = issues.filter((i) => !allGrouped.has(i.category))
  if (ungrouped.length > 0) {
    result.push({ group: CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1]!, issues: ungrouped })
  }
  return result
}


// ---------------------------------------------------------------------------
// ScoreRing Component
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = size / 2 - 8
  const circumference = 2 * Math.PI * r
  const [animatedScore, setAnimatedScore] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Animate from 0 to score on mount
    requestAnimationFrame(() => setMounted(true))
    const duration = 1000
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(score * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [score])

  const offset = mounted
    ? circumference - (score / 100) * circumference
    : circumference // start fully hidden
  const color = scoreColor(score)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        width={size}
        height={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth={7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.25,0.46,0.45,0.94)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
          {animatedScore}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CategoryCard Component
// ---------------------------------------------------------------------------

function CategoryCard({
  label,
  score,
  active,
  onClick,
}: {
  label: string
  score: number
  active?: boolean
  onClick?: () => void
}) {
  const color = scoreColor(score)
  return (
    <button
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 border rounded-2xl p-3 text-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 ${
        active
          ? "border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/20"
          : "border-black/[0.06] dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      <div className={`text-lg font-bold mb-1 ${scoreTextClass(score)}`}>
        {score}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
        {label}
      </div>
      <div className="h-[5px] rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Heading Tree (flat rendering with indentation)
// ---------------------------------------------------------------------------

function HeadingTreeView({ tree }: { tree: HeadingNode[] }) {
  // Server sends a flat array: [{ level, text, issues }]. Compute depth from heading levels.
  const flat: {
    node: HeadingNode
    depth: number
  }[] = []

  // If nodes have children, flatten recursively; otherwise treat as flat list with level-based depth
  const hasChildren = tree.some((n) => n.children && n.children.length > 0)

  if (hasChildren) {
    function flattenTree(nodes: HeadingNode[], depth: number) {
      for (const node of nodes) {
        flat.push({ node, depth })
        if (node.children && node.children.length > 0) {
          flattenTree(node.children, depth + 1)
        }
      }
    }
    flattenTree(tree, 0)
  } else {
    // Flat array from server — use heading level for indentation
    for (const node of tree) {
      flat.push({ node, depth: node.level - 1 })
    }
  }

  // Count totals
  let totalHeadings = tree.length
  let totalErrors = 0
  let totalWarnings = 0
  for (const n of tree) {
    for (const issue of n.issues) {
      const lower = issue.toLowerCase()
      if (lower.includes("empty") || lower.includes("hierarchy")) {
        totalWarnings++
      } else if (lower.includes("missing") || lower.includes("skip")) {
        totalErrors++
      }
    }
  }

  // Determine error/warning status from issues array text
  function getRowStatus(
    issues: string[],
  ): null | { type: "error" | "warning"; label: string } {
    if (issues.length === 0) return null
    // Simple heuristic: look for keywords
    for (const iss of issues) {
      const lower = iss.toLowerCase()
      if (
        lower.includes("skip") ||
        lower.includes("missing") ||
        lower.includes("duplicate")
      ) {
        return { type: "error", label: iss }
      }
    }
    return { type: "warning", label: issues[0]! }
  }

  return (
    <div>
      {/* Summary */}
      <div className="flex items-center gap-4 mb-6 text-sm text-slate-500 dark:text-slate-400">
        <span>{totalHeadings} headings found</span>
        {totalErrors > 0 && (
          <span className="text-red-500">
            {totalErrors} error{totalErrors !== 1 ? "s" : ""}
          </span>
        )}
        {totalWarnings > 0 && (
          <span className="text-amber-500">
            {totalWarnings} warning{totalWarnings !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tree card */}
      <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-6">
        {flat.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            No headings found on this page.
          </p>
        )}
        {flat.map((item, idx) => {
          const { node, depth } = item
          const status = getRowStatus(node.issues)
          const isError = status?.type === "error"
          const isWarning = status?.type === "warning"
          const indentPx = depth * 28

          return (
            <div
              key={idx}
              className={`flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${
                isError
                  ? "bg-red-500/5 border border-red-500/20 dark:bg-red-500/5 dark:border-red-500/20"
                  : isWarning
                    ? "bg-amber-500/5 border border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/20"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
              style={{
                marginLeft: indentPx,
                borderLeftWidth: depth > 0 ? 2 : 0,
                borderLeftColor:
                  depth > 0
                    ? isError
                      ? "rgb(239 68 68 / 0.3)"
                      : isWarning
                        ? "rgb(245 158 11 / 0.3)"
                        : "rgb(148 163 184 / 0.15)"
                    : undefined,
                marginTop: idx > 0 ? 4 : 0,
              }}
            >
              <span
                className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-md ${
                  isError
                    ? "bg-red-500/15 text-red-500 dark:bg-red-500/15 dark:text-red-400"
                    : isWarning
                      ? "bg-amber-500/15 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400"
                      : headingBadgeClass(node.level)
                }`}
              >
                H{node.level}
              </span>
              <span
                className={`text-sm flex-1 ${
                  node.text
                    ? "text-slate-800 dark:text-slate-200"
                    : "italic text-slate-400 dark:text-slate-500"
                }`}
              >
                {node.text || "(empty)"}
              </span>
              {status && (
                <span
                  className={`text-xs ml-2 ${
                    isError
                      ? "text-red-500 dark:text-red-400"
                      : "text-amber-500 dark:text-amber-400"
                  }`}
                >
                  {status.label}
                </span>
              )}
              {node.line != null && (
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto tabular-nums">
                  :{node.line}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function URLScanner() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // View management
  const [view, setView] = useState<View>("home")
  const [resultTab, setResultTab] = useState<ResultTab>("issues")
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>("all")

  // Input
  const [urlInput, setUrlInput] = useState("")
  const [options, setOptions] = useState<ScanOptions>({
    wcagAudit: true,
    headings: true,
    wcagLevel: "AA",
  })

  // Scan state
  const [scanSteps, setScanSteps] = useState<ScanStep[]>([])
  const [report, setReport] = useState<ScanReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<ScanIssue | null>(null)

  // Recent scans
  const [recentScans, setRecentScans] = useState<RecentScan[]>(loadRecentScans)

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Copy feedback
  const [copied, setCopied] = useState(false)

  // Abort controller for cancelling scans
  const abortRef = useRef<AbortController | null>(null)

  // AI Feature: Issue Doctor (fix cache)
  const [aiFixCache, setAiFixCache] = useState<Map<string, {
    explanation: string; beforeCode: string; afterCode: string; watchFor: string
  }>>(new Map())
  const [aiFixLoading, setAiFixLoading] = useState<Set<string>>(new Set())
  const [aiFixExpanded, setAiFixExpanded] = useState<Set<string>>(new Set())

  // AI Feature: Alt Text Generator
  const [altTextCache, setAltTextCache] = useState<Map<string, { altText: string; isDecorative: boolean }>>(new Map())
  const [altTextLoading, setAltTextLoading] = useState<Set<string>>(new Set())
  const [altTextExpanded, setAltTextExpanded] = useState<Set<string>>(new Set())

  // Issue grouping: collapsed groups and active category filter
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(CATEGORY_GROUPS.map((g) => g.id)))
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null)

  // Close export menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handler)
      return () => document.removeEventListener("mousedown", handler)
    }
  }, [showExportMenu])

  // ----- SSE Scan -----
  const scanUrl = useCallback(
    async (url: string) => {
      const normalized = normalizeUrl(url)
      if (!normalized) return

      setError(null)
      setReport(null)
      setSelectedIssue(null)
      setView("scanning")
      setResultTab("issues")
      setFilterSeverity("all")
      setAiFixCache(new Map())
      setAiFixLoading(new Set())
      setAiFixExpanded(new Set())
      setAltTextCache(new Map())
      setAltTextLoading(new Set())
      setAltTextExpanded(new Set())

      const steps: ScanStep[] = [
        { id: "fetch", label: "Fetching page...", status: "active" },
        { id: "structure", label: "Analyzing structure...", status: "pending" },
        {
          id: "accessibility",
          label: "Checking accessibility...",
          status: "pending",
        },
        { id: "scoring", label: "Building report...", status: "pending" },
      ]
      setScanSteps(steps)

      // Abort previous scan if still running
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const headers = await addCsrfHeader({
          "Content-Type": "application/json",
        })
        const response = await fetch("/api/scanner/scan", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ url: normalized, options }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          let msg = "Scan failed"
          try {
            const j = JSON.parse(text)
            msg = j.error || j.message || msg
          } catch {
            if (text) msg = text
          }
          setError(msg)
          setView("home")
          return
        }

        // If the response is SSE (text/event-stream), parse the stream.
        // Otherwise, treat as a normal JSON response (fallback).
        const contentType = response.headers.get("content-type") || ""

        if (contentType.includes("text/event-stream")) {
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const parts = buffer.split("\n\n")
            buffer = parts.pop() || ""

            for (const part of parts) {
              const lines = part.split("\n")
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                try {
                  const data = JSON.parse(line.slice(6))

                  if (data.step === "complete") {
                    const rpt = data.report as ScanReport
                    setReport(rpt)
                    setView("results")
                    // Save to recent scans
                    const errorCount = rpt.issues.filter(
                      (i) => i.severity === "error",
                    ).length
                    const entry: RecentScan = {
                      url: rpt.url,
                      score: rpt.overallScore,
                      errors: errorCount,
                      scannedAt: rpt.scannedAt,
                    }
                    saveRecentScan(entry)
                    setRecentScans(loadRecentScans())
                  } else if (data.step === "error") {
                    setError(data.message || "Scan failed")
                    setView("home")
                  } else {
                    setScanSteps((prev) =>
                      prev.map((s) =>
                        s.id === data.step
                          ? { ...s, status: data.status || "done" }
                          : s,
                      ),
                    )
                  }
                } catch {
                  // Ignore parse errors for individual lines
                }
              }
            }
          }
        } else {
          // Normal JSON response fallback
          const rpt = (await response.json()) as ScanReport
          setReport(rpt)
          setView("results")
          const errorCount = rpt.issues.filter(
            (i) => i.severity === "error",
          ).length
          const entry: RecentScan = {
            url: rpt.url,
            score: rpt.overallScore,
            errors: errorCount,
            scannedAt: rpt.scannedAt,
          }
          saveRecentScan(entry)
          setRecentScans(loadRecentScans())
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred",
        )
        setView("home")
      }
    },
    [options],
  )

  // ----- Auto-run from ?url= query param (portal hand-off) -----
  const autoRunRef = useRef(false)
  useEffect(() => {
    if (autoRunRef.current) return
    const paramUrl = searchParams.get("url")
    if (paramUrl) {
      autoRunRef.current = true
      setUrlInput(paramUrl)
      scanUrl(paramUrl)
    }
  }, [searchParams, scanUrl])

  // ----- Export helpers -----
  const exportJSON = useCallback(() => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `scan-${report.url.replace(/https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }, [report])

  const copySummary = useCallback(async () => {
    if (!report) return
    const lines: string[] = [
      `URL Scanner Report: ${report.url}`,
      `Scanned: ${new Date(report.scannedAt).toLocaleString()}`,
      `Overall Score: ${report.overallScore}/100`,
      "",
    ]
    for (const cs of report.categoryScores) {
      lines.push(
        `${categoryDisplayName(cs.category)}: ${cs.score}/100 (${cs.errors} errors, ${cs.warnings} warnings)`,
      )
    }
    if (report.summary?.topPriorities?.length) {
      lines.push("", "Top Priorities:")
      for (const p of report.summary.topPriorities) {
        lines.push(`  - ${p}`)
      }
    }
    if (report.summary?.whatsWorking?.length) {
      lines.push("", "What's Working:")
      for (const w of report.summary.whatsWorking) {
        lines.push(`  - ${w}`)
      }
    }
    lines.push(
      "",
      `Total Issues: ${report.issues.length} (${report.issues.filter((i) => i.severity === "error").length} errors, ${report.issues.filter((i) => i.severity === "warning").length} warnings, ${report.issues.filter((i) => i.severity === "info").length} info)`,
    )
    await navigator.clipboard.writeText(lines.join("\n"))
    setCopied(true)
    setShowExportMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [report])

  const exportPDF = useCallback(() => {
    if (!report) return
    setShowExportMenu(false)
    const grouped = groupIssuesByCategory(report.issues)
    const getScore = (cat: string) => report.categoryScores.find((c) => c.category === cat)?.score ?? 100
    const cats = [
      { label: "Accessibility", score: Math.round((getScore("images") + getScore("contrast") + getScore("forms") + getScore("landmarks")) / 4), color: "#8b5cf6" },
      { label: "Structure", score: Math.round((getScore("headings") + getScore("structure")) / 2), color: "#3b82f6" },
      { label: "Security", score: getScore("security"), color: "#f59e0b" },
    ]
    const errorCount = report.issues.filter((i) => i.severity === "error").length
    const warningCount = report.issues.filter((i) => i.severity === "warning").length
    const infoCount = report.issues.filter((i) => i.severity === "info").length
    const domain = report.url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    const dateStr = new Date(report.scannedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    const timeStr = new Date(report.scannedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const scoreColor = (s: number) => s >= 90 ? "#16a34a" : s >= 70 ? "#d97706" : "#dc2626"
    const scoreClass = (s: number) => s >= 90 ? "green" : s >= 70 ? "amber" : "red"
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

    // Build heading tree HTML recursively
    const renderHeadings = (nodes: HeadingNode[]): string =>
      nodes.map((h) => {
        const indent = (h.level - 1) * 24
        const hasIssue = h.issues && h.issues.length > 0
        return `<div class="heading-row" style="padding-left:${indent}px">
          <span class="heading-tag h${h.level}-tag">H${h.level}</span>
          <span class="heading-text${hasIssue ? " heading-issue" : ""}">${h.text ? esc(h.text) : '<em style="color:#94a3b8">empty</em>'}</span>
          ${hasIssue ? `<span class="heading-warn">${h.issues.join(", ")}</span>` : ""}
        </div>`
      }).join("")

    // Meta tags section
    const metaRows: [string, string][] = []
    if (report.meta.title) metaRows.push(["Title", esc(report.meta.title)])
    if (report.meta.description) metaRows.push(["Description", esc(report.meta.description)])
    if (report.meta.lang) metaRows.push(["Language", report.meta.lang])
    if (report.meta.charset) metaRows.push(["Charset", report.meta.charset])
    if (report.meta.viewport) metaRows.push(["Viewport", esc(report.meta.viewport)])
    if (report.meta.canonical) metaRows.push(["Canonical URL", esc(report.meta.canonical)])
    if (report.meta.ogTags && Object.keys(report.meta.ogTags).length > 0) {
      for (const [k, v] of Object.entries(report.meta.ogTags)) {
        metaRows.push([`OG: ${k}`, esc(String(v))])
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>URL Scanner Report — ${esc(domain)}</title>
<style>
  @page {
    margin: 1.5cm 2cm;
    @bottom-center {
      content: counter(page) " of " counter(pages);
      font-size: 9px;
      color: #94a3b8;
    }
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    background: #fff;
    font-size: 13px;
    line-height: 1.5;
    max-width: 860px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* ---- Cover / Header ---- */
  .cover {
    text-align: center;
    padding: 48px 0 36px;
    border-bottom: 3px solid #1e293b;
    margin-bottom: 32px;
  }
  .cover .brand {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 20px;
  }
  .cover h1 {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 6px;
    letter-spacing: -0.5px;
  }
  .cover .url {
    font-size: 16px;
    color: #3b82f6;
    word-break: break-all;
    margin-bottom: 8px;
  }
  .cover .date {
    font-size: 12px;
    color: #94a3b8;
  }
  .cover .scan-meta {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 16px;
    font-size: 11px;
    color: #64748b;
  }
  .cover .scan-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* ---- Section headings ---- */
  h2 {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 32px 0 14px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
    letter-spacing: -0.2px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
    margin: 0 0 10px;
  }

  /* ---- Score ring ---- */
  .score-hero {
    display: flex;
    align-items: center;
    gap: 32px;
    margin: 24px 0;
    page-break-inside: avoid;
  }
  .score-ring {
    position: relative;
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }
  .score-ring svg {
    width: 140px;
    height: 140px;
    transform: rotate(-90deg);
  }
  .score-ring .ring-bg {
    fill: none;
    stroke: #f1f5f9;
    stroke-width: 10;
  }
  .score-ring .ring-fg {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s ease;
  }
  .score-ring .score-value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  .score-ring .score-num {
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
  }
  .score-ring .score-label {
    font-size: 11px;
    color: #64748b;
    margin-top: 2px;
  }

  /* ---- Category score cards ---- */
  .cat-scores {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    flex: 1;
  }
  .cat-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 10px;
    text-align: center;
    page-break-inside: avoid;
  }
  .cat-card .cat-val {
    font-size: 28px;
    font-weight: 800;
    line-height: 1;
  }
  .cat-card .cat-label {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
    margin-bottom: 8px;
  }
  .cat-card .cat-bar {
    height: 4px;
    background: #f1f5f9;
    border-radius: 2px;
    overflow: hidden;
  }
  .cat-card .cat-bar-fill {
    height: 100%;
    border-radius: 2px;
  }

  /* ---- Summary ---- */
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 16px 0 24px;
    page-break-inside: avoid;
  }
  .summary-col {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 18px;
  }
  .summary-col.priority {
    border-left: 3px solid #ef4444;
  }
  .summary-col.working {
    border-left: 3px solid #22c55e;
  }
  .summary-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .summary-col li {
    padding: 5px 0;
    font-size: 12.5px;
    color: #334155;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.45;
  }
  .summary-col li::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-top: 6px;
    flex-shrink: 0;
  }
  .summary-col.priority li::before { background: #ef4444; }
  .summary-col.working li::before { background: #22c55e; }

  /* ---- Issue counts strip ---- */
  .count-strip {
    display: flex;
    gap: 16px;
    margin: 8px 0 16px;
    font-size: 12px;
  }
  .count-strip .count-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .count-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  /* ---- Issue groups ---- */
  .group {
    margin: 18px 0;
    page-break-inside: avoid;
  }
  .group-header {
    font-size: 13px;
    font-weight: 700;
    padding: 8px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px 8px 0 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .group-icon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    color: #fff;
  }
  .group-count {
    font-size: 10px;
    font-weight: 600;
    background: #e2e8f0;
    color: #64748b;
    padding: 2px 8px;
    border-radius: 99px;
    margin-left: auto;
  }
  .group-body {
    border: 1px solid #e2e8f0;
    border-top: none;
    border-radius: 0 0 8px 8px;
  }
  .issue {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    gap: 10px;
    font-size: 12.5px;
    page-break-inside: avoid;
  }
  .issue:last-child { border-bottom: none; }
  .sev-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
    flex-shrink: 0;
  }
  .sev-error { background: #ef4444; }
  .sev-warning { background: #f59e0b; }
  .sev-info { background: #60a5fa; }
  .issue-content { flex: 1; min-width: 0; }
  .issue-msg { color: #1e293b; line-height: 1.4; }
  .issue-detail {
    color: #94a3b8;
    font-size: 11px;
    margin-top: 2px;
    line-height: 1.35;
    word-break: break-all;
  }
  .issue-wcag {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    color: #6366f1;
    background: #eef2ff;
    padding: 1px 6px;
    border-radius: 3px;
    margin-left: 4px;
  }

  /* ---- Heading tree ---- */
  .heading-tree {
    margin: 8px 0;
    page-break-inside: avoid;
  }
  .heading-row {
    padding: 4px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
  }
  .heading-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    padding: 1px 6px;
    border-radius: 4px;
    min-width: 28px;
    text-align: center;
    flex-shrink: 0;
  }
  .h1-tag { background: #6366f1; }
  .h2-tag { background: #3b82f6; }
  .h3-tag { background: #0ea5e9; }
  .h4-tag { background: #14b8a6; }
  .h5-tag { background: #8b5cf6; }
  .h6-tag { background: #a855f7; }
  .heading-text { color: #334155; }
  .heading-issue { color: #dc2626; }
  .heading-warn {
    font-size: 10px;
    color: #f59e0b;
    margin-left: auto;
  }

  /* ---- Security headers table ---- */
  .sec-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin: 8px 0;
    page-break-inside: avoid;
  }
  .sec-table th {
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    padding: 8px 12px;
    border-bottom: 2px solid #e2e8f0;
    background: #f8fafc;
  }
  .sec-table td {
    padding: 7px 12px;
    border-bottom: 1px solid #f1f5f9;
  }
  .sec-table tr:last-child td { border-bottom: none; }
  .sec-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .sec-present { color: #16a34a; background: #f0fdf4; }
  .sec-missing { color: #dc2626; background: #fef2f2; }
  .sec-grade {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 800;
    color: #fff;
    margin-left: 12px;
  }

  /* ---- Meta tags ---- */
  .meta-table {
    width: 100%;
    font-size: 12.5px;
    margin: 8px 0;
    page-break-inside: avoid;
  }
  .meta-table td {
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }
  .meta-table td:first-child {
    font-weight: 600;
    color: #64748b;
    width: 140px;
    padding-right: 16px;
    white-space: nowrap;
  }
  .meta-table td:last-child {
    color: #334155;
    word-break: break-all;
  }

  /* ---- Link summary cards ---- */
  .link-cards {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin: 8px 0;
    page-break-inside: avoid;
  }
  .link-card {
    text-align: center;
    padding: 12px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }
  .link-card .lc-val {
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
  }
  .link-card .lc-label {
    font-size: 10px;
    color: #64748b;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ---- Site structure ---- */
  .struct-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 8px 0;
    page-break-inside: avoid;
  }
  .struct-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 12px;
  }
  .struct-check {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .struct-yes { background: #dcfce7; color: #16a34a; }
  .struct-no { background: #fee2e2; color: #dc2626; }

  /* ---- Colors ---- */
  .green { color: #16a34a; }
  .amber { color: #d97706; }
  .red { color: #dc2626; }

  /* ---- Footer ---- */
  .footer {
    margin-top: 48px;
    padding: 20px 0;
    border-top: 2px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #94a3b8;
  }
  .footer .footer-brand {
    font-weight: 700;
    color: #64748b;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-size: 10px;
  }

  /* ---- Print ---- */
  @media print {
    body { padding: 0; }
    .cover { padding-top: 24px; }
    h2 { break-after: avoid; }
    .group { break-inside: avoid; }
    .issue { break-inside: avoid; }
    .score-hero { break-inside: avoid; }
    .summary-grid { break-inside: avoid; }
    .sec-table { break-inside: avoid; }
    .heading-tree { break-inside: avoid; }
    .link-cards { break-inside: avoid; }
    .struct-grid { break-inside: avoid; }
    .footer { break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- =============== COVER =============== -->
<div class="cover">
  <div class="brand">Stamats</div>
  <h1>Website Audit Report</h1>
  <div class="url">${esc(report.url)}</div>
  <div class="date">${dateStr} at ${timeStr}</div>
  <div class="scan-meta">
    <span>${report.fetchTimeMs}ms response</span>
    <span>&middot;</span>
    <span>${(report.htmlSize / 1024).toFixed(1)} KB HTML</span>
    <span>&middot;</span>
    <span>${report.domElements.toLocaleString()} DOM elements</span>
    <span>&middot;</span>
    <span>${report.issues.length} issues found</span>
  </div>
</div>

<!-- =============== SCORE HERO =============== -->
<div class="score-hero">
  <div class="score-ring">
    <svg viewBox="0 0 140 140">
      <circle class="ring-bg" cx="70" cy="70" r="58" />
      <circle class="ring-fg" cx="70" cy="70" r="58"
        stroke="${scoreColor(report.overallScore)}"
        stroke-dasharray="${2 * Math.PI * 58}"
        stroke-dashoffset="${2 * Math.PI * 58 * (1 - report.overallScore / 100)}" />
    </svg>
    <div class="score-value">
      <div class="score-num ${scoreClass(report.overallScore)}">${report.overallScore}</div>
      <div class="score-label">Overall</div>
    </div>
  </div>
  <div class="cat-scores">
    ${cats.map((c) => `
    <div class="cat-card">
      <div class="cat-val ${scoreClass(c.score)}">${c.score}</div>
      <div class="cat-label">${c.label}</div>
      <div class="cat-bar">
        <div class="cat-bar-fill" style="width:${c.score}%;background:${scoreColor(c.score)}"></div>
      </div>
    </div>`).join("")}
  </div>
</div>

<!-- =============== SUMMARY =============== -->
${report.summary && (report.summary.topPriorities?.length || report.summary.whatsWorking?.length) ? `
<h2>Executive Summary</h2>
<div class="summary-grid">
  ${report.summary.topPriorities?.length ? `
  <div class="summary-col priority">
    <h3>Top Priorities</h3>
    <ul>${report.summary.topPriorities.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  </div>` : ""}
  ${report.summary.whatsWorking?.length ? `
  <div class="summary-col working">
    <h3>What's Working</h3>
    <ul>${report.summary.whatsWorking.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>` : ""}
</div>` : ""}

<!-- =============== ISSUES =============== -->
<h2>Issues Found</h2>
<div class="count-strip">
  <div class="count-item"><span class="count-dot" style="background:#ef4444"></span> ${errorCount} Errors</div>
  <div class="count-item"><span class="count-dot" style="background:#f59e0b"></span> ${warningCount} Warnings</div>
  <div class="count-item"><span class="count-dot" style="background:#60a5fa"></span> ${infoCount} Info</div>
</div>
${grouped.map(({ group, issues: gi }) => {
  const iconColors: Record<string, string> = {
    accessibility: "#8b5cf6",
    structure: "#3b82f6",
    security: "#f59e0b",
    other: "#64748b",
  }
  const iconLetters: Record<string, string> = {
    accessibility: "A",
    structure: "S",
    security: "K",
    other: "O",
  }
  const errs = gi.filter((i) => i.severity === "error").length
  const warns = gi.filter((i) => i.severity === "warning").length
  const infos = gi.filter((i) => i.severity === "info").length
  const countParts = [errs > 0 ? `${errs}E` : "", warns > 0 ? `${warns}W` : "", infos > 0 ? `${infos}I` : ""].filter(Boolean).join(" ")
  return `
  <div class="group">
    <div class="group-header">
      <span class="group-icon" style="background:${iconColors[group.id] ?? "#64748b"}">${iconLetters[group.id] ?? "?"}</span>
      ${group.label}
      <span class="group-count">${gi.length} &mdash; ${countParts}</span>
    </div>
    <div class="group-body">
      ${gi.map((issue) => `
      <div class="issue">
        <div class="sev-dot sev-${issue.severity}"></div>
        <div class="issue-content">
          <div class="issue-msg">${esc(issue.message)}</div>
          <div class="issue-detail">
            ${issue.selector ? `<span>${esc(issue.selector)}</span>` : ""}
            ${issue.selector && (issue.wcagCriteria || issue.ruleId) ? " &middot; " : ""}
            ${issue.wcagCriteria ? `<span class="issue-wcag">WCAG ${issue.wcagCriteria}${issue.wcagLevel ? " " + issue.wcagLevel : ""}</span>` : `<span>${issue.ruleId}</span>`}
          </div>
        </div>
      </div>`).join("")}
    </div>
  </div>`
}).join("")}

<!-- =============== HEADINGS =============== -->
${report.headingTree.length > 0 ? `
<h2>Heading Structure</h2>
<div class="heading-tree">
  ${renderHeadings(report.headingTree)}
</div>` : ""}

<!-- =============== META TAGS =============== -->
${metaRows.length > 0 ? `
<h2>Meta Tags</h2>
<table class="meta-table">
  ${metaRows.map(([label, val]) => `<tr><td>${label}</td><td>${val}</td></tr>`).join("")}
</table>` : ""}

<!-- =============== SECURITY HEADERS =============== -->
${report.securityHeaders ? (() => {
  const grade = report.securityHeaders.grade
  const gradeColor = grade === "A" || grade === "A+" ? "#16a34a" : grade === "B" ? "#d97706" : grade === "C" ? "#f59e0b" : "#dc2626"
  const headers = report.securityHeaders.headers
  const presentCount = Object.values(headers).filter((v: { present: boolean }) => v.present).length
  const totalHeaders = Object.keys(headers).length
  return `
<h2>Security Headers
  <span class="sec-grade" style="background:${gradeColor}">${grade}</span>
  <span style="font-size:12px;font-weight:400;color:#64748b;margin-left:8px">${presentCount}/${totalHeaders} present</span>
</h2>
<table class="sec-table">
  <thead><tr><th>Header</th><th>Status</th><th>Value</th></tr></thead>
  <tbody>
    ${Object.entries(headers).map(([k, v]: [string, { present: boolean; value?: string }]) => `
    <tr>
      <td style="font-weight:600">${k}</td>
      <td><span class="sec-badge ${v.present ? "sec-present" : "sec-missing"}">${v.present ? "&#10003; Present" : "&#10007; Missing"}</span></td>
      <td style="font-size:11px;color:#64748b;word-break:break-all">${v.present && v.value ? esc(String(v.value)).substring(0, 80) : "&mdash;"}</td>
    </tr>`).join("")}
  </tbody>
</table>`
})() : ""}

<!-- =============== SITE STRUCTURE =============== -->
${report.siteStructure ? (() => {
  const ph = report.siteStructure.pageHierarchy
  const structItems = [
    { label: "Header", present: !!ph.hasHeader },
    { label: "Navigation", present: !!ph.hasNav },
    { label: "Main content", present: !!ph.hasMain },
    { label: "Footer", present: !!ph.hasFooter },
    { label: "Sidebar (aside)", present: !!ph.hasAside },
    { label: "Breadcrumb", present: !!ph.hasBreadcrumb },
  ]
  return `
<h2>Site Structure</h2>
<h3>Semantic Elements</h3>
<div class="struct-grid">
  ${structItems.map((item) => `
  <div class="struct-item">
    <span class="struct-check ${item.present ? "struct-yes" : "struct-no"}">${item.present ? "&#10003;" : "&#10007;"}</span>
    <span>${item.label}</span>
  </div>`).join("")}
</div>
${ph.navLinkCount ? `<div style="font-size:12px;color:#64748b;margin:6px 0">${ph.navLinkCount} navigation links detected</div>` : ""}
${ph.sections && ph.sections.length > 0 ? `
<h3 style="margin-top:16px">Page Sections</h3>
<div style="font-size:12px;margin:4px 0">
  ${ph.sections.map((s) => `<div style="padding:3px 0;display:flex;gap:8px">
    <span style="font-weight:600;color:#3b82f6;min-width:60px">&lt;${s.tag}&gt;</span>
    ${s.id ? `<span style="color:#64748b">id="${esc(s.id)}"</span>` : ""}
    ${s.ariaLabel ? `<span style="color:#64748b">aria-label="${esc(s.ariaLabel)}"</span>` : ""}
  </div>`).join("")}
</div>` : ""}
${report.siteStructure.navigation.length > 0 ? `
<h3 style="margin-top:16px">Navigation Links</h3>
<div style="font-size:12px;margin:4px 0;columns:2;column-gap:24px">
  ${report.siteStructure.navigation.slice(0, 20).map((n) => `<div style="padding:2px 0;break-inside:avoid">${esc(n.text || n.href)}</div>`).join("")}
  ${report.siteStructure.navigation.length > 20 ? `<div style="color:#94a3b8;font-style:italic;padding:2px 0">+ ${report.siteStructure.navigation.length - 20} more</div>` : ""}
</div>` : ""}
`
})() : ""}

<!-- =============== FOOTER =============== -->
<div class="footer">
  <div>
    <div class="footer-brand">Stamats</div>
    <div>Generated by Stamats URL Scanner</div>
  </div>
  <div style="text-align:right">
    <div>${dateStr}</div>
    <div style="color:#cbd5e1">${esc(report.url)}</div>
  </div>
</div>

</body>
</html>`

    const w = window.open("", "_blank")
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 500)
    }
  }, [report])

  // ----- AI Feature: Issue Doctor -----
  const issueKey = useCallback((issue: ScanIssue) => `${issue.ruleId}::${issue.selector || ""}::${issue.element?.slice(0, 50) || ""}`, [])

  const fetchAiFix = useCallback(
    async (issue: ScanIssue) => {
      if (!report) return
      const key = issueKey(issue)

      // Already cached
      if (aiFixCache.has(key)) {
        setAiFixExpanded(prev => { const next = new Set(prev); next.add(key); return next })
        return
      }

      setAiFixLoading(prev => { const next = new Set(prev); next.add(key); return next })
      setAiFixExpanded(prev => { const next = new Set(prev); next.add(key); return next })

      try {
        const headers = await addCsrfHeader({ "Content-Type": "application/json" })
        const response = await fetch("/api/scanner/ai/fix-issue", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            url: report.url,
            issue,
            pageContext: {
              title: report.meta?.title,
              lang: report.meta?.lang,
            },
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setAiFixCache(prev => {
            const next = new Map(prev)
            next.set(key, data)
            return next
          })
        }
      } catch {
        // Silently fail -- panel will show nothing
      } finally {
        setAiFixLoading(prev => { const next = new Set(prev); next.delete(key); return next })
      }
    },
    [report, aiFixCache, issueKey],
  )

  const toggleAiFix = useCallback(
    (issue: ScanIssue) => {
      const key = issueKey(issue)
      if (aiFixExpanded.has(key)) {
        setAiFixExpanded(prev => { const next = new Set(prev); next.delete(key); return next })
      } else {
        fetchAiFix(issue)
      }
    },
    [issueKey, aiFixExpanded, fetchAiFix],
  )

  // ----- AI Feature: Alt Text Generator -----
  const altTextIssueRules = new Set(["img-alt-missing", "img-link-alt-missing", "input-image-alt-missing"])

  const extractImageUrl = useCallback((element?: string): string | null => {
    if (!element) return null
    const srcMatch = element.match(/src=["']([^"']+)["']/)
    return srcMatch ? srcMatch[1]! : null
  }, [])

  const fetchAltText = useCallback(
    async (issue: ScanIssue) => {
      if (!report) return
      const key = issueKey(issue)
      const imageUrl = extractImageUrl(issue.element)
      if (!imageUrl) return

      if (altTextCache.has(key)) {
        setAltTextExpanded(prev => { const next = new Set(prev); next.add(key); return next })
        return
      }

      setAltTextLoading(prev => { const next = new Set(prev); next.add(key); return next })
      setAltTextExpanded(prev => { const next = new Set(prev); next.add(key); return next })

      try {
        const headers = await addCsrfHeader({ "Content-Type": "application/json" })
        const response = await fetch("/api/scanner/ai/alt-text", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            pageUrl: report.url,
            imageUrl,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setAltTextCache(prev => {
            const next = new Map(prev)
            next.set(key, data)
            return next
          })
        }
      } catch {
        // Silently fail
      } finally {
        setAltTextLoading(prev => { const next = new Set(prev); next.delete(key); return next })
      }
    },
    [report, altTextCache, issueKey, extractImageUrl],
  )

  const toggleAltText = useCallback(
    (issue: ScanIssue) => {
      const key = issueKey(issue)
      if (altTextExpanded.has(key)) {
        setAltTextExpanded(prev => { const next = new Set(prev); next.delete(key); return next })
      } else {
        fetchAltText(issue)
      }
    },
    [issueKey, altTextExpanded, fetchAltText],
  )

  // ----- Derived -----
  const filteredIssues = report
    ? filterSeverity === "all"
      ? report.issues
      : report.issues.filter((i) => i.severity === filterSeverity)
    : []

  const errorCount = report
    ? report.issues.filter((i) => i.severity === "error").length
    : 0
  const warningCount = report
    ? report.issues.filter((i) => i.severity === "warning").length
    : 0
  const infoCount = report
    ? report.issues.filter((i) => i.severity === "info").length
    : 0

  // Build 3 meaningful grouped category scores matching the server's weighting
  const displayCategories: { label: string; score: number }[] = report
    ? (() => {
        const getScore = (cat: string) => report.categoryScores.find((c) => c.category === cat)?.score ?? 100
        return [
          { label: "Accessibility", score: Math.round((getScore("images") + getScore("contrast") + getScore("forms") + getScore("landmarks")) / 4) },
          { label: "Structure", score: Math.round((getScore("headings") + getScore("structure")) / 2) },
          { label: "Security", score: getScore("security") },
        ]
      })()
    : []

  // ---------------------------------------------------------------------------
  // RENDER: Home
  // ---------------------------------------------------------------------------
  if (view === "home") {
    return (
      <div className="min-h-screen bg-[#fafbfc] dark:bg-[hsl(224,20%,8%)] animate-in fade-in-0 duration-300">
        <AppHeader title="URL Scanner" />

        {/* Hero section with gradient background */}
        <div className="relative overflow-hidden">
          {/* Ambient background */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(139,92,246,0.04) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 20% 30%, rgba(6,182,212,0.03) 0%, transparent 70%)"
          }} />

          <div className="relative flex items-start justify-center pt-[7vh] pb-8">
            <div className="w-full max-w-2xl px-6">
              {/* Icon + Title */}
              <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-3 duration-500">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 mb-5 shadow-lg shadow-blue-500/20">
                  <Globe size={24} className="text-white" strokeWidth={1.75} />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
                  URL Scanner
                </h1>
                <p className="text-[15px] text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Paste any URL to audit accessibility, structure, and security headers in seconds.
                </p>
              </div>

              {/* Error banner */}
              {error && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 flex items-start gap-3">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                    <span className="sr-only">Dismiss</span>&times;
                  </button>
                </div>
              )}

              {/* URL Input Card */}
              <form
                onSubmit={(e) => { e.preventDefault(); scanUrl(urlInput) }}
                className="bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-2 flex items-center gap-2 mb-5 shadow-sm shadow-black/[0.03] dark:shadow-none transition-shadow focus-within:shadow-md focus-within:shadow-blue-500/[0.06] focus-within:border-blue-300/50 dark:focus-within:border-blue-500/30"
              >
                <Globe size={18} className="text-slate-400 dark:text-slate-500 ml-4 flex-shrink-0" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 bg-transparent text-slate-900 dark:text-white py-3 px-2 outline-none placeholder:text-slate-400/50 dark:placeholder:text-slate-500/40 text-[15px] transition-colors duration-150"
                  required
                />
                <button
                  type="submit"
                  disabled={!urlInput.trim()}
                  className="text-white font-semibold px-7 py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_8px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                >
                  Scan
                </button>
              </form>

              {/* Options — collapsible, cleaner design */}
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-12 text-[13px] text-slate-500 dark:text-slate-400">
                {[
                  { key: "wcagAudit" as const, label: "WCAG Audit" },
                  { key: "headings" as const, label: "Headings" },
                ].map((opt) => (
                  <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={options[opt.key]}
                      onChange={(e) => setOptions((o) => ({ ...o, [opt.key]: e.target.checked }))}
                      className="accent-blue-600 w-3.5 h-3.5"
                    />
                    {opt.label}
                  </label>
                ))}
                <select
                  value={options.wcagLevel}
                  onChange={(e) => setOptions((o) => ({ ...o, wcagLevel: e.target.value as "A" | "AA" | "AAA" }))}
                  className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-500 dark:text-slate-400 outline-none text-[13px]"
                >
                  <option value="A">WCAG A</option>
                  <option value="AA">WCAG AA</option>
                  <option value="AAA">WCAG AAA</option>
                </select>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-12 animate-in fade-in duration-700 delay-200">
                {[
                  { icon: Eye, label: "Accessibility", color: "text-purple-500 bg-purple-50 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-800/30" },
                  { icon: Layout, label: "Structure", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200/50 dark:border-blue-800/30" },
                  { icon: Shield, label: "Security", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/30" },
                ].map((f) => (
                  <div key={f.label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border ${f.color}`}>
                    <f.icon size={12} strokeWidth={2} />
                    {f.label}
                  </div>
                ))}
              </div>

            {/* Recent Scans */}
            {recentScans.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Recent Scans
                  </h2>
                  <button
                    onClick={() => {
                      localStorage.removeItem(RECENT_SCANS_KEY)
                      setRecentScans([])
                    }}
                    className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                </div>
                <div className="space-y-2 stagger-children">
                  {recentScans.map((scan) => (
                    <button
                      key={scan.url + scan.scannedAt}
                      onClick={() => {
                        setUrlInput(scan.url)
                        scanUrl(scan.url)
                      }}
                      className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl px-5 py-4 flex items-center justify-between transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 active:translate-y-0 active:shadow-md w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {scan.url.replace(/^https?:\/\//, "")}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock size={10} />
                          {timeAgo(scan.scannedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {scan.errors > 0 && (
                          <span className="text-xs text-red-500">
                            {scan.errors} error{scan.errors !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span
                          className={`w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center ${
                            scan.score >= 90
                              ? "bg-emerald-500/10 text-emerald-500"
                              : scan.score >= 70
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          {scan.score}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* close hero bg */}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // RENDER: Scanning (loading)
  // ---------------------------------------------------------------------------
  if (view === "scanning") {
    return (
      <div className="min-h-screen bg-white dark:bg-[hsl(224,20%,8%)] animate-in fade-in-0 duration-300">
        <AppHeader title="URL Scanner" />
        <div className="flex items-start justify-center pt-[20vh]">
          <div className="w-full max-w-md px-6">
            <div className="text-center mb-10">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Scanning...
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {normalizeUrl(urlInput)}
              </p>
            </div>

            <div className="space-y-4 stagger-children">
              {scanSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {step.status === "done" && (
                      <Check
                        size={16}
                        className="text-emerald-500"
                        strokeWidth={3}
                      />
                    )}
                    {step.status === "active" && (
                      <Loader2
                        size={16}
                        className="text-blue-500 animate-spin"
                      />
                    )}
                    {step.status === "pending" && (
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    )}
                    {step.status === "error" && (
                      <AlertCircle size={16} className="text-red-500" />
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      step.status === "active"
                        ? "text-slate-900 dark:text-white font-medium"
                        : step.status === "done"
                          ? "text-slate-500 dark:text-slate-400"
                          : step.status === "error"
                            ? "text-red-500 dark:text-red-400"
                            : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <button
                onClick={() => {
                  if (abortRef.current) abortRef.current.abort()
                  setView("home")
                }}
                className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // RENDER: Issue Detail
  // ---------------------------------------------------------------------------
  if (view === "detail" && selectedIssue) {
    return (
      <div className="min-h-screen bg-white dark:bg-[hsl(224,20%,8%)]">
        <AppHeader title="URL Scanner" />
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Back */}
          <button
            onClick={() => {
              setSelectedIssue(null)
              setView("results")
            }}
            className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-8"
          >
            <ChevronLeft size={20} />
            <span className="text-sm">Back to results</span>
          </button>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span
                className={`px-2 py-1 rounded-lg text-xs font-bold ${severityBadgeClass(selectedIssue.severity)}`}
              >
                {severityLabel(selectedIssue.severity)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {selectedIssue.ruleId}
              </span>
              {selectedIssue.wcagCriteria && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  &middot; WCAG {selectedIssue.wcagCriteria}
                  {selectedIssue.wcagLevel
                    ? ` Level ${selectedIssue.wcagLevel}`
                    : ""}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {selectedIssue.message}
            </h1>
            {selectedIssue.suggestion && (
              <p className="text-slate-500 dark:text-slate-400">
                {selectedIssue.suggestion}
              </p>
            )}
          </div>

          {/* Affected elements */}
          {selectedIssue.element && (
            <div className="space-y-4 mb-8">
              <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06]">
                  {selectedIssue.line != null && (
                    <span>Line {selectedIssue.line}</span>
                  )}
                  {selectedIssue.selector && (
                    <span className="font-mono">
                      {selectedIssue.selector}
                    </span>
                  )}
                </div>
                {/* Problem code */}
                <div className="px-5 py-3 font-mono text-[13px] leading-relaxed bg-red-500/[0.04] dark:bg-red-500/[0.06] border-l-[3px] border-l-red-500">
                  <code className="text-slate-700 dark:text-slate-300 break-all">
                    {selectedIssue.element}
                  </code>
                </div>
                {/* Suggested fix */}
                {selectedIssue.suggestion && (
                  <div className="px-5 py-3 font-mono text-[13px] leading-relaxed bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] border-l-[3px] border-l-emerald-500 border-t border-t-black/[0.04] dark:border-t-white/[0.04]">
                    <code className="text-slate-700 dark:text-slate-300 break-all">
                      {selectedIssue.suggestion}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Issue Doctor panel (detail view) */}
          {(() => {
            const detailKey = issueKey(selectedIssue)
            const detailFixExpanded = aiFixExpanded.has(detailKey)
            const detailFixLoading = aiFixLoading.has(detailKey)
            const detailFixData = aiFixCache.get(detailKey)
            const detailIsAlt = altTextIssueRules.has(selectedIssue.ruleId)
            const detailAltExpanded = altTextExpanded.has(detailKey)
            const detailAltLoading = altTextLoading.has(detailKey)
            const detailAltData = altTextCache.get(detailKey)

            return (
              <div className="space-y-3 mb-8">
                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAiFix(selectedIssue)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/15 ${
                      detailFixExpanded
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        : "text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/5"
                    }`}
                  >
                    <Sparkles size={12} />
                    {detailFixExpanded ? "Hide AI Fix" : "Get AI Fix"}
                  </button>
                  {detailIsAlt && (
                    <button
                      onClick={() => toggleAltText(selectedIssue)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 ${
                        detailAltExpanded
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                          : "text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5"
                      }`}
                    >
                      <Sparkles size={12} />
                      {detailAltExpanded ? "Hide Alt Text" : "Generate Alt Text"}
                    </button>
                  )}
                </div>

                {/* AI Fix panel */}
                {detailFixExpanded && (
                  <div className="bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-5 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                    {detailFixLoading && !detailFixData && (
                      <div className="space-y-3">
                        <div className="shimmer h-3 w-full rounded" />
                        <div className="shimmer h-3 w-5/6 rounded" />
                        <div className="shimmer h-20 w-full rounded-lg" />
                        <div className="shimmer h-20 w-full rounded-lg" />
                      </div>
                    )}
                    {detailFixData && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1.5">Why This Matters</div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{detailFixData.explanation}</p>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">The Fix</div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-[10px] text-red-500/80 font-medium mb-1">Before</div>
                              <pre className="bg-red-500/[0.04] dark:bg-red-500/[0.06] border border-red-500/10 rounded-xl p-3 overflow-x-auto"><code className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all">{detailFixData.beforeCode}</code></pre>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-emerald-500/80 font-medium">After</span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(detailFixData.afterCode)}
                                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                >
                                  <Copy size={10} />
                                  Copy
                                </button>
                              </div>
                              <pre className="bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] border border-emerald-500/10 rounded-xl p-3 overflow-x-auto"><code className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all">{detailFixData.afterCode}</code></pre>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Also Watch For</div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{detailFixData.watchFor}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Alt Text panel */}
                {detailIsAlt && detailAltExpanded && (
                  <div className="bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-5 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                    {detailAltLoading && !detailAltData && (
                      <div className="space-y-2">
                        <div className="shimmer h-3 w-3/4 rounded" />
                        <div className="shimmer h-3 w-1/2 rounded" />
                      </div>
                    )}
                    {detailAltData && (
                      detailAltData.isDecorative ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-500 dark:text-slate-400">This image appears to be decorative. Use</span>
                          <code className="text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-mono">alt=""</code>
                          <button
                            onClick={() => navigator.clipboard.writeText('alt=""')}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <Copy size={12} />
                            Copy
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Suggested Alt Text</div>
                          <div className="flex items-center gap-2 bg-blue-500/[0.04] dark:bg-blue-500/[0.06] border border-blue-500/10 rounded-xl px-4 py-2.5">
                            <code className="text-sm text-slate-700 dark:text-slate-300 flex-1 font-mono">alt="{detailAltData.altText}"</code>
                            <button
                              onClick={() => navigator.clipboard.writeText(detailAltData.altText)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors flex-shrink-0"
                            >
                              <Copy size={12} />
                              Copy
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* How to Fix */}
          {selectedIssue.howToFix && selectedIssue.howToFix.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5 mb-8">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                How to Fix
              </h2>
              <ol className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400 list-decimal list-inside">
                {selectedIssue.howToFix.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Learn More */}
          {selectedIssue.learnMore && selectedIssue.learnMore.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                Learn More
              </h2>
              <div className="space-y-2 text-sm">
                {selectedIssue.learnMore.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Fallback: generated how-to-fix from WCAG criteria */}
          {(!selectedIssue.howToFix || selectedIssue.howToFix.length === 0) &&
            !selectedIssue.learnMore && (
              <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                  About this rule
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Rule <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{selectedIssue.ruleId}</code>
                  {selectedIssue.wcagCriteria && (
                    <> relates to WCAG Success Criterion {selectedIssue.wcagCriteria}
                      {selectedIssue.wcagLevel && ` (Level ${selectedIssue.wcagLevel})`}</>
                  )}
                  . Fix the affected elements to improve your site's accessibility and compliance score.
                </p>
                {selectedIssue.wcagCriteria && (
                  <a
                    href={`https://www.w3.org/WAI/WCAG21/Understanding/${selectedIssue.wcagCriteria.replace(/\./g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-3 inline-flex items-center gap-1"
                  >
                    WCAG {selectedIssue.wcagCriteria} reference
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
        </div>

      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // RENDER: Results Dashboard
  // ---------------------------------------------------------------------------
  if (view === "results" && report) {
    return (
      <div className="min-h-screen bg-white dark:bg-[hsl(224,20%,8%)]">
        <AppHeader title="URL Scanner" />
        {(() => {
          const sidebarTabs = [
            { id: "issues" as ResultTab, label: "Issues", count: report.issues.length, icon: AlertCircle, hasErrors: errorCount > 0 },
            { id: "headings" as ResultTab, label: "Headings", count: report.headingTree.length, icon: Layout, hasErrors: false },
            { id: "structure" as ResultTab, label: "Structure", count: 0, icon: Eye, hasErrors: false },
            { id: "history" as ResultTab, label: "History", count: 0, icon: Clock, hasErrors: false },
          ]
          const renderTabButton = (tab: typeof sidebarTabs[0], onClick?: () => void) => (
            <button
              key={tab.id}
              onClick={() => { setResultTab(tab.id); onClick?.() }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-all ${
                resultTab === tab.id
                  ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <tab.icon size={14} className={resultTab === tab.id ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
              <span className="flex-1">{tab.label}</span>
              {tab.count > 0 && <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{tab.count}</span>}
              {tab.hasErrors && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
            </button>
          )
          return null
        })()}

        {/* Mobile nav drawer */}
        {showMobileNav && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={() => setShowMobileNav(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[240px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-xl animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Results</span>
                <button onClick={() => setShowMobileNav(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
              <div className="px-3 py-4 space-y-1">
                {[
                  { id: "issues" as ResultTab, label: "Issues", count: report.issues.length, icon: AlertCircle, hasErrors: errorCount > 0 },
                  { id: "headings" as ResultTab, label: "Headings", count: report.headingTree.length, icon: Layout, hasErrors: false },
                  { id: "structure" as ResultTab, label: "Structure", count: 0, icon: Eye, hasErrors: false },
                  { id: "history" as ResultTab, label: "History", count: 0, icon: Clock, hasErrors: false },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setResultTab(tab.id); setShowMobileNav(false) }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all ${
                      resultTab === tab.id
                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <tab.icon size={16} className={resultTab === tab.id ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
                    <span className="flex-1">{tab.label}</span>
                    {tab.count > 0 && <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{tab.count}</span>}
                    {tab.hasErrors && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex">
        {/* Sticky sidebar nav for main tabs — desktop only */}
        <div className="hidden lg:flex flex-col w-[200px] flex-shrink-0 border-r border-slate-200/60 dark:border-slate-700/40 min-h-[calc(100vh-56px)]">
          <div className="sticky top-16 px-4 py-8 space-y-1">
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] px-3 mb-3">Results</div>
            {[
              { id: "issues" as ResultTab, label: "Issues", count: report.issues.length, icon: AlertCircle, hasErrors: errorCount > 0 },
              { id: "headings" as ResultTab, label: "Headings", count: report.headingTree.length, icon: Layout, hasErrors: false },
              { id: "structure" as ResultTab, label: "Structure", count: 0, icon: Eye, hasErrors: false },
              { id: "history" as ResultTab, label: "History", count: 0, icon: Clock, hasErrors: false },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setResultTab(tab.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-all ${
                  resultTab === tab.id
                    ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <tab.icon size={14} className={resultTab === tab.id ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
                <span className="flex-1">{tab.label}</span>
                {tab.count > 0 && <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{tab.count}</span>}
                {tab.hasErrors && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 max-w-4xl mx-auto px-6 py-8">
          {/* Back + URL + actions */}
          <div className="flex items-center gap-3 mb-8">
            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileNav(true)}
              className="lg:hidden text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <Menu size={20} />
            </button>
            <button
              onClick={() => {
                setView("home")
                setReport(null)
              }}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                {report.url.replace(/^https?:\/\//, "")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scanned{" "}
                {new Date(report.scannedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                &middot; {(report.fetchTimeMs / 1000).toFixed(1)}s
              </p>
            </div>

            {/* Export */}
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-all flex items-center gap-1.5"
              >
                {copied ? <Check size={14} /> : <Download size={14} />}
                {copied ? "Copied" : "Export"}
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-50">
                  <button
                    onClick={exportPDF}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Printer size={14} className="text-slate-400" />
                    Print Report (PDF)
                  </button>
                  <button
                    onClick={exportJSON}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Download size={14} className="text-slate-400" />
                    Download JSON
                  </button>
                  <button
                    onClick={copySummary}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Copy size={14} className="text-slate-400" />
                    Copy Summary
                  </button>
                </div>
              )}
            </div>

            {/* Rescan */}
            <button
              onClick={() => scanUrl(report.url)}
              className="px-3 py-1.5 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              Rescan
            </button>
          </div>

          {/* Score Row */}
          <div className="flex items-center gap-5 mb-8">
            {/* Overall ring */}
            <div className="flex flex-col items-center flex-shrink-0">
              <ScoreRing score={report.overallScore} />
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Overall
              </span>
            </div>

            {/* Category cards — click to filter issues */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              {displayCategories.map((cat) => (
                <CategoryCard
                  key={cat.label}
                  label={cat.label}
                  score={cat.score}
                  active={activeCategoryFilter === cat.label.toLowerCase()}
                  onClick={() => {
                    const id = cat.label.toLowerCase()
                    if (activeCategoryFilter === id) {
                      setActiveCategoryFilter(null)
                    } else {
                      setActiveCategoryFilter(id)
                      setResultTab("issues")
                    }
                  }}
                />
              ))}
              {displayCategories.length === 0 && (
                <div className="col-span-3 text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                  No category scores available.
                </div>
              )}
            </div>
          </div>

          {/* How scoring works + snapshot launch */}
          <div className="flex flex-wrap items-center justify-end gap-3 mb-5">
            <div className="flex items-center gap-3">
              <a
                href="/scoring.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                How is this scored?
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M3 1h8v8M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <button
                onClick={() => {
                  sessionStorage.setItem("accessibility-snapshot-data", JSON.stringify({ report }))
                  navigate("/scanner/snapshot")
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all duration-150 active:scale-[0.97]"
              >
                <FileText size={14} />
                View Snapshot
              </button>
            </div>
          </div>

          {/* Summary card */}
          {report.summary &&
            (report.summary.topPriorities?.length ||
              report.summary.whatsWorking?.length) && (
              <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-4 mb-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Priorities */}
                  {report.summary.topPriorities?.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider mb-2.5">
                        Top Priorities
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                        {report.summary.topPriorities.map((p, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* What's Working */}
                  {report.summary.whatsWorking?.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-2.5">
                        What's Working
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                        {report.summary.whatsWorking.map((w, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Check
                              size={14}
                              className="text-emerald-500 mt-0.5 flex-shrink-0"
                              strokeWidth={2.5}
                            />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Tab bar (mobile only — sidebar handles this on desktop) */}
          <div className="flex gap-7 border-b border-slate-200 dark:border-slate-800 mb-6 lg:hidden overflow-x-auto">
            {(
              [
                {
                  id: "issues" as ResultTab,
                  label: `Issues (${report.issues.length})`,
                },
                { id: "headings" as ResultTab, label: "Headings" },
                { id: "structure" as ResultTab, label: "Structure" },
                { id: "history" as ResultTab, label: "History" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setResultTab(tab.id)}
                className={`pb-2 text-sm font-medium border-b-2 transition-all ${
                  resultTab === tab.id
                    ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400"
                    : "text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {resultTab === "issues" && (
            <div>
              {/* Filter pills */}
              <div className="flex gap-2 mb-5 flex-wrap">
                {(
                  [
                    {
                      key: "all" as FilterSeverity,
                      label: `All ${report.issues.length}`,
                      activeClass: "bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-600/20 dark:border-blue-400/20",
                    },
                    {
                      key: "error" as FilterSeverity,
                      label: `${errorCount} Errors`,
                      activeClass: "bg-red-500/10 text-red-500 border-red-500/20",
                    },
                    {
                      key: "warning" as FilterSeverity,
                      label: `${warningCount} Warnings`,
                      activeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                    },
                    {
                      key: "info" as FilterSeverity,
                      label: `${infoCount} Info`,
                      activeClass: "bg-blue-400/10 text-blue-500 dark:text-blue-300 border-blue-400/20",
                    },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.key}
                    onClick={() => setFilterSeverity(pill.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterSeverity === pill.key
                        ? pill.activeClass
                        : "text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Grouped issue list with sidebar nav */}
              {(() => {
                // Apply severity filter, then category filter
                let issues = filteredIssues
                if (activeCategoryFilter) {
                  const group = CATEGORY_GROUPS.find((g) => g.id === activeCategoryFilter)
                  if (group) {
                    issues = issues.filter((i) => group.categories.includes(i.category))
                  }
                }

                if (issues.length === 0) {
                  return (
                    <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400">
                      {report.issues.length === 0
                        ? "No issues found. Nice work!"
                        : "No issues match this filter."}
                      {activeCategoryFilter && (
                        <button onClick={() => setActiveCategoryFilter(null)} className="block mx-auto mt-2 text-blue-500 hover:underline text-xs">
                          Clear category filter
                        </button>
                      )}
                    </div>
                  )
                }

                const groups = groupIssuesByCategory(issues)

                return (
                  <div className="space-y-4">
                    {activeCategoryFilter && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>Filtered by: <strong className="text-slate-700 dark:text-slate-200 capitalize">{activeCategoryFilter}</strong></span>
                        <button onClick={() => setActiveCategoryFilter(null)} className="text-blue-500 hover:underline">Clear</button>
                      </div>
                    )}
                    {groups.map(({ group, issues: groupIssues }) => {
                      const isCollapsed = collapsedGroups.has(group.id)
                      const Icon = group.icon
                      const groupErrors = groupIssues.filter((i) => i.severity === "error").length
                      const groupWarnings = groupIssues.filter((i) => i.severity === "warning").length

                      return (
                        <div key={group.id} id={`group-${group.id}`}>
                          {/* Group header */}
                          <button
                            onClick={() => setCollapsedGroups((prev) => {
                              const next = new Set(prev)
                              if (next.has(group.id)) next.delete(group.id)
                              else next.add(group.id)
                              return next
                            })}
                            className="flex items-center gap-2 w-full py-2 text-left sticky top-0 z-10 bg-white dark:bg-[hsl(224,20%,8%)]"
                          >
                            {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                            <Icon size={14} className={group.color} />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{group.label}</span>
                            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{groupIssues.length}</span>
                            {groupErrors > 0 && <span className="text-xs text-red-500">{groupErrors} error{groupErrors !== 1 ? "s" : ""}</span>}
                            {groupWarnings > 0 && <span className="text-xs text-amber-500">{groupWarnings} warning{groupWarnings !== 1 ? "s" : ""}</span>}
                          </button>

                          {/* Group items */}
                          {!isCollapsed && (
                            <div className="space-y-2 ml-1 pl-5 border-l-2 border-slate-100 dark:border-slate-800">
                              {groupIssues.map((issue, i) => {
                                const iKey = issueKey(issue)
                                const isFixExpanded = aiFixExpanded.has(iKey)
                                const isFixLoading = aiFixLoading.has(iKey)
                                const fixData = aiFixCache.get(iKey)
                                const isAltIssue = altTextIssueRules.has(issue.ruleId)
                                const isAltExpanded = altTextExpanded.has(iKey)
                                const isAltLoading = altTextLoading.has(iKey)
                                const altData = altTextCache.get(iKey)

                                return (
                                <div key={`${group.id}-${issue.ruleId}-${i}`} className="space-y-0">
                                  <div className={`bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden transition-all duration-300 ${
                                    issue.severity === "error" ? "border-l-[3px] border-l-red-500" :
                                    issue.severity === "warning" ? "border-l-[3px] border-l-amber-500" :
                                    "border-l-[3px] border-l-blue-400"
                                  }`}>
                                    {/* Main issue row */}
                                    <button
                                      onClick={() => {
                                        setSelectedIssue(issue)
                                        setView("detail")
                                      }}
                                      className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors w-full text-left"
                                    >
                                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDotClass(issue.severity)}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{issue.message}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                          {issue.selector && <>{issue.selector} &middot; </>}
                                          {issue.line != null && <>Line {issue.line} &middot; </>}
                                          {issue.wcagCriteria ? <>WCAG {issue.wcagCriteria}</> : issue.ruleId}
                                        </div>
                                        {issue.suggestion && (
                                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">{issue.suggestion}</div>
                                        )}
                                      </div>
                                    </button>

                                    {/* AI action buttons row */}
                                    <div className="flex items-center gap-2 px-5 py-1.5 border-t border-black/[0.03] dark:border-white/[0.03] bg-slate-50/50 dark:bg-slate-800/20">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleAiFix(issue) }}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/15 ${
                                          isFixExpanded
                                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                            : "text-slate-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/5"
                                        }`}
                                      >
                                        <Sparkles size={11} />
                                        {isFixExpanded ? "Hide Fix" : "Get AI Fix"}
                                      </button>
                                      {isAltIssue && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleAltText(issue) }}
                                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 ${
                                            isAltExpanded
                                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                              : "text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/5"
                                          }`}
                                        >
                                          <Sparkles size={11} />
                                          {isAltExpanded ? "Hide Alt Text" : "Generate Alt Text"}
                                        </button>
                                      )}
                                    </div>

                                    {/* AI Fix expanded panel */}
                                    {isFixExpanded && (
                                      <div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-gradient-to-b from-purple-50/30 to-white dark:from-purple-950/10 dark:to-slate-900 px-5 py-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                                        {isFixLoading && !fixData && (
                                          <div className="space-y-2.5">
                                            <div className="shimmer h-3 w-full rounded" />
                                            <div className="shimmer h-3 w-5/6 rounded" />
                                            <div className="shimmer h-16 w-full rounded-lg" />
                                            <div className="shimmer h-16 w-full rounded-lg" />
                                          </div>
                                        )}
                                        {fixData && (
                                          <div className="space-y-3.5">
                                            {/* Why this matters */}
                                            <div>
                                              <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Why This Matters</div>
                                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{fixData.explanation}</p>
                                            </div>
                                            {/* The fix: before/after */}
                                            <div>
                                              <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1.5">The Fix</div>
                                              <div className="space-y-1.5">
                                                <div>
                                                  <div className="text-[10px] text-red-500/80 font-medium mb-0.5">Before</div>
                                                  <pre className="bg-red-500/[0.04] dark:bg-red-500/[0.06] border border-red-500/10 dark:border-red-500/10 rounded-lg p-2.5 overflow-x-auto"><code className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-300 break-all whitespace-pre-wrap">{fixData.beforeCode}</code></pre>
                                                </div>
                                                <div>
                                                  <div className="flex items-center justify-between mb-0.5">
                                                    <span className="text-[10px] text-emerald-500/80 font-medium">After</span>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        navigator.clipboard.writeText(fixData.afterCode)
                                                      }}
                                                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                                    >
                                                      <Copy size={10} />
                                                      Copy
                                                    </button>
                                                  </div>
                                                  <pre className="bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] border border-emerald-500/10 dark:border-emerald-500/10 rounded-lg p-2.5 overflow-x-auto"><code className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-300 break-all whitespace-pre-wrap">{fixData.afterCode}</code></pre>
                                                </div>
                                              </div>
                                            </div>
                                            {/* Also watch for */}
                                            <div>
                                              <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Also Watch For</div>
                                              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{fixData.watchFor}</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Alt Text expanded panel */}
                                    {isAltIssue && isAltExpanded && (
                                      <div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-gradient-to-b from-blue-50/30 to-white dark:from-blue-950/10 dark:to-slate-900 px-5 py-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                                        {isAltLoading && !altData && (
                                          <div className="space-y-2">
                                            <div className="shimmer h-3 w-3/4 rounded" />
                                            <div className="shimmer h-3 w-1/2 rounded" />
                                          </div>
                                        )}
                                        {altData && (
                                          <div>
                                            {altData.isDecorative ? (
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500 dark:text-slate-400">This image appears to be decorative. Use</span>
                                                <code className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">alt=""</code>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    navigator.clipboard.writeText('alt=""')
                                                  }}
                                                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-1"
                                                >
                                                  <Copy size={10} />
                                                </button>
                                              </div>
                                            ) : (
                                              <div>
                                                <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1.5">Suggested Alt Text</div>
                                                <div className="flex items-center gap-2 bg-blue-500/[0.04] dark:bg-blue-500/[0.06] border border-blue-500/10 dark:border-blue-500/10 rounded-lg px-3 py-2">
                                                  <code className="text-xs text-slate-700 dark:text-slate-300 flex-1 font-mono">alt="{altData.altText}"</code>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      navigator.clipboard.writeText(altData.altText)
                                                    }}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors flex-shrink-0"
                                                  >
                                                    <Copy size={10} />
                                                    Copy
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {resultTab === "headings" && (
            <HeadingTreeView tree={report.headingTree} />
          )}

          {/* ---- Structure Tab ---- */}
          {resultTab === "structure" && (
            <div className="space-y-8">
              {(() => {
                const structure = report.siteStructure
                const hierarchy = structure?.pageHierarchy

                const semanticElements: { tag: string; label: string; present: boolean; extra?: string }[] = [
                  { tag: "<header>", label: "header", present: hierarchy?.hasHeader ?? false },
                  {
                    tag: "<nav>",
                    label: "nav",
                    present: hierarchy?.hasNav ?? false,
                    extra: hierarchy?.hasNav && hierarchy?.navLinkCount
                      ? `(${hierarchy.navLinkCount} links)`
                      : undefined,
                  },
                  { tag: "<main>", label: "main", present: hierarchy?.hasMain ?? false },
                  { tag: "<aside>", label: "aside", present: hierarchy?.hasAside ?? false },
                  { tag: "<footer>", label: "footer", present: hierarchy?.hasFooter ?? false },
                ]

                return (
                  <>
                    {/* Page Layout */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                        Page Layout
                      </h3>
                      <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5 space-y-2">
                        {hierarchy ? (
                          <>
                            {semanticElements.map((el) => (
                              <div key={el.tag} className="flex items-center gap-3 text-sm font-mono">
                                <span className="w-20 text-slate-600 dark:text-slate-300">{el.tag}</span>
                                {el.present ? (
                                  <span className="flex items-center gap-1.5 text-emerald-500">
                                    <Check size={14} strokeWidth={2.5} />
                                    Present{el.extra ? ` ${el.extra}` : ""}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-red-500">
                                    <X size={14} strokeWidth={2.5} />
                                    Not found
                                  </span>
                                )}
                              </div>
                            ))}
                            {hierarchy.hasBreadcrumb && (
                              <div className="flex items-center gap-1.5 text-sm text-emerald-500 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                                <Check size={14} strokeWidth={2.5} />
                                Breadcrumb navigation detected
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                            Page structure data is not available for this scan.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Sections found */}
                    {hierarchy?.sections && hierarchy.sections.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                          Sections Found
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5 space-y-1.5">
                          {hierarchy.sections.map((sec, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                &lt;{sec.tag}&gt;
                              </span>
                              {sec.id && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  id=&quot;{sec.id}&quot;
                                </span>
                              )}
                              {sec.ariaLabel && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  aria-label=&quot;{sec.ariaLabel}&quot;
                                </span>
                              )}
                              {!sec.id && !sec.ariaLabel && (
                                <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                                  (no identifier)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Navigation Map */}
                    {structure?.navigation && structure.navigation.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                          Navigation Map
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5">
                          <div className="space-y-1.5 max-h-80 overflow-y-auto">
                            {structure.navigation.map((link, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="text-slate-800 dark:text-slate-200 truncate flex-shrink-0 max-w-[200px]">
                                  {link.text || "(no text)"}
                                </span>
                                <span className="text-slate-400 dark:text-slate-500 truncate text-xs">
                                  {link.href}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Internal Links (top 20) */}
                    {structure?.internalLinks && structure.internalLinks.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                          Internal Links (top 20)
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-black/[0.06] dark:border-white/[0.06] text-left">
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">Link Text</th>
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">URL</th>
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {structure.internalLinks.slice(0, 20).map((link, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-black/[0.03] dark:border-white/[0.03] last:border-0"
                                >
                                  <td className="px-5 py-2 text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                                    {link.text || "(no text)"}
                                  </td>
                                  <td className="px-5 py-2 text-slate-500 dark:text-slate-400 truncate max-w-[280px] text-xs">
                                    {link.href}
                                  </td>
                                  <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-right tabular-nums">
                                    {link.count}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* External Links (top 20) */}
                    {structure?.externalLinks && structure.externalLinks.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                          External Links (top 20)
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-black/[0.06] dark:border-white/[0.06] text-left">
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">Link Text</th>
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">URL</th>
                                <th className="px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {structure.externalLinks.slice(0, 20).map((link, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-black/[0.03] dark:border-white/[0.03] last:border-0"
                                >
                                  <td className="px-5 py-2 text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                                    {link.text || "(no text)"}
                                  </td>
                                  <td className="px-5 py-2 text-slate-500 dark:text-slate-400 truncate max-w-[280px] text-xs">
                                    {link.href}
                                  </td>
                                  <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-right tabular-nums">
                                    {link.count}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Empty state if no structure data at all */}
                    {!structure && (
                      <div className="text-center py-16">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Site structure data is not available for this scan.
                        </p>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {resultTab === "history" && (
            <div>
              {/* Export buttons */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={exportJSON}
                  className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-4 text-left hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-white">
                    Export JSON
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Full report with all data
                  </div>
                </button>
                <button
                  onClick={copySummary}
                  className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-4 text-left hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-white flex items-center gap-1.5">
                    {copied ? "Copied!" : "Copy Summary"}
                    {copied && (
                      <Check size={14} className="text-emerald-500" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Quick text summary to clipboard
                  </div>
                </button>
              </div>

              {/* Recent scan history */}
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                Recent Scans
              </h3>
              {recentScans.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  No previous scans recorded.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentScans.map((scan) => (
                    <div
                      key={scan.url + scan.scannedAt}
                      className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl px-5 py-4 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {scan.url.replace(/^https?:\/\//, "")}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {new Date(scan.scannedAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}{" "}
                          &middot; {timeAgo(scan.scannedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {scan.errors > 0 && (
                          <span className="text-xs text-red-500">
                            {scan.errors} error{scan.errors !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span
                          className={`w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center ${
                            scan.score >= 90
                              ? "bg-emerald-500/10 text-emerald-500"
                              : scan.score >= 70
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          {scan.score}
                        </span>
                        <button
                          onClick={() => {
                            removeRecentScan(scan.url)
                            setRecentScans(loadRecentScans())
                          }}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove from history"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>{/* close main content */}
        </div>{/* close flex wrapper */}

      </div>
    )
  }

  // Fallback
  return null
}
