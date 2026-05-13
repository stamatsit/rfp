import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Mic,
  UploadCloud,
  ExternalLink,
  Loader2,
  Users,
  BarChart3,
  ShieldAlert,
  Building2,
  UserCheck,
  UserX,
  Search,
  Download,
  RefreshCw,
  Trash2,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { toast } from "@/hooks/useToast"
import {
  webinarsApi,
  type WebinarListItem,
  type WebinarDetail,
  type WebinarRegistrant,
  type WebinarPersonRow,
  type WebinarStats,
  type WebinarCategory,
  type WebinarFollowUpStatus,
} from "@/lib/api"

const CATEGORY_LABEL: Record<WebinarCategory, string> = {
  client: "Client",
  employee: "Employee",
  "non-client": "Non-Client",
  "do-not-contact": "Do Not Contact",
}

const CATEGORY_PILL: Record<WebinarCategory, string> = {
  client: "bg-emerald-100 text-emerald-800 border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300",
  employee: "bg-sky-100 text-sky-800 border-sky-200/70 dark:bg-sky-900/30 dark:text-sky-300",
  "non-client": "bg-slate-100 text-slate-600 border-slate-200/70 dark:bg-slate-800 dark:text-slate-300",
  "do-not-contact": "bg-red-100 text-red-700 border-red-200/70 dark:bg-red-900/30 dark:text-red-300",
}

const FOLLOWUP_LABEL: Record<WebinarFollowUpStatus, string> = {
  "no-outreach": "No outreach",
  "vm-left": "VM left",
  "email-sent": "Email sent",
  connected: "Connected",
  dead: "Dead",
}

type Tab = "webinars" | "people" | "stats"

export function Webinars() {
  const [tab, setTab] = useState<Tab>("webinars")
  const [webinars, setWebinars] = useState<WebinarListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await webinarsApi.list()
      setWebinars(list)
    } catch (err) {
      toast.error(`Failed to load webinars: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0"
              style={{ background: "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)", boxShadow: "0 4px 12px rgba(6,182,212,0.35)" }}
            >
              <Mic size={20} className="text-white" strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">Webinars</h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Upload GoToWebinar exports — auto-categorize, search, and export.
              </p>
            </div>
          </div>
          <Link
            to="/clients"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Manage clients
            <ExternalLink size={11} />
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200/70 dark:border-slate-800">
          {(["webinars", "people", "stats"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "text-cyan-700 dark:text-cyan-400 border-cyan-500"
                  : "text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {t === "webinars" && <><Building2 size={13} className="inline -mt-0.5 mr-1.5" />Webinars</>}
              {t === "people" && <><Users size={13} className="inline -mt-0.5 mr-1.5" />People</>}
              {t === "stats" && <><BarChart3 size={13} className="inline -mt-0.5 mr-1.5" />Stats</>}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "webinars" && <WebinarsTab webinars={webinars} loading={loading} refresh={refresh} />}
        {tab === "people" && <PeopleTab />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
  )
}

// ───────────────── WEBINARS TAB ─────────────────
function WebinarsTab({ webinars, loading, refresh }: { webinars: WebinarListItem[]; loading: boolean; refresh: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const result = await webinarsApi.upload(file)
        toast.success(`Upload complete: ${result.inserted} new, ${result.updated} updated · ${result.uploadKind}`)
      }
      await refresh()
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        }`}
      >
        <UploadCloud size={28} className="mx-auto text-slate-400 dark:text-slate-500 mb-2" />
        <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
          {uploading ? "Uploading…" : "Drag GoToWebinar XLSX files here"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Registration or attendance exports. Matches existing webinars by webinar key.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-3 px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
          {uploading ? "Uploading" : "or browse"}
        </button>
      </div>

      {/* Webinars list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : webinars.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          No webinars yet. Drop a GoToWebinar registration export above to start.
        </div>
      ) : (
        <ul className="space-y-3">
          {webinars.map(w => (
            <WebinarCard key={w.id} webinar={w} expanded={openId === w.id} onToggle={() => setOpenId(openId === w.id ? null : w.id)} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  )
}

function WebinarCard({ webinar, expanded, onToggle, onChanged }: {
  webinar: WebinarListItem
  expanded: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const counts = webinar.counts
  return (
    <li className="rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{webinar.title}</h3>
            {webinar.webinarDate && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {new Date(webinar.webinarDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <CountPill cat="client" n={counts.client} />
            <CountPill cat="non-client" n={counts["non-client"]} />
            <CountPill cat="employee" n={counts.employee} />
            {counts["do-not-contact"] > 0 && <CountPill cat="do-not-contact" n={counts["do-not-contact"]} />}
            <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">
              · {counts.total} total{counts.attended > 0 ? ` · ${counts.attended} attended` : ""}
            </span>
          </div>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <WebinarDetailPanel webinarId={webinar.id} onChanged={onChanged} />}
    </li>
  )
}

function CountPill({ cat, n }: { cat: WebinarCategory; n: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${CATEGORY_PILL[cat]}`}>
      {cat === "do-not-contact" && <ShieldAlert size={9} />}
      {CATEGORY_LABEL[cat]} {n}
    </span>
  )
}

function WebinarDetailPanel({ webinarId, onChanged }: { webinarId: string; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<WebinarDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<"all" | WebinarCategory>("all")
  const [search, setSearch] = useState("")
  const [showDnc, setShowDnc] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await webinarsApi.get(webinarId)
      setDetail(d)
    } catch (err) {
      toast.error(`Failed to load detail: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [webinarId])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!detail) return []
    let rows = detail.registrants
    if (!showDnc) rows = rows.filter(r => r.category !== "do-not-contact")
    if (category !== "all") rows = rows.filter(r => r.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.email.toLowerCase().includes(q) ||
        (r.firstName?.toLowerCase().includes(q) ?? false) ||
        (r.lastName?.toLowerCase().includes(q) ?? false) ||
        (r.organizationRaw?.toLowerCase().includes(q) ?? false)
      )
    }
    return rows
  }, [detail, category, search, showDnc])

  const handleRecategorize = async () => {
    setBusy(true)
    try {
      const r = await webinarsApi.recategorize(webinarId)
      toast.success(`Re-categorized ${r.changed} of ${r.scanned}`)
      await load()
      await onChanged()
    } catch (err) {
      toast.error(`Recategorize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this webinar and all its registrants? This cannot be undone.")) return
    setBusy(true)
    try {
      await webinarsApi.delete(webinarId)
      toast.success("Webinar deleted")
      await onChanged()
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handlePatchRegistrant = async (r: WebinarRegistrant, patch: Parameters<typeof webinarsApi.patchRegistrant>[2]) => {
    try {
      const updated = await webinarsApi.patchRegistrant(webinarId, r.id, patch)
      setDetail(d => d ? { ...d, registrants: d.registrants.map(x => x.id === r.id ? updated : x) } : d)
    } catch (err) {
      toast.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (loading) return (
    <div className="px-4 py-6 flex items-center justify-center text-slate-400">
      <Loader2 size={16} className="animate-spin" />
    </div>
  )
  if (!detail) return null

  return (
    <div className="border-t border-slate-100 dark:border-slate-800">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as any)}
          className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="all">All categories</option>
          <option value="client">Client</option>
          <option value="non-client">Non-Client</option>
          <option value="employee">Employee</option>
          <option value="do-not-contact">Do Not Contact</option>
        </select>
        <button
          onClick={() => setShowDnc(v => !v)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
            showDnc
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200/60"
              : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200/60 dark:border-slate-700"
          }`}
          title={showDnc ? "Hide DNC" : "Show DNC"}
        >
          {showDnc ? <Eye size={11} /> : <EyeOff size={11} />}
          DNC
        </button>
        <button
          onClick={async () => {
            try {
              await webinarsApi.downloadExport(webinarId, "xlsx", {
                category: category === "all" ? undefined : category,
                excludeDnc: !showDnc,
                q: search.trim() || undefined,
              })
            } catch (err) {
              toast.error(`XLSX export failed: ${err instanceof Error ? err.message : String(err)}`)
            }
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          title="Export the rows currently shown (respects search, category, and DNC toggle)"
        >
          <Download size={11} /> XLSX
        </button>
        <button
          onClick={async () => {
            try {
              await webinarsApi.downloadExport(webinarId, "csv", {
                category: category === "all" ? undefined : category,
                excludeDnc: !showDnc,
                q: search.trim() || undefined,
              })
            } catch (err) {
              toast.error(`CSV export failed: ${err instanceof Error ? err.message : String(err)}`)
            }
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          title="Export the rows currently shown (respects search, category, and DNC toggle)"
        >
          <Download size={11} /> CSV
        </button>
        <button
          onClick={handleRecategorize}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200/60 dark:border-cyan-800/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 disabled:opacity-50"
        >
          <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> Re-categorize
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200/60 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          title="Delete webinar"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Registrants table */}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/40 sticky top-0">
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="text-left font-semibold px-3 py-2">Name</th>
              <th className="text-left font-semibold px-3 py-2">Email</th>
              <th className="text-left font-semibold px-3 py-2">Category</th>
              <th className="text-left font-semibold px-3 py-2">Attended</th>
              <th className="text-left font-semibold px-3 py-2">Follow-up</th>
              <th className="text-left font-semibold px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No registrants match.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="px-3 py-2 whitespace-nowrap">
                  {[r.firstName, r.lastName].filter(Boolean).join(" ") || <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={r.category}
                    onChange={e => handlePatchRegistrant(r, { category: e.target.value as WebinarCategory })}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border bg-transparent ${CATEGORY_PILL[r.category]} ${r.manualOverride ? "ring-1 ring-amber-400" : ""}`}
                    title={r.manualOverride ? "Manually overridden" : "Auto-categorized"}
                  >
                    {(Object.keys(CATEGORY_LABEL) as WebinarCategory[]).map(c => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {r.attended === null ? <span className="text-slate-400">—</span> : r.attended ? <UserCheck size={13} className="text-emerald-600" /> : <UserX size={13} className="text-slate-400" />}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.followUpStatus}
                    onChange={e => handlePatchRegistrant(r, { followUpStatus: e.target.value as WebinarFollowUpStatus })}
                    className="px-1.5 py-0.5 rounded-md text-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {(Object.keys(FOLLOWUP_LABEL) as WebinarFollowUpStatus[]).map(s => (
                      <option key={s} value={s}>{FOLLOWUP_LABEL[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    defaultValue={r.followUpNotes ?? ""}
                    onBlur={e => {
                      const v = e.target.value.trim()
                      if (v !== (r.followUpNotes ?? "")) handlePatchRegistrant(r, { followUpNotes: v })
                    }}
                    placeholder="—"
                    className="w-full px-1.5 py-0.5 rounded-md text-[11px] border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-cyan-400 focus:outline-none bg-transparent"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: showing N of M */}
      <div className="px-4 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
        Showing {filtered.length} of {detail.registrants.length}{showDnc ? "" : ` · ${detail.registrants.filter(r => r.category === "do-not-contact").length} DNC hidden`}
      </div>
    </div>
  )
}

// ───────────────── PEOPLE TAB ─────────────────
type PeopleSortKey = "name" | "email" | "organization" | "webinarCount" | "attendedCount" | "lastSeen"
type SortDir = "asc" | "desc"

function PeopleTab() {
  const [rows, setRows] = useState<WebinarPersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showDnc, setShowDnc] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<"all" | WebinarCategory>("all")
  const [sortKey, setSortKey] = useState<PeopleSortKey>("webinarCount")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    webinarsApi.people()
      .then(d => { if (!cancelled) setRows(d) })
      .catch(err => toast.error(`Failed to load people view: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toggleSort = (key: PeopleSortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      // Sensible defaults: text columns ascend, numeric/date descend
      setSortDir(key === "name" || key === "email" || key === "organization" ? "asc" : "desc")
    }
  }

  const filteredAndSorted = useMemo(() => {
    let r = rows
    if (!showDnc) r = r.filter(p => p.category !== "do-not-contact")
    if (categoryFilter !== "all") r = r.filter(p => p.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(p =>
        p.email.toLowerCase().includes(q) ||
        (p.firstName?.toLowerCase().includes(q) ?? false) ||
        (p.lastName?.toLowerCase().includes(q) ?? false) ||
        (p.organizationRaw?.toLowerCase().includes(q) ?? false)
      )
    }
    const sorted = [...r]
    const mul = sortDir === "asc" ? 1 : -1
    const nameOf = (p: WebinarPersonRow) => `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim().toLowerCase()
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name": return mul * nameOf(a).localeCompare(nameOf(b))
        case "email": return mul * a.email.localeCompare(b.email)
        case "organization": return mul * (a.organizationRaw ?? "").localeCompare(b.organizationRaw ?? "")
        case "webinarCount": return mul * (a.webinarCount - b.webinarCount)
        case "attendedCount": return mul * (a.attendedCount - b.attendedCount)
        case "lastSeen": return mul * (new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime())
        default: return 0
      }
    })
    return sorted
  }, [rows, search, showDnc, categoryFilter, sortKey, sortDir])

  // Counts per category for the chip badges
  const categoryCounts = useMemo(() => {
    const c: Record<"all" | WebinarCategory, number> = { all: 0, client: 0, "non-client": 0, employee: 0, "do-not-contact": 0 }
    for (const p of rows) {
      c.all++
      c[p.category]++
    }
    return c
  }, [rows])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, or organization…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400"
          />
        </div>
        <button
          onClick={() => setShowDnc(v => !v)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
            showDnc
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200/60"
              : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200/60 dark:border-slate-700"
          }`}
        >
          {showDnc ? <Eye size={11} /> : <EyeOff size={11} />}
          DNC
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {(["all", "client", "non-client", "employee"] as const).map(c => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
              categoryFilter === c
                ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200 shadow-sm"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-slate-300"
            }`}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
            <span className={`tabular-nums opacity-70 ${categoryFilter === c ? "" : ""}`}>
              {categoryCounts[c]}
            </span>
          </button>
        ))}
        {showDnc && (
          <button
            onClick={() => setCategoryFilter("do-not-contact")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
              categoryFilter === "do-not-contact"
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-red-300"
            }`}
          >
            <ShieldAlert size={9} />
            DNC <span className="tabular-nums opacity-70">{categoryCounts["do-not-contact"]}</span>
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/40">
              <tr className="text-slate-500 dark:text-slate-400">
                <SortableTh label="Name" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh label="Email" sortKey="email" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh label="Organization" sortKey="organization" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <th className="text-left font-semibold px-3 py-2">Category</th>
                <SortableTh label="Webinars" sortKey="webinarCount" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                <SortableTh label="Attended" sortKey="attendedCount" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                <SortableTh label="Last seen" sortKey="lastSeen" current={sortKey} dir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No people match.</td></tr>
              ) : filteredAndSorted.map(p => (
                <tr key={p.email} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2 whitespace-nowrap">{[p.firstName, p.lastName].filter(Boolean).join(" ") || <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.email}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 truncate max-w-[260px]">{p.organizationRaw ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${CATEGORY_PILL[p.category]}`}>{CATEGORY_LABEL[p.category]}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.webinarCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.attendedCount}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{new Date(p.lastSeen).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
            Showing {filteredAndSorted.length} of {rows.length}{!showDnc && categoryCounts["do-not-contact"] > 0 ? ` · ${categoryCounts["do-not-contact"]} DNC hidden` : ""}
          </div>
        </div>
      )}
    </div>
  )
}

function SortableTh({ label, sortKey, current, dir, onClick, align = "left" }: {
  label: string
  sortKey: PeopleSortKey
  current: PeopleSortKey
  dir: SortDir
  onClick: (key: PeopleSortKey) => void
  align?: "left" | "right"
}) {
  const isActive = current === sortKey
  return (
    <th className={`font-semibold px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${isActive ? "text-slate-700 dark:text-slate-200" : ""}`}
      >
        {label}
        {isActive && (dir === "asc" ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
      </button>
    </th>
  )
}

// ───────────────── STATS TAB ─────────────────
function StatsTab() {
  const [stats, setStats] = useState<WebinarStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    webinarsApi.stats()
      .then(s => { if (!cancelled) setStats(s) })
      .catch(err => toast.error(`Failed to load stats: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
  if (!stats) return null

  const totalsByCat: Record<WebinarCategory, number> = { client: 0, employee: 0, "non-client": 0, "do-not-contact": 0 }
  for (const c of stats.categoryCounts) totalsByCat[c.category] = c.n

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Category breakdown */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Registrants by category</h3>
        <ul className="space-y-2">
          {(Object.keys(CATEGORY_LABEL) as WebinarCategory[]).map(c => (
            <li key={c} className="flex items-center justify-between gap-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${CATEGORY_PILL[c]}`}>
                {c === "do-not-contact" && <ShieldAlert size={10} />}
                {CATEGORY_LABEL[c]}
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{totalsByCat[c]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Top organizations */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Top client organizations</h3>
        {stats.topOrgs.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No client registrants yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {stats.topOrgs.slice(0, 15).map((o, i) => (
              <li key={`${o.clientId ?? "x"}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-700 dark:text-slate-200">
                  {o.clientName || o.organizationRaw || "—"}
                </span>
                <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-400">{o.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
