/**
 * AI Humanizer Service — Rewrites AI-generated text to sound naturally human
 * and scores text for AI detectability.
 *
 * COMPLETELY ISOLATED from other AI services.
 * Pattern follows caseStudyAIService.ts: lazy OpenAI client, system prompt, SSE streaming.
 */

import OpenAI from "openai"
import type { Response } from "express"
import { streamCompletion, truncateHistory } from "./utils/streamHelper.js"

// ─── Lazy-initialized OpenAI client ─────────────────────────

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// ─── Interfaces ─────────────────────────────────────────────

export interface HumanizerOptions {
  tone: "professional" | "conversational" | "academic"
  strength: "light" | "balanced" | "heavy"
  twoPass: boolean
  scanOnly: boolean
}

export interface HumanizerResult {
  response: string
  followUpPrompts: string[]
  humanScore: number
  aiFlags: string[]
}

// ─── Tone Personas ──────────────────────────────────────────

const TONE_PERSONAS: Record<string, string> = {
  professional:
    "Write as a senior professional with domain expertise. Confident but not stuffy. Clear, direct sentences. Occasional industry-specific phrasing. You have been writing professionally for 15+ years.",
  conversational:
    "Write as a knowledgeable colleague explaining over coffee. Relaxed but informed. Use 'you' and 'we'. Allow personality to show. Okay to start a sentence with 'Look,' or 'Honestly,'.",
  academic:
    "Write as a published researcher. Precise terminology, careful qualifications, but still readable. Avoid jargon for jargon's sake. Nuance over simplification.",
}

// ─── Strength Levels ────────────────────────────────────────

const STRENGTH_LEVELS: Record<string, string> = {
  light:
    "Make minimal changes. Fix obvious AI tells (banned words, em dashes, parallel structure) but preserve the original voice and structure. Change roughly 20-30% of sentences.",
  balanced:
    "Rewrite substantially while keeping the same meaning and flow. Restructure sentences, vary rhythm, inject voice. Change roughly 50-60% of the text.",
  heavy:
    "Completely rewrite from scratch using the same information and key points. New sentence structures, new transitions, new flow. The output should share zero phrasing with the input.",
}

// ─── Humanize System Prompt ─────────────────────────────────

function buildHumanizePrompt(options: HumanizerOptions): string {
  return `You are a text humanizer. Your job is to rewrite AI-generated text so it reads as naturally human-written prose that is undetectable by AI content detectors like GPTZero, Turnitin, and Originality.ai.

You must preserve the original meaning, facts, and key points exactly.

=== BANNED VOCABULARY (never use these words) ===
delve, tapestry, landscape, multifaceted, comprehensive, leverage, utilize, facilitate, endeavor, paramount, pivotal, robust, seamless, synergy, holistic, nuanced, realm, foster, navigate (metaphorical), cutting-edge, spearhead, underscores, moreover, furthermore, in conclusion, it is worth noting, it's important to note, in today's, game-changer, revolutionize, embark, unlock, unleash, beacon, testament, commendable, meticulous, intricate, underpinning, arguably

=== STRUCTURAL RULES ===
1. Vary sentence length dramatically. Mix 5-word punches with 25-word flowing sentences. NEVER let 3 consecutive sentences be similar length.
2. Use contractions naturally (it's, don't, we're, that's, can't). Even formal text uses some.
3. ABSOLUTELY NEVER use em dashes (the long dash). Replace every single one with a period, comma, or parentheses. This is the most important rule. If you use even one em dash, the entire output fails.
4. Avoid semicolons. Restructure as two sentences.
5. Break parallel structure. If listing 3 things, make the third structurally different from the first two.
6. Start some sentences with "And," "But," "So," or "Or."
7. Use occasional sentence fragments. For emphasis.
8. Vary paragraph length. Some paragraphs can be one sentence. Others four or five.
9. Add voice markers sparingly: rhetorical questions, mild hedging ("probably," "tends to"), specificity over abstraction.
10. Avoid starting consecutive paragraphs the same way.
11. Prefer concrete nouns and active verbs over abstract nominalizations.
12. Do NOT end paragraphs with neat summary sentences. Let ideas trail naturally.
13. Avoid perfectly balanced intro-body-conclusion format for shorter pieces.

=== TONE ===
${TONE_PERSONAS[options.tone] || TONE_PERSONAS.professional}

=== REWRITE STRENGTH ===
${STRENGTH_LEVELS[options.strength] || STRENGTH_LEVELS.balanced}

=== OUTPUT FORMAT ===
Return ONLY the rewritten text. No meta-commentary, no "here's the rewritten version," no explanations before the text. Just the clean rewritten text.

After the rewritten text, on new lines, provide your self-analysis:

HUMAN_SCORE: [number 0-100 representing how likely this text would pass as human-written, where 100 = completely undetectable]
AI_FLAGS: ["specific pattern 1", "specific pattern 2"]

Score criteria: vocabulary naturalness (20%), sentence length variation (20%), structural unpredictability (20%), voice/personality markers (20%), overall flow and rhythm (20%).

For AI_FLAGS, list SPECIFIC remaining issues you notice in your own output. Be honest and critical. Examples: "Paragraph 2 has three sentences of similar length", "Opening is too polished". If the text is clean, use an empty array [].

Then provide follow-up suggestions:
FOLLOW_UP_PROMPTS: ["suggestion 1", "suggestion 2", "suggestion 3"]

Follow-ups should suggest useful refinements like "Make the opening more casual", "Shorten paragraph 3", "Add more personality to the conclusion".`
}

// ─── Scan-Only System Prompt ────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are an AI text detection analyst. Your job is to analyze text and score it for how likely it would be detected as AI-generated by tools like GPTZero, Turnitin, and Originality.ai.

You do NOT rewrite the text. You only analyze and score it.

=== ANALYSIS CRITERIA (each worth 20 points) ===

1. **Vocabulary naturalness** (0-20): Does the text use AI-telltale words (delve, tapestry, leverage, utilize, multifaceted, landscape, paramount, etc.)? Does it use contractions naturally? Are word choices predictable or surprising?

2. **Sentence length variation** (0-20): Does sentence length vary dramatically, or is it uniform? Humans naturally mix short and long sentences. AI tends toward medium-length uniformity.

3. **Structural unpredictability** (0-20): Are paragraphs varied in length? Is there parallel structure that feels mechanical? Do paragraphs end with neat summary sentences (an AI tell)?

4. **Voice and personality** (0-20): Does the text have a human voice? Rhetorical questions, hedging, asides, opinion markers? Or is it neutrally informative in a way that screams AI?

5. **Flow and rhythm** (0-20): Does the text read like someone actually wrote it, or like it was assembled? Are transitions natural or formulaic ("Furthermore," "Moreover," "Additionally")?

=== OUTPUT FORMAT ===

Write a brief analysis (2-4 paragraphs) explaining what you found. Be specific, referencing particular sentences or paragraphs by number. Tell the user exactly what an AI detector would flag and why.

Then provide your structured scores:

HUMAN_SCORE: [number 0-100, sum of the 5 criteria above]
AI_FLAGS: ["specific issue 1 with location", "specific issue 2 with location", ...]

For AI_FLAGS, be very specific. Good examples:
- "Paragraph 1, sentence 3: starts with 'Furthermore' (classic AI transition)"
- "Paragraphs 2-4 all have exactly 3 sentences (uniform structure)"
- "No contractions used anywhere (unnatural for this register)"
- "The word 'leverage' appears twice (AI vocabulary)"

Bad examples (too vague):
- "Some AI patterns detected"
- "Could be more human"

Then:
FOLLOW_UP_PROMPTS: ["Humanize this text", "Which paragraph is most detectable?", "Show me what to fix manually"]`

// ─── Two-Pass Review Prompt ─────────────────────────────────

const TWO_PASS_REVIEW_PROMPT = `Review the following text for any remaining AI writing patterns that detectors would flag. Look specifically for:

1. Any words from the banned list: delve, tapestry, landscape, multifaceted, comprehensive, leverage, utilize, facilitate, endeavor, paramount, pivotal, robust, seamless, synergy, holistic, nuanced, realm, foster, navigate (metaphorical), cutting-edge, spearhead, underscores, moreover, furthermore, in conclusion
2. Em dashes (the long dash character) or semicolons
3. Three or more consecutive sentences of similar length
4. Paragraphs that all start the same way
5. Missing contractions where natural speech would use them
6. Overly neat summary sentences at paragraph ends
7. Formulaic transitions

Fix ONLY the flagged portions. Keep everything else exactly as is. Return the full corrected text.

After the corrected text, provide updated scores:

HUMAN_SCORE: [0-100]
AI_FLAGS: ["any remaining issues"]
FOLLOW_UP_PROMPTS: ["suggestion 1", "suggestion 2", "suggestion 3"]`

// ─── Parsers ────────────────────────────────────────────────

function parseHumanScore(response: string): {
  cleanResponse: string
  humanScore: number
  aiFlags: string[]
} {
  let humanScore = 0
  let aiFlags: string[] = []
  let clean = response

  // Parse HUMAN_SCORE: N
  const scoreMatch = clean.match(/HUMAN_SCORE:\s*(\d+)/s)
  if (scoreMatch?.[1]) {
    humanScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
    clean = clean.replace(/HUMAN_SCORE:\s*\d+/s, "").trim()
  }

  // Parse AI_FLAGS: [...]
  const flagsMatch = clean.match(/AI_FLAGS:\s*\[([\s\S]*?)\]/s)
  if (flagsMatch?.[1]) {
    try {
      aiFlags = JSON.parse(`[${flagsMatch[1]}]`)
    } catch {
      // Manual fallback
      aiFlags = flagsMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
    }
    clean = clean.replace(/AI_FLAGS:\s*\[[\s\S]*?\]/s, "").trim()
  }

  return { cleanResponse: clean, humanScore, aiFlags }
}

function parseFollowUpPrompts(response: string): {
  cleanResponse: string
  prompts: string[]
} {
  const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)

  if (followUpMatch?.[1]) {
    try {
      const prompts = JSON.parse(`[${followUpMatch[1]}]`)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    } catch {
      const prompts = followUpMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      return { cleanResponse, prompts }
    }
  }

  return {
    cleanResponse: response,
    prompts: [
      "Make it more conversational",
      "Shorten while keeping key points",
      "Scan this version for AI patterns",
    ],
  }
}

// ─── Combined Parser (score → follow-ups → clean) ──────────

function parseAllMarkers(response: string): {
  cleanResponse: string
  humanScore: number
  aiFlags: string[]
  followUpPrompts: string[]
} {
  // Parse follow-up prompts first (they're at the very end)
  const { cleanResponse: afterFollowUps, prompts } = parseFollowUpPrompts(response)
  // Then parse score and flags
  const { cleanResponse, humanScore, aiFlags } = parseHumanScore(afterFollowUps)

  // Post-process: strip any em dashes that slipped through
  const sanitized = cleanResponse.replace(/\u2014/g, ",").replace(/\u2013/g, ",")

  return { cleanResponse: sanitized, humanScore, aiFlags, followUpPrompts: prompts }
}

// ─── Stream Humanizer Rewrite ───────────────────────────────

export async function streamHumanizerRewrite(
  text: string,
  options: HumanizerOptions,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })
    res.write(
      `event: error\ndata: ${JSON.stringify({ error: "AI service not configured. Please set OPENAI_API_KEY." })}\n\n`
    )
    res.end()
    return
  }

  const systemPrompt = options.scanOnly
    ? SCAN_SYSTEM_PROMPT
    : buildHumanizePrompt(options)

  const inputWordCount = text.split(/\s+/).filter(Boolean).length

  // Build messages
  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    : []

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: text },
  ]

  const temperature = options.scanOnly ? 0.3 : 0.9
  const maxTokens = options.scanOnly ? 2000 : 4000
  const frequencyPenalty = options.scanOnly ? 0 : 0.4
  const presencePenalty = options.scanOnly ? 0 : 0.3

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  // Send metadata
  res.write(
    `event: metadata\ndata: ${JSON.stringify({
      inputWordCount,
      mode: options.scanOnly ? "scan" : "humanize",
      tone: options.tone,
      strength: options.strength,
      twoPass: options.twoPass,
    })}\n\n`
  )

  try {
    // Pass 1: Main rewrite or scan
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature,
      max_tokens: maxTokens,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
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

    // If two-pass mode and NOT scan-only, do a second pass
    if (options.twoPass && !options.scanOnly) {
      // Parse pass 1 to get the rewritten text (strip markers)
      const pass1 = parseAllMarkers(fullResponse)

      // Signal pass transition
      res.write(`event: pass\ndata: ${JSON.stringify({ pass: 2, pass1Score: pass1.humanScore })}\n\n`)

      // Pass 2: Review and fix remaining AI tells
      const pass2Messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: buildHumanizePrompt(options) },
        { role: "user", content: text },
        { role: "assistant", content: pass1.cleanResponse },
        { role: "user", content: TWO_PASS_REVIEW_PROMPT },
      ]

      const stream2 = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: pass2Messages,
        temperature: 0.85,
        max_tokens: maxTokens,
        frequency_penalty: 0.5,
        presence_penalty: 0.4,
        stream: true,
      })

      let pass2Response = ""
      for await (const chunk of stream2) {
        const token = chunk.choices[0]?.delta?.content
        if (token) {
          pass2Response += token
          res.write(`data: ${JSON.stringify({ token, pass: 2 })}\n\n`)
        }
      }

      // Parse final result from pass 2
      const final = parseAllMarkers(pass2Response)
      res.write(
        `event: done\ndata: ${JSON.stringify({
          cleanResponse: final.cleanResponse,
          followUpPrompts: final.followUpPrompts,
          metadata: {
            humanScore: final.humanScore,
            aiFlags: final.aiFlags,
            twoPass: true,
            pass1Score: pass1.humanScore,
          },
        })}\n\n`
      )
    } else {
      // Single pass — parse and send
      const final = parseAllMarkers(fullResponse)
      res.write(
        `event: done\ndata: ${JSON.stringify({
          cleanResponse: final.cleanResponse,
          followUpPrompts: final.followUpPrompts,
          metadata: {
            humanScore: final.humanScore,
            aiFlags: final.aiFlags,
          },
        })}\n\n`
      )
    }

    res.end()
  } catch (error) {
    console.error("Humanizer stream error:", error)
    const message = error instanceof Error ? error.message : "Streaming failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}
