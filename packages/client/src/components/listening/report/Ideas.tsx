import { useState } from "react"
import { ArrowUpRight, ChevronDown, Lightbulb } from "lucide-react"
import type { ContentIdea, ItemView, Report } from "@/types/listening"
import { AUDIENCE_LABEL, Card, CopyButton, ExternalLink, PlatformBadge, SectionHeading, SentimentDot, Tag } from "../ui"

function ideaText(idea: ContentIdea, items: Map<string, ItemView>): string {
  const sources = idea.evidenceItemIds.map((id) => items.get(id)?.url).filter(Boolean)
  return [
    idea.headline,
    "",
    idea.angle,
    `Format: ${idea.format}. Audience: ${AUDIENCE_LABEL[idea.audience]}.`,
    idea.whyNow ? `Why now: ${idea.whyNow}` : "",
    "",
    "Outline:",
    ...idea.outline.map((o) => `- ${o}`),
    "",
    "Sources:",
    ...sources.map((s) => `- ${s}`),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
}

function Evidence({ ids, items, quotes }: { ids: string[]; items: Map<string, ItemView>; quotes: Map<string, string> }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {ids.map((id) => {
        const it = items.get(id)
        if (!it) return null
        const text = quotes.get(id) ?? (it.title && it.kind !== "comment" ? it.title : it.excerpt)
        return (
          <li key={id}>
            <ExternalLink href={it.url} className="group block rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 hover:border-sky-300 dark:hover:border-sky-500/40 hover:bg-sky-50/40 dark:hover:bg-sky-500/[0.04] transition-colors">
              <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-3">{quotes.has(id) ? `“${text}”` : text}</p>
              <span className="flex items-center gap-2 mt-2 text-[12px] text-slate-500">
                <PlatformBadge platform={it.platform} />
                {it.sentiment && <SentimentDot tone={it.sentiment} />}
                <span className="ml-auto inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 opacity-80 group-hover:opacity-100">
                  Open <ArrowUpRight size={13} />
                </span>
              </span>
            </ExternalLink>
          </li>
        )
      })}
    </ul>
  )
}

function IdeaCard({ idea, index, items, quotes, subtopicName, onSubtopic }: {
  idea: ContentIdea
  index: number
  items: Map<string, ItemView>
  quotes: Map<string, string>
  subtopicName: string | null
  onSubtopic: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold text-slate-400 tabular-nums mr-1">{String(index + 1).padStart(2, "0")}</span>
          <Tag tone="teal">{idea.format}</Tag>
          <Tag>For {AUDIENCE_LABEL[idea.audience].toLowerCase()}</Tag>
        </div>
        <CopyButton text={() => ideaText(idea, items)} label="" done="" ariaLabel="Copy this idea" className="!px-1.5 -mr-1.5 -mt-1" />
      </div>
      <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white mt-3 text-balance">{idea.headline}</h3>
      <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300 mt-2">{idea.angle}</p>
      {idea.whyNow && (
        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-2.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">Why now: </span>
          {idea.whyNow}
        </p>
      )}
      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
        >
          Outline and {idea.evidenceItemIds.length} sources
          <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {subtopicName && (
          <button type="button" onClick={onSubtopic} className="text-[12px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 truncate max-w-[45%]">
            {subtopicName}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
          {idea.outline.length > 0 && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2">Outline</p>
              <ol className="space-y-1.5 text-[13.5px] text-slate-700 dark:text-slate-200 list-decimal pl-5 marker:text-slate-400">
                {idea.outline.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
            </>
          )}
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mt-4">Based on these posts</p>
          <Evidence ids={idea.evidenceItemIds} items={items} quotes={quotes} />
        </div>
      )}
    </Card>
  )
}

export function Ideas({ report, items, onSubtopic }: { report: Report; items: Map<string, ItemView>; onSubtopic: (id: string) => void }) {
  const quotes = new Map(report.quotes.map((q) => [q.itemId, q.text]))
  const subName = new Map(report.subtopics.map((s) => [s.id, s.name]))
  return (
    <section>
      <SectionHeading
        id="ideas"
        title="Content ideas"
        count={report.ideas.length}
        hint="Each idea is backed by at least two real posts, checked a second time against them. Open one to see the outline and the sources."
        action={report.ideas.length ? <CopyButton text={() => report.ideas.map((i, n) => `${n + 1}. ${i.headline}\n   ${i.angle}`).join("\n\n")} label="Copy all" /> : undefined}
      />
      {report.ideas.length === 0 ? (
        <Card className="p-8 text-center">
          <Lightbulb size={22} className="mx-auto text-slate-300" />
          <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-3 max-w-md mx-auto text-pretty">
            {report.totals.relevant < 3
              ? "Not enough conversation yet to suggest ideas. Rescan or try a broader topic."
              : report.analysisSource === "llm"
                ? "No idea had at least two posts that clearly back it up, so none are shown. Rescan to collect more conversation, or try a broader topic."
                : "Ideas were not written for this scan. Use Refresh analysis in the menu to try again."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 items-start">
          {report.ideas.map((idea, i) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              index={i}
              items={items}
              quotes={quotes}
              subtopicName={idea.subtopicId ? subName.get(idea.subtopicId) ?? null : null}
              onSubtopic={() => idea.subtopicId && onSubtopic(idea.subtopicId)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
