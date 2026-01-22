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

  // Parse path - handle both /api/health and /health patterns
  const rawPath = req.url?.split("?")[0] || "/"
  const path = rawPath.replace(/^\/api/, "") || "/"
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
        const appPassword = (process.env.APP_PASSWORD || "").trim()
        if (password === appPassword) {
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

        return res.json({
          answers: answerResults,
          photos: photoResults,
          totalAnswers: answerResults.length,
          totalPhotos: photoResults.length
        })
      }
    }

    // AI routes
    if (path.startsWith("/ai")) {
      // AI status check
      if (path === "/ai/status" && method === "GET") {
        return res.json({
          configured: !!openai,
          model: openai ? "gpt-4o-mini" : null,
          message: openai ? "AI service is configured" : "OpenAI API key not configured"
        })
      }

      // AI query
      if (path === "/ai/query" && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            sources: [],
            photos: [],
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { query, topicId, maxSources = 5 } = req.body || {}

        // Get relevant answers for context
        const relevantAnswers = await db.select().from(answers)
          .where(or(
            ilike(answers.question, `%${query}%`),
            ilike(answers.answer, `%${query}%`)
          ))
          .limit(maxSources)

        if (relevantAnswers.length === 0) {
          return res.json({
            response: "I couldn't find any relevant information in the knowledge base for your query.",
            sources: [],
            photos: [],
            refused: false
          })
        }

        const systemPrompt = `You are a helpful assistant for RFP proposals. Use ONLY the following context from our knowledge base to answer questions. Do not make up information.

Available knowledge:
${relevantAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}

Instructions:
- Only use information from the provided knowledge base
- If the answer isn't in the provided context, say you don't have that information
- Be helpful and professional`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
          ],
          max_tokens: 1000
        })

        return res.json({
          response: completion.choices[0]?.message?.content || "No response generated",
          sources: relevantAnswers.map(a => ({ id: a.id, question: a.question, answer: a.answer })),
          photos: [],
          refused: false
        })
      }

      // AI adapt
      if (path === "/ai/adapt" && method === "POST") {
        if (!openai) {
          return res.json({
            adaptedContent: "",
            originalContent: "",
            instruction: "",
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { content, adaptationType, customInstruction, targetWordCount, clientName, industry } = req.body || {}

        let instruction = ""
        switch (adaptationType) {
          case "shorten": instruction = `Shorten this content${targetWordCount ? ` to approximately ${targetWordCount} words` : ""}`; break
          case "expand": instruction = `Expand this content with more detail${targetWordCount ? ` to approximately ${targetWordCount} words` : ""}`; break
          case "bullets": instruction = "Convert this content into bullet points"; break
          case "formal": instruction = "Rewrite this content in a more formal, professional tone"; break
          case "casual": instruction = "Rewrite this content in a more casual, conversational tone"; break
          case "custom": instruction = customInstruction || "Improve this content"; break
          default: instruction = "Improve this content"
        }

        if (clientName) instruction += `. The client is ${clientName}.`
        if (industry) instruction += `. The industry is ${industry}.`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a professional content editor. Apply the requested changes while maintaining the core message and accuracy." },
            { role: "user", content: `${instruction}\n\nOriginal content:\n${content}` }
          ],
          max_tokens: 2000
        })

        return res.json({
          adaptedContent: completion.choices[0]?.message?.content || content,
          originalContent: content,
          instruction,
          refused: false
        })
      }
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

  } catch (error: any) {
    console.error("API Error:", error?.message || error, error?.stack)
    return res.status(500).json({ error: "Internal server error", details: error?.message })
  }
}
