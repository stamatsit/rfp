/**
 * Document AI Service
 *
 * Handles AI chat for document creation, review, and SVG generation.
 * Powers the Studio chat sidebar — generation mode, review mode, and diagram mode.
 */

import type { Response } from "express"
import OpenAI from "openai"
import { streamCompletion, truncateHistory, CHART_PROMPT } from "./utils/streamHelper.js"
import { getAllProposals } from "./proposalSyncService.js"
import { clientSuccessData } from "../data/clientSuccessData.js"
import { db } from "../db/index.js"
import { answerItems } from "../db/schema.js"
import { eq } from "drizzle-orm"

// Lazy-initialized OpenAI client
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export interface ReviewAnnotation {
  id: string
  quote: string
  comment: string
  severity: "suggestion" | "warning" | "issue"
  suggestedFix?: string
}

function parseReviewAnnotations(response: string): { cleanResponse: string; annotations: ReviewAnnotation[] } {
  const match = response.match(/REVIEW_ANNOTATIONS:\s*(\[[\s\S]*?\])\s*$/m)
  if (match?.[1]) {
    try {
      const annotations = JSON.parse(match[1]) as ReviewAnnotation[]
      const cleanResponse = response.replace(/REVIEW_ANNOTATIONS:\s*\[[\s\S]*?\]\s*$/m, "").trim()
      return { cleanResponse, annotations }
    } catch {
      // Malformed — ignore
    }
  }
  return { cleanResponse: response, annotations: [] }
}

function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const match = response.match(/FOLLOW_UP_PROMPTS:\s*\[([\s\S]*?)\]\s*$/m)
  if (match?.[1]) {
    try {
      const prompts = JSON.parse(`[${match[1]}]`) as string[]
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[[\s\S]*?\]\s*$/m, "").trim()
      return { cleanResponse, prompts }
    } catch {
      // Malformed — ignore
    }
  }
  return { cleanResponse: response, prompts: [] }
}

// ─── RFP Detection ───

const RFP_SIGNAL_KEYWORDS = [
  "request for proposal", "request for qualifications", "rfp", "rfq",
  "scope of work", "scope of services", "statement of work",
  "submission deadline", "proposal deadline", "due date",
  "evaluation criteria", "selection criteria", "scoring criteria",
  "mandatory requirements", "minimum qualifications",
  "contract term", "contract period", "award",
  "respondent", "proposer", "offeror", "vendor",
  "pricing proposal", "cost proposal", "fee schedule",
  "addendum", "amendment", "questions and answers",
  "point of contact", "issuing office",
]

export function detectRFPSignals(text: string): { isRFP: boolean; signals: string[] } {
  if (!text) return { isRFP: false, signals: [] }
  const lower = text.toLowerCase()
  const found = RFP_SIGNAL_KEYWORDS.filter((kw) => lower.includes(kw))
  return { isRFP: found.length >= 3, signals: found }
}

function buildRFPContext(uploadedText: string): string {
  const sections: string[] = []
  sections.push("The user has uploaded an RFP/RFQ document. Key content:")

  // Extract up to 4000 chars of the most relevant content
  const text = uploadedText.slice(0, 8000)

  // Try to find key sections
  const sectionPatterns = [
    { label: "SCOPE", pattern: /(?:scope of (?:work|services)|project scope)[\s\S]{0,2000}/i },
    { label: "REQUIREMENTS", pattern: /(?:requirements|qualifications|mandatory)[\s\S]{0,2000}/i },
    { label: "EVALUATION", pattern: /(?:evaluation|scoring|selection) criteria[\s\S]{0,1500}/i },
    { label: "TIMELINE", pattern: /(?:timeline|schedule|deadline|due date)[\s\S]{0,1000}/i },
    { label: "BUDGET", pattern: /(?:budget|pricing|cost|fee|compensation)[\s\S]{0,1000}/i },
  ]

  for (const { label, pattern } of sectionPatterns) {
    const match = text.match(pattern)
    if (match) {
      sections.push(`[${label}]: ${match[0].slice(0, 1500).trim()}`)
    }
  }

  // If no sections matched, just include a truncated version
  if (sections.length === 1) {
    sections.push(text.slice(0, 4000))
  }

  return sections.join("\n\n")
}

// SVG keywords that trigger diagram mode
const SVG_KEYWORDS = ["diagram", "draw", "infographic", "timeline", "flowchart", "org chart", "illustration", "visual", "chart layout", "process flow"]

function detectSVGRequest(query: string): boolean {
  const lower = query.toLowerCase()
  return SVG_KEYWORDS.some((kw) => lower.includes(kw))
}

const DOCUMENT_SYSTEM_PROMPT = `You are an AI writing assistant for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing.

You help create professional documents: proposals, RFP responses, case studies, executive summaries, strategy reports, and marketing copy.

You have access to Stamats' complete data:
- Proposal history with win/loss records and analytics
- Client success stories, testimonials, and awards
- Q&A library with approved answers on all service areas

INSTRUCTIONS:
1. When asked to write content, produce polished, professional markdown.
2. Use real Stamats data (client names, statistics, testimonials) when relevant.
3. When your response covers topics with approved Q&A answers, cite and incorporate them naturally.
4. Format with clear headings (##), bullet points, bold key terms.
5. Keep conversational responses brief. Save length for actual document content.
6. When asked for diagrams, timelines, or visual elements, generate SVG code.

{CHART_PROMPT}

After each response, include 3 contextual follow-up suggestions:
FOLLOW_UP_PROMPTS: ["suggestion 1", "suggestion 2", "suggestion 3"]`

const REVIEW_SYSTEM_PROMPT = `You are a senior editor and marketing strategist reviewing copy for Stamats.

The user has provided existing content for your review. Analyze it critically:

1. **Clarity & Impact**: Is the message clear? Does it grab attention?
2. **Accuracy**: Cross-reference claims against our actual data. Flag unsupported claims.
3. **Completeness**: Are we missing proof points we actually have? (Check case studies, testimonials, awards)
4. **Tone**: Professional but not stuffy? Confident but not arrogant?
5. **Structure**: Logical flow? Smooth transitions?
6. **Specificity**: Replace vague claims with specific data from our records.

For each issue, provide:
- **Issue**: What's wrong
- **Impact**: Why it matters
- **Fix**: Specific suggested replacement text

Be constructive but honest. This is internal review.

{CHART_PROMPT}

After your review, include inline annotations that reference EXACT text from the document. Each annotation should quote a specific passage verbatim, explain the issue, assign a severity, and optionally suggest replacement text.

REVIEW_ANNOTATIONS: [{"id":"ann-1","quote":"exact text from document","comment":"what's wrong and why","severity":"suggestion","suggestedFix":"replacement text"},{"id":"ann-2","quote":"another exact quote","comment":"explanation","severity":"warning"}]

Severity levels: "suggestion" (style/improvement), "warning" (potential issue), "issue" (definite problem).
Include 3-8 annotations focusing on the most impactful issues. The "quote" must be a VERBATIM substring from the user's document.
The "suggestedFix" field is optional — include it only when you have specific replacement text.

FOLLOW_UP_PROMPTS: ["Rewrite the opening paragraph", "Add supporting data throughout", "Strengthen the call to action"]`

const SVG_PROMPT = `When the user asks for a diagram, timeline, infographic, flowchart, org chart, or any visual element, generate clean SVG code.

SVG GUIDELINES:
- Use viewBox for responsive sizing (e.g., viewBox="0 0 800 600")
- Use Stamats brand colors: #10B981 (emerald), #06B6D4 (cyan), #3B82F6 (blue), #8B5CF6 (violet), #F59E0B (amber), #1E293B (dark text), #64748B (light text)
- Clean, professional style — no gradients unless specifically aesthetic
- Include text labels with font-family="Inter, system-ui, sans-serif"
- Add a title comment: <!-- title: My Diagram Title -->
- Keep SVGs under 5KB when possible
- Use rounded rectangles (rx="8") for modern look

Wrap the SVG in this marker at the end of your response:
SVG_DATA: <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">...</svg>`

async function buildDataContext(): Promise<string> {
  const parts: string[] = []

  // Proposals summary
  const allProposals = await getAllProposals().catch(() => [])
  if (allProposals.length > 0) {
    const won = allProposals.filter((p) => p.won === "Yes").length
    const lost = allProposals.filter((p) => p.won === "No").length
    const pending = allProposals.filter((p) => p.won === "Pending").length
    const winRate = won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : "N/A"
    parts.push(`PROPOSAL DATA: ${allProposals.length} total proposals. ${won} won, ${lost} lost, ${pending} pending. Win rate: ${winRate}%.`)

    // Recent wins for case study references
    const recentWins = allProposals.filter((p) => p.won === "Yes").slice(0, 10)
    if (recentWins.length > 0) {
      parts.push("Recent wins: " + recentWins.map((p) => `${p.client} (${p.category})`).join(", "))
    }
  }

  // Client success highlights
  parts.push(`\nCLIENT SUCCESS: ${clientSuccessData.caseStudies.length} case studies, ${clientSuccessData.topLineResults.length} results, ${clientSuccessData.testimonials.length} testimonials, ${clientSuccessData.awards.length} awards.`)

  // Top results
  const topResults = clientSuccessData.topLineResults.slice(0, 8)
  parts.push("Key results: " + topResults.map((r) => `${r.client}: ${r.result}`).join(" | "))

  // Top testimonials
  const topTestimonials = clientSuccessData.testimonials.slice(0, 5)
  parts.push("Testimonials available from: " + topTestimonials.map((t) => `${t.name}, ${t.organization}`).join(" | "))

  // Q&A Library answers (approved only)
  if (db) {
    try {
      const answers = await db.select().from(answerItems).where(eq(answerItems.status, "Approved"))
      if (answers.length > 0) {
        parts.push(`\nQ&A LIBRARY: ${answers.length} approved answers across topics.`)
        // Include a sampling of answers for context
        const sampleAnswers = answers.slice(0, 30)
        for (const a of sampleAnswers) {
          parts.push(`Q: ${a.question}\nA: ${a.answer.slice(0, 300)}${a.answer.length > 300 ? "..." : ""}`)
        }
      }
    } catch {
      // DB unavailable — skip Q&A
    }
  }

  return parts.join("\n")
}

export interface DocumentChatOptions {
  documentContent?: string
  uploadedFileText?: string
  reviewMode?: boolean
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
}

export interface DocumentChatResponse {
  response: string
  followUpPrompts: string[]
  chartData?: Record<string, unknown>
  svgData?: { svg: string; title: string } | null
  refused: boolean
  refusalReason?: string
}

export async function streamDocumentChat(
  query: string,
  res: Response,
  options?: DocumentChatOptions
): Promise<void> {
  const openai = getOpenAI()
  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "OpenAI API key not configured" })}\n\n`)
    res.end()
    return
  }

  const dataContext = await buildDataContext()
  const isSVGRequest = detectSVGRequest(query)

  // Check for RFP in uploaded file
  const rfpDetection = options?.uploadedFileText
    ? detectRFPSignals(options.uploadedFileText)
    : { isRFP: false, signals: [] }

  // Choose system prompt based on mode
  let systemPrompt: string
  if (options?.reviewMode) {
    systemPrompt = REVIEW_SYSTEM_PROMPT.replace("{CHART_PROMPT}", CHART_PROMPT)
    if (rfpDetection.isRFP && options?.uploadedFileText) {
      systemPrompt += `\n\nIMPORTANT — RFP CONTEXT: The user has uploaded an RFP. Evaluate the document against these RFP requirements. For each requirement, note whether it is well-addressed, partially addressed, or missing from the proposal.\n\n${buildRFPContext(options.uploadedFileText)}`
    }
  } else {
    systemPrompt = DOCUMENT_SYSTEM_PROMPT.replace("{CHART_PROMPT}", CHART_PROMPT)
    if (rfpDetection.isRFP && options?.uploadedFileText) {
      systemPrompt += `\n\nIMPORTANT — RFP CONTEXT: The user has uploaded an RFP. When generating content, reference specific RFP requirements. Flag any requirements the current document doesn't address.\n\n${buildRFPContext(options.uploadedFileText)}`
    }
  }

  // Append SVG instructions if diagram request detected
  if (isSVGRequest) {
    systemPrompt += "\n\n" + SVG_PROMPT
  }

  // Add data context
  systemPrompt += `\n\n--- STAMATS DATA CONTEXT ---\n${dataContext}`

  // Add current document content as context if provided
  if (options?.documentContent) {
    systemPrompt += `\n\n--- USER'S CURRENT DOCUMENT ---\n${options.documentContent.slice(0, 5000)}\n---`
  }

  // Add non-RFP uploaded file content as plain context
  if (options?.uploadedFileText && !rfpDetection.isRFP) {
    systemPrompt += `\n\n--- UPLOADED FILE CONTENT ---\n${options.uploadedFileText.slice(0, 5000)}\n---`
  }

  // Build message history
  const historyMessages = options?.conversationHistory
    ? truncateHistory(options.conversationHistory)
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: query },
    ],
    temperature: 0.4,
    maxTokens: 3000,
    metadata: {
      mode: options?.reviewMode ? "review" : "editor",
      svgRequested: isSVGRequest,
      rfpDetected: rfpDetection.isRFP,
    },
    parseFollowUpPrompts,
    parseReviewAnnotations: options?.reviewMode ? parseReviewAnnotations : undefined,
    res,
  })
}

export async function queryDocumentChat(
  query: string,
  options?: Omit<DocumentChatOptions, "conversationHistory">
): Promise<DocumentChatResponse> {
  const openai = getOpenAI()
  if (!openai) {
    return { response: "OpenAI API key not configured.", followUpPrompts: [], refused: true, refusalReason: "No API key" }
  }

  const dataContext = await buildDataContext()
  const isSVGRequest = detectSVGRequest(query)

  const rfpDetection = options?.uploadedFileText
    ? detectRFPSignals(options.uploadedFileText)
    : { isRFP: false, signals: [] }

  let systemPrompt: string
  if (options?.reviewMode) {
    systemPrompt = REVIEW_SYSTEM_PROMPT.replace("{CHART_PROMPT}", CHART_PROMPT)
    if (rfpDetection.isRFP && options?.uploadedFileText) {
      systemPrompt += `\n\nIMPORTANT — RFP CONTEXT: The user has uploaded an RFP. Evaluate the document against these RFP requirements. For each requirement, note whether it is well-addressed, partially addressed, or missing from the proposal.\n\n${buildRFPContext(options.uploadedFileText)}`
    }
  } else {
    systemPrompt = DOCUMENT_SYSTEM_PROMPT.replace("{CHART_PROMPT}", CHART_PROMPT)
    if (rfpDetection.isRFP && options?.uploadedFileText) {
      systemPrompt += `\n\nIMPORTANT — RFP CONTEXT: The user has uploaded an RFP. When generating content, reference specific RFP requirements. Flag any requirements the current document doesn't address.\n\n${buildRFPContext(options.uploadedFileText)}`
    }
  }

  if (isSVGRequest) {
    systemPrompt += "\n\n" + SVG_PROMPT
  }

  systemPrompt += `\n\n--- STAMATS DATA CONTEXT ---\n${dataContext}`

  if (options?.documentContent) {
    systemPrompt += `\n\n--- USER'S CURRENT DOCUMENT ---\n${options.documentContent.slice(0, 5000)}\n---`
  }

  if (options?.uploadedFileText && !rfpDetection.isRFP) {
    systemPrompt += `\n\n--- UPLOADED FILE CONTENT ---\n${options.uploadedFileText.slice(0, 5000)}\n---`
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    })

    const raw = completion.choices[0]?.message?.content || ""
    const { cleanResponse, prompts } = parseFollowUpPrompts(raw)

    return {
      response: cleanResponse,
      followUpPrompts: prompts,
      refused: false,
    }
  } catch (error) {
    console.error("Document chat query error:", error)
    return {
      response: "An error occurred while generating the response.",
      followUpPrompts: [],
      refused: true,
      refusalReason: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ─── RFP Compliance Checklist ───

export interface ChecklistItem {
  id: string
  category: string
  requirement: string
  priority: "high" | "medium" | "low"
}

export interface ComplianceResult {
  id: string
  status: "met" | "partial" | "missing"
  note: string
}

export async function generateRFPChecklist(rfpText: string): Promise<{ items: ChecklistItem[] }> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OpenAI API key not configured")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an RFP analyst. Extract all requirements, qualifications, and evaluation criteria from the given RFP document.

Return a JSON object with this exact structure:
{
  "items": [
    { "id": "req-1", "category": "Technical", "requirement": "Describe the requirement", "priority": "high" }
  ]
}

Categories should be descriptive (e.g., "Technical Requirements", "Qualifications", "Submission Format", "Timeline", "Pricing", "Experience", "Staffing").
Priority: "high" for mandatory/must-have, "medium" for evaluation criteria, "low" for nice-to-have.
Extract 10-30 requirements. Be specific — each requirement should be verifiable.
Return ONLY valid JSON, no markdown fencing.`,
      },
      {
        role: "user",
        content: rfpText.slice(0, 12000),
      },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  })

  const raw = completion.choices[0]?.message?.content || "{}"
  const parsed = JSON.parse(raw) as { items: ChecklistItem[] }
  return { items: parsed.items || [] }
}

export async function checkRFPCompliance(
  documentContent: string,
  items: ChecklistItem[]
): Promise<{ results: ComplianceResult[] }> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OpenAI API key not configured")

  const requirementsList = items.map((item) => `${item.id}: ${item.requirement}`).join("\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an RFP compliance reviewer. Compare the proposal document against the RFP requirements listed below.

For each requirement, determine:
- "met": The proposal clearly addresses this requirement with specific content
- "partial": The proposal touches on this but lacks detail or specificity
- "missing": The proposal does not address this requirement at all

Return a JSON object:
{
  "results": [
    { "id": "req-1", "status": "met", "note": "Addressed in section X with specific details about..." }
  ]
}

Be honest and specific in your notes. Reference the actual proposal content.
Return ONLY valid JSON, no markdown fencing.

REQUIREMENTS:
${requirementsList}`,
      },
      {
        role: "user",
        content: `PROPOSAL DOCUMENT:\n${documentContent.slice(0, 10000)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  })

  const raw = completion.choices[0]?.message?.content || "{}"
  const parsed = JSON.parse(raw) as { results: ComplianceResult[] }
  return { results: parsed.results || [] }
}
