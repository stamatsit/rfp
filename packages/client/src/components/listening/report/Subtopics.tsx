import { useEffect, useState } from "react"
import { ArrowUpRight, ChevronDown, Megaphone, Newspaper } from "lucide-react"
import type { ItemView, Report } from "@/types/listening"
import { Card, ExternalLink, NewBadge, PlatformBadge, SENTIMENT_COLOR, SectionHeading, SentimentBar, SentimentDot, fmtDate, plural, verdict } from "../ui"

export function Subtopics({ report, items, openId, onShowAll }: { report: Report; items: Map<string, ItemView>; openId: string | null; onShowAll: (subtopicId: string) => void }) {
  const [open, setOpen] = useState<string | null>(openId)
  useEffect(() => {
    if (openId) setOpen(openId)
  }, [openId])
  const quotes = new Map(report.quotes.map((q) => [q.itemId, q.text]))
  if (!report.subtopics.length) return null
  const maxShare = Math.max(...report.subtopics.map((s) => s.share), 1)
  return (
    <section>
      <SectionHeading id="subtopics" title="Subtopics" count={report.subtopics.length} hint="What the conversation breaks into, largest first." />
      <Card className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {report.subtopics.map((s) => {
          const isOpen = open === s.id
          const v = verdict(s.sentiment)
          const voices = s.itemIds
            .map((id) => items.get(id))
            .filter((it): it is ItemView => !!it)
            .sort((a, b) => (quotes.has(b.id) ? 1 : 0) - (quotes.has(a.id) ? 1 : 0) || b.engagement - a.engagement)
            .slice(0, 3)
          return (
            <div key={s.id} id={`subtopic-${s.id}`} className="scroll-mt-32">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="w-full text-left px-5 py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                    {s.newCount > 0 && report.totals.runs > 1 && <span className="text-[11.5px] font-medium text-sky-600 dark:text-sky-400 shrink-0">+{s.newCount} new</span>}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-slate-500 mt-0.5">
                    <SentimentDot tone={v.tone} /> {v.label} · {s.count} posts
                  </span>
                </span>
                <span className="hidden sm:flex items-center gap-3">
                  <span className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <span className="block h-full rounded-full bg-sky-500/80" style={{ width: `${(100 * s.share) / maxShare}%` }} />
                  </span>
                  <span className="w-10 text-right text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.share}%</span>
                </span>
                <ChevronDown size={17} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 -mt-1">
                  <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 max-w-3xl">{s.summary}</p>
                  <div className="max-w-sm mt-3">
                    <SentimentBar s={s.sentiment} height={8} showLegend />
                  </div>
                  {voices.length > 0 && (
                    <ul className="mt-4 grid gap-2.5 md:grid-cols-3">
                      {voices.map((it) => (
                        <li key={it.id}>
                          <ExternalLink href={it.url} className="group block h-full rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 hover:border-sky-300 dark:hover:border-sky-500/40 transition-colors">
                            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-4">
                              {quotes.has(it.id) ? `“${quotes.get(it.id)}”` : it.kind === "comment" || !it.title ? it.excerpt : it.title}
                            </p>
                            <span className="flex items-center justify-between mt-2">
                              <PlatformBadge platform={it.platform} />
                              <ArrowUpRight size={13} className="text-slate-300 group-hover:text-sky-500" />
                            </span>
                          </ExternalLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => onShowAll(s.id)}
                    className="mt-4 text-[13px] font-medium text-sky-700 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
                  >
                    See all {s.count} posts in this subtopic
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </section>
  )
}

export function Voices({ report }: { report: Report }) {
  if (!report.quotes.length) return null
  return (
    <section>
      <SectionHeading id="voices" title="In their words" hint="Standout lines, quoted exactly as written." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.quotes.map((q) => (
          <ExternalLink key={q.itemId} href={q.url} className="group block">
            <figure
              className="h-full bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-4 pl-5 relative overflow-hidden hover:shadow-sm transition-shadow"
            >
              <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: SENTIMENT_COLOR[q.sentiment] }} />
              <blockquote className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">{`“${q.text}”`}</blockquote>
              <figcaption className="flex items-center gap-2 mt-3 text-[12px] text-slate-500">
                <PlatformBadge platform={q.platform} />
                {q.isNew && report.totals.runs > 1 && <NewBadge />}
                <ArrowUpRight size={13} className="ml-auto text-slate-300 group-hover:text-sky-500" />
              </figcaption>
            </figure>
          </ExternalLink>
        ))}
      </div>
    </section>
  )
}

/** A named institution's own posts: what it says about itself, kept apart from what people say. */
export function OwnVoice({ report, onShowAll }: { report: Report; onShowAll: () => void }) {
  const own = report.ownVoice
  if (!own || !own.posts.length) return null
  return (
    <section>
      <SectionHeading
        id="own-voice"
        title={`What ${own.name} says about itself`}
        count={own.count}
        hint={`Posts from ${own.name}'s own accounts. Shown for comparison and never counted as public opinion.`}
      />
      <Card>
        {own.note && (
          <div className="flex gap-3 px-5 py-4 border-b border-black/[0.05] dark:border-white/[0.06]">
            <Megaphone size={16} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 text-pretty">{own.note}</p>
          </div>
        )}
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {own.posts.map((p) => (
            <li key={p.itemId}>
              <ExternalLink href={p.url} className="group flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-sky-700 dark:group-hover:text-sky-400">{p.title || p.excerpt}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] text-slate-500">
                    <PlatformBadge platform={p.platform} />
                    {p.publishedAt && <span>{fmtDate(p.publishedAt)}</span>}
                    {p.isNew && report.totals.runs > 1 && <NewBadge />}
                  </p>
                </div>
                <ArrowUpRight size={15} className="shrink-0 text-slate-300 group-hover:text-sky-500 transition-colors mt-0.5" />
              </ExternalLink>
            </li>
          ))}
        </ul>
        {own.count > own.posts.length && (
          <div className="px-5 py-3 border-t border-black/[0.05] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onShowAll}
              className="text-[13px] font-medium text-sky-700 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
            >
              See all {plural(own.count, "post")} in sources
            </button>
          </div>
        )}
      </Card>
    </section>
  )
}

export function News({ report }: { report: Report }) {
  if (!report.news.length) return null
  return (
    <section>
      <SectionHeading id="news" title="In the news" hint="Recent coverage for context. Not counted in the feelings above." />
      <Card className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {report.news.map((n) => (
          <ExternalLink key={n.itemId} href={n.url} className="group flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors first:rounded-t-2xl last:rounded-b-2xl">
            <Newspaper size={15} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-slate-800 dark:text-slate-100 leading-snug group-hover:text-sky-700 dark:group-hover:text-sky-400">{n.title}</p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {[n.source, fmtDate(n.publishedAt)].filter(Boolean).join(" · ")}
              </p>
            </div>
            {n.isNew && report.totals.runs > 1 && <NewBadge />}
          </ExternalLink>
        ))}
      </Card>
    </section>
  )
}
