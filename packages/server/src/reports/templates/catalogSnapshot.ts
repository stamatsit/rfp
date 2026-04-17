import type { ProgramCategory, ProgramTag, ReportData } from "../types.js"
import { esc, toneColor } from "./utils.js"
import { icon } from "./icons.js"

/** Industry-agnostic "catalog" (programs for higher-ed, services for hospitals, products for retail). */
export function renderCatalogSnapshot(data: ReportData): string {
  if (!data.catalog) return ""
  const { catalog } = data
  const cards = catalog.categories.map(renderProgramCard).join("\n")
  const warning = catalog.warning
    ? `    <div class="callout warn reveal"><h3>${esc(catalog.warning.heading)}</h3><p style="margin-bottom:12px">${catalog.warning.body}</p><div class="tags">${catalog.warning.tags.map(renderTag).join("")}</div></div>`
    : ""

  return `
<!-- ════════════ CATALOG / PROGRAMS ════════════ -->
<section id="programs">
  <div class="container">
    <div class="reveal"><div class="section-label">${esc(catalog.sectionLabel)}</div><h2>${esc(catalog.heading)}</h2></div>
    <div class="prog-grid stagger">
${cards}
    </div>
${warning}
  </div>
</section>
`
}

function renderProgramCard(c: ProgramCategory): string {
  const color = toneColor(c.tone)
  const tags = c.tags.map(renderTag).join("")
  return `      <div class="prog-card reveal"><h3>${icon(c.icon)} ${esc(c.name)}</h3><div class="prog-big" style="color:${color}">${c.count}</div><p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:10px">${esc(c.body)}</p><div class="tags">${tags}</div></div>`
}

function renderTag(t: ProgramTag): string {
  const variant = t.variant && t.variant !== "default" ? ` ${t.variant}` : ""
  return `<span class="tag${variant}">${esc(t.label)}</span>`
}
