/**
 * Structured model calls for Topic Ideation. Uses the app's model
 * (lib/aiModels.ts) with zod-validated structured output, a hard deadline,
 * and a usage meter so each run records its cost.
 */
import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import type { z } from "zod"
import { AI_MODEL } from "../lib/aiModels.js"
import { DEADLINES_MS } from "./config.js"

export interface LlmUsage {
  calls: number
  input: number
  output: number
  cached: number
  costUsd: number
}

export interface StructuredArgs<T> {
  name: string
  schema: z.ZodType<T>
  system: string
  user: string
  maxTokens: number
  signal?: AbortSignal
}

export interface LlmClient {
  structured<T>(args: StructuredArgs<T>): Promise<T>
  usage(): LlmUsage
}

export class LlmError extends Error {
  constructor(
    public kind: "length" | "refusal" | "parse" | "api" | "timeout",
    message: string,
  ) {
    super(message)
    this.name = "LlmError"
  }
}

/** $ per million tokens, from graphics/pipeline/log/pricing.ts. */
const PRICE: Record<string, { input: number; output: number; cached: number }> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cached: 0.02 },
}

export function newUsage(): LlmUsage {
  return { calls: 0, input: 0, output: 0, cached: 0, costUsd: 0 }
}

export class OpenAiLlm implements LlmClient {
  private meter = newUsage()
  constructor(
    private client: OpenAI,
    private model = AI_MODEL,
  ) {}

  usage(): LlmUsage {
    return { ...this.meter }
  }

  async structured<T>(args: StructuredArgs<T>): Promise<T> {
    let completion
    try {
      completion = await this.client.chat.completions.parse(
        {
          model: this.model,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
          response_format: zodResponseFormat(args.schema, args.name),
          max_completion_tokens: args.maxTokens,
        },
        { signal: args.signal, timeout: DEADLINES_MS.llm, maxRetries: 1 },
      )
    } catch (err) {
      if (args.signal?.aborted) throw args.signal.reason ?? err
      const name = err instanceof Error ? err.constructor.name : ""
      if (name === "LengthFinishReasonError") throw new LlmError("length", "model output was cut off")
      if (name === "APIConnectionTimeoutError") throw new LlmError("timeout", "model call timed out")
      throw new LlmError("api", err instanceof Error ? err.message.slice(0, 200) : String(err))
    }
    const u = completion.usage
    if (u) {
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0
      const price = PRICE[this.model] ?? PRICE["gpt-5.6-luna"]!
      this.meter.calls++
      this.meter.input += u.prompt_tokens
      this.meter.output += u.completion_tokens
      this.meter.cached += cached
      this.meter.costUsd += ((u.prompt_tokens - cached) * price.input + cached * price.cached + u.completion_tokens * price.output) / 1e6
    }
    const msg = completion.choices[0]?.message
    if (msg?.refusal) throw new LlmError("refusal", msg.refusal.slice(0, 200))
    if (!msg?.parsed) throw new LlmError("parse", "structured output was empty")
    return msg.parsed as T
  }
}

let _client: OpenAI | null = null
export function openAiLlm(): OpenAiLlm {
  if (!_client) {
    const key = process.env["OPENAI_API_KEY"]
    if (!key) throw new Error("OPENAI_API_KEY is not set")
    _client = new OpenAI({ apiKey: key })
  }
  return new OpenAiLlm(_client)
}
