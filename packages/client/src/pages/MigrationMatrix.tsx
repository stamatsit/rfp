import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  LayoutGrid,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { toast } from "@/hooks/useToast"
import {
  migrationApi,
  type MmClient,
  type MmLatest,
  type MmSnapshotData,
  type MmTeamMember,
} from "@/lib/api"
import { MigrationAIChat } from "@/components/migration-matrix/MigrationAIChat"

const GRADIENT = "linear-gradient(135deg, #C41230 0%, #96173F 55%, #6D1D45 100%)"

const TONE_RING: Record<string, [string, string]> = {
  ok: ["#34D399", "#059669"],
  warn: ["#FBBF24", "#D97706"],
  crit: ["#F87171", "#DC2626"],
}
const fmtDate = (d: string | null) => {
  if (!d) return ""
  const dt = new Date(d + (d.length === 10 ? "T12:00:00" : ""))
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: dt.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
}

const TONE_TEXT: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  crit: "text-red-600 dark:text-red-400",
}

const TABS = [
  { id: "", label: "Overview", icon: LayoutGrid },
  { id: "team", label: "Team", icon: Users },
  { id: "reports", label: "Morning briefs", icon: Sparkles },
  { id: "sources", label: "Spreadsheets", icon: FileSpreadsheet },
] as const

/** Small external link pill used for "open in Excel" everywhere. */
function OpenLink({ href, children, primary = false }: { href?: string; children: React.ReactNode; primary?: boolean }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-xl px-3 h-9 border transition ${primary
        ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
        : "text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border-black/[0.06] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
      <ExternalLink size={13} /> {children}
    </a>
  )
}

// ─── tiny shared pieces ──────────────────────────────────────────────────────

function MiniRing({ pct, tone, size = 54 }: { pct: number; tone: string; size?: number }) {
  const r = 24
  const c = 2 * Math.PI * r
  const [c1, c2] = TONE_RING[tone] ?? TONE_RING.ok!
  const gid = `mmg-${tone}`
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(pct, 2) / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">
        {pct}%
      </span>
    </div>
  )
}

/** Weekly throughput: track = assigned, gradient fill = completed. */
function ThroughputChart({ series, weekNow }: { series: Array<[string, number, number]>; weekNow: string }) {
  if (!series.length || !series.some((s) => s[1] || s[2]))
    return <div className="h-24 flex items-center justify-center text-[12.5px] text-slate-400">no weekly activity yet</div>
  const W = 720, H = 170, padT = 28, padB = 22, ih = H - padT - padB
  const max = Math.max(...series.map((s) => Math.max(s[1], s[2] || 0)), 1)
  const gw = (W - 20) / series.length
  const bw = Math.min(36, gw * 0.42)
  const y = (v: number) => padT + ih * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[max, max / 2].map((t) => (
        <g key={t}>
          <line x1={10} x2={W - 10} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeDasharray="2 5" />
          <text x={W - 10} y={y(t) - 4} textAnchor="end" className="fill-slate-300 dark:fill-slate-600 text-[9px] tabular-nums">{Math.round(t)}</text>
        </g>
      ))}
      {series.map(([wk, a, c], i) => {
        const cx = 10 + gw * i + gw / 2
        const now = wk === weekNow
        const ratio = a ? (c || 0) / a : 1
        const fill = ratio >= 0.85 ? "#059669" : ratio >= 0.5 ? "#2563EB" : "#D97706"
        const label = a ? `${Math.round(100 * ratio)}%` : c ? `+${c}` : ""
        return (
          <g key={wk + i}>
            {now && <rect x={cx - gw / 2 + 5} y={6} width={gw - 10} height={H - 12} rx={10} fill="#3B82F6" opacity={0.07} />}
            <title>{`${wk}: ${(c || 0).toLocaleString()} of ${a.toLocaleString()} assigned pages completed`}</title>
            {a > 0 && <rect x={cx - bw / 2} y={y(a)} width={bw} height={Math.max(ih * (a / max), 3)} rx={Math.min(bw / 2, Math.max(ih * (a / max), 3) / 2)} className="fill-slate-200 dark:fill-slate-700" />}
            {(c || 0) > 0 && <rect x={cx - bw / 2} y={y(c)} width={bw} height={Math.max(ih * (c / max), 3)} rx={Math.min(bw / 2, Math.max(ih * (c / max), 3) / 2)} fill={fill} />}
            {label && <text x={cx} y={y(Math.max(a, c || 0)) - 7} textAnchor="middle" className={`text-[10px] font-semibold tabular-nums ${!c && a ? "fill-slate-300 dark:fill-slate-600" : now ? "fill-slate-900 dark:fill-white" : "fill-slate-500"}`}>{label}</text>}
            <text x={cx} y={H - 6} textAnchor="middle" className={`text-[9.5px] ${now ? "font-bold fill-slate-900 dark:fill-white" : "fill-slate-400"}`}>{wk}{now ? " · now" : ""}</text>
          </g>
        )
      })}
      <line x1={10} x2={W - 10} y1={padT + ih} y2={padT + ih} stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
    </svg>
  )
}

function ColChart({ series, color, unit = "" }: { series: Array<[string, number]>; color: string; unit?: string }) {
  const vals = series.map((s) => s[1] || 0)
  if (!vals.some((v) => v)) return <div className="h-20 flex items-center justify-center text-[12.5px] text-slate-400">no activity</div>
  const W = 340, H = 130, padT = 24, padB = 20, ih = H - padT - padB
  const max = Math.max(...vals, 1)
  const gw = (W - 16) / series.length
  const bw = Math.min(28, gw * 0.5)
  const y = (v: number) => padT + ih * (1 - v / max)
  const act = vals.filter((v) => v)
  const avg = act.reduce((s, v) => s + v, 0) / act.length
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <line x1={8} x2={W - 8} y1={y(avg)} y2={y(avg)} stroke="#94A3B8" strokeDasharray="3 5" opacity={0.55} />
        {series.map(([wk, v], i) => {
          const cx = 8 + gw * i + gw / 2
          const h = v ? Math.max(ih * (v / max), 3) : 0
          return (
            <g key={wk + i}>
              <title>{`${wk}: ${v}${unit}`}</title>
              {v > 0 ? (
                <>
                  <rect x={cx - bw / 2} y={y(v)} width={bw} height={h} rx={Math.min(bw / 2, h / 2)} fill={color} />
                  <text x={cx} y={y(v) - 5} textAnchor="middle" className="fill-slate-500 text-[9.5px] font-semibold tabular-nums">{Number.isInteger(v) ? v : v.toFixed(1)}{unit}</text>
                </>
              ) : (
                <rect x={cx - bw / 2} y={padT + ih - 3} width={bw} height={3} rx={1.5} className="fill-slate-200 dark:fill-slate-700" />
              )}
              <text x={cx} y={H - 5} textAnchor="middle" className="fill-slate-400 text-[9px]">{wk}</text>
            </g>
          )
        })}
      </svg>
      <p className="text-[11.5px] text-slate-500 mt-1">avg <b className="text-slate-700 dark:text-slate-200 tabular-nums">{avg.toFixed(1)}{unit}</b> per active week</p>
    </div>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-slate-400 mb-3">{children}</p>
}

// ─── the page ────────────────────────────────────────────────────────────────

export function MigrationMatrix() {
  useDocumentTitle("Migration Matrix")
  const [searchParams, setSearchParams] = useSearchParams()
  const [latest, setLatest] = useState<MmLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMoves, setShowMoves] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const headerSync = async () => {
    const h = await loadDirHandle()
    if (!h || !("showDirectoryPicker" in window)) { setView({ tab: "sources", c: null, p: null }); return }
    await syncFromOneDrive({ onStatus: setSyncStatus })
  }
  const [now, setNow] = useState(Date.now())

  const load = useCallback(() => {
    migrationApi.getLatest()
      .then((d) => { setLatest(d); setError(null); setLoading(false); setNow(Date.now()) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); load() }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  const selClient = searchParams.get("c")
  const selPerson = searchParams.get("p")
  const tab = searchParams.get("tab")

  const snap = latest?.snapshot
  const data = snap?.data
  const archiveMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const a of latest?.archive || []) m.set(a.name.toLowerCase(), a.archived)
    return m
  }, [latest])
  const clients = useMemo(() =>
    (data?.clients || []).map((c) => ({ ...c, archived: archiveMap.get(c.name.toLowerCase()) || c.list === "completed" })),
    [data, archiveMap])
  const active = clients.filter((c) => !c.archived && c.list !== "planned")
  const planned = clients.filter((c) => !c.archived && c.list === "planned")
  const archived = clients.filter((c) => c.archived)
  const weekNow = data?.week_lbl || ""

  const ageSec = latest?.seconds_old != null ? latest.seconds_old + Math.round((now - (loading ? now : now)) / 1000) : null
  const hbSec = latest?.last_heartbeat_seconds ?? null

  const setView = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(params)) { if (v === null) next.delete(k); else next.set(k, v) }
    setSearchParams(next)
  }

  const toggleArchive = async (c: MmClient & { archived: boolean }) => {
    try {
      const r = await migrationApi.setArchived(c.name, !c.archived)
      toast.success(r.archived ? `${c.name} archived` : `${c.name} restored`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Archive failed")
    }
  }

  const chatContext = selPerson ? `person:${selPerson}` : selClient ? `client:${selClient}` : tab === "team" ? "team" : "overview"

  // ── shells ──
  const header = (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: GRADIENT }}>
        <Activity size={20} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Web Page Builds</h1>
        <p className="text-xs text-slate-400">
          {data ? `${active.length} active projects · week of ${weekNow}` : "Migration Matrix"}
          {ageSec != null && <> · updated {ageSec < 90 ? "just now" : `${Math.round(ageSec / 60)} min ago`}</>}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <OpenLink href={data?.source_files?.tracker?.web_url}>Open the tracker</OpenLink>
        <button onClick={headerSync} disabled={!!syncStatus}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white rounded-xl px-4 h-9 disabled:opacity-60 shadow-[0_1px_2px_rgba(0,0,0,.1),0_2px_6px_rgba(196,18,48,.25)]"
          style={{ background: GRADIENT }} title="Read the spreadsheets from your OneDrive folder and rebuild the dashboard">
          <RefreshCw size={14} className={syncStatus ? "animate-spin" : ""} /> {syncStatus ? "Syncing" : "Sync"}
        </button>
      </div>
    </div>
  )

  const tabBar = (
    <div className="flex items-center gap-1 border-b border-black/[0.06] dark:border-white/[0.08] mb-6 -mt-2 overflow-x-auto">
      {TABS.map((t) => {
        const Icon = t.icon
        const isActive = (tab || "") === t.id   // drill-downs (?c=, ?p=) belong to Overview
        return (
          <button key={t.id} onClick={() => setView({ tab: t.id || null, c: null, p: null })}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${isActive
              ? "border-[#C41230] text-[#C41230] dark:text-rose-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"}`}>
            <Icon size={13} strokeWidth={isActive ? 2.5 : 2} />
            {t.label}
          </button>
        )
      })}
      {syncStatus && <span className="ml-auto text-[12px] text-slate-500 pr-1">{syncStatus}</span>}
    </div>
  )

  const staleBanner = (() => {
    if (ageSec == null) return null
    const hour = new Date().getHours(); const workhrs = hour >= 7 && hour <= 18
    if (ageSec < 30 * 60 || !workhrs) return null
    const agentAlive = hbSec != null && hbSec < 90 * 60
    const cls = ageSec > 2 * 60 * 60 && !agentAlive
      ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
      : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900"
    return (
      <div className={`border rounded-xl px-4 py-2.5 text-[13px] mb-5 ${cls}`}>
        {agentAlive
          ? `Sync agent is alive but the spreadsheets have not changed in ${Math.round(ageSec / 60)} minutes.`
          : `Data is ${Math.round(ageSec / 60)} minutes old and the sync agent is not reporting. Check the Mac running the agent.`}
      </div>
    )
  })()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900">
        <AppHeader />
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
          {header}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="shimmer h-24 rounded-2xl" />)}
          </div>
        </div>
      </div>
    )
  }

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900">
      <AppHeader />
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-24">
        {header}
        {tabBar}
        {staleBanner}
        {body}
      </div>
      <MigrationAIChat context={chatContext} />
    </div>
  )

  if (error) return shell(
    <Card className="text-center py-10">
      <p className="text-slate-600 dark:text-slate-300 text-sm">Could not load the dashboard: {error}</p>
    </Card>
  )

  if (!snap || latest?.empty || !data) return shell(
    <Card className="text-center py-14 border-dashed">
      <Sparkles size={22} className="mx-auto text-slate-300 mb-3" />
      <p className="text-slate-700 dark:text-slate-200 font-medium">Waiting for the first sync</p>
      <p className="text-[13px] text-slate-400 mt-1 max-w-md mx-auto">
        No snapshot has arrived yet. Once the agent on Eric's Mac pushes one, everything appears here automatically.
      </p>
    </Card>
  )

  // ── person view ──
  if (selPerson) {
    const t = data.team.find((m) => m.name === selPerson)
    return shell(!t ? <Card>Unknown person: {selPerson}</Card> : <PersonView t={t} back={() => setView({ p: null, tab: "team" })} openProject={(name) => setView({ p: null, c: name })} />)
  }

  // ── client view ──
  if (selClient) {
    const c = clients.find((x) => x.name === selClient)
    if (!c) return shell(<Card>Unknown project: {selClient}</Card>)
    return shell(
      <div className="space-y-4">
        <button onClick={() => setView({ c: null })} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft size={14} /> all projects
        </button>
        <Card>
          <div className="flex flex-wrap items-center gap-5">
            <MiniRing pct={c.pct} tone={c.tone} size={84} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white truncate">{c.name}</h2>
              <p className={`text-[13.5px] font-semibold ${TONE_TEXT[c.tone]}`}>{c.verdict}</p>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {c.done.toLocaleString()} of {c.total.toLocaleString()} pages done ({c.done_source}) · {c.remaining.toLocaleString()} to assign
                {c.deadline && <> · due {fmtDate(c.deadline)}</>}
                {c.projected && <> · projected {fmtDate(c.projected)}</>}
              </p>
              {c.crew.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {c.crew.map(({ name: person, hours: hrs }) => (
                    <button key={person} onClick={() => setView({ c: null, p: person })}
                      className="text-[12px] font-medium bg-slate-50 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] rounded-full px-3 py-1 hover:border-[#C41230]/50 hover:text-[#C41230] dark:text-slate-200">
                      {person} <span className="text-slate-400">{hrs}h</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OpenLink primary href={c.matrix ? data.source_files?.matrices?.find((m) => m.name.toLowerCase().startsWith(c.matrix!.name.toLowerCase()))?.web_url : undefined}>Open client matrix</OpenLink>
              <button onClick={() => toggleArchive(c)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3 h-9 hover:bg-slate-50 dark:hover:bg-slate-800">
                {c.archived ? <><ArchiveRestore size={14} /> restore</> : <><Archive size={14} /> archive</>}
              </button>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[[String(c.actual_pace), "pages/wk actual"], [c.required_pace != null ? String(c.required_pace) : "n/a", "pages/wk needed"],
            [c.actual_rate != null ? String(c.actual_rate) : "n/a", `pages/hr · plan ${c.plan_rate ?? "n/a"}`],
            [c.days_left != null ? String(Math.abs(c.days_left)) : "n/a", `day${Math.abs(c.days_left ?? 0) === 1 ? "" : "s"} ${(c.days_left ?? 0) < 0 ? "past deadline" : "to deadline"}`]].map(([v, k]) => (
            <Card key={k} className="text-center py-4">
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{v}</p>
              <p className="text-[11px] text-slate-400 mt-1">{k}</p>
            </Card>
          ))}
        </div>
        <Card>
          <Label>Weekly throughput · % of that week's assignment completed</Label>
          <ThroughputChart series={c.series} weekNow={weekNow} />
        </Card>
        {c.matrix && (
          <Card>
            <Label>Client content matrix · {c.matrix.total} pages{Math.abs(c.matrix.total - c.total) > c.total * 0.05 ? " · page counts disagree with the tracker: QA check" : ""}</Label>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                {c.matrix.funnel.map(([stage, n]) => (
                  <div key={stage} className="flex items-center gap-3 text-[12.5px]">
                    <span className="w-40 shrink-0 text-slate-500 truncate">{stage}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round((100 * n) / Math.max(c.matrix!.total, 1))}%`, background: GRADIENT }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-slate-700 dark:text-slate-200">{n}</span>
                  </div>
                ))}
              </div>
              <div>
                <ColChart series={c.matrix.weekly_deliveries} color="#059669" />
                {c.matrix.cycle_med != null && (
                  <p className="text-[12px] text-slate-500 mt-1">median cycle <b className="text-slate-700 dark:text-slate-200">{c.matrix.cycle_med} days</b> ({c.matrix.cycle_min} to {c.matrix.cycle_max}) · rework {c.matrix.rework} pages ({c.matrix.rework_pct}%)</p>
                )}
              </div>
            </div>
          </Card>
        )}
        {c.moves.length > 0 && (
          <Card>
            <button onClick={() => setShowMoves(!showMoves)} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              ✦ suggested moves {showMoves ? "(hide)" : `(${c.moves.length})`}
            </button>
            {showMoves && <ul className="mt-3 space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300 list-disc pl-5">{c.moves.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </Card>
        )}
      </div>
    )
  }

  // ── sources view ──
  if (tab === "sources") return shell(<SourcesView back={() => setView({ tab: null })} links={data.source_files} />)

  // ── reports view ──
  if (tab === "reports") return shell(<ReportsView back={() => setView({ tab: null })} />)

  // ── team view ──
  if (tab === "team") return shell(<TeamView team={data.team} back={() => setView({ tab: null })} openPerson={(n) => setView({ tab: null, p: n })} />)

  // ── overview ──
  const findings = snap.findings || []
  return shell(
    <div className="space-y-5">
      {(latest?.diff?.length ?? 0) > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-2.5 text-[13px] text-blue-800 dark:text-blue-200">
          Since last update: {latest!.diff!.slice(0, 3).map((d) => d.text).join(" · ")}
        </div>
      )}
      <Card>
        <Label>This week · all active projects</Label>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{data.overview.avail}</p><p className="text-[11px] text-slate-400 mt-0.5">hours available</p></div>
          <div><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{data.overview.assigned}</p><p className="text-[11px] text-slate-400 mt-0.5">hours assigned</p></div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{Math.round((data.overview.avail - data.overview.assigned) * 10) / 10}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{data.overview.over.length ? `room · over: ${data.overview.over.join(", ")}` : "room"}</p>
          </div>
        </div>
      </Card>
      <div>
        <Label>Projects · click to drill in</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
          {active.map((c) => tile(c))}
        </div>
      </div>
      {planned.length > 0 && (
        <div>
          <Label>Planned · on the tracker's Planned Projects sheet, not started</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {planned.map((c) => tile(c))}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <details className="text-[13px] text-slate-500">
          <summary className="cursor-pointer font-medium">Archived ({archived.length}): suppressed from the overview</summary>
          <div className="mt-2 space-y-1.5">
            {archived.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span>{c.name}</span>
                {c.list === "completed"
                  ? <span className="text-[12px] text-slate-400">on the Completed Projects sheet</span>
                  : <button onClick={() => toggleArchive(c)} className="text-blue-600 dark:text-blue-400 hover:underline text-[12px]">restore</button>}
              </div>
            ))}
          </div>
        </details>
      )}
      {findings.filter((f) => f.severity === "high").length > 0 && (
        <Card>
          <Label>Data quality · from the validator</Label>
          <ul className="space-y-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
            {findings.filter((f) => f.severity === "high").slice(0, 6).map((f, i) => (
              <li key={i} className="flex gap-2"><span className="text-red-500 shrink-0">●</span> {f.message}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )

  function tile(c: MmClient & { archived: boolean }) {
            const mism = c.matrix && Math.abs(c.matrix.total - c.total) > c.total * 0.05
            return (
              <button key={c.name} onClick={() => setView({ c: c.name })}
                className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl px-5 py-4 text-left hover:shadow-md hover:-translate-y-px transition">
                <MiniRing pct={c.pct} tone={c.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[14.5px] text-slate-900 dark:text-white truncate">{c.name}</span>
                  <span className="block text-[12.5px] text-slate-500 truncate">
                    {c.verdict === "fully assigned"
                      ? <><span className="text-emerald-600 dark:text-emerald-400 font-medium">fully assigned</span> · {c.done.toLocaleString()} of {c.total.toLocaleString()} done</>
                      : c.tone !== "ok"
                        ? <><span className={`font-medium ${TONE_TEXT[c.tone]}`}>{c.verdict}</span> · {c.remaining.toLocaleString()} to assign</>
                        : <>{c.deadline ? `due ${fmtDate(c.deadline)} · ` : ""}{c.remaining.toLocaleString()} to assign</>}
                    {mism && <span title={`matrix has ${c.matrix!.total} pages but tracker says ${c.total}: QA check`} className="text-amber-500"> ⚠</span>}
                  </span>
                </span>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            )
  }
}

// ─── team + person subviews ──────────────────────────────────────────────────

// ─── Sync from OneDrive ──────────────────────────────────────────────────────
// The person clicking is signed in and has the spreadsheets in their synced
// OneDrive folder, so no robot credentials are needed: read the files from
// disk (File System Access API where available, file chooser elsewhere),
// upload them, trigger the cloud rebuild, reload when the snapshot lands.
type DirHandle = { name: string; values: () => AsyncIterable<{ kind: string; name: string; getFile: () => Promise<File> }>; queryPermission?: (o: { mode: string }) => Promise<string>; requestPermission?: (o: { mode: string }) => Promise<string> }
const HANDLE_DB = "mm-sync"
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(HANDLE_DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore("kv")
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function loadDirHandle(): Promise<DirHandle | null> {
  try { const db = await idb(); return await new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get("dir"); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null) }) } catch { return null }
}
async function saveDirHandle(h: DirHandle) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction("kv", "readwrite").objectStore("kv").put(h, "dir"); t.onsuccess = () => res(null); t.onerror = () => res(null) }) } catch { /* ignore */ }
}
function classify(files: File[]): { tracker: File | null; matrices: File[] } {
  const xlsx = files.filter((f) => /\.xlsx$/i.test(f.name) && !f.name.startsWith("~$"))
  const matrices = xlsx.filter((f) => f.name.toLowerCase().includes("content-matrix"))
  const rest = xlsx.filter((f) => !matrices.includes(f))
  const tracker = rest.find((f) => f.name.toLowerCase().includes("tracker")) || rest[0] || null
  return { tracker, matrices }
}

/** Upload the chosen files, trigger the cloud rebuild once, reload when the snapshot lands. */
async function runSyncFiles(files: File[], onStatus: (s: string | null) => void, onUploaded?: () => void) {
  const { tracker, matrices } = classify(files)
  if (!tracker && matrices.length === 0) { toast.error("No .xlsx files found (need the tracker and content-matrix-*.xlsx files)"); return }
  const started = Date.now()
  try {
    onStatus("uploading spreadsheets...")
    if (tracker) await migrationApi.uploadSource("tracker", tracker, { nosync: true })
    for (const m of matrices) await migrationApi.uploadSource("matrix", m, { nosync: true })
    const r = await migrationApi.syncNow()
    onUploaded?.()
    if (!r.triggered) { onStatus(null); toast.info(`Uploaded ${files.length} file(s). ${r.note}`); return }
    onStatus("rebuilding the dashboard in the cloud, about a minute...")
    for (let i = 0; i < 40; i++) {              // poll up to ~4 min for the new snapshot
      await new Promise((res) => setTimeout(res, 6000))
      const latest = await migrationApi.getLatest().catch(() => null)
      const at = latest?.snapshot?.created_at ? new Date(latest.snapshot.created_at).getTime() : 0
      if (at > started) { toast.success("Dashboard updated from your spreadsheets"); window.location.href = "/migration"; return }
    }
    onStatus(null); toast.warning("Still rebuilding. Refresh the dashboard in a minute.")
  } catch (e) {
    onStatus(null); toast.error(e instanceof Error ? e.message : "Sync failed")
  }
}

/** Folder-handle path (Chrome/Edge): first time asks for the folder, then one click. */
async function syncFromOneDrive({ onStatus, onFolder, onUploaded }: { onStatus: (s: string | null) => void; onFolder?: (name: string) => void; onUploaded?: () => void }) {
  try {
    let h = await loadDirHandle()
    if (h && h.queryPermission && (await h.queryPermission({ mode: "read" })) !== "granted" && h.requestPermission)
      if ((await h.requestPermission({ mode: "read" })) !== "granted") h = null
    if (!h) {
      h = await (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<DirHandle> }).showDirectoryPicker({ id: "mm-sources", mode: "read" })
      await saveDirHandle(h); onFolder?.(h.name)
    }
    const files: File[] = []
    for await (const entry of h.values()) if (entry.kind === "file") files.push(await entry.getFile())
    await runSyncFiles(files, onStatus, onUploaded)
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return
    toast.error(e instanceof Error ? e.message : "Could not read the folder")
  }
}

function SourcesView({ back, links }: { back: () => void; links?: MmSnapshotData["source_files"] }) {
  const [data, setData] = useState<{ sources: Array<{ kind: string; name: string; size: number; updated_at: string | null }>; sync: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window
  const load = () => migrationApi.listSources().then(setData).catch((e) => toast.error(e.message))
  useEffect(() => { load(); loadDirHandle().then((h) => h && setFolderName(h.name)) }, [])
  const runSync = async (files: File[]) => { setBusy("sync"); await runSyncFiles(files, setStatus, load); setBusy(null) }
  const syncFromFolder = async () => { setBusy("sync"); await syncFromOneDrive({ onStatus: setStatus, onFolder: setFolderName, onUploaded: load }); setBusy(null) }
  const linkFor = (name: string) => {
    if (!links) return undefined
    if (links.tracker?.name === name) return links.tracker.web_url
    return links.matrices?.find((m) => m.name === name)?.web_url
  }

  const onPick = async (kind: "tracker" | "matrix", input: HTMLInputElement) => {
    const file = input.files?.[0]; if (!file) return
    setBusy(kind)
    try { const r = await migrationApi.uploadSource(kind, file); toast.success(`${r.name} uploaded. ${r.note}`); load() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed") }
    finally { setBusy(null); input.value = "" }
  }
  const fmtSize = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
  return (
    <div className="space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> overview
      </button>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <Label>Sync from OneDrive</Label>
          <OpenLink href={links?.folder_url}><FolderOpen size={13} /> Open the OneDrive folder</OpenLink>
        </div>
        <p className="text-[13px] text-slate-600 dark:text-slate-300 mb-4">
          Edit the spreadsheets in the shared OneDrive folder like always. When you want the dashboard to catch up, press Sync: it reads the files from your synced folder, uploads them, and rebuilds the dashboard{data?.sync?.startsWith("on upload") ? " in about two minutes" : " on the next scheduled run"}.
          {canPickFolder ? (folderName ? ` Folder: ${folderName}.` : " The first time, it asks you to pick the Migration Matrix folder.") : " Your browser will ask you to choose the files."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canPickFolder ? (
            <button onClick={syncFromFolder} disabled={!!busy}
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-white rounded-xl px-5 h-11 disabled:opacity-60" style={{ background: GRADIENT }}>
              <RefreshCw size={16} className={busy === "sync" ? "animate-spin" : ""} /> {busy === "sync" ? "Syncing" : folderName ? "Sync now" : "Choose folder and sync"}
            </button>
          ) : (
            <label className={`inline-flex items-center gap-2 text-[13.5px] font-semibold text-white rounded-xl px-5 h-11 cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} style={{ background: GRADIENT }}>
              <RefreshCw size={16} className={busy === "sync" ? "animate-spin" : ""} /> {busy === "sync" ? "Syncing" : "Choose the spreadsheets and sync"}
              <input type="file" accept=".xlsx" multiple className="hidden" data-testid="sync-files" onChange={(e) => { const fs = Array.from(e.currentTarget.files || []); e.currentTarget.value = ""; runSync(fs) }} />
            </label>
          )}
          {canPickFolder && (
            <label className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 h-9 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
              or choose files
              <input type="file" accept=".xlsx" multiple className="hidden" data-testid="sync-files" onChange={(e) => { const fs = Array.from(e.currentTarget.files || []); e.currentTarget.value = ""; runSync(fs) }} />
            </label>
          )}
          {status && <span className="text-[12.5px] text-slate-500">{status}</span>}
        </div>
      </Card>
      <Card>
        <Label>Spreadsheets the dashboard reads</Label>
        {!data && <div className="shimmer h-20 rounded-xl" />}
        {data && (
          <div className="space-y-2">
            {data.sources.map((s) => (
              <div key={s.kind + s.name} className="flex items-center gap-3 text-[13px] border-t border-black/[0.04] dark:border-white/[0.05] pt-2 first:border-0 first:pt-0">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-slate-400 w-16 shrink-0">{s.kind === "tracker" ? "tracker" : "matrix"}</span>
                <span className="font-medium text-slate-900 dark:text-white truncate">{s.name}</span>
                {linkFor(s.name) && <a href={linkFor(s.name)} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 shrink-0"><ExternalLink size={12} /> open in Excel</a>}
                <span className="ml-auto text-slate-400 tabular-nums shrink-0">{fmtSize(s.size)}{s.updated_at ? ` · ${new Date(s.updated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
              </div>
            ))}
            {data.sources.length === 0 && <p className="text-[13px] text-slate-400">No spreadsheets synced yet.</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <label className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3 h-8 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
            {busy === "tracker" ? "uploading..." : "replace only the tracker"}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => onPick("tracker", e.currentTarget)} />
          </label>
          <label className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3 h-8 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
            {busy === "matrix" ? "uploading..." : "add or update one matrix"}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => onPick("matrix", e.currentTarget)} />
          </label>
        </div>
      </Card>
    </div>
  )
}

function ReportsView({ back }: { back: () => void }) {
  const [data, setData] = useState<{ date: string | null; reports: Array<{ audience: string; body: string }> } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    migrationApi.getReports().then(setData).catch((e) => setErr(e.message))
  }, [])
  return (
    <div className="space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> overview
      </button>
      {err && <Card><p className="text-[13px] text-slate-500">Could not load briefs: {err}</p></Card>}
      {!err && !data && <div className="shimmer h-40 rounded-2xl" />}
      {data && !data.date && (
        <Card className="text-center py-10 border-dashed">
          <p className="text-slate-700 dark:text-slate-200 font-medium">No morning briefs yet</p>
          <p className="text-[13px] text-slate-400 mt-1">The first ones generate on the next weekday morning run.</p>
        </Card>
      )}
      {data?.date && (
        <>
          <p className="text-[12.5px] text-slate-400">Briefs for {fmtDate(data.date)} · generated from the live snapshot</p>
          {data.reports.map((r) => (
            <Card key={r.audience}>
              <Label>{r.audience === "crystal" ? "Manager brief" : r.audience}</Label>
              <div className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: r.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }} />
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

function TeamView({ team, back, openPerson }: { team: MmTeamMember[]; back: () => void; openPerson: (n: string) => void }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"done" | "hours" | "vel">("done")
  const rows = useMemo(() => {
    const f = team.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()) || t.role.toLowerCase().includes(q.toLowerCase()))
    return [...f].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0))
  }, [team, q, sort])
  return (
    <div className="space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> overview
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter people or roles"
          className="h-9 px-3 text-[13px] rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-slate-900 dark:text-white outline-none focus:border-blue-400 w-56" />
        {(["done", "hours", "vel"] as const).map((s) => (
          <button key={s} onClick={() => setSort(s)}
            className={`h-9 px-3 text-[12.5px] font-medium rounded-xl border ${sort === s ? "border-blue-400 text-blue-600 dark:text-blue-400" : "border-black/[0.06] dark:border-white/[0.08] text-slate-500"}`}>
            by {s === "vel" ? "pages/hr" : s}
          </button>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-slate-400 border-b border-black/[0.06] dark:border-white/[0.08]">
              <th className="px-5 py-3 font-medium">Person</th><th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium text-right">Hours</th><th className="px-3 py-3 font-medium text-right">Assigned</th>
              <th className="px-3 py-3 font-medium text-right">Done</th><th className="px-3 py-3 font-medium text-right">Done %</th>
              <th className="px-5 py-3 font-medium text-right">Pages/hr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.name} onClick={() => openPerson(t.name)}
                className="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{t.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{t.role}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.hours}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.assigned.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{t.done.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.comp}%</td>
                <td className={`px-5 py-2.5 text-right tabular-nums ${t.vel != null && t.vel >= 3 ? "text-emerald-600" : t.vel != null && t.vel < 1.5 ? "text-amber-600" : ""}`}>{t.vel ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonView({ t, back, openProject }: { t: MmTeamMember; back: () => void; openProject: (n: string) => void }) {
  const room = (t.avail ?? 0) - t.wk_hours
  return (
    <div className="space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> team
      </button>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{t.name}</h2>
        <span className="text-[11.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2.5 py-1">{t.role}</span>
        {t.avail != null && (
          <span className={`text-[11.5px] font-medium rounded-full px-2.5 py-1 ${room < 0 ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
            this week: {t.wk_hours}h of {t.avail}h{room < 0 ? ` · over by ${(-room).toFixed(1)}` : ""}
          </span>
        )}
      </div>
      <Card>
        <Label>All-time on the tracker</Label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          {[[String(t.hours), "hours logged"], [t.assigned.toLocaleString(), "pages assigned"], [t.done.toLocaleString(), "pages done"],
            [`${t.comp}%`, "of assigned"], [t.vel != null ? String(t.vel) : "n/a", "pages/hr"]].map(([v, k]) => (
            <div key={k}><p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{v}</p><p className="text-[11px] text-slate-400 mt-0.5">{k}</p></div>
          ))}
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-3">
        <Card><Label>Hours per week</Label><ColChart series={t.weekly.map(([w, h]) => [w, h])} color="#2563EB" unit="h" /></Card>
        <Card><Label>Pages completed per week</Label><ColChart series={t.weekly.map(([w, , c]) => [w, c])} color="#059669" /></Card>
      </div>
      <Card>
        <Label>Projects</Label>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-[0.05em] text-slate-400"><th className="py-2 font-medium">Project</th><th className="py-2 font-medium text-right">Hours</th><th className="py-2 font-medium text-right">Assigned</th><th className="py-2 font-medium text-right">Done</th><th className="py-2 font-medium text-right">Done %</th></tr></thead>
          <tbody>
            {t.projects.map(([pr, h, x, d]) => (
              <tr key={pr} className="border-t border-black/[0.04] dark:border-white/[0.05]">
                <td className="py-2"><button onClick={() => openProject(pr)} className="text-slate-900 dark:text-white hover:text-blue-600 font-medium text-left">{pr}</button></td>
                <td className="py-2 text-right tabular-nums">{h}</td>
                <td className="py-2 text-right tabular-nums">{x.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{d.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums">{x ? `${Math.round((100 * d) / x)}%` : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export default MigrationMatrix
