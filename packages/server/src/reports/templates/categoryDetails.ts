import type { CategoryDetail, ReportData } from "../types.js"
import { esc, sevClass, sevLabel, toneBg, toneColor } from "./utils.js"
import { icon } from "./icons.js"

/** One section per category, each containing a list of flagged issues. */
export function renderCategoryDetails(data: ReportData): string {
  return data.categoryDetails.categories.map(renderCategorySection).join("\n")
}

function renderCategorySection(c: CategoryDetail): string {
  const issueCards = c.issues
    .map(
      (i) =>
        `<div class="issue-card reveal"><span class="sev ${sevClass(i.severity)}">${sevLabel(i.severity)}</span><div><div class="issue-title">${esc(i.title)}</div><div class="issue-desc">${esc(i.description)}</div></div></div>`,
    )
    .join("\n")

  const scoreColor = toneColor(c.score >= 70 ? "low" : c.score >= 40 ? "high" : "critical")

  return `
<!-- ${c.name.toUpperCase()} -->
<section id="cat-${esc(c.id)}" class="cat-section"><div class="container"><div class="reveal"><div class="cat-head"><div class="cat-icon" style="background:${toneBg(c.tone)}">${icon(c.icon)}</div><div><h2 style="margin-bottom:2px">${esc(c.name)}</h2><p style="color:var(--text-muted);font-size:.84rem">${esc(c.subtitle)}</p></div><div class="cat-right"><div class="cat-inline-score" style="color:${scoreColor}">${c.score}/100</div><div class="cat-count">${c.issueCount} issues</div></div></div></div><div class="issue-list stagger">
${issueCards}
</div></div></section>`
}
