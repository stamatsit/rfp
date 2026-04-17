import type { ReportData } from "../types.js"
import { esc } from "./utils.js"

/** Floating report-assistant chat panel + FAB. */
export function renderChatPanel(data: ReportData): string {
  return `
<!-- ════════════ CHATBOT ════════════ -->
<div class="chat-fab" id="chatFab" title="Ask about this report">
  <svg width="22" height="22" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
</div>
<div class="chat-panel" id="chatPanel">
  <div class="chat-header">
    <div class="chat-header-left">
      <img src="${esc(data.firm.logoUrl)}" alt="${esc(data.firm.name)}" style="width:22px;height:22px;border-radius:5px">
      <span>Report Assistant</span>
    </div>
    <button class="chat-close" id="chatClose">&times;</button>
  </div>
  <div class="chat-messages" id="chatMessages">
    <div class="chat-msg bot">${esc(data.assistant.greeting)}</div>
  </div>
  <form class="chat-input-row" id="chatForm">
    <input class="chat-input" id="chatInput" type="text" placeholder="Ask about the report..." autocomplete="off">
    <button class="chat-send" type="submit"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg></button>
  </form>
</div>
`
}
