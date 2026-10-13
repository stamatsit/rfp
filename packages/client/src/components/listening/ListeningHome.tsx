import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Ban, ChevronDown, Loader2, Radar, Search, X } from "lucide-react"
import { listeningApi } from "@/lib/listeningApi"
import type { AccessInfo, TimeWindow, TopicRow, Usage } from "@/types/listening"
import { excludeProblem, parseExclusions } from "./exclude"
import { TopicLibrary } from "./TopicLibrary"
import { ACCENT, WINDOW_OPTIONS, fmtClock, personName, plural } from "./ui"

const EXAMPLES = ["online nursing degrees", "college enrollment trends", "FAFSA changes", "Coe College"]

/** Today as the browser sees it, YYYY-MM-DD, for the date fields' upper bound. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Why a custom range cannot be scanned yet, or null when it can. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return "Choose a start date and an end date."
  if (from > to) return "The start date must be on or before the end date."
  if (from > today()) return "The start date cannot be in the future."
  if (from < "2005-01-01") return "Choose a start date in 2005 or later."
  return null
}

const TRIGGER_LABEL = { initial: "new scan", rescan: "rescan", rebuild: "refresh" } as const

/**
 * Who has used the shared search allowance: today's scans and a seven-day
 * tally, loaded when opened. Teammates' private topic names stay hidden.
 */
function UsagePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Usage | null>(null)
  const [failed, setFailed] = useState(false)
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (!next) return
    setFailed(false)
    listeningApi
      .usage()
      .then(setData)
      .catch(() => setFailed(true))
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="usage-panel"
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-sky-700 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
      >
        Who has scanned? <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id="usage-panel" className="mt-3 mx-auto max-w-xl text-left rounded-2xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] p-4 sm:p-5">
          {failed ? (
            <p className="text-[13px] text-slate-500">Could not load usage. Close and open this again to retry.</p>
          ) : !data ? (
            <div className="shimmer h-24 rounded-xl" aria-busy="true" aria-label="Loading usage" />
          ) : (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">Today</p>
              <p className="text-[13.5px] text-slate-700 dark:text-slate-200 mt-1.5">
                <b className="font-semibold tabular-nums">{data.budget.used}</b> of {data.budget.limit} searches used, about {plural(data.budget.scansLeft, "scan")} left. Resets at {fmtClock(data.budget.resetsAt)}.
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="img" aria-label={`${data.budget.used} of ${data.budget.limit} searches used today`}>
                <div className={`h-full rounded-full ${data.budget.scansLeft <= 1 ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${Math.min(100, Math.round((100 * data.budget.used) / Math.max(1, data.budget.limit)))}%` }} />
              </div>
              {data.today.length === 0 ? (
                <p className="text-[13px] text-slate-500 mt-3">No one has scanned yet today.</p>
              ) : (
                <ul className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {data.today.map((s) => (
                    <li key={`${s.who}-${s.startedAt}`} className="py-2 flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{personName(s.who)}</span>
                        <span className="text-slate-500">
                          {" "}
                          · {TRIGGER_LABEL[s.trigger]}
                          {s.status === "running" ? ", running now" : s.status === "failed" ? ", did not finish" : s.status === "cancelled" ? ", cancelled" : ""}
                        </span>
                        <span className="block text-slate-500 truncate">
                          {s.topic && s.topicId ? (
                            <Link to={`/listening/${s.topicId}`} className="hover:text-sky-700 dark:hover:text-sky-400 hover:underline">
                              {s.topic}
                            </Link>
                          ) : (
                            "a private topic"
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-slate-500 tabular-nums">
                        {fmtClock(s.startedAt)}
                        <span className="block text-[12px] text-slate-400">{plural(s.searchCalls, "search", "searches")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mt-4">Last 7 days</p>
              {data.week.length === 0 ? (
                <p className="text-[13px] text-slate-500 mt-1.5">No scans in the last 7 days.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.week.map((w) => (
                    <li key={w.who} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[12.5px] text-slate-700 dark:text-slate-200">
                      {personName(w.who)} <span className="text-slate-500 tabular-nums">{plural(w.scans, "scan")}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] leading-relaxed text-slate-400 mt-4">
                Everyone shares one daily allowance. A new scan or a rescan uses about 17 to 24 searches. Refresh analysis and exports use none.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function ListeningHome({
  access,
  topics,
  shared = [],
  team = null,
  ideaCount = null,
  loading,
  starting,
  startError,
  initialQuery,
  initialExclude = "",
  onScan,
  onEdit,
}: {
  access: AccessInfo | null
  topics: TopicRow[] | null
  /** Topics teammates shared: read and export only. */
  shared?: TopicRow[]
  /** Everyone's topics, when you see every topic (team visibility, or an admin). Replaces `shared` when present. */
  team?: TopicRow[] | null
  /** Ideas on your board, or null if unknown. */
  ideaCount?: number | null
  loading: boolean
  starting: boolean
  startError: string | null
  initialQuery: string
  /** Words to leave out, comma separated, when the form is opened from a topic that had some. */
  initialExclude?: string
  onScan: (query: string, tw: TimeWindow, range?: { from: string; to: string }, exclude?: string[]) => void
  onEdit?: () => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [tw, setTw] = useState<TimeWindow>("1y")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const custom = tw === "custom"
  const rangeError = custom ? rangeProblem(from, to) : null
  // Words to leave out of this topic's scans.
  const [leave, setLeave] = useState(initialExclude)
  const [leaveOpen, setLeaveOpen] = useState(initialExclude.trim() !== "")
  const leaveInput = useRef<HTMLInputElement>(null)
  const leaveList = leaveOpen ? parseExclusions(leave) : []
  const leaveError = leaveList.length ? excludeProblem(leaveList, q) : null
  const input = useRef<HTMLInputElement>(null)
  const now = Date.now()

  useEffect(() => {
    setQ(initialQuery)
    input.current?.focus()
  }, [initialQuery])
  useEffect(() => {
    setLeave(initialExclude)
    setLeaveOpen(initialExclude.trim() !== "")
  }, [initialExclude])

  const teamView = access?.visibility === "team"
  const budget = access?.budget
  const backup = !!access?.sources.serper
  const low = budget && !backup ? budget.scansLeft <= 1 : false
  const out = budget && !backup ? budget.scansLeft === 0 : false
  const missing = access && (!access.sources.model || (!access.sources.search && !access.sources.youtube))
  const canScan = q.trim().length >= 2 && !starting && !out && !missing && !rangeError && !leaveError

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (canScan) onScan(q.trim(), tw, custom ? { from, to } : undefined, leaveList)
  }

  return (
    <div>
      <section className="max-w-3xl mx-auto text-center pt-6 sm:pt-12 pb-10">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white shadow-sm" style={{ background: ACCENT }}>
          <Radar size={22} />
        </span>
        <h1 className="text-[30px] sm:text-[36px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white mt-5">Topic Ideation</h1>
        <p className="text-[15.5px] text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto text-balance">
          See what people are saying about any topic or institution, then turn it into content ideas you can back up.
        </p>

        <form onSubmit={submit} className="mt-8 text-left" role="search">
          <div className="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] shadow-[0_2px_10px_rgba(15,23,42,0.05)] p-2 focus-within:border-sky-400 focus-within:shadow-[0_0_0_4px_rgba(14,165,233,0.12)] transition-all">
            <label className="relative flex-1">
              <span className="sr-only">Topic or institution</span>
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  onEdit?.()
                }}
                maxLength={140}
                placeholder="A topic, or a school or hospital by name"
                className="w-full h-12 bg-transparent pl-11 pr-3 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            <div className="flex gap-2">
              <label className="relative">
                <span className="sr-only">Time range</span>
                <select
                  value={tw}
                  onChange={(e) => setTw(e.target.value as TimeWindow)}
                  className="h-12 appearance-none rounded-xl bg-slate-50 dark:bg-slate-800 pl-3.5 pr-9 text-[14px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 cursor-pointer"
                >
                  {WINDOW_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 border-x-[4px] border-x-transparent border-t-[5px] border-t-slate-400" />
              </label>
              <button
                type="submit"
                disabled={!canScan}
                className="h-12 flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
                style={{ background: ACCENT }}
              >
                {starting ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none" /> : <ArrowRight size={17} />}
                {starting ? "Starting" : "Scan"}
              </button>
            </div>
          </div>
          {custom && (
            <div className="mt-3 rounded-2xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] px-4 py-3">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <label className="flex flex-col gap-1 text-[12px] font-medium text-slate-500">
                  From
                  <input
                    type="date"
                    value={from}
                    min="2005-01-01"
                    max={to || today()}
                    onChange={(e) => {
                      setFrom(e.target.value)
                      onEdit?.()
                    }}
                    className="h-10 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 px-3 text-[14px] text-slate-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-medium text-slate-500">
                  To
                  <input
                    type="date"
                    value={to}
                    min={from || "2005-01-01"}
                    max={today()}
                    onChange={(e) => {
                      setTo(e.target.value)
                      onEdit?.()
                    }}
                    className="h-10 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 px-3 text-[14px] text-slate-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                  />
                </label>
                <p className={`text-[12.5px] pb-2.5 ${rangeError && (from || to) ? "text-amber-700 dark:text-amber-400" : "text-slate-400"}`} aria-live="polite">
                  {rangeError && (from || to) ? rangeError : "Only posts dated inside these dates are kept."}
                </p>
              </div>
            </div>
          )}
          {leaveOpen ? (
            <div className="mt-3 rounded-2xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] px-4 py-3">
              <div className="flex items-end gap-2">
                <label className="flex-1 min-w-0 flex flex-col gap-1 text-[12px] font-medium text-slate-500">
                  Leave out
                  <input
                    ref={leaveInput}
                    value={leave}
                    onChange={(e) => {
                      setLeave(e.target.value)
                      onEdit?.()
                    }}
                    maxLength={400}
                    autoComplete="off"
                    placeholder="Words or phrases, separated by commas"
                    className="h-10 w-full rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 px-3 text-[14px] font-normal text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLeave("")
                    setLeaveOpen(false)
                    onEdit?.()
                  }}
                  aria-label="Stop leaving words out"
                  title="Stop leaving words out"
                  className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  <X size={16} />
                </button>
              </div>
              <p className={`mt-2 text-[12.5px] leading-relaxed ${leaveError ? "text-amber-700 dark:text-amber-400" : "text-slate-400"}`} aria-live="polite">
                {leaveError ??
                  (leaveList.length
                    ? `Leaving out ${leaveList.join(", ")}. Posts that mention ${leaveList.length === 1 ? "it" : "any of them"} are not collected or counted.`
                    : "Posts that mention any of these are not collected or counted. For example: sports, rankings.")}
              </p>
            </div>
          ) : (
            <div className="mt-2.5 pl-1">
              <button
                type="button"
                onClick={() => {
                  setLeaveOpen(true)
                  window.setTimeout(() => leaveInput.current?.focus(), 0)
                }}
                className="inline-flex items-center gap-1.5 rounded text-[12.5px] font-medium text-slate-500 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
              >
                <Ban size={13} /> Leave out words
              </button>
            </div>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-[12.5px] text-slate-400">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex)
                input.current?.focus()
              }}
              className="rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white/70 dark:bg-slate-900/70 px-3 py-1 text-[12.5px] text-slate-600 dark:text-slate-300 hover:border-sky-300 hover:text-sky-700 dark:hover:text-sky-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="mt-5 min-h-[20px] text-[12.5px]" aria-live="polite">
          {startError ? (
            <p className="text-rose-600 dark:text-rose-400">{startError}</p>
          ) : missing ? (
            <p className="text-amber-700 dark:text-amber-400">Search is not configured on this server yet.</p>
          ) : budget && backup ? (
            <p className="text-slate-400">
              {budget.scansLeft > 0
                ? `About ${plural(budget.scansLeft, "free scan")} left today, then scans use Serper. A scan takes 2 to 3 minutes.`
                : "Today's free Google searches are used up, so scans use Serper. A scan takes 2 to 3 minutes."}
            </p>
          ) : budget ? (
            <p className={out ? "text-rose-600 dark:text-rose-400" : low ? "text-amber-700 dark:text-amber-400" : "text-slate-400"}>
              {out
                ? `Today's Google search allowance is used up. It resets at ${fmtClock(budget.resetsAt)}.`
                : `About ${plural(budget.scansLeft, "scan")} left today. A scan takes 2 to 3 minutes; broader topics find more.`}
            </p>
          ) : null}
        </div>
        {budget && !missing && <UsagePanel />}
      </section>

      <TopicLibrary topics={topics} shared={shared} team={team} teamView={teamView} ideaCount={ideaCount} loading={loading} now={now} />
    </div>
  )
}
