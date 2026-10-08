/**
 * Idea board: content ideas you saved from any topic, as frozen copies with
 * the posts behind them, and where each one stands (new, pitched, in progress,
 * published, dropped). Each person's board is their own.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowUpRight, Bookmark, ChevronDown, ChevronLeft, Trash2 } from "lucide-react"
import { toast } from "@/hooks/useToast"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { IdeaStatus, SavedIdea } from "@/types/listening"
import { AUDIENCE_LABEL, Card, CopyButton, ExternalLink, IDEA_STATUS, IDEA_STATUS_ORDER, PlatformBadge, Tag, fmtDate, plural } from "./ui"

function ideaText(s: SavedIdea): string {
  const i = s.idea
  return [
    i.headline,
    "",
    i.angle,
    `Format: ${i.format}. Audience: ${AUDIENCE_LABEL[i.audience]}. Topic: ${s.topicQuery}.`,
    i.whyNow ? `Why now: ${i.whyNow}` : "",
    "",
    i.outline.length ? "Outline:" : "",
    ...i.outline.map((o) => `- ${o}`),
    "",
    "Sources:",
    ...s.sources.map((x) => `- ${x.url}`),
  ]
    .filter((l, n, a) => !(l === "" && a[n - 1] === ""))
    .join("\n")
    .trim()
}

function StatusSelect({ value, onChange, label }: { value: IdeaStatus; onChange: (s: IdeaStatus) => void; label: string }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="pointer-events-none absolute left-2.5 w-2 h-2 rounded-full" style={{ background: IDEA_STATUS[value].dot }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as IdeaStatus)}
        className="h-8 appearance-none rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-6 pr-7 text-[12.5px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        {IDEA_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {IDEA_STATUS[s].label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden className="pointer-events-none absolute right-2 text-slate-400" />
    </label>
  )
}

function SavedIdeaCard({ s, onStatus, onRemove }: { s: SavedIdea; onStatus: (status: IdeaStatus) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!confirm) return
    const t = window.setTimeout(() => setConfirm(false), 3500)
    return () => window.clearTimeout(t)
  }, [confirm])
  const i = s.idea
  return (
    <Card className={`p-5 flex flex-col ${s.status === "dropped" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusSelect value={s.status} onChange={onStatus} label={`Status of ${i.headline}`} />
        <span className="text-[12px] text-slate-400 truncate max-w-[60%]">
          {s.topicId ? (
            <Link to={`/listening/${s.topicId}`} className="hover:text-sky-700 dark:hover:text-sky-400 hover:underline">
              {s.topicQuery}
            </Link>
          ) : (
            <span title="This topic was deleted; the idea and its sources are kept">{s.topicQuery} (topic deleted)</span>
          )}
        </span>
      </div>
      <h3 className={`text-[17px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white mt-3 text-balance ${s.status === "dropped" ? "line-through decoration-slate-400" : ""}`}>
        {i.headline}
      </h3>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <Tag tone="teal">{i.format}</Tag>
        <Tag>For {AUDIENCE_LABEL[i.audience].toLowerCase()}</Tag>
        {i.subtopic && <Tag>{i.subtopic}</Tag>}
      </div>
      <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300 mt-3">{i.angle}</p>
      {i.whyNow && (
        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Why now: </span>
          {i.whyNow}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded"
      >
        {i.outline.length ? "Outline and " : ""}
        {plural(s.sources.length, "source")}
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
          {i.outline.length > 0 && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2">Outline</p>
              <ol className="space-y-1.5 text-[13.5px] text-slate-700 dark:text-slate-200 list-decimal pl-5 marker:text-slate-400 mb-4">
                {i.outline.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
            </>
          )}
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">Based on these posts</p>
          <ul className="mt-3 space-y-2.5">
            {s.sources.map((x) => (
              <li key={x.url}>
                <ExternalLink href={x.url} className="group block rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 hover:border-sky-300 dark:hover:border-sky-500/40 transition-colors">
                  <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-3">{x.text}</p>
                  <span className="flex items-center gap-2 mt-2 text-[12px] text-slate-500">
                    <PlatformBadge platform={x.platform} />
                    {x.publishedAt && <span>{fmtDate(x.publishedAt)}</span>}
                    <span className="ml-auto inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 opacity-80 group-hover:opacity-100">
                      Open <ArrowUpRight size={13} />
                    </span>
                  </span>
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[12px] text-slate-400">
        <span>Saved {fmtDate(s.createdAt)}</span>
        <span className="flex items-center gap-1">
          <CopyButton text={() => ideaText(s)} label="Copy" />
          <button
            type="button"
            onClick={() => (confirm ? onRemove() : setConfirm(true))}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 ${
              confirm ? "bg-rose-600 text-white hover:bg-rose-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Trash2 size={14} />
            {confirm ? "Click to remove" : "Remove"}
          </button>
        </span>
      </div>
    </Card>
  )
}

export function IdeaBoard() {
  const navigate = useNavigate()
  const [ideas, setIdeas] = useState<SavedIdea[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<IdeaStatus | "all">("all")
  const [topic, setTopic] = useState<string>("all")
  useDocumentTitle("Idea board · Topic Ideation")

  const load = useCallback(async () => {
    try {
      setIdeas((await listeningApi.ideas()).ideas)
      setError(null)
    } catch (err) {
      if ((err as { status?: number }).status === 401) navigate("/login", { replace: true })
      else setError("Could not load your idea board. Check your connection and try again.")
    }
  }, [navigate])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = Object.fromEntries(IDEA_STATUS_ORDER.map((s) => [s, 0])) as Record<IdeaStatus, number>
    for (const i of ideas ?? []) c[i.status]++
    return c
  }, [ideas])
  const topics = useMemo(() => [...new Set((ideas ?? []).map((i) => i.topicQuery))].sort((a, b) => a.localeCompare(b)), [ideas])
  const shown = (ideas ?? []).filter((i) => (status === "all" || i.status === status) && (topic === "all" || i.topicQuery === topic))

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
      setIdeas((list) => list?.filter((i) => i.id !== id) ?? list)
      toast.info("Removed from your idea board")
    } catch (err) {
      toast.error((err as ListeningApiError).message ?? "Could not remove the idea")
    }
  }

  const chip = (value: IdeaStatus | "all", label: string, n: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={status === value}
      onClick={() => setStatus(value)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
        status === value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {value !== "all" && <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: IDEA_STATUS[value].dot }} />}
      {label}
      <span className={`tabular-nums ${status === value ? "opacity-70" : "text-slate-400"}`}>{n}</span>
    </button>
  )

  return (
    <div>
      <Link to="/listening" className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 -ml-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">
        <ChevronLeft size={16} /> All topics
      </Link>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-3 mb-6">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.025em] leading-tight text-slate-900 dark:text-white">Idea board</h1>
          <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">
            Ideas you saved from your topics, with the posts behind them. Saved copies stay as they are when a topic is rescanned.
          </p>
        </div>
        {shown.length > 0 && <CopyButton text={() => shown.map(ideaText).join("\n\n---\n\n")} label={`Copy ${shown.length === 1 ? "idea" : `${shown.length} ideas`}`} className="h-10 !px-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] shrink-0" />}
      </header>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-[14.5px] text-slate-700 dark:text-slate-200">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 text-[13.5px] font-medium text-sky-700 dark:text-sky-400 hover:underline">
            Try again
          </button>
        </Card>
      ) : ideas === null ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading ideas">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="shimmer h-56 rounded-2xl" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <Card className="p-10 text-center">
          <Bookmark size={22} className="mx-auto text-slate-300" />
          <p className="text-[15px] font-medium text-slate-800 dark:text-slate-100 mt-3">No saved ideas yet</p>
          <p className="text-[13.5px] text-slate-500 mt-1.5 max-w-md mx-auto">Open a topic and press Save on any content idea. It lands here with its outline and sources, ready to pitch.</p>
          <Link to="/listening" className="inline-block mt-5 text-[13.5px] font-medium text-sky-700 dark:text-sky-400 hover:underline">
            Go to your topics
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by status">
              {chip("all", "All", ideas.length)}
              {IDEA_STATUS_ORDER.map((s) => (counts[s] > 0 || status === s ? chip(s, IDEA_STATUS[s].label, counts[s]) : null))}
            </div>
            {topics.length > 1 && (
              <label className="relative">
                <span className="sr-only">Filter by topic</span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-9 appearance-none rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 pl-3 pr-8 text-[13px] text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  <option value="all">All topics</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </label>
            )}
          </div>
          {shown.length === 0 ? (
            <Card className="p-8 text-center text-[14px] text-slate-500">
              Nothing matches these filters.{" "}
              <button
                type="button"
                onClick={() => {
                  setStatus("all")
                  setTopic("all")
                }}
                className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
              >
                Show everything
              </button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 items-start">
              {shown.map((s) => (
                <SavedIdeaCard key={s.id} s={s} onStatus={(next) => void changeStatus(s.id, next)} onRemove={() => void remove(s.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
