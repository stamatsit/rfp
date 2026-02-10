import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "crypto"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
import { pgTable, text, timestamp, uuid, integer, boolean, primaryKey } from "drizzle-orm/pg-core"
import { eq, ilike, or, desc, sql, and, isNull } from "drizzle-orm"
import OpenAI from "openai"
import bcrypt from "bcryptjs"
import { clientSuccessData } from "../packages/server/src/data/clientSuccessData.js"

// --- Streaming helpers ---
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function truncateHistory(messages: Array<{ role: string; content: string }>, maxTokens = 12000) {
  let total = 0
  const result: typeof messages = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content)
    if (total + tokens > maxTokens) break
    total += tokens
    result.unshift(messages[i])
  }
  return result
}

function parseChartData(response: string): { cleanText: string; chartData: Record<string, unknown> | null } {
  const chartMatch = response.match(/CHART_DATA:\s*(\{[\s\S]*?\})\s*$/m)
  if (chartMatch?.[1]) {
    try {
      const chartData = JSON.parse(chartMatch[1])
      if (chartData.type && chartData.data && Array.isArray(chartData.data) && chartData.xKey && chartData.yKeys) {
        const cleanText = response.replace(/CHART_DATA:\s*\{[\s\S]*?\}\s*$/m, "").trim()
        return { cleanText, chartData }
      }
    } catch { /* ignore malformed */ }
  }
  return { cleanText: response, chartData: null }
}

const CHART_PROMPT = `
When your response discusses quantitative comparisons, trends, or distributions involving 3+ data points, include a visualization by appending this AFTER your response text (on a new line):
CHART_DATA: {"type":"bar","title":"Chart Title","data":[{"label":"A","value":10},{"label":"B","value":20}],"xKey":"label","yKeys":["value"]}

Chart types: "bar" (comparisons), "line" (trends over time), "pie" (proportions), "area" (cumulative trends).
Only include CHART_DATA when the data is concrete and from the provided sources — never for made-up data.
Keep data arrays under 12 items. Use short labels.`

function parseFollowUpPrompts(rawResponse: string, fallbacks: string[]): { cleanResponse: string; followUpPrompts: string[] } {
  let cleanResponse = rawResponse
  let followUpPrompts: string[] = []
  const match = rawResponse.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
  if (match && match[1]) {
    try {
      followUpPrompts = JSON.parse(`[${match[1]}]`)
      cleanResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
    } catch {
      followUpPrompts = match[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(s => s.length > 0)
      cleanResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
    }
  } else {
    followUpPrompts = fallbacks
  }
  return { cleanResponse, followUpPrompts }
}

// Cache for proposal analytics (avoids recalculating on every query)
let proposalContextCache: { key: string; timestamp: number; result: { contextString: string; systemPrompt: string } } | null = null
const PROPOSAL_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getProposalCacheKey(allProposals: any[]): string {
  const dates = allProposals.filter((p: any) => p.date).map((p: any) => new Date(p.date).getTime())
  const latest = dates.length > 0 ? Math.max(...dates) : 0
  return `${allProposals.length}:${latest}`
}

/**
 * Build rich proposals context for the AI (used by both streaming and non-streaming endpoints).
 * Computes win rates by dimension, CE deep analysis, service bundles, etc.
 * Results are cached for 5 minutes to avoid recalculating on every query.
 */
function buildProposalsContext(allProposals: any[], pipelineEntries: any[]): { contextString: string; systemPrompt: string } {
  const cacheKey = getProposalCacheKey(allProposals)
  if (proposalContextCache && proposalContextCache.key === cacheKey && Date.now() - proposalContextCache.timestamp < PROPOSAL_CACHE_TTL) {
    return proposalContextCache.result
  }
  const decided = allProposals.filter((p: any) => p.won === "Yes" || p.won === "No")
  const wonCount = decided.filter((p: any) => p.won === "Yes").length
  const lostCount = decided.filter((p: any) => p.won === "No").length
  const pendingCount = allProposals.filter((p: any) => !p.won || p.won === "Pending").length
  const overallWinRate = decided.length > 0 ? wonCount / decided.length : 0
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`

  // Date range
  const dates = allProposals.filter((p: any) => p.date).map((p: any) => new Date(p.date!))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d: Date) => d.getTime()))) : null
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d: Date) => d.getTime()))) : null

  // Count by category
  const byCategory: Record<string, number> = {}
  allProposals.forEach((p: any) => { if (p.category) byCategory[p.category] = (byCategory[p.category] || 0) + 1 })

  // Win rates by dimension helper
  const calcDimension = (accessor: (p: any) => string | null) => {
    const dim: Record<string, { won: number; total: number; rate: number }> = {}
    for (const p of decided) {
      const val = accessor(p)
      if (!val) continue
      if (!dim[val]) dim[val] = { won: 0, total: 0, rate: 0 }
      dim[val].total++
      if (p.won === "Yes") dim[val].won++
    }
    for (const k of Object.keys(dim)) dim[k].rate = dim[k].total > 0 ? dim[k].won / dim[k].total : 0
    return dim
  }

  const bySchoolType = calcDimension((p: any) => p.schoolType)
  const byAffiliation = calcDimension((p: any) => p.affiliation)
  const byCE = calcDimension((p: any) => p.ce)
  const byYear = calcDimension((p: any) => p.date ? new Date(p.date).getFullYear().toString() : null)
  const byCategoryWR = calcDimension((p: any) => p.category)

  // Win rates by service
  const byService: Record<string, { won: number; total: number; rate: number }> = {}
  for (const p of decided) {
    for (const s of ((p.servicesOffered as string[]) || [])) {
      if (!byService[s]) byService[s] = { won: 0, total: 0, rate: 0 }
      byService[s].total++
      if (p.won === "Yes") byService[s].won++
    }
  }
  for (const k of Object.keys(byService)) byService[k].rate = byService[k].total > 0 ? byService[k].won / byService[k].total : 0

  const formatDimension = (dim: Record<string, { won: number; total: number; rate: number }>, limit = 12) =>
    Object.entries(dim)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit)
      .map(([key, stats]) => `- ${key}: ${formatRate(stats.rate)} (${stats.won}/${stats.total})`)
      .join("\n")

  // CE deep analysis (team member performance)
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const ceDeep: Record<string, { winRate: number; total: number; won: number; recentRate: number; trend: string; specialties: string[] }> = {}
  const ceProposals: Record<string, any[]> = {}
  for (const p of decided) {
    if (!p.ce) continue
    if (!ceProposals[p.ce]) ceProposals[p.ce] = []
    ceProposals[p.ce].push(p)
  }
  for (const [ce, props] of Object.entries(ceProposals)) {
    const w = props.filter((p: any) => p.won === "Yes").length
    const rate = props.length > 0 ? w / props.length : 0
    const recent = props.filter((p: any) => p.date && new Date(p.date) >= twelveMonthsAgo)
    const recentWon = recent.filter((p: any) => p.won === "Yes").length
    const recentRate = recent.length > 0 ? recentWon / recent.length : 0
    let trend = "stable"
    if (recent.length >= 3) {
      const diff = recentRate - rate
      if (diff > 0.05) trend = "improving"
      else if (diff < -0.05) trend = "declining"
    }
    // Best school types
    const stCounts: Record<string, { won: number; total: number }> = {}
    for (const p of props) {
      if (p.schoolType) {
        if (!stCounts[p.schoolType]) stCounts[p.schoolType] = { won: 0, total: 0 }
        stCounts[p.schoolType].total++
        if (p.won === "Yes") stCounts[p.schoolType].won++
      }
    }
    const specialties = Object.entries(stCounts)
      .filter(([, s]) => s.total >= 3 && (s.won / s.total) > rate)
      .sort((a, b) => (b[1].won / b[1].total) - (a[1].won / a[1].total))
      .slice(0, 3)
      .map(([st]) => st)
    ceDeep[ce] = { winRate: rate, total: props.length, won: w, recentRate, trend, specialties }
  }

  // Service bundles (pairs)
  const bundleStats = new Map<string, { won: number; total: number }>()
  for (const p of decided) {
    const services = (p.servicesOffered as string[]) || []
    if (services.length < 2) continue
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const pair = [services[i], services[j]].sort().join(" + ")
        if (!bundleStats.has(pair)) bundleStats.set(pair, { won: 0, total: 0 })
        const s = bundleStats.get(pair)!
        s.total++
        if (p.won === "Yes") s.won++
      }
    }
  }
  const bundles = Array.from(bundleStats.entries())
    .map(([key, s]) => ({ services: key, count: s.total, winRate: s.total > 0 ? s.won / s.total : 0 }))
    .filter(b => b.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Rolling rates
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const last6 = decided.filter((p: any) => p.date && new Date(p.date) >= sixMonthsAgo)
  const last12 = decided.filter((p: any) => p.date && new Date(p.date) >= twelveMonthsAgo)
  const rolling6 = last6.length > 0 ? last6.filter((p: any) => p.won === "Yes").length / last6.length : 0
  const rolling12 = last12.length > 0 ? last12.filter((p: any) => p.won === "Yes").length / last12.length : 0

  // Build context string
  const lines = [
    `PROPOSAL DATA SUMMARY:`,
    `- Total Proposals: ${allProposals.length}`,
    `- Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}`,
    `- Won: ${wonCount} (${formatRate(overallWinRate)} overall win rate)`,
    `- Lost: ${lostCount}`,
    `- Pending: ${pendingCount}`,
    `- Rolling 6-month win rate: ${formatRate(rolling6)}`,
    `- Rolling 12-month win rate: ${formatRate(rolling12)}`,
    ``,
    `PROPOSALS BY CATEGORY:`,
    ...Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `- ${cat}: ${count}`),
    ``,
    `WIN RATES BY CATEGORY:`,
    formatDimension(byCategoryWR) || "No data",
    ``,
    `WIN RATES BY SCHOOL TYPE:`,
    formatDimension(bySchoolType) || "No data",
    ``,
    `WIN RATES BY AFFILIATION:`,
    formatDimension(byAffiliation) || "No data",
    ``,
    `WIN RATES BY SERVICE OFFERED:`,
    formatDimension(byService) || "No data",
    ``,
    `WIN RATES BY YEAR:`,
    formatDimension(byYear) || "No data",
    ``,
    `TEAM ROSTER (all account executives / team members):`,
    ...Object.entries(ceDeep)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([ce, s]) => `- ${ce}: ${s.total} proposals, ${s.won} won`),
    ``,
    `ACCOUNT EXECUTIVE DEEP ANALYSIS (team member performance):`,
    ...Object.entries(ceDeep)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15)
      .map(([ce, s]) =>
        `- ${ce}: ${formatRate(s.winRate)} overall (${s.won}/${s.total}), Recent 12mo: ${formatRate(s.recentRate)}, Trend: ${s.trend}${s.specialties.length > 0 ? `, Best school types: ${s.specialties.join(", ")}` : ""}`
      ),
    ``,
    `SERVICE BUNDLE ANALYSIS (pairs):`,
    ...bundles.map(b => `- ${b.services}: ${formatRate(b.winRate)} win rate (${b.count} proposals)`),
    ``,
    `RECENT PROPOSALS (last 25):`,
    ...allProposals.slice(0, 25).map((p: any) => {
      const links = p.documentLinks && typeof p.documentLinks === 'object'
        ? Object.entries(p.documentLinks as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("; ")
        : ""
      return `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}): ${p.won || "Unknown"} | CE: ${p.ce || "N/A"}${p.rfpNumber ? ` | RFP#: ${p.rfpNumber}` : ""} - ${((p.servicesOffered as string[]) || []).slice(0, 3).join(", ") || "No services"}${links ? ` | Links: ${links}` : ""}`
    }),
  ]

  // Pipeline context
  if (pipelineEntries.length > 0) {
    const pTotal = pipelineEntries.length
    const pProcessed = pipelineEntries.filter((e: any) => e.decision?.toLowerCase().includes("processed")).length
    const pPassing = pipelineEntries.filter((e: any) => e.decision?.toLowerCase().includes("pass")).length
    const pRate = pTotal > 0 ? pProcessed / pTotal : 0
    const passReasons: Record<string, number> = {}
    pipelineEntries
      .filter((e: any) => e.decision?.toLowerCase().includes("pass") && e.extraInfo)
      .forEach((e: any) => {
        const info = e.extraInfo!.toLowerCase()
        if (info.includes("budget") || info.includes("pricing")) passReasons["Budget concerns"] = (passReasons["Budget concerns"] || 0) + 1
        else if (info.includes("not a good fit")) passReasons["Not a good fit"] = (passReasons["Not a good fit"] || 0) + 1
        else if (info.includes("incumbent")) passReasons["Incumbent advantage"] = (passReasons["Incumbent advantage"] || 0) + 1
        else if (info.includes("hub") || info.includes("local")) passReasons["HUB/Local preference"] = (passReasons["HUB/Local preference"] || 0) + 1
        else if (info.includes("timeline") || info.includes("short")) passReasons["Timeline too short"] = (passReasons["Timeline too short"] || 0) + 1
        else passReasons["Other"] = (passReasons["Other"] || 0) + 1
      })
    lines.push(``, `===== PIPELINE ACTIVITY (RFP Intake/Triage) =====`)
    lines.push(`- Total RFPs Reviewed: ${pTotal}`)
    lines.push(`- Processed (Pursued): ${pProcessed} (${formatRate(pRate)} pursuit rate)`)
    lines.push(`- Passed (Declined): ${pPassing}`)
    lines.push(``)
    lines.push(`REASONS FOR PASSING:`)
    Object.entries(passReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
      const pct = pPassing > 0 ? (count / pPassing) * 100 : 0
      lines.push(`- ${reason}: ${count} (${pct.toFixed(0)}% of passes)`)
    })
    lines.push(``)
    lines.push(`RECENT RFP INTAKE (last 15):`)
    pipelineEntries.slice(0, 15).forEach((e: any) => {
      const date = e.dateReceived ? new Date(e.dateReceived).toISOString().split("T")[0] : "N/A"
      const extra = e.extraInfo ? ` - "${e.extraInfo.substring(0, 50)}${e.extraInfo.length > 50 ? "..." : ""}"` : ""
      lines.push(`- [${date}] ${e.client || "Unknown"}: ${e.decision || "Unknown"}${extra}`)
    })
  }

  const contextString = lines.join("\n")

  const systemPrompt = `You are a Proposal Analytics Assistant for Stamats, a professional services company that provides marketing, research, branding, and web services to educational institutions.

Your job is to analyze historical proposal data and provide actionable, data-rich insights. You have access to:
- Win rates by category, school type, affiliation, service, year, and account executive
- Deep team member / account executive performance analysis
- Service bundle analysis
- Rolling win rates and trends
- Pipeline data (RFP intake/triage decisions)

TERMINOLOGY MAPPING — users may use these terms interchangeably:
- "Team members", "staff", "people", "reps", "AEs" = Account Executives (the "CE" field)
- "Categories", "service types" = The category field (research, creative, digital, website, pr)
- "Deals", "opportunities", "bids" = Proposals

CRITICAL RULES:
1. ONLY use statistics from the provided data — NEVER make up numbers
2. Be specific with percentages and counts — always cite the numbers
3. If asked about something not in the data, clearly say so
4. Provide actionable, strategic insights — don't just recite stats, interpret them
5. Aim for 200-500 words — be thorough
6. Use bullet points for clarity when listing multiple items
7. Compare segments when relevant
8. When asked about team/people/AEs, always include: win rate, volume, trend, specializations
9. Use **bold** for emphasis on key numbers and names
10. Use ### section headers when covering multiple topics

At the end of your response, include 3-4 follow-up questions formatted as:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

VISUALIZATIONS:${CHART_PROMPT}

--- PROPOSAL DATA ---
${contextString}`

  const result = { contextString, systemPrompt }
  proposalContextCache = { key: cacheKey, timestamp: Date.now(), result }
  return result
}

// Schema definitions (matching actual Supabase tables)
import { jsonb } from "drizzle-orm/pg-core"

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const answerItems = pgTable("answer_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  subtopic: text("subtopic"),
  status: text("status").notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const answerItemVersions = pgTable("answer_item_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  answerItemId: uuid("answer_item_id").notNull().references(() => answerItems.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topicId: uuid("topic_id").notNull(),
  subtopic: text("subtopic"),
  status: text("status").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("local"),
})

export const photoAssets = pgTable("photo_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayTitle: text("display_title").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  status: text("status").notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  description: text("description"),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const linksAnswerPhoto = pgTable(
  "links_answer_photo",
  {
    answerItemId: uuid("answer_item_id").notNull().references(() => answerItems.id, { onDelete: "cascade" }),
    photoAssetId: uuid("photo_asset_id").notNull().references(() => photoAssets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("local"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.answerItemId, table.photoAssetId] }),
  })
)

// Proposals table (synced from Excel)
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: timestamp("date", { withTimezone: true }),
  ce: text("ce"),
  client: text("client"),
  projectType: text("project_type"),
  rfpNumber: text("rfp_number"),
  won: text("won"),
  schoolType: text("school_type"),
  affiliation: text("affiliation"),
  servicesOffered: jsonb("services_offered").$type<string[]>().default([]),
  documentLinks: jsonb("document_links").$type<Record<string, string>>(),
  fingerprint: text("fingerprint").notNull(),
  sourceRow: integer("source_row"),
  sheetName: text("sheet_name"),
  category: text("category"),
  rawData: jsonb("raw_data").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Proposal Pipeline table (RFP intake/triage log)
export const proposalPipeline = pgTable("proposal_pipeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateReceived: timestamp("date_received", { withTimezone: true }),
  ce: text("ce"),
  client: text("client"),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  decision: text("decision"),
  extraInfo: text("extra_info"),
  followUp: text("follow_up"),
  year: integer("year"),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Users table (multi-user auth)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  avatarUrl: text("avatar_url"),
  hasCompletedTour: boolean("has_completed_tour").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
})

// Conversations table (AI chat history)
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  page: text("page", { enum: ["ask-ai", "case-studies", "proposal-insights", "unified-ai"] }).notNull(),
  title: text("title").notNull(),
  messages: jsonb("messages").$type<{ role: "user" | "assistant"; content: string; timestamp: string }[]>().notNull().default([]),
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ?? ""
const queryClient = DATABASE_URL ? postgres(DATABASE_URL) : null
const db = queryClient ? drizzle(queryClient, { schema: { topics, answerItems, photoAssets, proposals, proposalPipeline, users, conversations } }) : null

// Supabase client
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim()
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? "").trim()
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

// Stateless session using signed tokens (works across serverless instances)
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "fallback-secret"

interface SessionData {
  authenticated: boolean
  userId?: string
  userName?: string
  userEmail?: string
  mustChangePassword?: boolean
  hasCompletedTour?: boolean
  avatarUrl?: string | null
  expires: number
}

async function createHmac(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return Buffer.from(signature).toString("base64url")
}

async function verifySession(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null
  try {
    const [payload, signature] = token.split(".")
    if (!payload || !signature) return null

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData
    if (decoded.expires < Date.now()) return null

    const expectedSig = await createHmac(payload)
    if (signature !== expectedSig) return null
    return decoded
  } catch {
    return null
  }
}

async function createSession(data: Omit<SessionData, "expires">): Promise<string> {
  const payload: SessionData = {
    ...data,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = await createHmac(payloadStr)
  return `${payloadStr}.${signature}`
}

// Parse cookies from request
function getCookie(req: VercelRequest, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? []
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=")
    if (key === name) return value
  }
  return undefined
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers - trim to remove any whitespace/newlines from env var
  const origin = (process.env.CORS_ORIGIN || "*").trim()
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Access-Control-Allow-Credentials", "true")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  // Parse path - handle both /api/health and /health patterns
  const rawPath = req.url?.split("?")[0] || "/"
  const path = rawPath.replace(/^\/api/, "") || "/"
  const method = req.method || "GET"
  const sessionToken = getCookie(req, "rfp-session")
  const session = await verifySession(sessionToken)
  const isAuthenticated = session?.authenticated === true

  try {
    // Health check (no auth required)
    if (path === "/health" || path === "/health/") {
      return res.json({
        status: "ok",
        database: db ? "connected" : "not configured",
        timestamp: new Date().toISOString()
      })
    }

    // Auth routes
    if (path.startsWith("/auth")) {
      if (path === "/auth/login" && method === "POST") {
        const { email, password } = req.body || {}
        if (!email || !password) {
          return res.status(400).json({ error: "Email and password are required" })
        }
        if (!db) return res.status(500).json({ error: "Database not configured" })

        const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)
        if (!user) {
          return res.status(401).json({ error: "Invalid email or password" })
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          return res.status(401).json({ error: "Invalid email or password" })
        }

        // Update last login
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))

        // Store only a URL path in session (not full base64) to keep cookie under 4KB browser limit
        const avatarUrl = user.avatarUrl ? `/api/auth/avatar/${user.id}` : null
        const newSessionToken = await createSession({
          authenticated: true,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          mustChangePassword: user.mustChangePassword,
          hasCompletedTour: user.hasCompletedTour,
          avatarUrl,
        })
        res.setHeader("Set-Cookie", `rfp-session=${newSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
        return res.json({
          success: true,
          mustChangePassword: user.mustChangePassword,
          user: { id: user.id, email: user.email, name: user.name, avatarUrl },
        })
      }

      if (path === "/auth/logout" && method === "POST") {
        res.setHeader("Set-Cookie", "rfp-session=; Path=/; HttpOnly; Secure; Max-Age=0")
        return res.json({ success: true })
      }

      if (path === "/auth/status") {
        if (!isAuthenticated || !session) {
          return res.json({ authenticated: false, user: null, mustChangePassword: false, loginTime: null })
        }
        // Always look up fresh user data from DB for name + avatar + tour status
        let userName = session.userName
        let userEmail = session.userEmail
        let avatarUrl: string | null = session.avatarUrl || null
        let hasCompletedTour = session.hasCompletedTour ?? false
        if (session.userId && db) {
          const [dbUser] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
          if (dbUser) {
            userName = dbUser.name
            userEmail = dbUser.email
            avatarUrl = dbUser.avatarUrl ? `/api/auth/avatar/${session.userId}` : null
            hasCompletedTour = dbUser.hasCompletedTour
          }
        }
        return res.json({
          authenticated: true,
          user: {
            id: session.userId,
            email: userEmail || session.userEmail,
            name: userName || userEmail || "User",
            avatarUrl,
            hasCompletedTour,
          },
          mustChangePassword: session.mustChangePassword || false,
          loginTime: null,
        })
      }

      if (path === "/auth/change-password" && method === "POST") {
        if (!isAuthenticated || !session?.userId || !db) {
          return res.status(401).json({ error: "Authentication required" })
        }
        const { currentPassword, newPassword } = req.body || {}
        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: "Current and new passwords are required" })
        }
        if (newPassword.length < 8) {
          return res.status(400).json({ error: "New password must be at least 8 characters" })
        }
        const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
        if (!user) return res.status(401).json({ error: "User not found" })
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
        if (!isValid) return res.status(401).json({ error: "Current password is incorrect" })
        const newHash = await bcrypt.hash(newPassword, 12)
        await db.update(users).set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id))
        // Issue new session token with mustChangePassword=false
        const newSessionToken = await createSession({
          authenticated: true,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          mustChangePassword: false,
          hasCompletedTour: user.hasCompletedTour,
          avatarUrl: user.avatarUrl ? `/api/auth/avatar/${user.id}` : null,
        })
        res.setHeader("Set-Cookie", `rfp-session=${newSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
        return res.json({ success: true })
      }

      // Complete tour
      if (path === "/auth/complete-tour" && method === "POST") {
        if (!isAuthenticated || !session?.userId || !db) {
          return res.status(401).json({ error: "Authentication required" })
        }
        await db.update(users).set({ hasCompletedTour: true, updatedAt: new Date() }).where(eq(users.id, session.userId))
        const newSessionToken = await createSession({
          authenticated: true,
          userId: session.userId,
          userName: session.userName,
          userEmail: session.userEmail,
          mustChangePassword: session.mustChangePassword ?? false,
          hasCompletedTour: true,
          avatarUrl: session.avatarUrl,
        })
        res.setHeader("Set-Cookie", `rfp-session=${newSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
        return res.json({ success: true })
      }

      // Reset tour
      if (path === "/auth/reset-tour" && method === "POST") {
        if (!isAuthenticated || !session?.userId || !db) {
          return res.status(401).json({ error: "Authentication required" })
        }
        await db.update(users).set({ hasCompletedTour: false, updatedAt: new Date() }).where(eq(users.id, session.userId))
        const newSessionToken = await createSession({
          authenticated: true,
          userId: session.userId,
          userName: session.userName,
          userEmail: session.userEmail,
          mustChangePassword: session.mustChangePassword ?? false,
          hasCompletedTour: false,
          avatarUrl: session.avatarUrl,
        })
        res.setHeader("Set-Cookie", `rfp-session=${newSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
        return res.json({ success: true })
      }

      // Avatar routes
      if (path.startsWith("/auth/avatar")) {
        // GET /auth/avatar/:userId — redirect to stored avatar
        const avatarMatch = path.match(/^\/auth\/avatar\/([^/]+)$/)
        if (avatarMatch && method === "GET") {
          const userId = avatarMatch[1]
          if (!db) return res.status(500).json({ error: "Database not configured" })
          const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
          if (!u?.avatarUrl) return res.status(404).json({ error: "No avatar" })
          // avatarUrl is a data URL (data:image/webp;base64,...) — serve the bytes directly
          const dataUrlMatch = u.avatarUrl.match(/^data:(image\/\w+);base64,(.+)$/)
          if (dataUrlMatch) {
            const mimeType = dataUrlMatch[1]
            const buffer = Buffer.from(dataUrlMatch[2], "base64")
            res.setHeader("Content-Type", mimeType)
            res.setHeader("Cache-Control", "public, max-age=3600")
            return res.send(buffer)
          }
          // Fallback: if it's a regular URL, redirect
          return res.redirect(302, u.avatarUrl)
        }

        // POST /auth/avatar — upload to Supabase storage
        // Accepts JSON: { image: "data:image/webp;base64,..." } or { image: "<base64>" }
        if (method === "POST") {
          if (!isAuthenticated || !session?.userId) {
            return res.status(401).json({ error: "Authentication required" })
          }
          if (!db) {
            return res.status(500).json({ error: "Database not configured" })
          }

          const { image } = req.body || {}
          if (!image || typeof image !== "string") {
            return res.status(400).json({ error: "Expected JSON body with 'image' as base64 data URL" })
          }

          // Parse data URL: "data:image/webp;base64,AAAA..."
          const dataUrlMatch = image.match(/^data:(image\/\w+);base64,(.+)$/)
          let fileMimeType = "image/webp"
          let base64Data: string
          if (dataUrlMatch) {
            fileMimeType = dataUrlMatch[1]
            base64Data = dataUrlMatch[2]
          } else {
            // Assume raw base64
            base64Data = image
          }

          const fileBuffer = Buffer.from(base64Data, "base64")
          if (fileBuffer.length === 0) {
            return res.status(400).json({ error: "Empty image data" })
          }
          if (fileBuffer.length > 2 * 1024 * 1024) {
            return res.status(400).json({ error: "File too large (max 2MB)" })
          }

          // Store as data URL directly in DB (small cropped images, typically <50KB)
          const dataUrl = `data:${fileMimeType};base64,${fileBuffer.toString("base64")}`
          await db.update(users).set({ avatarUrl: dataUrl, updatedAt: new Date() }).where(eq(users.id, session.userId))

          return res.json({ success: true, avatarUrl: `/api/auth/avatar/${session.userId}` })
        }

        // DELETE /auth/avatar — clear from DB
        if (method === "DELETE") {
          if (!isAuthenticated || !session?.userId) {
            return res.status(401).json({ error: "Authentication required" })
          }
          if (!db) {
            return res.status(500).json({ error: "Database not configured" })
          }

          await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, session.userId))

          return res.json({ success: true })
        }

        return res.status(405).json({ error: "Method not allowed" })
      }
    }

    // All other routes require authentication
    if (!isAuthenticated) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    if (!db) {
      return res.status(500).json({ error: "Database not configured" })
    }

    // Topics routes
    if (path === "/topics" || path === "/topics/") {
      if (method === "GET") {
        const allTopics = await db.select().from(topics).orderBy(topics.name)
        return res.json(allTopics)
      }
      if (method === "POST") {
        const { name, displayName } = req.body || {}
        const [newTopic] = await db.insert(topics).values({ name, displayName: displayName || name }).returning()
        return res.json(newTopic)
      }
    }

    // Answers routes
    if (path === "/answers" || path === "/answers/") {
      if (method === "GET") {
        const allAnswers = await db.select().from(answerItems).orderBy(desc(answerItems.createdAt))
        return res.json(allAnswers)
      }
    }

    // PUT /answers/:id - update answer
    const answerUpdateMatch = path.match(/^\/answers\/([^/]+)$/)
    if (answerUpdateMatch && method === "PUT") {
      const answerId = answerUpdateMatch[1]
      const { question, answer, topicId, subtopic, status, tags } = req.body || {}

      const [existing] = await db.select().from(answerItems).where(eq(answerItems.id, answerId))
      if (!existing) return res.status(404).json({ error: "Answer not found" })

      // Build update object
      const updates: Record<string, unknown> = {}
      if (question !== undefined && question !== existing.question) updates.question = question.trim()
      if (answer !== undefined && answer !== existing.answer) updates.answer = answer.trim()
      if (topicId !== undefined && topicId !== existing.topicId) updates.topicId = topicId
      if (subtopic !== undefined && subtopic !== existing.subtopic) updates.subtopic = subtopic?.trim()
      if (status !== undefined && status !== existing.status) updates.status = status
      if (tags !== undefined) {
        const normalized = [...new Set(tags.map((t: string) => t.toLowerCase().trim()).filter((t: string) => t.length > 0))]
        if (JSON.stringify(normalized) !== JSON.stringify(existing.tags)) updates.tags = normalized
      }

      // Regenerate fingerprint if question or topic changed
      let topicName: string | undefined
      if (topicId && topicId !== existing.topicId) {
        const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
        if (!topic) return res.status(400).json({ error: "Invalid topic ID" })
        topicName = topic.name
      } else if (question && question.trim() !== existing.question) {
        const [topic] = await db.select().from(topics).where(eq(topics.id, existing.topicId))
        if (topic) topicName = topic.name
      }
      if (topicName) {
        const normalizedQ = (updates.question as string ?? existing.question).toLowerCase().trim().replace(/\s+/g, " ")
        const normalizedT = topicName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
        updates.fingerprint = crypto.createHash("sha256").update(`${normalizedQ}|${normalizedT}`).digest("hex").slice(0, 16)
      }

      if (Object.keys(updates).length === 0) return res.json(existing)

      updates.updatedAt = new Date()
      const [updated] = await db.update(answerItems).set(updates).where(eq(answerItems.id, answerId)).returning()

      // Create version record
      if (updated) {
        const [maxV] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(version_number), 0)` }).from(answerItemVersions).where(eq(answerItemVersions.answerItemId, answerId))
        const nextVersion = (maxV?.maxVersion ?? 0) + 1
        await db.insert(answerItemVersions).values({
          answerItemId: updated.id,
          question: updated.question,
          answer: updated.answer,
          topicId: updated.topicId,
          subtopic: updated.subtopic,
          status: updated.status,
          tags: updated.tags,
          versionNumber: nextVersion,
          createdBy: session?.userName ?? "unknown",
        })
      }

      return res.json(updated)
    }

    // GET /answers/:id/versions - get version history
    const answerVersionsMatch = path.match(/^\/answers\/([^/]+)\/versions$/)
    if (answerVersionsMatch && method === "GET") {
      const answerId = answerVersionsMatch[1]
      const [existing] = await db.select().from(answerItems).where(eq(answerItems.id, answerId))
      if (!existing) return res.status(404).json({ error: "Answer not found" })
      const versions = await db.select().from(answerItemVersions)
        .where(eq(answerItemVersions.answerItemId, answerId))
        .orderBy(answerItemVersions.versionNumber)
      return res.json(versions)
    }

    // DELETE /answers/:id - delete answer
    const answerDeleteMatch = path.match(/^\/answers\/([^/]+)$/)
    if (answerDeleteMatch && method === "DELETE") {
      const answerId = answerDeleteMatch[1]
      const [existing] = await db.select().from(answerItems).where(eq(answerItems.id, answerId))
      if (!existing) return res.status(404).json({ error: "Answer not found" })
      await db.delete(answerItems).where(eq(answerItems.id, answerId))
      return res.json({ success: true, message: "Answer deleted successfully" })
    }

    // Search routes
    if (path.startsWith("/search")) {
      // GET /search/answers - list/search answers
      if ((path === "/search/answers" || path === "/search/answers/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 0

        let queryBuilder = db.select().from(answerItems)

        const conditions = []
        if (query) {
          conditions.push(or(
            ilike(answerItems.question, `%${query}%`),
            ilike(answerItems.answer, `%${query}%`)
          ))
        }
        if (topicId) {
          conditions.push(eq(answerItems.topicId, topicId))
        }
        if (status) {
          conditions.push(eq(answerItems.status, status))
        }

        let results
        if (conditions.length > 0) {
          const whereClause = conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions.slice(1).map(c => c).join(' AND ')}`
          results = await db.select().from(answerItems)
            .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            .orderBy(desc(answerItems.createdAt))
            .limit(limit || 10000)
        } else {
          results = await db.select().from(answerItems)
            .orderBy(desc(answerItems.createdAt))
            .limit(limit || 10000)
        }

        return res.json(results)
      }

      // GET /search/photos - list/search photos
      if ((path === "/search/photos" || path === "/search/photos/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 0

        const conditions = []
        if (query) {
          conditions.push(or(
            ilike(photoAssets.displayTitle, `%${query}%`),
            ilike(photoAssets.description, `%${query}%`),
            ilike(photoAssets.originalFilename, `%${query}%`)
          ))
        }
        if (topicId) {
          conditions.push(eq(photoAssets.topicId, topicId))
        }
        if (status) {
          conditions.push(eq(photoAssets.status, status))
        }

        let results
        if (conditions.length > 0) {
          results = await db.select().from(photoAssets)
            .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            .orderBy(desc(photoAssets.createdAt))
            .limit(limit || 10000)
        } else {
          results = await db.select().from(photoAssets)
            .orderBy(desc(photoAssets.createdAt))
            .limit(limit || 10000)
        }

        return res.json(results)
      }

      // GET /search/answers/:id - get single answer with linked photos
      const answerMatch = path.match(/^\/search\/answers\/([^/]+)$/)
      if (answerMatch && method === "GET") {
        const [answer] = await db.select().from(answerItems).where(eq(answerItems.id, answerMatch[1]))
        if (!answer) return res.status(404).json({ error: "Answer not found" })
        const links = await db.select().from(linksAnswerPhoto).where(eq(linksAnswerPhoto.answerItemId, answerMatch[1]))
        const linkedPhotos = []
        for (const link of links) {
          const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.id, link.photoAssetId))
          if (photo) linkedPhotos.push(photo)
        }
        return res.json({ ...answer, linkedPhotos })
      }

      // GET /search/photos/:id - get single photo with linked answers
      const photoMatch = path.match(/^\/search\/photos\/([^/]+)$/)
      if (photoMatch && method === "GET") {
        const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.id, photoMatch[1]))
        if (!photo) return res.status(404).json({ error: "Photo not found" })
        const links = await db.select().from(linksAnswerPhoto).where(eq(linksAnswerPhoto.photoAssetId, photoMatch[1]))
        const linkedAnswers = []
        for (const link of links) {
          const [answer] = await db.select().from(answerItems).where(eq(answerItems.id, link.answerItemId))
          if (answer) linkedAnswers.push(answer)
        }
        return res.json({ ...photo, linkedAnswers })
      }

      // POST /search/answers/:id/copy - log copy event (just acknowledge)
      const copyMatch = path.match(/^\/search\/answers\/([^/]+)\/copy$/)
      if (copyMatch && method === "POST") {
        return res.json({ success: true })
      }

      // POST /search/link - link answer to photo
      if ((path === "/search/link" || path === "/search/link/") && method === "POST") {
        const { answerId, photoId } = req.body || {}
        if (!answerId || !photoId) return res.status(400).json({ error: "answerId and photoId are required" })
        const [existingAnswer] = await db.select().from(answerItems).where(eq(answerItems.id, answerId))
        if (!existingAnswer) return res.status(404).json({ error: "Answer not found" })
        const [existingPhoto] = await db.select().from(photoAssets).where(eq(photoAssets.id, photoId))
        if (!existingPhoto) return res.status(404).json({ error: "Photo not found" })
        const [existingLink] = await db.select().from(linksAnswerPhoto).where(and(eq(linksAnswerPhoto.answerItemId, answerId), eq(linksAnswerPhoto.photoAssetId, photoId)))
        if (existingLink) return res.json(existingLink)
        const [link] = await db.insert(linksAnswerPhoto).values({ answerItemId: answerId, photoAssetId: photoId, createdBy: session?.userName ?? "unknown" }).returning()
        return res.json(link)
      }

      // DELETE /search/link - unlink answer from photo
      if ((path === "/search/link" || path === "/search/link/") && method === "DELETE") {
        const { answerId, photoId } = req.body || {}
        if (!answerId || !photoId) return res.status(400).json({ error: "answerId and photoId are required" })
        await db.delete(linksAnswerPhoto).where(and(eq(linksAnswerPhoto.answerItemId, answerId), eq(linksAnswerPhoto.photoAssetId, photoId)))
        return res.json({ success: true })
      }

      // GET /search/answers/:id/photos - get linked photos
      const linkedPhotosMatch = path.match(/^\/search\/answers\/([^/]+)\/photos$/)
      if (linkedPhotosMatch && method === "GET") {
        const links = await db.select().from(linksAnswerPhoto).where(eq(linksAnswerPhoto.answerItemId, linkedPhotosMatch[1]))
        if (links.length === 0) return res.json([])
        const photos = []
        for (const link of links) {
          const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.id, link.photoAssetId))
          if (photo) photos.push(photo)
        }
        return res.json(photos)
      }

      // GET /search/photos/:id/answers - get linked answers
      const linkedAnswersMatch = path.match(/^\/search\/photos\/([^/]+)\/answers$/)
      if (linkedAnswersMatch && method === "GET") {
        const links = await db.select().from(linksAnswerPhoto).where(eq(linksAnswerPhoto.photoAssetId, linkedAnswersMatch[1]))
        if (links.length === 0) return res.json([])
        const answers = []
        for (const link of links) {
          const [answer] = await db.select().from(answerItems).where(eq(answerItems.id, link.answerItemId))
          if (answer) answers.push(answer)
        }
        return res.json(answers)
      }

      // Combined search (original route) with relevance scoring
      if ((path === "/search" || path === "/search/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const type = (req.query?.type as string) || "all"
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 50
        const offset = parseInt(req.query?.offset as string) || 0

        // Helper function to count occurrences of a word in text (case-insensitive)
        const countOccurrences = (text: string, word: string): number => {
          const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          return (text.match(regex) || []).length
        }

        // Helper function to score an item based on search query
        const scoreItem = (title: string, body: string, searchQuery: string): number => {
          if (!searchQuery.trim()) return 0

          const queryLower = searchQuery.toLowerCase().trim()
          const titleLower = title.toLowerCase()
          const bodyLower = body.toLowerCase()
          const searchWords = queryLower.split(/\s+/).filter(w => w.length > 0)

          let score = 0

          // Exact phrase match in title = highest priority (+50)
          if (titleLower.includes(queryLower)) {
            score += 50
          }

          // Exact phrase match in body (+25)
          if (bodyLower.includes(queryLower)) {
            score += 25
          }

          // Each search word found in title (+10 each)
          for (const word of searchWords) {
            if (titleLower.includes(word)) {
              score += 10
            }
          }

          // Count occurrences of each search word in body (+2 per occurrence)
          for (const word of searchWords) {
            const occurrences = countOccurrences(bodyLower, word)
            score += occurrences * 2
          }

          return score
        }

        let answerResults: any[] = []
        let photoResults: any[] = []
        let totalAnswers = 0
        let totalPhotos = 0

        if (type === "all" || type === "answers") {
          const conditions = []
          if (query) {
            // Split query into words and match any word in question or answer
            const searchWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0)
            const wordConditions = searchWords.flatMap(word => [
              ilike(answerItems.question, `%${word}%`),
              ilike(answerItems.answer, `%${word}%`)
            ])
            if (wordConditions.length > 0) {
              conditions.push(or(...wordConditions))
            }
          }
          if (topicId) conditions.push(eq(answerItems.topicId, topicId))
          if (status) conditions.push(eq(answerItems.status, status))

          // Get total count
          const countQuery = conditions.length > 0
            ? db.select({ count: sql<number>`count(*)::int` }).from(answerItems)
                .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            : db.select({ count: sql<number>`count(*)::int` }).from(answerItems)
          const [countResult] = await countQuery
          totalAnswers = countResult?.count || 0

          // Get all matching results (we'll sort and paginate after scoring)
          let allAnswers: any[] = []
          if (conditions.length > 0) {
            allAnswers = await db.select().from(answerItems)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
          } else {
            allAnswers = await db.select().from(answerItems)
          }

          // Score and sort answers by relevance
          if (query) {
            const scoredAnswers = allAnswers.map(answer => ({
              ...answer,
              _relevanceScore: scoreItem(answer.question, answer.answer, query)
            }))
            scoredAnswers.sort((a, b) => b._relevanceScore - a._relevanceScore)
            // Keep score in results for debugging, apply pagination
            answerResults = scoredAnswers.slice(offset, offset + limit)
          } else {
            // No query = sort by date
            allAnswers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            answerResults = allAnswers.slice(offset, offset + limit)
          }
        }

        if (type === "all" || type === "photos") {
          const conditions = []
          if (query) {
            // Split query into words and match any word
            const searchWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0)
            const wordConditions = searchWords.flatMap(word => [
              ilike(photoAssets.displayTitle, `%${word}%`),
              ilike(photoAssets.description, `%${word}%`),
              ilike(photoAssets.originalFilename, `%${word}%`)
            ])
            if (wordConditions.length > 0) {
              conditions.push(or(...wordConditions))
            }
          }
          if (topicId) conditions.push(eq(photoAssets.topicId, topicId))
          if (status) conditions.push(eq(photoAssets.status, status))

          // Get total count
          const countQuery = conditions.length > 0
            ? db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)
                .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            : db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)
          const [countResult] = await countQuery
          totalPhotos = countResult?.count || 0

          // Get all matching results (we'll sort and paginate after scoring)
          let allPhotos: any[] = []
          if (conditions.length > 0) {
            allPhotos = await db.select().from(photoAssets)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
          } else {
            allPhotos = await db.select().from(photoAssets)
          }

          // Score and sort photos by relevance
          if (query) {
            const scoredPhotos = allPhotos.map(photo => ({
              ...photo,
              _relevanceScore: scoreItem(photo.displayTitle, (photo.description || '') + ' ' + photo.originalFilename, query)
            }))
            scoredPhotos.sort((a, b) => b._relevanceScore - a._relevanceScore)
            // Keep score in results for debugging, apply pagination
            photoResults = scoredPhotos.slice(offset, offset + limit)
          } else {
            // No query = sort by date
            allPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            photoResults = allPhotos.slice(offset, offset + limit)
          }
        }

        return res.json({
          answers: answerResults,
          photos: photoResults,
          totalAnswers,
          totalPhotos
        })
      }
    }

    // AI routes
    if (path.startsWith("/ai")) {
      // AI status check
      if (path === "/ai/status" && method === "GET") {
        return res.json({
          configured: !!openai,
          model: openai ? "gpt-4o-mini" : null,
          message: openai ? "AI service is configured" : "OpenAI API key not configured"
        })
      }

      // AI query
      if (path === "/ai/query" && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            sources: [],
            photos: [],
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { query, topicId, maxSources = 5 } = req.body || {}

        // Step 1: Extract key concepts/keywords from the user's query using AI
        let searchKeywords: string[] = []
        try {
          const keywordExtraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract the key topic keywords from user queries for database searching.
Return ONLY a JSON array of 1-5 important keywords/phrases, no explanation.
Focus on nouns, topics, and concepts - ignore filler words like "give me", "describe", "what is", etc.
Example: "give a description of governance" -> ["governance"]
Example: "what are our data privacy policies" -> ["data privacy", "privacy policies", "data"]
Example: "how do we handle customer complaints" -> ["customer complaints", "complaints", "customer service"]`
              },
              { role: "user", content: query }
            ],
            max_tokens: 100
          })
          const extracted = keywordExtraction.choices[0]?.message?.content || "[]"
          searchKeywords = JSON.parse(extracted.replace(/```json\n?|\n?```/g, "").trim())
        } catch (err) {
          console.error("Keyword extraction failed:", err)
          // Fallback: use the original query split into words, filtering common words
          const stopWords = new Set(["give", "me", "a", "an", "the", "what", "is", "are", "how", "do", "we", "our", "describe", "description", "of", "about", "tell", "explain"])
          searchKeywords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w))
        }

        // If no keywords extracted, use original query
        if (searchKeywords.length === 0) {
          searchKeywords = [query]
        }

        // Step 2: Search with extracted keywords, prioritizing question/headline matches
        const searchConditions = searchKeywords.flatMap(keyword => [
          ilike(answerItems.question, `%${keyword}%`),
          ilike(answerItems.answer, `%${keyword}%`)
        ])

        // Also search photos by keywords
        const photoSearchConditions = searchKeywords.flatMap(keyword => [
          ilike(photoAssets.displayTitle, `%${keyword}%`),
          ilike(photoAssets.description, `%${keyword}%`)
        ])

        // Get a larger pool of potential matches (answers + photos in parallel)
        let potentialMatches: typeof answerItems.$inferSelect[] = []
        let relevantPhotos: typeof photoAssets.$inferSelect[] = []

        const [answerResults, photoResults] = await Promise.all([
          searchConditions.length > 0
            ? db.select().from(answerItems)
                .where(searchConditions.length === 1 ? searchConditions[0]! : or(...searchConditions))
                .limit(20)
            : db.select().from(answerItems)
                .orderBy(desc(answerItems.createdAt))
                .limit(20),
          photoSearchConditions.length > 0
            ? db.select().from(photoAssets)
                .where(photoSearchConditions.length === 1 ? photoSearchConditions[0]! : or(...photoSearchConditions))
                .limit(5)
            : Promise.resolve([])
        ])
        potentialMatches = answerResults
        relevantPhotos = photoResults

        // Step 3: Score and rank results - prioritize headline/question matches
        const scoredResults = potentialMatches.map(item => {
          let score = 0
          const questionLower = item.question.toLowerCase()
          const answerLower = item.answer.toLowerCase()

          for (const keyword of searchKeywords) {
            const keywordLower = keyword.toLowerCase()
            // Heavy weight for question/headline matches
            if (questionLower.includes(keywordLower)) {
              score += 10
              // Extra points for exact or near-exact question match
              if (questionLower.startsWith(keywordLower) || questionLower === keywordLower) {
                score += 5
              }
            }
            // Lower weight for answer body matches
            if (answerLower.includes(keywordLower)) {
              score += 3
            }
          }
          return { ...item, score }
        })

        // Sort by score (highest first) and take top results
        const relevantAnswers = scoredResults
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSources)
          .filter(item => item.score > 0)

        if (relevantAnswers.length === 0) {
          return res.json({
            response: "I couldn't find any relevant information in the knowledge base for your query.",
            sources: [],
            photos: [],
            refused: false
          })
        }

        const photoContext = relevantPhotos.length > 0
          ? `\n\nRELEVANT PHOTOS:\n${relevantPhotos.map((p, i) => `[Photo ${i + 1}]\nTitle: ${p.displayTitle}\nDescription: ${p.description || "No description"}`).join("\n\n")}`
          : ""

        const systemPrompt = `You are an RFP Q&A assistant for Stamats, a marketing agency. Answer questions using ONLY the provided approved library content.

RULES:
1. ONLY use information from the provided sources — NEVER add your own knowledge
2. If sources don't fully answer the question, say what you found and note the gap
3. If relevant photos are available, mention them by title
4. Use **bold** for key terms, names, and important facts
5. Use bullet points or numbered lists when presenting multiple items
6. Keep responses concise but thorough
7. Write in polished, proposal-ready language

At the end of your response, include 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

APPROVED CONTENT SOURCES:
${relevantAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}${photoContext}`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })

        const rawAiResponse = completion.choices[0]?.message?.content || ""
        const { cleanResponse: aiCleanResponse, followUpPrompts: aiFollowUps } = parseFollowUpPrompts(rawAiResponse, [])

        return res.json({
          response: aiCleanResponse,
          sources: relevantAnswers.map(a => ({ id: a.id, question: a.question, answer: a.answer })),
          followUpPrompts: aiFollowUps.length > 0 ? aiFollowUps : undefined,
          photos: relevantPhotos.map(p => {
            let ext = ""
            if (p.originalFilename) {
              const m = p.originalFilename.match(/\.([^.]+)$/)
              if (m) ext = m[1]
            }
            if (!ext && p.mimeType) {
              ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[p.mimeType] || "png"
            }
            return {
              id: p.id,
              displayTitle: p.displayTitle,
              description: p.description,
              storageKey: p.storageKey,
              fileUrl: SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/photo-assets/${p.storageKey}.${ext}` : undefined
            }
          }),
          refused: false
        })
      }

      // AI stream (streaming version of /ai/query)
      if (path === "/ai/stream" && method === "POST") {
        if (!openai) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service is not configured" })}\n\n`)
          return res.end()
        }

        const { query, topicId, maxSources = 5, conversationHistory } = req.body || {}

        // Step 1: Extract key concepts/keywords from the user's query using AI
        let searchKeywords: string[] = []
        try {
          const keywordExtraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract the key topic keywords from user queries for database searching.
Return ONLY a JSON array of 1-5 important keywords/phrases, no explanation.
Focus on nouns, topics, and concepts - ignore filler words like "give me", "describe", "what is", etc.
Example: "give a description of governance" -> ["governance"]
Example: "what are our data privacy policies" -> ["data privacy", "privacy policies", "data"]
Example: "how do we handle customer complaints" -> ["customer complaints", "complaints", "customer service"]`
              },
              { role: "user", content: query }
            ],
            max_tokens: 100
          })
          const extracted = keywordExtraction.choices[0]?.message?.content || "[]"
          searchKeywords = JSON.parse(extracted.replace(/```json\n?|\n?```/g, "").trim())
        } catch (err) {
          console.error("Keyword extraction failed:", err)
          const stopWords = new Set(["give", "me", "a", "an", "the", "what", "is", "are", "how", "do", "we", "our", "describe", "description", "of", "about", "tell", "explain"])
          searchKeywords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w))
        }

        if (searchKeywords.length === 0) {
          searchKeywords = [query]
        }

        // Step 2: Search with extracted keywords
        const searchConditions = searchKeywords.flatMap(keyword => [
          ilike(answerItems.question, `%${keyword}%`),
          ilike(answerItems.answer, `%${keyword}%`)
        ])

        const photoSearchConditions = searchKeywords.flatMap(keyword => [
          ilike(photoAssets.displayTitle, `%${keyword}%`),
          ilike(photoAssets.description, `%${keyword}%`)
        ])

        const [answerResults, photoResults] = await Promise.all([
          searchConditions.length > 0
            ? db.select().from(answerItems)
                .where(searchConditions.length === 1 ? searchConditions[0]! : or(...searchConditions))
                .limit(20)
            : db.select().from(answerItems)
                .orderBy(desc(answerItems.createdAt))
                .limit(20),
          photoSearchConditions.length > 0
            ? db.select().from(photoAssets)
                .where(photoSearchConditions.length === 1 ? photoSearchConditions[0]! : or(...photoSearchConditions))
                .limit(5)
            : Promise.resolve([])
        ])
        const potentialMatches = answerResults
        const relevantPhotos = photoResults

        // Step 3: Score and rank results
        const scoredResults = potentialMatches.map(item => {
          let score = 0
          const questionLower = item.question.toLowerCase()
          const answerLower = item.answer.toLowerCase()
          for (const keyword of searchKeywords) {
            const keywordLower = keyword.toLowerCase()
            if (questionLower.includes(keywordLower)) {
              score += 10
              if (questionLower.startsWith(keywordLower) || questionLower === keywordLower) {
                score += 5
              }
            }
            if (answerLower.includes(keywordLower)) {
              score += 3
            }
          }
          return { ...item, score }
        })

        const relevantAnswers = scoredResults
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSources)
          .filter(item => item.score > 0)

        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")

        if (relevantAnswers.length === 0) {
          const metadata = { sources: [], photos: [], refused: false }
          res.write(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`)
          res.write(`event: done\ndata: ${JSON.stringify({ cleanResponse: "I couldn't find any relevant information in the knowledge base for your query.", followUpPrompts: [] })}\n\n`)
          return res.end()
        }

        // Build metadata
        const sourcesMetadata = relevantAnswers.map(a => ({ id: a.id, question: a.question, answer: a.answer }))
        const photosMetadata = relevantPhotos.map(p => {
          let ext = ""
          if (p.originalFilename) {
            const m = p.originalFilename.match(/\.([^.]+)$/)
            if (m) ext = m[1]
          }
          if (!ext && p.mimeType) {
            ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[p.mimeType] || "png"
          }
          return {
            id: p.id,
            displayTitle: p.displayTitle,
            description: p.description,
            storageKey: p.storageKey,
            fileUrl: SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/photo-assets/${p.storageKey}.${ext}` : undefined
          }
        })

        // Send metadata event
        res.write(`event: metadata\ndata: ${JSON.stringify({ sources: sourcesMetadata, photos: photosMetadata, refused: false })}\n\n`)

        // Build system prompt
        const photoContext = relevantPhotos.length > 0
          ? `\n\nRELEVANT PHOTOS:\n${relevantPhotos.map((p, i) => `[Photo ${i + 1}]\nTitle: ${p.displayTitle}\nDescription: ${p.description || "No description"}`).join("\n\n")}`
          : ""

        const systemPrompt = `You are an RFP Q&A assistant for Stamats, a marketing agency. Answer questions using ONLY the provided approved library content.

RULES:
1. ONLY use information from the provided sources — NEVER add your own knowledge
2. If sources don't fully answer the question, say what you found and note the gap
3. If relevant photos are available, mention them by title
4. Use **bold** for key terms, names, and important facts
5. Use bullet points or numbered lists when presenting multiple items
6. Keep responses concise but thorough
7. Write in polished, proposal-ready language

At the end of your response, include 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

APPROVED CONTENT SOURCES:
${relevantAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}${photoContext}`

        // Build messages with conversation history
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt }
        ]
        if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
          const truncated = truncateHistory(conversationHistory)
          for (const msg of truncated) {
            messages.push({ role: msg.role as "user" | "assistant", content: msg.content })
          }
        }
        messages.push({ role: "user", content: query })

        // Stream from OpenAI
        try {
          const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            temperature: 0.3,
            max_tokens: 2000,
            stream: true
          })

          let fullResponse = ""
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content
            if (token) {
              fullResponse += token
              res.write(`data: ${JSON.stringify({ token })}\n\n`)
            }
          }

          const { cleanResponse, followUpPrompts } = parseFollowUpPrompts(fullResponse, [])
          res.write(`event: done\ndata: ${JSON.stringify({ cleanResponse, followUpPrompts })}\n\n`)
          return res.end()
        } catch (streamErr: any) {
          console.error("AI stream error:", streamErr?.message || streamErr)
          res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr?.message || "AI streaming failed" })}\n\n`)
          return res.end()
        }
      }

      // AI adapt
      if (path === "/ai/adapt" && method === "POST") {
        if (!openai) {
          return res.json({
            adaptedContent: "",
            originalContent: "",
            instruction: "",
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { content, adaptationType, customInstruction, targetWordCount, clientName, industry } = req.body || {}

        let instruction = ""
        switch (adaptationType) {
          case "shorten": instruction = `Shorten this content${targetWordCount ? ` to approximately ${targetWordCount} words` : ""}`; break
          case "expand": instruction = `Expand this content with more detail${targetWordCount ? ` to approximately ${targetWordCount} words` : ""}`; break
          case "bullets": instruction = "Convert this content into bullet points"; break
          case "formal": instruction = "Rewrite this content in a more formal, professional tone"; break
          case "casual": instruction = "Rewrite this content in a more casual, conversational tone"; break
          case "custom": instruction = customInstruction || "Improve this content"; break
          default: instruction = "Improve this content"
        }

        if (clientName) instruction += `. The client is ${clientName}.`
        if (industry) instruction += `. The industry is ${industry}.`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a professional content editor. Apply the requested changes while maintaining the core message and accuracy." },
            { role: "user", content: `${instruction}\n\nOriginal content:\n${content}` }
          ],
          max_tokens: 2000
        })

        return res.json({
          adaptedContent: completion.choices[0]?.message?.content || content,
          originalContent: content,
          instruction,
          refused: false
        })
      }

      // AI case studies
      if (path === "/ai/case-studies" && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            dataUsed: { totalCaseStudies: 0, totalTestimonials: 0, totalStats: 0, categoriesSearched: [] },
            followUpPrompts: [],
            refused: true,
            refusalReason: "AI service is not configured. Please set OPENAI_API_KEY in your environment."
          })
        }

        const { query: csQuery } = req.body || {}
        if (!csQuery || typeof csQuery !== "string" || csQuery.trim().length < 2) {
          return res.status(400).json({ error: "Query must be at least 2 characters" })
        }

        // Build context from client success data
        const csSections: string[] = []

        const caseStudyLines = clientSuccessData.caseStudies.map((cs: any) => {
          const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
          const testimonial = cs.testimonial ? `\n  Testimonial: "${cs.testimonial.quote}" — ${cs.testimonial.attribution}` : ""
          const awards = cs.awards ? `\n  Awards: ${cs.awards.join(", ")}` : ""
          return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge}\n  Solution: ${cs.solution}\n  Metrics: ${metrics || "None recorded"}${testimonial}${awards}`
        })
        csSections.push(`=== CLIENT RESULTS (${caseStudyLines.length}) ===\n${caseStudyLines.join("\n\n")}`)

        const sortedResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
        csSections.push(`=== TOP-LINE RESULTS (${sortedResults.length}) ===\n${sortedResults.map((r: any) => `${r.result} ${r.metric} — ${r.client}`).join("\n")}`)

        csSections.push(`=== TESTIMONIALS (${clientSuccessData.testimonials.length}) ===\n${clientSuccessData.testimonials.map((t: any) => `"${t.quote}" — ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`).join("\n\n")}`)

        csSections.push(`=== AWARDS (${clientSuccessData.awards.length}) ===\n${clientSuccessData.awards.map((a: any) => `${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}`)

        const statLines = [
          ...clientSuccessData.companyStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""}`),
          ...clientSuccessData.externallyVerifiedStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""} (Source: ${s.source})`)
        ]
        csSections.push(`=== COMPANY STATS ===\n${statLines.join("\n")}`)
        csSections.push(`=== SERVICE LINES ===\n${clientSuccessData.serviceLines.join(", ")}`)
        csSections.push(`=== CORE VALUES ===\n${clientSuccessData.coreValues.join("\n")}`)
        csSections.push(`=== PROPRIETARY RESEARCH ===\n${clientSuccessData.researchStudies.map((r: any) => `${r.name}: ${r.description}\n  Findings: ${r.findings.join("; ")}`).join("\n\n")}`)
        csSections.push(`=== NOTABLE FIRSTS ===\n${clientSuccessData.notableFirsts.join("\n")}`)
        csSections.push(`=== CONFERENCE PRESENCE ===\n${clientSuccessData.conferenceAppearances.map((c: any) => `${c.event} — ${c.role}`).join("\n")}`)

        const csContext = csSections.join("\n\n")

        const categories = new Set<string>()
        clientSuccessData.caseStudies.forEach((cs: any) => categories.add(cs.category))

        const csSystemPrompt = `You are a Client Success data assistant for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing. You have access to a database of ${clientSuccessData.caseStudies.length} client results, ${clientSuccessData.topLineResults.length} top-line results, ${clientSuccessData.testimonials.length} testimonials, and ${clientSuccessData.awards.length} awards.

You operate in TWO modes based on user intent:

MODE 1: CASE STUDY BUILDER — When the user wants to BUILD, CREATE, DRAFT, or WRITE a case study:
1. CONFIRM first: "I'll help you build a case study. Let me ask a few questions to get started."
2. ASK step-by-step (one at a time): Client name/industry, challenge, solution, results
3. Draft the full case study with Challenge/Solution/Results structure
4. Cross-reference the database for comparisons
5. Suggest refinements

MODE 2: QUICK GRAB — When the user wants a specific fact, stat, testimonial, or data point:
- Respond DIRECTLY — no guided workflow
- Keep it concise and formatted for instant copy-paste
- Use **bold** for key numbers and client names

RULES:
1. Only reference real data from the provided database — NEVER invent stats or quotes
2. When drafting testimonials, mark them as "Suggested quote:"
3. Write in polished, proposal-ready language
4. Use **bold** for key metrics, client names, and important facts
5. Format metrics as compelling bullet points

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

VISUALIZATIONS:${CHART_PROMPT}

--- CLIENT SUCCESS DATABASE ---
${csContext}`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: csSystemPrompt },
            { role: "user", content: csQuery.trim() }
          ],
          temperature: 0.4,
          max_tokens: 3000
        })

        const rawResponse = completion.choices[0]?.message?.content || ""

        // Parse follow-up prompts and chart data
        const { cleanResponse: csCleanFollowUp, followUpPrompts: csFollowUps } = parseFollowUpPrompts(rawResponse, [
          "Want me to add comparable stats from similar projects?",
          "Should I draft a client testimonial for this?",
          "Want to see similar client results from our database?"
        ])
        const { cleanText: cleanResponse, chartData: csChartData } = parseChartData(csCleanFollowUp)

        return res.json({
          response: cleanResponse,
          dataUsed: {
            totalCaseStudies: clientSuccessData.caseStudies.length,
            totalTestimonials: clientSuccessData.testimonials.length,
            totalStats: clientSuccessData.topLineResults.length,
            categoriesSearched: Array.from(categories)
          },
          followUpPrompts: csFollowUps,
          chartData: csChartData || undefined,
          refused: false
        })
      }

      // AI case studies stream (streaming version of /ai/case-studies)
      if (path === "/ai/case-studies/stream" && method === "POST") {
        if (!openai) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service is not configured. Please set OPENAI_API_KEY in your environment." })}\n\n`)
          return res.end()
        }

        const { query: csStreamQuery, conversationHistory: csConvHistory } = req.body || {}
        if (!csStreamQuery || typeof csStreamQuery !== "string" || csStreamQuery.trim().length < 2) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "Query must be at least 2 characters" })}\n\n`)
          return res.end()
        }

        // Build context from client success data (same as non-streaming)
        const csStreamSections: string[] = []

        const csStreamCaseStudyLines = clientSuccessData.caseStudies.map((cs: any) => {
          const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
          const testimonial = cs.testimonial ? `\n  Testimonial: "${cs.testimonial.quote}" — ${cs.testimonial.attribution}` : ""
          const awards = cs.awards ? `\n  Awards: ${cs.awards.join(", ")}` : ""
          return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge}\n  Solution: ${cs.solution}\n  Metrics: ${metrics || "None recorded"}${testimonial}${awards}`
        })
        csStreamSections.push(`=== CLIENT RESULTS (${csStreamCaseStudyLines.length}) ===\n${csStreamCaseStudyLines.join("\n\n")}`)

        const csStreamSortedResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
        csStreamSections.push(`=== TOP-LINE RESULTS (${csStreamSortedResults.length}) ===\n${csStreamSortedResults.map((r: any) => `${r.result} ${r.metric} — ${r.client}`).join("\n")}`)

        csStreamSections.push(`=== TESTIMONIALS (${clientSuccessData.testimonials.length}) ===\n${clientSuccessData.testimonials.map((t: any) => `"${t.quote}" — ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`).join("\n\n")}`)

        csStreamSections.push(`=== AWARDS (${clientSuccessData.awards.length}) ===\n${clientSuccessData.awards.map((a: any) => `${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}`)

        const csStreamStatLines = [
          ...clientSuccessData.companyStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""}`),
          ...clientSuccessData.externallyVerifiedStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""} (Source: ${s.source})`)
        ]
        csStreamSections.push(`=== COMPANY STATS ===\n${csStreamStatLines.join("\n")}`)
        csStreamSections.push(`=== SERVICE LINES ===\n${clientSuccessData.serviceLines.join(", ")}`)
        csStreamSections.push(`=== CORE VALUES ===\n${clientSuccessData.coreValues.join("\n")}`)
        csStreamSections.push(`=== PROPRIETARY RESEARCH ===\n${clientSuccessData.researchStudies.map((r: any) => `${r.name}: ${r.description}\n  Findings: ${r.findings.join("; ")}`).join("\n\n")}`)
        csStreamSections.push(`=== NOTABLE FIRSTS ===\n${clientSuccessData.notableFirsts.join("\n")}`)
        csStreamSections.push(`=== CONFERENCE PRESENCE ===\n${clientSuccessData.conferenceAppearances.map((c: any) => `${c.event} — ${c.role}`).join("\n")}`)

        const csStreamContext = csStreamSections.join("\n\n")

        const csStreamCategories = new Set<string>()
        clientSuccessData.caseStudies.forEach((cs: any) => csStreamCategories.add(cs.category))

        const csStreamSystemPrompt = `You are a Client Success data assistant for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing. You have access to a database of ${clientSuccessData.caseStudies.length} client results, ${clientSuccessData.topLineResults.length} top-line results, ${clientSuccessData.testimonials.length} testimonials, and ${clientSuccessData.awards.length} awards.

You operate in TWO modes based on user intent:

MODE 1: CASE STUDY BUILDER — When the user wants to BUILD, CREATE, DRAFT, or WRITE a case study:
1. CONFIRM first: "I'll help you build a case study. Let me ask a few questions to get started."
2. ASK step-by-step (one at a time): Client name/industry, challenge, solution, results
3. Draft the full case study with Challenge/Solution/Results structure
4. Cross-reference the database for comparisons
5. Suggest refinements

MODE 2: QUICK GRAB — When the user wants a specific fact, stat, testimonial, or data point:
- Respond DIRECTLY — no guided workflow
- Keep it concise and formatted for instant copy-paste
- Use **bold** for key numbers and client names

RULES:
1. Only reference real data from the provided database — NEVER invent stats or quotes
2. When drafting testimonials, mark them as "Suggested quote:"
3. Write in polished, proposal-ready language
4. Use **bold** for key metrics, client names, and important facts
5. Format metrics as compelling bullet points

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

VISUALIZATIONS:${CHART_PROMPT}

--- CLIENT SUCCESS DATABASE ---
${csStreamContext}`

        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")

        // Send metadata event
        const csStreamMetadata = {
          dataUsed: {
            totalCaseStudies: clientSuccessData.caseStudies.length,
            totalTestimonials: clientSuccessData.testimonials.length,
            totalStats: clientSuccessData.topLineResults.length,
            categoriesSearched: Array.from(csStreamCategories)
          },
          refused: false
        }
        res.write(`event: metadata\ndata: ${JSON.stringify(csStreamMetadata)}\n\n`)

        // Build messages with conversation history
        const csStreamMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: csStreamSystemPrompt }
        ]
        if (csConvHistory && Array.isArray(csConvHistory) && csConvHistory.length > 0) {
          const truncated = truncateHistory(csConvHistory)
          for (const msg of truncated) {
            csStreamMessages.push({ role: msg.role as "user" | "assistant", content: msg.content })
          }
        }
        csStreamMessages.push({ role: "user", content: csStreamQuery.trim() })

        try {
          const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: csStreamMessages,
            temperature: 0.4,
            max_tokens: 3000,
            stream: true
          })

          let fullResponse = ""
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content
            if (token) {
              fullResponse += token
              res.write(`data: ${JSON.stringify({ token })}\n\n`)
            }
          }

          const { cleanResponse: csCleanFU, followUpPrompts: csFollows } = parseFollowUpPrompts(fullResponse, [
            "Want me to add comparable stats from similar projects?",
            "Should I draft a client testimonial for this?",
            "Want to see similar client results from our database?"
          ])
          const { cleanText: csClean, chartData: csStreamChart } = parseChartData(csCleanFU)
          res.write(`event: done\ndata: ${JSON.stringify({ cleanResponse: csClean, followUpPrompts: csFollows, ...(csStreamChart ? { chartData: csStreamChart } : {}) })}\n\n`)
          return res.end()
        } catch (streamErr: any) {
          console.error("Case study stream error:", streamErr?.message || streamErr)
          res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr?.message || "AI streaming failed" })}\n\n`)
          return res.end()
        }
      }
    }

    // ─── AI Companion stream (super-powered with full data access) ──────────
    if (path === "/companion/stream" && method === "POST") {
      if (!openai) {
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service is not configured." })}\n\n`)
        return res.end()
      }

      const { query: companionQuery, conversationHistory: companionHistory, behaviorContext } = req.body || {}
      if (!companionQuery || typeof companionQuery !== "string" || companionQuery.trim().length < 2) {
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Query must be at least 2 characters" })}\n\n`)
        return res.end()
      }

      // Load ALL data sources in parallel
      const compSearchWords = companionQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
      let compLibraryAnswers: any[] = []
      if (compSearchWords.length > 0) {
        const wordConditions = compSearchWords.flatMap((word: string) => [
          ilike(answerItems.question, `%${word}%`),
          ilike(answerItems.answer, `%${word}%`)
        ])
        compLibraryAnswers = await db.select().from(answerItems)
          .where(or(...wordConditions))
          .limit(15)
      }

      const compProposals = await db.select().from(proposals).orderBy(desc(proposals.date))
      const compDecided = compProposals.filter(p => p.won === "Yes" || p.won === "No")
      const compWon = compDecided.filter(p => p.won === "Yes")
      const compWinRate = compDecided.length > 0 ? compWon.length / compDecided.length : 0

      // Win rates by service
      const compByService: Record<string, { won: number; total: number }> = {}
      compDecided.forEach(p => {
        ((p.servicesOffered as string[]) || []).forEach(s => {
          if (!compByService[s]) compByService[s] = { won: 0, total: 0 }
          compByService[s].total++
          if (p.won === "Yes") compByService[s].won++
        })
      })

      // Win rates by school type
      const compBySchoolType: Record<string, { won: number; total: number }> = {}
      compDecided.forEach(p => {
        if (p.schoolType) {
          if (!compBySchoolType[p.schoolType]) compBySchoolType[p.schoolType] = { won: 0, total: 0 }
          compBySchoolType[p.schoolType].total++
          if (p.won === "Yes") compBySchoolType[p.schoolType].won++
        }
      })

      // Win rates by CE
      const compByCE: Record<string, { won: number; total: number }> = {}
      compDecided.forEach(p => {
        if (p.ce) {
          if (!compByCE[p.ce]) compByCE[p.ce] = { won: 0, total: 0 }
          compByCE[p.ce].total++
          if (p.won === "Yes") compByCE[p.ce].won++
        }
      })

      const compFormatRate = (won: number, total: number) => total > 0 ? `${((won / total) * 100).toFixed(1)}%` : "N/A"

      // Date range
      const compDates = compProposals.filter(p => p.date).map(p => new Date(p.date!))
      const compMinDate = compDates.length > 0 ? new Date(Math.min(...compDates.map(d => d.getTime()))) : null
      const compMaxDate = compDates.length > 0 ? new Date(Math.max(...compDates.map(d => d.getTime()))) : null

      // Build case study context
      const compCsSummary = clientSuccessData.caseStudies.map((cs: any) => {
        const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
        const testimonial = cs.testimonial ? `\n  Quote: "${cs.testimonial.quote.slice(0, 120)}..." — ${cs.testimonial.attribution}` : ""
        return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge.slice(0, 120)}...\n  Metrics: ${metrics || "None"}${testimonial}`
      }).join("\n\n")

      const compTopResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
        .slice(0, 12)
        .map((r: any) => `- ${r.result} ${r.metric} — ${r.client}`)
        .join("\n")

      const compTestimonials = clientSuccessData.testimonials.slice(0, 8).map((t: any) => {
        const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
        return `"${t.quote.slice(0, 120)}..." — ${who}`
      }).join("\n\n")

      const compAwards = clientSuccessData.awards.slice(0, 8).map((a: any) => `- ${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")

      // Build data context
      const compDataContext = `
═══ DATA SOURCE 1: PROPOSAL HISTORY ═══
Total Proposals: ${compProposals.length}
Date Range: ${compMinDate?.toISOString().split("T")[0] || "N/A"} to ${compMaxDate?.toISOString().split("T")[0] || "N/A"}
Won: ${compWon.length} | Lost: ${compDecided.length - compWon.length} | Win Rate: ${compFormatRate(compWon.length, compDecided.length)}

WIN RATES BY SCHOOL TYPE (top 8):
${Object.entries(compBySchoolType).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([type, s]) => `- ${type}: ${compFormatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

WIN RATES BY SERVICE (top 10):
${Object.entries(compByService).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([svc, s]) => `- ${svc}: ${compFormatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

WIN RATES BY ACCOUNT EXECUTIVE (top 8):
${Object.entries(compByCE).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([ce, s]) => `- ${ce}: ${compFormatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

RECENT WINS (last 15):
${compWon.slice(0, 15).map(p => `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) — ${((p.servicesOffered as string[]) || []).slice(0, 3).join(", ") || "N/A"}`).join("\n") || "No recent wins"}

═══ DATA SOURCE 2: CLIENT SUCCESS (${clientSuccessData.caseStudies.length} case studies) ═══

CASE STUDIES:
${compCsSummary}

TOP-LINE RESULTS (${clientSuccessData.topLineResults.length} stats):
${compTopResults}

TESTIMONIALS (${clientSuccessData.testimonials.length} total):
${compTestimonials}

AWARDS (${clientSuccessData.awards.length} total):
${compAwards}

═══ DATA SOURCE 3: Q&A LIBRARY (${compLibraryAnswers.length} relevant answers) ═══

${compLibraryAnswers.length > 0 ? compLibraryAnswers.map((a: any, i: number) => `[Answer ${i + 1}] (ID: ${a.id})
Q: ${a.question}
A: ${a.answer?.slice(0, 400)}${(a.answer?.length || 0) > 400 ? "..." : ""}`).join("\n\n") : "No relevant library answers found for this query."}`

      const companionSystemPrompt = `You are the Stamats Content Library AI Companion — the most powerful assistant in the app. You combine the knowledge of a helpful colleague with FULL ACCESS to all data in the system. You're warm, conversational, and incredibly capable.

You can do EVERYTHING:
- Search and retrieve Q&A library entries, case studies, proposals, testimonials, awards, and stats
- Provide win rate analytics, team performance, and strategic insights
- Find specific client results, quotes, and proof points
- Guide users to the right tools and pages with clickable links
- Cross-reference all data sources for comprehensive answers
- Answer detailed how-to questions about every feature

== SOURCE ATTRIBUTION ==
When you reference data from the system, ALWAYS tell the user where it came from:
- For Q&A library entries: mention the question title and link [Search for "keyword"](/search?q=keyword)
- For case studies: mention the client name and say "from Client Success data"
- For proposals: mention the client and date
- For testimonials: include the attribution
- When providing Q&A content, include enough for the user to copy it directly.

== LINKING FORMAT ==
When mentioning a page, ALWAYS provide a clickable markdown link:
[Search Library](/search), [Ask AI](/ai), [Import Data](/import), [New Entry](/new), [Photo Library](/photos), [RFP Analyzer](/analyze), [Saved Documents](/documents), [Proposal Insights](/insights), [Case Studies](/case-studies), [Unified AI](/unified-ai), [Document Studio](/studio), [Help](/help), [Support](/support), [Home](/)
When referencing Q&A content: [View in Library](/search?q=SEARCH_TERM)

== APPLICATION MAP ==
**[Home](/)** — Dashboard. **[Search Library](/search)** — Full-text Q&A/photos/client success search. **[Ask AI](/ai)** — AI Q&A from library. **[Import Data](/import)** — Excel import. **[New Entry](/new)** — Manual Q&A. **[Photo Library](/photos)** — Image management. **[RFP Analyzer](/analyze)** — Upload & analyze RFPs. **[Saved Documents](/documents)** — Browse saved docs. **[Proposal Insights](/insights)** — Win/loss analytics. **[Case Studies](/case-studies)** — Client success AI. **[Unified AI](/unified-ai)** — Cross-references ALL data. **[Document Studio](/studio)** — Rich proposal editor. **Settings** — Customize everything.

== RESPONSE RULES ==
1. Be conversational and warm — you're a helpful colleague.
2. When users ask for DATA, ACTUALLY PROVIDE IT. Don't just point to another page.
3. Format data cleanly with bold, bullets, tables as appropriate.
4. ALWAYS cite sources: "From the Q&A Library:", "From proposal data:", "From client success:"
5. Include search links for Q&A entries: [Search for "keyword"](/search?q=keyword)
6. Use markdown links for page references — they're clickable.
7. Cross-reference data sources when relevant.
8. For guidance questions, keep concise. For data questions, go detailed.
9. NEVER make up data. Only use provided context.
10. When providing Q&A content, include enough to copy directly.

${CHART_PROMPT}

${behaviorContext ? `== USER BEHAVIOR CONTEXT ==\n${behaviorContext}\n` : ""}
Always end with 2-3 follow-up prompts:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

═══ LIVE DATA ═══
${compDataContext}`

      res.setHeader("Content-Type", "text/event-stream")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")
      res.setHeader("X-Accel-Buffering", "no")

      res.write(`event: metadata\ndata: ${JSON.stringify({
        type: "companion",
        stats: {
          proposals: compProposals.length,
          winRate: compWinRate,
          libraryAnswers: compLibraryAnswers.length,
          caseStudies: clientSuccessData.caseStudies.length,
          testimonials: clientSuccessData.testimonials.length,
        }
      })}\n\n`)

      const companionMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: companionSystemPrompt }
      ]
      if (companionHistory && Array.isArray(companionHistory) && companionHistory.length > 0) {
        const truncated = truncateHistory(companionHistory)
        for (const msg of truncated) {
          companionMessages.push({ role: msg.role as "user" | "assistant", content: msg.content })
        }
      }
      companionMessages.push({ role: "user", content: companionQuery.trim() })

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: companionMessages,
          temperature: 0.4,
          max_tokens: 3000,
          stream: true
        })

        let fullResponse = ""
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content
          if (token) {
            fullResponse += token
            res.write(`data: ${JSON.stringify({ token })}\n\n`)
          }
        }

        const { cleanResponse: companionClean, followUpPrompts: companionFollows } = parseFollowUpPrompts(fullResponse, [
          "What else can I help you find?",
          "Want to dive deeper into any of this data?",
          "What are you working on right now?"
        ])
        const { cleanText: compFinalText, chartData: compChartData } = parseChartData(companionClean)
        res.write(`event: done\ndata: ${JSON.stringify({
          cleanResponse: compFinalText,
          followUpPrompts: companionFollows,
          ...(compChartData ? { chartData: compChartData } : {})
        })}\n\n`)
        return res.end()
      } catch (streamErr: any) {
        console.error("Companion stream error:", streamErr?.message || streamErr)
        res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr?.message || "AI streaming failed" })}\n\n`)
        return res.end()
      }
    }

    // Photos routes
    if (path === "/photos" || path === "/photos/") {
      if (method === "GET") {
        const allPhotos = await db.select().from(photoAssets).orderBy(desc(photoAssets.createdAt))
        return res.json(allPhotos)
      }
    }

    // Photo file serving - redirect to Supabase Storage
    const photoFileMatch = path.match(/^\/photos\/file\/([^/]+)$/)
    if (photoFileMatch && method === "GET") {
      const storageKey = photoFileMatch[1]
      const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.storageKey, storageKey))

      if (!photo) {
        return res.status(404).json({ error: "Photo not found" })
      }

      // Get file extension from original filename or mime type
      let ext = ""
      if (photo.originalFilename) {
        const match = photo.originalFilename.match(/\.([^.]+)$/)
        if (match) ext = match[1]
      }
      if (!ext && photo.mimeType) {
        const mimeMap: Record<string, string> = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/gif": "gif",
          "image/webp": "webp"
        }
        ext = mimeMap[photo.mimeType] || "png"
      }

      // Redirect to Supabase Storage public URL
      const supabaseStorageUrl = `${SUPABASE_URL}/storage/v1/object/public/photo-assets/${storageKey}.${ext}`
      return res.redirect(302, supabaseStorageUrl)
    }

    // Proposals routes
    if (path.startsWith("/proposals")) {
      // Sync status - return status based on database content
      if ((path === "/proposals/sync/status" || path === "/proposals/sync/status/") && method === "GET") {
        // Get count from database
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(proposals)
        const totalProposals = countResult?.count || 0
        return res.json({
          configured: totalProposals > 0, // Consider "configured" if we have data
          lastSync: new Date().toISOString(),
          totalProposals,
          status: totalProposals > 0 ? "synced" : "empty",
          message: totalProposals > 0
            ? `${totalProposals} proposals loaded from database`
            : "No proposal data. Sync from local development server first."
        })
      }

      // Proposal metrics (structured data for Library browser — no AI)
      if ((path === "/proposals/metrics" || path === "/proposals/metrics/") && method === "GET") {
        const allProposals = await db.select().from(proposals).orderBy(desc(proposals.date))
        if (allProposals.length === 0) {
          return res.json({ summary: null, byService: {}, byCE: {}, bySchoolType: {}, byYear: {}, byAffiliation: {}, byCategory: {} })
        }

        type WRDim = Record<string, { won: number; total: number; rate: number }>
        const decided = allProposals.filter(p => p.won === "Yes" || p.won === "No")
        const wonCount = allProposals.filter(p => p.won === "Yes").length
        const lostCount = allProposals.filter(p => p.won === "No" || p.won === "Cancelled").length
        const pendingCount = allProposals.filter(p => p.won === "Pending" || !p.won).length
        const overall = decided.length > 0 ? wonCount / decided.length : 0

        const byService: WRDim = {}, byCE: WRDim = {}, bySchoolType: WRDim = {}
        const byYear: WRDim = {}, byAffiliation: WRDim = {}, byCategory: WRDim = {}

        for (const p of decided) {
          const isWon = p.won === "Yes"
          const inc = (dim: WRDim, key: string | null | undefined) => {
            if (!key) return
            if (!dim[key]) dim[key] = { won: 0, total: 0, rate: 0 }
            dim[key].total++
            if (isWon) dim[key].won++
          }
          inc(bySchoolType, p.schoolType)
          inc(byAffiliation, p.affiliation)
          inc(byCE, p.ce)
          inc(byCategory, p.category)
          if (p.date) inc(byYear, new Date(p.date).getFullYear().toString())
          const services = (p.servicesOffered as string[]) || []
          for (const svc of services) inc(byService, svc)
        }

        const calcRates = (dim: WRDim) => { for (const k of Object.keys(dim)) { dim[k].rate = dim[k].total > 0 ? dim[k].won / dim[k].total : 0 } }
        calcRates(byService); calcRates(byCE); calcRates(bySchoolType)
        calcRates(byYear); calcRates(byAffiliation); calcRates(byCategory)

        const dates = allProposals.map(p => p.date ? new Date(p.date) : null).filter((d): d is Date => d !== null && !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())

        return res.json({
          summary: {
            total: allProposals.length,
            won: wonCount, lost: lostCount, pending: pendingCount,
            winRate: Math.round(overall * 100),
            dateRange: { from: dates[0]?.toISOString() || null, to: dates[dates.length - 1]?.toISOString() || null },
          },
          byService, byCE, bySchoolType, byYear, byAffiliation, byCategory,
        })
      }

      // Query proposals AI
      if ((path === "/proposals/query" || path === "/proposals/query/") && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            dataUsed: { totalProposals: 0, dateRange: { from: null, to: null }, overallWinRate: 0, wonCount: 0, lostCount: 0, pendingCount: 0, byCategory: {}, momentum: "steady", rolling6Month: 0, rolling12Month: 0, yoyChange: null },
            followUpPrompts: [],
            recommendations: [],
            pendingScores: [],
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { query: userQuery } = req.body || {}

        // Get all proposals from database
        const allProposals = await db.select().from(proposals).orderBy(desc(proposals.date))

        if (allProposals.length === 0) {
          return res.json({
            response: "",
            dataUsed: { totalProposals: 0, dateRange: { from: null, to: null }, overallWinRate: 0, wonCount: 0, lostCount: 0, pendingCount: 0, byCategory: {}, momentum: "steady", rolling6Month: 0, rolling12Month: 0, yoyChange: null },
            followUpPrompts: [],
            recommendations: [],
            pendingScores: [],
            refused: true,
            refusalReason: "No proposal data found in database."
          })
        }

        // Get pipeline data (RFP intake decisions)
        const pipelineEntries = await db.select().from(proposalPipeline).orderBy(desc(proposalPipeline.dateReceived))

        // Build rich context with CE analysis, win rates by dimension, etc.
        const { systemPrompt } = buildProposalsContext(allProposals, pipelineEntries)

        // Calculate basic stats for response metadata
        const decided = allProposals.filter(p => p.won === "Yes" || p.won === "No")
        const wonCount = decided.filter(p => p.won === "Yes").length
        const lostCount = decided.filter(p => p.won === "No").length
        const pendingCount = allProposals.filter(p => !p.won || p.won === "Pending").length
        const overallWinRate = decided.length > 0 ? wonCount / decided.length : 0
        const dates = allProposals.filter(p => p.date).map(p => new Date(p.date!))
        const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
        const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
        const byCategory: Record<string, number> = {}
        allProposals.forEach(p => { if (p.category) byCategory[p.category] = (byCategory[p.category] || 0) + 1 })

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.4,
          max_tokens: 4000
        })

        const rawResponse = completion.choices[0]?.message?.content || ""

        // Parse follow-up prompts and chart data
        const { cleanResponse: pCleanFollowUp, followUpPrompts } = parseFollowUpPrompts(rawResponse, [
          "What's the trend over time?", "Break down by category", "Show top performers"
        ])
        const { cleanText: cleanResponse, chartData: pChartData } = parseChartData(pCleanFollowUp)

        return res.json({
          response: cleanResponse,
          dataUsed: {
            totalProposals: allProposals.length,
            dateRange: { from: minDate, to: maxDate },
            overallWinRate,
            wonCount,
            lostCount,
            pendingCount,
            byCategory,
            momentum: "steady",
            rolling6Month: overallWinRate,
            rolling12Month: overallWinRate,
            yoyChange: null
          },
          followUpPrompts,
          chartData: pChartData || undefined,
          recommendations: [],
          pendingScores: [],
          refused: false
        })
      }

      // Proposals stream (streaming version of /proposals/query)
      if ((path === "/proposals/stream" || path === "/proposals/stream/") && method === "POST") {
        if (!openai) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service is not configured" })}\n\n`)
          return res.end()
        }

        const { query: pStreamQuery, conversationHistory: pConvHistory } = req.body || {}

        // Get all proposals from database (same as non-streaming)
        const pStreamProposals = await db.select().from(proposals).orderBy(desc(proposals.date))

        if (pStreamProposals.length === 0) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "No proposal data found in database." })}\n\n`)
          return res.end()
        }

        // Get pipeline data
        const pStreamPipelineEntries = await db.select().from(proposalPipeline).orderBy(desc(proposalPipeline.dateReceived))

        // Build rich context with CE analysis, win rates by dimension, etc.
        const { systemPrompt: pStreamSystemPrompt } = buildProposalsContext(pStreamProposals, pStreamPipelineEntries)

        // Calculate basic stats for metadata
        const pStreamDecided = pStreamProposals.filter(p => p.won === "Yes" || p.won === "No")
        const pStreamWonCount = pStreamDecided.filter(p => p.won === "Yes").length
        const pStreamLostCount = pStreamDecided.filter(p => p.won === "No").length
        const pStreamPendingCount = pStreamProposals.filter(p => !p.won || p.won === "Pending").length
        const pStreamWinRate = pStreamDecided.length > 0 ? pStreamWonCount / pStreamDecided.length : 0
        const pStreamDates = pStreamProposals.filter(p => p.date).map(p => new Date(p.date!))
        const pStreamMinDate = pStreamDates.length > 0 ? new Date(Math.min(...pStreamDates.map(d => d.getTime()))) : null
        const pStreamMaxDate = pStreamDates.length > 0 ? new Date(Math.max(...pStreamDates.map(d => d.getTime()))) : null
        const pStreamByCategory: Record<string, number> = {}
        pStreamProposals.forEach(p => { if (p.category) pStreamByCategory[p.category] = (pStreamByCategory[p.category] || 0) + 1 })

        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")

        // Send metadata event
        const pStreamMetadata = {
          dataUsed: {
            totalProposals: pStreamProposals.length,
            dateRange: { from: pStreamMinDate, to: pStreamMaxDate },
            overallWinRate: pStreamWinRate,
            wonCount: pStreamWonCount,
            lostCount: pStreamLostCount,
            pendingCount: pStreamPendingCount,
            byCategory: pStreamByCategory,
            momentum: "steady",
            rolling6Month: pStreamWinRate,
            rolling12Month: pStreamWinRate,
            yoyChange: null
          },
          refused: false
        }
        res.write(`event: metadata\ndata: ${JSON.stringify(pStreamMetadata)}\n\n`)

        // Build messages with conversation history
        const pStreamMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: pStreamSystemPrompt }
        ]
        if (pConvHistory && Array.isArray(pConvHistory) && pConvHistory.length > 0) {
          const truncated = truncateHistory(pConvHistory)
          for (const msg of truncated) {
            pStreamMessages.push({ role: msg.role as "user" | "assistant", content: msg.content })
          }
        }
        pStreamMessages.push({ role: "user", content: pStreamQuery })

        try {
          const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: pStreamMessages,
            temperature: 0.4,
            max_tokens: 4000,
            stream: true
          })

          let fullResponse = ""
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content
            if (token) {
              fullResponse += token
              res.write(`data: ${JSON.stringify({ token })}\n\n`)
            }
          }

          const { cleanResponse: pCleanFU, followUpPrompts: pFollows } = parseFollowUpPrompts(fullResponse, [
            "What's the trend over time?",
            "Break down by category",
            "Show top performers"
          ])
          const { cleanText: pClean, chartData: pStreamChart } = parseChartData(pCleanFU)
          res.write(`event: done\ndata: ${JSON.stringify({ cleanResponse: pClean, followUpPrompts: pFollows, ...(pStreamChart ? { chartData: pStreamChart } : {}) })}\n\n`)
          return res.end()
        } catch (streamErr: any) {
          console.error("Proposals stream error:", streamErr?.message || streamErr)
          res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr?.message || "AI streaming failed" })}\n\n`)
          return res.end()
        }
      }

      // Trigger sync - not supported in serverless, return message
      if ((path === "/proposals/sync/trigger" || path === "/proposals/sync/trigger/") && method === "POST") {
        return res.json({
          synced: false,
          message: "Excel file sync is not available in the deployed version. Proposals are synced from the local development server."
        })
      }
    }

    // Unified AI routes (cross-references all data sources)
    if (path.startsWith("/unified-ai")) {
      // GET /unified-ai/stats — stats for the status bar
      if ((path === "/unified-ai/stats" || path === "/unified-ai/stats/") && method === "GET") {
        const allProposals = await db.select().from(proposals)
        const decided = allProposals.filter(p => p.won === "Yes" || p.won === "No")
        const wonCount = decided.filter(p => p.won === "Yes").length
        const winRate = decided.length > 0 ? wonCount / decided.length : 0

        const [answersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(answerItems)
        const [photosCount] = await db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)

        return res.json({
          proposals: { count: allProposals.length, winRate },
          caseStudies: { count: clientSuccessData.caseStudies.length, testimonials: clientSuccessData.testimonials.length },
          library: { answers: answersCount?.count || 0, photos: photosCount?.count || 0 }
        })
      }

      // POST /unified-ai/query — cross-referential AI query
      if ((path === "/unified-ai/query" || path === "/unified-ai/query/") && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            dataUsed: {
              proposals: { count: 0, winRate: 0, relevantClients: [] },
              caseStudies: { count: 0, clients: [], testimonials: 0 },
              library: { answers: 0, photos: 0, topics: [] }
            },
            crossReferenceInsights: [],
            followUpPrompts: [],
            refused: true,
            refusalReason: "AI service not configured. Please set OPENAI_API_KEY in your environment."
          })
        }

        const { query: uaiQuery } = req.body || {}
        if (!uaiQuery || typeof uaiQuery !== "string" || uaiQuery.trim().length < 2) {
          return res.status(400).json({ error: "Query must be at least 2 characters" })
        }

        // Load proposals
        const allProposals = await db.select().from(proposals).orderBy(desc(proposals.date))
        const decided = allProposals.filter(p => p.won === "Yes" || p.won === "No")
        const wonProposals = decided.filter(p => p.won === "Yes")
        const winRate = decided.length > 0 ? wonProposals.length / decided.length : 0

        // Search library for relevant answers
        const searchWords = uaiQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
        let libraryAnswers: any[] = []
        if (searchWords.length > 0) {
          const wordConditions = searchWords.flatMap((word: string) => [
            ilike(answerItems.question, `%${word}%`),
            ilike(answerItems.answer, `%${word}%`)
          ])
          libraryAnswers = await db.select().from(answerItems)
            .where(or(...wordConditions))
            .limit(10)
        }

        // Date range
        const dates = allProposals.filter(p => p.date).map(p => new Date(p.date!))
        const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
        const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

        // Win rates by school type
        const bySchoolType: Record<string, { won: number; total: number }> = {}
        decided.forEach(p => {
          if (p.schoolType) {
            if (!bySchoolType[p.schoolType]) bySchoolType[p.schoolType] = { won: 0, total: 0 }
            bySchoolType[p.schoolType].total++
            if (p.won === "Yes") bySchoolType[p.schoolType].won++
          }
        })

        // Win rates by service
        const byService: Record<string, { won: number; total: number }> = {}
        decided.forEach(p => {
          ((p.servicesOffered as string[]) || []).forEach(s => {
            if (!byService[s]) byService[s] = { won: 0, total: 0 }
            byService[s].total++
            if (p.won === "Yes") byService[s].won++
          })
        })

        const formatRate = (won: number, total: number) => total > 0 ? `${((won / total) * 100).toFixed(1)}%` : "N/A"

        // Build client results context
        const csSummary = clientSuccessData.caseStudies.map((cs: any) => {
          const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
          const testimonial = cs.testimonial ? `\n  Quote: "${cs.testimonial.quote.slice(0, 100)}..." — ${cs.testimonial.attribution}` : ""
          return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge.slice(0, 150)}...\n  Metrics: ${metrics || "None"}${testimonial}`
        }).join("\n\n")

        const topResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
          .slice(0, 15)
          .map((r: any) => `- ${r.result} ${r.metric} — ${r.client}`)
          .join("\n")

        const testimonials = clientSuccessData.testimonials.slice(0, 10).map((t: any) => {
          const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
          return `"${t.quote.slice(0, 150)}..." — ${who}`
        }).join("\n\n")

        // Build unified context
        const context = `
━━━ SOURCE 1: PROPOSAL HISTORY ━━━
Total Proposals: ${allProposals.length}
Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}
Won: ${wonProposals.length} | Lost: ${decided.length - wonProposals.length} | Win Rate: ${formatRate(wonProposals.length, decided.length)}

WIN RATES BY SCHOOL TYPE:
${Object.entries(bySchoolType).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([type, s]) => `- ${type}: ${formatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

WIN RATES BY SERVICE:
${Object.entries(byService).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([svc, s]) => `- ${svc}: ${formatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

RECENT WINS (last 20):
${wonProposals.slice(0, 20).map(p => `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) — ${((p.servicesOffered as string[]) || []).slice(0, 3).join(", ") || "N/A"}`).join("\n") || "No recent wins"}

━━━ SOURCE 2: CLIENT RESULTS (${clientSuccessData.caseStudies.length}) ━━━

${csSummary}

TOP-LINE RESULTS (${clientSuccessData.topLineResults.length}):
${topResults}

TESTIMONIALS (${clientSuccessData.testimonials.length}):
${testimonials}

AWARDS (${clientSuccessData.awards.length}):
${clientSuccessData.awards.slice(0, 10).map((a: any) => `- ${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}

━━━ SOURCE 3: Q&A LIBRARY ━━━
Relevant Answers Found: ${libraryAnswers.length}
${libraryAnswers.map((a: any, i: number) => `[Answer ${i + 1}]\nQ: ${a.question}\nA: ${a.answer.slice(0, 500)}${a.answer.length > 500 ? "..." : ""}`).join("\n\n") || "No relevant library answers found."}
`

        const systemPrompt = `You are the Unified AI for Stamats, a marketing agency with 100+ years of experience. You have UNIFIED ACCESS to three data sources that you MUST cross-reference:

1. **PROPOSAL HISTORY**: Win/loss records, win rates by school type/service
2. **CLIENT RESULTS**: ${clientSuccessData.caseStudies.length} client results, ${clientSuccessData.testimonials.length} testimonials, ${clientSuccessData.awards.length} awards
3. **Q&A LIBRARY**: Approved answers for RFP responses

YOUR SUPERPOWER: CROSS-REFERENCING — Connect the dots across all sources.

RULES:
1. ALWAYS cross-reference — don't just answer from one source
2. FLAG DISCONNECTS — gaps between wins and client results
3. BE SPECIFIC — real client names, real numbers, real quotes
4. NEVER INVENT — only use provided data
5. Use **bold** for key numbers and insights
6. Keep responses actionable

At the end, include 3-4 follow-ups:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

VISUALIZATIONS:${CHART_PROMPT}

--- UNIFIED DATA ---
${context}`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: uaiQuery.trim() }
          ],
          temperature: 0.4,
          max_tokens: 3000
        })

        const rawResponse = completion.choices[0]?.message?.content || ""

        // Parse follow-up prompts and chart data
        const { cleanResponse: uaiCleanFU, followUpPrompts: uaiFollowUps } = parseFollowUpPrompts(rawResponse, [
          "What gaps exist in our proof points?",
          "Which clients should we ask for testimonials?",
          "Prep me for a proposal based on this insight"
        ])
        const { cleanText: cleanResp, chartData: uaiChartData } = parseChartData(uaiCleanFU)

        // Cross-reference insights
        const caseStudyClients = new Set(clientSuccessData.caseStudies.map((cs: any) => cs.client.toLowerCase().trim()))
        const recentWins = wonProposals.filter(p => {
          if (!p.date) return false
          const twoYearsAgo = new Date()
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
          return new Date(p.date) >= twoYearsAgo
        })
        const winsWithoutCS = recentWins.filter(p => p.client && !caseStudyClients.has(p.client.toLowerCase().trim()))
        const crossInsights: string[] = []
        if (winsWithoutCS.length >= 3) {
          const clients = [...new Set(winsWithoutCS.map(p => p.client))].slice(0, 5)
          crossInsights.push(`${winsWithoutCS.length} recent wins don't have client results: ${clients.join(", ")}`)
        }

        const recentClients = wonProposals.slice(0, 10).map(p => p.client).filter((c): c is string => !!c)
        const csClients = clientSuccessData.caseStudies.slice(0, 10).map((cs: any) => cs.client)
        const uniqueTopics = [...new Set(libraryAnswers.map((a: any) => a.topicId))]

        return res.json({
          response: cleanResp,
          dataUsed: {
            proposals: { count: allProposals.length, winRate, relevantClients: recentClients },
            caseStudies: { count: clientSuccessData.caseStudies.length, clients: csClients, testimonials: clientSuccessData.testimonials.length },
            library: { answers: libraryAnswers.length, photos: 0, topics: uniqueTopics }
          },
          crossReferenceInsights: crossInsights,
          followUpPrompts: uaiFollowUps,
          chartData: uaiChartData || undefined,
          refused: false
        })
      }

      // Unified AI stream (streaming version of /unified-ai/query)
      if ((path === "/unified-ai/stream" || path === "/unified-ai/stream/") && method === "POST") {
        if (!openai) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured. Please set OPENAI_API_KEY in your environment." })}\n\n`)
          return res.end()
        }

        const { query: uaiStreamQuery, conversationHistory: uaiConvHistory } = req.body || {}
        if (!uaiStreamQuery || typeof uaiStreamQuery !== "string" || uaiStreamQuery.trim().length < 2) {
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.setHeader("X-Accel-Buffering", "no")
          res.write(`event: error\ndata: ${JSON.stringify({ error: "Query must be at least 2 characters" })}\n\n`)
          return res.end()
        }

        // Load proposals (same as non-streaming)
        const uaiStreamProposals = await db.select().from(proposals).orderBy(desc(proposals.date))
        const uaiStreamDecided = uaiStreamProposals.filter(p => p.won === "Yes" || p.won === "No")
        const uaiStreamWon = uaiStreamDecided.filter(p => p.won === "Yes")
        const uaiStreamWinRate = uaiStreamDecided.length > 0 ? uaiStreamWon.length / uaiStreamDecided.length : 0

        // Search library for relevant answers
        const uaiSearchWords = uaiStreamQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
        let uaiStreamLibraryAnswers: any[] = []
        if (uaiSearchWords.length > 0) {
          const wordConditions = uaiSearchWords.flatMap((word: string) => [
            ilike(answerItems.question, `%${word}%`),
            ilike(answerItems.answer, `%${word}%`)
          ])
          uaiStreamLibraryAnswers = await db.select().from(answerItems)
            .where(or(...wordConditions))
            .limit(10)
        }

        // Date range
        const uaiStreamDates = uaiStreamProposals.filter(p => p.date).map(p => new Date(p.date!))
        const uaiStreamMinDate = uaiStreamDates.length > 0 ? new Date(Math.min(...uaiStreamDates.map(d => d.getTime()))) : null
        const uaiStreamMaxDate = uaiStreamDates.length > 0 ? new Date(Math.max(...uaiStreamDates.map(d => d.getTime()))) : null

        // Win rates by school type
        const uaiStreamBySchoolType: Record<string, { won: number; total: number }> = {}
        uaiStreamDecided.forEach(p => {
          if (p.schoolType) {
            if (!uaiStreamBySchoolType[p.schoolType]) uaiStreamBySchoolType[p.schoolType] = { won: 0, total: 0 }
            uaiStreamBySchoolType[p.schoolType].total++
            if (p.won === "Yes") uaiStreamBySchoolType[p.schoolType].won++
          }
        })

        // Win rates by service
        const uaiStreamByService: Record<string, { won: number; total: number }> = {}
        uaiStreamDecided.forEach(p => {
          ((p.servicesOffered as string[]) || []).forEach(s => {
            if (!uaiStreamByService[s]) uaiStreamByService[s] = { won: 0, total: 0 }
            uaiStreamByService[s].total++
            if (p.won === "Yes") uaiStreamByService[s].won++
          })
        })

        const uaiFormatRate = (won: number, total: number) => total > 0 ? `${((won / total) * 100).toFixed(1)}%` : "N/A"

        // Build client results context
        const uaiStreamCsSummary = clientSuccessData.caseStudies.map((cs: any) => {
          const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
          const testimonial = cs.testimonial ? `\n  Quote: "${cs.testimonial.quote.slice(0, 100)}..." — ${cs.testimonial.attribution}` : ""
          return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge.slice(0, 150)}...\n  Metrics: ${metrics || "None"}${testimonial}`
        }).join("\n\n")

        const uaiStreamTopResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
          .slice(0, 15)
          .map((r: any) => `- ${r.result} ${r.metric} — ${r.client}`)
          .join("\n")

        const uaiStreamTestimonials = clientSuccessData.testimonials.slice(0, 10).map((t: any) => {
          const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
          return `"${t.quote.slice(0, 150)}..." — ${who}`
        }).join("\n\n")

        // Build unified context
        const uaiStreamContext = `
━━━ SOURCE 1: PROPOSAL HISTORY ━━━
Total Proposals: ${uaiStreamProposals.length}
Date Range: ${uaiStreamMinDate?.toISOString().split("T")[0] || "N/A"} to ${uaiStreamMaxDate?.toISOString().split("T")[0] || "N/A"}
Won: ${uaiStreamWon.length} | Lost: ${uaiStreamDecided.length - uaiStreamWon.length} | Win Rate: ${uaiFormatRate(uaiStreamWon.length, uaiStreamDecided.length)}

WIN RATES BY SCHOOL TYPE:
${Object.entries(uaiStreamBySchoolType).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([type, s]) => `- ${type}: ${uaiFormatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

WIN RATES BY SERVICE:
${Object.entries(uaiStreamByService).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([svc, s]) => `- ${svc}: ${uaiFormatRate(s.won, s.total)} (${s.won}/${s.total})`).join("\n") || "No data"}

RECENT WINS (last 20):
${uaiStreamWon.slice(0, 20).map(p => `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}) — ${((p.servicesOffered as string[]) || []).slice(0, 3).join(", ") || "N/A"}`).join("\n") || "No recent wins"}

━━━ SOURCE 2: CLIENT RESULTS (${clientSuccessData.caseStudies.length}) ━━━

${uaiStreamCsSummary}

TOP-LINE RESULTS (${clientSuccessData.topLineResults.length}):
${uaiStreamTopResults}

TESTIMONIALS (${clientSuccessData.testimonials.length}):
${uaiStreamTestimonials}

AWARDS (${clientSuccessData.awards.length}):
${clientSuccessData.awards.slice(0, 10).map((a: any) => `- ${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}

━━━ SOURCE 3: Q&A LIBRARY ━━━
Relevant Answers Found: ${uaiStreamLibraryAnswers.length}
${uaiStreamLibraryAnswers.map((a: any, i: number) => `[Answer ${i + 1}]\nQ: ${a.question}\nA: ${a.answer.slice(0, 500)}${a.answer.length > 500 ? "..." : ""}`).join("\n\n") || "No relevant library answers found."}
`

        const uaiStreamSystemPrompt = `You are the Unified AI for Stamats, a marketing agency with 100+ years of experience. You have UNIFIED ACCESS to three data sources that you MUST cross-reference:

1. **PROPOSAL HISTORY**: Win/loss records, win rates by school type/service
2. **CLIENT RESULTS**: ${clientSuccessData.caseStudies.length} client results, ${clientSuccessData.testimonials.length} testimonials, ${clientSuccessData.awards.length} awards
3. **Q&A LIBRARY**: Approved answers for RFP responses

YOUR SUPERPOWER: CROSS-REFERENCING — Connect the dots across all sources.

RULES:
1. ALWAYS cross-reference — don't just answer from one source
2. FLAG DISCONNECTS — gaps between wins and client results
3. BE SPECIFIC — real client names, real numbers, real quotes
4. NEVER INVENT — only use provided data
5. Use **bold** for key numbers and insights
6. Keep responses actionable

At the end, include 3-4 follow-ups:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

VISUALIZATIONS:${CHART_PROMPT}

--- UNIFIED DATA ---
${uaiStreamContext}`

        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")

        // Build cross-reference insights (same as non-streaming)
        const uaiStreamCaseStudyClients = new Set(clientSuccessData.caseStudies.map((cs: any) => cs.client.toLowerCase().trim()))
        const uaiStreamRecentWins = uaiStreamWon.filter(p => {
          if (!p.date) return false
          const twoYearsAgo = new Date()
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
          return new Date(p.date) >= twoYearsAgo
        })
        const uaiStreamWinsWithoutCS = uaiStreamRecentWins.filter(p => p.client && !uaiStreamCaseStudyClients.has(p.client.toLowerCase().trim()))
        const uaiStreamCrossInsights: string[] = []
        if (uaiStreamWinsWithoutCS.length >= 3) {
          const clients = [...new Set(uaiStreamWinsWithoutCS.map(p => p.client))].slice(0, 5)
          uaiStreamCrossInsights.push(`${uaiStreamWinsWithoutCS.length} recent wins don't have client results: ${clients.join(", ")}`)
        }

        const uaiStreamRecentClients = uaiStreamWon.slice(0, 10).map(p => p.client).filter((c): c is string => !!c)
        const uaiStreamCsClients = clientSuccessData.caseStudies.slice(0, 10).map((cs: any) => cs.client)
        const uaiStreamUniqueTopics = [...new Set(uaiStreamLibraryAnswers.map((a: any) => a.topicId))]

        // Send metadata event
        const uaiStreamMetadata = {
          dataUsed: {
            proposals: { count: uaiStreamProposals.length, winRate: uaiStreamWinRate, relevantClients: uaiStreamRecentClients },
            caseStudies: { count: clientSuccessData.caseStudies.length, clients: uaiStreamCsClients, testimonials: clientSuccessData.testimonials.length },
            library: { answers: uaiStreamLibraryAnswers.length, photos: 0, topics: uaiStreamUniqueTopics }
          },
          crossReferenceInsights: uaiStreamCrossInsights,
          refused: false
        }
        res.write(`event: metadata\ndata: ${JSON.stringify(uaiStreamMetadata)}\n\n`)

        // Build messages with conversation history
        const uaiStreamMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: uaiStreamSystemPrompt }
        ]
        if (uaiConvHistory && Array.isArray(uaiConvHistory) && uaiConvHistory.length > 0) {
          const truncated = truncateHistory(uaiConvHistory)
          for (const msg of truncated) {
            uaiStreamMessages.push({ role: msg.role as "user" | "assistant", content: msg.content })
          }
        }
        uaiStreamMessages.push({ role: "user", content: uaiStreamQuery.trim() })

        try {
          const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: uaiStreamMessages,
            temperature: 0.4,
            max_tokens: 3000,
            stream: true
          })

          let fullResponse = ""
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content
            if (token) {
              fullResponse += token
              res.write(`data: ${JSON.stringify({ token })}\n\n`)
            }
          }

          const { cleanResponse: uaiCleanFU, followUpPrompts: uaiFollows } = parseFollowUpPrompts(fullResponse, [
            "What gaps exist in our proof points?",
            "Which clients should we ask for testimonials?",
            "Prep me for a proposal based on this insight"
          ])
          const { cleanText: uaiClean, chartData: uaiStreamChart } = parseChartData(uaiCleanFU)
          res.write(`event: done\ndata: ${JSON.stringify({ cleanResponse: uaiClean, followUpPrompts: uaiFollows, ...(uaiStreamChart ? { chartData: uaiStreamChart } : {}) })}\n\n`)
          return res.end()
        } catch (streamErr: any) {
          console.error("Unified AI stream error:", streamErr?.message || streamErr)
          res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr?.message || "AI streaming failed" })}\n\n`)
          return res.end()
        }
      }
    }

    // Conversations routes
    if (path.startsWith("/conversations")) {
      if (!db) return res.status(503).json({ error: "Database unavailable" })

      // List conversations
      if ((path === "/conversations" || path === "/conversations/") && method === "GET") {
        const page = (req.query?.page as string) || undefined
        const userId = session?.userId
        const conditions = []
        if (page) conditions.push(eq(conversations.page, page as any))
        if (userId) {
          conditions.push(or(eq(conversations.userId, userId), isNull(conversations.userId)))
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined
        const rows = await db
          .select({
            id: conversations.id,
            page: conversations.page,
            title: conversations.title,
            messageCount: conversations.messages,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
          })
          .from(conversations)
          .where(where)
          .orderBy(desc(conversations.updatedAt))
          .limit(50)
        const result = rows.map(r => ({
          id: r.id,
          page: r.page,
          title: r.title,
          messageCount: Array.isArray(r.messageCount) ? r.messageCount.length : 0,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }))
        return res.json(result)
      }

      // Create conversation
      if ((path === "/conversations" || path === "/conversations/") && method === "POST") {
        const { page, title, messages } = req.body || {}
        if (!page || !title?.trim()) {
          return res.status(400).json({ error: "Page and title are required" })
        }
        const [row] = await db.insert(conversations).values({
          page,
          title: title.trim(),
          messages: messages || [],
          userId: session?.userId || null,
        }).returning()
        return res.status(201).json(row)
      }

      // Get single conversation
      const idMatch = path.match(/^\/conversations\/([^/]+)$/)
      if (idMatch && method === "GET") {
        const [row] = await db.select().from(conversations).where(eq(conversations.id, idMatch[1]))
        if (!row) return res.status(404).json({ error: "Conversation not found" })
        return res.json(row)
      }

      // Update conversation
      if (idMatch && method === "PATCH") {
        const { title, messages } = req.body || {}
        const updates: Record<string, unknown> = { updatedAt: new Date() }
        if (title !== undefined) updates.title = title.trim()
        if (messages !== undefined) updates.messages = messages
        const [row] = await db
          .update(conversations)
          .set(updates)
          .where(eq(conversations.id, idMatch[1]))
          .returning()
        if (!row) return res.status(404).json({ error: "Conversation not found" })
        return res.json(row)
      }

      // Delete conversation
      if (idMatch && method === "DELETE") {
        await db.delete(conversations).where(eq(conversations.id, idMatch[1]))
        return res.json({ success: true })
      }
    }

    // Feedback route
    if (path === "/feedback" && method === "POST") {
      const { messageId, score, page, query } = req.body || {}
      if (!messageId || (score !== "up" && score !== "down")) {
        return res.status(400).json({ error: "messageId and score (up/down) required" })
      }
      console.log(`[Feedback] ${score === "up" ? "👍" : "👎"} messageId=${messageId} page=${page || "unknown"} query="${(query || "").slice(0, 80)}"`)
      return res.json({ success: true })
    }

    // ─── Studio Inline Edit (streaming) ───
    if (path === "/studio/inline-edit" && method === "POST") {
      if (!openai) {
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service is not configured" })}\n\n`)
        return res.end()
      }

      const { selectedText, action, customInstruction, documentContext } = req.body || {}
      if (!selectedText || typeof selectedText !== "string" || selectedText.trim().length < 1) {
        return res.status(400).json({ error: "Selected text is required" })
      }
      if (!action || typeof action !== "string") {
        return res.status(400).json({ error: "Action is required" })
      }

      const INLINE_EDIT_PROMPTS: Record<string, string> = {
        rewrite: "Rewrite the following text to say the same thing in a different way. Keep the same meaning and tone but use different wording and sentence structure.",
        shorten: "Make the following text more concise while preserving all key information. Remove unnecessary words and tighten the prose.",
        expand: "Expand the following text with more detail, examples, or supporting points. Maintain the same tone and style.",
        grammar: "Fix any grammar, spelling, punctuation, or style issues in the following text. Only correct errors — do not change meaning or tone.",
        "tone-formal": "Rewrite the following text in a more formal, professional tone. Maintain the same meaning.",
        "tone-casual": "Rewrite the following text in a more conversational, approachable tone. Maintain the same meaning.",
        "tone-confident": "Rewrite the following text to sound more confident and authoritative. Remove hedging language and weak phrasing.",
      }

      const instruction = action === "custom" && customInstruction
        ? customInstruction
        : INLINE_EDIT_PROMPTS[action] || INLINE_EDIT_PROMPTS.rewrite

      let systemPrompt = `You are an expert editor for Stamats, a marketing agency specializing in higher education and healthcare. You make precise, targeted edits to selected text within documents.

RULES:
- Output ONLY the edited text — no explanations, no preamble, no quotes around it.
- Do not add markdown formatting unless the original text used it.
- Maintain consistent style with the surrounding document.
- Keep the same approximate length unless the action requires changing it (shorten/expand).`

      if (documentContext) {
        systemPrompt += `\n\nSurrounding document context (for style/tone reference):\n${String(documentContext).slice(0, 2000)}`
      }

      res.setHeader("Content-Type", "text/event-stream")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")
      res.setHeader("X-Accel-Buffering", "no")

      res.write(`event: metadata\ndata: ${JSON.stringify({ action })}\n\n`)

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `${instruction}\n\nText to edit:\n${selectedText.trim()}` },
          ],
          temperature: 0.3,
          max_tokens: 1500,
          stream: true,
        })

        let fullResponse = ""
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content
          if (token) {
            fullResponse += token
            res.write(`data: ${JSON.stringify({ token })}\n\n`)
          }
        }

        res.write(`event: done\ndata: ${JSON.stringify({ result: fullResponse.trim() })}\n\n`)
        return res.end()
      } catch (error: any) {
        console.error("Inline edit stream error:", error)
        res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Streaming failed" })}\n\n`)
        return res.end()
      }
    }

    // 404 for unmatched routes
    return res.status(404).json({ error: "Not found", path })

  } catch (error: any) {
    console.error("API Error:", error?.message || error, error?.stack)
    return res.status(500).json({ error: "Internal server error" })
  }
}
