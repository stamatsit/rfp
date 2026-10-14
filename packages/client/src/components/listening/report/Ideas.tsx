import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Bookmark, BookmarkCheck, FileText, Lightbulb, Loader2, MessageSquareText, Sparkles, ThumbsDown, ThumbsUp, Type } from "lucide-react"
import type { Audience, ContentIdea, DraftKind, IdeaDraft, IdeaVote, ItemView, Report, SavedIdea } from "@/types/listening"
import type { PanelIdea } from "../IdeaPanel"
import { AUDIENCE_LABEL, Card, CopyButton, NewBadge, SectionHeading, Tag } from "../ui"
import { Button, Chip, ring, tone } from "../primitives"
import { cn } from "@/lib/utils"

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

/** A report idea in the shape the idea panel shows: its posts as quotes where one was kept, else their text. */
export function toPanelIdea(idea: ContentIdea, items: Map<string, ItemView>, report: Report, fresh = false): PanelIdea {
  const quotes = new Map(report.quotes.map((q) => [q.itemId, q.text]))
  const sub = idea.subtopicId ? report.subtopics.find((s) => s.id === idea.subtopicId) : null
  return {
    key: idea.id,
    headline: idea.headline,
    angle: idea.angle,
    whyNow: idea.whyNow || null,
    outline: idea.outline,
    format: idea.format,
    audience: idea.audience,
    subtopic: sub ? { id: sub.id, name: sub.name } : null,
    isNew: fresh,
    sources: idea.evidenceItemIds.flatMap((id) => {
      const it = items.get(id)
      if (!it) return []
      const q = quotes.get(id)
      return [{ url: it.url, platform: it.platform, text: q ?? (it.title && it.kind !== "comment" ? it.title : it.excerpt), quoted: !!q, sentiment: it.sentiment, publishedAt: it.publishedAt }]
    }),
  }
}

export function ideaText(idea: PanelIdea): string {
  return [
    idea.headline,
    "",
    idea.angle,
    `Format: ${idea.format}. Audience: ${AUDIENCE_LABEL[idea.audience]}.`,
    idea.whyNow ? `Why now: ${idea.whyNow}` : "",
    "",
    idea.outline.length ? "Outline:" : "",
    ...idea.outline.map((o) => `- ${o}`),
    "",
    "Sources:",
    ...idea.sources.map((s) => `- ${s.url}`),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim()
}

/** Thumbs steer the ideas written next; they change nothing already on the page. */
export function Thumbs({ ideaId, headline, s, size = "iconSm" }: { ideaId: string; headline: string; s: IdeaSaving; size?: "iconSm" | "icon" }) {
  const mine = s.votes[ideaId] ?? 0
  const button = (vote: IdeaVote, Icon: typeof ThumbsUp, label: string, on: string) => (
    <Button
      variant="ghost"
      size={size}
      onClick={() => s.onVote(ideaId, mine === vote ? 0 : vote)}
      aria-pressed={mine === vote}
      aria-label={`${label}: ${headline}`}
      title={mine === vote ? `${label}. Click to clear.` : label}
      className={mine === vote ? on : "text-slate-500 dark:text-slate-400"}
    >
      <Icon size={size === "icon" ? 17 : 15} />
    </Button>
  )
  return (
    <span className="inline-flex items-center" role="group" aria-label="Rate this idea">
      {button(1, ThumbsUp, "More ideas like this", "!bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-300")}
      {button(-1, ThumbsDown, "Fewer ideas like this", "!bg-rose-50 !text-rose-700 dark:!bg-rose-500/15 dark:!text-rose-300")}
    </span>
  )
}

export function SaveButton({ ideaId, s, size = "sm" }: { ideaId: string; s: IdeaSaving; size?: "sm" | "md" }) {
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
    <Button
      size={size}
      variant={saved ? "brand" : size === "md" ? "secondary" : "ghost"}
      onClick={click}
      disabled={busy}
      aria-pressed={saved}
      title={saved ? (drafted ? "Saved to your idea board. Removing it deletes its drafts too." : "Saved to your idea board. Click to remove it.") : "Save to your idea board"}
    >
      {busy ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
      {confirm ? "Remove, drafts too?" : saved ? "Saved" : size === "md" ? "Save to idea board" : "Save"}
    </Button>
  )
}

const DRAFT_ICON: Record<DraftKind, typeof FileText> = { blog_outline: FileText, linkedin_post: MessageSquareText, headlines: Type }
const DRAFT_SHORT: Record<DraftKind, string> = { blog_outline: "outline", linkedin_post: "LinkedIn post", headlines: "headlines" }

function IdeaRow({ idea, index, subtopicName, saving, fresh, onOpen }: { idea: ContentIdea; index: number; subtopicName: string | null; saving: IdeaSaving; fresh: boolean; onOpen: () => void }) {
  const savedId = saving.saved[idea.id]
  const drafts = savedId ? saving.drafts[savedId] ?? [] : []
  return (
    <li
      id={`idea-${idea.id}`}
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-2xl border bg-white dark:bg-slate-900 p-4 sm:p-5 transition-[border-color,box-shadow] scroll-mt-36",
        "border-black/[0.07] dark:border-white/[0.08] hover:border-black/[0.14] dark:hover:border-white/[0.16] hover:shadow-[0_4px_18px_rgba(15,23,42,0.06)]",
        fresh && "ring-2 ring-sky-400/50",
      )}
    >
      <span aria-hidden className="pt-0.5 text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 w-5">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h3 className="text-[16.5px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white text-balance">
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-sky-500/60 group-hover:text-sky-800 dark:group-hover:text-sky-300 transition-colors"
          >
            {idea.headline}
          </button>
        </h3>
        <p className={`mt-1 text-[14px] leading-relaxed line-clamp-2 ${tone.body}`}>{idea.angle}</p>
        <div className={`mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] ${tone.muted}`}>
          {fresh && <NewBadge />}
          <Tag tone="teal">{idea.format}</Tag>
          <span>For {AUDIENCE_LABEL[idea.audience].toLowerCase()}</span>
          <span aria-hidden>·</span>
          <span>{idea.evidenceItemIds.length} posts</span>
          {subtopicName && (
            <span className="hidden sm:inline-flex items-center gap-2.5 min-w-0">
              <span aria-hidden>·</span>
              <span className="truncate max-w-[16rem]">{subtopicName}</span>
            </span>
          )}
          {drafts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {drafts.map((d) => DRAFT_SHORT[d.kind]).join(", ")} written
              <span className="inline-flex gap-0.5" aria-hidden>
                {drafts.map((d) => {
                  const Icon = DRAFT_ICON[d.kind]
                  return <Icon key={d.kind} size={12} />
                })}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="relative z-10 col-start-2 sm:col-start-3 sm:row-start-1 flex items-center gap-0.5 -ml-2 sm:ml-0 sm:-mr-1.5 sm:-mt-1 self-start">
        <Thumbs ideaId={idea.id} headline={idea.headline} s={saving} />
        <SaveButton ideaId={idea.id} s={saving} />
      </div>
    </li>
  )
}

export function Ideas({
  report,
  saving,
  adding,
  onOpen,
}: {
  report: Report
  saving: IdeaSaving
  adding: IdeaAdding
  onOpen: (ideaId: string) => void
}) {
  const subName = new Map(report.subtopics.map((s) => [s.id, s.name]))
  const savedHere = report.ideas.filter((i) => saving.saved[i.id]).length
  const audiences = useMemo(() => {
    const c = new Map<Audience, number>()
    for (const i of report.ideas) c.set(i.audience, (c.get(i.audience) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [report.ideas])
  const [audience, setAudience] = useState<Audience | "all">("all")
  const numbered = report.ideas.map((idea, index) => ({ idea, index }))
  const shown = audience === "all" ? numbered : numbered.filter(({ idea }) => idea.audience === audience)
  return (
    <section aria-labelledby="ideas-title">
      <SectionHeading
        id="ideas"
        titleId="ideas-title"
        title="Content ideas"
        count={report.ideas.length}
        hint="Each one is backed by at least two real posts, checked a second time against them. Open one for its outline, its posts and drafts."
        action={
          report.ideas.length ? (
            <div className="flex items-center gap-1 shrink-0">
              {savedHere > 0 && (
                <Link to="/listening/ideas" className={`inline-flex items-center gap-1.5 h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-sky-800 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 ${ring}`}>
                  <BookmarkCheck size={14} /> {savedHere} saved
                </Link>
              )}
              <CopyButton text={() => report.ideas.map((i, n) => `${n + 1}. ${i.headline}\n   ${i.angle}`).join("\n\n")} label="Copy all" />
            </div>
          ) : undefined
        }
      />
      {audiences.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="group" aria-label="Filter ideas by audience">
          <Chip on={audience === "all"} onClick={() => setAudience("all")} count={report.ideas.length}>
            All
          </Chip>
          {audiences.map(([a, n]) => (
            <Chip key={a} on={audience === a} onClick={() => setAudience(audience === a ? "all" : a)} count={n}>
              For {AUDIENCE_LABEL[a].toLowerCase()}
            </Chip>
          ))}
        </div>
      )}
      {report.ideas.length === 0 ? (
        <Card className="p-8 text-center">
          <Lightbulb size={22} className="mx-auto text-slate-400" />
          <p className={`text-[14px] mt-3 max-w-md mx-auto text-pretty ${tone.body}`}>
            {report.totals.relevant < 3
              ? "Not enough conversation yet to suggest ideas. Rescan or try a broader topic."
              : report.analysisSource === "llm"
                ? "No idea had at least two posts that clearly back it up, so none are shown. Rescan to collect more conversation, or try a broader topic."
                : "Ideas were not written for this scan. Use Update, then Rewrite the analysis, to try again."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2.5" aria-label="Content ideas">
          {shown.map(({ idea, index }) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              index={index}
              subtopicName={idea.subtopicId ? subName.get(idea.subtopicId) ?? null : null}
              saving={saving}
              fresh={adding.fresh.has(idea.id)}
              onOpen={() => onOpen(idea.id)}
            />
          ))}
        </ul>
      )}
      {adding.allowed && report.totals.relevant >= 3 && report.analysisSource === "llm" && (
        <div className="mt-6 rounded-2xl border border-dashed border-black/[0.12] dark:border-white/[0.14] px-5 py-6 flex flex-col items-center gap-2.5 text-center">
          <Button onClick={adding.onMore} disabled={adding.busy}>
            {adding.busy ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none text-sky-600" /> : <Sparkles size={16} className="text-sky-600 dark:text-sky-400" />}
            {adding.busy ? "Writing more ideas" : "More ideas"}
          </Button>
          <p className={`text-[12.5px] leading-relaxed max-w-lg text-pretty ${tone.muted}`} aria-live="polite">
            {adding.busy
              ? "From the posts already collected, each checked against them. About 20 seconds, and no searches."
              : adding.note ?? "Written from the posts already collected and checked against them, so it uses no searches. Your thumbs steer what comes next."}
          </p>
        </div>
      )}
    </section>
  )
}

/** The first few ideas, as one-line links into the idea panel, for the overview. */
export function TopIdeas({ report, onOpen, limit = 3 }: { report: Report; onOpen: (ideaId: string) => void; limit?: number }) {
  return (
    <ol className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
      {report.ideas.slice(0, limit).map((idea, i) => (
        <li key={idea.id}>
          <button type="button" onClick={() => onOpen(idea.id)} className={`group w-full text-left flex gap-3 py-3 first:pt-0 rounded-lg ${ring}`}>
            <span aria-hidden className="text-[12.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 w-5 pt-px">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold leading-snug text-slate-900 dark:text-white group-hover:text-sky-800 dark:group-hover:text-sky-300 transition-colors">{idea.headline}</span>
              <span className={`block mt-0.5 text-[12.5px] ${tone.muted}`}>
                {idea.format}, for {AUDIENCE_LABEL[idea.audience].toLowerCase()} · {idea.evidenceItemIds.length} posts
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
