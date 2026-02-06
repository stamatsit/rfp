import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts"
import type { ChartConfig, ChatTheme } from "@/types/chat"

interface InlineChartProps {
  config: ChartConfig
  theme: ChatTheme
}

// Theme-safe palette — no pink/fuchsia
const CHART_COLORS: Record<string, string[]> = {
  cyan: ["#06B6D4", "#10B981", "#F59E0B", "#6366F1", "#8B5CF6"],
  violet: ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#6366F1"],
  indigo: ["#6366F1", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6"],
  purple: ["#7C3AED", "#06B6D4", "#10B981", "#F59E0B", "#6366F1"],
}

const PIE_COLORS = ["#06B6D4", "#8B5CF6", "#10B981", "#F59E0B", "#6366F1", "#0EA5E9", "#14B8A6", "#A78BFA"]

export function InlineChart({ config, theme }: InlineChartProps) {
  const colors = useMemo((): string[] => {
    if (config.colors && config.colors.length > 0) return config.colors
    return CHART_COLORS[theme.primary] ?? CHART_COLORS.cyan ?? ["#06B6D4", "#10B981", "#F59E0B", "#6366F1", "#8B5CF6"]
  }, [config.colors, theme.primary])

  if (!config.data || config.data.length === 0) return null

  const commonProps = {
    data: config.data,
    margin: { top: 5, right: 20, left: 10, bottom: 5 },
  }

  return (
    <div className="mt-3 mb-1 rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
      {config.title && (
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          {config.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={280}>
        {config.type === "bar" ? (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" label={config.yAxisLabel ? { value: config.yAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 12 } } : undefined} />
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            {config.showLegend !== false && config.yKeys.length > 1 && <Legend />}
            {config.yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : config.type === "line" ? (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" label={config.yAxisLabel ? { value: config.yAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 12 } } : undefined} />
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            {config.showLegend !== false && config.yKeys.length > 1 && <Legend />}
            {config.yKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            ))}
          </LineChart>
        ) : config.type === "area" ? (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" label={config.yAxisLabel ? { value: config.yAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 12 } } : undefined} />
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            {config.showLegend !== false && config.yKeys.length > 1 && <Legend />}
            {config.yKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} strokeWidth={2} />
            ))}
          </AreaChart>
        ) : config.type === "pie" ? (
          <PieChart>
            <Pie
              data={config.data}
              dataKey={config.yKeys[0] || "value"}
              nameKey={config.xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }: { name?: string; percent?: number }) => `${name || ""} ${((percent || 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: "#94a3b8" }}
            >
              {config.data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            {config.showLegend !== false && <Legend />}
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  )
}
