import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

/** Feature-by-feature comparison table vs. peer set. */
export function renderCompetitive(data: ReportData): string {
  const { competitive } = data
  const rows = competitive.features
    .map(
      (f) =>
        `          <tr><td>${esc(f.feature)}</td><td class="${f.subject ? "ck" : "cx"}" style="text-align:center">${f.subject ? "&#10003;" : "&#10007;"}</td><td class="ck" style="text-align:center">&#10003; ${esc(f.peers)}</td></tr>`,
    )
    .join("\n")

  return `
<!-- ════════════ COMPETITIVE ════════════ -->
<section id="competitive">
  <div class="container">
    <div class="reveal"><div class="section-label">Competitive Landscape</div><h2>${esc(competitive.heading)}</h2><p class="subtitle">${esc(competitive.subtitle)}</p></div>
    <div class="table-wrap reveal">
      <table>
        <thead><tr><th>Feature</th><th style="text-align:center;width:90px">${esc(competitive.subjectColumnLabel)}</th><th style="text-align:center;width:100px">Peers</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <div class="callout warn reveal"><h3>${esc(competitive.warning.heading)}</h3><p>${esc(competitive.warning.body)}</p></div>
  </div>
</section>
`
}
