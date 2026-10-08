import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Loader2, Radar, Search } from "lucide-react"
import type { AccessInfo, TimeWindow, TopicRow } from "@/types/listening"
import { ACCENT, Card, SentimentPill, fmtClock, plural, timeAgo } from "./ui"

const EXAMPLES = ["online nursing degrees", "college enrollment trends", "FAFSA changes", "Coe College"]

const WINDOWS: Array<[TimeWindow, string]> = [
  ["1y", "Past year"],
  ["3m", "Past 3 months"],
  ["any", "Any time"],
]

function TopicCard({ t, now }: { t: TopicRow; now: number }) {
  const running = t.lastRunStatus === "running"
  const failed = !running && (t.lastRunStatus === "failed" || t.lastRunStatus === "cancelled") && !t.headline
  return (
    <Link
      to={`/listening/${t.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded-2xl"
    >
      <Card className="h-full p-5 flex flex-col group-hover:border-black/[0.12] dark:group-hover:border-white/[0.16] group-hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all">
        <h3 className="text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-white line-clamp-2">{t.query}</h3>
        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-3">
          {t.headline ?? (running ? "First scan in progress..." : failed ? "The last scan did not finish. Open to try again." : "No results yet.")}
        </p>
        <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[12px] text-slate-500">
          {running ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> Scanning
            </span>
          ) : failed ? (
            <span className="font-medium text-rose-600 dark:text-rose-400">Did not finish</span>
          ) : (
            <span className="flex items-center gap-3">
              <SentimentPill score={t.sentimentScore} />
              <span className="tabular-nums">{plural(t.relevantCount, "post")}</span>
            </span>
          )}
          <span className="shrink-0">{timeAgo(t.lastRunAt ?? t.updatedAt, now)}</span>
        </div>
      </Card>
    </Link>
  )
}

export function ListeningHome({
  access,
  topics,
  loading,
  starting,
  startError,
  initialQuery,
  onScan,
  onEdit,
}: {
  access: AccessInfo | null
  topics: TopicRow[] | null
  loading: boolean
  starting: boolean
  startError: string | null
  initialQuery: string
  onScan: (query: string, tw: TimeWindow) => void
  onEdit?: () => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [tw, setTw] = useState<TimeWindow>("1y")
  const input = useRef<HTMLInputElement>(null)
  const now = Date.now()

  useEffect(() => {
    setQ(initialQuery)
    input.current?.focus()
  }, [initialQuery])

  const budget = access?.budget
  const backup = !!access?.sources.serper
  const low = budget && !backup ? budget.scansLeft <= 1 : false
  const out = budget && !backup ? budget.scansLeft === 0 : false
  const missing = access && (!access.sources.model || (!access.sources.search && !access.sources.youtube))
  const canScan = q.trim().length >= 2 && !starting && !out && !missing

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (canScan) onScan(q.trim(), tw)
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
                  {WINDOWS.map(([v, l]) => (
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
      </section>

      <section aria-labelledby="your-topics">
        <div className="flex items-baseline justify-between mb-4">
          <h2 id="your-topics" className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate-500">
            Your topics {topics && topics.length > 0 && <span className="text-slate-400 tabular-nums">{topics.length}</span>}
          </h2>
        </div>
        {loading && !topics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-40 rounded-2xl" />
            ))}
          </div>
        ) : !topics || topics.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-[14.5px] font-medium text-slate-700 dark:text-slate-200">Nothing scanned yet</p>
            <p className="text-[13.5px] text-slate-500 mt-1.5 max-w-md mx-auto">
              Every topic you scan is saved here. Come back any time to read it again or rescan for newer posts.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((t) => (
              <TopicCard key={t.id} t={t} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
