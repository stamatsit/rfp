/**
 * Briefing AI Service
 *
 * Generates streaming executive briefings using all available Stamats data.
 * No user query — auto-generates a comprehensive daily briefing.
 */

import type { Response } from "express"
import OpenAI from "openai"
import { streamCompletion, CHART_PROMPT } from "./utils/streamHelper.js"
import { getAllProposals } from "./proposalSyncService.js"
import { getPipelineStats } from "./pipelineSyncService.js"
import { clientSuccessData } from "../data/clientSuccessData.js"
import { calculateWinRates, scorePendingProposals, generateRecommendations } from "./proposalAIService.js"
import type { Proposal } from "../db/index.js"

// Lazy-initialized OpenAI client
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
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

const BRIEFING_SYSTEM_PROMPT = `You are an executive briefing generator for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing.

Generate a comprehensive morning briefing covering ALL data sources. Today's date: {DATE}.

STRUCTURE YOUR BRIEFING IN EXACTLY THESE SECTIONS:

## Pipeline Status
Current RFP pipeline: total under review, pursuit rate trends, notable incoming opportunities.
Include a chart showing pipeline activity by quarter.

## Win Rate Trends
Current overall win rate vs. historical. Momentum (accelerating/steady/decelerating).
Rolling 6-month and 12-month comparisons. Year-over-year change.
Include a line chart of quarterly win rates for the last 2 years.

## Key Opportunities
Top 5-10 pending proposals ranked by win probability score.
For each: client name, service category, probability score (%), and key factor.
Include a bar chart of pending proposals by probability tier.

## Team Performance
Account executive performance snapshot. Who has the highest recent win rate.
Notable specializations. Any concerning trends.

## Strategic Recommendations
Top 3-5 actionable recommendations based on ALL data.
Each with: the insight, suggested action, expected impact, and supporting data point.

## Client Success Highlights
Recent wins worth turning into case studies or testimonials.
Existing proof points that could strengthen pending proposals.

RULES:
1. Use ONLY real data from the provided context. Never fabricate numbers.
2. Be direct and concise — this is for busy executives, not a report.
3. Use **bold** for key numbers, percentages, and client names.
4. Include CHART_DATA where specified above.
5. Every claim must be backed by a specific number from the data.

{CHART_PROMPT}

Do NOT include FOLLOW_UP_PROMPTS for the briefing.`

function buildBriefingContext(
  allProposals: Proposal[],
  pipelineStats: Awaited<ReturnType<typeof getPipelineStats>> | null,
  winRates: ReturnType<typeof calculateWinRates>,
  pendingScores: ReturnType<typeof scorePendingProposals>,
  recommendations: ReturnType<typeof generateRecommendations>
): string {
  const parts: string[] = []

  // Proposal summary
  parts.push(`PROPOSAL DATA (${allProposals.length} total proposals):`)
  parts.push(`- Overall win rate: ${(winRates.overall * 100).toFixed(1)}%`)
  parts.push(`- Won: ${winRates.wonCount}, Lost: ${winRates.lostCount}, Pending: ${winRates.pendingCount}`)

  // Win rates by category
  parts.push("\nWIN RATES BY SERVICE CATEGORY:")
  for (const [cat, data] of Object.entries(winRates.byCategory)) {
    const d = data as { won: number; total: number; rate: number }
    parts.push(`- ${cat}: ${(d.total > 0 ? (d.won / d.total) * 100 : 0).toFixed(1)}% (${d.won}W/${d.total - d.won}L)`)
  }

  // Win rates by year
  parts.push("\nWIN RATES BY YEAR:")
  for (const [year, data] of Object.entries(winRates.byYear)) {
    const d = data as { won: number; total: number; rate: number }
    parts.push(`- ${year}: ${(d.total > 0 ? (d.won / d.total) * 100 : 0).toFixed(1)}% (${d.won}W/${d.total - d.won}L)`)
  }

  // Win rates by CE
  parts.push("\nWIN RATES BY ACCOUNT EXECUTIVE:")
  for (const [ce, data] of Object.entries(winRates.byCE)) {
    const d = data as { won: number; total: number; rate: number }
    parts.push(`- ${ce}: ${(d.total > 0 ? (d.won / d.total) * 100 : 0).toFixed(1)}% (${d.won}W/${d.total - d.won}L)`)
  }

  // Pipeline stats
  if (pipelineStats) {
    parts.push(`\nPIPELINE DATA:`)
    parts.push(`- Total RFPs received: ${pipelineStats.total}`)
    parts.push(`- Processed/pursued: ${pipelineStats.processed}`)
    parts.push(`- Passing: ${pipelineStats.passing}`)
    parts.push(`- Pursuit rate: ${(pipelineStats.pursuitRate * 100).toFixed(1)}%`)
    if (pipelineStats.passReasons) {
      parts.push("- Pass reasons: " + Object.entries(pipelineStats.passReasons).map(([r, c]) => `${r}: ${c}`).join(", "))
    }
  }

  // Pending proposals with scores
  if (pendingScores.length > 0) {
    parts.push(`\nPENDING PROPOSALS (${pendingScores.length} total, ranked by probability):`)
    for (const p of pendingScores.slice(0, 15)) {
      parts.push(`- ${(p as { client: string }).client} (${(p as { category: string }).category}): ${((p as { probability: number }).probability * 100).toFixed(0)}% — ${(p as { recommendation: string }).recommendation}`)
    }
  }

  // Recommendations
  if (recommendations.length > 0) {
    parts.push("\nSTRATEGIC RECOMMENDATIONS:")
    for (const rec of recommendations) {
      parts.push(`- [${(rec as { priority: string }).priority}] ${(rec as { category: string }).category}: ${(rec as { insight: string }).insight} → ${(rec as { action: string }).action}`)
    }
  }

  // Client success highlights
  parts.push(`\nCLIENT SUCCESS DATA:`)
  parts.push(`- ${clientSuccessData.caseStudies.length} case studies`)
  parts.push(`- ${clientSuccessData.topLineResults.length} quantified results`)
  parts.push(`- ${clientSuccessData.testimonials.length} testimonials`)
  parts.push(`- ${clientSuccessData.awards.length} awards`)

  // Top results
  parts.push("\nTOP RESULTS:")
  for (const r of clientSuccessData.topLineResults.slice(0, 10)) {
    parts.push(`- ${r.client}: ${r.result} (${r.metric})`)
  }

  return parts.join("\n")
}

export async function streamBriefing(res: Response): Promise<void> {
  const openai = getOpenAI()
  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "OpenAI API key not configured" })}\n\n`)
    res.end()
    return
  }

  // Load ALL data in parallel
  const [allProposals, pipelineStats] = await Promise.all([
    getAllProposals().catch(() => [] as Proposal[]),
    getPipelineStats().catch(() => null),
  ])

  const winRates = calculateWinRates(allProposals)
  const pendingScores = scorePendingProposals(allProposals)
  const recommendations = generateRecommendations(allProposals)
  const context = buildBriefingContext(allProposals, pipelineStats, winRates, pendingScores, recommendations)

  const systemPrompt = BRIEFING_SYSTEM_PROMPT
    .replace("{DATE}", new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))
    .replace("{CHART_PROMPT}", CHART_PROMPT)

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: `${systemPrompt}\n\n--- DATA CONTEXT ---\n${context}` },
      { role: "user", content: `Generate today's executive briefing for ${new Date().toLocaleDateString()}.` },
    ],
    temperature: 0.3,
    maxTokens: 4000,
    metadata: {
      dataUsed: {
        totalProposals: allProposals.length,
        pendingCount: winRates.pendingCount,
        overallWinRate: winRates.overall,
        caseStudies: clientSuccessData.caseStudies.length,
        results: clientSuccessData.topLineResults.length,
      },
    },
    parseFollowUpPrompts,
    res,
  })
}
