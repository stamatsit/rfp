import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Printer } from "lucide-react"

// ---------------------------------------------------------------------------
// Types (mirrored from URLScanner — sessionStorage data shape)
// ---------------------------------------------------------------------------

interface CategoryScore {
  category: string
  score: number
  errors: number
  warnings: number
  infos: number
}

interface ScanIssue {
  ruleId: string
  category: string
  severity: "error" | "warning" | "info"
  message: string
  element?: string
  selector?: string
  line?: number
  suggestion?: string
  wcagCriteria?: string
  wcagLevel?: string
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
  headingTree: unknown[]
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
  securityHeaders?: {
    grade: string
    headers: Record<string, { present: boolean; value?: string }>
  }
  siteStructure?: unknown
}

interface SnapshotData {
  report: ScanReport
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 90) return "hsl(152 69% 41%)"
  if (score >= 70) return "hsl(38 92% 50%)"
  return "hsl(0 84% 60%)"
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Healthy"
  if (score >= 70) return "Needs work"
  return "Poor"
}

function scoreLabelClass(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 70) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins === 1) return "1 minute ago"
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs === 1) return "1 hour ago"
  if (hrs < 24) return `${hrs} hours ago`
  return formatDate(iso)
}

function buildNarrative(report: ScanReport): string {
  const score = report.overallScore
  const errors = report.issues.filter((i) => i.severity === "error").length
  const warnings = report.issues.filter((i) => i.severity === "warning").length
  const affectedCategories = new Set(report.issues.map((i) => i.category)).size

  if (score >= 90) {
    return `This site has a strong accessibility foundation with ${errors > 0 ? `${errors} minor issue${errors !== 1 ? "s" : ""}` : "no errors"} identified across ${affectedCategories} ${affectedCategories === 1 ? "category" : "categories"}. ${warnings > 0 ? `${warnings} warning${warnings !== 1 ? "s" : ""} were flagged for review.` : "No warnings were flagged."} Continue monitoring to maintain this level of compliance.`
  }
  if (score >= 70) {
    return `This site is generally accessible but needs attention on ${errors} error${errors !== 1 ? "s" : ""} and ${warnings} warning${warnings !== 1 ? "s" : ""} to reach top-tier compliance. Issues span ${affectedCategories} ${affectedCategories === 1 ? "category" : "categories"} — addressing the errors first will have the highest impact on overall score.`
  }
  return `This site has significant accessibility gaps. ${errors} error${errors !== 1 ? "s" : ""} and ${warnings} warning${warnings !== 1 ? "s" : ""} are blocking users with disabilities from key content. Issues affect ${affectedCategories} ${affectedCategories === 1 ? "category" : "categories"} — a focused remediation effort is recommended.`
}

// ---------------------------------------------------------------------------
// ScoreRing — copied from URLScanner.tsx with size customization
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 200 }: { score: number; size?: number }) {
  const r = size / 2 - 12
  const circumference = 2 * Math.PI * r
  const [animatedScore, setAnimatedScore] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    const duration = 1000
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(score * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [score])

  const offset = mounted
    ? circumference - (score / 100) * circumference
    : circumference
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
          strokeWidth={9}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.25,0.46,0.45,0.94)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-extrabold text-slate-900 dark:text-white">
          {animatedScore}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AccessibilitySnapshot() {
  const navigate = useNavigate()
  const [data, setData] = useState<SnapshotData | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("accessibility-snapshot-data")
      if (raw) {
        setData(JSON.parse(raw))
      } else {
        setRedirecting(true)
        setTimeout(() => navigate("/scanner", { replace: true }), 1500)
      }
    } catch {
      setRedirecting(true)
      setTimeout(() => navigate("/scanner", { replace: true }), 1500)
    }
  }, [navigate])

  // Inject print stylesheet on mount, remove on unmount
  useEffect(() => {
    const style = document.createElement("style")
    style.setAttribute("data-snapshot-print-style", "true")
    style.textContent = `
      @media print {
        @page { size: 8.5in 11in; margin: 0.5in; }
        body { background: white !important; }
        [data-snapshot-no-print] { display: none !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .snapshot-hero, .snapshot-tiles, .snapshot-body { page-break-inside: avoid; }
        /* Hide NavRail and other app chrome */
        nav, .pl-14 { padding-left: 0 !important; }
      }
    `
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  if (redirecting) {
    return (
      <div className="min-h-screen bg-[#fafbfc] dark:bg-[hsl(224,20%,8%)] flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No snapshot data found. Redirecting to scanner...
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#fafbfc] dark:bg-[hsl(224,20%,8%)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { report } = data

  // Category tiles — exact math from URLScanner.tsx
  const getScore = (cat: string) =>
    report.categoryScores.find((c) => c.category === cat)?.score ?? 100
  const tiles = [
    { label: "Accessibility", score: Math.round((getScore("images") + getScore("contrast") + getScore("forms") + getScore("landmarks")) / 4) },
    { label: "Structure", score: Math.round((getScore("headings") + getScore("structure")) / 2) },
    { label: "Security", score: getScore("security") },
  ]

  // Top 3 priorities: errors first, then warnings
  const errors = report.issues.filter((i) => i.severity === "error")
  const warnings = report.issues.filter((i) => i.severity === "warning")
  const priorityPool = [...errors, ...warnings]
  const priorities = priorityPool.slice(0, 3)

  const narrative = buildNarrative(report)

  return (
    <div className="min-h-screen bg-[#fafbfc] dark:bg-[hsl(224,20%,8%)] flex flex-col animate-in fade-in-0 duration-300">
      {/* ----------------------------------------------------------------- */}
      {/* Top bar                                                           */}
      {/* ----------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-6 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-b border-black/[0.06] dark:border-white/[0.08]">
        <img
          src="/stamats-logo.png"
          alt="Stamats"
          className="h-6"
        />
        <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 hidden sm:block">
          Accessibility Snapshot
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          {formatDate(report.scannedAt)}
        </span>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ----------------------------------------------------------------- */}
      <section className="snapshot-hero flex flex-col items-center pt-8 pb-6 px-4">
        <p className="text-lg font-mono text-slate-500 dark:text-slate-400 mb-6 text-center break-all max-w-xl">
          {report.url}
        </p>
        <ScoreRing score={report.overallScore} size={200} />
        <p className={`mt-4 text-2xl font-semibold ${scoreLabelClass(report.overallScore)}`}>
          {scoreLabel(report.overallScore)}
        </p>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Category Tiles                                                    */}
      {/* ----------------------------------------------------------------- */}
      <section className="snapshot-tiles px-6 pb-6 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-3">
          {tiles.map((t) => {
            const color = scoreColor(t.score)
            return (
              <div
                key={t.label}
                className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 text-center"
              >
                <div
                  className="text-[32px] font-semibold leading-tight mb-1"
                  style={{ color }}
                >
                  {t.score}
                </div>
                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 mb-3">
                  {t.label}
                </div>
                <div className="h-[5px] rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${t.score}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Two-column body                                                   */}
      {/* ----------------------------------------------------------------- */}
      <section className="snapshot-body flex-1 px-6 pb-8 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-8">
          {/* Left column — Executive Summary */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400 mb-3">
              Executive Summary
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {narrative}
            </p>
          </div>

          {/* Right column — Top 3 Priorities */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400 mb-3">
              Top 3 Priorities
            </h2>
            <div className="space-y-3">
              {priorities.map((issue, idx) => (
                <div
                  key={`${issue.ruleId}-${idx}`}
                  className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 flex items-start gap-3"
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                      {issue.message}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {issue.category} &middot; {issue.ruleId}
                    </p>
                  </div>
                </div>
              ))}
              {priorities.length < 3 && (
                <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 text-sm text-slate-500 dark:text-slate-400">
                  No additional priorities — keep an eye on warnings as you continue improving.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Footer                                                            */}
      {/* ----------------------------------------------------------------- */}
      <footer className="sticky bottom-0 z-40 flex items-center justify-between h-16 px-6 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-t border-black/[0.06] dark:border-white/[0.08]">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Prepared by Stamats
          <span className="mx-2 text-slate-300 dark:text-slate-700">&middot;</span>
          scanned {relativeTime(report.scannedAt)}
        </span>
        <div className="flex items-center gap-2" data-snapshot-no-print>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 border border-black/[0.06] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 active:scale-[0.97]"
          >
            <ArrowLeft size={14} />
            Back to full results
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all duration-150 active:scale-[0.97]"
          >
            <Printer size={14} />
            Print / Save as PDF
          </button>
        </div>
      </footer>
    </div>
  )
}

export default AccessibilitySnapshot
