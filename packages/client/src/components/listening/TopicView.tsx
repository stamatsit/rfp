import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { AlertCircle, CalendarRange, ChevronDown, ChevronLeft, Copy, Download, FileSpreadsheet, FileText, FileType2, Link2, Loader2, Lock, MoreHorizontal, RefreshCw, RotateCcw, Search, Trash2, Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/hooks/useToast"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import type { useScan } from "@/hooks/useScan"
import { ListeningApiError, listeningApi } from "@/lib/listeningApi"
import type { AccessInfo, IdeaDraft, IdeaVote, ItemView, TopicDetail } from "@/types/listening"
import { IdeaPanel } from "./IdeaPanel"
import { ScanProgress } from "./ScanProgress"
import { Overview, type ReportTab } from "./report/Overview"
import { Ideas, SaveButton, Thumbs, ideaText, toPanelIdea, type IdeaAdding, type IdeaSaving } from "./report/Ideas"
import { Questions } from "./report/Questions"
import { Quotes } from "./report/Quotes"
import { Subtopics } from "./report/Subtopics"
import { Sources, type SourceView } from "./report/Sources"
import { Method } from "./report/Method"
import { countedLinks, exportDocx, exportPdf, exportSources, type ExportInput } from "./exportReport"
import { Card, CopyButton, personName, plural, reportMarkdown, sampleLabel, timeAgo, windowLabel } from "./ui"
import { Button, MenuContent, MenuItem, MenuLabel, MenuRoot, MenuSeparator, MenuTrigger, Tabs, tabPanelProps, tone } from "./primitives"

type Scan = ReturnType<typeof useScan>

/** Runs whose completion was already handled. Module-level because pages remount on navigation. */
const settledRuns = new Set<string>()

const TABS: ReportTab[] = ["overview", "ideas", "questions", "quotes", "subtopics", "sources"]

/** Owner only, and only when topics are private by default: share the topic with everyone who has Topic Ideation, or make it private again. */
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
      <Button variant={shared ? "brand" : "secondary"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {shared ? <Users size={15} /> : <Lock size={15} />}
        {shared ? "Shared" : "Share"}
      </Button>
      {open && (
        <div role="dialog" aria-label="Share with your team" className="absolute left-0 sm:left-auto sm:right-0 top-12 z-[160] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 shadow-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Share with your team</p>
              <p className={`text-[12.5px] mt-1 leading-relaxed ${tone.muted}`}>Everyone with Topic Ideation can open this topic, export it and save its ideas. Only you can rescan, refresh or delete it.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              aria-label="Share with your team"
              disabled={busy}
              onClick={() => void toggle()}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500 disabled:opacity-60 ${shared ? "bg-sky-600" : "bg-slate-400 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${shared ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <p className={`text-[12px] mt-3 ${tone.muted}`}>{shared ? "Shared. Turn it off to make it private again." : "Private. Only you and Topic Ideation admins can see it."}</p>
        </div>
      )}
    </div>
  )
}

/** Export: a PDF to share, a Word file to edit, plain text to paste, or the posts behind it. */
function ExportMenu({ input }: { input: () => ExportInput }) {
  const [busy, setBusy] = useState<"pdf" | "docx" | "csv" | null>(null)
  const download = async (kind: "pdf" | "docx") => {
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
    const i = input()
    try {
      await navigator.clipboard.writeText(reportMarkdown(i.report, i.items))
      toast.success("Report copied")
    } catch {
      toast.error("Could not copy. Your browser blocked clipboard access.")
    }
  }
  // Every relevant post with the text we stored (up to about 1,800 characters each), fetched on demand: the page only holds excerpts.
  const sources = async () => {
    setBusy("csv")
    const i = input()
    try {
      const { sources: rows } = await listeningApi.sources(i.topic.id)
      await exportSources(i.topic, i.report, rows)
      toast.success(`Spreadsheet downloaded: ${plural(rows.length, "source")}`)
    } catch (err) {
      console.error("Sources export failed:", err)
      toast.error("Could not create the spreadsheet. Try again.")
    } finally {
      setBusy(null)
    }
  }
  const copyLinks = async () => {
    const links = countedLinks(input().items)
    try {
      await navigator.clipboard.writeText(links.join("\n"))
      toast.success(`Copied ${plural(links.length, "link")}`)
    } catch {
      toast.error("Could not copy. Your browser blocked clipboard access.")
    }
  }
  return (
    <MenuRoot modal={false}>
      <MenuTrigger asChild>
        <Button variant="primary" disabled={!!busy}>
          {busy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <Download size={15} />}
          {busy ? "Preparing..." : "Export"}
          {!busy && <ChevronDown size={14} className="-mr-0.5 opacity-80" />}
        </Button>
      </MenuTrigger>
      <MenuContent label="Export report">
        <MenuItem icon={<FileText size={16} className="text-rose-600" />} title="PDF" hint="A finished report to share. Every source is a link." onSelect={() => void download("pdf")} />
        <MenuItem icon={<FileType2 size={16} className="text-sky-700" />} title="Word document" hint="Editable, to shape into a brief or hand to a writer." onSelect={() => void download("docx")} />
        <MenuItem icon={<Copy size={16} className="text-slate-500" />} title="Copy as text" hint="Paste into an email, a chat or Basecamp." onSelect={() => void copy()} />
        <MenuSeparator />
        <MenuLabel>The posts behind it</MenuLabel>
        <MenuItem
          icon={<FileSpreadsheet size={16} className="text-emerald-700" />}
          title="All sources (spreadsheet)"
          hint="Every relevant post with its link and the text we collected, to dig further in Copilot or ChatGPT."
          onSelect={() => void sources()}
        />
        <MenuItem icon={<Link2 size={16} className="text-slate-500" />} title="Copy source links" hint="A clean list of links to the posts counted in this report." onSelect={() => void copyLinks()} />
      </MenuContent>
    </MenuRoot>
  )
}

/** Owner only: the actions that spend searches (or not), each with its cost in plain words. */
function UpdateMenu({ onRescan, onRebuild, onRescope, scanning, budget }: { onRescan: () => void; onRebuild: () => void; onRescope: () => void; scanning: boolean; budget: AccessInfo["budget"] | null }) {
  const left = budget ? budget.scansLeft : null
  const rescanHint =
    left === null
      ? "Looks for newer posts and digs one page deeper. Uses about 20 of today's shared searches."
      : left <= 0
        ? "Today's shared searches are used up."
        : `Looks for newer posts and digs one page deeper. Uses about 20 of today's shared searches; about ${plural(left, "scan")} left.`
  return (
    <MenuRoot modal={false}>
      <MenuTrigger asChild>
        <Button disabled={scanning}>
          <RefreshCw size={15} className={scanning ? "animate-spin motion-reduce:animate-none" : ""} />
          {scanning ? "Scanning..." : "Update"}
          {!scanning && <ChevronDown size={14} className="-mr-0.5 text-slate-500" />}
        </Button>
      </MenuTrigger>
      <MenuContent label="Update this topic" width="w-80">
        <MenuItem icon={<Search size={16} className="text-sky-700 dark:text-sky-400" />} title="Rescan for new posts" hint={rescanHint} onSelect={onRescan} disabled={left !== null && left <= 0} />
        <MenuItem icon={<RotateCcw size={16} className="text-slate-500" />} title="Rewrite the analysis" hint="Rewrites ideas and subtopics from what is already collected. No searches." onSelect={onRebuild} />
        <MenuSeparator />
        <MenuItem icon={<CalendarRange size={16} className="text-slate-500" />} title="Scan another time range" hint="Starts a new scan of this topic over different dates. This one stays as it is." onSelect={onRescope} />
      </MenuContent>
    </MenuRoot>
  )
}

function MoreMenu({ onDelete, disabled }: { onDelete: () => void; disabled: boolean }) {
  return (
    <MenuRoot modal={false}>
      <MenuTrigger asChild>
        <Button size="icon" aria-label="More actions">
          <MoreHorizontal size={18} />
        </Button>
      </MenuTrigger>
      <MenuContent label="More actions">
        <MenuItem icon={<Trash2 size={16} className="text-rose-600 dark:text-rose-400" />} title="Delete topic" hint="Removes the topic and everything collected for it." onSelect={onDelete} disabled={disabled} danger />
      </MenuContent>
    </MenuRoot>
  )
}

export function TopicView({
  topicId,
  scan,
  onNewSearch,
  budget = null,
}: {
  topicId: string
  scan: Scan
  onNewSearch: (q: string, leave?: string[]) => void
  /** Today's shared search allowance, or null when a paid backup makes it unlimited (or it is unknown). */
  budget?: AccessInfo["budget"] | null
}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [detail, setDetail] = useState<TopicDetail | null>(null)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [subtopicFilter, setSubtopicFilter] = useState<string | null>(null)
  const [sourceView, setSourceView] = useState<{ view: SourceView | null; seq: number }>({ view: null, seq: 0 })
  const [openSubtopic, setOpenSubtopic] = useState<string | null>(null)
  const tabBar = useRef<HTMLDivElement>(null)
  useDocumentTitle(detail?.topic.query ? `${detail.topic.query} · Topic Ideation` : "Topic Ideation")

  // The tab and the open idea live in the address, so a link, a reload or Back lands in the same place.
  const tabParam = params.get("tab") as ReportTab | null
  const tab: ReportTab = tabParam && TABS.includes(tabParam) ? tabParam : "overview"
  const openIdea = params.get("idea")
  const pushedIdea = useRef(false)

  const setTab = useCallback(
    (next: ReportTab) => {
      setParams(
        (p) => {
          const q = new URLSearchParams(p)
          if (next === "overview") q.delete("tab")
          else q.set("tab", next)
          // A tab change always means the idea panel is closed (the params seen here can predate its closing).
          q.delete("idea")
          return q
        },
        { replace: true },
      )
      // Start the new tab at its top when the page is scrolled past the tab bar.
      requestAnimationFrame(() => {
        const bar = tabBar.current
        if (!bar) return
        const top = bar.getBoundingClientRect().top
        if (top <= 57) window.scrollTo({ top: window.scrollY + top - 56, behavior: "auto" })
      })
    },
    [setParams],
  )
  const showIdea = useCallback(
    (id: string, how: "open" | "step") => {
      if (how === "open") pushedIdea.current = true
      setParams(
        (p) => {
          const q = new URLSearchParams(p)
          q.set("idea", id)
          return q
        },
        { replace: how === "step" },
      )
    },
    [setParams],
  )
  const closeIdea = useCallback(() => {
    // Opened from this page: step back, so Back after closing does not reopen it.
    if (pushedIdea.current) {
      pushedIdea.current = false
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
  }, [navigate, setParams])

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

  // Follow a scan already running for this topic (page reload, second tab). Owners only: someone else's topic's scans are theirs.
  useEffect(() => {
    const ar = detail?.activeRun
    if (detail?.role === "viewer") return
    if (ar && scan.state.runId !== ar.id && scan.state.phase !== "running" && scan.state.phase !== "starting") {
      scan.attach(topicId, ar.id, ar.startedAt, ar.trigger, detail?.topic.query)
    }
  }, [detail?.activeRun, detail?.role, detail?.topic.query, scan, topicId])

  // Ideas on your board, by report idea id.
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => setSaved(detail?.savedIdeas ?? {}), [detail?.savedIdeas])
  // Drafts written from those saved ideas, by saved idea id.
  const [drafts, setDrafts] = useState<Record<string, IdeaDraft[]>>({})
  useEffect(() => setDrafts(detail?.drafts ?? {}), [detail?.drafts])
  // Your thumbs, by report idea id. Shown at once; put back if the server refuses.
  const [votes, setVotes] = useState<Record<string, IdeaVote>>({})
  useEffect(() => setVotes(detail?.votes ?? {}), [detail?.votes])
  const vote = async (ideaId: string, next: IdeaVote | 0) => {
    const before = votes
    setVotes((v) => {
      const out = { ...v }
      if (next === 0) delete out[ideaId]
      else out[ideaId] = next
      return out
    })
    try {
      await listeningApi.vote(topicId, ideaId, next)
    } catch (err) {
      setVotes(before)
      toast.error((err as ListeningApiError).message ?? "Could not save your rating")
    }
  }
  // More ideas, written from the posts already collected.
  const [addingIdeas, setAddingIdeas] = useState(false)
  const [moreNote, setMoreNote] = useState<string | null>(null)
  const [freshIdeas, setFreshIdeas] = useState<Set<string>>(new Set())
  const more = async () => {
    if (addingIdeas) return
    setAddingIdeas(true)
    setMoreNote(null)
    try {
      const r = await listeningApi.moreIdeas(topicId)
      if (r.added.length === 0) {
        setMoreNote("No further idea held up against the posts collected. Rescan to bring in more conversation, then ask again.")
        return
      }
      setDetail((d) => (d?.topic.report ? { ...d, topic: { ...d.topic, report: { ...d.topic.report, ideas: r.ideas } } } : d))
      setFreshIdeas((f) => new Set([...f, ...r.added.map((i) => i.id)]))
      toast.success(r.added.length === 1 ? "1 idea added" : `${r.added.length} ideas added`)
      const first = r.added[0]!.id
      window.setTimeout(() => {
        const el = document.getElementById(`idea-${first}`)
        el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
        el?.querySelector<HTMLElement>("h3 button")?.focus()
      }, 60)
    } catch (err) {
      setMoreNote((err as ListeningApiError).message ?? "More ideas could not be written this time. Try again.")
    } finally {
      setAddingIdeas(false)
    }
  }
  const saving: IdeaSaving = {
    saved,
    busy: savingId,
    topicId,
    drafts,
    votes,
    onVote: (ideaId, next) => void vote(ideaId, next),
    onDrafted: (ideaId, idea, draft) => {
      setSaved((s) => ({ ...s, [ideaId]: idea.id }))
      setDrafts((d) => ({ ...d, [idea.id]: [...(d[idea.id] ?? []).filter((x) => x.kind !== draft.kind), draft] }))
    },
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
        setDrafts((d) => {
          const next = { ...d }
          delete next[id]
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
  const report = detail?.topic.report ?? null
  const panelIdeas = useMemo(() => (report ? report.ideas.map((i) => toPanelIdea(i, items, report, freshIdeas.has(i.id))) : []), [report, items, freshIdeas])

  const scanning = scan.state.topicId === topicId && (scan.state.phase === "running" || scan.state.phase === "starting")
  const topic = detail?.topic

  const rescan = () => scan.start({ kind: "rescan", topicId }, topic?.query)
  const rebuild = () => scan.start({ kind: "rebuild", topicId }, topic?.query)
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
    setTab("sources")
  }
  const showSources = (view: SourceView) => {
    setSubtopicFilter(null)
    setSourceView((s) => ({ view, seq: s.seq + 1 }))
    setTab("sources")
  }
  const jumpToSubtopic = (id: string) => {
    setOpenSubtopic(id)
    setTab("subtopics")
    window.setTimeout(() => document.getElementById(`subtopic-${id}`)?.scrollIntoView({ behavior: "auto", block: "start" }), 30)
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <AlertCircle size={28} className="mx-auto text-slate-400" />
        <p className="text-[16px] font-medium text-slate-800 dark:text-slate-100 mt-4">{loadError.message}</p>
        <div className="flex justify-center gap-3 mt-6">
          <Link to="/listening" className="inline-flex items-center h-10 rounded-xl px-4 text-[14px] font-medium border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800">
            All topics
          </Link>
          {loadError.status !== 404 && (
            <Button variant="primary" onClick={() => void load()}>
              Try again
            </Button>
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
        <div className="shimmer h-10 w-full max-w-xl rounded-xl" />
        <div className="shimmer h-56 rounded-2xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="shimmer h-48 rounded-2xl" />
          <div className="shimmer h-48 rounded-2xl" />
        </div>
      </div>
    )
  }

  const runsDone = detail!.runs.filter((r) => r.status === "complete").length
  const lastFailed = detail!.runs[0]?.status === "failed" ? detail!.runs[0] : null
  // Someone else's topic: read, export, save ideas and draft; no scans, refresh, sharing or delete.
  const viewer = detail!.role === "viewer"
  // Everyone sees every topic, so there is nothing to share and nothing private.
  const teamView = detail!.visibility === "team"
  const leaving = topic.excludeTerms?.length ? `leaving out ${topic.excludeTerms.join(", ")}` : null
  const meta = report
    ? [sampleLabel(report), windowLabel(topic), leaving, runsDone > 1 ? `${runsDone} scans` : null, topic.lastRunAt ? `updated ${timeAgo(topic.lastRunAt)}` : null].filter(Boolean)
    : [windowLabel(topic), leaving].filter(Boolean)
  const relevantCount = report ? detail!.items.filter((i) => i.relevant !== false).length : 0
  const tabs = report
    ? [
        { id: "overview" as ReportTab, label: "Overview" },
        { id: "ideas" as ReportTab, label: "Ideas", count: report.ideas.length },
        { id: "questions" as ReportTab, label: "Questions", count: report.questions.length },
        { id: "quotes" as ReportTab, label: "Quotes", count: report.quotes.length },
        { id: "subtopics" as ReportTab, label: "Subtopics", count: report.subtopics.length },
        { id: "sources" as ReportTab, label: "Sources", count: relevantCount },
      ]
    : []

  return (
    <div>
      <Link to="/listening" className={`inline-flex items-center gap-1 text-[13px] font-medium hover:text-slate-900 dark:hover:text-white -ml-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${tone.muted}`}>
        <ChevronLeft size={16} /> All topics
      </Link>

      <header id="top" className="scroll-mt-32 flex flex-col lg:flex-row lg:items-end justify-between gap-4 mt-3 mb-5">
        <div className="min-w-0">
          {viewer &&
            (teamView ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Users size={13} /> {personName(topic.createdBy)}&apos;s topic · read only
              </p>
            ) : topic.shared ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 text-[12px] font-medium text-sky-800 dark:text-sky-300 mb-2">
                <Users size={13} /> Shared by {personName(topic.createdBy)} · read only
              </p>
            ) : (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Lock size={13} /> {personName(topic.createdBy)}&apos;s private topic · admin view, read only
              </p>
            ))}
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-tight text-slate-900 dark:text-white break-words">{topic.query}</h1>
          <p className={`text-[13.5px] mt-1.5 ${tone.muted}`}>{meta.join(" · ")}</p>
        </div>
        {report && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!viewer && !teamView && <ShareControl shared={!!topic.shared} onChange={setShared} />}
            {!viewer && <UpdateMenu onRescan={rescan} onRebuild={rebuild} onRescope={() => onNewSearch(topic.query, topic.excludeTerms ?? [])} scanning={scanning} budget={budget} />}
            <ExportMenu input={() => ({ report, topic, items, runs: detail!.runs })} />
            {!viewer && <MoreMenu onDelete={() => setConfirmDelete(true)} disabled={scanning} />}
          </div>
        )}
      </header>

      {!report && viewer && (
        <Card className="p-7 max-w-2xl">
          <p className="text-[15px] text-slate-700 dark:text-slate-200">
            This {teamView ? "" : "shared "}topic has no results yet. {personName(topic.createdBy)} can run its scan.
          </p>
        </Card>
      )}

      {/* No report yet: the first scan is running, failed, or was cancelled. */}
      {!report && !viewer && (
        <div className="max-w-2xl">
          {scanning || (scan.state.topicId === topicId && scan.state.phase === "done") ? (
            <ScanProgress state={scan.state} query={topic.query} onCancel={scan.cancel} onNotify={scan.setNotify} />
          ) : (
            <Card className="p-7">
              <p className="text-[16px] font-semibold text-slate-900 dark:text-white">{topic.lastRunStatus === "cancelled" ? "The scan was cancelled before it finished." : "The scan did not finish."}</p>
              {(scan.state.topicId === topicId && scan.state.error) || lastFailed?.error ? (
                <p className="text-[14px] text-slate-700 dark:text-slate-300 mt-2">{(scan.state.topicId === topicId && scan.state.error) || lastFailed?.error}</p>
              ) : null}
              <div className="flex flex-wrap gap-3 mt-5">
                <Button variant="primary" onClick={rescan}>
                  Try again
                </Button>
                <Button onClick={() => setConfirmDelete(true)}>Delete topic</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {report && (
        <>
          {scanning && (
            <div className="mb-5">
              <ScanProgress state={scan.state} query={topic.query} onCancel={scan.cancel} onNotify={scan.setNotify} compact />
            </div>
          )}
          {!scanning && report.totals.runs > 1 && report.totals.newThisRun > 0 && (
            <div className="mb-5 rounded-xl bg-sky-50 dark:bg-sky-500/[0.08] border border-sky-200/70 dark:border-sky-500/20 px-4 py-3 text-[13.5px] text-sky-900 dark:text-sky-200">
              The last scan added <b>{plural(report.totals.newThisRun, "new item")}</b>. Look for the <span className="font-semibold">New</span> tag, or filter sources to just the new ones.
            </div>
          )}
          <div ref={tabBar} className="sticky top-14 z-[150] -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.07]">
            <Tabs tabs={tabs} active={tab} onChange={setTab} label="Report sections" idBase="report" />
          </div>
          <div className="mt-6">
            <div {...tabPanelProps("report", "overview", tab)} className="focus:outline-none">
              <Overview
                report={report}
                items={detail!.items}
                onSuggestion={(q) => onNewSearch(q)}
                onShowNotCounted={() => showSources("notCounted")}
                onShowOwn={() => showSources("own")}
                onRefresh={viewer ? undefined : rebuild}
                busy={scanning}
                canWiden={topic.timeWindow !== "any"}
                onTab={setTab}
                onOpenIdea={(id) => showIdea(id, "open")}
                onOpenSubtopic={jumpToSubtopic}
              />
            </div>
            <div {...tabPanelProps("report", "ideas", tab)} className="focus:outline-none">
              <Ideas
                report={report}
                saving={saving}
                onOpen={(id) => showIdea(id, "open")}
                adding={{ allowed: !viewer && !scanning, busy: addingIdeas, note: moreNote, fresh: freshIdeas, onMore: () => void more() } satisfies IdeaAdding}
              />
            </div>
            <div {...tabPanelProps("report", "questions", tab)} className="focus:outline-none">
              <Questions report={report} />
            </div>
            <div {...tabPanelProps("report", "quotes", tab)} className="focus:outline-none">
              <Quotes report={report} />
            </div>
            <div {...tabPanelProps("report", "subtopics", tab)} className="focus:outline-none">
              <Subtopics report={report} items={items} openId={openSubtopic} onShowAll={showAllInSubtopic} />
            </div>
            <div {...tabPanelProps("report", "sources", tab)} className="focus:outline-none space-y-8">
              <Sources
                report={report}
                items={detail!.items}
                filter={{ subtopicId: subtopicFilter, view: sourceView.view, seq: sourceView.seq }}
                onClearFilter={() => {
                  setSubtopicFilter(null)
                  setSourceView((s) => ({ view: null, seq: s.seq }))
                }}
              />
              <Method report={report} plan={topic.plan} runs={detail!.runs} leftOut={topic.excludeTerms ?? []} />
            </div>
          </div>

          <IdeaPanel
            ideas={panelIdeas}
            openKey={openIdea}
            onOpen={(key) => showIdea(key, "step")}
            onClose={closeIdea}
            draftTarget={(i) => (saved[i.key] ? { savedId: saved[i.key]! } : { topicId, ideaId: i.key })}
            aliasTarget={(i) => (saved[i.key] ? { topicId, ideaId: i.key } : undefined)}
            drafts={(i) => (saved[i.key] ? drafts[saved[i.key]!] ?? [] : [])}
            onDrafted={(i, s, d) => saving.onDrafted(i.key, s, d)}
            onSubtopic={(id) => {
              closeIdea()
              window.setTimeout(() => jumpToSubtopic(id), 60)
            }}
            actions={(i) => (
              <>
                <SaveButton ideaId={i.key} s={saving} size="md" />
                <Thumbs ideaId={i.key} headline={i.headline} s={saving} size="icon" />
                <CopyButton text={() => ideaText(i)} label="Copy idea" className="h-10 !px-3.5 rounded-xl" />
              </>
            )}
          />
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
            <Button disabled={deleting} onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={deleting} onClick={doDelete}>
              {deleting ? "Deleting..." : "Delete topic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
