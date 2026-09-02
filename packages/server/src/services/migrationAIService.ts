/**
 * Migration Matrix chat — grounded in the latest snapshot's fact sheet,
 * scoped to the dashboard view the user is on, chart-capable via the shared
 * CHART_DATA protocol. Production twin lives inline in api/index.ts.
 */
import OpenAI from "openai"
import type { Response } from "express"
import { desc } from "drizzle-orm"
import { db } from "../db/index.js"
import { mmSnapshots } from "../db/schema.js"
import { streamCompletion, truncateHistory, CHART_PROMPT } from "./utils/streamHelper.js"

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const m = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
  if (m && m[1]) {
    try {
      const prompts = JSON.parse(`[${m[1]}]`)
      return { cleanResponse: response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim(), prompts }
    } catch {
      const prompts = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
      return { cleanResponse: response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim(), prompts }
    }
  }
  return { cleanResponse: response, prompts: [] }
}

const SYSTEM = `You are the Migration Matrix assistant for Stamats' content migration team (they call the work "web page builds"). Answer questions about projects, people, capacity, deadlines, and forecasts USING ONLY the fact sheet below. Every number you state must appear in, or be directly computed from, the fact sheet. If the facts do not cover a question, say so plainly and point to the dashboard or Crystal. Be concise: one to three short sentences or a tight list. Use **bold** for key numbers. Never use em dashes or en dashes anywhere; use a comma, period, or colon instead.

At the end, include 2-3 follow-ups:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?"]

VISUALIZATIONS:${CHART_PROMPT}
Additional chart rule: chart ONLY values present in the fact sheet, never invented or extrapolated numbers.`

function sseError(res: Response, message: string) {
  if (!res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
  }
  res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
  res.end()
}

export async function streamMigrationChat(
  query: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> | undefined,
  viewContext: string,
  res: Response
): Promise<void> {
  const openai = getOpenAI()
  if (!openai) return sseError(res, "AI is not configured (missing OPENAI_API_KEY).")
  if (!db) return sseError(res, "Database unavailable.")

  const [row] = await db
    .select({ facts: mmSnapshots.facts, createdAt: mmSnapshots.createdAt })
    .from(mmSnapshots).orderBy(desc(mmSnapshots.createdAt)).limit(1)
  if (!row) return sseError(res, "No data has synced yet. Once the first snapshot arrives, I can answer.")

  let system = `${SYSTEM}\n\nFACT SHEET (computed from the spreadsheets, snapshot ${new Date(row.createdAt as unknown as string).toISOString()}):\n${JSON.stringify(typeof row.facts === "string" ? JSON.parse(row.facts) : row.facts)}`
  if (viewContext && viewContext !== "overview") {
    system += `\n\nCURRENT VIEW: the user is looking at the '${viewContext}' dashboard. Scope answers to it by default; only go broader when the question clearly asks.`
  }

  const history: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map((m) => ({ role: m.role, content: m.content }))
    : []

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: system },
      ...history,
      { role: "user", content: query },
    ],
    maxTokens: 1500,
    metadata: { context: viewContext || "overview", snapshotAt: row.createdAt },
    parseFollowUpPrompts,
    res,
  })
}

// ─── morning reports (Phase 4) ───────────────────────────────────────────────

const CRYSTAL_PROMPT = `Write the migration manager's morning brief from the fact sheet below. Structure: one headline sentence on overall health, then 3-5 tight bullets (biggest risk, best mover, capacity note, any QA flags from findings), then one recommended action. Under 200 words, plain text, no greeting, **bold** the key numbers. Never use em dashes or en dashes; use commas or colons. USING ONLY the fact sheet; never invent numbers.`

const MIGRATOR_PROMPT = (name: string) => `Write a personal morning brief for ${name}, a content migrator, from the fact sheet below. 2-4 sentences: their recent output, what they are assigned this week and where, one specific encouragement or focus. Friendly and direct, no greeting line, **bold** key numbers. Never use em dashes or en dashes. USING ONLY facts about ${name}; never invent numbers.`

export async function generateMorningReports(): Promise<{ date: string; written: number; failed: string[] }> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OPENAI_API_KEY missing")
  if (!db) throw new Error("Database unavailable")
  const { mmReports } = await import("../db/schema.js")
  const { AI_MODEL } = await import("../lib/aiModels.js")
  const { sql, eq } = await import("drizzle-orm")

  const [snap] = await db.select({ id: mmSnapshots.id, facts: mmSnapshots.facts, createdAt: mmSnapshots.createdAt })
    .from(mmSnapshots).orderBy(desc(mmSnapshots.createdAt)).limit(1)
  if (!snap) throw new Error("No snapshot yet")
  const facts = typeof snap.facts === "string" ? JSON.parse(snap.facts) : snap.facts
  const factSheet = JSON.stringify(facts)
  const date = new Date().toISOString().slice(0, 10)

  const people: string[] = (facts.team_performance || []).map((p: { person: string }) => p.person)
  const jobs: Array<{ audience: string; prompt: string }> = [
    { audience: "crystal", prompt: CRYSTAL_PROMPT },
    ...people.map((name) => ({ audience: name, prompt: MIGRATOR_PROMPT(name) })),
  ]

  // concurrent: 11 sequential calls would blow the 60s serverless budget
  const results = await Promise.allSettled(jobs.map(async (j) => {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `${j.prompt}\n\nFACT SHEET:\n${factSheet}` },
        { role: "user", content: "Write the brief." },
      ],
      max_completion_tokens: 600,
    })
    const body = (completion.choices[0]?.message?.content || "").trim()
    if (!body) throw new Error("empty reply")
    return { audience: j.audience, body }
  }))

  // idempotent per day: replace today's rows
  await db.delete(mmReports).where(eq(mmReports.reportDate, date))
  const ok = results.filter((r): r is PromiseFulfilledResult<{ audience: string; body: string }> => r.status === "fulfilled")
  for (const r of ok) {
    await db.insert(mmReports).values({ reportDate: date, audience: r.value.audience, body: r.value.body, snapshotId: snap.id })
  }
  const failed = jobs.filter((_, i) => results[i]?.status === "rejected").map((j) => j.audience)

  // retention: past 90 days keep one snapshot per day
  await db.execute(sql`DELETE FROM mm_snapshots WHERE created_at < now() - interval '90 days'
    AND id NOT IN (SELECT DISTINCT ON (created_at::date) id FROM mm_snapshots
                   WHERE created_at < now() - interval '90 days'
                   ORDER BY created_at::date, created_at DESC)`)
  return { date, written: ok.length, failed }
}
