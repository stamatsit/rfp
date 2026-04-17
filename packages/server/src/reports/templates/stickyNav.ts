import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

/** Sticky side/top nav with anchor links. */
export function renderStickyNav(data: ReportData): string {
  const links = data.nav
    .map((l) => `    <a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join("\n")
  return `
<nav class="sticky-nav" id="stickyNav">
  <div class="sticky-nav-inner">
    <span class="nav-brand">Gap Analysis</span>
${links}
  </div>
</nav>
`
}
