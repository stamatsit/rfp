/**
 * LLM narrative generation. Takes a scan skeleton + page text + screenshots and produces
 * polished, context-aware prose for every narrative section of the report in a single
 * structured-output call. Uses few-shot examples from the Coe fixture so voice stays
 * consistent across clients.
 */
import OpenAI from "openai"
import type { ScanReport } from "../types/scanner.js"
import type {
  CategoryScore,
  CompetitiveFeature,
  ExecSummaryCard,
  HeroFloatTag,
  Opportunity,
  ReportAssistant,
} from "./types.js"
import { coeReportData } from "./fixtures/coe.js"

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured")
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export interface SiteClassification {
  industry: string // e.g., "higher-ed-liberal-arts"
  audience: string // e.g., "prospective undergraduate students and their families"
  pageType: string // e.g., "program listing", "service directory"
  competitiveSet: string // e.g., "comparable Iowa liberal arts colleges"
  businessGoal: string // e.g., "drive admissions inquiries"
}

export interface NarrativeInput {
  clientName: string
  auditedUrl: string
  pageText: string // first ~5000 chars of main page text content
  pageTitle?: string
  pageDescription?: string
  classification: SiteClassification
  /** LLM description of the visual screenshots, if available. */
  visualDescription?: string
  /** Category scores + top issues — feeds the prose with hard numbers. */
  categoryScores: CategoryScore[]
  totalIssues: number
  criticalCount: number
  highCount: number
  topIssues: Array<{ category: string; title: string; description: string }>
  competitorSummary?: string
  /** When set, include a few-shot example from this fixture for voice calibration. */
  fewShotFromCoe?: boolean
  /** Competitor URLs the caller wants to benchmark against (if any). */
  competitorUrls?: string[]
}

/**
 * The narrative LLM returns a JSON object matching this shape. It's later merged with the
 * deterministic ReportData skeleton before rendering.
 */
export interface NarrativeOutput {
  hero: {
    badge: string
    titleLine1: string
    titleLine2: string
    titleLine3: string
    subtitle: string
    subtitleHighlight: string
    floatTags: HeroFloatTag[]
  }
  healthScore: {
    heading: string
    subtitle: string
    body: string
  }
  executiveSummary: {
    heading: string
    subtitle: string
    cards: ExecSummaryCard[]
  }
  severity: {
    heading: string
    subtitle: string
  }
  opportunities: {
    heading: string
    subtitle: string
    items: Opportunity[]
  }
  competitive: {
    heading: string
    subtitle: string
    features: CompetitiveFeature[]
    warning: { heading: string; body: string }
  }
  priorities: {
    heading: string
    subtitle: string
  }
  assistant: ReportAssistant
}

/** Classify the site in a single cheap LLM call. */
export async function classifySite(input: { clientName: string; url: string; pageText: string; pageTitle?: string }): Promise<SiteClassification> {
  const prompt = `You're analyzing a web page to determine what kind of organization runs it and who visits it. Return ONLY JSON.

URL: ${input.url}
${input.pageTitle ? `Page title: ${input.pageTitle}` : ""}
Client name: ${input.clientName}

Page text excerpt (first 3000 chars):
${input.pageText.slice(0, 3000)}

Return JSON with these fields:
- industry: specific vertical (e.g. "higher-ed liberal arts college", "regional hospital", "B2B SaaS platform", "e-commerce retailer")
- audience: who visits this page (e.g. "prospective undergraduate students and parents evaluating majors")
- pageType: what this page is (e.g. "program listing index", "service directory", "product catalog", "landing page")
- competitiveSet: what peer set to benchmark against (e.g. "comparable Iowa liberal arts colleges")
- businessGoal: the page's primary conversion goal (e.g. "drive admissions inquiries", "schedule consultations", "trial signups")`

  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You classify websites precisely and concisely. Output only JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("No classification response")
  return JSON.parse(content) as SiteClassification
}

/** Describe the visual state of the page from a screenshot URL/data URL (used in narrative context). */
export async function describeScreenshot(imageUrl: string): Promise<string> {
  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You describe web page screenshots for an audit report. Focus on visual hierarchy, layout density, missing cards or imagery, typography, and anything that suggests the page is underdeveloped or dated. Be concrete and brief — 3-5 sentences, no fluff.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe what this page looks like in 3-5 concrete sentences. Focus on what's present, what's missing, and any obvious design weaknesses." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  })
  return res.choices[0]?.message?.content?.trim() ?? ""
}

/** The main narrative generation call. Single structured-output prompt produces all prose. */
export async function generateNarrative(input: NarrativeInput): Promise<NarrativeOutput> {
  const openai = getOpenAI()

  const categoriesSummary = input.categoryScores
    .map((c) => `- ${c.name}: ${c.score}/100 (${c.issueCount} issues)`)
    .join("\n")

  const topIssuesText = input.topIssues
    .slice(0, 15)
    .map((i, idx) => `${idx + 1}. [${i.category}] ${i.title}: ${i.description}`)
    .join("\n")

  // Few-shot Coe excerpt — voice calibration.
  const fewShot = input.fewShotFromCoe
    ? `\n\n<example voice_calibration>\nHere is an exemplar narrative for a different client (Coe College). Match its TONE, SPECIFICITY, and CADENCE — but write completely different content for the current client:\n\nHERO subtitle: "${coeReportData.hero.subtitle}"\n\nEXEC SUMMARY heading: "${coeReportData.executiveSummary.heading}"\nEXEC SUMMARY card example: {"title":"${coeReportData.executiveSummary.cards[0]!.title}","body":"${coeReportData.executiveSummary.cards[0]!.body}"}\n\nOPPORTUNITY example: {"impactLabel":"${coeReportData.opportunities.items[0]!.impactLabel}","title":"${coeReportData.opportunities.items[0]!.title}","body":"${coeReportData.opportunities.items[0]!.body}"}\n\nSEVERITY heading: "${coeReportData.severity.heading}"\nPRIORITIES heading: "${coeReportData.priorities.heading}"\n</example>`
    : ""

  const systemPrompt = `You are a senior consultant at ${input.competitorSummary ? "an elite" : "a top"} digital strategy firm writing a gap-analysis report for a paying client. Your voice is: confident, specific, quantified, no generic buzzwords, no hedging. You quote exact numbers from the scan data. You reference the specific client and their audience by name. Every sentence should be actionable or meaningful — never filler.

You NEVER hallucinate numbers. Every statistic in your prose must appear in the input data.
You NEVER use marketing clichés like "game-changer", "synergy", "leverage", "robust", "cutting-edge", "world-class".
You DO use specific, vivid observations about what's broken and why it matters for THIS audience.

Return ONLY a JSON object matching the schema specified.`

  const userPrompt = `Client: ${input.clientName}
URL: ${input.auditedUrl}
Industry: ${input.classification.industry}
Audience: ${input.classification.audience}
Page Type: ${input.classification.pageType}
Competitive Set: ${input.classification.competitiveSet}
Business Goal: ${input.classification.businessGoal}

Scan results:
Total issues: ${input.totalIssues} (${input.criticalCount} critical, ${input.highCount} high)

Category scores:
${categoriesSummary}

Top flagged issues (use these to inform your prose, quote specifics):
${topIssuesText}

${input.visualDescription ? `Visual state of the page (from screenshot):\n${input.visualDescription}` : ""}

${input.pageTitle ? `Page title: ${input.pageTitle}` : ""}
${input.pageDescription ? `Page description: ${input.pageDescription}` : ""}

Page content excerpt (first 4000 chars):
${input.pageText.slice(0, 4000)}
${fewShot}

Generate polished, context-aware narrative content. Return ONLY this JSON shape (populate every field):

{
  "hero": {
    "badge": "X issues across Y categories — short red pill text",
    "titleLine1": "Client Name",
    "titleLine2": "Gradient-colored middle line — the page's subject, 1-3 words",
    "titleLine3": "Gap Analysis",
    "subtitle": "One sentence introducing the audit. Reference the specific URL and audience.",
    "subtitleHighlight": "the exact URL substring to bold (must appear verbatim in subtitle)",
    "floatTags": [
      { "text": "short specific finding", "tone": "critical" },
      { "text": "another specific finding", "tone": "high" },
      { "text": "third finding", "tone": "medium" }
    ]
  },
  "healthScore": {
    "heading": "Page scores N out of 100 (use the actual weighted average)",
    "subtitle": "Explain the rubric and name the peer score range for this industry.",
    "body": "One sentence stating what the page DOES do well (if anything) and what it fails at."
  },
  "executiveSummary": {
    "heading": "A short declarative sentence summarizing the top-level verdict (like: 'The page works. Nothing else does.')",
    "subtitle": "One sentence framing why this page matters to this audience.",
    "cards": [
      { "icon": "search|file|eye|external|shield|trophy|zap|sparkle", "tone": "critical|high|medium", "title": "Short title", "body": "2-3 sentences. Quote specific numbers. Reference the audience." }
      // EXACTLY 6 cards — pick the 6 most impactful findings
    ]
  },
  "severity": {
    "heading": "N% of issues are Critical or High (use actual percentage)",
    "subtitle": "One sentence framing why these matter."
  },
  "opportunities": {
    "heading": "What [Client] stands to gain",
    "subtitle": "One sentence tying gaps to business outcome.",
    "items": [
      {
        "impactLabel": "short pill like 'High Impact' or 'Quick Win' or 'Risk Mitigation'",
        "tone": "low|accent|high|critical|medium",
        "title": "Short title for this opportunity",
        "body": "2-3 sentences on the business upside, specific to this audience.",
        "metrics": [
          { "value": "+30%", "label": "CTR lift" },
          { "value": "5", "label": "Quick wins" },
          { "value": "1-2d", "label": "Timeline" }
        ]
      }
      // EXACTLY 6 opportunities
    ]
  },
  "competitive": {
    "heading": "Short headline about peer gap",
    "subtitle": "One sentence.",
    "features": [
      { "feature": "specific feature name", "subject": false, "peers": "Most" }
      // 12-17 rows — infer realistic peer features for this industry
    ],
    "warning": { "heading": "", "body": "" }
  },
  "priorities": {
    "heading": "Top N priorities, ranked by impact",
    "subtitle": "One sentence framing which ones matter most."
  },
  "assistant": {
    "greeting": "Friendly 1-sentence intro from the report assistant.",
    "introTitle": "This report has a brain",
    "introBody": "One sentence intro to the AI Q&A. May wrap <strong>Report Assistant</strong> in the phrase.",
    "exampleChips": [
      { "label": "What's the overall score?", "query": "What's the overall score?" },
      { "label": "Top priorities?", "query": "What are the top priorities?" },
      { "label": "Quick wins?", "query": "What are the quick wins?" }
    ],
    "responses": [
      { "patterns": ["overall|total score|grade|score"], "answer": "Context-specific response quoting exact numbers. Use **bold** markers around key stats." }
      // 12-16 responses covering each category + priorities + opportunities + programs/specialty topics
    ],
    "fallback": "Catch-all response listing the categories the user can ask about."
  }
}`

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 6000,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("No narrative response")
  return JSON.parse(content) as NarrativeOutput
}

/** Fact-check pass: verify every number and percentage in the narrative appears in the scan data. */
export async function factCheckNarrative(narrative: NarrativeOutput, input: NarrativeInput): Promise<{ ok: boolean; corrections: Array<{ field: string; issue: string; suggestion?: string }> }> {
  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a precise fact-checker. Given narrative prose and source data, flag any number, percentage, or specific claim that cannot be verified from the source. Return JSON only.",
      },
      {
        role: "user",
        content: `Source scan data:
Total issues: ${input.totalIssues} (${input.criticalCount} critical, ${input.highCount} high)
Categories: ${input.categoryScores.map((c) => `${c.name}=${c.score}/${c.issueCount} issues`).join(", ")}

Narrative to fact-check:
${JSON.stringify(narrative, null, 2)}

Return JSON { "ok": boolean, "corrections": [{ "field": "path.to.field", "issue": "what's wrong", "suggestion": "replacement" }] }. "ok" is true only if no specific statistic or claim contradicts the source.`,
      },
    ],
    temperature: 0,
    max_tokens: 1500,
  })

  const content = res.choices[0]?.message?.content
  if (!content) return { ok: true, corrections: [] }
  try {
    return JSON.parse(content)
  } catch {
    return { ok: true, corrections: [] }
  }
}

/** Apply fact-check corrections back into the narrative (best effort). */
export function applyCorrections(narrative: NarrativeOutput, corrections: Array<{ field: string; suggestion?: string }>): NarrativeOutput {
  const out: NarrativeOutput = JSON.parse(JSON.stringify(narrative))
  for (const c of corrections) {
    if (!c.suggestion) continue
    const path = c.field.split(".")
    let ptr: any = out
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]!
      const match = seg.match(/^(.+?)\[(\d+)\]$/)
      if (match) {
        const key = match[1]!
        const idx = Number(match[2])
        ptr = ptr[key]?.[idx]
      } else {
        ptr = ptr[seg]
      }
      if (!ptr) break
    }
    if (ptr) {
      const last = path[path.length - 1]!
      ptr[last] = c.suggestion
    }
  }
  return out
}

// Re-export so callers can use the top scan issues easily.
export function selectTopIssues(scan: ScanReport, limit = 15): Array<{ category: string; title: string; description: string }> {
  return scan.issues
    .slice()
    .sort((a, b) => {
      const sevWeight = (s: typeof a.severity) => (s === "error" ? 3 : s === "warning" ? 2 : 1)
      const wcagBonus = (i: typeof a) => (i.wcagLevel === "A" ? 2 : i.wcagLevel === "AA" ? 1 : 0)
      return sevWeight(b.severity) - sevWeight(a.severity) + wcagBonus(b) - wcagBonus(a)
    })
    .slice(0, limit)
    .map((i) => ({ category: i.category, title: i.ruleId, description: i.message }))
}

export type { ReportData } from "./types.js"
