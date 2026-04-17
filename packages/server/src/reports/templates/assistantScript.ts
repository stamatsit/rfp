import type { ReportAssistant } from "../types.js"
import { safeJson } from "./utils.js"
import { SCRIPT_PREFIX, SCRIPT_SUFFIX } from "./scripts.static.js"

/**
 * Compose the runtime <script> block:
 *   [extracted prefix: observers, nav, tabs, ai-intro wiring]
 *   const reportData = {…}        ← injected from ReportAssistant
 *   function botReply(q) {…}      ← generated from ReportAssistant.responses
 *   [extracted suffix: chat form submit handler]
 *
 * The suffix references `reportData` and `botReply` — both provided by our injection.
 */
export function renderRuntimeScript(assistant: ReportAssistant): string {
  const responsesJson = safeJson(
    assistant.responses.map((r) => ({
      patterns: r.patterns,
      answer: r.answer,
    })),
  )
  const fallbackJson = safeJson(assistant.fallback)

  return `<script>
${SCRIPT_PREFIX}

const reportData = ${safeJson({ greeting: assistant.greeting })};
const botResponses = ${responsesJson};
const botFallback = ${fallbackJson};
function botReply(q){
  const ql = q.toLowerCase();
  for (const r of botResponses) {
    for (const p of r.patterns) {
      if (new RegExp(p, "i").test(ql)) return r.answer;
    }
  }
  return botFallback;
}

${SCRIPT_SUFFIX}
</script>`
}
