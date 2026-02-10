/**
 * Proposal Insights API Routes
 *
 * COMPLETELY ISOLATED from the Q&A library routes.
 * All routes are prefixed with /api/proposals/
 */

import { Router, type Request, type Response } from "express"
import { queryProposalInsights, streamProposalInsights, getProposalMetrics } from "../services/proposalAIService.js"
import { getSyncStatus, triggerSync } from "../services/proposalSyncService.js"

const router = Router()

/**
 * POST /api/proposals/query
 * Query the Proposal Insights AI
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const { query } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.trim().length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    const result = await queryProposalInsights(query.trim())
    res.json(result)
  } catch (error) {
    console.error("Proposal query failed:", error)
    res.status(500).json({ error: "Failed to process proposal query" })
  }
})

/**
 * POST /api/proposals/stream
 * Stream Proposal Insights via SSE
 */
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { query, conversationHistory, responseLength } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.trim().length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    await streamProposalInsights(query.trim(), res, conversationHistory, responseLength as string | undefined)
  } catch (error) {
    console.error("Proposal stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream proposal insights" })
    }
  }
})

/**
 * GET /api/proposals/sync/status
 * Get the current sync status
 */
router.get("/sync/status", async (_req: Request, res: Response) => {
  try {
    const status = await getSyncStatus()
    res.json(status)
  } catch (error) {
    console.error("Failed to get sync status:", error)
    res.status(500).json({ error: "Failed to get sync status" })
  }
})

/**
 * POST /api/proposals/sync/trigger
 * Manually trigger a sync
 */
router.post("/sync/trigger", async (_req: Request, res: Response) => {
  try {
    const result = await triggerSync()
    res.json(result)
  } catch (error) {
    console.error("Manual sync failed:", error)
    res.status(500).json({ error: "Sync failed" })
  }
})

/**
 * GET /api/proposals/metrics
 * Get structured proposal metrics for the Library data browser
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const metrics = await getProposalMetrics()
    if (!metrics) {
      return res.json({ summary: null, byService: {}, byCE: {}, bySchoolType: {}, byYear: {}, byAffiliation: {}, byCategory: {} })
    }
    res.json(metrics)
  } catch (error) {
    console.error("Failed to get proposal metrics:", error)
    res.status(500).json({ error: "Failed to get proposal metrics" })
  }
})

export default router
