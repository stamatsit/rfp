import type { ReportData } from "../types.js"
import { esc, gradeBadgeStyle, ringFill, toneFromScore } from "./utils.js"

/** Circular SVG score gauge + grade badge + per-category grade rows. */
export function renderHealthScore(data: ReportData): string {
  const { healthScore } = data
  const fill = ringFill(healthScore.score)
  const tone = toneFromScore(healthScore.score)
  const ringColorStops =
    tone === "critical"
      ? { a: "#dc2626", b: "#f87171" }
      : tone === "high"
        ? { a: "#d97706", b: "#fbbf24" }
        : { a: "#059669", b: "#34d399" }
  const valueColor =
    tone === "critical" ? "var(--critical)" : tone === "high" ? "var(--high)" : "var(--low)"

  const gradeStyle =
    healthScore.grade === "F" || healthScore.grade === "D"
      ? "background:var(--critical-bg);color:var(--critical);border:1px solid var(--critical-border);box-shadow:0 0 20px -6px rgba(248,113,113,.15);"
      : healthScore.grade === "C"
        ? "background:var(--high-bg);color:var(--high);border:1px solid var(--high-border);"
        : "background:var(--low-bg);color:var(--low);border:1px solid var(--low-border);"

  const subGradeRows = healthScore.subGrades
    .map(
      (g) =>
        `          <div class="grade-row"><div class="grade-letter" style="${gradeBadgeStyle(g.grade)}">${esc(g.grade)}</div><div><div class="grade-name">${esc(g.name)}</div><div class="grade-score">${g.score} / 100</div></div></div>`,
    )
    .join("\n")

  return `
<!-- ════════════ HEALTH SCORE ════════════ -->
<section id="health-score" class="health-section">
  <div class="container">
    <div class="reveal"><div class="section-label">Overall Health Score</div><h2>${esc(healthScore.heading)}</h2><p class="subtitle">${esc(healthScore.subtitle)}</p></div>
    <div class="health-grid reveal" style="margin-top:48px;">
      <div class="score-ring">
        <svg viewBox="0 0 260 260">
          <circle class="score-ring-bg" cx="130" cy="130" r="120"/>
          <circle class="score-ring-fill" cx="130" cy="130" r="120" stroke="url(#sg)" style="--fill:${fill}"/>
          <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${ringColorStops.a}"/><stop offset="100%" stop-color="${ringColorStops.b}"/></linearGradient></defs>
        </svg>
        <div class="score-center">
          <div><span class="score-val" style="color:${valueColor}">${healthScore.score}</span><span class="score-of">/100</span></div>
          <div class="score-lbl">Overall Score</div>
        </div>
      </div>
      <div>
        <div class="grade-badge" style="${gradeStyle}">Grade: ${esc(healthScore.grade)} &mdash; ${
          healthScore.grade === "F" ? "Critical attention needed" : healthScore.grade === "D" ? "Significant gaps" : "Room to improve"
        }</div>
        <p style="color:var(--text-secondary);font-size:.9rem;line-height:1.75;margin-bottom:20px;">${esc(healthScore.body)}</p>
        <div class="grades">
${subGradeRows}
        </div>
      </div>
    </div>
  </div>
</section>
`
}
