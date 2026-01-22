import type { VercelRequest, VercelResponse } from "@vercel/node"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { eq, ilike, or, desc, sql } from "drizzle-orm"
import OpenAI from "openai"

// Schema definitions (matching actual Supabase tables)
import { jsonb } from "drizzle-orm/pg-core"

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const answerItems = pgTable("answer_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  subtopic: text("subtopic"),
  status: text("status").notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const photoAssets = pgTable("photo_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayTitle: text("display_title").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  status: text("status").notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  description: text("description"),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ?? ""
const queryClient = DATABASE_URL ? postgres(DATABASE_URL) : null
const db = queryClient ? drizzle(queryClient, { schema: { topics, answerItems, photoAssets } }) : null

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

// Stateless session using signed tokens (works across serverless instances)
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "fallback-secret"

async function createHmac(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return Buffer.from(signature).toString("base64url")
}

async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const [payload, signature] = token.split(".")
    if (!payload || !signature) return false

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (decoded.expires < Date.now()) return false

    const expectedSig = await createHmac(payload)
    return signature === expectedSig
  } catch {
    return false
  }
}

async function createSession(): Promise<string> {
  const payload = {
    authenticated: true,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = await createHmac(payloadStr)
  return `${payloadStr}.${signature}`
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
  const sessionToken = getCookie(req, "rfp-session")
  const isAuthenticated = await verifySession(sessionToken)

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
          const newSessionToken = await createSession()
          res.setHeader("Set-Cookie", `rfp-session=${newSessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`)
          return res.json({ success: true })
        }
        return res.status(401).json({ error: "Invalid password" })
      }

      if (path === "/auth/logout" && method === "POST") {
        res.setHeader("Set-Cookie", "rfp-session=; Path=/; HttpOnly; Max-Age=0")
        return res.json({ success: true })
      }

      if (path === "/auth/status") {
        return res.json({ authenticated: isAuthenticated })
      }
    }

    // All other routes require authentication
    if (!isAuthenticated) {
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
        const { name, displayName } = req.body || {}
        const [newTopic] = await db.insert(topics).values({ name, displayName: displayName || name }).returning()
        return res.json(newTopic)
      }
    }

    // Answers routes
    if (path === "/answers" || path === "/answers/") {
      if (method === "GET") {
        const allAnswers = await db.select().from(answerItems).orderBy(desc(answerItems.createdAt))
        return res.json(allAnswers)
      }
    }

    // Search routes
    if (path.startsWith("/search")) {
      // GET /search/answers - list/search answers
      if ((path === "/search/answers" || path === "/search/answers/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 0

        let queryBuilder = db.select().from(answerItems)

        const conditions = []
        if (query) {
          conditions.push(or(
            ilike(answerItems.question, `%${query}%`),
            ilike(answerItems.answer, `%${query}%`)
          ))
        }
        if (topicId) {
          conditions.push(eq(answerItems.topicId, topicId))
        }
        if (status) {
          conditions.push(eq(answerItems.status, status))
        }

        let results
        if (conditions.length > 0) {
          const whereClause = conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions.slice(1).map(c => c).join(' AND ')}`
          results = await db.select().from(answerItems)
            .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            .orderBy(desc(answerItems.createdAt))
            .limit(limit || 10000)
        } else {
          results = await db.select().from(answerItems)
            .orderBy(desc(answerItems.createdAt))
            .limit(limit || 10000)
        }

        return res.json(results)
      }

      // GET /search/photos - list/search photos
      if ((path === "/search/photos" || path === "/search/photos/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 0

        const conditions = []
        if (query) {
          conditions.push(or(
            ilike(photoAssets.displayTitle, `%${query}%`),
            ilike(photoAssets.description, `%${query}%`),
            ilike(photoAssets.originalFilename, `%${query}%`)
          ))
        }
        if (topicId) {
          conditions.push(eq(photoAssets.topicId, topicId))
        }
        if (status) {
          conditions.push(eq(photoAssets.status, status))
        }

        let results
        if (conditions.length > 0) {
          results = await db.select().from(photoAssets)
            .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            .orderBy(desc(photoAssets.createdAt))
            .limit(limit || 10000)
        } else {
          results = await db.select().from(photoAssets)
            .orderBy(desc(photoAssets.createdAt))
            .limit(limit || 10000)
        }

        return res.json(results)
      }

      // GET /search/answers/:id - get single answer
      const answerMatch = path.match(/^\/search\/answers\/([^/]+)$/)
      if (answerMatch && method === "GET") {
        const [answer] = await db.select().from(answerItems).where(eq(answerItems.id, answerMatch[1]))
        if (!answer) return res.status(404).json({ error: "Answer not found" })
        return res.json({ ...answer, linkedPhotos: [] })
      }

      // GET /search/photos/:id - get single photo
      const photoMatch = path.match(/^\/search\/photos\/([^/]+)$/)
      if (photoMatch && method === "GET") {
        const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.id, photoMatch[1]))
        if (!photo) return res.status(404).json({ error: "Photo not found" })
        return res.json({ ...photo, linkedAnswers: [] })
      }

      // POST /search/answers/:id/copy - log copy event (just acknowledge)
      const copyMatch = path.match(/^\/search\/answers\/([^/]+)\/copy$/)
      if (copyMatch && method === "POST") {
        return res.json({ success: true })
      }

      // GET /search/answers/:id/photos - get linked photos (placeholder)
      const linkedPhotosMatch = path.match(/^\/search\/answers\/([^/]+)\/photos$/)
      if (linkedPhotosMatch && method === "GET") {
        return res.json([])
      }

      // GET /search/photos/:id/answers - get linked answers (placeholder)
      const linkedAnswersMatch = path.match(/^\/search\/photos\/([^/]+)\/answers$/)
      if (linkedAnswersMatch && method === "GET") {
        return res.json([])
      }

      // Combined search (original route)
      if ((path === "/search" || path === "/search/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const type = (req.query?.type as string) || "all"
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 10000

        let answerResults: any[] = []
        let photoResults: any[] = []

        if (type === "all" || type === "answers") {
          const conditions = []
          if (query) {
            conditions.push(or(
              ilike(answerItems.question, `%${query}%`),
              ilike(answerItems.answer, `%${query}%`)
            ))
          }
          if (topicId) conditions.push(eq(answerItems.topicId, topicId))
          if (status) conditions.push(eq(answerItems.status, status))

          if (conditions.length > 0) {
            answerResults = await db.select().from(answerItems)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
              .orderBy(desc(answerItems.createdAt))
              .limit(limit)
          } else {
            answerResults = await db.select().from(answerItems)
              .orderBy(desc(answerItems.createdAt))
              .limit(limit)
          }
        }

        if (type === "all" || type === "photos") {
          const conditions = []
          if (query) {
            conditions.push(or(
              ilike(photoAssets.displayTitle, `%${query}%`),
              ilike(photoAssets.description, `%${query}%`),
              ilike(photoAssets.originalFilename, `%${query}%`)
            ))
          }
          if (topicId) conditions.push(eq(photoAssets.topicId, topicId))
          if (status) conditions.push(eq(photoAssets.status, status))

          if (conditions.length > 0) {
            photoResults = await db.select().from(photoAssets)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
              .orderBy(desc(photoAssets.createdAt))
              .limit(limit)
          } else {
            photoResults = await db.select().from(photoAssets)
              .orderBy(desc(photoAssets.createdAt))
              .limit(limit)
          }
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
        const relevantAnswers = await db.select().from(answerItems)
          .where(or(
            ilike(answerItems.question, `%${query}%`),
            ilike(answerItems.answer, `%${query}%`)
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
        const allPhotos = await db.select().from(photoAssets).orderBy(desc(photoAssets.createdAt))
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
