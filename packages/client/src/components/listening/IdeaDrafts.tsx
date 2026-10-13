/**
 * Start a draft from an idea: a blog outline, a LinkedIn post or headlines,
 * written from the idea and its posts and shown in place. A blog gets an
 * outline only; the team writes its own articles. One draft of each kind is
 * kept with the saved idea, so opening it again costs nothing and "Write
 * another" replaces it. Used on the topic page and on the idea board.
 */
import { useEffect, useId, useState } from "react"
import { ArrowUpRight, ChevronUp, FileText, Loader2, MessageSquareText, RefreshCw, Type } from "lucide-react"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { BlogOutline, DraftKind, HeadlineSet, IdeaDraft, LinkedInPost, SavedIdea } from "@/types/listening"
import { CopyButton, ExternalLink, PLATFORM, Tag, fmtDate } from "./ui"

export type DraftTarget = { savedId: string } | { topicId: string; ideaId: string }

const KINDS: Array<{ kind: DraftKind; label: string; Icon: typeof FileText; writing: string; note: string }> = [
  {
    kind: "blog_outline",
    label: "Blog outline",
    Icon: FileText,
    writing: "Writing an outline",
    note: "Notes to write from, built only from this idea and its posts. The article is yours to write.",
  },
  {
    kind: "linkedin_post",
    label: "LinkedIn post",
    Icon: MessageSquareText,
    writing: "Writing a post",
    note: "A first draft to edit in your own voice. Check it against the posts before you publish.",
  },
  {
    kind: "headlines",
    label: "Headlines",
    Icon: Type,
    writing: "Writing headlines",
    note: "Directions to react to. The number is the length in characters; about 60 fit in a search result.",
  },
]

export function outlineText(o: BlogOutline): string {
  return [
    `Blog outline: ${o.workingTitle}`,
    `Reader: ${o.reader}`,
    `Angle: ${o.angle}`,
    "",
    ...o.sections.flatMap((s, n) => [`${n + 1}. ${s.heading}`, ...s.points.map((p) => `   - ${p}`), ...(s.sources.length ? [`   Posts: ${s.sources.map((x) => x.url).join(", ")}`] : []), ""]),
    `To close: ${o.close}`,
  ].join("\n")
}

export function postText(p: LinkedInPost): string {
  return p.hashtags.length ? `${p.post}\n\n${p.hashtags.map((h) => `#${h}`).join(" ")}` : p.post
}

export function headlinesText(h: HeadlineSet): string {
  return h.headlines.map((x) => x.text).join("\n")
}

function draftText(d: IdeaDraft): string {
  return d.kind === "blog_outline" ? outlineText(d.content) : d.kind === "linkedin_post" ? postText(d.content) : headlinesText(d.content)
}

const LABEL = "text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400"

function Outline({ o }: { o: BlogOutline }) {
  return (
    <div>
      <p className="text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-white text-balance">{o.workingTitle}</p>
      <dl className="mt-2.5 space-y-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
        <div>
          <dt className="inline font-medium text-slate-800 dark:text-slate-100">Reader: </dt>
          <dd className="inline">{o.reader}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-800 dark:text-slate-100">Angle: </dt>
          <dd className="inline">{o.angle}</dd>
        </div>
      </dl>
      <ol className="mt-4 space-y-4">
        {o.sections.map((s, n) => (
          <li key={`${n}-${s.heading}`} className="flex gap-3">
            <span aria-hidden className="mt-px w-5 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-slate-400">
              {n + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{s.heading}</p>
              <ul className="mt-1.5 space-y-1 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300 list-disc pl-4 marker:text-slate-300 dark:marker:text-slate-600">
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {s.sources.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate-400">
                  Answers
                  {s.sources.map((x) => (
                    <ExternalLink key={x.url} href={x.url} className="inline-flex items-center gap-0.5 font-medium text-sky-700 dark:text-sky-400 hover:underline">
                      {(PLATFORM[x.platform] ?? PLATFORM.other).label} post <ArrowUpRight size={12} />
                    </ExternalLink>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="font-medium text-slate-800 dark:text-slate-100">To close: </span>
        {o.close}
      </p>
    </div>
  )
}

function Post({ p }: { p: LinkedInPost }) {
  const words = p.post.split(/\s+/).filter(Boolean).length
  return (
    <div>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3.5 text-[14px] leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line">{p.post}</div>
      {p.hashtags.length > 0 && <p className="mt-2.5 text-[13px] text-sky-700 dark:text-sky-400">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>}
      <p className="mt-2 text-[12px] text-slate-400 tabular-nums">
        {words} words, {p.post.length.toLocaleString("en-US")} characters
      </p>
    </div>
  )
}

function Headlines({ h }: { h: HeadlineSet }) {
  return (
    <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06] -my-1.5">
      {h.headlines.map((x) => (
        <li key={x.text} className="flex items-center gap-2 py-1.5">
          <span className="min-w-0 flex-1 text-[14px] leading-snug text-slate-800 dark:text-slate-100">{x.text}</span>
          <span className="hidden sm:inline-flex shrink-0">
            <Tag>{x.style}</Tag>
          </span>
          <span className={`w-7 shrink-0 text-right text-[12px] tabular-nums ${x.text.length > 60 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`} title={`${x.text.length} characters`}>
            {x.text.length}
          </span>
          <CopyButton text={x.text} label="" done="" ariaLabel={`Copy headline: ${x.text}`} className="!px-1.5 shrink-0" />
        </li>
      ))}
    </ul>
  )
}

export function IdeaDrafts({
  target,
  drafts,
  onDrafted,
}: {
  /** The saved idea, or a topic's idea that drafting will save first. */
  target: DraftTarget
  /** Drafts already written for this saved idea. */
  drafts: IdeaDraft[]
  /** A draft was written; `idea` is the saved copy it belongs to. */
  onDrafted: (idea: SavedIdea, draft: IdeaDraft) => void
}) {
  const [open, setOpen] = useState<DraftKind | null>(null)
  const [busy, setBusy] = useState<DraftKind | null>(null)
  const [failed, setFailed] = useState<{ kind: DraftKind; message: string } | null>(null)
  // "Write another" replaces the draft, so it asks once.
  const [replacing, setReplacing] = useState(false)
  useEffect(() => {
    if (!replacing) return
    const t = window.setTimeout(() => setReplacing(false), 3500)
    return () => window.clearTimeout(t)
  }, [replacing])
  const panelId = useId()
  const have = (kind: DraftKind) => drafts.find((d) => d.kind === kind) ?? null
  const unsaved = !("savedId" in target)

  const write = async (kind: DraftKind, fresh: boolean) => {
    if (busy) return
    setBusy(kind)
    setOpen(kind)
    setFailed(null)
    setReplacing(false)
    try {
      const r = await listeningApi.draft(target, kind, fresh)
      onDrafted(r.idea, r.draft)
    } catch (err) {
      setFailed({ kind, message: (err as ListeningApiError).message ?? "The draft could not be written this time. Try again." })
    } finally {
      setBusy(null)
    }
  }
  const choose = (kind: DraftKind) => {
    if (busy) return
    setReplacing(false)
    if (shown === kind) return setOpen(null)
    if (have(kind)) {
      setFailed(null)
      return setOpen(kind)
    }
    void write(kind, false)
  }

  const draft = open ? have(open) : null
  const writing = open !== null && busy === open
  const error = open !== null && failed?.kind === open ? failed.message : null
  // Nothing to show once the draft is gone (its idea was removed from the board).
  const shown = writing || error !== null || draft !== null ? open : null
  const meta = KINDS.find((k) => k.kind === shown) ?? null

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${LABEL} mr-1`}>Draft</span>
        {KINDS.map(({ kind, label, Icon }) => {
          const on = shown === kind
          const ready = !!have(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => choose(kind)}
              disabled={busy !== null && busy !== kind}
              aria-expanded={on}
              aria-controls={panelId}
              title={ready ? `Show the ${label.toLowerCase()} written for this idea` : `Write ${kind === "headlines" ? "headlines" : `a ${label.toLowerCase()}`} from this idea and its posts`}
              className={`inline-flex items-center gap-1.5 h-8 rounded-lg px-2.5 text-[12.5px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-50 ${
                on
                  ? "border-sky-300 dark:border-sky-500/50 bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-200"
                  : "border-black/[0.08] dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {busy === kind ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : <Icon size={14} className={on ? "" : "text-slate-400"} />}
              {label}
              {ready && busy !== kind && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              {ready && <span className="sr-only">(written)</span>}
            </button>
          )
        })}
      </div>

      <div id={panelId} aria-live="polite">
        {meta && (
          <section aria-label={meta.label} aria-busy={writing} className="mt-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-prose">{meta.note}</p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label={`Hide the ${meta.label.toLowerCase()}`}
                className="-mr-1.5 -mt-1 shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
              >
                <ChevronUp size={16} />
              </button>
            </div>

            {writing ? (
              <div className="mt-3">
                <p className="inline-flex items-center gap-2 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">
                  <Loader2 size={15} className="animate-spin motion-reduce:animate-none text-sky-600" />
                  {meta.writing}. About ten seconds.
                </p>
                <div className="mt-3 space-y-2" aria-hidden>
                  <div className="shimmer h-3.5 rounded w-11/12" />
                  <div className="shimmer h-3.5 rounded w-9/12" />
                  <div className="shimmer h-3.5 rounded w-10/12" />
                </div>
                {unsaved && <p className="mt-3 text-[12px] text-slate-400">Drafting saves this idea to your board, so the draft stays with it.</p>}
              </div>
            ) : error ? (
              <div className="mt-3" role="alert">
                <p className="text-[13.5px] text-rose-700 dark:text-rose-400">{error}</p>
                <button
                  type="button"
                  onClick={() => void write(meta.kind, !!draft)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-sky-700 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
                >
                  <RefreshCw size={13} /> Try again
                </button>
              </div>
            ) : draft ? (
              <>
                <div className="mt-3.5">
                  {draft.kind === "blog_outline" ? <Outline o={draft.content} /> : draft.kind === "linkedin_post" ? <Post p={draft.content} /> : <Headlines h={draft.content} />}
                </div>
                <div className="mt-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] text-slate-400">Written {fmtDate(draft.updatedAt)}</span>
                  <span className="flex items-center gap-1">
                    <CopyButton text={() => draftText(draft)} label={draft.kind === "headlines" ? "Copy all" : "Copy"} />
                    <button
                      type="button"
                      onClick={() => (replacing ? void write(meta.kind, true) : setReplacing(true))}
                      title="Write a new one in place of this one"
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
                        replacing ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <RefreshCw size={14} /> {replacing ? "Replace this one?" : "Write another"}
                    </button>
                  </span>
                </div>
              </>
            ) : null}
          </section>
        )}
      </div>
    </div>
  )
}
