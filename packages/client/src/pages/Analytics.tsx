import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from "recharts"
import {
  ArrowLeft,
  Trophy,
  Target,
  Percent,
  FileText,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { proposalInsightsApi, type ProposalMetrics } from "@/lib/api"

// ── Color palette (no pink/fuchsia) ────────────────────────
const COLORS = ["#10B981", "#06B6D4", "#8B5CF6", "#F59E0B", "#6366F1", "#0EA5E9", "#14B8A6", "#EF4444"]

// ── KPI Card ───────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-5 group hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
          <p className="text-3xl font-bold mt-1.5 text-slate-900 dark:text-white tabular-nums">{value}</p>
          {sub && <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center opacity-80"
          style={{ background: `${color}18` }}
        >
          <Icon size={20} style={{ color }} strokeWidth={2} />
        </div>
      </div>
      {/* Accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: color }} />
    </div>
  )
}

// ── Chart Card wrapper ─────────────────────────────────────

function ChartCard({ title, children, className = "" }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-5 ${className}`}>
      <h3 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Custom tooltip ─────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg px-3 py-2 text-[12px]">
      <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="tabular-nums">
          {entry.name}: <span className="font-semibold">{typeof entry.value === "number" && entry.name?.includes("Rate") ? `${entry.value}%` : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export function Analytics() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<ProposalMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    proposalInsightsApi.getMetrics()
      .then((data) => { setMetrics(data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  // ── Derived chart data ─────────────────────────────────

  const serviceData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.byService)
      .map(([name, d]) => ({ name: name.length > 20 ? name.slice(0, 18) + "..." : name, Won: d.won, Total: d.total, "Win Rate": d.rate }))
      .sort((a, b) => b.Total - a.Total)
      .slice(0, 10)
  }, [metrics])

  const yearData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.byYear)
      .map(([year, d]) => ({ year, Won: d.won, Total: d.total, "Win Rate": d.rate }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [metrics])

  const affiliationData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.byAffiliation)
      .filter(([_, d]) => d.total >= 2)
      .map(([name, d]) => ({ name: name.length > 16 ? name.slice(0, 14) + "..." : name, value: d.total, won: d.won, rate: d.rate }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [metrics])

  const schoolTypeData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.bySchoolType)
      .filter(([_, d]) => d.total >= 2)
      .map(([name, d]) => ({ name, Won: d.won, Total: d.total, "Win Rate": d.rate }))
      .sort((a, b) => b.Total - a.Total)
      .slice(0, 8)
  }, [metrics])

  const ceData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.byCE)
      .map(([name, d]) => ({ name, Won: d.won, Total: d.total, "Win Rate": d.rate }))
      .sort((a, b) => b.Total - a.Total)
      .slice(0, 8)
  }, [metrics])

  const summary = metrics?.summary

  // ── Loading state ──────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b1120]">
        <AppHeader />
        <div className="flex items-center justify-center h-[70vh]">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b1120]">
        <AppHeader />
        <div className="flex items-center justify-center h-[70vh] text-slate-400">
          <p>Failed to load metrics: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1120]">
      <AppHeader />

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Title row */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Proposal Analytics</h1>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
              Win rates, service breakdown, and trends from your proposal database
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Total Proposals"
            value={summary?.total?.toLocaleString() ?? "—"}
            sub={summary?.dateRange?.from ? `Since ${summary.dateRange.from.slice(0, 4)}` : undefined}
            icon={FileText}
            color="#6366F1"
          />
          <KPICard
            label="Win Rate"
            value={summary?.winRate != null ? `${summary.winRate}%` : "—"}
            sub={`${summary?.won ?? 0} won of ${summary?.total ?? 0}`}
            icon={Percent}
            color="#10B981"
          />
          <KPICard
            label="Won"
            value={summary?.won?.toLocaleString() ?? "—"}
            icon={Trophy}
            color="#F59E0B"
          />
          <KPICard
            label="Pending"
            value={summary?.pending?.toLocaleString() ?? "—"}
            icon={Target}
            color="#06B6D4"
          />
        </div>

        {/* Charts — Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Service Breakdown */}
          <ChartCard title="Win Rate by Service" className="lg:col-span-2">
            {serviceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={serviceData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    width={130}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Won" fill="#10B981" radius={[0, 4, 4, 0]} barSize={16} />
                  <Bar dataKey="Total" fill="rgba(99,102,241,0.25)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-300 dark:text-slate-600 text-sm">No service data</div>
            )}
          </ChartCard>

          {/* Affiliation Pie */}
          <ChartCard title="Proposals by Affiliation">
            {affiliationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={affiliationData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {affiliationData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#94A3B8" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-300 dark:text-slate-600 text-sm">No affiliation data</div>
            )}
          </ChartCard>
        </div>

        {/* Charts — Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Yearly Trend */}
          <ChartCard title="Proposals Over Time">
            {yearData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={yearData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="Total" stroke="#6366F1" strokeWidth={2.5} dot={{ fill: "#6366F1", r: 4 }} />
                  <Line type="monotone" dataKey="Won" stroke="#10B981" strokeWidth={2.5} dot={{ fill: "#10B981", r: 4 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-300 dark:text-slate-600 text-sm">No year data</div>
            )}
          </ChartCard>

          {/* School Type Breakdown */}
          <ChartCard title="Win Rate by School Type">
            {schoolTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={schoolTypeData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Won" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="Total" fill="rgba(6,182,212,0.25)" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-300 dark:text-slate-600 text-sm">No school type data</div>
            )}
          </ChartCard>
        </div>

        {/* Charts — Row 3: CE Performance */}
        <ChartCard title="Performance by CE" className="mb-6">
          {ceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ceData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Won" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="Total" fill="rgba(99,102,241,0.2)" radius={[4, 4, 0, 0]} barSize={24} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-slate-300 dark:text-slate-600 text-sm">No CE data</div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
