/**
 * Drafts from an idea: a blog outline, a LinkedIn post or headlines, written
 * from the idea and its posts. A blog gets an outline only; the team writes
 * its own articles. One draft of each kind is kept with the saved idea, so
 * opening it again costs nothing and "Write another" replaces it. Shown as
 * tabs in the idea panel, on the topic page and on the idea board.
 *
 * A draft being written keeps going if you step to another idea; coming back
 * shows it still writing, and nothing is asked for twice.
 */
import { useEffect, useState, useSyncExternalStore } from "react"
import { ArrowUpRight, FileText, Loader2, MessageSquareText, RefreshCw, Sparkles, Type } from "lucide-react"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { BlogOutline, DraftKind, HeadlineSet, IdeaDraft, LinkedInPost, SavedIdea } from "@/types/listening"
import { CopyButton, ExternalLink, PLATFORM, Tag, fmtDate } from "./ui"
import { Button, tone } from "./primitives"

export type DraftTarget = { savedId: string } | { topicId: string; ideaId: string }

export const DRAFT_KINDS: Array<{ kind: DraftKind; label: string; short: string; Icon: typeof FileText; verb: string; writing: string; note: string }> = [
  {
    kind: "blog_outline",
    label: "Blog outline",
    short: "Blog",
    Icon: FileText,
    verb: "Write a blog outline",
    writing: "Writing an outline",
    note: "Notes to write from, built only from this idea and its posts. The article is yours to write.",
  },
  {
    kind: "linkedin_post",
    label: "LinkedIn post",
    short: "LinkedIn",
    Icon: MessageSquareText,
    verb: "Write a LinkedIn post",
    writing: "Writing a post",
    note: "A first draft to edit in your own voice. Check it against the posts before you publish.",
  },
  {
    kind: "headlines",
    label: "Headlines",
    short: "Headlines",
    Icon: Type,
    verb: "Write headlines",
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

// ─── drafts being written, across panel navigation ──────────────────────────

const pending = new Map<string, { error: string | null; running: boolean }>()
const listeners = new Set<() => void>()
let version = 0
const bump = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const targetKey = (t: DraftTarget, kind: DraftKind) => `${"savedId" in t ? `s:${t.savedId}` : `t:${t.topicId}:${t.ideaId}`}:${kind}`

async function writeDraft(target: DraftTarget, kind: DraftKind, fresh: boolean, onDrafted: (idea: SavedIdea, draft: IdeaDraft) => void, aliasKey?: string) {
  const key = targetKey(target, kind)
  if (pending.get(key)?.running) return
  pending.set(key, { running: true, error: null })
  if (aliasKey) pending.set(aliasKey, { running: true, error: null })
  bump()
  try {
    const r = await listeningApi.draft(target, kind, fresh)
    onDrafted(r.idea, r.draft)
    pending.delete(key)
    if (aliasKey) pending.delete(aliasKey)
  } catch (err) {
    const message = (err as ListeningApiError).message ?? "The draft could not be written this time. Try again."
    pending.set(key, { running: false, error: message })
    if (aliasKey) pending.set(aliasKey, { running: false, error: message })
  }
  bump()
}

// ─── the three draft shapes ─────────────────────────────────────────────────

function Outline({ o }: { o: BlogOutline }) {
  return (
    <div>
      <p className="text-[17px] font-semibold leading-snug text-slate-900 dark:text-white text-balance">{o.workingTitle}</p>
      <dl className={`mt-3 space-y-1.5 text-[14px] leading-relaxed ${tone.body}`}>
        <div>
          <dt className="inline font-semibold text-slate-800 dark:text-slate-100">Reader: </dt>
          <dd className="inline">{o.reader}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-800 dark:text-slate-100">Angle: </dt>
          <dd className="inline">{o.angle}</dd>
        </div>
      </dl>
      <ol className="mt-5 space-y-5">
        {o.sections.map((s, n) => (
          <li key={`${n}-${s.heading}`} className="flex gap-3.5">
            <span aria-hidden className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center text-[12px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              {n + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{s.heading}</p>
              <ul className={`mt-1.5 space-y-1 text-[14px] leading-relaxed list-disc pl-4 marker:text-slate-400 ${tone.body}`}>
                {s.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {s.sources.length > 0 && (
                <p className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] ${tone.muted}`}>
                  Answers
                  {s.sources.map((x, i) => (
                    <ExternalLink key={`${i}-${x.url}`} href={x.url} className={`inline-flex items-center gap-0.5 ${tone.link}`}>
                      {(PLATFORM[x.platform] ?? PLATFORM.other).label} post <ArrowUpRight size={12} />
                    </ExternalLink>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className={`mt-5 text-[14px] leading-relaxed ${tone.body}`}>
        <span className="font-semibold text-slate-800 dark:text-slate-100">To close: </span>
        {o.close}
      </p>
    </div>
  )
}

function Post({ p }: { p: LinkedInPost }) {
  const words = p.post.split(/\s+/).filter(Boolean).length
  return (
    <div>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-black/[0.05] dark:border-white/[0.06] px-4 py-4 text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line">{p.post}</div>
      {p.hashtags.length > 0 && <p className="mt-2.5 text-[13.5px] text-sky-700 dark:text-sky-400">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>}
      <p className={`mt-2 text-[12.5px] tabular-nums ${tone.muted}`}>
        {words} words, {p.post.length.toLocaleString("en-US")} characters
      </p>
    </div>
  )
}

function Headlines({ h }: { h: HeadlineSet }) {
  return (
    <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06] -my-2">
      {h.headlines.map((x, i) => (
        <li key={i} className="flex items-center gap-2 py-2">
          <span className="min-w-0 flex-1 text-[14.5px] leading-snug text-slate-800 dark:text-slate-100">{x.text}</span>
          <span className="hidden sm:inline-flex shrink-0">
            <Tag>{x.style}</Tag>
          </span>
          <span className={`w-7 shrink-0 text-right text-[12px] tabular-nums ${x.text.length > 60 ? "text-amber-700 dark:text-amber-400 font-semibold" : tone.muted}`} title={`${x.text.length} characters`}>
            {x.text.length}
          </span>
          <CopyButton text={x.text} label="" done="" ariaLabel={`Copy headline: ${x.text}`} className="!px-1.5 shrink-0" />
        </li>
      ))}
    </ul>
  )
}

/**
 * One kind of draft for one idea: an offer to write it, the writing, a failure
 * with Try again, or the draft with Copy and Write another.
 */
export function DraftView({
  kind,
  target,
  draft,
  sourceCount,
  onDrafted,
  aliasTarget,
}: {
  kind: DraftKind
  /** The saved idea, or a topic's idea that drafting will save first. */
  target: DraftTarget
  draft: IdeaDraft | null
  sourceCount: number
  onDrafted: (idea: SavedIdea, draft: IdeaDraft) => void
  /** The same idea's other address (its topic copy), so a write started from either shows on both. */
  aliasTarget?: DraftTarget
}) {
  useSyncExternalStore(subscribe, () => version)
  const meta = DRAFT_KINDS.find((k) => k.kind === kind)!
  const state = pending.get(targetKey(target, kind)) ?? (aliasTarget ? pending.get(targetKey(aliasTarget, kind)) : undefined) ?? null
  const writing = !!state?.running
  const error = state && !state.running ? state.error : null
  const unsaved = !("savedId" in target)
  // "Write another" replaces the draft, so it asks once.
  const [replacing, setReplacing] = useState(false)
  useEffect(() => {
    if (!replacing) return
    const t = window.setTimeout(() => setReplacing(false), 3500)
    return () => window.clearTimeout(t)
  }, [replacing])
  const write = (fresh: boolean) => {
    setReplacing(false)
    void writeDraft(target, kind, fresh, onDrafted, aliasTarget ? targetKey(aliasTarget, kind) : undefined)
  }

  if (writing) {
    return (
      <div aria-busy="true" aria-live="polite">
        <p className="inline-flex items-center gap-2 text-[14px] font-medium text-slate-800 dark:text-slate-100">
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none text-sky-600 dark:text-sky-400" />
          {meta.writing}. About ten seconds.
        </p>
        <div className="mt-4 space-y-2.5" aria-hidden>
          <div className="shimmer h-4 rounded w-11/12" />
          <div className="shimmer h-4 rounded w-9/12" />
          <div className="shimmer h-4 rounded w-10/12" />
          <div className="shimmer h-4 rounded w-7/12" />
        </div>
        {unsaved && <p className={`mt-4 text-[12.5px] ${tone.muted}`}>Drafting saves this idea to your board, so the draft stays with it.</p>}
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="rounded-2xl border border-dashed border-black/[0.12] dark:border-white/[0.14] px-5 py-8 text-center" aria-live="polite">
        <span className="mx-auto w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 inline-flex items-center justify-center">
          <meta.Icon size={18} />
        </span>
        <p className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-white">{meta.verb}</p>
        <p className={`mt-1 text-[13.5px] leading-relaxed max-w-sm mx-auto ${tone.muted}`}>
          {meta.note} Written from this idea and its {sourceCount === 1 ? "post" : `${sourceCount} posts`}.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[13.5px] text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button variant="primary" className="mt-4" onClick={() => write(false)}>
          {error ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {error ? "Try again" : meta.verb}
        </Button>
        <p className={`mt-2.5 text-[12px] ${tone.muted}`}>About ten seconds. Uses no searches.{unsaved ? " Saves the idea to your board." : ""}</p>
      </div>
    )
  }

  return (
    <div aria-live="polite">
      <p className={`text-[12.5px] leading-relaxed ${tone.muted}`}>{meta.note}</p>
      <div className="mt-4">{draft.kind === "blog_outline" ? <Outline o={draft.content} /> : draft.kind === "linkedin_post" ? <Post p={draft.content} /> : <Headlines h={draft.content} />}</div>
      {error && (
        <p role="alert" className="mt-4 text-[13.5px] text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[12.5px] ${tone.muted}`}>Written {fmtDate(draft.updatedAt)}</span>
        <span className="flex items-center gap-1.5">
          <CopyButton text={() => draftText(draft)} label={draft.kind === "headlines" ? "Copy all" : "Copy"} className="h-8 border border-black/[0.08] dark:border-white/[0.1]" />
          <Button
            size="sm"
            variant={replacing ? "primary" : "ghost"}
            onClick={() => (replacing ? write(true) : setReplacing(true))}
            title="Write a new one in place of this one"
          >
            <RefreshCw size={14} /> {replacing ? "Replace this one?" : "Write another"}
          </Button>
        </span>
      </div>
    </div>
  )
}
