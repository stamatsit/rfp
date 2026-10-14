/**
 * The idea panel: one content idea with everything needed to act on it. The
 * angle and why now, the outline and the posts behind it, and its three drafts
 * as tabs. Previous and next step through the list it was opened from (arrow
 * keys too), and the tab you are on stays put, so drafting the same thing for
 * every idea is one click each. Used by the topic page and the idea board.
 */
import { useEffect, useState, type ReactNode } from "react"
import { ArrowUpRight, ChevronLeft, ChevronRight, ListTree } from "lucide-react"
import type { Audience, DraftKind, IdeaDraft, Platform, SavedIdea, Sentiment } from "@/types/listening"
import { DRAFT_KINDS, DraftView, type DraftTarget } from "./IdeaDrafts"
import { AUDIENCE_LABEL, ExternalLink, NewBadge, PlatformBadge, SENTIMENT_LABEL, SentimentDot, Tag, fmtDate } from "./ui"
import { Button, SidePanel, Tabs, tabPanelProps, tone } from "./primitives"

export interface PanelSource {
  url: string
  platform: Platform
  text: string
  /** The text is a verbatim quote. */
  quoted: boolean
  sentiment?: Sentiment | null
  publishedAt?: string | null
}

export interface PanelIdea {
  /** The report idea id, or the saved idea id on the board. */
  key: string
  headline: string
  angle: string
  whyNow: string | null
  outline: string[]
  format: string
  audience: Audience
  subtopic: { id: string | null; name: string } | null
  sources: PanelSource[]
  isNew?: boolean
}

type PanelTab = "idea" | DraftKind

export function IdeaPanel({
  ideas,
  openKey,
  onOpen,
  onClose,
  draftTarget,
  aliasTarget,
  drafts,
  onDrafted,
  actions,
  context,
  onSubtopic,
}: {
  ideas: PanelIdea[]
  openKey: string | null
  /** Open another idea from the same list (previous, next). */
  onOpen: (key: string) => void
  onClose: () => void
  draftTarget: (idea: PanelIdea) => DraftTarget
  aliasTarget?: (idea: PanelIdea) => DraftTarget | undefined
  drafts: (idea: PanelIdea) => IdeaDraft[]
  onDrafted: (idea: PanelIdea, saved: SavedIdea, draft: IdeaDraft) => void
  /** The row of actions under the headline: save and thumbs, or status and remove. */
  actions: (idea: PanelIdea) => ReactNode
  /** A line above the chips, such as the topic an idea came from. */
  context?: (idea: PanelIdea) => ReactNode
  onSubtopic?: (id: string) => void
}) {
  const index = openKey ? ideas.findIndex((i) => i.key === openKey) : -1
  const idea = index >= 0 ? ideas[index]! : null
  const [tab, setTab] = useState<PanelTab>("idea")
  const prev = index > 0 ? ideas[index - 1]! : null
  const next = index >= 0 && index < ideas.length - 1 ? ideas[index + 1]! : null

  // Left and right arrows step through ideas, unless you are typing or on the tab row.
  useEffect(() => {
    if (!idea) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="slider"]')) return
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault()
        onOpen(prev.key)
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault()
        onOpen(next.key)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [idea, prev, next, onOpen])

  // Each idea opens at the top.
  const openIdeaKey = idea?.key
  useEffect(() => {
    if (openIdeaKey) document.querySelector("[data-panel-scroll]")?.scrollTo({ top: 0 })
  }, [openIdeaKey])

  const written = idea ? drafts(idea) : []
  const tabs = [
    { id: "idea" as PanelTab, label: "Outline and posts", short: "Idea" },
    ...DRAFT_KINDS.map((k) => ({ id: k.kind as PanelTab, label: k.label, short: k.short, done: written.some((d) => d.kind === k.kind) })),
  ]

  return (
    <SidePanel
      open={!!idea}
      onOpenChange={(o) => !o && onClose()}
      title={idea ? `Idea ${index + 1} of ${ideas.length}: ${idea.headline}` : "Idea"}
      header={
        idea && (
          <>
            <Button variant="ghost" size="icon" onClick={() => prev && onOpen(prev.key)} disabled={!prev} aria-label="Previous idea" title="Previous idea (Left arrow)">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => next && onOpen(next.key)} disabled={!next} aria-label="Next idea" title="Next idea (Right arrow)">
              <ChevronRight size={18} />
            </Button>
            <span className={`ml-1 text-[13px] font-medium tabular-nums ${tone.muted}`}>
              Idea {index + 1} of {ideas.length}
            </span>
          </>
        )
      }
    >
      {idea && (
        <div className="px-5 sm:px-8 py-6">
          {context?.(idea)}
          <div className="flex flex-wrap items-center gap-1.5">
            {idea.isNew && <NewBadge />}
            <Tag tone="teal">{idea.format}</Tag>
            <Tag>For {AUDIENCE_LABEL[idea.audience].toLowerCase()}</Tag>
            {idea.subtopic &&
              (onSubtopic && idea.subtopic.id ? (
                <button
                  type="button"
                  onClick={() => onSubtopic(idea.subtopic!.id!)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  title="Open this subtopic"
                >
                  <ListTree size={12} /> {idea.subtopic.name}
                </button>
              ) : (
                <Tag>{idea.subtopic.name}</Tag>
              ))}
          </div>
          <h2 className="mt-3 text-[24px] sm:text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-slate-900 dark:text-white text-balance">{idea.headline}</h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-slate-700 dark:text-slate-200">{idea.angle}</p>
          {idea.whyNow && (
            <div className="mt-4 rounded-xl bg-amber-50/70 dark:bg-amber-500/[0.07] border border-amber-200/60 dark:border-amber-500/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-amber-800 dark:text-amber-300">Why now</p>
              <p className="mt-1 text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">{idea.whyNow}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">{actions(idea)}</div>

          <div className="mt-7 -mx-1 border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
            <Tabs tabs={tabs} active={tab} onChange={setTab} label="About this idea" idBase="idea-panel" size="sm" />
          </div>

          <div {...tabPanelProps("idea-panel", "idea", tab)} className="pt-5 focus:outline-none">
            {idea.outline.length > 0 && (
              <>
                <p className={tone.label}>Outline</p>
                <ol className="mt-2.5 space-y-2 text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-100 list-decimal pl-5 marker:text-slate-500 marker:font-medium">
                  {idea.outline.map((o, i) => (
                    <li key={i} className="pl-1">
                      {o}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className={`${tone.label} ${idea.outline.length ? "mt-7" : ""}`}>Based on {idea.sources.length === 1 ? "this post" : `these ${idea.sources.length} posts`}</p>
            <ul className="mt-3 space-y-2.5">
              {idea.sources.map((s) => (
                <li key={s.url}>
                  <ExternalLink
                    href={s.url}
                    className="group block rounded-xl border border-black/[0.07] dark:border-white/[0.09] p-3.5 hover:border-sky-300 dark:hover:border-sky-500/40 hover:bg-sky-50/40 dark:hover:bg-sky-500/[0.04] transition-colors"
                  >
                    <p className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">{s.quoted ? `“${s.text}”` : s.text}</p>
                    <span className={`flex items-center gap-2.5 mt-2.5 text-[12px] ${tone.muted}`}>
                      <PlatformBadge platform={s.platform} />
                      {s.sentiment && (
                        <span className="inline-flex items-center gap-1.5">
                          <SentimentDot tone={s.sentiment} />
                          {SENTIMENT_LABEL[s.sentiment]}
                        </span>
                      )}
                      {s.publishedAt && <span>{fmtDate(s.publishedAt)}</span>}
                      <span className="ml-auto inline-flex items-center gap-0.5 font-medium text-sky-700 dark:text-sky-400">
                        Open <ArrowUpRight size={13} />
                      </span>
                    </span>
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </div>

          {DRAFT_KINDS.map(({ kind }) => (
            <div key={kind} {...tabPanelProps("idea-panel", kind, tab)} className="pt-5 focus:outline-none">
              {tab === kind && (
                <DraftView
                  key={`${idea.key}-${kind}`}
                  kind={kind}
                  target={draftTarget(idea)}
                  aliasTarget={aliasTarget?.(idea)}
                  draft={written.find((d) => d.kind === kind) ?? null}
                  sourceCount={idea.sources.length}
                  onDrafted={(saved, draft) => onDrafted(idea, saved, draft)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  )
}
