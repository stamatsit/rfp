import { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Search, X } from "lucide-react"
import type { ItemView, Platform, Report, Sentiment } from "@/types/listening"
import { Card, ExternalLink, NewBadge, PLATFORM, PlatformBadge, SENTIMENT_LABEL, SectionHeading, SentimentDot, fmtDate, plural } from "../ui"

const PAGE = 25

export interface SourceFilter {
  subtopicId: string | null
}

function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-3 pr-8 text-[13px] text-slate-700 dark:text-slate-200 appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 cursor-pointer"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border-x-[4px] border-x-transparent border-t-[5px] border-t-slate-400" />
    </label>
  )
}

export function Sources({ report, items, filter, onClearFilter }: { report: Report; items: ItemView[]; filter: SourceFilter; onClearFilter: () => void }) {
  const [q, setQ] = useState("")
  const [platform, setPlatform] = useState<Platform | "all">("all")
  const [sentiment, setSentiment] = useState<Sentiment | "all">("all")
  const [subtopic, setSubtopic] = useState<string>("all")
  const [onlyNew, setOnlyNew] = useState(false)
  const [showOffTopic, setShowOffTopic] = useState(false)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    if (filter.subtopicId) {
      setSubtopic(filter.subtopicId)
      setShown(PAGE)
    }
  }, [filter.subtopicId])

  const platforms = useMemo(() => [...new Set(items.map((i) => i.platform))].sort(), [items])
  const offTopicCount = useMemo(() => items.filter((i) => i.relevant === false).length, [items])
  const newCount = useMemo(() => items.filter((i) => i.isNew && i.relevant !== false).length, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items
      .filter((i) => (showOffTopic ? true : i.relevant !== false))
      .filter((i) => platform === "all" || i.platform === platform)
      .filter((i) => sentiment === "all" || i.sentiment === sentiment)
      .filter((i) => subtopic === "all" || i.subtopicId === subtopic)
      .filter((i) => !onlyNew || i.isNew)
      .filter((i) => !needle || `${i.title} ${i.excerpt} ${i.author ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.relevant !== false) - Number(a.relevant !== false) || b.engagement - a.engagement)
  }, [items, q, platform, sentiment, subtopic, onlyNew, showOffTopic])

  useEffect(() => setShown(PAGE), [q, platform, sentiment, subtopic, onlyNew, showOffTopic])

  const anyFilter = q || platform !== "all" || sentiment !== "all" || subtopic !== "all" || onlyNew || showOffTopic
  const subName = new Map(report.subtopics.map((s) => [s.id, s.name]))

  return (
    <section>
      <SectionHeading id="sources" title="All sources" count={items.filter((i) => i.relevant !== false).length} hint="Every relevant post and comment we found. Each one opens where it was posted." />
      <Card>
        <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 border-b border-black/[0.05] dark:border-white/[0.06]">
          <label className="relative flex-1 min-w-[200px]">
            <span className="sr-only">Search sources</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search within sources"
              className="w-full h-9 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-9 pr-3 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            />
          </label>
          <Select label="Platform" value={platform} onChange={setPlatform} options={[["all", "All platforms"], ...platforms.map((p) => [p, PLATFORM[p].label] as [Platform, string])]} />
          <Select
            label="Feeling"
            value={sentiment}
            onChange={setSentiment}
            options={[["all", "Any feeling"], ...(["positive", "mixed", "neutral", "negative"] as Sentiment[]).map((s) => [s, SENTIMENT_LABEL[s]] as [Sentiment, string])]}
          />
          {report.subtopics.length > 0 && (
            <Select label="Subtopic" value={subtopic} onChange={setSubtopic} options={[["all", "All subtopics"], ...report.subtopics.map((s) => [s.id, s.name] as [string, string])]} />
          )}
          {report.totals.runs > 1 && newCount > 0 && (
            <button
              type="button"
              aria-pressed={onlyNew}
              onClick={() => setOnlyNew((v) => !v)}
              className={`h-9 rounded-lg px-3 text-[13px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
                onlyNew ? "bg-sky-500 border-sky-500 text-white" : "border-black/[0.08] dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              New this scan · {newCount}
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[14px] text-slate-500">
            Nothing matches these filters.
            {anyFilter && (
              <button
                type="button"
                onClick={() => {
                  setQ("")
                  setPlatform("all")
                  setSentiment("all")
                  setSubtopic("all")
                  setOnlyNew(false)
                  setShowOffTopic(false)
                  onClearFilter()
                }}
                className="ml-1.5 font-medium text-sky-700 dark:text-sky-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {filtered.slice(0, shown).map((it) => (
              <li key={it.id}>
                <ExternalLink href={it.url} className={`group flex gap-4 px-4 sm:px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors ${it.relevant === false ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    {it.title && it.kind !== "comment" && <p className="text-[14px] font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-1 group-hover:text-sky-700 dark:group-hover:text-sky-400">{it.title}</p>}
                    <p className={`text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 ${it.title && it.kind !== "comment" ? "mt-0.5 line-clamp-2" : "line-clamp-3"}`}>{it.excerpt}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] text-slate-500">
                      <PlatformBadge platform={it.platform} />
                      {it.kind === "comment" && <span>comment</span>}
                      {it.sentiment && (
                        <span className="inline-flex items-center gap-1.5">
                          <SentimentDot tone={it.sentiment} />
                          {SENTIMENT_LABEL[it.sentiment]}
                        </span>
                      )}
                      {it.subtopicId && subName.get(it.subtopicId) && <span className="truncate max-w-[220px]">{subName.get(it.subtopicId)}</span>}
                      {it.publishedAt && <span>{fmtDate(it.publishedAt)}</span>}
                      {it.relevant === false && <span className="text-slate-400">judged off-topic</span>}
                      {it.isNew && report.totals.runs > 1 && <NewBadge />}
                    </p>
                  </div>
                  <ArrowUpRight size={16} className="shrink-0 text-slate-300 group-hover:text-sky-500 transition-colors mt-0.5" />
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-black/[0.05] dark:border-white/[0.06] text-[12.5px] text-slate-500">
          <span className="tabular-nums">
            Showing {Math.min(shown, filtered.length).toLocaleString()} of {plural(filtered.length, "source")}
            {subtopic !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setSubtopic("all")
                  onClearFilter()
                }}
                className="inline-flex items-center gap-1 ml-2 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              >
                {subName.get(subtopic)} <X size={12} />
              </button>
            )}
          </span>
          <span className="flex items-center gap-4">
            {offTopicCount > 0 && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showOffTopic} onChange={(e) => setShowOffTopic(e.target.checked)} className="rounded border-slate-300" />
                Show {offTopicCount} off-topic
              </label>
            )}
            {shown < filtered.length && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Show more
              </button>
            )}
          </span>
        </div>
      </Card>
    </section>
  )
}
