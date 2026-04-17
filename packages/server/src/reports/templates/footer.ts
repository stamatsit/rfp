import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

export function renderFooter(data: ReportData): string {
  const { firm, client, meta } = data
  const displayUrl = client.auditedUrlDisplay ?? client.auditedUrl.replace(/^https?:\/\//, "")
  const confidentiality = data.footer?.confidentiality ?? "Confidential — internal review only"

  return `
<!-- FOOTER -->
<footer class="report-footer">
  <div class="container">
    <img class="footer-logo" src="${esc(firm.logoUrl)}" alt="${esc(firm.name)}">
    <div class="brand">${esc(client.name)} &mdash; Gap Analysis Report</div>
    <p>Source: <a href="${esc(client.auditedUrl)}" target="_blank" rel="noopener">${esc(displayUrl)}</a></p>
    <div class="prepared">Prepared by <strong>${esc(firm.name)}</strong> &nbsp;&bull;&nbsp; ${esc(meta.dateDisplay)}</div>
    <a href="#" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;" style="display:inline-flex;align-items:center;gap:6px;margin-top:20px;font-size:.78rem;font-weight:500;color:var(--text-muted);transition:color .2s">Back to top <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></a>
    <div class="conf">${esc(confidentiality)}</div>
  </div>
</footer>
`
}
