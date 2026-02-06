/**
 * SSE Streaming Helper
 *
 * Shared utility for streaming OpenAI responses via Server-Sent Events.
 * Used by all 4 AI route handlers.
 */

import type { Response } from "express"
import type OpenAI from "openai"

export interface StreamOptions {
  openai: OpenAI
  messages: OpenAI.ChatCompletionMessageParam[]
  temperature?: number
  maxTokens?: number
  metadata: Record<string, unknown>
  parseFollowUpPrompts: (response: string) => { cleanResponse: string; prompts: string[] }
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
  maxTokens = 3000,
  metadata,
  parseFollowUpPrompts,
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

    // Parse follow-up prompts from the complete response
    const { cleanResponse, prompts } = parseFollowUpPrompts(fullResponse)

    // Send done event
    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse,
        followUpPrompts: prompts,
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
  maxTokens = 8000
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
