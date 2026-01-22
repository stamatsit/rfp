import type { VercelRequest, VercelResponse } from "@vercel/node"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { eq, ilike, or, desc, sql } from "drizzle-orm"
import OpenAI from "openai"

// Schema definitions (copied from server for standalone function)
export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const answers = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id").references(() => topics.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  tags: text("tags").array(),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  url: text("url"),
  description: text("description"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const photoAnswerLinks = pgTable("photo_answer_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  photoId: uuid("photo_id").references(() => photos.id).notNull(),
  answerId: uuid("answer_id").references(() => answers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ?? ""
const queryClient = DATABASE_URL ? postgres(DATABASE_URL) : null
const db = queryClient ? drizzle(queryClient, { schema: { topics, answers, photos, photoAnswerLinks } }) : null

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

// Session storage (in-memory for serverless - will reset on cold start)
const sessions = new Map<string, { authenticated: boolean; expires: number }>()

function getSession(sessionId: string | undefined) {
  if (!sessionId) return null
  const session = sessions.get(sessionId)
  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(sessionId)
    return null
  }
  return session
}

function createSession(): string {
  const sessionId = crypto.randomUUID()
  sessions.set(sessionId, {
    authenticated: true,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  })
  return sessionId
}

// Parse cookies from request
function getCookie(req: VercelRequest, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? []
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=")
    if (key === name) return value
  }
  return undefined
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers - trim to remove any whitespace/newlines from env var
  const origin = (process.env.CORS_ORIGIN || "*").trim()
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Access-Control-Allow-Credentials", "true")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  const path = req.url?.replace(/^\/api/, "") || "/"
  const method = req.method || "GET"
  const sessionId = getCookie(req, "rfp-session")
  const session = getSession(sessionId)

  try {
    // Health check (no auth required)
    if (path === "/health" || path === "/health/") {
      return res.json({
        status: "ok",
        database: db ? "connected" : "not configured",
        timestamp: new Date().toISOString()
      })
    }

    // Auth routes
    if (path.startsWith("/auth")) {
      if (path === "/auth/login" && method === "POST") {
        const { password } = req.body || {}
        if (password === process.env.APP_PASSWORD) {
          const newSessionId = createSession()
          res.setHeader("Set-Cookie", `rfp-session=${newSessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
          return res.json({ success: true })
        }
        return res.status(401).json({ error: "Invalid password" })
      }

      if (path === "/auth/logout" && method === "POST") {
        if (sessionId) sessions.delete(sessionId)
        res.setHeader("Set-Cookie", "rfp-session=; Path=/; HttpOnly; Max-Age=0")
        return res.json({ success: true })
      }

      if (path === "/auth/status") {
        return res.json({ authenticated: !!session })
      }
    }

    // All other routes require authentication
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    if (!db) {
      return res.status(500).json({ error: "Database not configured" })
    }

    // Topics routes
    if (path === "/topics" || path === "/topics/") {
      if (method === "GET") {
        const allTopics = await db.select().from(topics).orderBy(topics.name)
        return res.json(allTopics)
      }
      if (method === "POST") {
        const { name, description } = req.body || {}
        const [newTopic] = await db.insert(topics).values({ name, description }).returning()
        return res.json(newTopic)
      }
    }

    // Answers routes
    if (path === "/answers" || path === "/answers/") {
      if (method === "GET") {
        const allAnswers = await db.select().from(answers).orderBy(desc(answers.createdAt))
        return res.json(allAnswers)
      }
    }

    // Search route
    if (path === "/search" || path === "/search/") {
      if (method === "GET") {
        const query = (req.query?.q as string) || ""
        const type = (req.query?.type as string) || "all"

        let answerResults: any[] = []
        let photoResults: any[] = []

        if (type === "all" || type === "answers") {
          answerResults = await db.select().from(answers)
            .where(or(
              ilike(answers.question, `%${query}%`),
              ilike(answers.answer, `%${query}%`)
            ))
            .orderBy(desc(answers.createdAt))
            .limit(50)
        }

        if (type === "all" || type === "photos") {
          photoResults = await db.select().from(photos)
            .where(or(
              ilike(photos.description, `%${query}%`),
              ilike(photos.originalName, `%${query}%`)
            ))
            .orderBy(desc(photos.createdAt))
            .limit(50)
        }

        return res.json({ answers: answerResults, photos: photoResults })
      }
    }

    // AI route
    if (path === "/ai/ask" && method === "POST") {
      if (!openai) {
        return res.status(500).json({ error: "OpenAI not configured" })
      }

      const { question, context } = req.body || {}

      // Get relevant answers for context
      const relevantAnswers = await db.select().from(answers)
        .where(or(
          ilike(answers.question, `%${question}%`),
          ilike(answers.answer, `%${question}%`)
        ))
        .limit(5)

      const systemPrompt = `You are a helpful assistant for RFP proposals. Use the following context from our knowledge base to answer questions:

${relevantAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}

${context ? `Additional context: ${context}` : ""}

Provide helpful, accurate responses based on this information. If you don't have enough information, say so.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_tokens: 1000
      })

      return res.json({
        answer: completion.choices[0]?.message?.content || "No response generated",
        sources: relevantAnswers.map(a => ({ id: a.id, question: a.question }))
      })
    }

    // Photos routes
    if (path === "/photos" || path === "/photos/") {
      if (method === "GET") {
        const allPhotos = await db.select().from(photos).orderBy(desc(photos.createdAt))
        return res.json(allPhotos)
      }
    }

    // 404 for unmatched routes
    return res.status(404).json({ error: "Not found", path })

  } catch (error) {
    console.error("API Error:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}
