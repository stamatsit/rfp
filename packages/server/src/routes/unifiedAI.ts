/**
 * Unified AI Routes — Cross-reference intelligence hub
 */

import { Router, type Request, type Response } from "express"
import { queryUnifiedAI, getUnifiedAIStats, streamUnifiedAI } from "../services/unifiedAIService.js"

const router = Router()

/**
 * POST /api/unified-ai/query
 * Query the Unified AI
 */
router.post("/query", async (req: Request, res: Response) => {
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

    const result = await queryUnifiedAI(query.trim())
    res.json(result)
  } catch (error) {
    console.error("Unified AI query failed:", error)
    res.status(500).json({ error: "Failed to process Unified AI query" })
  }
})

/**
 * POST /api/unified-ai/stream
 * Stream Unified AI responses via SSE
 */
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { query, conversationHistory } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }

    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }

    await streamUnifiedAI(query.trim(), res, conversationHistory)
  } catch (error) {
    console.error("Unified AI stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream Unified AI response" })
    }
  }
})

/**
 * GET /api/unified-ai/stats
 * Get stats for the status bar (proposals, case studies, library counts)
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getUnifiedAIStats()
    res.json(stats)
  } catch (error) {
    console.error("Unified AI stats failed:", error)
    res.status(500).json({ error: "Failed to get Unified AI stats" })
  }
})

export default router
