import OpenAI from "openai"
import type { Response } from "express"
import { searchAnswers, type AnswerWithMeta } from "./answerService.js"
import { searchPhotos, type PhotoWithMeta } from "./photoService.js"
import { logAIRequest } from "./auditService.js"
import { streamCompletion, truncateHistory } from "./utils/streamHelper.js"

// Lazy-initialized OpenAI client (avoids crash when API key not set)
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

export interface AIQueryResult {
  response: string
  sources: Array<{
    id: string
    question: string
    answer: string
  }>
  photos: Array<{
    id: string
    displayTitle: string
    description: string | null
    storageKey: string
  }>
  followUpPrompts?: string[]
  refused: boolean
  refusalReason?: string
}

/**
 * Query the AI with retrieval-only pattern
 * AI can ONLY use content from the approved library
 */
export async function queryAI(
  query: string,
  options?: {
    topicId?: string
    maxSources?: number
  }
): Promise<AIQueryResult> {
  const maxSources = options?.maxSources ?? 5

  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    return {
      response: "",
      sources: [],
      photos: [],
      refused: true,
      refusalReason: "AI service not configured. Please set OPENAI_API_KEY environment variable.",
    }
  }

  try {
    // Step 1: Search for relevant approved content (answers and photos in parallel)
    const [relevantAnswers, relevantPhotos] = await Promise.all([
      searchAnswers(query, {
        topicId: options?.topicId,
        status: "Approved",
        limit: maxSources,
      }).catch(() => [] as AnswerWithMeta[]),
      searchPhotos(query, {
        topicId: options?.topicId,
        status: "Approved",
        limit: 5,
      }).catch(() => [] as PhotoWithMeta[]),
    ])

    // Step 2: Check if we have any relevant content
    if (relevantAnswers.length === 0 && relevantPhotos.length === 0) {
      await logAIRequest({
        query,
        sourceIds: [],
        refused: true,
        refusalReason: "No approved content matches the query",
      })

      return {
        response: "",
        sources: [],
        photos: [],
        refused: true,
        refusalReason: "I couldn't find any approved content in the library that matches your question. Please try rephrasing or ask about a different topic.",
      }
    }

    // Step 3: Build context from retrieved answers and photos
    const answerContextParts = relevantAnswers.map((answer, index) => {
      return `[Source ${index + 1}]
Question: ${answer.question}
Answer: ${answer.answer}`
    })

    const photoContextParts = relevantPhotos.map((photo, index) => {
      return `[Photo ${index + 1}]
Title: ${photo.displayTitle}
Description: ${photo.description || "No description"}`
    })

    const context = answerContextParts.join("\n\n") +
      (photoContextParts.length > 0 ? "\n\nRELEVANT PHOTOS:\n" + photoContextParts.join("\n\n") : "")

    // Step 4: Call OpenAI with strict retrieval-only instructions
    const openai = getOpenAI()
    if (!openai) {
      return {
        response: "",
        sources: [],
        photos: [],
        refused: true,
        refusalReason: "AI service not configured. Please set OPENAI_API_KEY environment variable.",
      }
    }

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
${context}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    })

    const rawResponse = completion.choices[0]?.message?.content || ""

    // Parse follow-up prompts
    let aiResponse = rawResponse
    let followUpPrompts: string[] = []
    const followUpMatch = rawResponse.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
    if (followUpMatch?.[1]) {
      try {
        followUpPrompts = JSON.parse(`[${followUpMatch[1]}]`)
        aiResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      } catch {
        followUpPrompts = followUpMatch[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(s => s.length > 0)
        aiResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      }
    }

    // Step 5: Format sources and photos
    const sources = relevantAnswers.map((answer) => ({
      id: answer.id,
      question: answer.question,
      answer: answer.answer,
    }))

    const photos = relevantPhotos.map((photo) => ({
      id: photo.id,
      displayTitle: photo.displayTitle,
      description: photo.description,
      storageKey: photo.storageKey,
    }))

    // Step 6: Log the request
    await logAIRequest({
      query,
      sourceIds: sources.map((s) => s.id),
      refused: false,
    })

    return {
      response: aiResponse,
      sources,
      photos,
      followUpPrompts: followUpPrompts.length > 0 ? followUpPrompts : undefined,
      refused: false,
    }
  } catch (error) {
    console.error("AI query failed:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    await logAIRequest({
      query,
      sourceIds: [],
      refused: true,
      refusalReason: `AI service error: ${errorMessage}`,
    })

    return {
      response: "",
      sources: [],
      photos: [],
      refused: true,
      refusalReason: "An error occurred while processing your question. Please try again.",
    }
  }
}

export interface AdaptContentResult {
  adaptedContent: string
  originalContent: string
  instruction: string
  refused: boolean
  refusalReason?: string
}

export type AdaptationType = "shorten" | "expand" | "bullets" | "formal" | "casual" | "custom"

/**
 * Adapt existing library content for specific RFP needs
 * Preserves the original meaning while adjusting format/length/tone
 */
export async function adaptContent(
  originalContent: string,
  adaptationType: AdaptationType,
  options?: {
    customInstruction?: string
    targetWordCount?: number
    clientName?: string
    industry?: string
  }
): Promise<AdaptContentResult> {
  // Check if OpenAI API key is configured
  const openai = getOpenAI()
  if (!openai) {
    return {
      adaptedContent: "",
      originalContent,
      instruction: adaptationType,
      refused: true,
      refusalReason: "AI service not configured. Please set OPENAI_API_KEY environment variable.",
    }
  }

  // Build the adaptation instruction based on type
  let instruction = ""
  switch (adaptationType) {
    case "shorten":
      const targetWords = options?.targetWordCount || 100
      instruction = `Shorten this content to approximately ${targetWords} words while preserving the key points and meaning. Be concise but complete.`
      break
    case "expand":
      instruction = "Expand this content with more detail and context. Add relevant elaboration while staying true to the original information. Do not add new facts not implied by the original."
      break
    case "bullets":
      instruction = "Convert this content into a clear, scannable bullet-point format. Use concise bullet points that capture the key information."
      break
    case "formal":
      instruction = "Rewrite this content in a more formal, professional tone suitable for executive-level RFP responses. Maintain all factual content."
      break
    case "casual":
      instruction = "Rewrite this content in a more conversational, approachable tone while maintaining professionalism. Keep all factual content."
      break
    case "custom":
      instruction = options?.customInstruction || "Adapt this content as requested."
      break
  }

  // Add client/industry context if provided
  let contextAddition = ""
  if (options?.clientName || options?.industry) {
    contextAddition = `\n\nContext: This is for ${options?.clientName ? `a client called "${options.clientName}"` : ""}${options?.clientName && options?.industry ? " in the " : ""}${options?.industry ? `${options.industry} industry` : ""}. Tailor the language appropriately if relevant.`
  }

  try {
    const systemPrompt = `You are an expert proposal writer helping to adapt approved content for specific RFP needs.

CRITICAL RULES:
1. You must preserve the factual accuracy of the original content
2. Do NOT add new information or claims not present in the original
3. Do NOT remove critical information unless specifically asked to shorten
4. Maintain professional quality suitable for RFP responses
5. Return ONLY the adapted content, no explanations or preamble

${instruction}${contextAddition}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please adapt the following content:\n\n${originalContent}` },
      ],
      temperature: 0.4,
      max_tokens: 1000,
    })

    const adaptedContent = completion.choices[0]?.message?.content || ""

    return {
      adaptedContent,
      originalContent,
      instruction,
      refused: false,
    }
  } catch (error) {
    console.error("Content adaptation failed:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    return {
      adaptedContent: "",
      originalContent,
      instruction,
      refused: true,
      refusalReason: `Adaptation failed: ${errorMessage}`,
    }
  }
}

/**
 * Stream Q&A Library AI via SSE
 */
export async function streamAI(
  query: string,
  res: Response,
  options?: { topicId?: string; maxSources?: number },
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const maxSources = options?.maxSources ?? 5
  const openai = getOpenAI()

  if (!openai) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service not configured." })}\n\n`)
    res.end()
    return
  }

  const [relevantAnswers, relevantPhotos] = await Promise.all([
    searchAnswers(query, { topicId: options?.topicId, status: "Approved", limit: maxSources }).catch(() => [] as AnswerWithMeta[]),
    searchPhotos(query, { topicId: options?.topicId, status: "Approved", limit: 5 }).catch(() => [] as PhotoWithMeta[]),
  ])

  if (relevantAnswers.length === 0 && relevantPhotos.length === 0) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    res.write(`event: error\ndata: ${JSON.stringify({ error: "No approved content matches the query." })}\n\n`)
    res.end()
    return
  }

  const answerContextParts = relevantAnswers.map((answer, index) => {
    return `[Source ${index + 1}]\nQuestion: ${answer.question}\nAnswer: ${answer.answer}`
  })

  const photoContextParts = relevantPhotos.map((photo, index) => {
    return `[Photo ${index + 1}]\nTitle: ${photo.displayTitle}\nDescription: ${photo.description || "No description"}`
  })

  const context = answerContextParts.join("\n\n") +
    (photoContextParts.length > 0 ? "\n\nRELEVANT PHOTOS:\n" + photoContextParts.join("\n\n") : "")

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
${context}`

  const sources = relevantAnswers.map((answer) => ({
    id: answer.id,
    question: answer.question,
    answer: answer.answer,
  }))

  const photos = relevantPhotos.map((photo) => ({
    id: photo.id,
    displayTitle: photo.displayTitle,
    description: photo.description,
    storageKey: photo.storageKey,
  }))

  const historyMessages: OpenAI.ChatCompletionMessageParam[] = conversationHistory
    ? truncateHistory(conversationHistory).map(m => ({ role: m.role, content: m.content }))
    : []

  await logAIRequest({ query, sourceIds: sources.map(s => s.id), refused: false })

  await streamCompletion({
    openai,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: query },
    ],
    temperature: 0.3,
    maxTokens: 2000,
    metadata: {
      sources,
      photos,
    },
    parseFollowUpPrompts: (response: string) => {
      let cleanResponse = response
      let prompts: string[] = []
      const match = response.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
      if (match?.[1]) {
        try {
          prompts = JSON.parse(`[${match[1]}]`)
        } catch {
          prompts = match[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(s => s.length > 0)
        }
        cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
      }
      return { cleanResponse, prompts }
    },
    res,
  })
}

/**
 * Infer the most appropriate category for content based on question and answer
 * Used during import when category is missing from the source spreadsheet
 */
export async function inferCategory(
  question: string,
  answer: string,
  availableCategories: string[]
): Promise<string | null> {
  const openai = getOpenAI()
  if (!openai) {
    return null
  }

  const categoriesList = availableCategories.map((c, i) => `${i + 1}. ${c}`).join("\n")

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a categorization assistant. Given a question and answer from a professional services company's knowledge base, determine the most appropriate category from the provided list.

AVAILABLE CATEGORIES:
${categoriesList}

RULES:
1. Return ONLY the exact category name from the list above
2. Choose the category that best matches the content's subject matter
3. If no category is a good fit, return the closest match
4. Do not add any explanation, just the category name`,
        },
        {
          role: "user",
          content: `Question: ${question.slice(0, 500)}\n\nAnswer: ${answer.slice(0, 1000)}`,
        },
      ],
      temperature: 0,
      max_tokens: 50,
    })

    const inferredCategory = completion.choices[0]?.message?.content?.trim()

    // Validate the response is one of the available categories
    if (inferredCategory && availableCategories.includes(inferredCategory)) {
      return inferredCategory
    }

    // Try case-insensitive match
    const matchedCategory = availableCategories.find(
      c => c.toLowerCase() === inferredCategory?.toLowerCase()
    )
    if (matchedCategory) {
      return matchedCategory
    }

    return null
  } catch (error) {
    console.error("Category inference failed:", error)
    return null
  }
}

/**
 * Batch infer categories for multiple entries
 * More efficient than calling inferCategory one by one
 */
export async function batchInferCategories(
  entries: Array<{ question: string; answer: string; index: number }>,
  availableCategories: string[]
): Promise<Map<number, string>> {
  const openai = getOpenAI()
  if (!openai) {
    return new Map()
  }

  const results = new Map<number, string>()
  const categoriesList = availableCategories.join(", ")

  // Process in batches of 10
  const batchSize = 10
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)

    const entriesText = batch
      .map((e, idx) => `[Entry ${idx + 1}]\nQ: ${e.question.slice(0, 200)}\nA: ${e.answer.slice(0, 300)}`)
      .join("\n\n")

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Categorize each entry below into one of these categories: ${categoriesList}

Return ONLY a JSON array of category names in the same order as the entries.
Example output: ["Category A", "Category B", "Category A"]`,
          },
          { role: "user", content: entriesText },
        ],
        temperature: 0,
        max_tokens: 500,
      })

      const responseText = completion.choices[0]?.message?.content?.trim() || "[]"
      // Extract JSON array from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const categories = JSON.parse(jsonMatch[0]) as string[]
        categories.forEach((cat, idx) => {
          const entry = batch[idx]
          if (entry && availableCategories.includes(cat)) {
            results.set(entry.index, cat)
          } else if (entry) {
            // Try case-insensitive match
            const matched = availableCategories.find(c => c.toLowerCase() === cat?.toLowerCase())
            if (matched) {
              results.set(entry.index, matched)
            }
          }
        })
      }
    } catch (error) {
      console.error(`Batch category inference failed for batch starting at ${i}:`, error)
    }
  }

  return results
}

/**
 * Validate that the AI response only uses provided sources
 * This is an additional safety check (though the prompt should handle it)
 */
export function validateResponseAgainstSources(
  response: string,
  _sources: AnswerWithMeta[]
): boolean {
  // Basic validation - check if response is reasonably short
  // and doesn't contain obvious external knowledge markers
  const suspiciousPatterns = [
    /as of (20\d{2}|my knowledge)/i,
    /i don't have access to/i,
    /based on my training/i,
    /according to (general|common) knowledge/i,
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(response)) {
      return false
    }
  }

  return true
}
