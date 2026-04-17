import type { ReportData } from "../types.js"
import { esc, toneBg } from "./utils.js"
import { icon } from "./icons.js"

/** Tabbed section with Schema.org / structured-data analysis and copy-paste code blocks. */
export function renderSchemaDeepDive(data: ReportData): string {
  if (!data.schemaDeepDive) return ""
  const sdd = data.schemaDeepDive

  const currentCards = sdd.currentState
    .map(
      (c) =>
        `        <div class="schema-card">
          <div class="schema-type">${esc(c.type)}</div>
          <h4>${esc(c.heading)}</h4>
          <p>${esc(c.body)}</p>
          <div class="schema-status ${c.present ? "present" : "missing"}"><span class="status-dot ${c.present ? "green" : "red"}"></span> ${c.present ? "Present" : "Not present"}</div>
        </div>`,
    )
    .join("\n")

  const neededCards = sdd.whatsNeeded
    .map(
      (n) =>
        `        <div class="schema-card">
          <div class="schema-type">${esc(n.label)}</div>
          <h4>${esc(n.heading)}</h4>
          <p>${n.body}</p>
          <div class="schema-status ${n.present ? "present" : "missing"}"><span class="status-dot ${n.present ? "green" : "red"}"></span> ${esc(n.note ?? (n.present ? "Recommended block" : "Also missing from page"))}</div>
        </div>`,
    )
    .join("\n")

  const codeTabs = sdd.codeBlocks
    .map(
      (b) => `
    <!-- Tab: ${esc(b.tabLabel)} -->
    <div class="tab-panel" id="tab-${esc(b.tabId)}">
      <p class="reveal" style="color:var(--text-secondary);font-size:.88rem;margin-bottom:16px;">${esc(b.introText)}</p>
      <div class="code-block reveal">${b.code}</div>
      <div class="impact-bar reveal">
        <div class="impact-icon" style="background:${toneBg(b.impact.tone)}">${icon(b.impact.icon)}</div>
        <p>${b.impact.body}</p>
      </div>
    </div>`,
    )
    .join("")

  const impactCards = sdd.impact
    .map(
      (i) =>
        `        <div class="schema-card">
          <div class="schema-type" style="${toneBg(i.tone)}">${esc(i.label)}</div>
          <h4>${esc(i.heading)}</h4>
          <p>${esc(i.body)}</p>
        </div>`,
    )
    .join("\n")

  const tabButtons = [
    { id: "current", label: "Current State", active: true },
    { id: "needed", label: "What's Needed", active: false },
    ...sdd.codeBlocks.map((b) => ({ id: b.tabId, label: b.tabLabel, active: false })),
    { id: "impact", label: "Impact", active: false },
  ]
    .map(
      (t) =>
        `      <button class="tab-btn${t.active ? " active" : ""}" role="tab" data-tab="${esc(t.id)}">${esc(t.label)}</button>`,
    )
    .join("\n")

  return `
<!-- SCHEMA DEEP DIVE -->
<section id="schema-deep-dive" class="schema-section">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Schema Markup Deep Dive</div>
      <h2>Structured data: what's missing and why it matters</h2>
      <p class="subtitle">Schema.org markup tells Google what your page is about in machine-readable format. Here's the gap and exactly what to add.</p>
    </div>

    <!-- Tabs -->
    <div class="tab-bar reveal" role="tablist">
${tabButtons}
    </div>

    <!-- Tab: Current State -->
    <div class="tab-panel active" id="tab-current">
      <div class="callout warn reveal">
        <h3>What's present today</h3>
        <p>A snapshot of structured data on the page. Cards flagged red represent missing entity types search engines expect for this page type.</p>
      </div>
      <div class="schema-grid reveal">
${currentCards}
      </div>
    </div>

    <!-- Tab: What's Needed -->
    <div class="tab-panel" id="tab-needed">
      <p class="reveal" style="color:var(--text-secondary);font-size:.9rem;line-height:1.7;margin-bottom:24px;">Recommended JSON-LD blocks. Each uses the <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">@id</code> pattern so Google links them as a connected graph.</p>
      <div class="schema-grid reveal">
${neededCards}
      </div>
    </div>
${codeTabs}

    <!-- Tab: Impact -->
    <div class="tab-panel" id="tab-impact">
      <div class="schema-grid reveal">
${impactCards}
      </div>
      <div class="callout reveal" style="margin-top:24px">
        <h3>${esc(sdd.implementationCallout.heading)}</h3>
        <p>${esc(sdd.implementationCallout.body)}</p>
      </div>
    </div>

  </div>
</section>
`
}
