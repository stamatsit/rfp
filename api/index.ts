import type { VercelRequest, VercelResponse } from "@vercel/node"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { eq, ilike, or, desc, sql } from "drizzle-orm"
import OpenAI from "openai"
import { clientSuccessData } from "../packages/server/src/data/clientSuccessData.js"

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

// Proposals table (synced from Excel)
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: timestamp("date", { withTimezone: true }),
  ce: text("ce"),
  client: text("client"),
  projectType: text("project_type"),
  rfpNumber: text("rfp_number"),
  won: text("won"),
  schoolType: text("school_type"),
  affiliation: text("affiliation"),
  servicesOffered: jsonb("services_offered").$type<string[]>().default([]),
  documentLinks: jsonb("document_links").$type<Record<string, string>>(),
  fingerprint: text("fingerprint").notNull(),
  sourceRow: integer("source_row"),
  sheetName: text("sheet_name"),
  category: text("category"),
  rawData: jsonb("raw_data").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Proposal Pipeline table (RFP intake/triage log)
export const proposalPipeline = pgTable("proposal_pipeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateReceived: timestamp("date_received", { withTimezone: true }),
  ce: text("ce"),
  client: text("client"),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  decision: text("decision"),
  extraInfo: text("extra_info"),
  followUp: text("follow_up"),
  year: integer("year"),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ?? ""
const queryClient = DATABASE_URL ? postgres(DATABASE_URL) : null
const db = queryClient ? drizzle(queryClient, { schema: { topics, answerItems, photoAssets, proposals, proposalPipeline } }) : null

// Supabase client
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim()
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? "").trim()
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

      // Combined search (original route) with relevance scoring
      if ((path === "/search" || path === "/search/") && method === "GET") {
        const query = (req.query?.q as string) || ""
        const type = (req.query?.type as string) || "all"
        const topicId = req.query?.topicId as string
        const status = req.query?.status as string
        const limit = parseInt(req.query?.limit as string) || 50
        const offset = parseInt(req.query?.offset as string) || 0

        // Helper function to count occurrences of a word in text (case-insensitive)
        const countOccurrences = (text: string, word: string): number => {
          const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          return (text.match(regex) || []).length
        }

        // Helper function to score an item based on search query
        const scoreItem = (title: string, body: string, searchQuery: string): number => {
          if (!searchQuery.trim()) return 0

          const queryLower = searchQuery.toLowerCase().trim()
          const titleLower = title.toLowerCase()
          const bodyLower = body.toLowerCase()
          const searchWords = queryLower.split(/\s+/).filter(w => w.length > 0)

          let score = 0

          // Exact phrase match in title = highest priority (+50)
          if (titleLower.includes(queryLower)) {
            score += 50
          }

          // Exact phrase match in body (+25)
          if (bodyLower.includes(queryLower)) {
            score += 25
          }

          // Each search word found in title (+10 each)
          for (const word of searchWords) {
            if (titleLower.includes(word)) {
              score += 10
            }
          }

          // Count occurrences of each search word in body (+2 per occurrence)
          for (const word of searchWords) {
            const occurrences = countOccurrences(bodyLower, word)
            score += occurrences * 2
          }

          return score
        }

        let answerResults: any[] = []
        let photoResults: any[] = []
        let totalAnswers = 0
        let totalPhotos = 0

        if (type === "all" || type === "answers") {
          const conditions = []
          if (query) {
            // Split query into words and match any word in question or answer
            const searchWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0)
            const wordConditions = searchWords.flatMap(word => [
              ilike(answerItems.question, `%${word}%`),
              ilike(answerItems.answer, `%${word}%`)
            ])
            if (wordConditions.length > 0) {
              conditions.push(or(...wordConditions))
            }
          }
          if (topicId) conditions.push(eq(answerItems.topicId, topicId))
          if (status) conditions.push(eq(answerItems.status, status))

          // Get total count
          const countQuery = conditions.length > 0
            ? db.select({ count: sql<number>`count(*)::int` }).from(answerItems)
                .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            : db.select({ count: sql<number>`count(*)::int` }).from(answerItems)
          const [countResult] = await countQuery
          totalAnswers = countResult?.count || 0

          // Get all matching results (we'll sort and paginate after scoring)
          let allAnswers: any[] = []
          if (conditions.length > 0) {
            allAnswers = await db.select().from(answerItems)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
          } else {
            allAnswers = await db.select().from(answerItems)
          }

          // Score and sort answers by relevance
          if (query) {
            const scoredAnswers = allAnswers.map(answer => ({
              ...answer,
              _relevanceScore: scoreItem(answer.question, answer.answer, query)
            }))
            scoredAnswers.sort((a, b) => b._relevanceScore - a._relevanceScore)
            // Keep score in results for debugging, apply pagination
            answerResults = scoredAnswers.slice(offset, offset + limit)
          } else {
            // No query = sort by date
            allAnswers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            answerResults = allAnswers.slice(offset, offset + limit)
          }
        }

        if (type === "all" || type === "photos") {
          const conditions = []
          if (query) {
            // Split query into words and match any word
            const searchWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0)
            const wordConditions = searchWords.flatMap(word => [
              ilike(photoAssets.displayTitle, `%${word}%`),
              ilike(photoAssets.description, `%${word}%`),
              ilike(photoAssets.originalFilename, `%${word}%`)
            ])
            if (wordConditions.length > 0) {
              conditions.push(or(...wordConditions))
            }
          }
          if (topicId) conditions.push(eq(photoAssets.topicId, topicId))
          if (status) conditions.push(eq(photoAssets.status, status))

          // Get total count
          const countQuery = conditions.length > 0
            ? db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)
                .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
            : db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)
          const [countResult] = await countQuery
          totalPhotos = countResult?.count || 0

          // Get all matching results (we'll sort and paginate after scoring)
          let allPhotos: any[] = []
          if (conditions.length > 0) {
            allPhotos = await db.select().from(photoAssets)
              .where(conditions.length === 1 ? conditions[0]! : sql`${sql.join(conditions, sql` AND `)}`)
          } else {
            allPhotos = await db.select().from(photoAssets)
          }

          // Score and sort photos by relevance
          if (query) {
            const scoredPhotos = allPhotos.map(photo => ({
              ...photo,
              _relevanceScore: scoreItem(photo.displayTitle, (photo.description || '') + ' ' + photo.originalFilename, query)
            }))
            scoredPhotos.sort((a, b) => b._relevanceScore - a._relevanceScore)
            // Keep score in results for debugging, apply pagination
            photoResults = scoredPhotos.slice(offset, offset + limit)
          } else {
            // No query = sort by date
            allPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            photoResults = allPhotos.slice(offset, offset + limit)
          }
        }

        return res.json({
          answers: answerResults,
          photos: photoResults,
          totalAnswers,
          totalPhotos
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

        // Step 1: Extract key concepts/keywords from the user's query using AI
        let searchKeywords: string[] = []
        try {
          const keywordExtraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract the key topic keywords from user queries for database searching.
Return ONLY a JSON array of 1-5 important keywords/phrases, no explanation.
Focus on nouns, topics, and concepts - ignore filler words like "give me", "describe", "what is", etc.
Example: "give a description of governance" -> ["governance"]
Example: "what are our data privacy policies" -> ["data privacy", "privacy policies", "data"]
Example: "how do we handle customer complaints" -> ["customer complaints", "complaints", "customer service"]`
              },
              { role: "user", content: query }
            ],
            max_tokens: 100
          })
          const extracted = keywordExtraction.choices[0]?.message?.content || "[]"
          searchKeywords = JSON.parse(extracted.replace(/```json\n?|\n?```/g, "").trim())
        } catch (err) {
          console.error("Keyword extraction failed:", err)
          // Fallback: use the original query split into words, filtering common words
          const stopWords = new Set(["give", "me", "a", "an", "the", "what", "is", "are", "how", "do", "we", "our", "describe", "description", "of", "about", "tell", "explain"])
          searchKeywords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w))
        }

        // If no keywords extracted, use original query
        if (searchKeywords.length === 0) {
          searchKeywords = [query]
        }

        // Step 2: Search with extracted keywords, prioritizing question/headline matches
        const searchConditions = searchKeywords.flatMap(keyword => [
          ilike(answerItems.question, `%${keyword}%`),
          ilike(answerItems.answer, `%${keyword}%`)
        ])

        // Get a larger pool of potential matches
        let potentialMatches: typeof answerItems.$inferSelect[] = []
        if (searchConditions.length > 0) {
          potentialMatches = await db.select().from(answerItems)
            .where(searchConditions.length === 1 ? searchConditions[0]! : or(...searchConditions))
            .limit(20)
        } else {
          // Fallback: get recent items if no search conditions
          potentialMatches = await db.select().from(answerItems)
            .orderBy(desc(answerItems.createdAt))
            .limit(20)
        }

        // Step 3: Score and rank results - prioritize headline/question matches
        const scoredResults = potentialMatches.map(item => {
          let score = 0
          const questionLower = item.question.toLowerCase()
          const answerLower = item.answer.toLowerCase()

          for (const keyword of searchKeywords) {
            const keywordLower = keyword.toLowerCase()
            // Heavy weight for question/headline matches
            if (questionLower.includes(keywordLower)) {
              score += 10
              // Extra points for exact or near-exact question match
              if (questionLower.startsWith(keywordLower) || questionLower === keywordLower) {
                score += 5
              }
            }
            // Lower weight for answer body matches
            if (answerLower.includes(keywordLower)) {
              score += 3
            }
          }
          return { ...item, score }
        })

        // Sort by score (highest first) and take top results
        const relevantAnswers = scoredResults
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSources)
          .filter(item => item.score > 0)

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

      // AI case studies
      if (path === "/ai/case-studies" && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            dataUsed: { totalCaseStudies: 0, totalTestimonials: 0, totalStats: 0, categoriesSearched: [] },
            followUpPrompts: [],
            refused: true,
            refusalReason: "AI service is not configured. Please set OPENAI_API_KEY in your environment."
          })
        }

        const { query: csQuery } = req.body || {}
        if (!csQuery || typeof csQuery !== "string" || csQuery.trim().length < 2) {
          return res.status(400).json({ error: "Query must be at least 2 characters" })
        }

        // Build context from client success data
        const csSections: string[] = []

        const caseStudyLines = clientSuccessData.caseStudies.map((cs: any) => {
          const metrics = cs.metrics.map((m: any) => `${m.value} ${m.label}`).join("; ")
          const testimonial = cs.testimonial ? `\n  Testimonial: "${cs.testimonial.quote}" — ${cs.testimonial.attribution}` : ""
          const awards = cs.awards ? `\n  Awards: ${cs.awards.join(", ")}` : ""
          return `[${cs.client}] (${cs.category}, ${cs.focus})\n  Challenge: ${cs.challenge}\n  Solution: ${cs.solution}\n  Metrics: ${metrics || "None recorded"}${testimonial}${awards}`
        })
        csSections.push(`=== CASE STUDIES (${caseStudyLines.length}) ===\n${caseStudyLines.join("\n\n")}`)

        const sortedResults = [...clientSuccessData.topLineResults].sort((a: any, b: any) => b.numericValue - a.numericValue)
        csSections.push(`=== TOP-LINE RESULTS (${sortedResults.length}) ===\n${sortedResults.map((r: any) => `${r.result} ${r.metric} — ${r.client}`).join("\n")}`)

        csSections.push(`=== TESTIMONIALS (${clientSuccessData.testimonials.length}) ===\n${clientSuccessData.testimonials.map((t: any) => `"${t.quote}" — ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`).join("\n\n")}`)

        csSections.push(`=== AWARDS (${clientSuccessData.awards.length}) ===\n${clientSuccessData.awards.map((a: any) => `${a.name} (${a.year}) — ${a.clientOrProject}`).join("\n")}`)

        const statLines = [
          ...clientSuccessData.companyStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""}`),
          ...clientSuccessData.externallyVerifiedStats.map((s: any) => `${s.label}: ${s.value}${s.detail ? ` — ${s.detail}` : ""} (Source: ${s.source})`)
        ]
        csSections.push(`=== COMPANY STATS ===\n${statLines.join("\n")}`)
        csSections.push(`=== SERVICE LINES ===\n${clientSuccessData.serviceLines.join(", ")}`)
        csSections.push(`=== CORE VALUES ===\n${clientSuccessData.coreValues.join("\n")}`)
        csSections.push(`=== PROPRIETARY RESEARCH ===\n${clientSuccessData.researchStudies.map((r: any) => `${r.name}: ${r.description}\n  Findings: ${r.findings.join("; ")}`).join("\n\n")}`)
        csSections.push(`=== NOTABLE FIRSTS ===\n${clientSuccessData.notableFirsts.join("\n")}`)
        csSections.push(`=== CONFERENCE PRESENCE ===\n${clientSuccessData.conferenceAppearances.map((c: any) => `${c.event} — ${c.role}`).join("\n")}`)

        const csContext = csSections.join("\n\n")

        const categories = new Set<string>()
        clientSuccessData.caseStudies.forEach((cs: any) => categories.add(cs.category))

        const csSystemPrompt = `You are a Case Study AI for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing. You have access to ${clientSuccessData.caseStudies.length} case studies, ${clientSuccessData.topLineResults.length} top-line results, ${clientSuccessData.testimonials.length} testimonials, and ${clientSuccessData.awards.length} awards.

You operate in TWO modes based on user intent:

MODE 1: CASE STUDY BUILDER — When the user wants to BUILD, CREATE, DRAFT, or WRITE a case study:
1. CONFIRM first: "I'll help you build a case study. Let me ask a few questions to get started."
2. ASK step-by-step (one at a time): Client name/industry, challenge, solution, results
3. Draft the full case study with Challenge/Solution/Results structure
4. Cross-reference the database for comparisons
5. Suggest refinements

MODE 2: QUICK GRAB — When the user wants a specific fact, stat, testimonial, or data point:
- Respond DIRECTLY — no guided workflow
- Keep it concise and formatted for instant copy-paste
- Use **bold** for key numbers and client names

RULES:
1. Only reference real data from the provided database — NEVER invent stats or quotes
2. When drafting testimonials, mark them as "Suggested quote:"
3. Write in polished, proposal-ready language
4. Use **bold** for key metrics, client names, and important facts
5. Format metrics as compelling bullet points

Always end your response with 3-4 follow-up prompts formatted EXACTLY like this:
FOLLOW_UP_PROMPTS: ["prompt 1?", "prompt 2?", "prompt 3?"]

--- CLIENT SUCCESS DATABASE ---
${csContext}`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: csSystemPrompt },
            { role: "user", content: csQuery.trim() }
          ],
          temperature: 0.4,
          max_tokens: 3000
        })

        const rawResponse = completion.choices[0]?.message?.content || ""

        // Parse follow-up prompts
        let cleanResponse = rawResponse
        let csFollowUps: string[] = []
        const csFollowUpMatch = rawResponse.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
        if (csFollowUpMatch && csFollowUpMatch[1]) {
          try {
            csFollowUps = JSON.parse(`[${csFollowUpMatch[1]}]`)
            cleanResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
          } catch {
            csFollowUps = csFollowUpMatch[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(s => s.length > 0)
            cleanResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
          }
        } else {
          csFollowUps = ["Want me to add comparable stats from similar projects?", "Should I draft a client testimonial for this?", "Want to see similar case studies from our database?"]
        }

        return res.json({
          response: cleanResponse,
          dataUsed: {
            totalCaseStudies: clientSuccessData.caseStudies.length,
            totalTestimonials: clientSuccessData.testimonials.length,
            totalStats: clientSuccessData.topLineResults.length,
            categoriesSearched: Array.from(categories)
          },
          followUpPrompts: csFollowUps,
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

    // Photo file serving - redirect to Supabase Storage
    const photoFileMatch = path.match(/^\/photos\/file\/([^/]+)$/)
    if (photoFileMatch && method === "GET") {
      const storageKey = photoFileMatch[1]
      const [photo] = await db.select().from(photoAssets).where(eq(photoAssets.storageKey, storageKey))

      if (!photo) {
        return res.status(404).json({ error: "Photo not found" })
      }

      // Get file extension from original filename or mime type
      let ext = ""
      if (photo.originalFilename) {
        const match = photo.originalFilename.match(/\.([^.]+)$/)
        if (match) ext = match[1]
      }
      if (!ext && photo.mimeType) {
        const mimeMap: Record<string, string> = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/gif": "gif",
          "image/webp": "webp"
        }
        ext = mimeMap[photo.mimeType] || "png"
      }

      // Redirect to Supabase Storage public URL
      const supabaseStorageUrl = `${SUPABASE_URL}/storage/v1/object/public/photo-assets/${storageKey}.${ext}`
      return res.redirect(302, supabaseStorageUrl)
    }

    // Proposals routes
    if (path.startsWith("/proposals")) {
      // Sync status - return status based on database content
      if ((path === "/proposals/sync/status" || path === "/proposals/sync/status/") && method === "GET") {
        // Get count from database
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(proposals)
        const totalProposals = countResult?.count || 0
        return res.json({
          configured: totalProposals > 0, // Consider "configured" if we have data
          lastSync: new Date().toISOString(),
          totalProposals,
          status: totalProposals > 0 ? "synced" : "empty",
          message: totalProposals > 0
            ? `${totalProposals} proposals loaded from database`
            : "No proposal data. Sync from local development server first."
        })
      }

      // Query proposals AI
      if ((path === "/proposals/query" || path === "/proposals/query/") && method === "POST") {
        if (!openai) {
          return res.json({
            response: "",
            dataUsed: { totalProposals: 0, dateRange: { from: null, to: null }, overallWinRate: 0, wonCount: 0, lostCount: 0, pendingCount: 0, byCategory: {}, momentum: "steady", rolling6Month: 0, rolling12Month: 0, yoyChange: null },
            followUpPrompts: [],
            recommendations: [],
            pendingScores: [],
            refused: true,
            refusalReason: "AI service is not configured"
          })
        }

        const { query: userQuery } = req.body || {}

        // Get all proposals from database
        const allProposals = await db.select().from(proposals).orderBy(desc(proposals.date))

        if (allProposals.length === 0) {
          return res.json({
            response: "",
            dataUsed: { totalProposals: 0, dateRange: { from: null, to: null }, overallWinRate: 0, wonCount: 0, lostCount: 0, pendingCount: 0, byCategory: {}, momentum: "steady", rolling6Month: 0, rolling12Month: 0, yoyChange: null },
            followUpPrompts: [],
            recommendations: [],
            pendingScores: [],
            refused: true,
            refusalReason: "No proposal data found in database."
          })
        }

        // Calculate basic stats
        const decided = allProposals.filter(p => p.won === "Yes" || p.won === "No")
        const wonCount = decided.filter(p => p.won === "Yes").length
        const lostCount = decided.filter(p => p.won === "No").length
        const pendingCount = allProposals.filter(p => !p.won || p.won === "Pending").length
        const overallWinRate = decided.length > 0 ? wonCount / decided.length : 0

        // Date range
        const dates = allProposals.filter(p => p.date).map(p => new Date(p.date!))
        const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
        const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

        // Count by category
        const byCategory: Record<string, number> = {}
        allProposals.forEach(p => {
          if (p.category) byCategory[p.category] = (byCategory[p.category] || 0) + 1
        })

        // Get pipeline data (RFP intake decisions)
        const pipelineEntries = await db.select().from(proposalPipeline).orderBy(desc(proposalPipeline.dateReceived))
        const pipelineTotal = pipelineEntries.length
        const pipelineProcessed = pipelineEntries.filter(e => e.decision?.toLowerCase().includes("processed")).length
        const pipelinePassing = pipelineEntries.filter(e => e.decision?.toLowerCase().includes("pass")).length
        const pursuitRate = pipelineTotal > 0 ? pipelineProcessed / pipelineTotal : 0

        // Analyze pass reasons
        const passReasons: Record<string, number> = {}
        pipelineEntries
          .filter(e => e.decision?.toLowerCase().includes("pass") && e.extraInfo)
          .forEach(e => {
            const info = e.extraInfo!.toLowerCase()
            if (info.includes("budget") || info.includes("pricing")) passReasons["Budget concerns"] = (passReasons["Budget concerns"] || 0) + 1
            else if (info.includes("not a good fit")) passReasons["Not a good fit"] = (passReasons["Not a good fit"] || 0) + 1
            else if (info.includes("incumbent")) passReasons["Incumbent advantage"] = (passReasons["Incumbent advantage"] || 0) + 1
            else if (info.includes("hub") || info.includes("local")) passReasons["HUB/Local preference"] = (passReasons["HUB/Local preference"] || 0) + 1
            else if (info.includes("timeline") || info.includes("short")) passReasons["Timeline too short"] = (passReasons["Timeline too short"] || 0) + 1
            else passReasons["Other"] = (passReasons["Other"] || 0) + 1
          })

        // Build context for AI
        const contextLines = [
          `PROPOSAL DATA SUMMARY:`,
          `- Total Proposals: ${allProposals.length}`,
          `- Date Range: ${minDate?.toISOString().split("T")[0] || "N/A"} to ${maxDate?.toISOString().split("T")[0] || "N/A"}`,
          `- Won: ${wonCount} (${(overallWinRate * 100).toFixed(1)}% overall win rate)`,
          `- Lost: ${lostCount}`,
          `- Pending: ${pendingCount}`,
          ``,
          `PROPOSALS BY CATEGORY:`,
          ...Object.entries(byCategory).map(([cat, count]) => `- ${cat}: ${count}`),
          ``,
          `RECENT PROPOSALS (last 20):`,
          ...allProposals.slice(0, 20).map(p => {
            const links = p.documentLinks && typeof p.documentLinks === 'object'
              ? Object.entries(p.documentLinks as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("; ")
              : ""
            return `- ${p.client || "Unknown"} [${p.category || ""}] (${p.date ? new Date(p.date).toISOString().split("T")[0] : "N/A"}): ${p.won || "Unknown"}${p.rfpNumber ? ` | RFP#: ${p.rfpNumber}` : ""} - ${((p.servicesOffered as string[]) || []).slice(0, 3).join(", ") || "No services"}${links ? ` | Links: ${links}` : ""}`
          })
        ]

        // Add pipeline context if we have data
        if (pipelineTotal > 0) {
          contextLines.push(``, `===== PIPELINE ACTIVITY (RFP Intake/Triage) =====`)
          contextLines.push(`- Total RFPs Reviewed: ${pipelineTotal}`)
          contextLines.push(`- Processed (Pursued): ${pipelineProcessed} (${(pursuitRate * 100).toFixed(1)}% pursuit rate)`)
          contextLines.push(`- Passed (Declined): ${pipelinePassing}`)
          contextLines.push(``)
          contextLines.push(`REASONS FOR PASSING:`)
          Object.entries(passReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
            const pct = pipelinePassing > 0 ? (count / pipelinePassing) * 100 : 0
            contextLines.push(`- ${reason}: ${count} (${pct.toFixed(0)}% of passes)`)
          })
          contextLines.push(``)
          contextLines.push(`RECENT RFP INTAKE (last 15):`)
          pipelineEntries.slice(0, 15).forEach(e => {
            const date = e.dateReceived ? new Date(e.dateReceived).toISOString().split("T")[0] : "N/A"
            const extra = e.extraInfo ? ` - "${e.extraInfo.substring(0, 40)}..."` : ""
            contextLines.push(`- [${date}] ${e.client || "Unknown"}: ${e.decision || "Unknown"}${extra}`)
          })
        }

        const systemPrompt = `You are a Proposal Analytics Assistant. Analyze historical proposal data and provide actionable insights.

PIPELINE DATA CONTEXT: You have access to RFP intake/triage decisions showing:
- Pursuit rate: What percentage of opportunities you pursue
- Pass reasons: Why opportunities are declined (budget, incumbent, HUB requirements, etc.)
- This helps analyze selectivity and opportunity filtering.

CRITICAL RULES:
1. ONLY use statistics from the provided data - NEVER make up numbers
2. Be specific with percentages and counts when available
3. If asked about something not in the data, clearly say so
4. Keep responses concise (150-300 words)
5. Use bullet points for clarity

At the end of your response, include 3-4 follow-up questions formatted as:
FOLLOW_UP_PROMPTS: ["Question 1?", "Question 2?", "Question 3?"]

--- PROPOSAL DATA ---
${contextLines.join("\n")}`

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
          ],
          temperature: 0.4,
          max_tokens: 2000
        })

        const rawResponse = completion.choices[0]?.message?.content || ""

        // Parse follow-up prompts
        let cleanResponse = rawResponse
        let followUpPrompts: string[] = []
        const followUpMatch = rawResponse.match(/FOLLOW_UP_PROMPTS:\s*\[(.*?)\]/s)
        if (followUpMatch && followUpMatch[1]) {
          try {
            followUpPrompts = JSON.parse(`[${followUpMatch[1]}]`)
            cleanResponse = rawResponse.replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()
          } catch {
            followUpPrompts = ["What's the trend over time?", "Break down by category", "Show top performers"]
          }
        }

        return res.json({
          response: cleanResponse,
          dataUsed: {
            totalProposals: allProposals.length,
            dateRange: { from: minDate, to: maxDate },
            overallWinRate,
            wonCount,
            lostCount,
            pendingCount,
            byCategory,
            momentum: "steady",
            rolling6Month: overallWinRate,
            rolling12Month: overallWinRate,
            yoyChange: null
          },
          followUpPrompts,
          recommendations: [],
          pendingScores: [],
          refused: false
        })
      }

      // Trigger sync - not supported in serverless, return message
      if ((path === "/proposals/sync/trigger" || path === "/proposals/sync/trigger/") && method === "POST") {
        return res.json({
          synced: false,
          message: "Excel file sync is not available in the deployed version. Proposals are synced from the local development server."
        })
      }
    }

    // 404 for unmatched routes
    return res.status(404).json({ error: "Not found", path })

  } catch (error: any) {
    console.error("API Error:", error?.message || error, error?.stack)
    return res.status(500).json({ error: "Internal server error" })
  }
}
