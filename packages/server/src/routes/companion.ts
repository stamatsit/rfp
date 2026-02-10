import { Router } from "express"
import { streamCompanionQuery } from "../services/companionAIService.js"

const router = Router()

// POST /companion/stream — Streaming companion query via SSE
router.post("/stream", async (req, res) => {
  const { query, conversationHistory, behaviorContext } = req.body

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    res.setHeader("Content-Type", "text/event-stream")
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Query too short" })}\n\n`)
    return res.end()
  }

  await streamCompanionQuery(query.trim(), res, conversationHistory, behaviorContext)
})

export default router
