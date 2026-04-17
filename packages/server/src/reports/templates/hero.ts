import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

const FLOAT_TAG_CLASSES: Record<string, string> = {
  critical: "ft1",
  high: "ft2",
  medium: "ft3",
}

/** Hero: badge + title + subtitle + CTAs + screenshot with floating tags + 4 stat cards. */
export function renderHero(data: ReportData): string {
  const { hero, firm, meta } = data

  // Build subtitle with a <strong> for the highlighted URL.
  let subtitleHtml = esc(hero.subtitle)
  if (hero.subtitleHighlight) {
    const needle = esc(hero.subtitleHighlight)
    subtitleHtml = subtitleHtml.replace(
      needle,
      `<strong style="color:var(--text)">${needle}</strong>`,
    )
  }

  const floatTags = hero.floatTags
    .slice(0, 3)
    .map((t, i) => {
      const cls = FLOAT_TAG_CLASSES[t.tone] ?? `ft${i + 1}`
      return `        <div class="float-tag ${cls}">${esc(t.text)}</div>`
    })
    .join("\n")

  const statCards = hero.stats
    .map(
      (s) => `      <div class="stat-card sc-${
        s.tone === "accent" ? "accent" : s.tone === "critical" ? "critical" : s.tone === "high" ? "high" : "medium"
      } reveal"><div class="stat-number count-up" data-target="${s.number}">0</div><div class="stat-label">${esc(s.label)}</div></div>`,
    )
    .join("\n")

  return `
<!-- ════════════ HERO ════════════ -->
<section class="hero">
  <div class="hero-mesh"></div>
  <div class="container">
    <div class="hero-grid">
      <div style="position:relative;z-index:1;">
        <div class="hero-badge"><span class="pulse-dot"></span>${esc(hero.badge)}</div>
        <h1>${esc(hero.titleLine1)}<br><span class="gradient-text">${esc(hero.titleLine2)}</span><br>${esc(hero.titleLine3)}</h1>
        <p class="subtitle" style="margin-top:28px;">${subtitleHtml}</p>
        <div class="prepared-by">
          <img src="${esc(firm.logoUrl)}" alt="${esc(firm.name)}">
          <span>Prepared by <strong>${esc(firm.name)}</strong> &nbsp;&bull;&nbsp; ${esc(meta.dateDisplay)}</span>
        </div>
        <div class="hero-ctas">
          <a href="#priorities" class="hero-cta-primary">Jump to priorities <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></a>
          <a href="#health-score" class="hero-cta-secondary">View score</a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="deco-ring"></div><div class="deco-ring"></div><div class="deco-ring"></div>
        <img class="hero-screenshot" src="${esc(hero.screenshot)}" alt="${esc(data.client.name)} page desktop view" loading="eager">
${floatTags}
      </div>
    </div>
    <div class="stats-row stagger">
${statCards}
    </div>
  </div>
</section>
`
}
