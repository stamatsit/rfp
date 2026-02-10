import { Router, type Request, type Response } from "express"
import { queryAI, adaptContent, streamAI, type AdaptationType } from "../services/aiService.js"
import { queryCaseStudyInsights, streamCaseStudyInsights } from "../services/caseStudyAIService.js"

const router = Router()

/**
 * POST /api/ai/query
 * Query the AI with a question
 * AI will only respond using approved library content
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const { query, topicId, maxSources } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    const result = await queryAI(query.trim(), {
      topicId: topicId as string | undefined,
      maxSources: maxSources ? parseInt(maxSources, 10) : undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("AI query endpoint failed:", error)
    res.status(500).json({ error: "Failed to process AI query" })
  }
})

/**
 * POST /api/ai/stream
 * Stream Q&A Library AI responses via SSE
 */
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { query, topicId, maxSources, conversationHistory, responseLength } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    await streamAI(
      query.trim(),
      res,
      { topicId: topicId as string | undefined, maxSources: maxSources ? parseInt(maxSources, 10) : undefined, responseLength: responseLength as string | undefined },
      conversationHistory
    )
  } catch (error) {
    console.error("AI stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream AI response" })
    }
  }
})

/**
 * POST /api/ai/adapt
 * Adapt existing content for specific RFP needs
 * Supports: shorten, expand, bullets, formal, casual, custom
 */
router.post("/adapt", async (req: Request, res: Response) => {
  try {
    const { content, adaptationType, customInstruction, targetWordCount, clientName, industry } = req.body

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Content is required" })
    }

    if (content.trim().length < 10) {
      return res.status(400).json({ error: "Content must be at least 10 characters" })
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: "Content must be less than 5000 characters" })
    }

    const validTypes: AdaptationType[] = ["shorten", "expand", "bullets", "formal", "casual", "custom"]
    if (!adaptationType || !validTypes.includes(adaptationType)) {
      return res.status(400).json({ error: `Invalid adaptation type. Must be one of: ${validTypes.join(", ")}` })
    }

    const result = await adaptContent(content.trim(), adaptationType as AdaptationType, {
      customInstruction: customInstruction as string | undefined,
      targetWordCount: targetWordCount ? parseInt(targetWordCount, 10) : undefined,
      clientName: clientName as string | undefined,
      industry: industry as string | undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("AI adapt endpoint failed:", error)
    res.status(500).json({ error: "Failed to adapt content" })
  }
})

/**
 * POST /api/ai/case-studies
 * AI-powered case study builder — helps users craft case studies
 */
router.post("/case-studies", async (req: Request, res: Response) => {
  try {
    const { query } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }

    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }

    const result = await queryCaseStudyInsights(query.trim())
    res.json(result)
  } catch (error) {
    console.error("Case study AI failed:", error)
    res.status(500).json({ error: "Failed to process case study request" })
  }
})

/**
 * POST /api/ai/case-studies/stream
 * Stream Case Study Insights via SSE
 */
router.post("/case-studies/stream", async (req: Request, res: Response) => {
  try {
    const { query, conversationHistory, responseLength } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }

    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }

    await streamCaseStudyInsights(query.trim(), res, conversationHistory, responseLength as string | undefined)
  } catch (error) {
    console.error("Case study stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream case study response" })
    }
  }
})

/**
 * GET /api/ai/status
 * Check if AI service is configured and available
 */
router.get("/status", async (_req: Request, res: Response) => {
  const configured = !!process.env.OPENAI_API_KEY

  res.json({
    configured,
    model: configured ? "gpt-4o" : null,
    message: configured
      ? "AI service is ready"
      : "AI service not configured. Set OPENAI_API_KEY in environment.",
  })
})

export default router
