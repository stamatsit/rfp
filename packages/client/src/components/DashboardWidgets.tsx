import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { getVisibleWidgets, WidgetConfig, WidgetSize } from "./SettingsPanel"
import { proposalInsightsApi, ProposalMetrics } from "@/lib/api"

// ============================================================================
// Types
// ============================================================================

interface WidgetProps {
  widget: WidgetConfig
  metrics: ProposalMetrics | null
}

// ============================================================================
// Size Classes
// ============================================================================

const sizeClasses: Record<WidgetSize, { container: string; padding: string }> = {
  small: { container: "col-span-1", padding: "p-4" },
  medium: { container: "col-span-1 sm:col-span-2", padding: "p-5" },
  large: { container: "col-span-1 sm:col-span-2 lg:col-span-3", padding: "p-6" },
}

// ============================================================================
// Pipeline Widget (replaces Win Rate Chart)
// ============================================================================

function PipelineWidget({ widget, metrics }: WidgetProps) {
  const sizes = sizeClasses[widget.size]
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const byCategory = metrics?.byCategory ?? {}
  const categoryColors: Record<string, { color: string; label: string }> = {
    research: { color: "#3B82F6", label: "Research" },
    creative: { color: "#8B5CF6", label: "Creative" },
    digital: { color: "#F59E0B", label: "Digital" },
    website: { color: "#06B6D4", label: "Website" },
    pr: { color: "#EF4444", label: "PR" },
  }

  const segments = Object.entries(byCategory)
    .map(([key, data]) => ({
      label: categoryColors[key]?.label ?? key,
      value: data.total,
      color: categoryColors[key]?.color ?? "#94A3B8",
    }))
    .sort((a, b) => b.value - a.value)

  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <Link
      to="/insights"
      className={`${sizes.container} group block rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 flex flex-col`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Services</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {total > 0 ? total.toLocaleString() : "—"}
            </span>
            {total > 0 && (
              <span className="text-[12px] text-slate-400 dark:text-slate-500">
                proposals
              </span>
            )}
          </div>
        </div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: widget.gradient }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
            <rect x="1" y="8" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.5" />
            <rect x="6" y="4" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.75" />
            <rect x="11" y="1" width="3" height="13" rx="0.5" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="mt-auto">
        {total > 0 ? (
          <>
            <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              {segments.map((seg) => {
                const pct = total > 0 ? (seg.value / total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={seg.label}
                    className="h-full transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: animated ? `${pct}%` : "0%",
                      backgroundColor: seg.color,
                    }}
                  />
                )
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
              {segments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{seg.label} <span className="font-semibold text-slate-600 dark:text-slate-300">{seg.value}</span></span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[12px] text-slate-400 dark:text-slate-500 italic">No proposals synced yet</p>
        )}
      </div>
    </Link>
  )
}


// ============================================================================
// Top Services Widget (replaces Quick Stats)
// ============================================================================

function TopServicesWidget({ widget, metrics }: WidgetProps) {
  const sizes = sizeClasses[widget.size]
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // Get top 3 categories by win rate (min 2 proposals to be meaningful)
  const categories = metrics?.byCategory ?? {}
  const ranked = Object.entries(categories)
    .filter(([, d]) => d.total >= 2)
    .sort((a, b) => b[1].rate - a[1].rate)
    .slice(0, 3)

  // Pretty-print category names
  const formatCategory = (key: string) => {
    const map: Record<string, string> = {
      research: "Research",
      creative: "Creative",
      digital: "Digital",
      website: "Website",
      pr: "PR",
    }
    return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
  }

  const colors = ["#10B981", "#3B82F6", "#8B5CF6"]

  return (
    <div className={`${sizes.container} rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Top Services</p>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: widget.gradient }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
            <path d="M7 1l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.07l-3.52 1.78.67-3.93L1.3 5.14l3.94-.57L7 1z" fill="currentColor" />
          </svg>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-2.5 flex-1">
        {ranked.length > 0 ? (
          ranked.map(([key, data], i) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 w-[52px] truncate">
                {formatCategory(key)}
              </span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: animated ? `${Math.round(data.rate * 100)}%` : "0%",
                    backgroundColor: colors[i],
                    transitionDelay: `${i * 100}ms`,
                  }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 w-[38px] text-right tabular-nums">
                {data.won}/{data.total}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-slate-400 dark:text-slate-500 italic">No proposal data yet</p>
        )}
      </div>
    </div>
  )
}


// ============================================================================
// Proposal Momentum Widget
// ============================================================================

function ProposalMomentumWidget({ widget, metrics }: WidgetProps) {
  const sizes = sizeClasses[widget.size]
  const [animatedPercent, setAnimatedPercent] = useState(0)

  // Calculate real momentum from metrics
  const winRate = metrics?.summary?.winRate ?? 0
  const momentum = Math.round(winRate * 100)
  const totalProposals = metrics?.summary?.total ?? 0
  const wonProposals = metrics?.summary?.won ?? 0

  const status = momentum >= 70 ? "Accelerating" : momentum >= 40 ? "Steady" : "Slowing"
  const statusColor = momentum >= 70 ? "text-emerald-500" : momentum >= 40 ? "text-amber-500" : "text-red-500"

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(momentum), 200)
    return () => clearTimeout(timer)
  }, [momentum])

  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference

  if (!metrics || totalProposals === 0) {
    return (
      <div className={`${sizes.container} rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center`}>
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Momentum</p>
        <p className="text-[12px] text-slate-400 dark:text-slate-500 italic">No proposal data yet</p>
      </div>
    )
  }

  return (
    <Link
      to="/insights"
      className={`${sizes.container} group block rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 flex flex-col`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Momentum</p>
        <span className={`text-[11px] font-bold ${statusColor}`}>{status}</span>
      </div>

      <div className="flex items-center gap-4 flex-1">
        {/* Circular Gauge */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-100 dark:text-slate-800"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              style={{
                stroke: momentum >= 70 ? "#10B981" : momentum >= 40 ? "#F59E0B" : "#EF4444",
                strokeDasharray: circumference,
                strokeDashoffset,
                transition: "stroke-dashoffset 1s ease-out",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-900 dark:text-white">{momentum}%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 dark:text-slate-500">Total</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{totalProposals} proposals</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 dark:text-slate-500">Won</span>
            <span className="font-medium text-emerald-500">{wonProposals} won</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ============================================================================
// Widget Renderer
// ============================================================================

function WidgetRenderer({ widget, metrics, index }: WidgetProps & { index: number }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 150)
    return () => clearTimeout(timer)
  }, [index])

  const content = (() => {
    switch (widget.type) {
      case "win-rate-chart":
        return <PipelineWidget widget={widget} metrics={metrics} />
      case "quick-stats":
        return <TopServicesWidget widget={widget} metrics={metrics} />
      case "proposal-momentum":
        return <ProposalMomentumWidget widget={widget} metrics={metrics} />
      default:
        return null
    }
  })()

  return (
    <div
      className="transition-all duration-500 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
      }}
    >
      {content}
    </div>
  )
}

// ============================================================================
// Main Dashboard Widgets Component
// ============================================================================

export function DashboardWidgets() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => getVisibleWidgets())
  const [metrics, setMetrics] = useState<ProposalMetrics | null>(null)

  // Load widgets from settings and listen for changes
  useEffect(() => {
    const handleSettingsChange = () => {
      setWidgets(getVisibleWidgets())
    }

    window.addEventListener("settings-changed", handleSettingsChange)
    return () => window.removeEventListener("settings-changed", handleSettingsChange)
  }, [])

  // Fetch proposal metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await proposalInsightsApi.getMetrics()
        setMetrics(data)
      } catch {
        // Metrics not available
      }
    }
    fetchMetrics()
  }, [])

  if (widgets.length === 0) return null

  return (
    <section className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((widget, index) => (
          <WidgetRenderer key={widget.id} widget={widget} metrics={metrics} index={index} />
        ))}
      </div>
    </section>
  )
}
