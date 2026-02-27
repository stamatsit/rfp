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
  tone: "professional" | "conversational" | "academic" | "thompson" | "wallace"
  strength: "light" | "balanced" | "heavy"
  twoPass: boolean
  scanOnly: boolean
  audience?: "general" | "executive" | "technical" | "academic"
  voiceSample?: string
}

export interface HumanizerResult {
  response: string
  followUpPrompts: string[]
  humanScore: number
  aiFlags: string[]
  paragraphScores?: Array<{ idx: number; score: number }>
}

// ─── Tone Personas ──────────────────────────────────────────

const TONE_PERSONAS: Record<string, string> = {
  professional:
    "Write as a senior professional with domain expertise. Confident but not stuffy. Clear, direct sentences. Occasional industry-specific phrasing. You have been writing professionally for 15+ years.",
  conversational:
    "Write as a knowledgeable colleague explaining over coffee. Relaxed but informed. Use 'you' and 'we'. Allow personality to show. Okay to start a sentence with 'Look,' or 'Honestly,'.",
  academic:
    "Write as a published researcher. Precise terminology, careful qualifications, but still readable. Avoid jargon for jargon's sake. Nuance over simplification.",
  thompson:
    "Write in the style of Hunter S. Thompson's journalism — first-person, visceral, opinionated, with sudden tonal shifts between deadpan and manic. Short declarative punches followed by long spiraling sentences. Occasional self-insertion and dark humor. The reader should feel like they're getting a real opinion, not a report.",
  wallace:
    "Write in the style of David Foster Wallace's nonfiction — conversational but erudite, with honest hedging ('I think', 'it seems to me'), occasional parenthetical asides (like this one), and a tendency to loop back on a point from a new angle. Never condescending. Earnest but not naive. Uses footnote-style clarifications inline.",
}

// ─── Audience Targets ────────────────────────────────────────

const AUDIENCE_TARGETS: Record<string, string> = {
  general:
    "AUDIENCE: General readers. Target Flesch-Kincaid reading level grade 8. Short sentences, common words. Explain jargon if used.",
  executive:
    "AUDIENCE: Executives and decision-makers. Front-load the outcome. Short paragraphs. No jargon. Every sentence must earn its keep — cut anything that doesn't move the point forward.",
  technical:
    "AUDIENCE: Technical practitioners. Domain-specific precision is acceptable. Avoid AI verbosity but don't dumb down. Readers will catch vague handwaving.",
  academic:
    "AUDIENCE: Academic or scholarly readers. Careful qualification. Acknowledge nuance and exceptions. Avoid overclaiming. Citation-ready phrasing (e.g., 'the evidence suggests', 'it appears that').",
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
  const audienceSection = options.audience && options.audience !== "general"
    ? `\n=== AUDIENCE ===\n${AUDIENCE_TARGETS[options.audience]}\n`
    : ""

  const voiceSection = options.voiceSample?.trim()
    ? `\n=== VOICE MATCHING ===\nThe final output MUST feel like the person who wrote this sample wrote it. Study their sentence rhythm, word choices, how they open sentences, and their level of formality. Then match it precisely:\n\n"${options.voiceSample.trim()}"\n`
    : ""

  return `You are an expert editor who specializes in making AI-generated text undetectable. You have deep knowledge of how GPTZero, Turnitin, and Originality.ai work at a technical level. Your rewrites consistently score 90%+ human.

You must preserve the original meaning, facts, and key points exactly. You are editing, not inventing.

=== HOW AI DETECTORS WORK (know your enemy) ===
AI detectors measure three things:
1. PERPLEXITY — how "surprising" each word choice is. AI writing is uniformly medium-perplexity (predictable but not boring). Human writing has high-perplexity spikes (unusual word choices) mixed with low-perplexity lulls (plain everyday phrasing). Fix by: mixing unexpected specific words with very plain simple words — never stay in the middle.
2. BURSTINESS — how much sentence length varies. AI averages 18-22 words per sentence across all sentences. Human writing has standard deviation of 8-15 words. Fix by: deliberately writing some sentences under 7 words and some over 30 words in the same paragraph.
3. STRUCTURAL FINGERPRINT — AI has recognizable paragraph shapes (3 sentences, balanced transitions, neat endings). Detectors have trained on millions of AI outputs. Fix by: making paragraph shapes irregular, ending mid-thought, using non-standard openings.

=== BANNED VOCABULARY ===
Never use any of these. Detectors know them and so do readers:
delve, tapestry, landscape, multifaceted, comprehensive, leverage, utilize, facilitate, endeavor, paramount, pivotal, robust, seamless, synergy, holistic, nuanced, realm, foster, navigate (metaphorical), cutting-edge, spearhead, underscores, moreover, furthermore, in conclusion, it is worth noting, it's important to note, in today's, game-changer, revolutionize, embark, unlock, unleash, beacon, testament, commendable, meticulous, intricate, underpinning, arguably, transformative, impactful, actionable, proactive, innovative, visionary, groundbreaking, state-of-the-art, best-in-class, world-class, streamline, optimize, accelerate, elevate, empower, catalyze, scalable, sustainable, ecosystem, moving forward, going forward, circle back, touch base, deep dive, bandwidth, in order to, it is important to, needless to say, as we can see, as mentioned above, as previously stated, plays a crucial role, plays a vital role, a wide range of, a wide variety of, a plethora of, not only...but also, while it is true that, in light of, with respect to, in terms of, best practices, at the end of the day, synergize, overarching, undeniable, integral, vital, key takeaway, substantial, significant impact, powerful, remarkable, exceptional, thorough, extensive, profound, meaningful, strategic, aligned, dedicated, positioned, designed to, focused on, aimed at, ensuring, enabling, allowing, supporting, driving, delivering, creating value, building, developing, implementing, executing, achieving, maximizing, capitalizing, harnessing, fostering growth, essential, necessary, critical, imperative, ultimate, optimal, primary, secondary, core, fundamental, baseline, framework, methodology, initiative, solution, opportunity, challenge, landscape, journey, pathway, roadmap, vision, mission, values, culture, engagement, alignment, collaboration, partnership, stakeholder, deliverable, outcome, impact, value, growth, scale

=== CONCRETE REPLACEMENT EXAMPLES ===
These show how to fix the most common AI constructs:

ABSTRACT → CONCRETE:
"significant improvement" → "cut processing time from 4 hours to 40 minutes"
"major challenge" → "the whole rollout stalled for three weeks"
"better results" → "clients stopped calling in to complain"
"robust solution" → "it held up even when traffic tripled overnight"
"key stakeholders" → "the three VPs who actually sign off on budgets"
"moving forward" → "starting next quarter" or just delete it
"it is important to note" → just say the thing
"in order to" → "to"
"leverage our expertise" → "use what we know" or "apply fifteen years of experience"
"comprehensive approach" → describe the actual approach in one sentence
"transformative impact" → describe what actually changed and for whom

PASSIVE NOMINALIZATION → ACTIVE VERB:
"the implementation of the system was completed" → "the team finished installing it"
"consideration was given to" → "we looked at" / "they considered"
"an increase in efficiency was observed" → "it got faster" / "efficiency jumped 30%"

PARALLEL LIST → BROKEN PARALLEL:
Bad: "We improve quality, reduce costs, and enhance productivity."
Good: "We improve quality and cut costs. And honestly, productivity tends to follow."

=== STRUCTURAL RULES ===
1. BURSTINESS MANDATE: Each paragraph must contain at least one sentence under 8 words AND at least one sentence over 20 words. No exceptions.
2. Use contractions naturally (it's, don't, we're, that's, can't, you'll, they've). Formal text still uses some.
3. EM DASH ZERO TOLERANCE: The character — (U+2014) is COMPLETELY FORBIDDEN. So is – (U+2013). So is the HTML entity &mdash;. So is --. If you write an em dash, the entire output is considered a failure and must be regenerated. Before outputting, search your text for every instance of — and replace it: " — " (with spaces) → period and new sentence. "word—word" (no spaces) → comma. There are NO exceptions. Not for stylistic em dashes. Not for any reason.
4. No semicolons. Split into two sentences instead.
5. PARALLEL STRUCTURE BREAK: If you write three things in a list, the third item must be structurally different from the first two.
6. Start some sentences with "And," "But," "So," "Or," or "Look," — feels more like a real person thinking.
7. Sentence fragments are fine. When used sparingly.
8. Vary paragraph length. One-sentence paragraphs are good. So are six-sentence paragraphs. Never four consecutive paragraphs of the same length.
9. Add 1–2 voice markers per page: rhetorical questions, mild hedging, asides in parentheses, a moment of honest uncertainty.
10. Never start two consecutive paragraphs the same way.
11. Concrete nouns. Active verbs. Cut nominalizations (the implementation → implementing; the consideration of → considering).
12. DO NOT end paragraphs with a summary sentence. Let the paragraph land on a detail, not a conclusion.
13. PARAGRAPH SHAPE LAW: Paragraphs with exactly 3 equal-length sentences are the #1 detector tell. Always break this — make one sentence much shorter or much longer.
14. SENTENCE RHYTHM: Two long sentences in a row must be followed by a short one. Always.
15. BANNED TRANSITIONS: Never open a paragraph with: "In addition," "Furthermore," "Moreover," "Additionally," "As a result," "Therefore," "Thus," "Consequently," "In contrast," "On the other hand," "It is worth noting."
16. NO PASSIVE CHAINS: Never write two consecutive passive-voice sentences. Active must follow passive.
17. SPECIFICITY LAW: Every abstract descriptor must become concrete. If you can't be specific, use a hedged approximation ("somewhere around half," "most of the time," "at least in our case") rather than a vague absolute.
18. WORD REPETITION: No non-trivial word (4+ letters) appears more than twice in one paragraph.
19. SENTENCE OPENING VARIETY: Consecutive sentences cannot start with the same word.
20. HEDGING BALANCE: 1–2 genuine hedges per 200 words ("tends to," "in most cases," "probably," "from what I can tell," "at least in my read of this"). This is what separates human uncertainty from AI false confidence.
21. NO THROAT-CLEARING: Delete any sentence whose only job is to introduce the next sentence. "This paper will explore..." → just explore it. "It is important to understand that..." → just say the thing.

=== SENTENCE-LEVEL THINKING PROCESS ===
Before writing each sentence, silently ask: "Would a real person write it this way, or does this sound like something a language model would generate?" If a human would find a simpler, more direct, or more specific way to say it — use that way instead. The test is: could this sentence appear in a good newspaper article, personal essay, or professional email? If yes, keep it. If it sounds like a corporate blog post, rewrite it.

=== BURSTINESS IN PRACTICE ===
Look at your output paragraph by paragraph. Count word lengths per sentence. If three consecutive sentences are within 5 words of each other in length, you have a burstiness problem. Fix by:
- Cutting one sentence in half
- Expanding another into two connected clauses
- Adding a one-word or three-word sentence ("Right." or "That's the problem." or "Not quite.")

=== TONE ===
${TONE_PERSONAS[options.tone] || TONE_PERSONAS.professional}
${audienceSection}${voiceSection}
=== REWRITE STRENGTH ===
${STRENGTH_LEVELS[options.strength] || STRENGTH_LEVELS.balanced}

=== MANDATORY SELF-CHECK BEFORE OUTPUTTING ===
Run this checklist on your output BEFORE writing it. Do not skip.

STEP 1 — EM DASH HUNT: Read every line. Find every — or – character. Replace each one:
  - " — " (spaced em dash) → end the sentence with a period, start a new sentence
  - "word—word" (unspaced) → replace with ", " (comma space)
  - If you can't find a replacement, use parentheses
  Do not output until zero em dashes remain.

STEP 2 — BANNED WORDS: Scan for: leverage, utilize, delve, transformative, impactful, seamless, robust, comprehensive, furthermore, moreover, in conclusion, paramount, pivotal. Replace any found.

STEP 3 — PARAGRAPH CHECK: Find any paragraph with exactly 3 sentences of similar length. Restructure one.

STEP 4 — PASSIVE CHAIN CHECK: Find any two consecutive passive-voice sentences. Make one active.

STEP 5 — ABSTRACT CHECK: Find any adjective like "significant," "major," "key," "important," "substantial." Ask: can this be replaced with a specific number or concrete description? If yes, replace it.

=== OUTPUT FORMAT ===
Return ONLY the rewritten text. No preamble. No "here's the rewrite." No label. Start with the first word of the actual text.

After the rewritten text, on new lines:

HUMAN_SCORE: [0-100. Be calibrated: 90+ means a professional human editor reviewed it. 70-89 means it'd likely pass automated detectors but a careful human reader might notice a few patterns. Under 70 means it still has obvious AI tells. Score honestly.]

AI_FLAGS: ["specific issue with location, e.g. 'Paragraph 3 ends with a summary sentence'", ...]

FOLLOW_UP_PROMPTS: ["specific actionable suggestion", "specific actionable suggestion", "specific actionable suggestion"]

For FOLLOW_UP_PROMPTS, be specific and actionable: "Paragraph 2 still sounds corporate — rewrite just that one" not "Make it more human."
`
}

// ─── Adversarial Two-Pass Prompt ─────────────────────────────

const ADVERSARIAL_REVIEWER_PROMPT = `You are acting as a GPTZero / Turnitin AI detector. Your job is to read the text below and catch every sentence or phrase that still sounds AI-generated. Then you will rewrite ONLY those flagged portions.

=== WHAT DETECTORS LOOK FOR ===
1. **Burstiness failure**: Three or more consecutive sentences of similar length (all medium, all long, or all short)
2. **Banned vocabulary**: any of these words appearing — delve, tapestry, leverage, utilize, multifaceted, transformative, impactful, actionable, proactive, seamless, robust, holistic, comprehensive, streamline, optimize, elevate, empower, synergy, paramount, pivotal, foster, furthermore, moreover, in conclusion, underpinning, overarching, integral
3. **Em dashes** (—) or semicolons
4. **Transition openers**: paragraphs starting with "In addition", "Furthermore", "Moreover", "Additionally", "As a result", "Therefore", "Thus"
5. **Perfectly parallel lists**: three items that all follow the exact same grammatical structure
6. **Zero hedging**: no "probably", "tends to", "in most cases", "from what I can tell" anywhere
7. **Neat summary sentences**: paragraph endings that neatly summarize what was just said
8. **Passive chains**: two consecutive passive-voice sentences
9. **Opening repetition**: consecutive sentences starting with the same word
10. **Abstract where concrete works**: "significant improvement" instead of a specific number or example

=== YOUR JOB ===
Step 1: List every flagged sentence/phrase (be specific — quote it).
Step 2: For each flagged item, write a replacement that fixes the AI tell.
Step 3: Output the full corrected text with all replacements applied. Keep every non-flagged sentence exactly as-is.

After the corrected text:

HUMAN_SCORE: [0-100, be honest — if you're still catching tells, score lower]
AI_FLAGS: ["any remaining issues you could not fully fix"]
FOLLOW_UP_PROMPTS: ["suggestion 1", "suggestion 2", "suggestion 3"]`

// ─── Scan-Only System Prompt ────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are an AI text detection analyst. Your job is to analyze text and score it for how likely it would be detected as AI-generated by tools like GPTZero, Turnitin, and Originality.ai.

You do NOT rewrite the text. You only analyze and score it.

=== ANALYSIS CRITERIA (each worth 20 points) ===

1. **Vocabulary naturalness** (0-20): Does the text use AI-telltale words (delve, tapestry, leverage, utilize, multifaceted, landscape, paramount, transformative, impactful, actionable, etc.)? Does it use contractions naturally? Are word choices predictable or surprising?

2. **Sentence length variation** (0-20): Does sentence length vary dramatically, or is it uniform? Humans naturally mix short and long sentences. AI tends toward medium-length uniformity.

3. **Structural unpredictability** (0-20): Are paragraphs varied in length? Is there parallel structure that feels mechanical? Do paragraphs end with neat summary sentences (an AI tell)? Does every paragraph have exactly 3 sentences?

4. **Voice and personality** (0-20): Does the text have a human voice? Rhetorical questions, hedging, asides, opinion markers? Or is it neutrally informative in a way that screams AI?

5. **Flow and rhythm** (0-20): Does the text read like someone actually wrote it, or like it was assembled? Are transitions natural or formulaic ("Furthermore," "Moreover," "Additionally," "In addition")?

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

// ─── Paragraph Rewrite Prompt ───────────────────────────────

function buildParagraphRewritePrompt(rawText: string, options: HumanizerOptions): string {
  return `You are rewriting a single paragraph to sound more human. The surrounding context is provided for tonal consistency only — do NOT rewrite it.

${rawText}

=== RULES ===
Apply all standard humanization rules:
- No banned words: delve, tapestry, leverage, utilize, multifaceted, transformative, impactful, actionable, proactive, streamline, optimize, elevate, empower, moreover, furthermore, in conclusion, etc.
- NEVER use em dashes (—). Replace with a period, comma, or parentheses.
- Vary sentence length. Mix short punches with longer flowing sentences.
- No passive voice chains.
- No perfectly balanced structure.
- Use contractions where natural.
- Insert at least one genuine hedge ("tends to", "in most cases", "probably").

${TONE_PERSONAS[options.tone] || TONE_PERSONAS.professional}

Return ONLY the rewritten paragraph. Nothing else — no labels, no commentary, no "here is the rewritten paragraph".`
}

// ─── Sentence Rewrite Prompt ─────────────────────────────────

function buildSentenceRewritePrompt(rawText: string, options: HumanizerOptions): string {
  return `You are rewriting a single sentence to sound more human. Context is provided for tonal consistency only — do NOT rewrite it.

${rawText}

=== RULES ===
- No banned AI vocabulary (delve, leverage, utilize, transformative, impactful, seamless, robust, etc.)
- NEVER use em dashes (—)
- Keep the same meaning
- Make it feel like a real person wrote it — allow personality, specificity, unexpected word choices
- Use contractions if natural
- If the original is overly abstract, make it concrete

${TONE_PERSONAS[options.tone] || TONE_PERSONAS.professional}

Return ONLY the rewritten sentence. One sentence. Nothing else.`
}

// ─── Paragraph Scoring Prompt ────────────────────────────────

function buildParagraphScoringPrompt(text: string): string {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  const numbered = paragraphs.map((p, i) => `[${i}] ${p}`).join("\n\n")

  return `Score each numbered paragraph below for how likely it is to be detected as AI-generated. Score 0-100 where 100 = fully human, 0 = obvious AI.

${numbered}

Consider: banned vocabulary, sentence length uniformity, parallel structure, missing contractions, neat summary endings, transition word openers, missing hedges.

Respond ONLY with this exact format — no explanation, nothing else:
PARAGRAPH_SCORES: [{"idx": 0, "score": 75}, {"idx": 1, "score": 88}, ...]`
}

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

function parseParagraphScores(response: string): Array<{ idx: number; score: number }> {
  const match = response.match(/PARAGRAPH_SCORES:\s*(\[[\s\S]*?\])/s)
  if (!match?.[1]) return []
  try {
    return JSON.parse(match[1]) as Array<{ idx: number; score: number }>
  } catch {
    return []
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
  const { cleanResponse, humanScore: parsedScore, aiFlags } = parseHumanScore(afterFollowUps)

  const finalScore = parsedScore

  // Inject better follow-ups for low-scoring results
  const finalPrompts =
    prompts.length > 0
      ? prompts
      : finalScore < 60
      ? [
          "Rewrite this again with heavy strength",
          "Which phrases still sound like AI? Fix only those.",
          "Try completely different sentence structure for each paragraph",
        ]
      : [
          "Make it more conversational",
          "Shorten while keeping key points",
          "Scan this version for AI patterns",
        ]

  // Aggressive em-dash / en-dash sanitization — zero tolerance
  const sanitized = cleanResponse
    // Spaced em dash " — " → capitalize next word and start new sentence
    .replace(/\s\u2014\s([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
    .replace(/\s\u2014\s/g, ". ")
    // Unspaced em dash word—word → word, word
    .replace(/(\w)\u2014(\w)/g, "$1, $2")
    // Any remaining em dash
    .replace(/\u2014/g, ", ")
    // En dash variants
    .replace(/\s\u2013\s/g, " to ")
    .replace(/(\w)\u2013(\w)/g, "$1 to $2")
    .replace(/\u2013/g, ", ")
    // HTML entities
    .replace(/&mdash;/g, ", ")
    .replace(/&ndash;/g, " to ")
    .replace(/&#8212;/g, ", ")
    .replace(/&#8211;/g, ", ")
    // Double-hyphen used as em dash substitute
    .replace(/\s--\s/g, ". ")
    .replace(/--/g, ", ")

  return { cleanResponse: sanitized, humanScore: finalScore, aiFlags, followUpPrompts: finalPrompts }
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

  // ─── Special modes ─────────────────────────────────────────

  const isParagraphRewrite = text.startsWith("[PARAGRAPH REWRITE]")
  const isSentenceRewrite = text.startsWith("[SENTENCE REWRITE]")
  const isRefine = text.startsWith("[REFINE]")

  if (isParagraphRewrite) {
    await streamParagraphRewrite(text, options, openai, res)
    return
  }

  if (isSentenceRewrite) {
    await streamSentenceRewrite(text, options, openai, res)
    return
  }

  if (isRefine) {
    await streamRefine(text, options, openai, res, conversationHistory)
    return
  }

  // ─── Standard humanize / scan ─────────────────────────────

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
  const frequencyPenalty = options.scanOnly ? 0 : 0.45
  const presencePenalty = options.scanOnly ? 0 : 0.35

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

    // If two-pass mode and NOT scan-only, do adversarial second pass
    if (options.twoPass && !options.scanOnly) {
      // Parse pass 1 to get the rewritten text (strip markers)
      const pass1 = parseAllMarkers(fullResponse)

      // Signal pass transition
      res.write(`event: pass\ndata: ${JSON.stringify({ pass: 2, pass1Score: pass1.humanScore })}\n\n`)

      // Pass 2: Adversarial reviewer catches remaining AI tells
      const pass2Messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: buildHumanizePrompt(options) },
        { role: "user", content: text },
        { role: "assistant", content: pass1.cleanResponse },
        { role: "user", content: ADVERSARIAL_REVIEWER_PROMPT + "\n\nText to review:\n\n" + pass1.cleanResponse },
      ]

      const stream2 = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: pass2Messages,
        temperature: 0.95,
        max_tokens: maxTokens,
        frequency_penalty: 0.5,
        presence_penalty: 0.45,
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

      // Fire paragraph scoring in background (non-blocking)
      let paragraphScores: Array<{ idx: number; score: number }> = []
      try {
        paragraphScores = await scoreParagraphs(final.cleanResponse, openai)
      } catch {
        // scoring is optional — don't fail the whole request
      }

      res.write(
        `event: done\ndata: ${JSON.stringify({
          cleanResponse: final.cleanResponse,
          followUpPrompts: final.followUpPrompts,
          originalText: text,
          metadata: {
            humanScore: final.humanScore,
            aiFlags: final.aiFlags,
            paragraphScores,
            twoPass: true,
            pass1Score: pass1.humanScore,
            mode: "humanize",
          },
        })}\n\n`
      )
    } else {
      // Single pass — parse and send
      const final = parseAllMarkers(fullResponse)

      let paragraphScores: Array<{ idx: number; score: number }> = []
      if (!options.scanOnly) {
        try {
          paragraphScores = await scoreParagraphs(final.cleanResponse, openai)
        } catch {
          // scoring is optional
        }
      }

      res.write(
        `event: done\ndata: ${JSON.stringify({
          cleanResponse: final.cleanResponse,
          followUpPrompts: final.followUpPrompts,
          originalText: options.scanOnly ? undefined : text,
          metadata: {
            humanScore: final.humanScore,
            aiFlags: final.aiFlags,
            paragraphScores,
            mode: options.scanOnly ? "scan" : "humanize",
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

// ─── Paragraph Scoring (gpt-4o-mini, non-streaming) ──────────

async function scoreParagraphs(
  text: string,
  openai: OpenAI
): Promise<Array<{ idx: number; score: number }>> {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  if (paragraphs.length === 0) return []

  const prompt = buildParagraphScoringPrompt(text)

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 300,
  })

  const raw = resp.choices[0]?.message?.content ?? ""
  return parseParagraphScores(raw)
}

// ─── Paragraph Rewrite Handler ───────────────────────────────

async function streamParagraphRewrite(
  rawText: string,
  options: HumanizerOptions,
  openai: OpenAI,
  res: Response
): Promise<void> {
  const systemPrompt = buildParagraphRewritePrompt(rawText, options)

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  res.write(`event: metadata\ndata: ${JSON.stringify({ mode: "paragraph-rewrite" })}\n\n`)

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.92,
      max_tokens: 1000,
      frequency_penalty: 0.45,
      presence_penalty: 0.35,
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

    // Strip any stray markers — paragraph rewrites return only text
    const clean = fullResponse
      .replace(/HUMAN_SCORE:.*$/m, "")
      .replace(/AI_FLAGS:.*$/m, "")
      .replace(/FOLLOW_UP_PROMPTS:.*$/m, "")
      .replace(/\s\u2014\s([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
      .replace(/\s\u2014\s/g, ". ")
      .replace(/(\w)\u2014(\w)/g, "$1, $2")
      .replace(/\u2014/g, ", ")
      .replace(/\s\u2013\s/g, " to ")
      .replace(/\u2013/g, ", ")
      .replace(/&mdash;/g, ", ")
      .replace(/&#8212;/g, ", ")
      .replace(/\s--\s/g, ". ")
      .replace(/--/g, ", ")
      .trim()

    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse: clean,
        followUpPrompts: [],
        metadata: { mode: "paragraph-rewrite" },
      })}\n\n`
    )
    res.end()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paragraph rewrite failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}

// ─── Sentence Rewrite Handler ────────────────────────────────

async function streamSentenceRewrite(
  rawText: string,
  options: HumanizerOptions,
  openai: OpenAI,
  res: Response
): Promise<void> {
  const systemPrompt = buildSentenceRewritePrompt(rawText, options)

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  res.write(`event: metadata\ndata: ${JSON.stringify({ mode: "sentence-rewrite" })}\n\n`)

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.93,
      max_tokens: 300,
      frequency_penalty: 0.5,
      presence_penalty: 0.4,
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

    const clean = fullResponse
      .replace(/\s\u2014\s([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
      .replace(/\s\u2014\s/g, ". ")
      .replace(/(\w)\u2014(\w)/g, "$1, $2")
      .replace(/\u2014/g, ", ")
      .replace(/\s\u2013\s/g, " to ")
      .replace(/\u2013/g, ", ")
      .replace(/&mdash;/g, ", ")
      .replace(/&#8212;/g, ", ")
      .replace(/\s--\s/g, ". ")
      .replace(/--/g, ", ")
      .trim()

    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse: clean,
        followUpPrompts: [],
        metadata: { mode: "sentence-rewrite" },
      })}\n\n`
    )
    res.end()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sentence rewrite failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}

// ─── Refine Handler ──────────────────────────────────────────

async function streamRefine(
  rawText: string,
  options: HumanizerOptions,
  openai: OpenAI,
  res: Response,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  // Parse: [REFINE]\n\nCURRENT DOCUMENT:\n...\n\nINSTRUCTION: ...
  const docMatch = rawText.match(/CURRENT DOCUMENT:\n([\s\S]*?)\n\nINSTRUCTION:\s*([\s\S]*)$/)
  const currentDoc = docMatch?.[1]?.trim() ?? ""
  const instruction = docMatch?.[2]?.trim() ?? rawText.replace("[REFINE]", "").trim()

  const systemPrompt = buildHumanizePrompt(options)

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    : []

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    {
      role: "user",
      content: `Here is the current document:\n\n${currentDoc}\n\nInstruction: ${instruction}`,
    },
  ]

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  res.write(`event: metadata\ndata: ${JSON.stringify({ mode: "humanize", isRefine: true })}\n\n`)

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.88,
      max_tokens: 4000,
      frequency_penalty: 0.45,
      presence_penalty: 0.35,
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

    const final = parseAllMarkers(fullResponse)

    let paragraphScores: Array<{ idx: number; score: number }> = []
    try {
      paragraphScores = await scoreParagraphs(final.cleanResponse, openai)
    } catch {
      // optional
    }

    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse: final.cleanResponse,
        followUpPrompts: final.followUpPrompts,
        originalText: currentDoc,
        metadata: {
          humanScore: final.humanScore,
          aiFlags: final.aiFlags,
          paragraphScores,
          mode: "humanize",
          isRefine: true,
        },
      })}\n\n`
    )
    res.end()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refine failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}
