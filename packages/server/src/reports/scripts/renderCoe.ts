/**
 * Golden-render script: reads the Coe fixture, renders it through the template,
 * and writes the result to `coe-gap-analysis-generated.html` at the repo root so
 * it can be opened side-by-side with the hand-authored `coe-gap-analysis-report.html`.
 *
 * Run: `npx tsx packages/server/src/reports/scripts/renderCoe.ts`
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderReport } from "../renderer.js"
import { coeReportData } from "../fixtures/coe.js"

const OUT = resolve(process.cwd(), "coe-gap-analysis-generated.html")
const html = renderReport(coeReportData)
writeFileSync(OUT, html)
console.log(`Wrote ${html.length} chars to ${OUT}`)
