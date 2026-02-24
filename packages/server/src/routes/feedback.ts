/**
 * Feedback Routes — Thumbs up/down on AI responses
 */

import { Router, type Request, type Response } from "express"
import { logAudit } from "../services/auditService.js"
import { getCurrentUserName } from "../middleware/getCurrentUser.js"

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

    await logAudit({
      actionType: "AI_REQUEST",
      entityType: "SYSTEM",
      entityId: messageId,
      details: {
        feedbackScore: score,
        page: page || "unknown",
        query: (query || "").slice(0, 200),
      },
      actor: getCurrentUserName(req),
    })

    res.json({ success: true })
  } catch (error) {
    console.error("Feedback endpoint failed:", error)
    res.status(500).json({ error: "Failed to log feedback" })
  }
})

export default router
