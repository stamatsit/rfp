/**
 * Client Success Data Routes
 * CRUD for user-added client success entries, results, testimonials, and awards.
 * These merge with the hardcoded clientSuccessData on the client.
 */

import { Router, type Request, type Response } from "express"
import multer from "multer"
import crypto from "crypto"
import { db, supabaseAdmin } from "../db/index.js"
import {
  clients,
  clientSuccessEntries,
  clientSuccessResults,
  clientSuccessTestimonials,
  clientSuccessAwards,
  clientQaLinks,
  clientDocuments,
  clientBrandKit,
  answerItems,
  topics,
  proposals,
} from "../db/schema.js"
import { eq, sql, and, or, ilike, desc, asc, inArray } from "drizzle-orm"
import { requireWriteAccess } from "../middleware/auth.js"
import { invalidateTestimonialCache } from "../services/utils/dbTestimonials.js"
import OpenAI from "openai"
import mammoth from "mammoth"
import { createRequire } from "module"
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = _require("pdf-parse")

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

const badgeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// ─── SSRF guard ───────────────────────────────────────────────────────────────
function isPublicUrl(urlString: string): boolean {
  let url: URL
  try { url = new URL(urlString) } catch { return false }
  if (!["http:", "https:"].includes(url.protocol)) return false
  const h = url.hostname
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false
  // Block RFC1918, loopback, link-local, and metadata addresses
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.)/.test(h)) return false
  // Block IPv6 loopback/link-local
  if (h === "::1" || h.startsWith("[::1]") || h.startsWith("[fe80")) return false
  return true
}

// ─── Text extraction helper ───────────────────────────────────────────────────
async function extractDocText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === "application/pdf") {
      const data = await pdfParse(buffer)
      return data.text.slice(0, 50000)
    }
    if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) {
      const result = await mammoth.extractRawText({ buffer })
      return result.value.slice(0, 50000)
    }
    if (mimeType.startsWith("text/")) {
      return buffer.toString("utf-8").slice(0, 50000)
    }
    return null
  } catch (err) {
    console.error("Text extraction failed:", err)
    return null
  }
}

// ─── AI summary/key_points (fire-and-forget) ─────────────────────────────────
async function processDocumentAI(docId: string, text: string): Promise<void> {
  const openai = getOpenAI()
  if (!openai || !db) return
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: 'Return valid JSON only: { "summary": string, "keyPoints": string[] }. Summary: 2-3 sentences describing the document. keyPoints: up to 8 key dates, decisions, commitments, dollar amounts, or names found in the document.',
        },
        { role: "user", content: text.slice(0, 15000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 800,
    })
    const raw = completion.choices[0]?.message?.content || "{}"
    const parsed = JSON.parse(raw)
    const summary = typeof parsed.summary === "string" ? parsed.summary : null
    const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((k: unknown) => typeof k === "string") : null
    await db.update(clientDocuments)
      .set({ summary, keyPoints, updatedAt: new Date() })
      .where(eq(clientDocuments.id, docId))
  } catch (err) {
    console.error("Document AI processing failed:", err)
  }
}

const router = Router()

// ─── Clients ─────────────────────────────────────────────────────

router.get("/clients", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(clients).orderBy(clients.name)
    res.json(rows)
  } catch (error) {
    console.error("Failed to get clients:", error)
    res.status(500).json({ error: "Failed to get clients" })
  }
})

router.post("/clients", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { name, sector, notes } = req.body
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" })
    const [row] = await db.insert(clients).values({
      name: name.trim(),
      sector: sector || "other",
      notes: notes?.trim() || null,
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create client:", error)
    res.status(500).json({ error: "Failed to create client" })
  }
})

router.put("/clients/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { name, sector, notes } = req.body
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" })
    const [row] = await db.update(clients).set({
      name: name.trim(),
      sector: sector || "other",
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(clients.id, req.params.id!)).returning()
    if (!row) return res.status(404).json({ error: "Client not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to update client:", error)
    res.status(500).json({ error: "Failed to update client" })
  }
})

router.delete("/clients/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clients).where(eq(clients.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete client:", error)
    res.status(500).json({ error: "Failed to delete client" })
  }
})

// ─── Entries (Client Success stories) ───

router.get("/entries", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(clientSuccessEntries).orderBy(clientSuccessEntries.createdAt)
    res.json(rows)
  } catch (error) {
    console.error("Failed to get client success entries:", error)
    res.status(500).json({ error: "Failed to get entries" })
  }
})

router.post("/entries", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { client, category, focus, challenge, solution, metrics, testimonialQuote, testimonialAttribution } = req.body
    if (!client?.trim() || !category || !focus?.trim()) {
      return res.status(400).json({ error: "Client, category, and focus are required" })
    }
    const [row] = await db.insert(clientSuccessEntries).values({
      client: client.trim(),
      category,
      focus: focus.trim(),
      challenge: challenge?.trim() || null,
      solution: solution?.trim() || null,
      metrics: metrics || [],
      testimonialQuote: testimonialQuote?.trim() || null,
      testimonialAttribution: testimonialAttribution?.trim() || null,
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create entry:", error)
    res.status(500).json({ error: "Failed to create entry" })
  }
})

router.delete("/entries/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clientSuccessEntries).where(eq(clientSuccessEntries.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete entry:", error)
    res.status(500).json({ error: "Failed to delete entry" })
  }
})

// PATCH /entries/:id/usage — Increment usage count
router.patch("/entries/:id/usage", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .update(clientSuccessEntries)
      .set({
        usageCount: sql`${clientSuccessEntries.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(clientSuccessEntries.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Entry not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to increment entry usage:", error)
    res.status(500).json({ error: "Failed to increment usage" })
  }
})

// ─── Results ───

router.get("/results", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(clientSuccessResults).orderBy(clientSuccessResults.createdAt)
    res.json(rows)
  } catch (error) {
    console.error("Failed to get results:", error)
    res.status(500).json({ error: "Failed to get results" })
  }
})

router.post("/results", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { metric, result, client, numericValue, direction } = req.body
    if (!metric?.trim() || !result?.trim() || !client?.trim() || numericValue == null || !direction) {
      return res.status(400).json({ error: "All fields are required" })
    }
    const [row] = await db.insert(clientSuccessResults).values({
      metric: metric.trim(),
      result: result.trim(),
      client: client.trim(),
      numericValue: Number(numericValue),
      direction,
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create result:", error)
    res.status(500).json({ error: "Failed to create result" })
  }
})

router.delete("/results/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clientSuccessResults).where(eq(clientSuccessResults.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete result:", error)
    res.status(500).json({ error: "Failed to delete result" })
  }
})

// PATCH /results/:id/usage — Increment usage count
router.patch("/results/:id/usage", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .update(clientSuccessResults)
      .set({
        usageCount: sql`${clientSuccessResults.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(clientSuccessResults.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Result not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to increment result usage:", error)
    res.status(500).json({ error: "Failed to increment usage" })
  }
})

// ─── Testimonials ───

// GET /testimonials — List with filtering, search, sort, pagination
router.get("/testimonials", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const {
      status,
      sector,
      search,
      sort = "recent",
      limit = "50",
      offset = "0",
      featured,
    } = req.query as Record<string, string | undefined>

    const conditions = []
    if (status && ["approved", "draft", "hidden"].includes(status)) {
      conditions.push(eq(clientSuccessTestimonials.status, status as "approved" | "draft" | "hidden"))
    }
    if (sector && ["higher-ed", "healthcare", "other"].includes(sector)) {
      conditions.push(eq(clientSuccessTestimonials.sector, sector as "higher-ed" | "healthcare" | "other"))
    }
    if (featured === "true") {
      conditions.push(eq(clientSuccessTestimonials.featured, true))
    }
    if (search?.trim()) {
      const term = `%${search.trim()}%`
      conditions.push(
        or(
          ilike(clientSuccessTestimonials.quote, term),
          ilike(clientSuccessTestimonials.organization, term),
          ilike(clientSuccessTestimonials.name, term),
          ilike(clientSuccessTestimonials.title, term),
        )!
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    // Sort
    let orderBy
    switch (sort) {
      case "most-used":
        orderBy = desc(clientSuccessTestimonials.usageCount)
        break
      case "org-asc":
        orderBy = asc(clientSuccessTestimonials.organization)
        break
      case "shortest":
        orderBy = asc(sql`length(${clientSuccessTestimonials.quote})`)
        break
      case "longest":
        orderBy = desc(sql`length(${clientSuccessTestimonials.quote})`)
        break
      case "recent":
      default:
        orderBy = desc(clientSuccessTestimonials.createdAt)
        break
    }

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(clientSuccessTestimonials)
        .where(where)
        .orderBy(orderBy)
        .limit(Math.min(parseInt(limit) || 50, 200))
        .offset(parseInt(offset) || 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clientSuccessTestimonials)
        .where(where),
    ])

    res.json({ testimonials: rows, total: countResult[0]?.count ?? 0 })
  } catch (error) {
    console.error("Failed to get testimonials:", error)
    res.status(500).json({ error: "Failed to get testimonials" })
  }
})

// GET /testimonials/:id — Single testimonial
router.get("/testimonials/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db.select().from(clientSuccessTestimonials).where(eq(clientSuccessTestimonials.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Testimonial not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to get testimonial:", error)
    res.status(500).json({ error: "Failed to get testimonial" })
  }
})

// POST /testimonials — Create new (defaults to draft status)
router.post("/testimonials", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { quote, name, title, organization, source, sector, tags, notes, testimonialDate } = req.body
    if (!quote?.trim() || !organization?.trim()) {
      return res.status(400).json({ error: "Quote and organization are required" })
    }
    const userName = (req.session as any)?.userName
    const [row] = await db.insert(clientSuccessTestimonials).values({
      quote: quote.trim(),
      name: name?.trim() || null,
      title: title?.trim() || null,
      organization: organization.trim(),
      source: source?.trim() || null,
      status: "draft",
      sector: sector || null,
      tags: tags || [],
      notes: notes?.trim() || null,
      testimonialDate: testimonialDate || null,
      addedBy: userName || "unknown",
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create testimonial:", error)
    res.status(500).json({ error: "Failed to create testimonial" })
  }
})

// PUT /testimonials/:id — Full update
router.put("/testimonials/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { quote, name, title, organization, source, sector, tags, notes, testimonialDate } = req.body
    if (!quote?.trim() || !organization?.trim()) {
      return res.status(400).json({ error: "Quote and organization are required" })
    }
    const [row] = await db
      .update(clientSuccessTestimonials)
      .set({
        quote: quote.trim(),
        name: name?.trim() || null,
        title: title?.trim() || null,
        organization: organization.trim(),
        source: source?.trim() || null,
        sector: sector || null,
        tags: tags || [],
        notes: notes?.trim() || null,
        testimonialDate: testimonialDate || null,
        updatedAt: new Date(),
      })
      .where(eq(clientSuccessTestimonials.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Testimonial not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to update testimonial:", error)
    res.status(500).json({ error: "Failed to update testimonial" })
  }
})

// PATCH /testimonials/:id/status — Change approval status
router.patch("/testimonials/:id/status", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { status } = req.body
    if (!status || !["approved", "draft", "hidden"].includes(status)) {
      return res.status(400).json({ error: "Valid status (approved, draft, hidden) is required" })
    }
    const userName = (req.session as any)?.userName
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    }
    if (status === "approved") {
      updates.approvedBy = userName || "unknown"
      updates.approvedAt = new Date()
    }
    const [row] = await db
      .update(clientSuccessTestimonials)
      .set(updates)
      .where(eq(clientSuccessTestimonials.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Testimonial not found" })
    invalidateTestimonialCache()
    res.json(row)
  } catch (error) {
    console.error("Failed to update testimonial status:", error)
    res.status(500).json({ error: "Failed to update status" })
  }
})

// PATCH /testimonials/:id/usage — Increment usage count
router.patch("/testimonials/:id/usage", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .update(clientSuccessTestimonials)
      .set({
        usageCount: sql`${clientSuccessTestimonials.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientSuccessTestimonials.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Testimonial not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to increment usage:", error)
    res.status(500).json({ error: "Failed to increment usage" })
  }
})

// PATCH /testimonials/:id/featured — Toggle featured
router.patch("/testimonials/:id/featured", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .update(clientSuccessTestimonials)
      .set({
        featured: sql`NOT ${clientSuccessTestimonials.featured}`,
        updatedAt: new Date(),
      })
      .where(eq(clientSuccessTestimonials.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Testimonial not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to toggle featured:", error)
    res.status(500).json({ error: "Failed to toggle featured" })
  }
})

// POST /testimonials/bulk-status — Bulk status change
router.post("/testimonials/bulk-status", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { ids, status } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" })
    }
    if (!status || !["approved", "draft", "hidden"].includes(status)) {
      return res.status(400).json({ error: "Valid status (approved, draft, hidden) is required" })
    }
    const userName = (req.session as any)?.userName
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    }
    if (status === "approved") {
      updates.approvedBy = userName || "unknown"
      updates.approvedAt = new Date()
    }
    const rows = await db
      .update(clientSuccessTestimonials)
      .set(updates)
      .where(sql`${clientSuccessTestimonials.id} = ANY(${ids})`)
      .returning()
    invalidateTestimonialCache()
    res.json({ updated: rows.length, testimonials: rows })
  } catch (error) {
    console.error("Failed to bulk update status:", error)
    res.status(500).json({ error: "Failed to bulk update status" })
  }
})

// DELETE /testimonials/:id
router.delete("/testimonials/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clientSuccessTestimonials).where(eq(clientSuccessTestimonials.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete testimonial:", error)
    res.status(500).json({ error: "Failed to delete testimonial" })
  }
})

// ─── Awards ───

router.get("/awards", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(clientSuccessAwards).orderBy(desc(clientSuccessAwards.createdAt))
    res.json(rows)
  } catch (error) {
    console.error("Failed to get awards:", error)
    res.status(500).json({ error: "Failed to get awards" })
  }
})

router.post("/awards", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { name, year, clientOrProject, companyName, issuingAgency, category, awardLevel, submissionStatus, notes } = req.body
    if (!name?.trim() || !year?.trim()) {
      return res.status(400).json({ error: "Name and year are required" })
    }
    const [row] = await db.insert(clientSuccessAwards).values({
      name: name.trim(),
      year: year.trim(),
      clientOrProject: (clientOrProject || companyName || "").trim(),
      companyName: companyName?.trim() || null,
      issuingAgency: issuingAgency?.trim() || null,
      category: category?.trim() || null,
      awardLevel: awardLevel?.trim() || null,
      submissionStatus: submissionStatus || null,
      notes: notes?.trim() || null,
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create award:", error)
    res.status(500).json({ error: "Failed to create award" })
  }
})

// PUT /awards/:id — Full update
router.put("/awards/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { name, year, companyName, issuingAgency, category, awardLevel, submissionStatus, notes } = req.body
    if (!name?.trim() || !year?.trim()) {
      return res.status(400).json({ error: "Name and year are required" })
    }
    const [row] = await db
      .update(clientSuccessAwards)
      .set({
        name: name.trim(),
        year: year.trim(),
        clientOrProject: companyName?.trim() || "",
        companyName: companyName?.trim() || null,
        issuingAgency: issuingAgency?.trim() || null,
        category: category?.trim() || null,
        awardLevel: awardLevel?.trim() || null,
        submissionStatus: submissionStatus || null,
        notes: notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientSuccessAwards.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Award not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to update award:", error)
    res.status(500).json({ error: "Failed to update award" })
  }
})

// POST /awards/:id/badge — upload badge image
router.post("/awards/:id/badge", requireWriteAccess, badgeUpload.single("badge"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const file = req.file
    if (!file) return res.status(400).json({ error: "No file provided" })
    const ext = file.originalname.match(/\.([^.]+)$/)?.[1] || "png"
    const storageKey = `award-badges/${crypto.randomBytes(16).toString("hex")}.${ext}`
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.storage.from("photo-assets").upload(storageKey, file.buffer, { contentType: file.mimetype, upsert: true })
      if (error) return res.status(500).json({ error: "Failed to upload badge to storage" })
    }
    const [row] = await db.update(clientSuccessAwards).set({ badgeStorageKey: storageKey, updatedAt: new Date() }).where(eq(clientSuccessAwards.id, req.params.id!)).returning()
    if (!row) return res.status(404).json({ error: "Award not found" })
    res.json(row)
  } catch (err) {
    console.error("Badge upload failed:", err)
    res.status(500).json({ error: "Failed to upload badge" })
  }
})

// DELETE /awards/:id/badge — remove badge image
router.delete("/awards/:id/badge", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [existing] = await db.select({ badgeStorageKey: clientSuccessAwards.badgeStorageKey }).from(clientSuccessAwards).where(eq(clientSuccessAwards.id, req.params.id!))
    if (!existing) return res.status(404).json({ error: "Award not found" })
    if (existing.badgeStorageKey && supabaseAdmin) {
      await supabaseAdmin.storage.from("photo-assets").remove([existing.badgeStorageKey])
    }
    const [row] = await db.update(clientSuccessAwards).set({ badgeStorageKey: null, updatedAt: new Date() }).where(eq(clientSuccessAwards.id, req.params.id!)).returning()
    res.json(row)
  } catch (err) {
    console.error("Badge delete failed:", err)
    res.status(500).json({ error: "Failed to remove badge" })
  }
})

router.delete("/awards/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clientSuccessAwards).where(eq(clientSuccessAwards.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete award:", error)
    res.status(500).json({ error: "Failed to delete award" })
  }
})

// PATCH /awards/:id/usage — Increment usage count
router.patch("/awards/:id/usage", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .update(clientSuccessAwards)
      .set({
        usageCount: sql`${clientSuccessAwards.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(clientSuccessAwards.id, req.params.id!))
      .returning()
    if (!row) return res.status(404).json({ error: "Award not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to increment award usage:", error)
    res.status(500).json({ error: "Failed to increment usage" })
  }
})

// ─── Client ↔ Q&A Links ──────────────────────────────────────────────────

// GET /qa-links/:clientName — list linked answers (full answer data) for a client
router.get("/qa-links/:clientName", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })

    const links = await db
      .select({
        linkId: clientQaLinks.id,
        linkedBy: clientQaLinks.linkedBy,
        linkedAt: clientQaLinks.createdAt,
        answerId: answerItems.id,
        question: answerItems.question,
        answer: answerItems.answer,
        status: answerItems.status,
        topicId: answerItems.topicId,
        tags: answerItems.tags,
        usageCount: answerItems.usageCount,
      })
      .from(clientQaLinks)
      .innerJoin(answerItems, eq(clientQaLinks.answerId, answerItems.id))
      .where(eq(clientQaLinks.clientName, clientName))
      .orderBy(desc(clientQaLinks.createdAt))

    // Batch-fetch topic names
    const topicIds = [...new Set(links.map(l => l.topicId))]
    const topicRows = topicIds.length > 0
      ? await db.select({ id: topics.id, displayName: topics.displayName }).from(topics).where(inArray(topics.id, topicIds))
      : []
    const topicMap = Object.fromEntries(topicRows.map(t => [t.id, t.displayName]))

    const result = links.map(l => ({
      linkId: l.linkId,
      linkedBy: l.linkedBy,
      linkedAt: l.linkedAt,
      answerId: l.answerId,
      question: l.question,
      answer: l.answer,
      status: l.status,
      topic: topicMap[l.topicId] ?? null,
      tags: l.tags,
      usageCount: l.usageCount,
    }))

    res.json(result)
  } catch (error) {
    console.error("Failed to get QA links:", error)
    res.status(500).json({ error: "Failed to get QA links" })
  }
})

// GET /qa-links/by-answers — batch: given list of answerIds, return map of answerId → clientNames[]
router.get("/qa-links/by-answers", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return res.json({})

    const links = await db
      .select({ answerId: clientQaLinks.answerId, clientName: clientQaLinks.clientName })
      .from(clientQaLinks)
      .where(inArray(clientQaLinks.answerId, ids))

    const result: Record<string, string[]> = {}
    for (const l of links) {
      if (!result[l.answerId]) result[l.answerId] = []
      result[l.answerId]!.push(l.clientName)
    }
    res.json(result)
  } catch (error) {
    console.error("Failed to get QA links by answers:", error)
    res.status(500).json({ error: "Failed to get links" })
  }
})

// POST /qa-links — link an answer to a client
router.post("/qa-links", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { clientName, answerId } = req.body
    if (!clientName?.trim() || !answerId?.trim()) {
      return res.status(400).json({ error: "clientName and answerId are required" })
    }
    const normalizedName = clientName.trim().toLowerCase()
    const linkedBy = (req.session as any)?.userName || "unknown"

    // Upsert (ignore duplicate)
    const [row] = await db
      .insert(clientQaLinks)
      .values({ clientName: normalizedName, answerId: answerId.trim(), linkedBy })
      .onConflictDoNothing()
      .returning()

    res.status(201).json(row || { clientName: normalizedName, answerId })
  } catch (error) {
    console.error("Failed to create QA link:", error)
    res.status(500).json({ error: "Failed to create link" })
  }
})

// DELETE /qa-links/:linkId — remove a link
router.delete("/qa-links/:linkId", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(clientQaLinks).where(eq(clientQaLinks.id, req.params.linkId!))
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete QA link:", error)
    res.status(500).json({ error: "Failed to delete link" })
  }
})

// ─── Per-Client Win Rates ──────────────────────────────────────────────────

// GET /client-win-rates — win/loss summary grouped by client name
router.get("/client-win-rates", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.execute(sql`
      SELECT
        lower(trim(client)) AS client_key,
        client AS display_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE won = 'Yes')::int AS won,
        COUNT(*) FILTER (WHERE won = 'No')::int AS lost,
        COUNT(*) FILTER (WHERE won = 'Pending' OR won IS NULL OR won = 'Cancelled')::int AS pending,
        MAX(date) AS last_proposal_date
      FROM proposals
      WHERE client IS NOT NULL AND trim(client) != ''
      GROUP BY lower(trim(client)), client
      ORDER BY total DESC
    `)

    const result: Record<string, { won: number; total: number; lost: number; pending: number; rate: number; lastProposalDate: string | null }> = {}
    for (const row of rows as any[]) {
      const key = row.client_key as string
      const won = Number(row.won)
      const total = Number(row.total)
      result[key] = {
        won,
        total,
        lost: Number(row.lost),
        pending: Number(row.pending),
        rate: total > 0 ? Math.round((won / total) * 100) : 0,
        lastProposalDate: row.last_proposal_date ?? null,
      }
    }
    res.json(result)
  } catch (error) {
    console.error("Failed to get client win rates:", error)
    res.status(500).json({ error: "Failed to get win rates" })
  }
})

// ─── Client Brief Generation ──────────────────────────────────────────────────

// POST /client-brief/:clientName — generate a structured client relationship brief (GPT-4o)
router.post("/client-brief/:clientName", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const openai = getOpenAI()
    if (!openai) return res.status(503).json({ error: "AI service not configured" })

    const clientName = decodeURIComponent(req.params.clientName || "").trim()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })

    const { clientContext } = req.body as { clientContext?: any }
    if (!clientContext) return res.status(400).json({ error: "clientContext is required" })

    // Build a compact context string from the client data
    const ctx = clientContext as any
    const sections: string[] = [`CLIENT: ${clientName}`, ctx.sector ? `Sector: ${ctx.sector}` : ""]

    if (ctx.caseStudies?.length > 0) {
      const lines = (ctx.caseStudies as any[]).map((cs: any, i: number) => {
        const metrics = (cs.metrics || []).map((m: any) => `${m.value} ${m.label}`).join("; ")
        return `  ${i + 1}. ${cs.focus}${metrics ? ` — ${metrics}` : ""}${cs.challenge ? `\n     Challenge: ${cs.challenge}` : ""}${cs.solution ? `\n     Solution: ${cs.solution}` : ""}`
      })
      sections.push(`Case Studies (${lines.length}):\n${lines.join("\n")}`)
    }
    if (ctx.results?.length > 0) {
      const lines = (ctx.results as any[]).map((r: any) => `  ${r.direction === "increase" ? "↑" : "↓"} ${r.result} ${r.metric}`)
      sections.push(`Key Results (${lines.length}):\n${lines.join("\n")}`)
    }
    if (ctx.testimonials?.length > 0) {
      const lines = (ctx.testimonials as any[]).map((t: any) => {
        const who = [t.name, t.title, t.organization].filter(Boolean).join(", ")
        return `  "${t.quote}"${who ? ` — ${who}` : ""}`
      })
      sections.push(`Testimonials (${lines.length}):\n${lines.join("\n")}`)
    }
    if (ctx.awards?.length > 0) {
      const lines = (ctx.awards as any[]).map((a: any) => `  ${a.name} (${a.year})`)
      sections.push(`Awards (${lines.length}):\n${lines.join("\n")}`)
    }
    if (ctx.proposals?.length > 0) {
      const won = (ctx.proposals as any[]).filter((p: any) => p.won === "Yes").length
      const total = (ctx.proposals as any[]).length
      const rate = total > 0 ? Math.round((won / total) * 100) : 0
      const lines = (ctx.proposals as any[]).map((p: any) => {
        const date = p.date ? new Date(p.date).getFullYear() : "?"
        const svcs = p.servicesOffered?.length ? ` [${(p.servicesOffered as string[]).slice(0, 3).join(", ")}]` : ""
        return `  ${p.projectType || p.category || "Proposal"} (${date}) — ${p.won ?? "Pending"}${svcs}`
      })
      sections.push(`Proposals (${total} total, ${won} won, ${rate}% win rate):\n${lines.join("\n")}`)
    }
    if (ctx.qaAnswers?.length > 0) {
      const lines = (ctx.qaAnswers as any[]).map((a: any) => `  Q: ${a.question}`)
      sections.push(`Linked Q&A Answers (${lines.length}):\n${lines.join("\n")}`)
    }

    const dataContext = sections.filter(Boolean).join("\n\n")

    const systemPrompt = `You are a client relationship strategist at Stamats, a marketing agency specializing in higher education and healthcare. Generate a concise, professional client brief in Markdown format using ONLY the data provided. Use headers, bullet points, and bold text for scannable reading. Be specific — use real numbers and quotes from the data.`

    const userPrompt = `Generate a client relationship brief for ${clientName} using ONLY this data:

${dataContext}

Use this exact structure:
## ${clientName} — Client Relationship Brief

### Relationship Overview
[2-3 sentences: who they are, how long we've worked together based on proposal dates, overall relationship health]

### Strongest Proof Points
[3-5 bullet points: the most impressive metrics and outcomes, bolded numbers]

### Services & Win Rate
[What services we've pitched, which have won, patterns observed]

### Ready-to-Use Quotes
[If testimonials exist, format 1-2 as ready-to-paste quotes with attribution]

### Awards & Recognition
[Any awards associated with this client]

### Recommended Approach
[2-3 strategic recommendations for future proposals based on what's worked]

If a section has no data, write "No data available" and move on. Keep it under 600 words total.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    })

    const markdown = completion.choices[0]?.message?.content || ""
    res.json({ markdown })
  } catch (error) {
    console.error("Failed to generate client brief:", error)
    res.status(500).json({ error: "Failed to generate brief" })
  }
})

// ─── Client Profile ──────────────────────────────────────────────────

// GET /client-profile/:clientName — all DB assets for a single client (parallel queries)
router.get("/client-profile/:clientName", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const name = decodeURIComponent(req.params.clientName || "").trim()
    if (!name) return res.status(400).json({ error: "clientName is required" })

    const [entries, results, testimonials, awards, proposalRows] = await Promise.all([
      db.select().from(clientSuccessEntries).where(ilike(clientSuccessEntries.client, name)),
      db.select().from(clientSuccessResults).where(ilike(clientSuccessResults.client, name)),
      db.select().from(clientSuccessTestimonials).where(ilike(clientSuccessTestimonials.organization, name)),
      db.select().from(clientSuccessAwards).where(
        or(
          ilike(clientSuccessAwards.companyName, name),
          ilike(clientSuccessAwards.clientOrProject, name)
        )
      ),
      db.select({
        id: proposals.id,
        date: proposals.date,
        ce: proposals.ce,
        client: proposals.client,
        projectType: proposals.projectType,
        won: proposals.won,
        category: proposals.category,
        servicesOffered: proposals.servicesOffered,
        sheetName: proposals.sheetName,
      }).from(proposals).where(ilike(proposals.client, name)),
    ])

    res.json({ caseStudies: entries, results, testimonials, awards, proposals: proposalRows })
  } catch (error) {
    console.error("Failed to get client profile:", error)
    res.status(500).json({ error: "Failed to get client profile" })
  }
})

// ─── Client Documents ─────────────────────────────────────────────────────────

// GET /documents/:clientName — list all docs for a client
router.get("/documents/:clientName", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })
    const rows = await db
      .select({
        id: clientDocuments.id,
        clientName: clientDocuments.clientName,
        title: clientDocuments.title,
        docType: clientDocuments.docType,
        storageKey: clientDocuments.storageKey,
        originalFilename: clientDocuments.originalFilename,
        fileSize: clientDocuments.fileSize,
        mimeType: clientDocuments.mimeType,
        summary: clientDocuments.summary,
        keyPoints: clientDocuments.keyPoints,
        uploadedBy: clientDocuments.uploadedBy,
        createdAt: clientDocuments.createdAt,
      })
      .from(clientDocuments)
      .where(eq(clientDocuments.clientName, clientName))
      .orderBy(desc(clientDocuments.createdAt))
    res.json(rows)
  } catch (error) {
    console.error("Failed to list client documents:", error)
    res.status(500).json({ error: "Failed to list documents" })
  }
})

// POST /documents — upload a document
router.post("/documents", requireWriteAccess, docUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const file = req.file
    if (!file) return res.status(400).json({ error: "No file provided" })
    const { clientName, title, docType = "general" } = req.body
    if (!clientName?.trim()) return res.status(400).json({ error: "clientName is required" })

    const normalizedClient = clientName.trim().toLowerCase()
    const rawExt = file.originalname.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "bin"
    const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin"
    const storageKey = `client-documents/${normalizedClient}/${crypto.randomBytes(16).toString("hex")}.${ext}`
    const docTitle = title?.trim() || file.originalname.replace(/\.[^.]+$/, "")
    const uploadedBy = (req.session as any)?.userName || "unknown"

    // Upload to Supabase
    if (!supabaseAdmin) return res.status(503).json({ error: "Storage unavailable" })
    const { error: uploadError } = await supabaseAdmin.storage.from("client-documents").upload(storageKey, file.buffer, { contentType: file.mimetype, upsert: true })
    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      return res.status(500).json({ error: "Failed to upload file to storage" })
    }

    // Extract text
    const extractedText = await extractDocText(file.buffer, file.mimetype)

    // Insert DB row — if this fails, clean up the uploaded file
    let row: typeof clientDocuments.$inferSelect | undefined
    try {
      ;[row] = await db.insert(clientDocuments).values({
        clientName: normalizedClient,
        title: docTitle,
        docType: docType.trim() || "general",
        storageKey,
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        extractedText,
        uploadedBy,
      }).returning()
    } catch (dbErr) {
      // Rollback: remove the already-uploaded file from Supabase
      await supabaseAdmin.storage.from("client-documents").remove([storageKey])
      throw dbErr
    }

    // Fire-and-forget AI processing
    if (extractedText?.trim() && row) {
      processDocumentAI(row.id, extractedText).catch(() => {})
    }

    // Return without extractedText to keep payload small
    const { extractedText: _et, ...publicRow } = row as typeof row & { extractedText?: string | null }
    res.status(201).json(publicRow)
  } catch (error) {
    console.error("Document upload failed:", error)
    res.status(500).json({ error: "Failed to upload document" })
  }
})

// GET /documents/:id/summary — return just summary + keyPoints for polling
router.get("/documents/:id/summary", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .select({ summary: clientDocuments.summary, keyPoints: clientDocuments.keyPoints })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Document not found" })
    res.json(row)
  } catch (error) {
    console.error("Failed to get document summary:", error)
    res.status(500).json({ error: "Failed to get summary" })
  }
})

// GET /documents/:id/text — return extracted text
router.get("/documents/:id/text", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .select({ extractedText: clientDocuments.extractedText })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Document not found" })
    res.json({ extractedText: row.extractedText })
  } catch (error) {
    console.error("Failed to get document text:", error)
    res.status(500).json({ error: "Failed to get text" })
  }
})

// GET /documents/:id/download — proxy file from Supabase
router.get("/documents/:id/download", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .select({ storageKey: clientDocuments.storageKey, originalFilename: clientDocuments.originalFilename, mimeType: clientDocuments.mimeType })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Document not found" })

    if (!supabaseAdmin) return res.status(503).json({ error: "Storage unavailable" })
    const { data, error } = await supabaseAdmin.storage.from("client-documents").download(row.storageKey)
    if (error || !data) return res.status(500).json({ error: "Failed to download file" })

    const buffer = Buffer.from(await data.arrayBuffer())
    const safeFilename = row.originalFilename.replace(/"/g, '\\"')
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`)
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream")
    res.send(buffer)
  } catch (error) {
    console.error("Document download failed:", error)
    res.status(500).json({ error: "Failed to download document" })
  }
})

// PATCH /documents/:id — update title or docType
router.patch("/documents/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { title, docType } = req.body
    const updates: Partial<typeof clientDocuments.$inferInsert> = { updatedAt: new Date() }
    if (typeof title === "string" && title.trim()) updates.title = title.trim()
    if (typeof docType === "string" && docType.trim()) updates.docType = docType.trim()
    if (Object.keys(updates).length === 1) return res.status(400).json({ error: "No valid fields to update" })
    const [row] = await db.update(clientDocuments).set(updates).where(eq(clientDocuments.id, req.params.id!)).returning()
    if (!row) return res.status(404).json({ error: "Document not found" })
    res.json(row)
  } catch (error) {
    console.error("Document update failed:", error)
    res.status(500).json({ error: "Failed to update document" })
  }
})

// DELETE /documents/:id
router.delete("/documents/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const [row] = await db
      .select({ storageKey: clientDocuments.storageKey })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))
    if (!row) return res.status(404).json({ error: "Document not found" })

    if (supabaseAdmin) {
      await supabaseAdmin.storage.from("client-documents").remove([row.storageKey])
    }
    await db.delete(clientDocuments).where(eq(clientDocuments.id, req.params.id!))
    res.json({ success: true })
  } catch (error) {
    console.error("Document delete failed:", error)
    res.status(500).json({ error: "Failed to delete document" })
  }
})

// ─── Client Brand Kit ─────────────────────────────────────────────────────────

// GET /brand-kit/:clientName
router.get("/brand-kit/:clientName", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })
    const [row] = await db.select().from(clientBrandKit).where(eq(clientBrandKit.clientName, clientName))
    if (!row) return res.json(null)
    res.json(row)
  } catch (error) {
    console.error("Failed to get brand kit:", error)
    res.status(500).json({ error: "Failed to get brand kit" })
  }
})

// POST /brand-kit/:clientName/scrape — scrape website for brand data
router.post("/brand-kit/:clientName/scrape", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })
    const { websiteUrl } = req.body
    if (!websiteUrl?.trim()) return res.status(400).json({ error: "websiteUrl is required" })
    if (!isPublicUrl(websiteUrl.trim())) return res.status(400).json({ error: "Invalid or non-public URL" })
    const updatedBy = (req.session as any)?.userName || "unknown"

    // UPSERT with pending status
    await db.insert(clientBrandKit).values({
      clientName,
      websiteUrl: websiteUrl.trim(),
      scrapeStatus: "pending",
      updatedBy,
    }).onConflictDoUpdate({
      target: clientBrandKit.clientName,
      set: { websiteUrl: websiteUrl.trim(), scrapeStatus: "pending", updatedAt: new Date(), updatedBy },
    })

    // Remember old logo key so we can delete it after a successful re-scrape
    const [existingKit] = await db.select({ logoStorageKey: clientBrandKit.logoStorageKey }).from(clientBrandKit).where(eq(clientBrandKit.clientName, clientName))
    const oldLogoStorageKey = existingKit?.logoStorageKey || null

    // Fetch the website
    let html = ""
    let scrapeStatus: "success" | "partial" | "failed" = "failed"
    let scrapeError: string | null = null
    const logoResults: { logoUrl: string | null; logoStorageKey: string | null } = { logoUrl: null, logoStorageKey: null }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(websiteUrl.trim(), {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Stamats-Bot/1.0)" },
      })
      clearTimeout(timer)
      html = await response.text()
    } catch (err: unknown) {
      scrapeError = err instanceof Error ? err.message : String(err)
      await db.update(clientBrandKit).set({ scrapeStatus: "failed", scrapeError, updatedAt: new Date() }).where(eq(clientBrandKit.clientName, clientName))
      const [row] = await db.select().from(clientBrandKit).where(eq(clientBrandKit.clientName, clientName))
      return res.json(row)
    }

    // Collect inline <style> blocks
    const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1] || "").join("\n")

    // Fetch linked external stylesheets (up to 3, 5s timeout each)
    const base = new URL(websiteUrl.trim())
    const sheetHrefs = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
      .map(m => {
        const href = m[1]
        if (!href) return null
        if (href.startsWith("http")) return href
        if (href.startsWith("//")) return `${base.protocol}${href}`
        if (href.startsWith("/")) return `${base.protocol}//${base.host}${href}`
        return `${base.protocol}//${base.host}/${href}`
      })
      .filter((h): h is string => !!h && isPublicUrl(h))
      .slice(0, 3)

    const sheetTexts = await Promise.all(sheetHrefs.map(async href => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 5000)
        const r = await fetch(href, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; Stamats-Bot/1.0)" } })
        clearTimeout(t)
        return r.ok ? await r.text() : ""
      } catch { return "" }
    }))

    const allCss = [inlineStyles, ...sheetTexts].join("\n")

    // Extract colors
    const allHex = [...new Set([...(allCss.match(/#[0-9a-fA-F]{6}/g) || [])])]
    // Prioritize CSS variable-based brand colors
    const cssVarColors = [...(allCss.match(/--(?:color|primary|secondary|accent|brand|theme)[^:]*:\s*(#[0-9a-fA-F]{6})/gi) || [])]
      .map(m => { const match = m.match(/#[0-9a-fA-F]{6}/); return match ? match[0] : null })
      .filter(Boolean) as string[]
    const filteredColors = allHex.filter(hex => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const isNearBlack = r < 30 && g < 30 && b < 30
      const isNearWhite = r > 230 && g > 230 && b > 230
      return !isNearBlack && !isNearWhite
    })
    const prioritized = [...new Set([...cssVarColors, ...filteredColors])].slice(0, 10)

    // Extract fonts
    const fontMatches = [...(allCss.matchAll(/font-family:\s*([^;}"]+)/gi))].map(m =>
      m[1]?.trim().replace(/^['"]|['"]$/g, "").split(",")[0]?.trim()
    ).filter(Boolean) as string[]
    const primaryFont = fontMatches.find(f => f && !["inherit", "initial", "unset", "serif", "sans-serif", "monospace"].includes(f.toLowerCase())) || null
    const uniqueFonts = [...new Set(fontMatches)]
    const fontStack = uniqueFonts.slice(0, 3).join(", ") || null

    // Extract logo
    const logoMatch = html.match(/<img[^>]*(?:logo|brand)[^>]*src=["']([^"']+)["']/i)
      || html.match(/<img[^>]*src=["']([^"']*logo[^"']*)["']/i)
    let rawLogoUrl = logoMatch?.[1] || null

    // Try favicon as fallback
    if (!rawLogoUrl) {
      const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
        || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
      rawLogoUrl = faviconMatch?.[1] || null
    }

    // Resolve relative URLs (reuse `base` already declared above)
    if (rawLogoUrl && !rawLogoUrl.startsWith("http")) {
      rawLogoUrl = rawLogoUrl.startsWith("/")
        ? `${base.protocol}//${base.host}${rawLogoUrl}`
        : `${base.protocol}//${base.host}/${rawLogoUrl}`
    }

    // Validate logo URL before fetching (second-order SSRF guard)
    if (rawLogoUrl && !isPublicUrl(rawLogoUrl)) rawLogoUrl = null

    // Download and store logo
    if (rawLogoUrl && supabaseAdmin) {
      try {
        const logoController = new AbortController()
        const logoTimer = setTimeout(() => logoController.abort(), 8000)
        const logoRes = await fetch(rawLogoUrl, { signal: logoController.signal })
        clearTimeout(logoTimer)
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer())
          const logoMime = logoRes.headers.get("content-type") || "image/png"
          const logoExt = logoMime.includes("svg") ? "svg" : logoMime.includes("png") ? "png" : logoMime.includes("jpeg") ? "jpg" : "png"
          const logoStorageKey = `client-logos/${clientName}/${crypto.randomBytes(12).toString("hex")}.${logoExt}`
          const { error: uploadErr } = await supabaseAdmin.storage.from("client-documents").upload(logoStorageKey, logoBuffer, { contentType: logoMime, upsert: true })
          if (!uploadErr) {
            logoResults.logoStorageKey = logoStorageKey
            logoResults.logoUrl = rawLogoUrl
          }
        }
      } catch {
        // Logo download failed — non-fatal
      }
    } else if (rawLogoUrl) {
      logoResults.logoUrl = rawLogoUrl
    }

    scrapeStatus = prioritized.length > 0 || primaryFont ? "success" : "partial"

    const [updatedRow] = await db.update(clientBrandKit).set({
      scrapedAt: new Date(),
      scrapeStatus,
      scrapeError: null,
      rawColors: prioritized,
      primaryColor: prioritized[0] || null,
      secondaryColor: prioritized[1] || null,
      accentColor: prioritized[2] || null,
      primaryFont,
      fontStack,
      logoUrl: logoResults.logoUrl,
      logoStorageKey: logoResults.logoStorageKey,
      updatedAt: new Date(),
    }).where(eq(clientBrandKit.clientName, clientName)).returning()

    // Clean up old logo from Supabase if a new one was stored
    if (supabaseAdmin && oldLogoStorageKey && logoResults.logoStorageKey && oldLogoStorageKey !== logoResults.logoStorageKey) {
      supabaseAdmin.storage.from("client-documents").remove([oldLogoStorageKey]).catch(() => {})
    }

    res.json(updatedRow)
  } catch (error) {
    console.error("Brand kit scrape failed:", error)
    res.status(500).json({ error: "Failed to scrape brand kit" })
  }
})

// PATCH /brand-kit/:clientName — manual update
router.patch("/brand-kit/:clientName", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })
    const updatedBy = (req.session as any)?.userName || "unknown"

    const allowedFields: Array<keyof typeof clientBrandKit.$inferInsert> = [
      "websiteUrl", "primaryColor", "secondaryColor", "accentColor", "backgroundColor", "textColor",
      "primaryFont", "secondaryFont", "fontStack", "tone", "styleNotes",
    ]
    const updates: Partial<typeof clientBrandKit.$inferInsert> = { updatedAt: new Date(), updatedBy }
    for (const field of allowedFields) {
      if (field in req.body) {
        (updates as Record<string, unknown>)[field] = req.body[field] ?? null
      }
    }

    // Upsert
    const existing = await db.select({ id: clientBrandKit.id }).from(clientBrandKit).where(eq(clientBrandKit.clientName, clientName))
    let row
    if (existing.length === 0) {
      const [inserted] = await db.insert(clientBrandKit).values({ clientName, ...updates }).returning()
      row = inserted
    } else {
      const [updated] = await db.update(clientBrandKit).set(updates).where(eq(clientBrandKit.clientName, clientName)).returning()
      row = updated
    }
    res.json(row)
  } catch (error) {
    console.error("Brand kit update failed:", error)
    res.status(500).json({ error: "Failed to update brand kit" })
  }
})

// POST /brand-kit/:clientName/logo — upload logo file
router.post("/brand-kit/:clientName/logo", requireWriteAccess, docUpload.single("logo"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const clientName = decodeURIComponent(req.params.clientName || "").trim().toLowerCase()
    if (!clientName) return res.status(400).json({ error: "clientName is required" })
    const file = req.file
    if (!file) return res.status(400).json({ error: "No file provided" })
    const updatedBy = (req.session as any)?.userName || "unknown"

    const rawExt = file.originalname.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "png"
    const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 10) || "png"
    const logoStorageKey = `client-logos/${clientName}/${crypto.randomBytes(12).toString("hex")}.${ext}`

    if (!supabaseAdmin) return res.status(503).json({ error: "Storage unavailable" })
    const { error: logoUploadError } = await supabaseAdmin.storage.from("client-documents").upload(logoStorageKey, file.buffer, { contentType: file.mimetype, upsert: true })
    if (logoUploadError) return res.status(500).json({ error: "Failed to upload logo" })

    const existing = await db.select({ id: clientBrandKit.id, logoStorageKey: clientBrandKit.logoStorageKey }).from(clientBrandKit).where(eq(clientBrandKit.clientName, clientName))
    const oldLogoKey = existing[0]?.logoStorageKey
    let row
    if (existing.length === 0) {
      const [inserted] = await db.insert(clientBrandKit).values({ clientName, logoStorageKey, updatedBy }).returning()
      row = inserted
    } else {
      const [updated] = await db.update(clientBrandKit).set({ logoStorageKey, updatedAt: new Date(), updatedBy }).where(eq(clientBrandKit.clientName, clientName)).returning()
      row = updated
    }
    // Clean up old logo file from Supabase storage
    if (oldLogoKey && oldLogoKey !== logoStorageKey) {
      supabaseAdmin.storage.from("client-documents").remove([oldLogoKey]).catch(() => {})
    }
    res.json(row)
  } catch (error) {
    console.error("Logo upload failed:", error)
    res.status(500).json({ error: "Failed to upload logo" })
  }
})

export default router
