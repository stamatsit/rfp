import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Loader2,
  Check,
  X,
  ChevronDown,
  Info,
  AlertCircle,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { addCsrfHeader } from "@/lib/csrfToken"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeadingItem {
  level: number
  text: string
}

interface Violation {
  index: number
  type: "skip" | "missing-h1" | "no-headings"
  message: string
}

interface HeadingsResult {
  url: string
  headings: HeadingItem[]
  violations: Violation[]
  hasH1: boolean
  passed: boolean
}

// ---------------------------------------------------------------------------
// ScannerPortal
// ---------------------------------------------------------------------------

export function ScannerPortal() {
  const navigate = useNavigate()

  // Tile 1 — Accessibility
  const [a11yUrl, setA11yUrl] = useState("")

  // Tile 2 — Headings
  const [headingsUrl, setHeadingsUrl] = useState("")
  const [headingsLoading, setHeadingsLoading] = useState(false)
  const [headingsError, setHeadingsError] = useState<string | null>(null)
  const [headingsResult, setHeadingsResult] = useState<HeadingsResult | null>(null)
  const [treeExpanded, setTreeExpanded] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  // Refs
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipTriggerRef = useRef<HTMLButtonElement>(null)

  // ---------------------------------------------------------------------------
  // Tooltip: click-outside + Escape
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!tooltipOpen) return
    function handleClick(e: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        tooltipTriggerRef.current &&
        !tooltipTriggerRef.current.contains(e.target as Node)
      ) {
        setTooltipOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTooltipOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [tooltipOpen])

  // ---------------------------------------------------------------------------
  // Tile 1: navigate to existing scanner
  // ---------------------------------------------------------------------------
  const handleA11yScan = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const url = a11yUrl.trim()
      if (!url) return
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
      navigate(`/scanner/accessibility?url=${encodeURIComponent(normalized)}`)
    },
    [a11yUrl, navigate],
  )

  // ---------------------------------------------------------------------------
  // Tile 2: headings check
  // ---------------------------------------------------------------------------
  const handleHeadingsCheck = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      const url = headingsUrl.trim()
      if (!url) return

      setHeadingsLoading(true)
      setHeadingsError(null)
      setHeadingsResult(null)
      setTreeExpanded(false)
      setTooltipOpen(false)

      try {
        const headers = await addCsrfHeader({ "Content-Type": "application/json" })
        const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
        const res = await fetch("/api/scanner/headings", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ url: normalized }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || `Request failed (${res.status})`)
        }

        const data: HeadingsResult = await res.json()
        setHeadingsResult(data)
      } catch (err: any) {
        setHeadingsError(err?.message || "Something went wrong")
      } finally {
        setHeadingsLoading(false)
      }
    },
    [headingsUrl],
  )

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const violationIndices = new Set(
    (headingsResult?.violations ?? [])
      .filter((v) => v.type === "skip")
      .map((v) => v.index),
  )
  const violationMap = new Map(
    (headingsResult?.violations ?? [])
      .filter((v) => v.type === "skip")
      .map((v) => [v.index, v.message]),
  )
  const missingH1 = headingsResult?.violations.find((v) => v.type === "missing-h1")
  const noHeadings = headingsResult?.violations.find((v) => v.type === "no-headings")

  const totalIssueCount = headingsResult?.violations.length ?? 0

  // ---------------------------------------------------------------------------
  // Indent levels
  // ---------------------------------------------------------------------------
  const indentPx = (level: number) => (level - 1) * 22

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-slate-950 animate-in fade-in-0 duration-300">
      <AppHeader
        title="Scanner"
        breadcrumbs={[{ label: "Pick a check" }]}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Hero */}
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-blue-600 dark:text-blue-400 mb-3.5">
            Pick a check
          </p>
          <h1 className="text-[38px] font-bold tracking-[-0.028em] leading-[1.08] text-slate-900 dark:text-white">
            Two ways to scan a page.
          </h1>
          <p className="mt-3.5 text-[17px] text-slate-500 dark:text-slate-400 max-w-[32em] mx-auto leading-relaxed">
            A full accessibility audit when you need depth, or a fast heading-structure check when you just want the answer.
          </p>
        </div>

        {/* Two-tile grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* ============================================================
               TILE 1 — Accessibility Scan
             ============================================================ */}
          <div
            className={`bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-[22px] p-8 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg hover:border-black/[0.12] dark:hover:border-white/[0.12] ${
              headingsResult ? "opacity-55" : ""
            }`}
          >
            {/* Icon */}
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center mb-[22px]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="8" r="2" />
                <path d="M6 14s2 2 6 2 6-2 6-2" />
                <path d="M9 11l3 1 3-1" />
              </svg>
            </div>

            <h2 className="text-[22px] font-bold tracking-[-0.022em] text-slate-900 dark:text-white mb-1.5">
              Accessibility Scan
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-[1.55] mb-6">
              Full WCAG audit using axe-core. Returns category scores, every issue, and AI-assisted fixes.
            </p>

            <form onSubmit={handleA11yScan} className="flex gap-2">
              <input
                type="text"
                value={a11yUrl}
                onChange={(e) => setA11yUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 px-3.5 py-3 bg-[#fafafa] dark:bg-slate-800 border border-black/[0.08] dark:border-white/[0.08] rounded-[10px] text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:bg-white dark:focus-visible:bg-slate-900 dark:focus-visible:border-blue-500"
              />
              <button
                type="submit"
                disabled={!a11yUrl.trim()}
                className="px-[18px] py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold tracking-[-0.01em] rounded-[10px] transition-all duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
              >
                Scan
              </button>
            </form>
          </div>

          {/* ============================================================
               TILE 2 — Headings
             ============================================================ */}
          <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-[22px] p-8 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg hover:border-black/[0.12] dark:hover:border-white/[0.12]">
            {/* Icon */}
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-[22px]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M6 4v16" />
                <path d="M18 4v16" />
                <path d="M6 12h12" />
              </svg>
            </div>

            <h2 className="text-[22px] font-bold tracking-[-0.022em] text-slate-900 dark:text-white mb-1.5">
              Headings
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-[1.55] mb-6">
              Quick yes-or-no on whether the page's heading hierarchy is valid. The simplest check possible.
            </p>

            <form onSubmit={handleHeadingsCheck} className="flex gap-2">
              <input
                type="text"
                value={headingsUrl}
                onChange={(e) => setHeadingsUrl(e.target.value)}
                disabled={headingsLoading}
                placeholder="https://example.com"
                className="flex-1 px-3.5 py-3 bg-[#fafafa] dark:bg-slate-800 border border-black/[0.08] dark:border-white/[0.08] rounded-[10px] text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:bg-white dark:focus-visible:bg-slate-900 dark:focus-visible:border-blue-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!headingsUrl.trim() || headingsLoading}
                className="px-[18px] py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold tracking-[-0.01em] rounded-[10px] transition-all duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 inline-flex items-center gap-2"
              >
                {headingsLoading && <Loader2 size={14} className="animate-spin" />}
                {headingsResult ? "Re-check" : "Check"}
              </button>
            </form>

            {/* ----- Error ----- */}
            {headingsError && (
              <div className="mt-6 px-3.5 py-3 rounded-[10px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 flex items-start gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-[13px] text-red-700 dark:text-red-400 leading-relaxed">{headingsError}</p>
              </div>
            )}

            {/* ----- Result panel ----- */}
            {headingsResult && (
              <div className="mt-7 pt-7 border-t border-black/[0.06] dark:border-white/[0.08] animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                {/* Status row */}
                <div className="flex items-center gap-[18px] mb-1">
                  {/* Status icon */}
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${
                      headingsResult.passed
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.06)]"
                        : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 shadow-[0_0_0_6px_rgba(239,68,68,0.06)]"
                    }`}
                  >
                    {headingsResult.passed ? (
                      <Check size={32} strokeWidth={2.5} />
                    ) : (
                      <X size={32} strokeWidth={2.5} />
                    )}
                  </div>

                  {/* Status text */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[26px] font-bold tracking-[-0.025em] leading-[1.1] ${
                          headingsResult.passed
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {headingsResult.passed ? "Compliant" : "Not compliant"}
                      </span>

                      {/* (i) info trigger */}
                      <div className="relative">
                        <button
                          ref={tooltipTriggerRef}
                          onClick={() => setTooltipOpen((prev) => !prev)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setTooltipOpen((prev) => !prev)
                            }
                          }}
                          aria-label="How this is checked"
                          aria-expanded={tooltipOpen}
                          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 text-[11px] font-semibold transition-colors duration-150 hover:bg-black/[0.1] dark:hover:bg-white/[0.12] hover:text-slate-700 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                        >
                          <Info size={10} />
                        </button>

                        {/* Tooltip popover */}
                        {tooltipOpen && (
                          <div
                            ref={tooltipRef}
                            role="dialog"
                            aria-label="How heading order is checked"
                            className="absolute left-0 top-full mt-3 z-50 w-[440px] bg-[#0f172a] text-[#e2e8f0] rounded-[14px] p-[22px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.25)] text-[13px] leading-[1.6] animate-in fade-in-0 zoom-in-95 duration-200"
                          >
                            {/* Arrow */}
                            <div className="absolute -top-[7px] left-[24px] w-3.5 h-3.5 bg-[#0f172a] rotate-45" />

                            <h4 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-slate-400 mb-3">
                              How this is checked
                            </h4>

                            <h5 className="text-[13px] font-semibold text-white mb-1.5">The rule</h5>
                            <p className="text-[#cbd5e1]">
                              Each heading must satisfy{" "}
                              <code className="font-mono text-xs bg-white/[0.08] px-1.5 py-px rounded text-amber-300">
                                currentLevel &minus; previousLevel &le; 1
                              </code>
                              . This is the exact check axe-core applies.
                            </p>

                            <h5 className="text-[13px] font-semibold text-white mt-3.5 mb-1.5">What that means</h5>
                            <ul className="mt-2 pl-[18px] text-[#cbd5e1] list-disc space-y-0.5">
                              <li>Going deeper, levels can only increase by one (h1 &rarr; h2, never h1 &rarr; h3)</li>
                              <li>Going shallower is unrestricted (h4 &rarr; h2 or h4 &rarr; h1 is fine)</li>
                              <li>The first heading on the page is always allowed</li>
                              <li>The page must contain at least one h1 (separate rule)</li>
                            </ul>

                            <h5 className="text-[13px] font-semibold text-white mt-3.5 mb-1.5">Source</h5>
                            <p className="text-xs text-[#cbd5e1]">
                              Identical to the{" "}
                              <code className="font-mono text-xs bg-white/[0.08] px-1.5 py-px rounded text-amber-300">
                                heading-order
                              </code>{" "}
                              rule in axe-core, the engine used by Lighthouse, Deque, and most accessibility auditors.
                            </p>

                            <div className="mt-3.5 pt-3.5 border-t border-white/10 text-xs">
                              <a
                                href="https://dequeuniversity.com/rules/axe/4.10/heading-order"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 rounded"
                              >
                                axe-core heading-order &#x2197;
                              </a>
                              <span className="text-slate-600 mx-1.5">&middot;</span>
                              <a
                                href="https://www.w3.org/WAI/tutorials/page-structure/headings/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 rounded"
                              >
                                W3C WAI guidance &#x2197;
                              </a>
                              <span className="text-slate-600 mx-1.5">&middot;</span>
                              <a
                                href="https://github.com/dequelabs/axe-core/blob/develop/lib/checks/navigation/heading-order-after.js"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 rounded"
                              >
                                Source code &#x2197;
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Subtitle */}
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                      {noHeadings
                        ? "No headings found on this page"
                        : headingsResult.passed
                          ? `${headingsResult.headings.length} heading${headingsResult.headings.length !== 1 ? "s" : ""} checked · structure is valid`
                          : `${totalIssueCount} issue${totalIssueCount !== 1 ? "s" : ""} across ${headingsResult.headings.length} heading${headingsResult.headings.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>

                {/* View/Hide structure toggle */}
                {headingsResult.headings.length > 0 && (
                  <div className="mt-[22px] flex items-center gap-2.5">
                    <button
                      onClick={() => setTreeExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-[9px] bg-white dark:bg-slate-800 border border-black/[0.08] dark:border-white/[0.08] rounded-[9px] text-[13px] font-medium text-slate-900 dark:text-white transition-all duration-150 ease-out hover:bg-[#fafafa] dark:hover:bg-slate-700 hover:border-black/[0.12] dark:hover:border-white/[0.12] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${treeExpanded ? "rotate-180" : ""}`}
                      />
                      {treeExpanded ? "Hide structure" : "View structure"}
                    </button>
                  </div>
                )}

                {/* Heading tree */}
                {treeExpanded && headingsResult.headings.length > 0 && (
                  <div className="mt-[22px] p-[18px_20px] bg-[#fafafa] dark:bg-slate-800/50 border border-black/[0.06] dark:border-white/[0.06] rounded-xl animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                    <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-500 dark:text-slate-400 mb-3.5">
                      {headingsResult.passed
                        ? "Document order — indentation reflects level"
                        : "Document order — issues highlighted"}
                    </div>

                    {headingsResult.headings.map((h, i) => {
                      const isViolation = violationIndices.has(i)
                      const violationMsg = violationMap.get(i)
                      return (
                        <div key={i}>
                          <div
                            className={`grid grid-cols-[28px_1fr] gap-3 items-baseline py-1.5 font-mono text-[13px] ${
                              isViolation
                                ? "text-red-700 dark:text-red-400"
                                : ""
                            }`}
                            style={{ paddingLeft: `${indentPx(h.level)}px` }}
                          >
                            <span
                              className={`font-semibold ${
                                isViolation
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              h{h.level}
                            </span>
                            <span
                              className={
                                isViolation
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-slate-900 dark:text-white"
                              }
                            >
                              {h.text}
                            </span>
                          </div>
                          {isViolation && violationMsg && (
                            <div
                              className="ml-10 mt-1 mb-1 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 py-1.5 px-2.5 rounded-r-md font-sans"
                              style={{ marginLeft: `${indentPx(h.level) + 40}px` }}
                            >
                              {violationMsg}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Missing h1 banner */}
                {missingH1 && (
                  <div className="mt-3.5 px-3.5 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-[10px] text-[13px] text-red-700 dark:text-red-400 flex items-center gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                    <AlertCircle size={16} className="flex-shrink-0" />
                    {missingH1.message}
                  </div>
                )}

                {/* No headings banner */}
                {noHeadings && (
                  <div className="mt-3.5 px-3.5 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-[10px] text-[13px] text-red-700 dark:text-red-400 flex items-center gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                    <AlertCircle size={16} className="flex-shrink-0" />
                    {noHeadings.message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
