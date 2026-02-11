/**
 * SSE Streaming Helper
 *
 * Shared utility for streaming OpenAI responses via Server-Sent Events.
 * Used by all 4 AI route handlers.
 */

import type { Response } from "express"
import type OpenAI from "openai"
import { validateTokenCount } from "../../lib/tokenCounter.js"

export interface StreamOptions {
  openai: OpenAI
  messages: OpenAI.ChatCompletionMessageParam[]
  temperature?: number
  maxTokens?: number
  metadata: Record<string, unknown>
  parseFollowUpPrompts: (response: string) => { cleanResponse: string; prompts: string[] }
  parseReviewAnnotations?: (response: string) => { cleanResponse: string; annotations: Array<{ id: string; quote: string; comment: string; severity: string; suggestedFix?: string }> }
  res: Response
}

/**
 * Stream an OpenAI completion response as SSE events.
 *
 * Event protocol:
 * - `event: metadata` — sent first with dataUsed, sources, etc.
 * - `data: { token: "..." }` — each chunk of streamed text
 * - `event: done` — sent last with cleanResponse, followUpPrompts
 * - `event: error` — on failure
 */
export async function streamCompletion({
  openai,
  messages,
  temperature = 0.4,
  maxTokens = 4000,
  metadata,
  parseFollowUpPrompts,
  parseReviewAnnotations,
  res,
}: StreamOptions): Promise<void> {
  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  // Send metadata first
  res.write(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`)

  try {
    // Validate token count before API call
    const systemMessage = messages.find(m => m.role === "system")
    const userMessages = messages.filter(m => m.role !== "system")

    if (systemMessage && typeof systemMessage.content === "string") {
      const messagesToValidate = userMessages
        .filter(m => (m.role === "user" || m.role === "assistant"))
        .map(m => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : ""
        }))

      const validation = validateTokenCount(
        systemMessage.content,
        messagesToValidate
      )

      if (!validation.valid) {
        console.warn(
          `⚠️  Token limit warning: ${validation.tokenCount} tokens (limit: ${validation.limit})`
        )
        // Truncate history if needed
        messages = truncateHistory(messages, validation.limit)
      }
    }

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature,
      max_tokens: maxTokens,
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

    // Parse structured data blocks from the complete response
    // Order: annotations first (before follow-ups which are at the very end)
    let processedResponse = fullResponse
    let reviewAnnotations: Array<{ id: string; quote: string; comment: string; severity: string; suggestedFix?: string }> | undefined

    if (parseReviewAnnotations) {
      const annotationResult = parseReviewAnnotations(processedResponse)
      processedResponse = annotationResult.cleanResponse
      if (annotationResult.annotations.length > 0) {
        reviewAnnotations = annotationResult.annotations
      }
    }

    const { cleanResponse, prompts } = parseFollowUpPrompts(processedResponse)
    const { cleanText: chartClean, chartData } = parseChartData(cleanResponse)
    const { cleanText: finalResponse, svgData } = parseSVGData(chartClean)

    // Send done event
    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse: finalResponse,
        followUpPrompts: prompts,
        ...(chartData ? { chartData } : {}),
        ...(svgData ? { svgData } : {}),
        ...(reviewAnnotations ? { reviewAnnotations } : {}),
      })}\n\n`
    )

    res.end()
  } catch (error) {
    console.error("Stream error:", error)
    const message = error instanceof Error ? error.message : "Streaming failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}

/**
 * Parse CHART_DATA from AI response.
 * Format: CHART_DATA: {"type":"bar","title":"...","data":[...],"xKey":"...","yKeys":[...]}
 */
export function parseChartData(response: string): { cleanText: string; chartData: Record<string, unknown> | null } {
  const chartMatch = response.match(/CHART_DATA:\s*(\{[\s\S]*?\})\s*$/m)

  if (chartMatch?.[1]) {
    try {
      const chartData = JSON.parse(chartMatch[1])
      // Validate required fields
      if (chartData.type && chartData.data && Array.isArray(chartData.data) && chartData.xKey && chartData.yKeys) {
        const cleanText = response.replace(/CHART_DATA:\s*\{[\s\S]*?\}\s*$/m, "").trim()
        return { cleanText, chartData }
      }
    } catch {
      // Malformed chart data — ignore
    }
  }

  return { cleanText: response, chartData: null }
}

/**
 * Parse SVG_DATA from AI response.
 * Format: SVG_DATA: <svg viewBox="0 0 800 600" xmlns="...">...</svg>
 */
export function parseSVGData(response: string): { cleanText: string; svgData: { svg: string; title: string } | null } {
  const svgMatch = response.match(/SVG_DATA:\s*(<svg[\s\S]*?<\/svg>)\s*$/m)
  if (svgMatch?.[1]) {
    const titleMatch = svgMatch[1].match(/<!--\s*title:\s*(.*?)\s*-->/)
    const cleanText = response.replace(/SVG_DATA:\s*<svg[\s\S]*?<\/svg>\s*$/m, "").trim()
    return { cleanText, svgData: { svg: svgMatch[1], title: titleMatch?.[1] || "Diagram" } }
  }
  return { cleanText: response, svgData: null }
}

/**
 * Chart prompt snippet to append to system prompts.
 * Tells the AI when and how to include chart data.
 */
export const CHART_PROMPT = `
When your response discusses quantitative comparisons, trends, or distributions involving 3+ data points, include a visualization by appending this AFTER your response text (on a new line):
CHART_DATA: {"type":"bar","title":"Chart Title","data":[{"label":"A","value":10},{"label":"B","value":20}],"xKey":"label","yKeys":["value"]}

Chart types: "bar" (comparisons), "line" (trends over time), "pie" (proportions), "area" (cumulative trends).
Only include CHART_DATA when the data is concrete and from the provided sources — never for made-up data.
Keep data arrays under 12 items. Use short labels.`

/**
 * Estimate token count for conversation history truncation.
 * Rough estimate: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Truncate conversation history to fit within a token budget.
 * Keeps the most recent messages.
 */
export function truncateHistory(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 12000
): Array<{ role: "user" | "assistant"; content: string }> {
  let totalTokens = 0
  const result: Array<{ role: "user" | "assistant"; content: string }> = []

  // Walk backwards to keep most recent messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    const tokens = estimateTokens(msg.content)
    if (totalTokens + tokens > maxTokens) break
    totalTokens += tokens
    result.unshift(msg)
  }

  return result
}
