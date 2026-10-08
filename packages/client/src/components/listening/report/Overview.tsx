import { useState } from "react"
import { AlertTriangle, ChevronDown, Search } from "lucide-react"
import type { Report } from "@/types/listening"
import { Card, PLATFORM, SentimentBar, SentimentDot, fmtMonth, pct, plural, verdict } from "../ui"

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}

function MonthBars({ months }: { months: Report["months"] }) {
  const max = Math.max(1, ...months.map((m) => m.count))
  const total = months.reduce((s, m) => s + m.count, 0)
  if (total === 0) return <p className="text-[12.5px] text-slate-400">Most posts here carry no date.</p>
  return (
    <div>
      <div className="flex items-end gap-1 h-16" role="img" aria-label={`Posts per month: ${months.map((m) => `${fmtMonth(m.month)} ${m.count}`).join(", ")}`}>
        {months.map((m) => (
          <div key={m.month} className="flex-1 flex flex-col justify-end h-full" title={`${fmtMonth(m.month)}: ${m.count}`}>
            <div className="rounded-t-[3px] bg-sky-500/80 dark:bg-sky-400/70" style={{ height: `${m.count ? Math.max(6, (100 * m.count) / max) : 0}%` }} />
            {!m.count && <div className="h-[2px] rounded bg-slate-200 dark:bg-slate-700" />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-slate-400 mt-1.5">
        <span>{fmtMonth(months[0]!.month)}</span>
        <span>{fmtMonth(months[months.length - 1]!.month)}</span>
      </div>
    </div>
  )
}

export function Overview({ report, onSuggestion }: { report: Report; onSuggestion: (q: string) => void }) {
  const [showCoverage, setShowCoverage] = useState(false)
  const v = verdict(report.sentiment)
  const conv = report.totals.relevant
  const topPlatforms = report.platforms.slice(0, 5)
  const sources = report.platforms.length
  const failed = report.coverage.lanes.filter((l) => l.status === "failed")

  return (
    <section aria-labelledby="overview-title" className="space-y-4">
      <h2 id="overview-title" className="sr-only">Overview</h2>

      {report.thin && (
        <Card className="p-5 border-amber-200/80 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/[0.06]">
          <div className="flex gap-3">
            <Search size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14.5px] font-semibold text-slate-900 dark:text-white">
                {conv === 0 ? "No real conversation found yet" : `Only ${plural(conv, "relevant post")} so far`}
              </p>
              <p className="text-[13.5px] text-slate-600 dark:text-slate-300 mt-1">
                Specific names and narrow topics often have little public discussion. Rescan to dig deeper, or try a broader topic:
              </p>
              {report.broaderSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {report.broaderSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSuggestion(s)}
                      className="rounded-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 px-3 py-1 text-[13px] font-medium text-slate-700 dark:text-slate-200 hover:border-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 sm:p-7">
        <div className="grid gap-7 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2.5">What people are saying</p>
            <p className="text-[16.5px] leading-[1.6] text-slate-800 dark:text-slate-100 text-pretty">{report.summary}</p>
            {report.analysisSource === "partial" && (
              <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-3">The written analysis did not finish for this scan. Use Refresh analysis in the menu to try again.</p>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">Overall feeling</p>
                <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-800 dark:text-slate-100">
                  <SentimentDot tone={v.tone} />
                  {v.label}
                </span>
              </div>
              <SentimentBar s={report.sentiment} height={12} showLegend />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Stat value={conv.toLocaleString()} label="relevant posts" />
              <Stat value={String(sources)} label={sources === 1 ? "platform" : "platforms"} />
              <Stat value={report.totals.fullyRead.toLocaleString()} label="read in full" />
            </div>
          </div>
        </div>

        {conv > 0 && (
          <div className="grid gap-7 sm:grid-cols-2 mt-7 pt-6 border-t border-black/[0.05] dark:border-white/[0.06]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-3">Where the conversation is</p>
              <ul className="space-y-2">
                {topPlatforms.map((p) => (
                  <li key={p.platform} className="grid grid-cols-[88px_1fr_40px] items-center gap-3 text-[13px]">
                    <span className="text-slate-600 dark:text-slate-300 truncate">{PLATFORM[p.platform].label}</span>
                    <span className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct(p.count, conv))}%`, background: PLATFORM[p.platform].color }} />
                    </span>
                    <span className="text-right tabular-nums text-slate-500">{pct(p.count, conv)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-3">Posts by month</p>
              <MonthBars months={report.months} />
            </div>
          </div>
        )}
      </Card>

      {(report.coverage.degraded || report.warnings.length > 0) && (
        <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/[0.05] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCoverage((s) => !s)}
            className="w-full flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 rounded"
            aria-expanded={showCoverage}
          >
            <span className="flex items-center gap-2 text-[13.5px] text-amber-900 dark:text-amber-200">
              <AlertTriangle size={15} className="shrink-0" />
              {failed.length
                ? `Partial scan: ${failed.map((f) => f.label).join(", ")} did not answer. Everything shown is real; some voices may be missing.`
                : "A few notes about this scan"}
            </span>
            <ChevronDown size={16} className={`shrink-0 text-amber-700 transition-transform ${showCoverage ? "rotate-180" : ""}`} />
          </button>
          {showCoverage && (
            <ul className="mt-2.5 space-y-1 text-[13px] text-amber-900/90 dark:text-amber-200/90 list-disc pl-6">
              {[...report.coverage.notes, ...report.warnings].map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
