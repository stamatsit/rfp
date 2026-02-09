/**
 * Proposal AI Service
 *
 * COMPLETELY ISOLATED from the Q&A library AI (aiService.ts).
 * This service handles AI-powered analytics on proposal data ONLY.
 * It never touches or references the answer_items or photo_assets tables.
 */

import OpenAI from "openai"
import type { Response } from "express"
import { getAllProposals } from "./proposalSyncService.js"
import { getPipelineStats } from "./pipelineSyncService.js"
import type { Proposal } from "../db/index.js"
import { streamCompletion, truncateHistory, CHART_PROMPT, parseChartData } from "./utils/streamHelper.js"

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
    // Phase 2: Advanced metrics
    momentum: "accelerating" | "steady" | "decelerating"
    rolling6Month: number
    rolling12Month: number
    yoyChange: number | null
  }
  followUpPrompts: string[]
  // Phase 2: Strategic insights
  recommendations: Recommendation[]
  pendingScores: Array<{
    client: string | null
    category: string | null
    probability: number
    recommendation: string
  }>
  chartData?: Record<string, unknown>
  refused: boolean
  refusalReason?: string
}

interface WinRateByDimension {
  [key: string]: { won: number; total: number; rate: number }
}

// ==================== PHASE 2: AI SUPERPOWERS ====================

/**
 * Advanced Analytics Interfaces
 */
interface TemporalAnalysis {
  byQuarter: { [quarter: string]: { won: number; total: number; rate: number } }
  byMonth: { [month: string]: { won: number; total: number; rate: number } }
  yoyComparison: {
    currentYear: { year: number; won: number; total: number; rate: number }
    previousYear: { year: number; won: number; total: number; rate: number }
    change: number
  } | null
  rolling6Month: number
  rolling12Month: number
  momentum: "accelerating" | "steady" | "decelerating"
  momentumValue: number
  bestQuarter: { quarter: string; rate: number; count: number } | null
  worstQuarter: { quarter: string; rate: number; count: number } | null
  bestMonth: { month: string; rate: number; count: number } | null
  seasonalityPattern: string
}

interface CEDeepAnalysis {
  [ceName: string]: {
    winRate: number
    totalProposals: number
    wonCount: number
    specializations: string[]
    bestServices: string[]
    trend: "improving" | "stable" | "declining"
    recentWinRate: number
  }
}

interface ServiceIntelligence {
  tripleBundles: Array<{ services: string[]; count: number; winRate: number }>
  sizeAnalysis: {
    small: { label: string; count: number; winRate: number }
    medium: { label: string; count: number; winRate: number }
    large: { label: string; count: number; winRate: number }
    optimalSize: string
  }
  emergingServices: string[]
  decliningServices: string[]
}

interface AdvancedAnalytics {
  temporal: TemporalAnalysis
  ceDeep: CEDeepAnalysis
  serviceIntel: ServiceIntelligence
}

interface WinProbability {
  proposalId: string
  client: string | null
  category: string | null
  probability: number
  factors: {
    baseRate: number
    schoolTypeAdjustment: number
    affiliationAdjustment: number
    ceAdjustment: number
    serviceAdjustment: number
    categoryAdjustment: number
  }
  similarWins: Array<{ client: string; category: string; similarity: number }>
  recommendation: "Strong opportunity" | "Good fit" | "Average" | "Challenging"
}

interface Recommendation {
  priority: "high" | "medium" | "low"
  category: "targeting" | "services" | "team" | "timing" | "process"
  insight: string
  action: string
  expectedImpact: string
  dataSupport: string
}

/**
 * Calculate quarterly win rates
 */
function calculateQuarterlyRates(proposals: Proposal[]): { [quarter: string]: { won: number; total: number; rate: number } } {
  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.date)
  const byQuarter: { [quarter: string]: { won: number; total: number; rate: number } } = {}

  for (const p of decided) {
    const date = new Date(p.date!)
    const year = date.getFullYear()
    const quarter = Math.floor(date.getMonth() / 3) + 1
    const key = `${year} Q${quarter}`

    if (!byQuarter[key]) byQuarter[key] = { won: 0, total: 0, rate: 0 }
    byQuarter[key].total++
    if (p.won === "Yes") byQuarter[key].won++
  }

  for (const key of Object.keys(byQuarter)) {
    const entry = byQuarter[key]
    if (entry) {
      entry.rate = entry.total > 0 ? entry.won / entry.total : 0
    }
  }

  return byQuarter
}

/**
 * Calculate monthly win rates
 */
function calculateMonthlyRates(proposals: Proposal[]): { [month: string]: { won: number; total: number; rate: number } } {
  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.date)
  const byMonth: { [month: string]: { won: number; total: number; rate: number } } = {}
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  for (const p of decided) {
    const date = new Date(p.date!)
    const monthIdx = date.getMonth()
    const key = monthNames[monthIdx]
    if (!key) continue

    if (!byMonth[key]) byMonth[key] = { won: 0, total: 0, rate: 0 }
    const entry = byMonth[key]
    if (entry) {
      entry.total++
      if (p.won === "Yes") entry.won++
    }
  }

  for (const key of Object.keys(byMonth)) {
    const entry = byMonth[key]
    if (entry) {
      entry.rate = entry.total > 0 ? entry.won / entry.total : 0
    }
  }

  return byMonth
}

/**
 * Calculate year-over-year comparison
 */
function calculateYearOverYear(proposals: Proposal[]): TemporalAnalysis["yoyComparison"] {
  const currentYear = new Date().getFullYear()
  const previousYear = currentYear - 1
  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.date)

  const currentYearProposals = decided.filter((p) => new Date(p.date!).getFullYear() === currentYear)
  const previousYearProposals = decided.filter((p) => new Date(p.date!).getFullYear() === previousYear)

  if (previousYearProposals.length === 0) return null

  const currentWon = currentYearProposals.filter((p) => p.won === "Yes").length
  const previousWon = previousYearProposals.filter((p) => p.won === "Yes").length

  const currentRate = currentYearProposals.length > 0 ? currentWon / currentYearProposals.length : 0
  const previousRate = previousYearProposals.length > 0 ? previousWon / previousYearProposals.length : 0

  return {
    currentYear: { year: currentYear, won: currentWon, total: currentYearProposals.length, rate: currentRate },
    previousYear: { year: previousYear, won: previousWon, total: previousYearProposals.length, rate: previousRate },
    change: (currentRate - previousRate) * 100,
  }
}

/**
 * Calculate rolling win rates
 */
function calculateRollingRates(proposals: Proposal[]): { rolling6Month: number; rolling12Month: number } {
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.date)

  const last6 = decided.filter((p) => new Date(p.date!) >= sixMonthsAgo)
  const last12 = decided.filter((p) => new Date(p.date!) >= twelveMonthsAgo)

  const won6 = last6.filter((p) => p.won === "Yes").length
  const won12 = last12.filter((p) => p.won === "Yes").length

  return {
    rolling6Month: last6.length > 0 ? won6 / last6.length : 0,
    rolling12Month: last12.length > 0 ? won12 / last12.length : 0,
  }
}

/**
 * Calculate momentum (last 3 months vs previous 3 months)
 */
function calculateMomentum(proposals: Proposal[]): { momentum: TemporalAnalysis["momentum"]; value: number } {
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)

  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.date)

  const recent = decided.filter((p) => new Date(p.date!) >= threeMonthsAgo)
  const previous = decided.filter((p) => {
    const d = new Date(p.date!)
    return d >= sixMonthsAgo && d < threeMonthsAgo
  })

  const recentWon = recent.filter((p) => p.won === "Yes").length
  const previousWon = previous.filter((p) => p.won === "Yes").length

  const recentRate = recent.length > 0 ? recentWon / recent.length : 0
  const previousRate = previous.length > 0 ? previousWon / previous.length : 0

  const diff = recentRate - previousRate

  let momentum: TemporalAnalysis["momentum"]
  if (diff > 0.05) momentum = "accelerating"
  else if (diff < -0.05) momentum = "decelerating"
  else momentum = "steady"

  return { momentum, value: diff * 100 }
}

/**
 * Find best/worst periods
 */
function findBestWorstPeriods(
  byQuarter: { [q: string]: { won: number; total: number; rate: number } },
  byMonth: { [m: string]: { won: number; total: number; rate: number } }
): {
  bestQuarter: TemporalAnalysis["bestQuarter"]
  worstQuarter: TemporalAnalysis["worstQuarter"]
  bestMonth: TemporalAnalysis["bestMonth"]
} {
  const quarters = Object.entries(byQuarter).filter(([_, v]) => v.total >= 3)
  const months = Object.entries(byMonth).filter(([_, v]) => v.total >= 5)

  const sortedQuarters = quarters.sort((a, b) => b[1].rate - a[1].rate)
  const sortedMonths = months.sort((a, b) => b[1].rate - a[1].rate)

  const bestQ = sortedQuarters[0]
  const worstQ = sortedQuarters[sortedQuarters.length - 1]
  const bestM = sortedMonths[0]

  return {
    bestQuarter: bestQ ? { quarter: bestQ[0], rate: bestQ[1].rate, count: bestQ[1].total } : null,
    worstQuarter: worstQ ? { quarter: worstQ[0], rate: worstQ[1].rate, count: worstQ[1].total } : null,
    bestMonth: bestM ? { month: bestM[0], rate: bestM[1].rate, count: bestM[1].total } : null,
  }
}

/**
 * Detect seasonality pattern
 */
function detectSeasonality(byMonth: { [m: string]: { won: number; total: number; rate: number } }): string {
  const q1 = ["January", "February", "March"]
  const q2 = ["April", "May", "June"]
  const q3 = ["July", "August", "September"]
  const q4 = ["October", "November", "December"]

  const avgRate = (months: string[]) => {
    const filtered = months.filter((m) => {
      const entry = byMonth[m]
      return entry && entry.total >= 3
    })
    if (filtered.length === 0) return 0
    return filtered.reduce((sum, m) => {
      const entry = byMonth[m]
      return sum + (entry ? entry.rate : 0)
    }, 0) / filtered.length
  }

  const rates = [
    { q: "Q1", rate: avgRate(q1) },
    { q: "Q2", rate: avgRate(q2) },
    { q: "Q3", rate: avgRate(q3) },
    { q: "Q4", rate: avgRate(q4) },
  ].filter((r) => r.rate > 0)

  if (rates.length < 2) return "Insufficient data for seasonality analysis"

  const sorted = [...rates].sort((a, b) => b.rate - a.rate)
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]

  if (!strongest || !weakest) return "Insufficient data for seasonality analysis"
  if (strongest.rate - weakest.rate < 0.05) return "No significant seasonal pattern detected"

  return `${strongest.q} strongest (${(strongest.rate * 100).toFixed(0)}%), ${weakest.q} weakest (${(weakest.rate * 100).toFixed(0)}%)`
}

/**
 * Deep CE analysis
 */
function analyzeCEPerformance(proposals: Proposal[]): CEDeepAnalysis {
  const decided = proposals.filter((p) => (p.won === "Yes" || p.won === "No") && p.ce)
  const ceStats: CEDeepAnalysis = {}

  // Calculate recent period (last 12 months)
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

  // Group by CE
  const byCE: { [ce: string]: Proposal[] } = {}
  for (const p of decided) {
    const ce = p.ce!
    if (!byCE[ce]) byCE[ce] = []
    byCE[ce]!.push(p)
  }

  for (const [ce, ceProposals] of Object.entries(byCE)) {
    const wonCount = ceProposals.filter((p) => p.won === "Yes").length
    const winRate = ceProposals.length > 0 ? wonCount / ceProposals.length : 0

    // Recent performance
    const recentProposals = ceProposals.filter((p) => p.date && new Date(p.date) >= twelveMonthsAgo)
    const recentWon = recentProposals.filter((p) => p.won === "Yes").length
    const recentWinRate = recentProposals.length > 0 ? recentWon / recentProposals.length : 0

    // Specializations (school types they win most)
    const schoolTypeWins: { [st: string]: number } = {}
    const schoolTypeTotals: { [st: string]: number } = {}
    for (const p of ceProposals) {
      if (p.schoolType) {
        schoolTypeTotals[p.schoolType] = (schoolTypeTotals[p.schoolType] || 0) + 1
        if (p.won === "Yes") schoolTypeWins[p.schoolType] = (schoolTypeWins[p.schoolType] || 0) + 1
      }
    }
    const specializations = Object.entries(schoolTypeTotals)
      .filter(([st, total]) => total >= 3 && (schoolTypeWins[st] || 0) / total > winRate)
      .sort((a, b) => ((schoolTypeWins[b[0]] || 0) / b[1]) - ((schoolTypeWins[a[0]] || 0) / a[1]))
      .slice(0, 3)
      .map(([st]) => st)

    // Best services
    const serviceWins: { [s: string]: number } = {}
    const serviceTotals: { [s: string]: number } = {}
    for (const p of ceProposals) {
      for (const service of p.servicesOffered || []) {
        serviceTotals[service] = (serviceTotals[service] || 0) + 1
        if (p.won === "Yes") serviceWins[service] = (serviceWins[service] || 0) + 1
      }
    }
    const bestServices = Object.entries(serviceTotals)
      .filter(([s, total]) => total >= 3 && (serviceWins[s] || 0) / total > winRate)
      .sort((a, b) => ((serviceWins[b[0]] || 0) / b[1]) - ((serviceWins[a[0]] || 0) / a[1]))
      .slice(0, 3)
      .map(([s]) => s)

    // Trend
    let trend: "improving" | "stable" | "declining" = "stable"
    if (recentProposals.length >= 3) {
      const diff = recentWinRate - winRate
      if (diff > 0.05) trend = "improving"
      else if (diff < -0.05) trend = "declining"
    }

    ceStats[ce] = {
      winRate,
      totalProposals: ceProposals.length,
      wonCount,
      specializations,
      bestServices,
      trend,
      recentWinRate,
    }
  }

  return ceStats
}

/**
 * Calculate triple service bundles
 */
function calculateTripleBundles(proposals: Proposal[]): ServiceIntelligence["tripleBundles"] {
  const bundleStats = new Map<string, { won: number; total: number }>()
  const decided = proposals.filter((p) => p.won === "Yes" || p.won === "No")

  for (const proposal of decided) {
    const services = proposal.servicesOffered || []
    if (services.length < 3) continue

    const isWon = proposal.won === "Yes"

    // Generate all triples
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        for (let k = j + 1; k < services.length; k++) {
          const triple = [services[i], services[j], services[k]].sort().join(" + ")
          if (!bundleStats.has(triple)) bundleStats.set(triple, { won: 0, total: 0 })
          const stats = bundleStats.get(triple)!
          stats.total++
          if (isWon) stats.won++
        }
      }
    }
  }

  return Array.from(bundleStats.entries())
    .map(([key, stats]) => ({
      services: key.split(" + "),
      count: stats.total,
      winRate: stats.total > 0 ? stats.won / stats.total : 0,
    }))
    .filter((b) => b.count >= 2)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 10)
}

/**
 * Analyze proposal size (number of services)
 */
function analyzeProposalSize(proposals: Proposal[]): ServiceIntelligence["sizeAnalysis"] {
  const decided = proposals.filter((p) => p.won === "Yes" || p.won === "No")

  const small = decided.filter((p) => (p.servicesOffered || []).length <= 2)
  const medium = decided.filter((p) => {
    const len = (p.servicesOffered || []).length
    return len >= 3 && len <= 5
  })
  const large = decided.filter((p) => (p.servicesOffered || []).length >= 6)

  const calcRate = (arr: Proposal[]) => {
    const won = arr.filter((p) => p.won === "Yes").length
    return arr.length > 0 ? won / arr.length : 0
  }

  const smallData = { label: "1-2 services", count: small.length, winRate: calcRate(small) }
  const mediumData = { label: "3-5 services", count: medium.length, winRate: calcRate(medium) }
  const largeData = { label: "6+ services", count: large.length, winRate: calcRate(large) }

  const rates = [smallData, mediumData, largeData]
  const best = rates.filter((r) => r.count >= 5).sort((a, b) => b.winRate - a.winRate)[0]

  return {
    small: smallData,
    medium: mediumData,
    large: largeData,
    optimalSize: best ? best.label : "Insufficient data",
  }
}

/**
 * Find emerging and declining services
 */
function analyzeServiceTrends(proposals: Proposal[]): { emerging: string[]; declining: string[] } {
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const twentyFourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 24, 1)

  const recent = proposals.filter((p) => p.date && new Date(p.date) >= twelveMonthsAgo)
  const previous = proposals.filter((p) => p.date && new Date(p.date) >= twentyFourMonthsAgo && new Date(p.date) < twelveMonthsAgo)

  const countServices = (arr: Proposal[]) => {
    const counts: { [s: string]: number } = {}
    for (const p of arr) {
      for (const s of p.servicesOffered || []) {
        counts[s] = (counts[s] || 0) + 1
      }
    }
    return counts
  }

  const recentCounts = countServices(recent)
  const previousCounts = countServices(previous)

  const allServices = new Set([...Object.keys(recentCounts), ...Object.keys(previousCounts)])

  const emerging: string[] = []
  const declining: string[] = []

  for (const service of allServices) {
    const recentPct = recent.length > 0 ? (recentCounts[service] || 0) / recent.length : 0
    const previousPct = previous.length > 0 ? (previousCounts[service] || 0) / previous.length : 0

    if (recentPct > previousPct * 1.5 && (recentCounts[service] || 0) >= 3) {
      emerging.push(service)
    } else if (previousPct > recentPct * 1.5 && (previousCounts[service] || 0) >= 3) {
      declining.push(service)
    }
  }

  return { emerging: emerging.slice(0, 5), declining: declining.slice(0, 5) }
}

/**
 * Calculate all advanced analytics
 */
function calculateAdvancedAnalytics(proposals: Proposal[]): AdvancedAnalytics {
  const byQuarter = calculateQuarterlyRates(proposals)
  const byMonth = calculateMonthlyRates(proposals)
  const yoyComparison = calculateYearOverYear(proposals)
  const { rolling6Month, rolling12Month } = calculateRollingRates(proposals)
  const { momentum, value: momentumValue } = calculateMomentum(proposals)
  const { bestQuarter, worstQuarter, bestMonth } = findBestWorstPeriods(byQuarter, byMonth)
  const seasonalityPattern = detectSeasonality(byMonth)

  const temporal: TemporalAnalysis = {
    byQuarter,
    byMonth,
    yoyComparison,
    rolling6Month,
    rolling12Month,
    momentum,
    momentumValue,
    bestQuarter,
    worstQuarter,
    bestMonth,
    seasonalityPattern,
  }

  const ceDeep = analyzeCEPerformance(proposals)

  const tripleBundles = calculateTripleBundles(proposals)
  const sizeAnalysis = analyzeProposalSize(proposals)
  const { emerging: emergingServices, declining: decliningServices } = analyzeServiceTrends(proposals)

  const serviceIntel: ServiceIntelligence = {
    tripleBundles,
    sizeAnalysis,
    emergingServices,
    decliningServices,
  }

  return { temporal, ceDeep, serviceIntel }
}

/**
 * Score pending proposals for win probability
 */
export function scorePendingProposals(proposals: Proposal[]): WinProbability[] {
  const pending = proposals.filter((p) => p.won === "Pending" || !p.won)
  const decided = proposals.filter((p) => p.won === "Yes" || p.won === "No")
  const winRates = calculateWinRates(proposals)

  const overall = winRates.overall

  return pending.slice(0, 20).map((p) => {
    let probability = overall * 100
    const factors = {
      baseRate: overall * 100,
      schoolTypeAdjustment: 0,
      affiliationAdjustment: 0,
      ceAdjustment: 0,
      serviceAdjustment: 0,
      categoryAdjustment: 0,
    }

    // School type adjustment
    if (p.schoolType) {
      const stEntry = winRates.bySchoolType[p.schoolType]
      if (stEntry) {
        factors.schoolTypeAdjustment = (stEntry.rate - overall) * 100
        probability += factors.schoolTypeAdjustment
      }
    }

    // Affiliation adjustment
    if (p.affiliation) {
      const affEntry = winRates.byAffiliation[p.affiliation]
      if (affEntry) {
        factors.affiliationAdjustment = (affEntry.rate - overall) * 100
        probability += factors.affiliationAdjustment
      }
    }

    // CE adjustment
    if (p.ce) {
      const ceEntry = winRates.byCE[p.ce]
      if (ceEntry) {
        factors.ceAdjustment = (ceEntry.rate - overall) * 100
        probability += factors.ceAdjustment
      }
    }

    // Category adjustment
    if (p.category) {
      const catEntry = winRates.byCategory[p.category]
      if (catEntry) {
        factors.categoryAdjustment = (catEntry.rate - overall) * 100
        probability += factors.categoryAdjustment
      }
    }

    // Service combo adjustment (average of service rates)
    if (p.servicesOffered && p.servicesOffered.length > 0) {
      const serviceRates = p.servicesOffered
        .map((s) => winRates.byService[s])
        .filter((entry): entry is { won: number; total: number; rate: number } => entry !== undefined)
        .map((entry) => entry.rate)
      if (serviceRates.length > 0) {
        const avgServiceRate = serviceRates.reduce((a, b) => a + b, 0) / serviceRates.length
        factors.serviceAdjustment = (avgServiceRate - overall) * 100 * 0.5 // Weight at 50%
        probability += factors.serviceAdjustment
      }
    }

    // Clamp probability
    probability = Math.max(5, Math.min(95, probability))

    // Find similar past wins
    const won = decided.filter((d) => d.won === "Yes")
    const similarWins = won
      .map((w) => {
        let similarity = 0
        if (w.schoolType === p.schoolType) similarity += 30
        if (w.affiliation === p.affiliation) similarity += 20
        if (w.category === p.category) similarity += 30
        if (w.ce === p.ce) similarity += 10
        const sharedServices = (p.servicesOffered || []).filter((s) => (w.servicesOffered || []).includes(s)).length
        similarity += sharedServices * 5
        return { client: w.client || "Unknown", category: w.category || "Unknown", similarity }
      })
      .filter((s) => s.similarity >= 50)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)

    let recommendation: WinProbability["recommendation"]
    if (probability >= 40) recommendation = "Strong opportunity"
    else if (probability >= 25) recommendation = "Good fit"
    else if (probability >= 15) recommendation = "Average"
    else recommendation = "Challenging"

    return {
      proposalId: p.id,
      client: p.client,
      category: p.category,
      probability: Math.round(probability),
      factors,
      similarWins,
      recommendation,
    }
  })
}

/**
 * Search raw data fields (exported for potential API use)
 */
export function searchRawData(proposals: Proposal[], field: string, value?: string): Proposal[] {
  return proposals.filter((p) => {
    if (!p.rawData) return false
    const rawData = typeof p.rawData === "string" ? JSON.parse(p.rawData) : p.rawData

    if (!value) {
      return Object.keys(rawData).some((k) => k.toLowerCase().includes(field.toLowerCase()))
    }

    return Object.entries(rawData).some(
      ([k, v]) => k.toLowerCase().includes(field.toLowerCase()) && String(v).toLowerCase().includes(value.toLowerCase())
    )
  })
}

/**
 * Get all available raw data fields
 */
function getAllRawDataFields(proposals: Proposal[]): string[] {
  const allFields = new Set<string>()
  for (const p of proposals) {
    if (p.rawData) {
      const raw = typeof p.rawData === "string" ? JSON.parse(p.rawData) : p.rawData
      for (const key of Object.keys(raw)) {
        allFields.add(key)
      }
    }
  }
  return Array.from(allFields).sort()
}

/**
 * Detect if query wants raw data access
 */
function detectRawDataQuery(query: string): boolean {
  const rawDataKeywords = [
    "ttg",
    "how did we get",
    "presentation date",
    "launch date",
    "cms",
    "wordpress",
    "drupal",
    "cascade",
    "link to proposal",
    "cost proposal",
    "show me all",
    "list all",
    "find proposals where",
    "raw data",
    "all fields",
    "what fields",
    "columns",
  ]
  const lower = query.toLowerCase()
  return rawDataKeywords.some((kw) => lower.includes(kw))
}

/**
 * Generate strategic recommendations
 */
export function generateRecommendations(proposals: Proposal[]): Recommendation[] {
  const recommendations: Recommendation[] = []
  const winRates = calculateWinRates(proposals)
  const analytics = calculateAdvancedAnalytics(proposals)
  const bundles = calculateServiceBundles(proposals)

  // 1. Targeting recommendations - best school type
  const schoolTypes = Object.entries(winRates.bySchoolType)
    .filter(([_, v]) => v.total >= 5)
    .sort((a, b) => b[1].rate - a[1].rate)

  if (schoolTypes.length > 0) {
    const best = schoolTypes[0]
    if (best && best[1].rate > winRates.overall * 1.2) {
      recommendations.push({
        priority: "high",
        category: "targeting",
        insight: `${best[0]} wins at ${(best[1].rate * 100).toFixed(0)}% vs ${(winRates.overall * 100).toFixed(0)}% overall`,
        action: `Prioritize ${best[0]} opportunities in your pipeline`,
        expectedImpact: `+${((best[1].rate - winRates.overall) * 100).toFixed(0)} percentage points above average`,
        dataSupport: `Based on ${best[1].total} proposals`,
      })
    }
  }

  // 2. Service bundle recommendations
  if (bundles.length > 0) {
    const bestBundle = bundles.sort((a, b) => b.winRate - a.winRate).find((b) => b.count >= 3 && b.winRate > winRates.overall * 1.3)
    if (bestBundle) {
      recommendations.push({
        priority: "high",
        category: "services",
        insight: `"${bestBundle.services.join(" + ")}" bundle wins at ${(bestBundle.winRate * 100).toFixed(0)}%`,
        action: `Actively propose this combination to appropriate clients`,
        expectedImpact: `${((bestBundle.winRate - winRates.overall) * 100).toFixed(0)} points above average`,
        dataSupport: `${bestBundle.count} proposals with this combination`,
      })
    }
  }

  // 3. Team recommendations - top CE
  const ceEntries = Object.entries(analytics.ceDeep)
    .filter(([_, v]) => v.totalProposals >= 5)
    .sort((a, b) => b[1].winRate - a[1].winRate)

  if (ceEntries.length > 0) {
    const topEntry = ceEntries[0]
    if (topEntry) {
      const [topCE, stats] = topEntry
      if (stats.specializations.length > 0) {
        recommendations.push({
          priority: "medium",
          category: "team",
          insight: `${topCE} excels with ${stats.specializations.slice(0, 2).join(", ")} (${(stats.winRate * 100).toFixed(0)}% win rate)`,
          action: `Assign ${topCE} to matching opportunities`,
          expectedImpact: `${((stats.winRate - winRates.overall) * 100).toFixed(0)} points above team average`,
          dataSupport: `Based on ${stats.totalProposals} proposals`,
        })
      }
    }
  }

  // 4. Timing recommendations
  if (analytics.temporal.bestQuarter) {
    recommendations.push({
      priority: "medium",
      category: "timing",
      insight: `${analytics.temporal.bestQuarter.quarter} is your strongest quarter (${(analytics.temporal.bestQuarter.rate * 100).toFixed(0)}%)`,
      action: `Front-load pipeline for this period`,
      expectedImpact: `Seasonal advantage of ${((analytics.temporal.bestQuarter.rate - winRates.overall) * 100).toFixed(0)} points`,
      dataSupport: `${analytics.temporal.bestQuarter.count} proposals in this period`,
    })
  }

  // 5. Process recommendations based on momentum
  if (analytics.temporal.momentum === "decelerating") {
    recommendations.push({
      priority: "high",
      category: "process",
      insight: `Win rate declining: ${(analytics.temporal.rolling6Month * 100).toFixed(0)}% (6mo) vs ${(analytics.temporal.rolling12Month * 100).toFixed(0)}% (12mo)`,
      action: `Review recent losses for patterns, refresh proposal templates`,
      expectedImpact: `Arrest declining trend before it worsens`,
      dataSupport: `Momentum: ${analytics.temporal.momentumValue.toFixed(1)} percentage points`,
    })
  } else if (analytics.temporal.momentum === "accelerating") {
    recommendations.push({
      priority: "low",
      category: "process",
      insight: `Win rate improving: ${(analytics.temporal.rolling6Month * 100).toFixed(0)}% (6mo) vs ${(analytics.temporal.rolling12Month * 100).toFixed(0)}% (12mo)`,
      action: `Document what's working and double down`,
      expectedImpact: `Sustain positive momentum`,
      dataSupport: `Momentum: +${analytics.temporal.momentumValue.toFixed(1)} percentage points`,
    })
  }

  // 6. Affiliation recommendations
  const affiliations = Object.entries(winRates.byAffiliation)
    .filter(([_, v]) => v.total >= 5)
    .sort((a, b) => b[1].rate - a[1].rate)

  if (affiliations.length >= 2) {
    const best = affiliations[0]
    const worst = affiliations[affiliations.length - 1]
    if (best && worst && best[1].rate - worst[1].rate > 0.1) {
      recommendations.push({
        priority: "medium",
        category: "targeting",
        insight: `${best[0]} institutions (${(best[1].rate * 100).toFixed(0)}%) outperform ${worst[0]} (${(worst[1].rate * 100).toFixed(0)}%)`,
        action: `Focus marketing efforts on ${best[0]} prospects`,
        expectedImpact: `${((best[1].rate - worst[1].rate) * 100).toFixed(0)} point advantage`,
        dataSupport: `${best[1].total} ${best[0]} vs ${worst[1].total} ${worst[0]} proposals`,
      })
    }
  }

  // 7. Optimal proposal size
  const { small, medium, large } = analytics.serviceIntel.sizeAnalysis
  const sizes = [small, medium, large].filter((s) => s.count >= 5)
  if (sizes.length >= 2) {
    const sortedByBest = [...sizes].sort((a, b) => b.winRate - a.winRate)
    const bestSize = sortedByBest[0]
    const worstSize = sortedByBest[sortedByBest.length - 1]
    if (bestSize && worstSize && bestSize.winRate - worstSize.winRate > 0.1) {
      recommendations.push({
        priority: "medium",
        category: "services",
        insight: `Proposals with ${bestSize.label} win at ${(bestSize.winRate * 100).toFixed(0)}% vs ${(worstSize.winRate * 100).toFixed(0)}% for ${worstSize.label}`,
        action: `Aim for ${bestSize.label} when scoping proposals`,
        expectedImpact: `${((bestSize.winRate - worstSize.winRate) * 100).toFixed(0)} point improvement`,
        dataSupport: `${bestSize.count} proposals in optimal range`,
      })
    }
  }

  // Sort by priority and limit
  return recommendations
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
    .slice(0, 6)
}

/**
 * Calculate win rates by various dimensions
 */
export function calculateWinRates(proposals: Proposal[]): {
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
      const entry = dimension[key]
      if (entry) {
        entry.rate = entry.total > 0 ? entry.won / entry.total : 0
      }
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
 * Build rich context for the AI (ENHANCED with Phase 2 superpowers + Pipeline data)
 */
async function buildContext(proposals: Proposal[], query: string = ""): Promise<string> {
  const winRates = calculateWinRates(proposals)
  const bundles = calculateServiceBundles(proposals)
  const analytics = calculateAdvancedAnalytics(proposals)
  const pendingScores = scorePendingProposals(proposals)
  const recommendations = generateRecommendations(proposals)

  // Get pipeline data (RFP intake/triage decisions)
  let pipelineStats = null
  try {
    pipelineStats = await getPipelineStats()
  } catch (err) {
    console.log("[ProposalAI] Pipeline stats not available:", err instanceof Error ? err.message : String(err))
  }

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

  // Base context
  let context = `
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

===== ADVANCED ANALYTICS (PHASE 2) =====

TEMPORAL TRENDS:
- Rolling 6-month win rate: ${formatRate(analytics.temporal.rolling6Month)}
- Rolling 12-month win rate: ${formatRate(analytics.temporal.rolling12Month)}
- Momentum: ${analytics.temporal.momentum.toUpperCase()} (${analytics.temporal.momentumValue > 0 ? "+" : ""}${analytics.temporal.momentumValue.toFixed(1)} pts)
${analytics.temporal.yoyComparison ? `- Year-over-Year: ${analytics.temporal.yoyComparison.currentYear.year} (${formatRate(analytics.temporal.yoyComparison.currentYear.rate)}) vs ${analytics.temporal.yoyComparison.previousYear.year} (${formatRate(analytics.temporal.yoyComparison.previousYear.rate)}) = ${analytics.temporal.yoyComparison.change > 0 ? "+" : ""}${analytics.temporal.yoyComparison.change.toFixed(1)} pts` : ""}
${analytics.temporal.bestQuarter ? `- Best Quarter: ${analytics.temporal.bestQuarter.quarter} (${formatRate(analytics.temporal.bestQuarter.rate)}, ${analytics.temporal.bestQuarter.count} proposals)` : ""}
${analytics.temporal.worstQuarter ? `- Weakest Quarter: ${analytics.temporal.worstQuarter.quarter} (${formatRate(analytics.temporal.worstQuarter.rate)}, ${analytics.temporal.worstQuarter.count} proposals)` : ""}
${analytics.temporal.bestMonth ? `- Best Month: ${analytics.temporal.bestMonth.month} (${formatRate(analytics.temporal.bestMonth.rate)}, ${analytics.temporal.bestMonth.count} proposals)` : ""}
- Seasonality: ${analytics.temporal.seasonalityPattern}

QUARTERLY WIN RATES:
${Object.entries(analytics.temporal.byQuarter)
  .sort((a, b) => b[0].localeCompare(a[0]))
  .slice(0, 8)
  .map(([q, v]) => `- ${q}: ${formatRate(v.rate)} (${v.won}/${v.total})`)
  .join("\n") || "No data"}

ACCOUNT EXECUTIVE DEEP ANALYSIS:
${Object.entries(analytics.ceDeep)
  .sort((a, b) => b[1].totalProposals - a[1].totalProposals)
  .slice(0, 8)
  .map(([ce, stats]) =>
    `- ${ce}: ${formatRate(stats.winRate)} overall (${stats.wonCount}/${stats.totalProposals}), Recent: ${formatRate(stats.recentWinRate)}, Trend: ${stats.trend}${stats.specializations.length > 0 ? `, Excels with: ${stats.specializations.join(", ")}` : ""}`
  )
  .join("\n") || "No data"}

SERVICE INTELLIGENCE:
- Optimal proposal size: ${analytics.serviceIntel.sizeAnalysis.optimalSize}
- Small (1-2 services): ${formatRate(analytics.serviceIntel.sizeAnalysis.small.winRate)} (${analytics.serviceIntel.sizeAnalysis.small.count} proposals)
- Medium (3-5 services): ${formatRate(analytics.serviceIntel.sizeAnalysis.medium.winRate)} (${analytics.serviceIntel.sizeAnalysis.medium.count} proposals)
- Large (6+ services): ${formatRate(analytics.serviceIntel.sizeAnalysis.large.winRate)} (${analytics.serviceIntel.sizeAnalysis.large.count} proposals)
${analytics.serviceIntel.emergingServices.length > 0 ? `- Emerging services (growing): ${analytics.serviceIntel.emergingServices.join(", ")}` : ""}
${analytics.serviceIntel.decliningServices.length > 0 ? `- Declining services: ${analytics.serviceIntel.decliningServices.join(", ")}` : ""}

TRIPLE SERVICE BUNDLES (high-performing combinations):
${analytics.serviceIntel.tripleBundles.slice(0, 5).map((b) => `- ${b.services.join(" + ")}: ${formatRate(b.winRate)} (${b.count} proposals)`).join("\n") || "Not enough data"}

PENDING PROPOSALS WITH WIN PROBABILITY:
${pendingScores.slice(0, 10).map((p) =>
  `- ${p.client || "Unknown"} (${p.category || "Unknown"}): ${p.probability}% - ${p.recommendation}${p.similarWins.length > 0 ? ` | Similar wins: ${p.similarWins.map(s => s.client).join(", ")}` : ""}`
).join("\n") || "No pending proposals"}

STRATEGIC RECOMMENDATIONS (auto-generated):
${recommendations.map((r, i) =>
  `${i + 1}. [${r.priority.toUpperCase()}] ${r.category}: ${r.insight}
   → Action: ${r.action}
   → Impact: ${r.expectedImpact}
   → Data: ${r.dataSupport}`
).join("\n\n") || "Insufficient data for recommendations"}

RECENT PROPOSALS (last 15):
${proposals
  .slice(0, 15)
  .map(
    (p) => {
      const links = p.documentLinks && typeof p.documentLinks === 'object'
        ? Object.entries(p.documentLinks as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("; ")
        : ""
      return `- ${p.client || "Unknown client"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}): ${p.won || "Unknown"}${p.rfpNumber ? ` | RFP#: ${p.rfpNumber}` : ""} - ${(p.servicesOffered || []).slice(0, 3).join(", ") || "No services listed"}${links ? ` | Links: ${links}` : ""}`
    }
  )
  .join("\n")}

PROPOSALS WITH RFP NUMBERS:
${proposals
  .filter((p) => p.rfpNumber && p.rfpNumber.trim())
  .slice(0, 20)
  .map((p) => `- ${p.client || "Unknown"}: RFP# ${p.rfpNumber} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) - ${p.won || "Unknown"}`)
  .join("\n") || "No RFP numbers found in data"}

PROPOSALS WITH DOCUMENT LINKS:
${proposals
  .filter((p) => {
    const links = p.documentLinks as Record<string, string> | null
    return links && Object.keys(links).length > 0
  })
  .slice(0, 15)
  .map((p) => {
    const links = p.documentLinks as Record<string, string>
    const linkList = Object.entries(links).map(([name, path]) => `${name}: ${path}`).join("; ")
    return `- ${p.client || "Unknown"} [${p.category || ""}]: ${linkList}`
  })
  .join("\n") || "No document links found in data"}
`

  // Add raw data fields if query seems to want them
  if (detectRawDataQuery(query)) {
    const allFields = getAllRawDataFields(proposals)
    context += `

===== RAW DATA ACCESS =====

AVAILABLE RAW DATA FIELDS (${allFields.length} fields):
${allFields.slice(0, 50).join(", ")}${allFields.length > 50 ? "..." : ""}

SAMPLE RAW DATA (first 3 proposals with raw data):
${proposals
  .filter((p) => p.rawData)
  .slice(0, 3)
  .map((p) => {
    const raw = typeof p.rawData === "string" ? JSON.parse(p.rawData) : p.rawData
    const entries = Object.entries(raw).slice(0, 10)
    return `- ${p.client || "Unknown"}: ${entries.map(([k, v]) => `${k}="${String(v).substring(0, 30)}"`).join(", ")}`
  })
  .join("\n") || "No raw data available"}
`
  }

  // Add pipeline data (RFP intake/triage decisions) if available
  if (pipelineStats && pipelineStats.total > 0) {
    const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`

    // Sort pass reasons by frequency
    const sortedPassReasons = Object.entries(pipelineStats.passReasons)
      .sort((a, b) => b[1] - a[1])

    // Sort years by most recent first
    const sortedYears = Object.entries(pipelineStats.byYear)
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .slice(0, 5) // Last 5 years

    // Sort CEs by volume
    const sortedCEs = Object.entries(pipelineStats.byCE)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)

    context += `

===== PIPELINE ACTIVITY (RFP Intake/Triage) =====

This data shows all RFPs reviewed and the decision to pursue ("Processed") or decline ("Passing").

OVERALL PIPELINE METRICS:
- Total RFPs Reviewed: ${pipelineStats.total}
- Processed (Pursued): ${pipelineStats.processed} (${formatPercent(pipelineStats.pursuitRate)} pursuit rate)
- Passed (Declined): ${pipelineStats.passing}
- Cancelled: ${pipelineStats.cancelled}
- Under Review: ${pipelineStats.reviewing}

REASONS FOR PASSING (extracted from notes):
${sortedPassReasons.map(([reason, count]) => {
  const pct = pipelineStats.passing > 0 ? (count / pipelineStats.passing) * 100 : 0
  return `- ${reason}: ${count} (${pct.toFixed(0)}% of passes)`
}).join("\n") || "No pass reason data"}

PIPELINE BY YEAR:
${sortedYears.map(([year, stats]) => {
  const pursuitRate = stats.total > 0 ? stats.processed / stats.total : 0
  return `- ${year}: ${stats.total} RFPs reviewed, ${stats.processed} processed (${formatPercent(pursuitRate)} pursuit rate)`
}).join("\n") || "No yearly data"}

PIPELINE BY ACCOUNT EXECUTIVE:
${sortedCEs.map(([ce, stats]) => {
  const pursuitRate = stats.total > 0 ? stats.processed / stats.total : 0
  return `- ${ce}: ${stats.total} reviewed, ${stats.processed} processed (${formatPercent(pursuitRate)} pursuit rate)`
}).join("\n") || "No CE data"}

RECENT RFP INTAKE (last 20):
${pipelineStats.recentEntries.slice(0, 20).map(e => {
  const date = e.dateReceived ? new Date(e.dateReceived).toISOString().split("T")[0] : "N/A"
  const extra = e.extraInfo ? ` - "${e.extraInfo.substring(0, 50)}${e.extraInfo.length > 50 ? "..." : ""}"` : ""
  return `- [${date}] ${e.client || "Unknown"}: ${e.decision || "Unknown"}${extra}`
}).join("\n") || "No recent entries"}
`
  }

  return context.trim()
}

/**
 * System prompt for proposal insights AI (ENHANCED with Phase 2 superpowers)
 */
const SYSTEM_PROMPT = `You are a Proposal Analytics Assistant for a professional services company that provides marketing, research, and branding services to educational institutions.

Your job is to analyze historical proposal data and provide actionable insights. You have access to ADVANCED ANALYTICS including:
- Temporal trends (quarterly, monthly, YoY, momentum, seasonality)
- Deep account executive analysis (specializations, trends, performance)
- Service intelligence (bundles, optimal proposal size, emerging/declining services)
- Predictive scoring for pending proposals (win probability based on historical patterns)
- Auto-generated strategic recommendations
- Raw data access (all spreadsheet fields)
- PIPELINE DATA: RFP intake/triage decisions showing pursuit rates, pass reasons, and selectivity metrics

PIPELINE CONTEXT: The pipeline data shows ALL RFPs reviewed (not just ones you pursued). This reveals:
- How selective you are (pursuit rate = % of opportunities you pursue)
- Why you decline opportunities (budget, incumbent, HUB requirements, etc.)
- Workload by account executive

CRITICAL RULES:
1. ONLY use statistics from the provided data - NEVER make up numbers
2. Be specific with percentages and counts when available
3. If asked about something not in the data, clearly say so
4. Provide actionable, strategic insights when possible
5. Keep responses concise but informative (aim for 150-300 words)
6. Use bullet points for clarity when listing multiple items
7. Compare segments when relevant (e.g., "Community colleges win at 45% vs 30% for universities")
8. Highlight notable patterns, outliers, or trends
9. When discussing momentum or trends, explain what they mean practically
10. For pending proposals, reference the win probability scores and similar past wins
11. When giving recommendations, cite the auto-generated insights as supporting evidence

SPECIAL CAPABILITIES:
- If asked about trends/momentum, use the TEMPORAL TRENDS section
- If asked about specific people/AEs, use the ACCOUNT EXECUTIVE DEEP ANALYSIS
- If asked about pending deals, use PENDING PROPOSALS WITH WIN PROBABILITY
- If asked for recommendations, use STRATEGIC RECOMMENDATIONS as a starting point
- If asked about specific fields or raw data, use the RAW DATA ACCESS section
- If asked about RFP numbers, use the PROPOSALS WITH RFP NUMBERS section
- If asked about document links, URLs, paths, or proposal files, use the PROPOSALS WITH DOCUMENT LINKS section

RESPONSE FORMAT:
Provide a clear, direct answer to the user's question. Use markdown formatting:
- Bold for emphasis on key numbers
- Bullet points for lists
- Short paragraphs for explanations

VISUALIZATIONS:${CHART_PROMPT}

At the end of your response, include exactly 3-4 follow-up questions the user might want to ask next.
Format them EXACTLY like this (on a new line after your answer):

FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

Make follow-ups:
1. Contextual to what was just discussed
2. Progressively deeper or lead to adjacent analysis
3. At least one should lead toward actionable recommendations
4. Consider suggesting predictive insights or trend analysis when relevant`

/**
 * Parse follow-up prompts from AI response
 */
function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch && followUpMatch[1]) {
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
 * Query the Proposal Insights AI (ENHANCED with Phase 2 superpowers)
 */
export async function queryProposalInsights(query: string): Promise<ProposalInsightResult> {
  const openai = getOpenAI()

  const emptyResult: ProposalInsightResult = {
    response: "",
    dataUsed: {
      totalProposals: 0,
      dateRange: { from: null, to: null },
      overallWinRate: 0,
      wonCount: 0,
      lostCount: 0,
      pendingCount: 0,
      byCategory: {},
      momentum: "steady",
      rolling6Month: 0,
      rolling12Month: 0,
      yoyChange: null,
    },
    followUpPrompts: [],
    recommendations: [],
    pendingScores: [],
    refused: true,
    refusalReason: "",
  }

  if (!openai) {
    return {
      ...emptyResult,
      refusalReason: "AI service not configured. Please set OPENAI_API_KEY in your environment.",
    }
  }

  try {
    // Get all proposal data
    const proposals = await getAllProposals()

    if (proposals.length === 0) {
      return {
        ...emptyResult,
        refusalReason:
          "No proposal data found. Please configure PROPOSAL_SUMMARY_PATH and sync your Proposal Summary Excel file.",
      }
    }

    // Build enhanced context with query for raw data detection
    const context = await buildContext(proposals, query)
    const winRates = calculateWinRates(proposals)
    const analytics = calculateAdvancedAnalytics(proposals)
    const pendingScores = scorePendingProposals(proposals)
    const recommendations = generateRecommendations(proposals)

    // Date range for response
    const dates = proposals.filter((p) => p.date).map((p) => new Date(p.date!))
    const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null

    // Call GPT-4o with enhanced context
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
      max_tokens: 2000, // Increased for more detailed responses
    })

    const rawResponse = completion.choices[0]?.message?.content || ""
    const { cleanResponse, prompts } = parseFollowUpPrompts(rawResponse)
    const { cleanText: finalResponse, chartData } = parseChartData(cleanResponse)

    // Count proposals per category
    const byCategory: { [key: string]: number } = {}
    proposals.forEach((p) => {
      if (p.category) {
        byCategory[p.category] = (byCategory[p.category] || 0) + 1
      }
    })

    return {
      response: finalResponse,
      chartData: chartData || undefined,
      dataUsed: {
        totalProposals: proposals.length,
        dateRange: { from: minDate, to: maxDate },
        overallWinRate: winRates.overall,
        wonCount: winRates.wonCount,
        lostCount: winRates.lostCount,
        pendingCount: winRates.pendingCount,
        byCategory,
        // Phase 2: Advanced metrics
        momentum: analytics.temporal.momentum,
        rolling6Month: analytics.temporal.rolling6Month,
        rolling12Month: analytics.temporal.rolling12Month,
        yoyChange: analytics.temporal.yoyComparison?.change ?? null,
      },
      followUpPrompts: prompts,
      // Phase 2: Strategic insights
      recommendations,
      pendingScores: pendingScores.slice(0, 10).map((p) => ({
        client: p.client,
        category: p.category,
        probability: p.probability,
        recommendation: p.recommendation,
      })),
      refused: false,
    }
  } catch (error) {
    console.error("Proposal AI query failed:", error)

    return {
      ...emptyResult,
      refusalReason: "An error occurred while analyzing proposals. Please try again.",
    }
  }
}

/**
 * Stream Proposal Insights via SSE
 */
export async function streamProposalInsights(
  query: string,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  const proposals = await getAllProposals()

  if (proposals.length === 0) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "No proposal data found." })}\n\n`)
    res.end()
    return
  }

  const context = await buildContext(proposals, query)
  const winRates = calculateWinRates(proposals)
  const analytics = calculateAdvancedAnalytics(proposals)

  const dates = proposals.filter((p) => p.date).map((p) => new Date(p.date!))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null

  const byCategory: { [key: string]: number } = {}
  proposals.forEach((p) => {
    if (p.category) {
      byCategory[p.category] = (byCategory[p.category] || 0) + 1
    }
  })

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n--- PROPOSAL DATA ---\n${context}` },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.4,
    maxTokens: 2000,
    metadata: {
      dataUsed: {
        totalProposals: proposals.length,
        dateRange: { from: minDate, to: maxDate },
        overallWinRate: winRates.overall,
        wonCount: winRates.wonCount,
        lostCount: winRates.lostCount,
        pendingCount: winRates.pendingCount,
        byCategory,
        momentum: analytics.temporal.momentum,
        rolling6Month: analytics.temporal.rolling6Month,
        rolling12Month: analytics.temporal.rolling12Month,
        yoyChange: analytics.temporal.yoyComparison?.change ?? null,
      },
    },
    parseFollowUpPrompts,
    res,
  })
}

/**
 * Get structured proposal metrics for the Library data browser.
 * Reuses calculateWinRates — no AI involved.
 */
export async function getProposalMetrics() {
  const proposals = await getAllProposals()
  if (!proposals || proposals.length === 0) {
    return null
  }

  const winRates = calculateWinRates(proposals)

  // Date range
  const dates = proposals
    .map(p => p.date ? new Date(p.date) : null)
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())

  return {
    summary: {
      total: proposals.length,
      won: winRates.wonCount,
      lost: winRates.lostCount,
      pending: winRates.pendingCount,
      winRate: Math.round(winRates.overall * 100),
      dateRange: {
        from: dates[0]?.toISOString() || null,
        to: dates[dates.length - 1]?.toISOString() || null,
      },
    },
    byService: winRates.byService,
    byCE: winRates.byCE,
    bySchoolType: winRates.bySchoolType,
    byYear: winRates.byYear,
    byAffiliation: winRates.byAffiliation,
    byCategory: winRates.byCategory,
  }
}
