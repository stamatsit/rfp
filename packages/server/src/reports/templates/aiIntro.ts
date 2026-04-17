import type { ReportData } from "../types.js"
import { attr, esc } from "./utils.js"

/** Animated AI intro popup that appears ~8s after page load. */
export function renderAiIntro(data: ReportData): string {
  const chips = data.assistant.exampleChips
    .map((c) => `      <button class="ai-intro-chip" data-q="${attr(c.query)}">${esc(c.label)}</button>`)
    .join("\n")

  // Accept a single <strong>…</strong> inside intro body if provided — caller pre-marks it.
  const body = data.assistant.introBody
  return `
<!-- ════════════ AI INTRO POPUP ════════════ -->
<div class="ai-intro-overlay" id="aiIntro">
  <div class="ai-intro-card">
    <div class="ai-intro-glow"></div>
    <div class="ai-intro-sparkle s1"></div>
    <div class="ai-intro-sparkle s2"></div>
    <div class="ai-intro-sparkle s3"></div>
    <div class="ai-intro-icon-wrap">
      <div class="ai-intro-icon">
        <svg width="28" height="28" fill="none" stroke="#fff" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke-width="2.5" stroke-linecap="round"/></svg>
      </div>
      <div class="ai-intro-pulse-ring"></div>
      <div class="ai-intro-pulse-ring r2"></div>
    </div>
    <div class="ai-intro-badge">AI-Powered</div>
    <h3 class="ai-intro-title">${esc(data.assistant.introTitle)}</h3>
    <p class="ai-intro-desc">${body}</p>
    <div class="ai-intro-examples">
${chips}
    </div>
    <button class="ai-intro-cta" id="aiIntroCta">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Try it now
    </button>
    <button class="ai-intro-dismiss" id="aiIntroDismiss">Not now</button>
  </div>
</div>
`
}
