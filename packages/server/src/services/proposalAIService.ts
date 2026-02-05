/**
 * Proposal AI Service
 *
 * COMPLETELY ISOLATED from the Q&A library AI (aiService.ts).
 * This service handles AI-powered analytics on proposal data ONLY.
 * It never touches or references the answer_items or photo_assets tables.
 */

import OpenAI from "openai"
import { getAllProposals } from "./proposalSyncService.js"
import type { Proposal } from "../db/index.js"

// Lazy-initialized OpenAI client (pattern shared with aiService.ts)
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export interface ProposalInsightResult {
  response: string
  dataUsed: {
    totalProposals: number
    dateRange: { from: Date | null; to: Date | null }
    overallWinRate: number
    wonCount: number
    lostCount: number
    pendingCount: number
    byCategory: { [key: string]: number }  // Proposals per category
  }
  followUpPrompts: string[]
  refused: boolean
  refusalReason?: string
}

interface WinRateByDimension {
  [key: string]: { won: number; total: number; rate: number }
}

/**
 * Calculate win rates by various dimensions
 */
function calculateWinRates(proposals: Proposal[]): {
  overall: number
  wonCount: number
  lostCount: number
  pendingCount: number
  bySchoolType: WinRateByDimension
  byAffiliation: WinRateByDimension
  byService: WinRateByDimension
  byCE: WinRateByDimension
  byYear: WinRateByDimension
  byCategory: WinRateByDimension
} {
  // Filter to only decided proposals (not pending)
  const decided = proposals.filter((p) => p.won === "Yes" || p.won === "No")
  const wonCount = proposals.filter((p) => p.won === "Yes").length
  const lostCount = proposals.filter((p) => p.won === "No" || p.won === "Cancelled").length
  const pendingCount = proposals.filter((p) => p.won === "Pending" || !p.won).length

  const overall = decided.length > 0 ? wonCount / decided.length : 0

  const bySchoolType: WinRateByDimension = {}
  const byAffiliation: WinRateByDimension = {}
  const byService: WinRateByDimension = {}
  const byCE: WinRateByDimension = {}
  const byYear: WinRateByDimension = {}
  const byCategory: WinRateByDimension = {}

  for (const proposal of decided) {
    const isWon = proposal.won === "Yes"

    // By school type
    if (proposal.schoolType) {
      const key = proposal.schoolType
      if (!bySchoolType[key]) bySchoolType[key] = { won: 0, total: 0, rate: 0 }
      bySchoolType[key].total++
      if (isWon) bySchoolType[key].won++
    }

    // By affiliation
    if (proposal.affiliation) {
      const key = proposal.affiliation
      if (!byAffiliation[key]) byAffiliation[key] = { won: 0, total: 0, rate: 0 }
      byAffiliation[key].total++
      if (isWon) byAffiliation[key].won++
    }

    // By service
    const services = proposal.servicesOffered || []
    for (const service of services) {
      if (!byService[service]) byService[service] = { won: 0, total: 0, rate: 0 }
      byService[service].total++
      if (isWon) byService[service].won++
    }

    // By CE
    if (proposal.ce) {
      const key = proposal.ce
      if (!byCE[key]) byCE[key] = { won: 0, total: 0, rate: 0 }
      byCE[key].total++
      if (isWon) byCE[key].won++
    }

    // By year
    if (proposal.date) {
      const year = new Date(proposal.date).getFullYear().toString()
      if (!byYear[year]) byYear[year] = { won: 0, total: 0, rate: 0 }
      byYear[year].total++
      if (isWon) byYear[year].won++
    }

    // By category (sheet type)
    if (proposal.category) {
      const key = proposal.category
      if (!byCategory[key]) byCategory[key] = { won: 0, total: 0, rate: 0 }
      byCategory[key].total++
      if (isWon) byCategory[key].won++
    }
  }

  // Calculate rates
  const calculateRates = (dimension: WinRateByDimension) => {
    for (const key of Object.keys(dimension)) {
      dimension[key].rate = dimension[key].total > 0 ? dimension[key].won / dimension[key].total : 0
    }
  }

  calculateRates(bySchoolType)
  calculateRates(byAffiliation)
  calculateRates(byService)
  calculateRates(byCE)
  calculateRates(byYear)
  calculateRates(byCategory)

  return { overall, wonCount, lostCount, pendingCount, bySchoolType, byAffiliation, byService, byCE, byYear, byCategory }
}

/**
 * Calculate service bundle correlations
 */
function calculateServiceBundles(proposals: Proposal[]): Array<{
  services: string[]
  count: number
  winRate: number
}> {
  const bundleStats = new Map<string, { won: number; total: number }>()
  const decided = proposals.filter((p) => p.won === "Yes" || p.won === "No")

  for (const proposal of decided) {
    const services = proposal.servicesOffered || []
    if (services.length < 2) continue

    const isWon = proposal.won === "Yes"

    // Generate all pairs of services
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const pair = [services[i], services[j]].sort().join(" + ")
        if (!bundleStats.has(pair)) {
          bundleStats.set(pair, { won: 0, total: 0 })
        }
        const stats = bundleStats.get(pair)!
        stats.total++
        if (isWon) stats.won++
      }
    }
  }

  // Convert to array and calculate rates
  return Array.from(bundleStats.entries())
    .map(([key, stats]) => ({
      services: key.split(" + "),
      count: stats.total,
      winRate: stats.total > 0 ? stats.won / stats.total : 0,
    }))
    .filter((b) => b.count >= 2) // Only bundles with at least 2 occurrences
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
}

/**
 * Build rich context for the AI
 */
function buildContext(proposals: Proposal[]): string {
  const winRates = calculateWinRates(proposals)
  const bundles = calculateServiceBundles(proposals)

  // Date range
  const dates = proposals.filter((p) => p.date).map((p) => new Date(p.date!))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null

  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`
  const formatDimension = (dim: WinRateByDimension) =>
    Object.entries(dim)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([key, stats]) => `- ${key}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
      .join("\n")

  // Count proposals per category
  const categoryCounts: Record<string, number> = {}
  proposals.forEach((p) => {
    if (p.category) {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1
    }
  })

  return `
PROPOSAL DATA SUMMARY:
- Total Proposals: ${proposals.length}
- Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}
- Won: ${winRates.wonCount} (${formatRate(winRates.overall)} overall win rate)
- Lost/Not Awarded: ${winRates.lostCount}
- Pending/Other: ${winRates.pendingCount}

PROPOSALS BY CATEGORY (Service Type):
${Object.entries(categoryCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `- ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${count} proposals`)
  .join("\n") || "No data"}

WIN RATES BY CATEGORY:
${formatDimension(winRates.byCategory) || "No data"}

WIN RATES BY SCHOOL TYPE:
${formatDimension(winRates.bySchoolType) || "No data"}

WIN RATES BY AFFILIATION:
${formatDimension(winRates.byAffiliation) || "No data"}

WIN RATES BY SERVICE OFFERED (top 10):
${formatDimension(winRates.byService) || "No data"}

WIN RATES BY ACCOUNT EXECUTIVE:
${formatDimension(winRates.byCE) || "No data"}

WIN RATES BY YEAR:
${formatDimension(winRates.byYear) || "No data"}

SERVICE BUNDLE ANALYSIS (pairs that appear together):
${bundles.map((b) => `- ${b.services.join(" + ")}: ${formatRate(b.winRate)} win rate (${b.count} proposals)`).join("\n") || "Not enough data"}

RECENT PROPOSALS (last 15):
${proposals
  .slice(0, 15)
  .map(
    (p) =>
      `- ${p.client || "Unknown client"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}): ${p.won || "Unknown"} - ${(p.servicesOffered || []).slice(0, 3).join(", ") || "No services listed"}`
  )
  .join("\n")}
`.trim()
}

/**
 * System prompt for proposal insights AI
 */
const SYSTEM_PROMPT = `You are a Proposal Analytics Assistant for a professional services company that provides marketing, research, and branding services to educational institutions.

Your job is to analyze historical proposal data and provide actionable insights.

CRITICAL RULES:
1. ONLY use statistics from the provided data - NEVER make up numbers
2. Be specific with percentages and counts when available
3. If asked about something not in the data, clearly say so
4. Provide actionable, strategic insights when possible
5. Keep responses concise but informative (aim for 150-300 words)
6. Use bullet points for clarity when listing multiple items
7. Compare segments when relevant (e.g., "Community colleges win at 45% vs 30% for universities")
8. Highlight notable patterns, outliers, or trends

RESPONSE FORMAT:
Provide a clear, direct answer to the user's question. Use markdown formatting:
- Bold for emphasis on key numbers
- Bullet points for lists
- Short paragraphs for explanations

At the end of your response, include exactly 3-4 follow-up questions the user might want to ask next.
Format them EXACTLY like this (on a new line after your answer):

FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

Make follow-ups:
1. Contextual to what was just discussed
2. Progressively deeper or lead to adjacent analysis
3. At least one should lead toward actionable recommendations`

/**
 * Parse follow-up prompts from AI response
 */
function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch) {
    try {
      const promptsJson = `[${followUpMatch[1]}]`
      const prompts = JSON.parse(promptsJson)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    } catch {
      // Failed to parse, try to extract manually
      const prompts = followUpMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    }
  }

  // Default follow-ups if none provided
  return {
    cleanResponse: response,
    prompts: [
      "Break this down by school type",
      "What's the trend over time?",
      "What services should we focus on?",
    ],
  }
}

/**
 * Query the Proposal Insights AI
 */
export async function queryProposalInsights(query: string): Promise<ProposalInsightResult> {
  const openai = getOpenAI()

  if (!openai) {
    return {
      response: "",
      dataUsed: {
        totalProposals: 0,
        dateRange: { from: null, to: null },
        overallWinRate: 0,
        wonCount: 0,
        lostCount: 0,
        pendingCount: 0,
        byCategory: {},
      },
      followUpPrompts: [],
      refused: true,
      refusalReason: "AI service not configured. Please set OPENAI_API_KEY in your environment.",
    }
  }

  try {
    // Get all proposal data
    const proposals = await getAllProposals()

    if (proposals.length === 0) {
      return {
        response: "",
        dataUsed: {
          totalProposals: 0,
          dateRange: { from: null, to: null },
          overallWinRate: 0,
          wonCount: 0,
          lostCount: 0,
          pendingCount: 0,
          byCategory: {},
        },
        followUpPrompts: [],
        refused: true,
        refusalReason:
          "No proposal data found. Please configure PROPOSAL_SUMMARY_PATH and sync your Proposal Summary Excel file.",
      }
    }

    // Build context
    const context = buildContext(proposals)
    const winRates = calculateWinRates(proposals)

    // Date range for response
    const dates = proposals.filter((p) => p.date).map((p) => new Date(p.date!))
    const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null

    // Call GPT-4o
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n--- PROPOSAL DATA ---\n${context}`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      temperature: 0.4,
      max_tokens: 1500,
    })

    const rawResponse = completion.choices[0]?.message?.content || ""
    const { cleanResponse, prompts } = parseFollowUpPrompts(rawResponse)

    // Count proposals per category
    const byCategory: { [key: string]: number } = {}
    proposals.forEach((p) => {
      if (p.category) {
        byCategory[p.category] = (byCategory[p.category] || 0) + 1
      }
    })

    return {
      response: cleanResponse,
      dataUsed: {
        totalProposals: proposals.length,
        dateRange: { from: minDate, to: maxDate },
        overallWinRate: winRates.overall,
        wonCount: winRates.wonCount,
        lostCount: winRates.lostCount,
        pendingCount: winRates.pendingCount,
        byCategory,
      },
      followUpPrompts: prompts,
      refused: false,
    }
  } catch (error) {
    console.error("Proposal AI query failed:", error)

    return {
      response: "",
      dataUsed: {
        totalProposals: 0,
        dateRange: { from: null, to: null },
        overallWinRate: 0,
        wonCount: 0,
        lostCount: 0,
        pendingCount: 0,
        byCategory: {},
      },
      followUpPrompts: [],
      refused: true,
      refusalReason: "An error occurred while analyzing proposals. Please try again.",
    }
  }
}
