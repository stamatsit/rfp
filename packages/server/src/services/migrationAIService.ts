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

const SYSTEM = `You are the Migration Matrix assistant for Stamats' content migration team (they call the work "web page builds"). Answer questions about projects, people, capacity, deadlines, and forecasts USING ONLY the fact sheet below. Every number you state must appear in, or be directly computed from, the fact sheet. If the facts do not cover a question, say so plainly and point to the dashboard or Crystal. Be concise: one to three short sentences or a tight list. Use **bold** for key numbers.

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

  let system = `${SYSTEM}\n\nFACT SHEET (computed from the spreadsheets, snapshot ${new Date(row.createdAt as unknown as string).toISOString()}):\n${JSON.stringify(row.facts)}`
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
