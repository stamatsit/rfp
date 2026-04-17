import type { ReportData } from "../types.js"
import { esc, toneBg } from "./utils.js"
import { icon } from "./icons.js"

/** Six narrative cards driving the top-level story of the audit. */
export function renderExecutiveSummary(data: ReportData): string {
  const { executiveSummary } = data
  const cards = executiveSummary.cards
    .map(
      (c) =>
        `      <div class="exec-card reveal"><div class="exec-icon" style="background:${toneBg(c.tone)}">${icon(c.icon)}</div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`,
    )
    .join("\n")

  return `
<!-- ════════════ EXECUTIVE SUMMARY ════════════ -->
<section id="exec">
  <div class="container">
    <div class="reveal"><div class="section-label">Executive Summary</div><h2>${esc(executiveSummary.heading)}</h2><p class="subtitle">${esc(executiveSummary.subtitle)}</p></div>
    <div class="exec-grid stagger">
${cards}
    </div>
  </div>
</section>
`
}
