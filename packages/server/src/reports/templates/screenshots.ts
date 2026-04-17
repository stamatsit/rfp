import type { ReportData } from "../types.js"
import { esc } from "./utils.js"
import { icon } from "./icons.js"

/** Desktop + mobile screenshot pair with optional full-page callouts. */
export function renderScreenshots(data: ReportData): string {
  if (!data.screenshots) return ""
  const { screenshots } = data

  const mobileCard = screenshots.images.mobile
    ? `      <div class="screenshot-card"><img src="${esc(screenshots.images.mobile)}" alt="${esc(data.client.name)} page mobile" loading="lazy" style="max-height:600px;object-fit:cover;object-position:top"><div class="screenshot-cap">${icon("mobile")}Mobile &mdash; 375&times;812</div></div>`
    : ""

  const callouts = (screenshots.callouts ?? [])
    .map(
      (c, i) =>
        `    <div class="callout reveal"${i > 0 ? ' style="margin-top:12px;"' : ""}><h3>${esc(c.heading)}</h3><p>${c.bodyHtml}</p></div>`,
    )
    .join("\n")

  return `
<!-- ════════════ SCREENSHOTS ════════════ -->
<section id="screenshots">
  <div class="container">
    <div class="reveal"><div class="section-label">Current State</div><h2>${esc(screenshots.heading)}</h2><p class="subtitle">${esc(screenshots.subtitle)}</p></div>
    <div class="screenshot-grid reveal">
      <div class="screenshot-card"><img src="${esc(screenshots.images.desktop)}" alt="${esc(data.client.name)} page desktop" loading="lazy"><div class="screenshot-cap">${icon("desktop")}Desktop &mdash; 1440&times;900</div></div>
${mobileCard}
    </div>
${callouts}
  </div>
</section>
`
}
