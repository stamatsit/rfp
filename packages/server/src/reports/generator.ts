/**
 * Report generator — end-to-end orchestrator.
 * Takes a URL + client metadata → produces a fully populated ReportData ready for rendering.
 *
 * Stages (with progress callbacks):
 *  1. scan       — run scannerService.scanUrl to get ScanReport
 *  2. fetch-text — re-fetch the page and extract plain text (~5000 chars) for LLM context
 *  3. classify   — LLM site classification
 *  4. vision     — (optional) LLM screenshot description
 *  5. narrative  — LLM generates all prose sections in a single structured-output call
 *  6. fact-check — LLM verifies numbers against scan data
 *  7. assemble   — merge deterministic skeleton + narrative into ReportData
 */
import * as cheerio from "cheerio"
import { scanUrl } from "../services/scannerService.js"
import type { ScanReport } from "../types/scanner.js"
import type {
  CategoryScore,
  ClientInfo,
  ConsultingFirm,
  ReportData,
  ScreenshotPair,
} from "./types.js"
import {
  aggregateSeverity,
  buildCategoryDetails,
  buildCategoryScores,
  overallScore,
  rankedPriorities,
} from "./mapper.js"
import {
  classifySite,
  describeScreenshot,
  generateNarrative,
  factCheckNarrative,
  applyCorrections,
  selectTopIssues,
  type NarrativeInput,
  type SiteClassification,
} from "./narrative.js"
import { gradeFromScore } from "./templates/utils.js"

export type GeneratorProgressStage =
  | "scan"
  | "fetch-text"
  | "classify"
  | "vision"
  | "narrative"
  | "fact-check"
  | "assemble"

export type GeneratorProgress = (stage: GeneratorProgressStage, status: "running" | "done" | "error", detail?: string) => void

export interface GenerateReportInput {
  url: string
  client: ClientInfo
  firm: ConsultingFirm
  /** Override the current date. Defaults to today. */
  date?: Date
  /** If provided, describe this screenshot URL and pass the description to the narrative LLM. */
  screenshots?: ScreenshotPair
  /** Optional peer URLs to reference in the competitive section. */
  competitorUrls?: string[]
  /** Turn off the LLM narrative step and fall back to deterministic prose (useful for dry-run). */
  skipNarrative?: boolean
  onProgress?: GeneratorProgress
}

/** Extract plain text from fetched HTML. Removes script/style/noscript blocks and collapses whitespace. */
function extractPageText(html: string): { text: string; title?: string; description?: string } {
  const $ = cheerio.load(html)
  $("script, style, noscript, svg").remove()
  const title = $("title").first().text().trim() || undefined
  const description = $('meta[name="description"]').attr("content") || undefined
  const main = $("main").length ? $("main").text() : $("body").text()
  const text = main.replace(/\s+/g, " ").trim().slice(0, 8000)
  return { text, title, description }
}

/** Deterministic fallback narrative — used when skipNarrative=true or LLM fails. */
function fallbackNarrative(input: {
  client: ClientInfo
  totalIssues: number
  critical: number
  high: number
  overall: number
  categoryScores: CategoryScore[]
}): Pick<
  ReportData,
  "hero" | "healthScore" | "executiveSummary" | "severity" | "opportunities" | "competitive" | "priorities" | "assistant"
> {
  const { client, totalIssues, critical, high, overall, categoryScores } = input
  const critPct = totalIssues > 0 ? Math.round(((critical + high) / totalIssues) * 100) : 0

  return {
    hero: {
      badge: `${totalIssues} issues across ${categoryScores.length} categories`,
      titleLine1: client.name,
      titleLine2: "Page",
      titleLine3: "Gap Analysis",
      subtitle: `An audit of ${client.auditedUrlDisplay ?? client.auditedUrl} covering accessibility, SEO, content, UX, privacy, and performance.`,
      subtitleHighlight: client.auditedUrlDisplay ?? client.auditedUrl,
      screenshot: "",
      floatTags: [
        { text: `${critical} critical`, tone: "critical" },
        { text: `${high} high-severity`, tone: "high" },
        { text: `${totalIssues} total`, tone: "medium" },
      ],
      stats: [
        { number: critical, label: "Critical", tone: "critical" },
        { number: high, label: "High", tone: "high" },
        { number: totalIssues, label: "Total", tone: "medium" },
        { number: categoryScores.length, label: "Categories", tone: "accent" },
      ],
    },
    healthScore: {
      score: overall,
      grade: gradeFromScore(overall),
      heading: `Page scores ${overall} out of 100`,
      subtitle: "Aggregated across all audit dimensions. A score below 40 indicates fundamental gaps requiring immediate attention.",
      body: `${critical} critical and ${high} high-severity findings across ${categoryScores.length} categories.`,
      subGrades: categoryScores.slice(0, 8).map((c) => ({ name: c.name, score: c.score, grade: gradeFromScore(c.score) })),
    },
    executiveSummary: {
      heading: `${critPct}% of issues are high-impact.`,
      subtitle: "The top-level findings that drive the overall score.",
      cards: categoryScores.slice(0, 6).map((c) => ({
        icon: c.icon,
        tone: c.tone,
        title: c.name,
        body: `${c.name} scores ${c.score}/100 with ${c.issueCount} findings. Review the category detail below for specifics.`,
      })),
    },
    severity: {
      heading: `${critPct}% of issues are Critical or High`,
      subtitle: "These represent industry standards the page is currently missing.",
      counts: { critical, high, medium: 0, low: 0 },
    },
    opportunities: {
      heading: `What ${client.name} stands to gain`,
      subtitle: "Each opportunity maps to a cluster of related findings.",
      items: [],
    },
    competitive: {
      heading: "Competitive landscape",
      subtitle: "Feature-by-feature comparison with peers.",
      subjectColumnLabel: client.shortName ?? client.name.split(" ")[0]!,
      features: [],
      warning: { heading: "Catching up matters", body: "Peer sites are adopting these features faster each cycle." },
    },
    priorities: {
      heading: "Top priorities, ranked by impact",
      subtitle: "Addressing the top items first would meaningfully improve the overall score.",
      items: [],
    },
    assistant: {
      greeting: `Hi! I can answer questions about this ${client.name} gap analysis. Try asking about specific categories, scores, priorities, or opportunities.`,
      introTitle: "This report has a brain",
      introBody: "Ask our <strong>Report Assistant</strong> anything about this gap analysis.",
      exampleChips: [
        { label: "What's the overall score?", query: "What's the overall score?" },
        { label: "Top priorities?", query: "What are the top priorities?" },
        { label: "Quick wins?", query: "What are the quick wins?" },
      ],
      responses: [],
      fallback: "I can answer questions about any of the audit categories, the overall score, priorities, or opportunities. What would you like to know?",
    },
  }
}

/** Main entrypoint — scan + narrative + assemble. */
export async function generateReport(input: GenerateReportInput): Promise<ReportData> {
  const progress = input.onProgress ?? (() => {})
  const date = input.date ?? new Date()

  // Stage 1: Scan
  progress("scan", "running")
  const scan: ScanReport = await scanUrl(input.url, {}, (step, status) => {
    if (status === "running") progress("scan", "running", step)
  })
  progress("scan", "done")

  // Stage 2: Fetch plain text for LLM context
  progress("fetch-text", "running")
  let pageText = ""
  let pageTitle: string | undefined
  let pageDescription: string | undefined
  try {
    const res = await fetch(input.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)" },
    })
    const html = await res.text()
    const extracted = extractPageText(html)
    pageText = extracted.text
    pageTitle = extracted.title
    pageDescription = extracted.description
  } catch (err) {
    console.warn("[Generator] text extraction failed:", err)
  }
  progress("fetch-text", "done")

  // Build deterministic skeleton pieces.
  const categoryScores = buildCategoryScores(scan)
  const categoryDetails = buildCategoryDetails(scan)
  const severity = aggregateSeverity(categoryDetails)
  const totalIssues = severity.critical + severity.high + severity.medium + severity.low
  const overall = overallScore(categoryScores)
  const priorities = rankedPriorities(scan, categoryDetails, 20)

  // Stage 3: Classify (skip if no OpenAI)
  let classification: SiteClassification | null = null
  if (!input.skipNarrative && process.env.OPENAI_API_KEY) {
    try {
      progress("classify", "running")
      classification = await classifySite({
        clientName: input.client.name,
        url: input.url,
        pageText,
        pageTitle,
      })
      progress("classify", "done")
    } catch (err) {
      console.warn("[Generator] classify failed:", err)
      progress("classify", "error")
    }
  }

  // Stage 4: Vision (optional)
  let visualDescription: string | undefined
  if (!input.skipNarrative && process.env.OPENAI_API_KEY && input.screenshots?.desktop) {
    try {
      progress("vision", "running")
      visualDescription = await describeScreenshot(input.screenshots.desktop)
      progress("vision", "done")
    } catch (err) {
      console.warn("[Generator] vision failed:", err)
      progress("vision", "error")
    }
  }

  // Stage 5: Narrative
  let narrative: Awaited<ReturnType<typeof generateNarrative>> | null = null
  if (!input.skipNarrative && classification && process.env.OPENAI_API_KEY) {
    try {
      progress("narrative", "running")
      const narrativeInput: NarrativeInput = {
        clientName: input.client.name,
        auditedUrl: input.url,
        pageText,
        pageTitle,
        pageDescription,
        classification,
        visualDescription,
        categoryScores,
        totalIssues,
        criticalCount: severity.critical,
        highCount: severity.high,
        topIssues: selectTopIssues(scan, 15),
        fewShotFromCoe: true,
        competitorUrls: input.competitorUrls,
      }
      narrative = await generateNarrative(narrativeInput)
      progress("narrative", "done")

      // Stage 6: Fact-check
      try {
        progress("fact-check", "running")
        const factCheck = await factCheckNarrative(narrative, narrativeInput)
        if (!factCheck.ok && factCheck.corrections.length > 0) {
          narrative = applyCorrections(narrative, factCheck.corrections)
        }
        progress("fact-check", "done")
      } catch (err) {
        console.warn("[Generator] fact-check failed:", err)
        progress("fact-check", "error")
      }
    } catch (err) {
      console.warn("[Generator] narrative failed, falling back to deterministic prose:", err)
      progress("narrative", "error")
    }
  }

  // Stage 7: Assemble final ReportData
  progress("assemble", "running")

  // Use narrative output when available, else fallback.
  const fallback = fallbackNarrative({
    client: input.client,
    totalIssues,
    critical: severity.critical,
    high: severity.high,
    overall,
    categoryScores,
  })

  const hero = narrative?.hero
    ? {
        ...narrative.hero,
        screenshot: input.screenshots?.desktop ?? "",
        stats: fallback.hero.stats,
      }
    : fallback.hero

  const healthScore = narrative?.healthScore
    ? {
        ...narrative.healthScore,
        score: overall,
        grade: gradeFromScore(overall),
        subGrades: fallback.healthScore.subGrades,
      }
    : fallback.healthScore

  const executiveSummary = narrative?.executiveSummary ?? fallback.executiveSummary
  const severitySection = {
    heading: narrative?.severity.heading ?? fallback.severity.heading,
    subtitle: narrative?.severity.subtitle ?? fallback.severity.subtitle,
    counts: severity,
  }

  const opportunities = narrative?.opportunities
    ? { ...narrative.opportunities }
    : fallback.opportunities

  const competitive = narrative?.competitive
    ? {
        heading: narrative.competitive.heading,
        subtitle: narrative.competitive.subtitle,
        subjectColumnLabel: fallback.competitive.subjectColumnLabel,
        features: narrative.competitive.features,
        warning: narrative.competitive.warning,
      }
    : fallback.competitive

  const prioritiesSection = {
    heading: narrative?.priorities.heading ?? fallback.priorities.heading,
    subtitle: narrative?.priorities.subtitle ?? fallback.priorities.subtitle,
    items: priorities,
  }

  const assistant = narrative?.assistant ?? fallback.assistant

  const dateDisplay = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

  const data: ReportData = {
    client: input.client,
    firm: input.firm,
    meta: {
      title: `${input.client.name} — Gap Analysis Report`,
      description: `Comprehensive gap analysis of ${input.client.name}${pageTitle ? ` — ${pageTitle}` : ""} covering accessibility, SEO, content, UX, privacy, performance, and competitive positioning.`,
      datePublished: date.toISOString().slice(0, 10),
      dateDisplay,
    },
    nav: [
      { href: "#health-score", label: "Score" },
      { href: "#exec", label: "Summary" },
      { href: "#severity", label: "Severity" },
      { href: "#cat-scores", label: "Categories" },
      { href: "#screenshots", label: "Page Now" },
      { href: "#opportunities", label: "Opportunities" },
      ...categoryDetails.slice(0, 5).map((c) => ({ href: `#cat-${c.id}`, label: c.name.split(" ")[0]! })),
      { href: "#competitive", label: "Competitive" },
      { href: "#priorities", label: "Priorities" },
    ],
    hero,
    healthScore,
    executiveSummary,
    severity: severitySection,
    categoryScores: {
      heading: "Performance by category",
      subtitle: "Each scored on a 100-point scale. Red means failing. Yellow means far below standard.",
      categories: categoryScores,
    },
    screenshots: input.screenshots
      ? {
          heading: "What the page looks like today",
          subtitle: visualDescription ?? "Captured during the audit.",
          images: input.screenshots,
        }
      : undefined,
    opportunities,
    categoryDetails: { categories: categoryDetails },
    competitive,
    priorities: prioritiesSection,
    assistant,
  }

  progress("assemble", "done")
  return data
}
