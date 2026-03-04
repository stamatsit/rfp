import { useState, useEffect, useMemo } from "react"
import { Search, Loader2, AlertCircle, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui"
import { proposalInsightsApi, type ProposalMetrics } from "@/lib/api"

export function ProposalsSection() {
  const [metrics, setMetrics] = useState<ProposalMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [breakdownTab, setBreakdownTab] = useState<"service" | "ce" | "schoolType" | "year">("service")
  const [query, setQuery] = useState("")
  const [sortCol, setSortCol] = useState<"name" | "total" | "won" | "rate">("rate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    proposalInsightsApi.getMetrics()
      .then((data) => { if (!cancelled) setMetrics(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const breakdownData = useMemo(() => {
    if (!metrics) return []
    const source = breakdownTab === "service" ? metrics.byService : breakdownTab === "ce" ? metrics.byCE : breakdownTab === "schoolType" ? metrics.bySchoolType : metrics.byYear
    return Object.entries(source)
      .map(([name, data]) => ({ name, ...data, rate: Math.round(data.rate * 100) }))
      .filter((row) => !query.trim() || row.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const val = sortCol === "name" ? a.name.localeCompare(b.name) : sortCol === "total" ? a.total - b.total : sortCol === "won" ? a.won - b.won : a.rate - b.rate
        return sortDir === "desc" ? -val : val
      })
  }, [metrics, breakdownTab, query, sortCol, sortDir])

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortCol(col); setSortDir("desc") }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
  if (error || !metrics?.summary) return <div className="flex-1 flex items-center justify-center"><div className="text-center"><AlertCircle size={24} className="mx-auto text-slate-400 mb-2" /><p className="text-sm text-slate-500">{error || "No proposal data available"}</p></div></div>

  const { summary } = metrics

  const summaryCards = [
    { label: "Total Proposals", value: summary.total, gradient: "from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-900" },
    { label: "Win Rate", value: `${summary.winRate}%`, gradient: "from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900" },
    { label: "Won", value: summary.won, gradient: "from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-900" },
    { label: "Lost", value: summary.lost, gradient: "from-slate-50 to-white dark:from-slate-800/30 dark:to-slate-900" },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card) => (
            <div key={card.label} className={`bg-gradient-to-br ${card.gradient} border border-slate-200/40 dark:border-slate-700/30 rounded-2xl px-4 py-4 shadow-[0_0_0_1px_rgb(0_0_0_/_0.02),0_1px_2px_rgb(0_0_0_/_0.03)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_0.03),0_1px_2px_rgb(0_0_0_/_0.2)]`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.label}</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tracking-[-0.02em]">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Segmented control */}
        <div className="flex gap-0.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl p-1 w-fit">
          {([
            { id: "service" as const, label: "By Service" },
            { id: "ce" as const, label: "By Account Exec" },
            { id: "schoolType" as const, label: "By School Type" },
            { id: "year" as const, label: "By Year" },
          ]).map((t) => (
            <button key={t.id} onClick={() => { setBreakdownTab(t.id); setQuery("") }}
              className={`px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                breakdownTab === t.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative group max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter..."
            className="pl-9 h-9 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]" />
        </div>

        {/* Table */}
        <div className="border border-slate-200/40 dark:border-slate-700/30 rounded-2xl overflow-hidden shadow-[0_0_0_1px_rgb(0_0_0_/_0.02),0_1px_2px_rgb(0_0_0_/_0.03)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_0.03),0_1px_2px_rgb(0_0_0_/_0.2)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-sm border-b border-slate-200/40 dark:border-slate-700/30">
                {([
                  { col: "name" as const, label: breakdownTab === "ce" ? "Account Exec" : breakdownTab === "schoolType" ? "School Type" : breakdownTab === "year" ? "Year" : "Service" },
                  { col: "total" as const, label: "Proposals" },
                  { col: "won" as const, label: "Won" },
                  { col: "rate" as const, label: "Win Rate" },
                ]).map((h) => (
                  <th key={h.col} onClick={() => handleSort(h.col)}
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none transition-colors duration-150">
                    <span className="flex items-center gap-1">
                      {h.label}
                      {sortCol === h.col && (sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronDown size={12} className="rotate-180" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-slate-700/30">
              {breakdownData.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-150">
                  <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.total}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.won}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(row.rate, 100)}%` }} />
                      </div>
                      <span className="text-slate-700 dark:text-slate-300 text-xs font-medium tabular-nums">{row.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {breakdownData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">No data matches your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {summary.dateRange?.from && summary.dateRange?.to && (
          <p className="text-[11px] text-slate-400">
            Data range: {new Date(summary.dateRange.from).toLocaleDateString()} — {new Date(summary.dateRange.to).toLocaleDateString()} · {summary.pending} pending
          </p>
        )}
      </div>
    </div>
  )
}
