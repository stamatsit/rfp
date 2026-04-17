import type { ReportData } from "../types.js"
import { esc, sevClass, sevLabel } from "./utils.js"

/** Numbered priority list — the final action plan. */
export function renderPriorities(data: ReportData): string {
  const { priorities } = data
  const items = priorities.items
    .map(
      (p) =>
        `      <div class="priority-item"><div class="p-rank">${p.rank}</div><div class="p-name">${esc(p.name)}</div><span class="sev ${sevClass(p.severity)}">${sevLabel(p.severity)}</span></div>`,
    )
    .join("\n")

  return `
<!-- ════════════ PRIORITIES ════════════ -->
<section id="priorities">
  <div class="container">
    <div class="reveal"><div class="section-label">Action Plan</div><h2>${esc(priorities.heading)}</h2><p class="subtitle">${esc(priorities.subtitle)}</p></div>
    <div class="priority-list reveal">
${items}
    </div>
  </div>
</section>
`
}
