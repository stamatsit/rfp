/**
 * Client Success Data Routes
 * CRUD for user-added client success entries, results, testimonials, and awards.
 * These merge with the hardcoded clientSuccessData on the client.
 */

import { Router, type Request, type Response } from "express"
import { db } from "../db/index.js"
import {
  clientSuccessEntries,
  clientSuccessResults,
  clientSuccessTestimonials,
  clientSuccessAwards,
} from "../db/schema.js"
import { eq, sql, and, or, ilike, desc, asc } from "drizzle-orm"
import { requireWriteAccess } from "../middleware/auth.js"
import { invalidateTestimonialCache } from "../services/utils/dbTestimonials.js"

const router = Router()

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
    const { quote, name, title, organization, source, sector, tags } = req.body
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
    const { quote, name, title, organization, source, sector, tags } = req.body
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
    const rows = await db.select().from(clientSuccessAwards).orderBy(clientSuccessAwards.createdAt)
    res.json(rows)
  } catch (error) {
    console.error("Failed to get awards:", error)
    res.status(500).json({ error: "Failed to get awards" })
  }
})

router.post("/awards", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { name, year, clientOrProject } = req.body
    if (!name?.trim() || !year?.trim() || !clientOrProject?.trim()) {
      return res.status(400).json({ error: "All fields are required" })
    }
    const [row] = await db.insert(clientSuccessAwards).values({
      name: name.trim(),
      year: year.trim(),
      clientOrProject: clientOrProject.trim(),
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create award:", error)
    res.status(500).json({ error: "Failed to create award" })
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

export default router
