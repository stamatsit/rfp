import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronRight,
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
    (data?.clients || []).map((c) => ({ ...c, archived: archiveMap.get(c.name.toLowerCase()) || false })),
    [data, archiveMap])
  const active = clients.filter((c) => !c.archived)
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
        <button onClick={() => { setLoading(true); load() }}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3.5 h-9 hover:bg-slate-50 dark:hover:bg-slate-800">
          <RefreshCw size={14} /> refresh
        </button>
      </div>
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
                  {c.crew.map(([person, hrs]) => (
                    <button key={person} onClick={() => setView({ c: null, p: person })}
                      className="text-[12px] font-medium bg-slate-50 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] rounded-full px-3 py-1 hover:border-[#C41230]/50 hover:text-[#C41230] dark:text-slate-200">
                      {person} <span className="text-slate-400">{hrs}h</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => toggleArchive(c)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-3 h-9 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0">
              {c.archived ? <><ArchiveRestore size={14} /> restore</> : <><Archive size={14} /> archive</>}
            </button>
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
        <div className="flex items-center justify-between">
          <Label>This week · all active projects</Label>
          <button onClick={() => setView({ tab: "team" })} className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
            <Users size={13} /> view the team
          </button>
        </div>
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
          {active.map((c) => {
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
          })}
        </div>
      </div>
      {archived.length > 0 && (
        <details className="text-[13px] text-slate-500">
          <summary className="cursor-pointer font-medium">Archived ({archived.length}): suppressed from the overview</summary>
          <div className="mt-2 space-y-1.5">
            {archived.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span>{c.name}</span>
                <button onClick={() => toggleArchive(c)} className="text-blue-600 dark:text-blue-400 hover:underline text-[12px]">restore</button>
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
}

// ─── team + person subviews ──────────────────────────────────────────────────

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
