/**
 * Conversations Routes
 * CRUD for AI chat conversation history across all AI pages.
 */

import { Router, type Request, type Response } from "express"
import OpenAI from "openai"
import { db } from "../db/index.js"
import { conversations } from "../db/schema.js"
import { eq, desc, and, or, isNull } from "drizzle-orm"
import { getCurrentUserId } from "../middleware/getCurrentUser.js"

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

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

// Generate a short AI title for a conversation
router.post("/:id/generate-title", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const openai = getOpenAI()
    if (!openai) return res.status(503).json({ error: "AI service not configured" })

    const { messages } = req.body as { messages?: Array<{ role: string; content: string }> }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" })
    }

    const firstUser = messages.find(m => m.role === "user")?.content?.slice(0, 200) ?? ""
    const firstAI = messages.find(m => m.role === "assistant")?.content?.slice(0, 200) ?? ""

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content: "Generate a concise 4-6 word title for this conversation. Return ONLY the title, no quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: `User asked: ${firstUser}\nAI responded about: ${firstAI}`,
        },
      ],
    })

    const title = completion.choices[0]?.message.content?.trim() || firstUser.slice(0, 60)

    const [updated] = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, req.params.id!))
      .returning({ id: conversations.id, title: conversations.title })

    if (!updated) return res.status(404).json({ error: "Conversation not found" })
    res.json({ title: updated.title })
  } catch (error) {
    console.error("Failed to generate conversation title:", error)
    res.status(500).json({ error: "Failed to generate title" })
  }
})

export default router
