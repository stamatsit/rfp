/**
 * Token Counting Utilities
 *
 * Uses tiktoken to count tokens for OpenAI models
 * Prevents context window overflow (GPT-4o limit: 128k tokens)
 */

import { encoding_for_model } from "tiktoken"
import type { TiktokenModel } from "tiktoken"

// GPT-4o uses cl100k_base encoding
const MODEL_NAME: TiktokenModel = "gpt-4o"
const MAX_TOKENS = 128000 // GPT-4o context limit
const RESPONSE_BUFFER = 8000 // Reserve tokens for response

/**
 * Count tokens in a string
 */
export function countTokens(text: string): number {
  try {
    const encoding = encoding_for_model(MODEL_NAME)
    const tokens = encoding.encode(text)
    const count = tokens.length
    encoding.free() // Important: free memory
    return count
  } catch (error) {
    console.error("Token counting error:", error)
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4)
  }
}

/**
 * Count tokens in an array of messages
 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>
): number {
  // Each message has overhead: role + delimiters ≈ 4 tokens
  const messageOverhead = messages.length * 4
  const contentTokens = messages.reduce(
    (sum, msg) => sum + countTokens(msg.content),
    0
  )
  return messageOverhead + contentTokens
}

/**
 * Check if adding text would exceed token limit
 */
export function wouldExceedLimit(
  currentTokens: number,
  additionalText: string
): boolean {
  const additionalTokens = countTokens(additionalText)
  const total = currentTokens + additionalTokens
  return total > MAX_TOKENS - RESPONSE_BUFFER
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number
): string {
  const tokens = countTokens(text)

  if (tokens <= maxTokens) {
    return text
  }

  // Binary search to find optimal truncation point
  const encoding = encoding_for_model(MODEL_NAME)
  const encoded = encoding.encode(text)
  const truncated = encoded.slice(0, maxTokens)
  const result = new TextDecoder().decode(encoding.decode(truncated))
  encoding.free()

  return result + "..." // Indicate truncation
}

/**
 * Get available token budget for context
 */
export function getAvailableBudget(
  systemPromptTokens: number,
  historyTokens: number = 0
): number {
  const used = systemPromptTokens + historyTokens
  return Math.max(0, MAX_TOKENS - RESPONSE_BUFFER - used)
}

/**
 * Validate total token count before API call
 */
export function validateTokenCount(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): { valid: boolean; tokenCount: number; limit: number } {
  const systemTokens = countTokens(systemPrompt)
  const messageTokens = countMessageTokens(messages)
  const total = systemTokens + messageTokens

  return {
    valid: total <= MAX_TOKENS - RESPONSE_BUFFER,
    tokenCount: total,
    limit: MAX_TOKENS - RESPONSE_BUFFER,
  }
}
