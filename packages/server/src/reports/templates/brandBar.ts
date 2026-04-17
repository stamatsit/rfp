import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

/** Fixed top brand bar — logo + firm name + "Gap Analysis Report" + client context. */
export function renderBrandBar(data: ReportData): string {
  const { firm, client, meta } = data
  const preparedFor = `PREPARED FOR ${client.name.toUpperCase()} \u2022 ${meta.dateDisplay.toUpperCase()}`
  return `
<div class="brand-bar" id="brandBar">
  <div class="brand-bar-left">
    <img class="brand-bar-logo" src="${esc(firm.logoUrl)}" alt="${esc(firm.name)}">
    <span class="brand-bar-name">${esc(firm.name)}</span>
    <span class="brand-bar-sep"></span>
    <span class="brand-bar-tag">Gap Analysis Report</span>
  </div>
  <div class="brand-bar-right">${esc(preparedFor)}</div>
</div>

<div class="ambient"></div>
<div class="scroll-progress" id="scrollProgress"></div>
`
}
