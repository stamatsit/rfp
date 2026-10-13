import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Bookmark, BookmarkCheck, ChevronDown, Lightbulb, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react"
import type { ContentIdea, IdeaDraft, IdeaVote, ItemView, Report, SavedIdea } from "@/types/listening"
import { IdeaDrafts } from "../IdeaDrafts"
import { AUDIENCE_LABEL, Card, CopyButton, ExternalLink, NewBadge, PlatformBadge, SectionHeading, SentimentDot, Tag } from "../ui"

export interface IdeaSaving {
  /** Report idea id -> saved copy id. */
  saved: Record<string, string>
  busy: string | null
  onSave: (ideaId: string) => void
  onUnsave: (ideaId: string) => void
  topicId: string
  /** Saved copy id -> the drafts written from it. */
  drafts: Record<string, IdeaDraft[]>
  /** A draft was written from this report idea; `idea` is its saved copy. */
  onDrafted: (ideaId: string, idea: SavedIdea, draft: IdeaDraft) => void
  /** Your thumbs, by report idea id. */
  votes: Record<string, IdeaVote>
  /** 1 or -1 to vote, 0 to clear. */
  onVote: (ideaId: string, vote: IdeaVote | 0) => void
}

/** "More ideas": the topic's owner can ask for more, written from the posts already collected. */
export interface IdeaAdding {
  /** False for a teammate reading a shared topic, and while a scan runs. */
  allowed: boolean
  busy: boolean
  /** What the last request came back with, when it added nothing. */
  note: string | null
  /** Ideas added since the page opened. */
  fresh: Set<string>
  onMore: () => void
}

/** Thumbs steer the ideas written next; they change nothing already on the page. */
function Thumbs({ ideaId, headline, s }: { ideaId: string; headline: string; s: IdeaSaving }) {
  const mine = s.votes[ideaId] ?? 0
  const button = (vote: IdeaVote, Icon: typeof ThumbsUp, label: string, on: string) => (
    <button
      type="button"
      onClick={() => s.onVote(ideaId, mine === vote ? 0 : vote)}
      aria-pressed={mine === vote}
      aria-label={`${label}: ${headline}`}
      title={mine === vote ? `${label}. Click to clear.` : label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
        mine === vote ? on : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      <Icon size={15} />
    </button>
  )
  return (
    <span className="inline-flex items-center" role="group" aria-label="Rate this idea">
      {button(1, ThumbsUp, "More ideas like this", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300")}
      {button(-1, ThumbsDown, "Fewer ideas like this", "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300")}
    </span>
  )
}

function SaveButton({ ideaId, s }: { ideaId: string; s: IdeaSaving }) {
  const saved = !!s.saved[ideaId]
  const busy = s.busy === ideaId
  // Removing a saved idea deletes the drafts written from it, so that asks once.
  const drafted = saved && (s.drafts[s.saved[ideaId]!]?.length ?? 0) > 0
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const t = window.setTimeout(() => setConfirm(false), 3500)
    return () => window.clearTimeout(t)
  }, [confirm])
  const click = () => {
    if (!saved) return s.onSave(ideaId)
    if (drafted && !confirm) return setConfirm(true)
    setConfirm(false)
    s.onUnsave(ideaId)
  }
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-pressed={saved}
      title={saved ? (drafted ? "Saved to your idea board. Removing it deletes its drafts too." : "Saved to your idea board. Click to remove it.") : "Save to your idea board"}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-60 ${
        saved
          ? "bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
      {confirm ? "Remove, drafts too?" : saved ? "Saved" : "Save"}
    </button>
  )
}

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

function IdeaCard({ idea, index, items, quotes, subtopicName, onSubtopic, saving, fresh }: {
  idea: ContentIdea
  index: number
  items: Map<string, ItemView>
  quotes: Map<string, string>
  subtopicName: string | null
  onSubtopic: () => void
  saving: IdeaSaving
  /** Added by "More ideas" since the page opened. */
  fresh: boolean
}) {
  const [open, setOpen] = useState(false)
  const savedId = saving.saved[idea.id]
  return (
    <Card id={`idea-${idea.id}`} className={`p-5 flex flex-col scroll-mt-36 ${fresh ? "ring-2 ring-sky-400/50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold text-slate-400 tabular-nums mr-1">{String(index + 1).padStart(2, "0")}</span>
          {fresh && <NewBadge />}
          <Tag tone="teal">{idea.format}</Tag>
          <Tag>For {AUDIENCE_LABEL[idea.audience].toLowerCase()}</Tag>
        </div>
        <div className="flex items-center gap-0.5 -mr-1.5 -mt-1 shrink-0">
          <Thumbs ideaId={idea.id} headline={idea.headline} s={saving} />
          <SaveButton ideaId={idea.id} s={saving} />
          <CopyButton text={() => ideaText(idea, items)} label="" done="" ariaLabel="Copy this idea" className="!px-1.5" />
        </div>
      </div>
      <h3 tabIndex={-1} className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white mt-3 text-balance focus:outline-none">
        {idea.headline}
      </h3>
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
      <IdeaDrafts
        target={savedId ? { savedId } : { topicId: saving.topicId, ideaId: idea.id }}
        drafts={savedId ? saving.drafts[savedId] ?? [] : []}
        onDrafted={(saved, draft) => saving.onDrafted(idea.id, saved, draft)}
      />
    </Card>
  )
}

export function Ideas({ report, items, onSubtopic, saving, adding }: {
  report: Report
  items: Map<string, ItemView>
  onSubtopic: (id: string) => void
  saving: IdeaSaving
  adding: IdeaAdding
}) {
  const quotes = new Map(report.quotes.map((q) => [q.itemId, q.text]))
  const subName = new Map(report.subtopics.map((s) => [s.id, s.name]))
  const savedHere = report.ideas.filter((i) => saving.saved[i.id]).length
  return (
    <section>
      <SectionHeading
        id="ideas"
        title="Content ideas"
        count={report.ideas.length}
        hint="Each idea is backed by at least two real posts, checked a second time against them. Save the ones worth pursuing, or start a draft from one."
        action={
          report.ideas.length ? (
            <div className="flex items-center gap-1 shrink-0">
              {savedHere > 0 && (
                <Link
                  to="/listening/ideas"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  <BookmarkCheck size={14} /> Idea board
                </Link>
              )}
              <CopyButton text={() => report.ideas.map((i, n) => `${n + 1}. ${i.headline}\n   ${i.angle}`).join("\n\n")} label="Copy all" />
            </div>
          ) : undefined
        }
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
              saving={saving}
              fresh={adding.fresh.has(idea.id)}
            />
          ))}
        </div>
      )}
      {adding.allowed && report.totals.relevant >= 3 && report.analysisSource === "llm" && (
        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <button
            type="button"
            onClick={adding.onMore}
            disabled={adding.busy}
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 text-[14px] font-semibold text-slate-800 dark:text-slate-100 border border-black/[0.1] dark:border-white/[0.14] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            {adding.busy ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none text-sky-600" /> : <Sparkles size={16} className="text-sky-600 dark:text-sky-400" />}
            {adding.busy ? "Writing more ideas" : "More ideas"}
          </button>
          <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-lg text-pretty" aria-live="polite">
            {adding.busy
              ? "From the posts already collected, each checked against them. About 20 seconds, and no searches."
              : adding.note ?? "Written from the posts already collected and checked against them, so it uses no searches. Your thumbs steer what comes next: more like the ideas you liked, fewer like the ones you passed on."}
          </p>
        </div>
      )}
    </section>
  )
}
