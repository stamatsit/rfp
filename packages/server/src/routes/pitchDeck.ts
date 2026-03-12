/**
 * Pitch Deck AI Routes
 *
 * Restricted to eric.yerke@stamats.com only.
 * All routes prefixed with /api/pitch-deck/
 */

import { Router, type Request, type Response, type NextFunction } from "express"
import { streamPitchDeckDesign, getDeck, storeDeck } from "../services/pitchDeckAIService.js"
import { renderPitchDeck, type PitchDeckOutput } from "../services/pitchDeckRenderer.js"

const router = Router()

// ─── Access Control ──────────────────────────────────────────

function requireEricYerke(req: Request, res: Response, next: NextFunction) {
  if (req.session?.userEmail !== "eric.yerke@stamats.com") {
    return res.status(403).json({ error: "Access denied" })
  }
  next()
}

router.use(requireEricYerke)

// ─── POST /api/pitch-deck/stream ─────────────────────────────

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

    await streamPitchDeckDesign(query.trim(), res, conversationHistory, responseLength as string | undefined)
  } catch (error) {
    console.error("Pitch deck stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream pitch deck design" })
    }
  }
})

// ─── POST /api/pitch-deck/render ─────────────────────────────
// Client sends deck JSON after receiving it from the stream's done event.
// Server renders it to .pptx and returns a download ID.

router.post("/render", async (req: Request, res: Response) => {
  try {
    const { deckData } = req.body as { deckData: PitchDeckOutput }

    if (!deckData?.deckTitle || !Array.isArray(deckData.slides) || deckData.slides.length === 0) {
      return res.status(400).json({ error: "Invalid deck data" })
    }

    const buffer = await renderPitchDeck(deckData)
    const downloadId = storeDeck(buffer, deckData.deckTitle, deckData)

    res.json({ downloadId, slideCount: deckData.slides.length })
  } catch (error) {
    console.error("Pitch deck render failed:", error)
    res.status(500).json({ error: "Failed to render pitch deck" })
  }
})

// ─── GET /api/pitch-deck/download/:id ────────────────────────

router.get("/download/:id", async (req: Request, res: Response) => {
  try {
    const deck = getDeck(req.params.id!)

    if (!deck) {
      return res.status(404).json({ error: "Deck not found or expired. Try regenerating." })
    }

    const safeTitle = deck.title.replace(/[^a-zA-Z0-9 -]/g, "").trim() || "Pitch Deck"

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pptx"`)
    res.send(deck.buffer)
  } catch (error) {
    console.error("Pitch deck download failed:", error)
    res.status(500).json({ error: "Failed to download pitch deck" })
  }
})

export default router
