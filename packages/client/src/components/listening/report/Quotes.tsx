import { useMemo, useState } from "react"
import { ArrowUpRight, Quote as QuoteIcon } from "lucide-react"
import type { Report, QuoteEntry, Sentiment } from "@/types/listening"
import { Card, CopyButton, NewBadge, PLATFORM, PlatformBadge, SENTIMENT_COLOR, SENTIMENT_LABEL, SectionHeading } from "../ui"
import { Chip, tone } from "../primitives"

const ORDER: Sentiment[] = ["negative", "mixed", "positive", "neutral"]

const quoteText = (q: QuoteEntry) => `“${q.text}” (${PLATFORM[q.platform].label}: ${q.url})`

function QuoteCard({ q, showNew }: { q: QuoteEntry; showNew: boolean }) {
  return (
    <figure className="group relative mb-3 break-inside-avoid rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-white dark:bg-slate-900 p-4 pl-5 overflow-hidden hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-shadow">
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: SENTIMENT_COLOR[q.sentiment] }} />
      <blockquote className="text-[15px] leading-relaxed text-slate-900 dark:text-slate-100">
        <a
          href={q.url}
          target="_blank"
          rel="noopener noreferrer"
          className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-sky-500/50 focus-visible:after:rounded-2xl"
        >{`“${q.text}”`}</a>
      </blockquote>
      <figcaption className={`flex items-center gap-2.5 mt-3 text-[12px] ${tone.muted}`}>
        <PlatformBadge platform={q.platform} />
        <span>{SENTIMENT_LABEL[q.sentiment]}</span>
        {showNew && <NewBadge />}
        <span className="relative z-10 ml-auto flex items-center gap-0.5 -mr-2 -my-1">
          <CopyButton text={quoteText(q)} label="" done="" ariaLabel={`Copy quote with its link: ${q.text}`} className="!px-2 h-8" />
          <ArrowUpRight size={14} aria-hidden className="text-slate-400 group-hover:text-sky-600" />
        </span>
      </figcaption>
    </figure>
  )
}

export function Quotes({ report }: { report: Report }) {
  const counts = useMemo(() => {
    const c = new Map<Sentiment, number>()
    for (const q of report.quotes) c.set(q.sentiment, (c.get(q.sentiment) ?? 0) + 1)
    return c
  }, [report.quotes])
  const [feel, setFeel] = useState<Sentiment | "all">("all")
  const shown = feel === "all" ? report.quotes : report.quotes.filter((q) => q.sentiment === feel)
  return (
    <section aria-labelledby="quotes-title">
      <SectionHeading
        id="voices"
        titleId="quotes-title"
        title="In their words"
        count={report.quotes.length}
        hint="Standout lines, quoted exactly as written. Good prompts for interviews, podcast guests and pull quotes."
        action={report.quotes.length ? <CopyButton text={() => shown.map(quoteText).join("\n\n")} label="Copy all with links" /> : undefined}
      />
      {counts.size > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="group" aria-label="Filter quotes by feeling">
          <Chip on={feel === "all"} onClick={() => setFeel("all")} count={report.quotes.length}>
            All
          </Chip>
          {ORDER.filter((s) => counts.has(s)).map((s) => (
            <Chip key={s} on={feel === s} onClick={() => setFeel(feel === s ? "all" : s)} dot={SENTIMENT_COLOR[s]} count={counts.get(s)}>
              {SENTIMENT_LABEL[s]}
            </Chip>
          ))}
        </div>
      )}
      {report.quotes.length === 0 ? (
        <Card className="p-8 text-center">
          <QuoteIcon size={22} className="mx-auto text-slate-400" />
          <p className={`text-[14px] mt-3 ${tone.body}`}>No line stood out enough to quote yet. A rescan often brings some in.</p>
        </Card>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
          {shown.map((q, i) => (
            <QuoteCard key={`${i}-${q.itemId}`} q={q} showNew={!!q.isNew && report.totals.runs > 1} />
          ))}
        </div>
      )}
    </section>
  )
}

/** A few quotes for the overview, strongest feelings first. */
export function TopQuotes({ report, limit = 3 }: { report: Report; limit?: number }) {
  const picked = [...report.quotes].sort((a, b) => ORDER.indexOf(a.sentiment) - ORDER.indexOf(b.sentiment)).slice(0, limit)
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {picked.map((q, i) => (
        <a
          key={`${i}-${q.itemId}`}
          href={q.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 pl-5 overflow-hidden hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
        >
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: SENTIMENT_COLOR[q.sentiment] }} />
          <span className="block text-[14px] leading-relaxed text-slate-900 dark:text-slate-100 line-clamp-4">{`“${q.text}”`}</span>
          <span className={`mt-2 flex items-center gap-2 text-[12px] ${tone.muted}`}>
            <PlatformBadge platform={q.platform} />
            <ArrowUpRight size={13} aria-hidden className="ml-auto text-slate-400 group-hover:text-sky-600" />
          </span>
        </a>
      ))}
    </div>
  )
}
