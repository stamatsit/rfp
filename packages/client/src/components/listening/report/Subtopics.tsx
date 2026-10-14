import { useEffect, useState } from "react"
import { ArrowUpRight, ChevronDown, Megaphone, Newspaper } from "lucide-react"
import type { ItemView, Report } from "@/types/listening"
import { Card, ExternalLink, NewBadge, PlatformBadge, SENTIMENT_COLOR, SectionHeading, SentimentBar, SentimentDot, fmtDate, plural, verdict } from "../ui"
import { ring, tone } from "../primitives"

export function Subtopics({ report, items, openId, onShowAll }: { report: Report; items: Map<string, ItemView>; openId: string | null; onShowAll: (subtopicId: string) => void }) {
  const [open, setOpen] = useState<string | null>(openId)
  useEffect(() => {
    if (openId) setOpen(openId)
  }, [openId])
  const quotes = new Map(report.quotes.map((q) => [q.itemId, q.text]))
  if (!report.subtopics.length)
    return (
      <section aria-labelledby="subtopics-title">
        <SectionHeading id="subtopics" titleId="subtopics-title" title="Subtopics" />
        <Card className={`p-8 text-center text-[14px] ${tone.body}`}>Too few posts to break into subtopics yet.</Card>
      </section>
    )
  const maxShare = Math.max(...report.subtopics.map((s) => s.share), 1)
  return (
    <section aria-labelledby="subtopics-title">
      <SectionHeading id="subtopics" titleId="subtopics-title" title="Subtopics" count={report.subtopics.length} hint="What the conversation breaks into, largest first. Bars are coloured by how people feel." />
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
            <div key={s.id} id={`subtopic-${s.id}`} className="scroll-mt-36">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="w-full text-left px-5 py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40 first:rounded-t-2xl"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                    {s.newCount > 0 && report.totals.runs > 1 && <span className="text-[11.5px] font-medium text-sky-700 dark:text-sky-400 shrink-0">+{s.newCount} new</span>}
                  </span>
                  <span className={`flex items-center gap-1.5 text-[12.5px] mt-0.5 ${tone.muted}`}>
                    <SentimentDot tone={v.tone} /> {v.label} · {s.count} posts
                  </span>
                </span>
                <span className="hidden sm:flex items-center gap-3">
                  <span className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(100 * s.share) / maxShare}%`, background: SENTIMENT_COLOR[v.tone] }} />
                  </span>
                  <span className="w-10 text-right text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.share}%</span>
                </span>
                <ChevronDown size={17} className={`text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
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
                          <ExternalLink href={it.url} className="group block h-full rounded-xl border border-black/[0.07] dark:border-white/[0.08] p-3 hover:border-sky-300 dark:hover:border-sky-500/40 transition-colors">
                            <p className="text-[13.5px] leading-relaxed text-slate-800 dark:text-slate-200 line-clamp-4">
                              {quotes.has(it.id) ? `“${quotes.get(it.id)}”` : it.kind === "comment" || !it.title ? it.excerpt : it.title}
                            </p>
                            <span className="flex items-center justify-between mt-2">
                              <PlatformBadge platform={it.platform} />
                              <ArrowUpRight size={13} aria-hidden className="text-slate-400 group-hover:text-sky-600" />
                            </span>
                          </ExternalLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => onShowAll(s.id)} className={`mt-4 text-[13px] rounded ${tone.link} ${ring}`}>
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

/** Subtopics as a compact bar list for the overview. */
export function SubtopicBars({ report, onOpen, limit = 5 }: { report: Report; onOpen: (id: string) => void; limit?: number }) {
  const maxShare = Math.max(...report.subtopics.map((s) => s.share), 1)
  return (
    <ul className="space-y-1">
      {report.subtopics.slice(0, limit).map((s) => {
        const v = verdict(s.sentiment)
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s.id)} className={`group w-full text-left rounded-lg py-1.5 ${ring}`} title={`${v.label}, ${s.count} posts`}>
              <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="truncate font-medium text-slate-800 dark:text-slate-100 group-hover:text-sky-800 dark:group-hover:text-sky-300">{s.name}</span>
                <span className={`tabular-nums shrink-0 ${tone.muted}`}>{s.share}%</span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${(100 * s.share) / maxShare}%`, background: SENTIMENT_COLOR[v.tone] }} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A named institution's own posts: what it says about itself, kept apart from what people say. */
export function OwnVoice({ report, onShowAll, limit }: { report: Report; onShowAll: () => void; limit?: number }) {
  const own = report.ownVoice
  if (!own || !own.posts.length) return null
  const posts = limit ? own.posts.slice(0, limit) : own.posts
  return (
    <Card>
      <div className="px-5 pt-4 pb-3 border-b border-black/[0.05] dark:border-white/[0.06]">
        <h3 id="own-voice" className="scroll-mt-36 text-[15px] font-semibold text-slate-900 dark:text-white">
          What {own.name} says about itself <span className={`font-medium tabular-nums ${tone.muted}`}>{own.count}</span>
        </h3>
        <p className={`text-[12.5px] mt-0.5 ${tone.muted}`}>From {own.name}&apos;s own accounts. Shown for comparison, never counted as public opinion.</p>
      </div>
      {own.note && (
        <div className="flex gap-3 px-5 py-3.5 border-b border-black/[0.05] dark:border-white/[0.06]">
          <Megaphone size={16} aria-hidden className="text-slate-500 mt-0.5 shrink-0" />
          <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 text-pretty">{own.note}</p>
        </div>
      )}
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {posts.map((p) => (
          <li key={p.itemId}>
            <ExternalLink href={p.url} className="group flex items-start gap-3 px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-sky-800 dark:group-hover:text-sky-300">{p.title || p.excerpt}</p>
                <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] ${tone.muted}`}>
                  <PlatformBadge platform={p.platform} />
                  {p.publishedAt && <span>{fmtDate(p.publishedAt)}</span>}
                  {p.isNew && report.totals.runs > 1 && <NewBadge />}
                </p>
              </div>
              <ArrowUpRight size={15} aria-hidden className="shrink-0 text-slate-400 group-hover:text-sky-600 transition-colors mt-0.5" />
            </ExternalLink>
          </li>
        ))}
      </ul>
      {own.count > posts.length && (
        <div className="px-5 py-3 border-t border-black/[0.05] dark:border-white/[0.06]">
          <button type="button" onClick={onShowAll} className={`text-[13px] rounded ${tone.link} ${ring}`}>
            See all {plural(own.count, "post")} in sources
          </button>
        </div>
      )}
    </Card>
  )
}

export function News({ report, limit }: { report: Report; limit?: number }) {
  const [all, setAll] = useState(false)
  if (!report.news.length) return null
  const news = limit && !all ? report.news.slice(0, limit) : report.news
  return (
    <Card>
      <div className="px-5 pt-4 pb-3 border-b border-black/[0.05] dark:border-white/[0.06]">
        <h3 id="news" className="scroll-mt-36 text-[15px] font-semibold text-slate-900 dark:text-white">
          In the news <span className={`font-medium tabular-nums ${tone.muted}`}>{report.news.length}</span>
        </h3>
        <p className={`text-[12.5px] mt-0.5 ${tone.muted}`}>Recent coverage for context. Not counted in the feelings.</p>
      </div>
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {news.map((n) => (
          <li key={n.itemId}>
            <ExternalLink href={n.url} className="group flex items-start gap-3 px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
              <Newspaper size={15} aria-hidden className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-slate-800 dark:text-slate-100 leading-snug group-hover:text-sky-800 dark:group-hover:text-sky-300">{n.title}</p>
                <p className={`text-[12px] mt-0.5 ${tone.muted}`}>{[n.source, fmtDate(n.publishedAt)].filter(Boolean).join(" · ")}</p>
              </div>
              {n.isNew && report.totals.runs > 1 && <NewBadge />}
            </ExternalLink>
          </li>
        ))}
      </ul>
      {limit && report.news.length > limit && (
        <div className="px-5 py-3 border-t border-black/[0.05] dark:border-white/[0.06]">
          <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className={`text-[13px] rounded ${tone.link} ${ring}`}>
            {all ? "Show fewer" : `Show all ${report.news.length}`}
          </button>
        </div>
      )}
    </Card>
  )
}
