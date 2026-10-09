import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertCircle, ChevronDown, ChevronLeft, Copy, Download, FileText, FileType2, Loader2, Lock, MoreHorizontal, RefreshCw, RotateCcw, Trash2, Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/hooks/useToast"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import type { useScan } from "@/hooks/useScan"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { ItemView, TopicDetail } from "@/types/listening"
import { ScanProgress } from "./ScanProgress"
import { Overview } from "./report/Overview"
import { Ideas, type IdeaSaving } from "./report/Ideas"
import { Questions } from "./report/Questions"
import { News, OwnVoice, Subtopics, Voices } from "./report/Subtopics"
import { Sources, type SourceView } from "./report/Sources"
import { Method } from "./report/Method"
import { exportDocx, exportPdf, type ExportInput } from "./exportReport"
import { ACCENT, Card, WINDOW_LABEL, personName, plural, reportMarkdown, sampleLabel, timeAgo } from "./ui"

type Scan = ReturnType<typeof useScan>

/** Runs whose completion was already handled. Module-level because pages remount on navigation. */
const settledRuns = new Set<string>()

function SectionNav({ ideas, questions, hasSubtopics, ownName }: { ideas: number; questions: number; hasSubtopics: boolean; ownName: string | null }) {
  const sections = [
    { id: "top", label: "Overview" },
    { id: "ideas", label: "Ideas", n: ideas },
    { id: "questions", label: "Questions", n: questions },
    ...(hasSubtopics ? [{ id: "subtopics", label: "Subtopics" }] : []),
    ...(ownName ? [{ id: "own-voice", label: `${ownName}'s own posts` }] : []),
    { id: "sources", label: "Sources" },
  ]
  const [active, setActive] = useState("top")
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-140px 0px -60% 0px" },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas, questions, hasSubtopics, ownName])
  return (
    <nav aria-label="Report sections" className="sticky top-14 z-[150] -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-black/[0.05] dark:border-white/[0.06]">
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
                setActive(s.id)
              }}
              aria-current={active === s.id ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
                active === s.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {s.label}
              {s.n !== undefined && s.n > 0 && <span className={`tabular-nums ${active === s.id ? "opacity-70" : "text-slate-400"}`}>{s.n}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Owner only: share the topic with everyone who has Topic Ideation (read and export), or make it private again. */
function ShareControl({ shared, onChange }: { shared: boolean; onChange: (next: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])
  const toggle = async () => {
    setBusy(true)
    await onChange(!shared)
    setBusy(false)
  }
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`h-10 inline-flex items-center gap-2 rounded-xl px-3.5 border text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
          shared
            ? "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20"
            : "border-black/[0.08] dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        {shared ? <Users size={15} /> : <Lock size={15} />}
        {shared ? "Shared" : "Share"}
      </button>
      {open && (
        <div role="dialog" aria-label="Share with your team" className="absolute left-0 sm:left-auto sm:right-0 top-12 z-[160] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 shadow-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Share with your team</p>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Everyone with Topic Ideation can open this topic, export it and save its ideas. Only you can rescan, refresh or delete it.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              aria-label="Share with your team"
              disabled={busy}
              onClick={() => void toggle()}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500 disabled:opacity-60 ${shared ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${shared ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <p className="text-[12px] text-slate-400 mt-3">{shared ? "Shared. Turn it off to make it private again." : "Private. Only you and Topic Ideation admins can see it."}</p>
        </div>
      )}
    </div>
  )
}

/** Export: a PDF to share, a Word file to edit, or plain text to paste. */
function ExportMenu({ input }: { input: () => ExportInput }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])
  const download = async (kind: "pdf" | "docx") => {
    setOpen(false)
    setBusy(kind)
    try {
      await (kind === "pdf" ? exportPdf(input()) : exportDocx(input()))
      toast.success(kind === "pdf" ? "PDF downloaded" : "Word document downloaded")
    } catch (err) {
      console.error("Report export failed:", err)
      toast.error(`Could not create the ${kind === "pdf" ? "PDF" : "Word document"}. Try again, or copy the report as text.`)
    } finally {
      setBusy(null)
    }
  }
  const copy = async () => {
    setOpen(false)
    const i = input()
    try {
      await navigator.clipboard.writeText(reportMarkdown(i.report, i.items))
      toast.success("Report copied")
    } catch {
      toast.error("Could not copy. Your browser blocked clipboard access.")
    }
  }
  const item = "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800"
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!!busy}
        onClick={() => setOpen((o) => !o)}
        className="h-10 inline-flex items-center gap-2 rounded-xl px-3.5 border border-black/[0.08] dark:border-white/[0.1] text-[13.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        {busy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <Download size={15} />}
        {busy ? "Preparing..." : "Export"}
        {!busy && <ChevronDown size={14} className="text-slate-400 -mr-0.5" />}
      </button>
      {open && (
        <div role="menu" aria-label="Export report" className="absolute right-0 top-12 z-[160] w-72 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 shadow-xl p-1.5">
          <button role="menuitem" type="button" className={item} onClick={() => void download("pdf")}>
            <FileText size={16} className="mt-0.5 text-rose-500" />
            <span>
              <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">PDF</span>
              <span className="block text-[12px] text-slate-500">A finished report to share. Every source is a link.</span>
            </span>
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => void download("docx")}>
            <FileType2 size={16} className="mt-0.5 text-sky-600" />
            <span>
              <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">Word document</span>
              <span className="block text-[12px] text-slate-500">Editable, to shape into a brief or hand to a writer.</span>
            </span>
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => void copy()}>
            <Copy size={16} className="mt-0.5 text-slate-500" />
            <span>
              <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">Copy as text</span>
              <span className="block text-[12px] text-slate-500">Paste into an email, a chat or Basecamp.</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function Menu({ onRebuild, onDelete, disabled }: { onRebuild: () => void; onDelete: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])
  const item = "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800"
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-[160] w-72 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 shadow-xl p-1.5">
          <button role="menuitem" type="button" disabled={disabled} className={item} onClick={() => { setOpen(false); onRebuild() }}>
            <RotateCcw size={16} className="mt-0.5 text-slate-500" />
            <span>
              <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">Refresh analysis</span>
              <span className="block text-[12px] text-slate-500">Rewrite ideas and subtopics from what is already collected. No new search.</span>
            </span>
          </button>
          <button role="menuitem" type="button" disabled={disabled} className={item} onClick={() => { setOpen(false); onDelete() }}>
            <Trash2 size={16} className="mt-0.5 text-rose-500" />
            <span>
              <span className="block text-[13.5px] font-medium text-rose-600 dark:text-rose-400">Delete topic</span>
              <span className="block text-[12px] text-slate-500">Removes the topic and everything collected for it.</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export function TopicView({ topicId, scan, onNewSearch }: { topicId: string; scan: Scan; onNewSearch: (q: string) => void }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<TopicDetail | null>(null)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [subtopicFilter, setSubtopicFilter] = useState<string | null>(null)
  const [sourceView, setSourceView] = useState<{ view: SourceView | null; seq: number }>({ view: null, seq: 0 })
  const [openSubtopic, setOpenSubtopic] = useState<string | null>(null)
  useDocumentTitle(detail?.topic.query ? `${detail.topic.query} · Topic Ideation` : "Topic Ideation")

  const load = useCallback(async () => {
    try {
      const d = await listeningApi.topic(topicId)
      setDetail(d)
      setLoadError(null)
      return d
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0
      if (status === 401) {
        navigate("/login", { replace: true })
        return null
      }
      setLoadError({ status, message: status === 404 ? "This topic no longer exists." : "Could not load this topic. Check your connection and try again." })
      return null
    }
  }, [topicId, navigate])

  useEffect(() => {
    setDetail(null)
    void load()
  }, [load])

  // Follow a scan already running for this topic (page reload, second tab). Owners only: a shared topic's scans are its owner's.
  useEffect(() => {
    const ar = detail?.activeRun
    if (detail?.role === "viewer") return
    if (ar && scan.state.runId !== ar.id && scan.state.phase !== "running" && scan.state.phase !== "starting") {
      scan.attach(topicId, ar.id, ar.startedAt, ar.trigger)
    }
  }, [detail?.activeRun, detail?.role, scan, topicId])

  // Ideas on your board, by report idea id.
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => setSaved(detail?.savedIdeas ?? {}), [detail?.savedIdeas])
  const saving: IdeaSaving = {
    saved,
    busy: savingId,
    onSave: async (ideaId) => {
      setSavingId(ideaId)
      try {
        const r = await listeningApi.saveIdea(topicId, ideaId)
        setSaved((s) => ({ ...s, [ideaId]: r.idea.id }))
        toast.success("Saved to your idea board")
      } catch (err) {
        toast.error((err as ListeningApiError).message ?? "Could not save the idea")
      } finally {
        setSavingId(null)
      }
    },
    onUnsave: async (ideaId) => {
      const id = saved[ideaId]
      if (!id) return
      setSavingId(ideaId)
      try {
        await listeningApi.removeIdea(id)
        setSaved((s) => {
          const next = { ...s }
          delete next[ideaId]
          return next
        })
        toast.info("Removed from your idea board")
      } catch (err) {
        toast.error((err as ListeningApiError).message ?? "Could not remove the idea")
      } finally {
        setSavingId(null)
      }
    },
  }
  const setShared = async (next: boolean) => {
    try {
      await listeningApi.share(topicId, next)
      setDetail((d) => (d ? { ...d, topic: { ...d.topic, shared: next } } : d))
      toast.success(next ? "Shared with your team" : "This topic is private again")
    } catch (err) {
      toast.error((err as ListeningApiError).message ?? "Could not change sharing")
    }
  }

  // When this topic's scan settles, reload and say what changed.
  useEffect(() => {
    const s = scan.state
    if (s.topicId !== topicId || !s.runId) return
    if (s.phase !== "done" && s.phase !== "failed" && s.phase !== "cancelled") return
    if (settledRuns.has(s.runId)) return
    settledRuns.add(s.runId)
    void load().then((d) => {
      if (s.phase === "done") {
        // Count from the saved report (right whether the scan was streamed or followed by polling).
        const r = d?.topic.report
        const added = r && r.runId === s.runId ? r.totals.newThisRun : s.newItems ?? 0
        if (s.trigger === "rescan") toast.success(added ? `Added ${plural(added, "new post")}` : "No new posts found this time. Try again in a few days.")
        else if (s.trigger === "rebuild") toast.success("Analysis refreshed")
      } else if (s.phase === "failed" && d?.topic.report) {
        toast.error(s.error ?? "The scan failed. Your earlier results are unchanged.")
      } else if (s.phase === "cancelled" && d?.topic.report) {
        toast.info("Scan cancelled. Your earlier results are unchanged.")
      }
    })
  }, [scan.state, topicId, load])

  const items = useMemo(() => new Map((detail?.items ?? []).map((i) => [i.id, i] as [string, ItemView])), [detail?.items])

  const scanning = scan.state.topicId === topicId && (scan.state.phase === "running" || scan.state.phase === "starting")
  const topic = detail?.topic
  const report = topic?.report ?? null

  const rescan = () => scan.start({ kind: "rescan", topicId })
  const rebuild = () => scan.start({ kind: "rebuild", topicId })
  const doDelete = async () => {
    setDeleting(true)
    try {
      await listeningApi.remove(topicId)
      toast.success("Topic deleted")
      navigate("/listening")
    } catch (err) {
      toast.error((err as ListeningApiError).message ?? "Could not delete the topic")
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const showAllInSubtopic = (id: string) => {
    setSubtopicFilter(id)
    requestAnimationFrame(() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const showSources = (view: SourceView) => {
    setSubtopicFilter(null)
    setSourceView((s) => ({ view, seq: s.seq + 1 }))
    requestAnimationFrame(() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const jumpToSubtopic = (id: string) => {
    setOpenSubtopic(id)
    requestAnimationFrame(() => document.getElementById(`subtopic-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <AlertCircle size={28} className="mx-auto text-slate-300" />
        <p className="text-[16px] font-medium text-slate-800 dark:text-slate-100 mt-4">{loadError.message}</p>
        <div className="flex justify-center gap-3 mt-6">
          <Link to="/listening" className="rounded-xl px-4 py-2 text-[14px] font-medium border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800">
            All topics
          </Link>
          {loadError.status !== 404 && (
            <button type="button" onClick={() => void load()} className="rounded-xl px-4 py-2 text-[14px] font-medium text-white" style={{ background: ACCENT }}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!topic) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading topic">
        <div className="shimmer h-5 w-28 rounded-lg" />
        <div className="shimmer h-10 w-2/3 rounded-xl" />
        <div className="shimmer h-56 rounded-2xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="shimmer h-40 rounded-2xl" />
          <div className="shimmer h-40 rounded-2xl" />
        </div>
      </div>
    )
  }

  const runsDone = detail!.runs.filter((r) => r.status === "complete").length
  const lastFailed = detail!.runs[0]?.status === "failed" ? detail!.runs[0] : null
  // Someone else's shared topic: read, export and save ideas; no scans, refresh, sharing or delete.
  const viewer = detail!.role === "viewer"
  const meta = report
    ? [
        sampleLabel(report),
        `${WINDOW_LABEL[topic.timeWindow]}`,
        runsDone > 1 ? `${runsDone} scans` : null,
        topic.lastRunAt ? `updated ${timeAgo(topic.lastRunAt)}` : null,
      ].filter(Boolean)
    : [WINDOW_LABEL[topic.timeWindow]]

  return (
    <div>
      <Link to="/listening" className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 -ml-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">
        <ChevronLeft size={16} /> All topics
      </Link>

      <header id="top" className="scroll-mt-32 flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-3 mb-5">
        <div className="min-w-0">
          {viewer &&
            (topic.shared ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 text-[12px] font-medium text-sky-700 dark:text-sky-300 mb-2">
                <Users size={13} /> Shared by {personName(topic.createdBy)} · read only
              </p>
            ) : (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-2">
                <Lock size={13} /> {personName(topic.createdBy)}&apos;s private topic · admin view, read only
              </p>
            ))}
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.025em] leading-tight text-slate-900 dark:text-white break-words">{topic.query}</h1>
          <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1.5">{meta.join(" · ")}</p>
        </div>
        {report && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!viewer && <ShareControl shared={!!topic.shared} onChange={setShared} />}
            <ExportMenu input={() => ({ report, topic, items, runs: detail!.runs })} />
            {!viewer && (
              <>
                <button
                  type="button"
                  onClick={rescan}
                  disabled={scanning}
                  title="Finds new posts and digs deeper. Uses about 20 of today's searches."
                  className="h-10 inline-flex items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-white shadow-sm disabled:opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
                  style={{ background: ACCENT }}
                >
                  <RefreshCw size={15} className={scanning ? "animate-spin motion-reduce:animate-none" : ""} />
                  {scanning ? "Scanning..." : "Rescan for more"}
                </button>
                <Menu onRebuild={rebuild} onDelete={() => setConfirmDelete(true)} disabled={scanning} />
              </>
            )}
          </div>
        )}
      </header>

      {!report && viewer && (
        <Card className="p-7 max-w-2xl">
          <p className="text-[15px] text-slate-700 dark:text-slate-200">This shared topic has no results yet. {personName(topic.createdBy)} can run its scan.</p>
        </Card>
      )}

      {/* No report yet: the first scan is running, failed, or was cancelled. */}
      {!report && !viewer && (
        <div className="max-w-2xl">
          {scanning || (scan.state.topicId === topicId && scan.state.phase === "done") ? (
            <ScanProgress state={scan.state} query={topic.query} onCancel={scan.cancel} />
          ) : (
            <Card className="p-7">
              <p className="text-[16px] font-semibold text-slate-900 dark:text-white">
                {topic.lastRunStatus === "cancelled" ? "The scan was cancelled before it finished." : "The scan did not finish."}
              </p>
              {(scan.state.topicId === topicId && scan.state.error) || lastFailed?.error ? (
                <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-2">{(scan.state.topicId === topicId && scan.state.error) || lastFailed?.error}</p>
              ) : null}
              <div className="flex flex-wrap gap-3 mt-5">
                <button type="button" onClick={rescan} className="rounded-xl px-4 py-2 text-[14px] font-semibold text-white" style={{ background: ACCENT }}>
                  Try again
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl px-4 py-2 text-[14px] font-medium border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800">
                  Delete topic
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {report && (
        <>
          {scanning && (
            <div className="mb-5">
              <ScanProgress state={scan.state} query={topic.query} onCancel={scan.cancel} compact />
            </div>
          )}
          {!scanning && report.totals.runs > 1 && report.totals.newThisRun > 0 && (
            <div className="mb-5 rounded-xl bg-sky-50 dark:bg-sky-500/[0.08] border border-sky-200/70 dark:border-sky-500/20 px-4 py-3 text-[13.5px] text-sky-900 dark:text-sky-200">
              The last scan added <b>{plural(report.totals.newThisRun, "new item")}</b>. Look for the <span className="font-semibold">New</span> tag, or filter sources to just the new ones.
            </div>
          )}
          <SectionNav
            ideas={report.ideas.length}
            questions={report.questions.length}
            hasSubtopics={report.subtopics.length > 0}
            ownName={report.ownVoice?.posts.length ? report.ownVoice.name : null}
          />
          <div className="space-y-12 mt-6">
            <Overview
              report={report}
              onSuggestion={onNewSearch}
              onShowNotCounted={() => showSources("notCounted")}
              onRefresh={viewer ? undefined : rebuild}
              busy={scanning}
              canWiden={topic.timeWindow !== "any"}
            />
            <Ideas report={report} items={items} onSubtopic={jumpToSubtopic} saving={saving} />
            <Questions report={report} />
            <Subtopics report={report} items={items} openId={openSubtopic} onShowAll={showAllInSubtopic} />
            <Voices report={report} />
            <OwnVoice report={report} onShowAll={() => showSources("own")} />
            <News report={report} />
            <Sources
              report={report}
              items={detail!.items}
              filter={{ subtopicId: subtopicFilter, view: sourceView.view, seq: sourceView.seq }}
              onClearFilter={() => {
                setSubtopicFilter(null)
                setSourceView((s) => ({ view: null, seq: s.seq }))
              }}
            />
            <Method report={report} plan={topic.plan} runs={detail!.runs} />
          </div>
        </>
      )}

      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this topic?</DialogTitle>
            <DialogDescription>
              {`“${topic.query}”`} and {plural(topic.itemCount, "collected item")} will be removed for good.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="rounded-xl px-4 py-2 text-[14px] font-medium border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800">
              Keep it
            </button>
            <button type="button" disabled={deleting} onClick={doDelete} className="rounded-xl px-4 py-2 text-[14px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">
              {deleting ? "Deleting..." : "Delete topic"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
