import type { Opportunity, ReportData } from "../types.js"
import { esc, toneBg, toneColor, toneGrad } from "./utils.js"

/** Cards highlighting strategic opportunities with 3 metrics each. */
export function renderOpportunities(data: ReportData): string {
  const { opportunities } = data
  const cards = opportunities.items.map(renderOpportunityCard).join("\n")
  return `
<!-- ════════════ OPPORTUNITIES ════════════ -->
<section id="opportunities">
  <div class="container">
    <div class="reveal"><div class="section-label">Opportunities</div><h2>${esc(opportunities.heading)}</h2><p class="subtitle">${esc(opportunities.subtitle)}</p></div>
    <div class="opp-grid stagger">
${cards}
    </div>
  </div>
</section>
`
}

function renderOpportunityCard(o: Opportunity): string {
  const metricColor = toneColor(o.tone)
  const grad = toneGrad(o.tone)
  const badgeBg =
    o.tone === "accent"
      ? "var(--accent-dim);color:var(--accent);border:1px solid rgba(129,140,248,.15)"
      : o.tone === "purple"
        ? "rgba(168,85,247,.08);color:#a78bfa;border:1px solid rgba(168,85,247,.15)"
        : `${toneBg(o.tone)};border:1px solid var(--${o.tone}-border)`

  const metrics = o.metrics
    .map(
      (m) =>
        `<div class="opp-metric"><div class="opp-metric-val" style="color:${metricColor}">${esc(m.value)}</div><div class="opp-metric-lbl">${esc(m.label)}</div></div>`,
    )
    .join("")

  return `      <div class="opp-card reveal"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:${grad}"></div><div class="opp-impact" style="background:${badgeBg}">${esc(o.impactLabel)}</div><h3>${esc(o.title)}</h3><p>${esc(o.body)}</p><div class="opp-metrics">${metrics}</div></div>`
}
