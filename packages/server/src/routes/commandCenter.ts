/**
 * Command Center Routes — Unified AI with cross-reference intelligence
 */

import { Router, type Request, type Response } from "express"
import { queryCommandCenter, getCommandCenterStats } from "../services/commandCenterService.js"

const router = Router()

/**
 * POST /api/command-center/query
 * Query the unified Command Center AI
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

    const result = await queryCommandCenter(query.trim())
    res.json(result)
  } catch (error) {
    console.error("Command Center query failed:", error)
    res.status(500).json({ error: "Failed to process Command Center query" })
  }
})

/**
 * GET /api/command-center/stats
 * Get stats for the status bar (proposals, case studies, library counts)
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getCommandCenterStats()
    res.json(stats)
  } catch (error) {
    console.error("Command Center stats failed:", error)
    res.status(500).json({ error: "Failed to get Command Center stats" })
  }
})

export default router
