import { useState, type ReactNode } from "react"
import { AlertTriangle, ArrowRight, ChevronDown, RotateCcw, Search } from "lucide-react"
import type { ItemView, Report } from "@/types/listening"
import { Card, PLATFORM, SentimentBar, SentimentDot, exclusionParts, fmtMonth, isLegacyReport, joinList, pct, sampleLabel, verdict } from "../ui"
import { Button, ring, tone } from "../primitives"
import { TopIdeas } from "./Ideas"
import { TopQuestions } from "./Questions"
import { TopQuotes } from "./Quotes"
import { News, OwnVoice, SubtopicBars } from "./Subtopics"

export type ReportTab = "overview" | "ideas" | "questions" | "quotes" | "subtopics" | "sources"

/** "All 8 ideas", or "See the idea" when there is one. */
const allOf = (n: number, one: string, many: string) => (n === 1 ? `See the ${one}` : `All ${n} ${many}`)

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[24px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white tabular-nums leading-none">{value}</p>
      <p className={`text-[12.5px] mt-1.5 ${tone.muted}`}>{label}</p>
    </div>
  )
}

function MonthBars({ months }: { months: Report["months"] }) {
  const max = Math.max(1, ...months.map((m) => m.count))
  const total = months.reduce((s, m) => s + m.count, 0)
  if (total === 0) return <p className={`text-[12.5px] ${tone.muted}`}>Most posts here carry no date.</p>
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
      <div className={`flex justify-between text-[11px] mt-1.5 ${tone.muted}`}>
        <span>{fmtMonth(months[0]!.month)}</span>
        <span>{fmtMonth(months[months.length - 1]!.month)}</span>
      </div>
    </div>
  )
}

/** A block of the overview with a "See all" that opens its tab. */
function Digest({ title, count, onAll, allLabel, children, className = "" }: { title: string; count?: number; onAll?: () => void; allLabel?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-5 sm:p-6 flex flex-col ${className}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3.5">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
          {title}
          {count !== undefined && count > 0 && <span className={`ml-1.5 font-medium tabular-nums ${tone.muted}`}>{count}</span>}
        </h3>
        {onAll && (
          <button type="button" onClick={onAll} className={`shrink-0 inline-flex items-center gap-1 text-[13px] rounded ${tone.link} ${ring}`}>
            {allLabel ?? "See all"} <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  )
}

export function Overview({
  report,
  items,
  onSuggestion,
  onShowNotCounted,
  onShowOwn,
  onRefresh,
  busy,
  canWiden,
  onTab,
  onOpenIdea,
  onOpenSubtopic,
}: {
  report: Report
  items: ItemView[]
  onSuggestion: (q: string) => void
  onShowNotCounted: () => void
  onShowOwn: () => void
  /** Absent for someone reading another person's topic: only its owner can refresh it. */
  onRefresh?: () => void
  busy: boolean
  /** The topic's time range is shorter than "any time". */
  canWiden: boolean
  onTab: (tab: ReportTab) => void
  onOpenIdea: (id: string) => void
  onOpenSubtopic: (id: string) => void
}) {
  const [showCoverage, setShowCoverage] = useState(false)
  const v = verdict(report.sentiment)
  const conv = report.totals.relevant
  const topPlatforms = report.platforms.slice(0, 5)
  const platformCount = report.platforms.length
  const failed = report.coverage.lanes.filter((l) => l.status === "failed")
  const legacy = isLegacyReport(report)
  const notCounted = exclusionParts(report)
  const x = report.totals.excluded
  const mostlyOwn = !!report.ownVoice && !!x && x.self + x.mentions > conv
  // Threads and pages opened in full, not the replies that came with them.
  const threadsRead = items.filter((i) => i.depth === "full" && i.kind !== "comment").length
  const hasOwn = !!report.ownVoice?.posts.length
  const hasNews = report.news.length > 0

  return (
    <section aria-labelledby="overview-title" className="space-y-4">
      <h2 id="overview-title" className="sr-only">
        Overview
      </h2>

      {legacy && (
        <Card className="p-5 border-sky-200/80 dark:border-sky-500/20 bg-sky-50/60 dark:bg-sky-500/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-slate-900 dark:text-white">This report was made before the accuracy update</p>
              <p className="text-[13.5px] text-slate-700 dark:text-slate-300 mt-1">
                It counted every relevant post as public conversation, including passing mentions and posts from organizations&apos; own accounts.{" "}
                {onRefresh ? "Refresh to recount it from what was already collected. No new searches are used." : "Its owner can refresh it to recount."}
              </p>
            </div>
            {onRefresh && (
              <Button variant="primary" onClick={onRefresh} disabled={busy}>
                <RotateCcw size={15} />
                Refresh analysis
              </Button>
            )}
          </div>
        </Card>
      )}

      {report.thin && (
        <Card className="p-5 border-amber-200/80 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/[0.06]">
          <div className="flex gap-3">
            <Search size={18} aria-hidden className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14.5px] font-semibold text-slate-900 dark:text-white">{conv === 0 ? "No posts by people about this yet" : `Only ${sampleLabel(report, conv)} so far`}</p>
              <p className="text-[13.5px] text-slate-700 dark:text-slate-300 mt-1">
                {mostlyOwn
                  ? `Most of what turned up was posted by ${report.ownVoice!.name} itself or mentions it only in passing. `
                  : "Specific names and narrow topics often have little public discussion. "}
                {canWiden ? "Rescan to dig deeper, search again over a longer time range, or try a broader topic:" : "Rescan to dig deeper, or try a broader topic:"}
              </p>
              {report.broaderSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {report.broaderSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSuggestion(s)}
                      className="rounded-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/30 px-3 py-1 text-[13px] font-medium text-slate-800 dark:text-slate-200 hover:border-amber-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
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
        <div className="grid gap-7 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
          <div>
            <p className={`${tone.label} mb-2.5`}>What people are saying</p>
            <p className="text-[17px] leading-[1.6] text-slate-900 dark:text-slate-100 text-pretty">{report.summary}</p>
            {report.analysisSource === "partial" && (
              <p className="text-[12.5px] text-amber-800 dark:text-amber-400 mt-3">The written analysis did not finish for this scan. Use Update, then Rewrite the analysis, to try again.</p>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-2.5">
                <p className={tone.label}>Overall feeling</p>
                <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                  <SentimentDot tone={v.tone} />
                  {v.label}
                </span>
              </div>
              <SentimentBar s={report.sentiment} height={12} showLegend />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Stat value={conv.toLocaleString()} label={legacy ? "relevant posts" : conv === 1 ? "post by people" : "posts by people"} />
              <Stat value={String(platformCount)} label={platformCount === 1 ? "platform" : "platforms"} />
              <Stat value={threadsRead.toLocaleString()} label={threadsRead === 1 ? "thread read in full" : "threads read in full"} />
            </div>
            {notCounted.length > 0 && (
              <p className={`text-[12.5px] leading-relaxed ${tone.muted}`}>
                Not counted: {joinList(notCounted)}.{" "}
                <button type="button" onClick={onShowNotCounted} className={`rounded ${tone.link} ${ring}`}>
                  See them
                </button>
              </p>
            )}
          </div>
        </div>
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
              <AlertTriangle size={15} aria-hidden className="shrink-0" />
              {failed.length ? `Partial scan: ${failed.map((f) => f.label).join(", ")} did not answer. Everything shown is real; some voices may be missing.` : "A few notes about this scan"}
            </span>
            <ChevronDown size={16} aria-hidden className={`shrink-0 text-amber-800 transition-transform ${showCoverage ? "rotate-180" : ""}`} />
          </button>
          {showCoverage && (
            <ul className="mt-2.5 space-y-1 text-[13px] text-amber-900 dark:text-amber-200/90 list-disc pl-6">
              {[...report.coverage.notes, ...report.warnings].map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Digest title="Top content ideas" count={report.ideas.length} onAll={report.ideas.length > 0 ? () => onTab("ideas") : undefined} allLabel={allOf(report.ideas.length, "idea", "ideas")}>
          {report.ideas.length ? <TopIdeas report={report} onOpen={onOpenIdea} /> : <p className={`text-[13.5px] ${tone.body}`}>No idea had at least two posts that clearly back it up yet.</p>}
        </Digest>
        <Digest title="Questions people ask" count={report.questions.length} onAll={report.questions.length > 0 ? () => onTab("questions") : undefined} allLabel={allOf(report.questions.length, "question", "questions")}>
          {report.questions.length ? <TopQuestions report={report} /> : <p className={`text-[13.5px] ${tone.body}`}>No direct questions found yet. A rescan often surfaces them.</p>}
        </Digest>
      </div>

      {report.quotes.length > 0 && (
        <Digest title="In their words" count={report.quotes.length} onAll={() => onTab("quotes")} allLabel={allOf(report.quotes.length, "quote", "quotes")}>
          <TopQuotes report={report} />
        </Digest>
      )}

      {conv > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.subtopics.length > 0 && (
            <Digest title="Subtopics" count={report.subtopics.length} onAll={() => onTab("subtopics")} allLabel="Open subtopics">
              <SubtopicBars report={report} onOpen={onOpenSubtopic} />
            </Digest>
          )}
          <Card className={`p-5 sm:p-6 ${report.subtopics.length ? "" : "lg:col-span-2"}`}>
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-3.5">Where our sample came from</h3>
            <ul className="space-y-2">
              {topPlatforms.map((p) => (
                <li key={p.platform} className="grid grid-cols-[84px_1fr_40px] items-center gap-3 text-[13px]">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{PLATFORM[p.platform].label}</span>
                  <span className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct(p.count, conv))}%`, background: PLATFORM[p.platform].color }} />
                  </span>
                  <span className={`text-right tabular-nums ${tone.muted}`}>{pct(p.count, conv)}%</span>
                </li>
              ))}
            </ul>
            <p className={`text-[12px] leading-relaxed mt-3 ${tone.muted}`}>The platforms this tool can read. Not a measure of where all the conversation happens.</p>
            <p className={`${tone.label} mt-5 mb-2.5`}>Posts by month</p>
            <MonthBars months={report.months} />
          </Card>
        </div>
      )}

      {(hasOwn || hasNews) && (
        <div className={`grid gap-4 ${hasOwn && hasNews ? "lg:grid-cols-2" : ""}`}>
          {hasOwn && <OwnVoice report={report} onShowAll={onShowOwn} limit={4} />}
          {hasNews && <News report={report} limit={4} />}
        </div>
      )}
    </section>
  )
}
