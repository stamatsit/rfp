import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { TrendingUp, TrendingDown, ArrowRight, Zap } from "lucide-react"
import { getVisibleWidgets, WidgetConfig, WidgetSize } from "./SettingsPanel"
import { topicsApi, answersApi, photosApi } from "@/lib/api"

// ============================================================================
// Types
// ============================================================================

interface WidgetProps {
  widget: WidgetConfig
  stats: {
    topics: number
    answers: number
    photos: number
  }
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
// Win Rate Chart Widget
// ============================================================================

function WinRateChartWidget({ widget }: WidgetProps) {
  const [animatedPath, setAnimatedPath] = useState(0)
  const sizes = sizeClasses[widget.size]

  // Sample data - in production this would come from your proposal API
  const data = useMemo(() => [65, 58, 72, 68, 75, 82, 78, 85], [])
  const currentRate = data[data.length - 1]!
  const previousRate = data[data.length - 2]!
  const trend = currentRate - previousRate

  // Animate path on mount
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPath(1), 100)
    return () => clearTimeout(timer)
  }, [])

  // Generate SVG path
  const pathD = useMemo(() => {
    const width = 200
    const height = 60
    const padding = 10
    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1

    const points = data.map((val, i) => ({
      x: padding + (i / (data.length - 1)) * (width - padding * 2),
      y: height - padding - ((val - min) / range) * (height - padding * 2),
    }))

    // Create smooth curve
    let d = `M ${points[0]!.x} ${points[0]!.y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!
      const curr = points[i]!
      const cpx = (prev.x + curr.x) / 2
      d += ` Q ${cpx} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`
      d += ` Q ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
    }
    return d
  }, [data])

  return (
    <Link
      to="/insights"
      className={`${sizes.container} group block rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 flex flex-col`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Win Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{currentRate}%</span>
            <span className={`flex items-center text-[12px] font-medium ${trend >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {trend >= 0 ? "+" : ""}{trend}%
            </span>
          </div>
        </div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: widget.gradient }}
        >
          <TrendingUp size={16} className="text-white" />
        </div>
      </div>

      {/* Animated Chart */}
      <div className="relative flex-1 mt-1">
        <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
          {/* Gradient fill */}
          <defs>
            <linearGradient id="winRateGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path
            d={`${pathD} L 190 55 L 10 55 Z`}
            fill="url(#winRateGradient)"
            style={{
              opacity: animatedPath,
              transition: "opacity 0.8s ease-out",
            }}
          />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              strokeDasharray: 500,
              strokeDashoffset: animatedPath ? 0 : 500,
              transition: "stroke-dashoffset 1s ease-out",
            }}
          />

          {/* End dot */}
          <circle
            cx="190"
            cy={60 - 10 - ((currentRate - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * 40}
            r="4"
            fill="#10B981"
            style={{
              opacity: animatedPath,
              transition: "opacity 0.8s ease-out 0.5s",
            }}
          />
        </svg>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors">
        View proposal insights <ArrowRight size={10} className="inline ml-1" />
      </p>
    </Link>
  )
}


// ============================================================================
// Quick Stats Widget
// ============================================================================

function QuickStatsWidget({ widget, stats }: WidgetProps) {
  const sizes = sizeClasses[widget.size]
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const statItems = [
    { label: "Answers", value: stats.answers, color: "#8B5CF6" },
    { label: "Topics", value: stats.topics, color: "#3B82F6" },
    { label: "Photos", value: stats.photos, color: "#F59E0B" },
  ]

  const maxValue = Math.max(...statItems.map(s => s.value), 1)

  return (
    <div className={`${sizes.container} rounded-2xl ${sizes.padding} h-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Library Stats</p>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: widget.gradient }}
        >
          <Zap size={14} className="text-white" />
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 flex-1">
        {statItems.map((stat, i) => (
          <div key={stat.label} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[15px] font-bold text-slate-900 dark:text-white mb-1">
              {stat.value.toLocaleString()}
            </span>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-lg overflow-hidden" style={{ height: "48px" }}>
              <div
                className="w-full rounded-t-lg transition-all duration-700 ease-out"
                style={{
                  background: stat.color,
                  height: animated ? `${(stat.value / maxValue) * 100}%` : "0%",
                  transitionDelay: `${i * 150}ms`,
                }}
              />
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


// ============================================================================
// Proposal Momentum Widget
// ============================================================================

function ProposalMomentumWidget({ widget }: WidgetProps) {
  const sizes = sizeClasses[widget.size]
  const [animatedPercent, setAnimatedPercent] = useState(0)

  // Sample momentum data
  const momentum = 75
  const status = momentum >= 70 ? "Accelerating" : momentum >= 40 ? "Steady" : "Slowing"
  const statusColor = momentum >= 70 ? "text-emerald-500" : momentum >= 40 ? "text-amber-500" : "text-red-500"

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(momentum), 200)
    return () => clearTimeout(timer)
  }, [momentum])

  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference

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
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-100 dark:text-slate-800"
            />
            {/* Progress circle */}
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
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-900 dark:text-white">{momentum}%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 dark:text-slate-500">This month</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">12 proposals</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 dark:text-slate-500">Win rate</span>
            <span className="font-medium text-emerald-500">+8% vs last</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ============================================================================
// Widget Renderer
// ============================================================================

function WidgetRenderer({ widget, stats, index }: WidgetProps & { index: number }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 150)
    return () => clearTimeout(timer)
  }, [index])

  const content = (() => {
    switch (widget.type) {
      case "win-rate-chart":
        return <WinRateChartWidget widget={widget} stats={stats} />
      case "quick-stats":
        return <QuickStatsWidget widget={widget} stats={stats} />
      case "proposal-momentum":
        return <ProposalMomentumWidget widget={widget} stats={stats} />
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
  const [stats, setStats] = useState({ topics: 0, answers: 0, photos: 0 })

  // Load widgets from settings and listen for changes
  useEffect(() => {
    const handleSettingsChange = () => {
      setWidgets(getVisibleWidgets())
    }

    window.addEventListener("settings-changed", handleSettingsChange)
    return () => window.removeEventListener("settings-changed", handleSettingsChange)
  }, [])

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [topicsRes, answersRes, photosRes] = await Promise.all([
          topicsApi.getAll().catch(() => []),
          answersApi.getAll().catch(() => []),
          photosApi.getAll().catch(() => []),
        ])
        setStats({
          topics: Array.isArray(topicsRes) ? topicsRes.length : 0,
          answers: Array.isArray(answersRes) ? answersRes.length : 0,
          photos: Array.isArray(photosRes) ? photosRes.length : 0,
        })
      } catch {
        // Keep default values
      }
    }
    fetchStats()
  }, [])

  if (widgets.length === 0) return null

  return (
    <section className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((widget, index) => (
          <WidgetRenderer key={widget.id} widget={widget} stats={stats} index={index} />
        ))}
      </div>
    </section>
  )
}
