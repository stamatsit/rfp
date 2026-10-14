/**
 * Idea board: content ideas you saved from any topic, as frozen copies with
 * the posts behind them, and where each one stands (new, pitched, in progress,
 * published, dropped). Each person's board is their own. Wide screens show a
 * column per status; narrow ones a list with status filters. Every card opens
 * the idea panel, with its outline, posts and drafts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Bookmark, ChevronDown, Trash2 } from "lucide-react"
import { toast } from "@/hooks/useToast"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { DraftKind, IdeaDraft, IdeaStatus, SavedIdea } from "@/types/listening"
import { cn } from "@/lib/utils"
import { IdeaPanel, type PanelIdea } from "./IdeaPanel"
import { ideaText } from "./report/Ideas"
import { AUDIENCE_LABEL, Card, CopyButton, IDEA_STATUS, IDEA_STATUS_ORDER, Tag, fmtDate } from "./ui"
import { Button, Chip, ring, tone } from "./primitives"

const COLUMNS: IdeaStatus[] = ["new", "pitched", "in_progress", "published"]
const DRAFT_SHORT: Record<DraftKind, string> = { blog_outline: "outline", linkedin_post: "LinkedIn post", headlines: "headlines" }

function toPanel(s: SavedIdea): PanelIdea {
  const i = s.idea
  return {
    key: s.id,
    headline: i.headline,
    angle: i.angle,
    whyNow: i.whyNow || null,
    outline: i.outline,
    format: i.format,
    audience: i.audience,
    subtopic: i.subtopic ? { id: null, name: i.subtopic } : null,
    sources: s.sources.map((x) => ({ url: x.url, platform: x.platform, text: x.text, quoted: false, publishedAt: x.publishedAt })),
  }
}

function StatusSelect({ value, onChange, label, className = "" }: { value: IdeaStatus; onChange: (s: IdeaStatus) => void; label: string; className?: string }) {
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="pointer-events-none absolute left-2.5 w-2 h-2 rounded-full" style={{ background: IDEA_STATUS[value].dot }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as IdeaStatus)}
        className={`h-8 appearance-none rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-6 pr-7 text-[12.5px] font-medium text-slate-800 dark:text-slate-200 cursor-pointer ${ring}`}
      >
        {IDEA_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {IDEA_STATUS[s].label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden className="pointer-events-none absolute right-2 text-slate-500" />
    </label>
  )
}

/** One saved idea, compact: opens the panel; the status changes in place. */
function SavedCard({ s, drafts, onOpen, onStatus, dense }: { s: SavedIdea; drafts: IdeaDraft[]; onOpen: () => void; onStatus: (status: IdeaStatus) => void; dense?: boolean }) {
  const i = s.idea
  return (
    <li className={cn("group relative rounded-2xl border bg-white dark:bg-slate-900 border-black/[0.07] dark:border-white/[0.08] hover:border-black/[0.14] dark:hover:border-white/[0.16] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow]", dense ? "p-4" : "p-4 sm:p-5", s.status === "dropped" && "opacity-75")}>
      <div className="flex items-center justify-between gap-2">
        <StatusSelect value={s.status} onChange={onStatus} label={`Status of ${i.headline}`} className="relative z-10" />
        <span className={`min-w-0 truncate text-[12px] ${tone.muted}`}>{s.topicQuery}</span>
      </div>
      <h3 className={cn("mt-2.5 font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white text-balance", dense ? "text-[14.5px]" : "text-[16px]", s.status === "dropped" && "line-through decoration-slate-400")}>
        <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-sky-500/60 group-hover:text-sky-800 dark:group-hover:text-sky-300 transition-colors">
          {i.headline}
        </button>
      </h3>
      {!dense && <p className={`mt-1 text-[13.5px] leading-relaxed line-clamp-2 ${tone.body}`}>{i.angle}</p>}
      <div className={`mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] ${tone.muted}`}>
        <Tag tone="teal">{i.format}</Tag>
        <span>For {AUDIENCE_LABEL[i.audience].toLowerCase()}</span>
        <span aria-hidden>·</span>
        <span>{s.sources.length} posts</span>
      </div>
      {drafts.length > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {drafts.map((d) => DRAFT_SHORT[d.kind]).join(", ")} written
        </p>
      )}
    </li>
  )
}

export function IdeaBoard() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [ideas, setIdeas] = useState<SavedIdea[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, IdeaDraft[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<IdeaStatus | "all">("all")
  const [topic, setTopic] = useState<string>("all")
  const [showDropped, setShowDropped] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  useDocumentTitle("Idea board · Topic Ideation")
  const openKey = params.get("idea")
  // Opened here (not from a pasted link): closing steps back over that history entry, so Back leaves the board.
  const pushed = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await listeningApi.ideas()
      setIdeas(r.ideas)
      setDrafts(r.drafts ?? {})
      setError(null)
    } catch (err) {
      if ((err as { status?: number }).status === 401) navigate("/login", { replace: true })
      else setError("Could not load your idea board. Check your connection and try again.")
    }
  }, [navigate])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!confirmRemove) return
    const t = window.setTimeout(() => setConfirmRemove(null), 3500)
    return () => window.clearTimeout(t)
  }, [confirmRemove])

  const counts = useMemo(() => {
    const c = Object.fromEntries(IDEA_STATUS_ORDER.map((s) => [s, 0])) as Record<IdeaStatus, number>
    for (const i of ideas ?? []) if (topic === "all" || i.topicQuery === topic) c[i.status]++
    return c
  }, [ideas, topic])
  const topics = useMemo(() => [...new Set((ideas ?? []).map((i) => i.topicQuery))].sort((a, b) => a.localeCompare(b)), [ideas])
  const inTopic = (ideas ?? []).filter((i) => topic === "all" || i.topicQuery === topic)
  const shown = inTopic.filter((i) => status === "all" || i.status === status)
  // The panel steps through what is on screen: the filtered list on a phone, the columns in order on a wide screen.
  const panelList = useMemo(() => {
    const ordered = [...COLUMNS, "dropped" as IdeaStatus].flatMap((st) => inTopic.filter((i) => i.status === st))
    return (status === "all" ? ordered : shown).map(toPanel)
  }, [inTopic, shown, status])
  const byId = useMemo(() => new Map((ideas ?? []).map((i) => [i.id, i])), [ideas])

  const changeStatus = async (id: string, next: IdeaStatus) => {
    const before = ideas
    setIdeas((list) => list?.map((i) => (i.id === id ? { ...i, status: next } : i)) ?? list)
    try {
      await listeningApi.setIdeaStatus(id, next)
    } catch (err) {
      setIdeas(before)
      toast.error((err as ListeningApiError).message ?? "Could not change the status")
    }
  }
  const remove = async (id: string) => {
    try {
      await listeningApi.removeIdea(id)
      if (openKey === id) closePanel()
      setIdeas((list) => list?.filter((i) => i.id !== id) ?? list)
      toast.info("Removed from your idea board")
    } catch (err) {
      toast.error((err as ListeningApiError).message ?? "Could not remove the idea")
    }
  }
  const openPanel = (id: string, replace = false) => {
    if (!replace) pushed.current = true
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        q.set("idea", id)
        return q
      },
      { replace },
    )
  }
  const closePanel = () => {
    if (pushed.current) {
      pushed.current = false
      navigate(-1)
      return
    }
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        q.delete("idea")
        return q
      },
      { replace: true },
    )
  }

  const card = (s: SavedIdea, dense = false) => (
    <SavedCard key={s.id} s={s} drafts={drafts[s.id] ?? []} dense={dense} onOpen={() => openPanel(s.id)} onStatus={(next) => void changeStatus(s.id, next)} />
  )
  const dropped = inTopic.filter((i) => i.status === "dropped")

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.025em] leading-tight text-slate-900 dark:text-white">Idea board</h1>
          <p className={`text-[14px] mt-1.5 max-w-2xl ${tone.muted}`}>Ideas you saved from any topic, with the posts behind them and any drafts you started. Saved copies stay as they are when a topic is rescanned.</p>
        </div>
        {shown.length > 0 && (
          <CopyButton text={() => shown.map((s) => ideaText(toPanel(s))).join("\n\n---\n\n")} label={`Copy ${shown.length === 1 ? "idea" : `${shown.length} ideas`}`} className="h-10 !px-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] shrink-0" />
        )}
      </header>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-[14.5px] text-slate-700 dark:text-slate-200">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : ideas === null ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading ideas">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="shimmer h-56 rounded-2xl" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <Card className="p-10 text-center">
          <Bookmark size={22} className="mx-auto text-slate-400" />
          <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100 mt-3">No saved ideas yet</p>
          <p className={`text-[13.5px] mt-1.5 max-w-md mx-auto ${tone.muted}`}>Open a topic, then Save any content idea, or write a draft from one. It lands here with its outline and posts, ready to pitch.</p>
          <Link to="/listening" className={`inline-block mt-5 text-[13.5px] ${tone.link}`}>
            Go to your topics
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap items-center gap-1.5 lg:hidden" role="group" aria-label="Filter by status">
              <Chip on={status === "all"} onClick={() => setStatus("all")} count={inTopic.length}>
                All
              </Chip>
              {IDEA_STATUS_ORDER.map((s) =>
                counts[s] > 0 || status === s ? (
                  <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? "all" : s)} dot={IDEA_STATUS[s].dot} count={counts[s]}>
                    {IDEA_STATUS[s].label}
                  </Chip>
                ) : null,
              )}
            </div>
            {topics.length > 1 && (
              <label className="relative lg:ml-auto">
                <span className="sr-only">Filter by topic</span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={`h-9 appearance-none rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-3 pr-8 text-[13px] text-slate-800 dark:text-slate-200 cursor-pointer ${ring}`}
                >
                  <option value="all">All topics</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </label>
            )}
          </div>

          {/* Narrow screens: one filtered list. */}
          <div className="lg:hidden">
            {shown.length === 0 ? (
              <Card className={`p-8 text-center text-[14px] ${tone.body}`}>
                Nothing matches these filters.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setStatus("all")
                    setTopic("all")
                  }}
                  className={tone.link}
                >
                  Show everything
                </button>
              </Card>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2" aria-label="Saved ideas">
                {shown.map((s) => card(s))}
              </ul>
            )}
          </div>

          {/* Wide screens: a column per status, dropped ideas tucked away below. */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-4 gap-4 items-start">
              {COLUMNS.map((col) => {
                const list = inTopic.filter((i) => i.status === col)
                return (
                  <section key={col} aria-label={`${IDEA_STATUS[col].label}: ${list.length}`} className="rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] p-2.5 min-h-[160px]">
                    <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: IDEA_STATUS[col].dot }} />
                      {IDEA_STATUS[col].label}
                      <span className={`font-medium tabular-nums ${tone.muted}`}>{list.length}</span>
                    </h2>
                    {list.length === 0 ? (
                      <p className={`px-1.5 pb-2 text-[12.5px] ${tone.muted}`}>{col === "new" ? "Ideas you save start here." : "Move ideas here with their status."}</p>
                    ) : (
                      <ul className="space-y-2.5">{list.map((s) => card(s, true))}</ul>
                    )}
                  </section>
                )
              })}
            </div>
            {dropped.length > 0 && (
              <div className="mt-6">
                <button type="button" onClick={() => setShowDropped((d) => !d)} aria-expanded={showDropped} className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-300 rounded ${ring}`}>
                  <ChevronDown size={15} className={`transition-transform ${showDropped ? "rotate-180" : ""}`} />
                  Dropped <span className={`tabular-nums ${tone.muted}`}>{dropped.length}</span>
                </button>
                {showDropped && <ul className="mt-3 grid grid-cols-4 gap-3">{dropped.map((s) => card(s, true))}</ul>}
              </div>
            )}
          </div>
        </>
      )}

      <IdeaPanel
        ideas={panelList}
        openKey={openKey && byId.has(openKey) ? openKey : null}
        onOpen={(key) => openPanel(key, true)}
        onClose={closePanel}
        draftTarget={(i) => ({ savedId: i.key })}
        drafts={(i) => drafts[i.key] ?? []}
        onDrafted={(i, _saved, draft) => setDrafts((d) => ({ ...d, [i.key]: [...(d[i.key] ?? []).filter((x) => x.kind !== draft.kind), draft] }))}
        context={(i) => {
          const s = byId.get(i.key)
          if (!s) return null
          return (
            <p className={`mb-3 text-[12.5px] ${tone.muted}`}>
              From{" "}
              {s.topicId ? (
                <Link to={`/listening/${s.topicId}`} className={tone.link}>
                  {s.topicQuery}
                </Link>
              ) : (
                <span title="This topic was deleted; the idea and its posts are kept">{s.topicQuery} (topic deleted)</span>
              )}{" "}
              · saved {fmtDate(s.createdAt)}
            </p>
          )
        }}
        actions={(i) => {
          const s = byId.get(i.key)
          if (!s) return null
          return (
            <>
              <StatusSelect value={s.status} onChange={(next) => void changeStatus(s.id, next)} label={`Status of ${s.idea.headline}`} />
              <CopyButton text={() => ideaText(i)} label="Copy idea" className="h-8 border border-black/[0.08] dark:border-white/[0.1]" />
              <Button size="sm" variant={confirmRemove === s.id ? "danger" : "ghost"} onClick={() => (confirmRemove === s.id ? void remove(s.id) : setConfirmRemove(s.id))}>
                <Trash2 size={14} />
                {confirmRemove === s.id ? ((drafts[s.id]?.length ?? 0) > 0 ? "Remove, drafts too?" : "Click to remove") : "Remove"}
              </Button>
            </>
          )
        }}
      />
    </div>
  )
}
