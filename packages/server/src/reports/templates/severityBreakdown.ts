import type { ReportData } from "../types.js"
import { barHeights, donutSeg, esc } from "./utils.js"

/** Bar chart + donut chart showing severity distribution of issues. */
export function renderSeverityBreakdown(data: ReportData): string {
  const { severity } = data
  const { counts } = severity
  const total = counts.critical + counts.high + counts.medium + counts.low

  const bars = barHeights({
    critical: counts.critical,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
  })

  const order: Array<{ key: keyof typeof counts; label: string; bg: string }> = [
    { key: "critical", label: "Critical", bg: "bg-critical" },
    { key: "high", label: "High", bg: "bg-high" },
    { key: "medium", label: "Medium", bg: "bg-medium" },
    { key: "low", label: "Low", bg: "bg-low" },
  ]

  const barHtml = order
    .map(
      (s) =>
        `        <div class="bar-group ${s.bg}"><div class="bar" style="height:${bars[s.key]}%"><span class="bar-val">${counts[s.key]}</span></div><span class="bar-label">${s.label}</span></div>`,
    )
    .join("\n")

  // Donut segments — calculated with cumulative offsets.
  const segC = donutSeg(total > 0 ? counts.critical / total : 0)
  const segH = donutSeg(total > 0 ? counts.high / total : 0)
  const segM = donutSeg(total > 0 ? counts.medium / total : 0)
  const segL = donutSeg(total > 0 ? counts.low / total : 0)

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  return `
<!-- ════════════ SEVERITY ════════════ -->
<section id="severity">
  <div class="container">
    <div class="reveal"><div class="section-label">Severity Breakdown</div><h2>${esc(severity.heading)}</h2><p class="subtitle">${esc(severity.subtitle)}</p></div>
    <div class="chart-row reveal">
      <div class="bar-chart">
${barHtml}
      </div>
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 200 200">
            <circle class="donut-track" cx="100" cy="100" r="90"/>
            <circle class="donut-seg" cx="100" cy="100" r="90" stroke="var(--critical)" style="--seg:${segC}"/>
            <circle class="donut-seg" cx="100" cy="100" r="90" stroke="var(--high)" style="--seg:${segH}" stroke-dashoffset="-${segC}"/>
            <circle class="donut-seg" cx="100" cy="100" r="90" stroke="var(--medium)" style="--seg:${segM}" stroke-dashoffset="-${segC + segH}"/>
            <circle class="donut-seg" cx="100" cy="100" r="90" stroke="var(--low)" style="--seg:${segL}" stroke-dashoffset="-${segC + segH + segM}"/>
          </svg>
          <div class="donut-center"><span class="big">${total}</span><span class="small">Total Issues</span></div>
        </div>
        <div class="donut-legend">
          <div class="legend-row"><span class="legend-dot" style="background:var(--critical)"></span>Critical &mdash; ${counts.critical} (${pct(counts.critical)}%)</div>
          <div class="legend-row"><span class="legend-dot" style="background:var(--high)"></span>High &mdash; ${counts.high} (${pct(counts.high)}%)</div>
          <div class="legend-row"><span class="legend-dot" style="background:var(--medium)"></span>Medium &mdash; ${counts.medium} (${pct(counts.medium)}%)</div>
          <div class="legend-row"><span class="legend-dot" style="background:var(--low)"></span>Low &mdash; ${counts.low} (${pct(counts.low)}%)</div>
        </div>
      </div>
    </div>
  </div>
</section>
`
}
