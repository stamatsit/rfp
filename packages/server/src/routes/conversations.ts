/**
 * Conversations Routes
 * CRUD for AI chat conversation history across all AI pages.
 */

import { Router, type Request, type Response } from "express"
import { db } from "../db/index.js"
import { conversations } from "../db/schema.js"
import { eq, desc, and, or, isNull } from "drizzle-orm"
import { getCurrentUserId } from "../middleware/getCurrentUser.js"

const router = Router()

// List conversations for a page (most recent first)
router.get("/", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const page = req.query.page as string | undefined
    const userId = getCurrentUserId(req)
    // Show user's own conversations + legacy conversations (no userId)
    const conditions = []
    if (page) conditions.push(eq(conversations.page, page as any))
    if (userId) {
      conditions.push(or(eq(conversations.userId, userId), isNull(conversations.userId)))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined
    const rows = await db
      .select({
        id: conversations.id,
        page: conversations.page,
        title: conversations.title,
        messageCount: conversations.messages,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(where)
      .orderBy(desc(conversations.updatedAt))
      .limit(50)

    // Return with messageCount as the actual count, not the full messages
    const result = rows.map(r => ({
      id: r.id,
      page: r.page,
      title: r.title,
      messageCount: Array.isArray(r.messageCount) ? r.messageCount.length : 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
    res.json(result)
  } catch (error) {
    console.error("Failed to list conversations:", error)
    res.status(500).json({ error: "Failed to list conversations" })
  }
})

// Get a single conversation with full messages
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db.select().from(conversations).where(eq(conversations.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Conversation not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to get conversation:", error)
    res.status(500).json({ error: "Failed to get conversation" })
  }
})

// Create a new conversation
router.post("/", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { page, title, messages } = req.body
    if (!page || !title?.trim()) {
      return res.status(400).json({ error: "Page and title are required" })
    }
    const [row] = await db.insert(conversations).values({
      page,
      title: title.trim(),
      messages: messages || [],
      userId: getCurrentUserId(req),
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create conversation:", error)
    res.status(500).json({ error: "Failed to create conversation" })
  }
})

// Update conversation (append messages, update title)
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { title, messages } = req.body
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (title !== undefined) updates.title = title.trim()
    if (messages !== undefined) updates.messages = messages
    const [row] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Conversation not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to update conversation:", error)
    res.status(500).json({ error: "Failed to update conversation" })
  }
})

// Delete a conversation
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(conversations).where(eq(conversations.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete conversation:", error)
    res.status(500).json({ error: "Failed to delete conversation" })
  }
})

export default router
