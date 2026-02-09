import { useMemo, useRef, useCallback } from "react"
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
import { Download } from "lucide-react"
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
  emerald: ["#10B981", "#06B6D4", "#F59E0B", "#6366F1", "#8B5CF6"],
}

const PIE_COLORS = ["#06B6D4", "#8B5CF6", "#10B981", "#F59E0B", "#6366F1", "#0EA5E9", "#14B8A6", "#A78BFA"]

function cloneSvgWithStyles(container: HTMLDivElement): SVGSVGElement | null {
  const svg = container.querySelector("svg")
  if (!svg) return null

  const clone = svg.cloneNode(true) as SVGSVGElement
  const rect = svg.getBoundingClientRect()

  clone.setAttribute("width", String(rect.width))
  clone.setAttribute("height", String(rect.height))
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")

  // Add white background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect")
  bg.setAttribute("width", "100%")
  bg.setAttribute("height", "100%")
  bg.setAttribute("fill", "white")
  clone.insertBefore(bg, clone.firstChild)

  // Inline all computed styles on text elements
  const origTexts = svg.querySelectorAll("text, tspan")
  const cloneTexts = clone.querySelectorAll("text, tspan")
  origTexts.forEach((origEl, i) => {
    const cloneEl = cloneTexts[i]
    if (!cloneEl) return
    const computed = window.getComputedStyle(origEl)
    ;(cloneEl as SVGElement).style.fontFamily = computed.fontFamily
    ;(cloneEl as SVGElement).style.fontSize = computed.fontSize
    ;(cloneEl as SVGElement).style.fill = computed.fill
  })

  return clone
}

function downloadChartAsSvg(chartRef: React.RefObject<HTMLDivElement | null>, title: string) {
  const container = chartRef.current
  if (!container) return

  const clone = cloneSvgWithStyles(container)
  if (!clone) return

  const svgData = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.download = `${title || "chart"}.svg`
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

function downloadChartAsPng(chartRef: React.RefObject<HTMLDivElement | null>, title: string) {
  const container = chartRef.current
  if (!container) return

  const clone = cloneSvgWithStyles(container)
  if (!clone) return

  const svg = container.querySelector("svg")!
  const rect = svg.getBoundingClientRect()
  const scale = 2 // 2x for crisp output

  const svgData = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = rect.width * scale
    canvas.height = rect.height * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, rect.width, rect.height)
    URL.revokeObjectURL(url)

    const link = document.createElement("a")
    link.download = `${title || "chart"}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }
  img.src = url
}

export function InlineChart({ config, theme }: InlineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  const colors = useMemo((): string[] => {
    if (config.colors && config.colors.length > 0) return config.colors
    return CHART_COLORS[theme.primary] ?? CHART_COLORS.cyan ?? ["#06B6D4", "#10B981", "#F59E0B", "#6366F1", "#8B5CF6"]
  }, [config.colors, theme.primary])

  const filename = useMemo(() =>
    (config.title || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
    [config.title]
  )

  const handleDownloadPng = useCallback(() => {
    downloadChartAsPng(chartRef, filename)
  }, [filename])

  const handleDownloadSvg = useCallback(() => {
    downloadChartAsSvg(chartRef, filename)
  }, [filename])

  if (!config.data || config.data.length === 0) return null

  const commonProps = {
    data: config.data,
    margin: { top: 5, right: 20, left: 10, bottom: 5 },
  }

  return (
    <div className="mt-3 mb-1 rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        {config.title ? (
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {config.title}
          </h4>
        ) : <div />}
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownloadSvg}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
            title="Download as SVG"
          >
            <Download size={14} strokeWidth={2} />
            SVG
          </button>
          <button
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
            title="Download as PNG"
          >
            <Download size={14} strokeWidth={2} />
            PNG
          </button>
        </div>
      </div>
      <div ref={chartRef}>
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
    </div>
  )
}
