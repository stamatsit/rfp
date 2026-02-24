import { Router, type Request, type Response } from "express"
import { getAnswers, getAnswerById, searchAnswers } from "../services/answerService.js"
import { getPhotos, getPhotoById, searchPhotos } from "../services/photoService.js"
import {
  linkAnswerToPhoto,
  unlinkAnswerFromPhoto,
  getLinkedPhotos,
  getLinkedAnswers,
} from "../services/linkService.js"
import { logCopy } from "../services/auditService.js"
import { requireWriteAccess } from "../middleware/auth.js"
import { db } from "../db/index.js"
import { answerItems } from "../db/schema.js"
import { eq, sql } from "drizzle-orm"
import { getCurrentUserName } from "../middleware/getCurrentUser.js"

const router = Router()

/**
 * GET /api/search
 * Search both answers and photos
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { q, type, topicId, status, limit, offset } = req.query

    const query = (q as string)?.trim() || ""
    const searchType = type as "all" | "answers" | "photos" | undefined
    const searchLimit = limit ? parseInt(limit as string, 10) : 50
    const searchOffset = offset ? parseInt(offset as string, 10) : 0
    const filterOpts = {
      topicId: topicId as string | undefined,
      status: status as "Approved" | "Draft" | undefined,
    }

    let answers: Awaited<ReturnType<typeof searchAnswers>> = []
    let photos: Awaited<ReturnType<typeof searchPhotos>> = []
    let totalAnswers = 0
    let totalPhotos = 0

    // If no query, just get all items with filters
    if (!query) {
      if (searchType !== "photos") {
        const allAnswers = await getAnswers(filterOpts)
        totalAnswers = allAnswers.length
        answers = allAnswers.slice(searchOffset, searchOffset + searchLimit)
      }
      if (searchType !== "answers") {
        const allPhotos = await getPhotos(filterOpts)
        totalPhotos = allPhotos.length
        photos = allPhotos.slice(searchOffset, searchOffset + searchLimit)
      }
    } else {
      // Search with query
      if (searchType !== "photos") {
        const allAnswers = await searchAnswers(query, filterOpts)
        totalAnswers = allAnswers.length
        answers = allAnswers.slice(searchOffset, searchOffset + searchLimit)
      }
      if (searchType !== "answers") {
        const allPhotos = await searchPhotos(query, filterOpts)
        totalPhotos = allPhotos.length
        photos = allPhotos.slice(searchOffset, searchOffset + searchLimit)
      }
    }

    res.json({
      answers,
      photos,
      totalAnswers,
      totalPhotos,
    })
  } catch (error) {
    console.error("Search failed:", error)
    res.status(500).json({ error: "Search failed" })
  }
})

/**
 * GET /api/search/answers
 * Search answers only
 */
router.get("/answers", async (req: Request, res: Response) => {
  try {
    const { q, topicId, status, limit } = req.query

    const query = (q as string)?.trim() || ""
    const searchLimit = limit ? parseInt(limit as string, 10) : undefined

    let answers: Awaited<ReturnType<typeof searchAnswers>>

    if (!query) {
      answers = await getAnswers({
        topicId: topicId as string | undefined,
        status: status as "Approved" | "Draft" | undefined,
        limit: searchLimit,
      })
    } else {
      answers = await searchAnswers(query, {
        topicId: topicId as string | undefined,
        status: status as "Approved" | "Draft" | undefined,
        limit: searchLimit,
      })
    }

    res.json(answers)
  } catch (error) {
    console.error("Search answers failed:", error)
    res.status(500).json({ error: "Search failed" })
  }
})

/**
 * GET /api/search/photos
 * Search photos only
 */
router.get("/photos", async (req: Request, res: Response) => {
  try {
    const { q, topicId, status, limit } = req.query

    const query = (q as string)?.trim() || ""
    const searchLimit = limit ? parseInt(limit as string, 10) : undefined

    let photos: Awaited<ReturnType<typeof searchPhotos>>

    if (!query) {
      photos = await getPhotos({
        topicId: topicId as string | undefined,
        status: status as "Approved" | "Draft" | undefined,
        limit: searchLimit,
      })
    } else {
      photos = await searchPhotos(query, {
        topicId: topicId as string | undefined,
        status: status as "Approved" | "Draft" | undefined,
        limit: searchLimit,
      })
    }

    res.json(photos)
  } catch (error) {
    console.error("Search photos failed:", error)
    res.status(500).json({ error: "Search failed" })
  }
})

/**
 * GET /api/search/answers/:id
 * Get a single answer with full details
 */
router.get("/answers/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Answer ID is required" })
    }

    const answer = await getAnswerById(id)

    if (!answer) {
      return res.status(404).json({ error: "Answer not found" })
    }

    // Get linked photos
    const linkedPhotos = await getLinkedPhotos(id)

    res.json({
      ...answer,
      linkedPhotos,
    })
  } catch (error) {
    console.error("Failed to get answer:", error)
    res.status(500).json({ error: "Failed to get answer" })
  }
})

/**
 * GET /api/search/photos/:id
 * Get a single photo with full details
 */
router.get("/photos/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const photo = await getPhotoById(id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Get linked answers
    const linkedAnswers = await getLinkedAnswers(id)

    res.json({
      ...photo,
      linkedAnswers,
    })
  } catch (error) {
    console.error("Failed to get photo:", error)
    res.status(500).json({ error: "Failed to get photo" })
  }
})

/**
 * POST /api/search/answers/:id/copy
 * Log a copy event for an answer
 */
router.post("/answers/:id/copy", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Answer ID is required" })
    }

    await logCopy(id)

    // Also increment usage count
    if (db) {
      await db
        .update(answerItems)
        .set({
          usageCount: sql`${answerItems.usageCount} + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(answerItems.id, id))
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Failed to log copy:", error)
    res.status(500).json({ error: "Failed to log copy" })
  }
})

/**
 * POST /api/search/link
 * Link an answer to a photo
 */
router.post("/link", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const { answerId, photoId } = req.body

    if (!answerId || !photoId) {
      return res.status(400).json({ error: "answerId and photoId are required" })
    }

    const link = await linkAnswerToPhoto(answerId, photoId, getCurrentUserName(req))
    res.json(link)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message.includes("not found")) {
      return res.status(404).json({ error: message })
    }
    console.error("Failed to create link:", error)
    res.status(500).json({ error: "Failed to create link" })
  }
})

/**
 * DELETE /api/search/link
 * Unlink an answer from a photo
 */
router.delete("/link", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const { answerId, photoId } = req.body

    if (!answerId || !photoId) {
      return res.status(400).json({ error: "answerId and photoId are required" })
    }

    await unlinkAnswerFromPhoto(answerId, photoId)
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to remove link:", error)
    res.status(500).json({ error: "Failed to remove link" })
  }
})

/**
 * GET /api/search/answers/:id/photos
 * Get photos linked to an answer
 */
router.get("/answers/:id/photos", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Answer ID is required" })
    }

    const photos = await getLinkedPhotos(id)
    res.json(photos)
  } catch (error) {
    console.error("Failed to get linked photos:", error)
    res.status(500).json({ error: "Failed to get linked photos" })
  }
})

/**
 * GET /api/search/photos/:id/answers
 * Get answers linked to a photo
 */
router.get("/photos/:id/answers", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const answers = await getLinkedAnswers(id)
    res.json(answers)
  } catch (error) {
    console.error("Failed to get linked answers:", error)
    res.status(500).json({ error: "Failed to get linked answers" })
  }
})

export default router
