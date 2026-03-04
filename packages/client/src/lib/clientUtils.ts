/**
 * Client name matching utilities for ClientPortfolio.
 * All data types store client names as raw strings — this normalizes them for fuzzy matching.
 */

import type {
  CaseStudy,
  TopLineResult,
  Award,
  Testimonial,
} from "@/data/clientSuccessData"
import type {
  ClientSuccessTestimonialResponse,
  ClientSuccessAwardResponse,
} from "@/lib/api"

export interface ClientSuccessEntryDB {
  id: string
  client: string
  category: string
  focus: string
  challenge: string | null
  solution: string | null
  metrics: { label: string; value: string }[]
  testimonialQuote: string | null
  testimonialAttribution: string | null
  usageCount: number
  createdAt: string
}

export interface ClientSuccessResultDB {
  id: string
  metric: string
  result: string
  client: string
  numericValue: number
  direction: "increase" | "decrease"
  usageCount: number
  createdAt: string
}

export interface ProposalSummary {
  id: string
  date: string | null
  ce: string | null
  client: string | null
  projectType: string | null
  won: "Yes" | "No" | "Pending" | "Cancelled" | null
  category: string | null
  servicesOffered: string[]
  sheetName: string | null
}

export interface ClientProfileResponse {
  caseStudies: ClientSuccessEntryDB[]
  results: ClientSuccessResultDB[]
  testimonials: ClientSuccessTestimonialResponse[]
  awards: ClientSuccessAwardResponse[]
  proposals: ProposalSummary[]
}

// ─── Name normalization ───────────────────────────────────────────

export function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function namesMatch(a: string, b: string): boolean {
  return a === b || normalizeClientName(a) === normalizeClientName(b)
}

// ─── Hardcoded data matching ─────────────────────────────────────

export function matchHardcodedCaseStudies(clientName: string, caseStudies: CaseStudy[]): CaseStudy[] {
  return caseStudies.filter(cs => namesMatch(cs.client, clientName))
}

export function matchHardcodedResults(clientName: string, results: TopLineResult[]): TopLineResult[] {
  return results.filter(r => namesMatch(r.client, clientName))
}

export function matchHardcodedTestimonials(clientName: string, testimonials: Testimonial[]): Testimonial[] {
  return testimonials.filter(t => namesMatch(t.organization, clientName))
}

export function matchHardcodedAwards(clientName: string, awards: Award[]): Award[] {
  return awards.filter(a => namesMatch(a.clientOrProject, clientName))
}

// ─── Asset count computation for the left panel ──────────────────

export interface ClientAssetCounts {
  caseStudies: number
  results: number
  testimonials: number
  awards: number
  proposals: number
  total: number
}

export function computeClientCounts(
  clientName: string,
  data: {
    hardcodedCaseStudies: CaseStudy[]
    hardcodedResults: TopLineResult[]
    hardcodedTestimonials: Testimonial[]
    hardcodedAwards: Award[]
    dbTestimonials: ClientSuccessTestimonialResponse[]
    dbAwards: ClientSuccessAwardResponse[]
    dbEntries: ClientSuccessEntryDB[]
    dbResults: ClientSuccessResultDB[]
  },
  winRateData?: ClientWinRateData
): ClientAssetCounts {
  const caseStudies =
    matchHardcodedCaseStudies(clientName, data.hardcodedCaseStudies).length +
    data.dbEntries.filter(e => namesMatch(e.client, clientName)).length

  const results =
    matchHardcodedResults(clientName, data.hardcodedResults).length +
    data.dbResults.filter(r => namesMatch(r.client, clientName)).length

  const testimonials =
    matchHardcodedTestimonials(clientName, data.hardcodedTestimonials).length +
    data.dbTestimonials.filter(t => namesMatch(t.organization, clientName)).length

  const awards =
    matchHardcodedAwards(clientName, data.hardcodedAwards).length +
    data.dbAwards.filter(a =>
      namesMatch(a.companyName || a.clientOrProject || "", clientName)
    ).length

  const proposals = winRateData?.total ?? 0

  return {
    caseStudies,
    results,
    testimonials,
    awards,
    proposals,
    total: caseStudies + results + testimonials + awards + proposals,
  }
}

// ─── Client Health Score ──────────────────────────────────────────

export type ClientTier = "champion" | "active" | "dormant" | "new"

export interface ClientHealthScore {
  score: number        // 0–100
  winRate: number      // 0–100 percentage
  tier: ClientTier
  lastProposalDate: string | null
  proposalCount: number
}

export interface ClientWinRateData {
  won: number
  total: number
  lost: number
  pending: number
  rate: number
  lastProposalDate: string | null
}

export function computeClientHealthScore(
  counts: ClientAssetCounts,
  winRateData?: ClientWinRateData
): ClientHealthScore {
  const total = winRateData?.total ?? 0
  const won = winRateData?.won ?? 0
  const winRate = winRateData?.rate ?? 0

  // Win rate: 0–40 pts
  const winPts = total > 0 ? Math.round((won / total) * 40) : 0

  // Asset richness: 0–30 pts (2 pts per asset, capped)
  const assetPts = Math.min(counts.total * 2, 30)

  // Recency: 0–20 pts (full if last proposal < 6 months ago, 0 if > 3 years)
  let recencyPts = 0
  if (winRateData?.lastProposalDate) {
    const daysSince = (Date.now() - new Date(winRateData.lastProposalDate).getTime()) / (1000 * 60 * 60 * 24)
    recencyPts = Math.max(0, Math.round(20 - daysSince / 18))
  }

  // Engagement: 0–10 pts
  const engagePts = Math.min(counts.testimonials * 3 + counts.awards * 2, 10)

  const score = Math.min(100, winPts + assetPts + recencyPts + engagePts)

  let tier: ClientTier
  if (score >= 80) tier = "champion"
  else if (score >= 50) tier = "active"
  else if (score >= 20 || total > 0) tier = "dormant"
  else tier = "new"

  return {
    score,
    winRate,
    tier,
    lastProposalDate: winRateData?.lastProposalDate ?? null,
    proposalCount: total,
  }
}
