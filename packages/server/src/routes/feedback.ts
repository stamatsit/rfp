/**
 * Feedback Routes — Thumbs up/down on AI responses
 */

import { Router, type Request, type Response } from "express"

const router = Router()

/**
 * POST /api/feedback
 * Log feedback for an AI response
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { messageId, score, page, query } = req.body

    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "messageId is required" })
    }

    if (score !== "up" && score !== "down") {
      return res.status(400).json({ error: "score must be 'up' or 'down'" })
    }

    // v1: Log to console. Database table can come later.
    console.log(`[Feedback] ${score === "up" ? "👍" : "👎"} messageId=${messageId} page=${page || "unknown"} query="${(query || "").slice(0, 80)}"`)

    res.json({ success: true })
  } catch (error) {
    console.error("Feedback endpoint failed:", error)
    res.status(500).json({ error: "Failed to log feedback" })
  }
})

export default router
