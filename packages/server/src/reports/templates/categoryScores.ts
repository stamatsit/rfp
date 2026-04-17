import type { CategoryScore, ReportData } from "../types.js"
import { esc, toneBg, toneColor, toneFromScore, toneGrad } from "./utils.js"
import { icon } from "./icons.js"

/** Per-category score card with icon, numeric score, gauge bar, and issue count. */
export function renderCategoryScores(data: ReportData): string {
  const { categoryScores } = data
  const cards = categoryScores.categories.map(renderCategoryCard).join("\n")
  return `
<!-- ════════════ CATEGORY SCORES ════════════ -->
<section id="cat-scores">
  <div class="container">
    <div class="reveal"><div class="section-label">Category Scores</div><h2>${esc(categoryScores.heading)}</h2><p class="subtitle">${esc(categoryScores.subtitle)}</p></div>
    <div class="cat-scores-grid stagger">
${cards}
    </div>
  </div>
</section>
`
}

function renderCategoryCard(c: CategoryScore): string {
  const scoreTone = toneFromScore(c.score)
  const scoreColor = toneColor(scoreTone)
  const gaugeBg = toneGrad(scoreTone)
  // Display a minimum 1% fill so a 0 score still shows a sliver of color.
  const gaugePct = Math.max(1, c.score)
  const issueLabel = c.issueCount === 1 ? "issue" : "issues"
  const issueSuffix =
    c.id === "competitive" && c.issueCount > 0 ? `${c.issueCount} gaps` : `${c.issueCount} ${issueLabel}`
  return `      <div class="cat-score-card reveal"><div class="cat-score-top"><div class="cat-score-icon" style="background:${toneBg(c.tone)}">${icon(c.icon)}</div><div class="cat-score-num" style="color:${scoreColor}">${c.score}</div></div><h4>${esc(c.name)}</h4><div class="gauge"><div class="gauge-fill" style="width:${gaugePct}%;background:${gaugeBg}"></div></div><div class="cat-score-meta"><span>${esc(c.tagline)}</span><span>${esc(issueSuffix)}</span></div></div>`
}
