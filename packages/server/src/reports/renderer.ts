/**
 * Top-level report renderer. Takes a ReportData payload → returns complete HTML string.
 * The output is self-contained (no external CSS/JS except images referenced by src).
 */
import type { ReportData } from "./types.js"
import { renderHead } from "./templates/head.js"
import { renderBrandBar } from "./templates/brandBar.js"
import { renderStickyNav } from "./templates/stickyNav.js"
import { renderHero } from "./templates/hero.js"
import { renderHealthScore } from "./templates/healthScore.js"
import { renderExecutiveSummary } from "./templates/executiveSummary.js"
import { renderSeverityBreakdown } from "./templates/severityBreakdown.js"
import { renderCategoryScores } from "./templates/categoryScores.js"
import { renderScreenshots } from "./templates/screenshots.js"
import { renderCatalogSnapshot } from "./templates/catalogSnapshot.js"
import { renderOpportunities } from "./templates/opportunities.js"
import { renderCategoryDetails } from "./templates/categoryDetails.js"
import { renderSchemaDeepDive } from "./templates/schemaDeepDive.js"
import { renderCompetitive } from "./templates/competitive.js"
import { renderPriorities } from "./templates/priorities.js"
import { renderAiIntro } from "./templates/aiIntro.js"
import { renderChatPanel } from "./templates/chatPanel.js"
import { renderFooter } from "./templates/footer.js"
import { renderRuntimeScript } from "./templates/assistantScript.js"

export function renderReport(data: ReportData): string {
  const lang = "en"
  return `<!DOCTYPE html>
<html lang="${lang}">
${renderHead(data)}
<body>
${renderBrandBar(data)}
${renderStickyNav(data)}
${renderHero(data)}
${renderHealthScore(data)}
${renderExecutiveSummary(data)}
${renderSeverityBreakdown(data)}
${renderCategoryScores(data)}
${renderScreenshots(data)}
${renderCatalogSnapshot(data)}
${renderOpportunities(data)}
${renderCategoryDetails(data)}
${renderSchemaDeepDive(data)}
${renderCompetitive(data)}
${renderPriorities(data)}
${renderAiIntro(data)}
${renderChatPanel(data)}
${renderFooter(data)}
${renderRuntimeScript(data.assistant)}
</body>
</html>`
}

export type { ReportData } from "./types.js"
