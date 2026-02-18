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
import { eq } from "drizzle-orm"
import { requireWriteAccess } from "../middleware/auth.js"

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

// ─── Testimonials ───

router.get("/testimonials", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(clientSuccessTestimonials).orderBy(clientSuccessTestimonials.createdAt)
    res.json(rows)
  } catch (error) {
    console.error("Failed to get testimonials:", error)
    res.status(500).json({ error: "Failed to get testimonials" })
  }
})

router.post("/testimonials", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { quote, name, title, organization } = req.body
    if (!quote?.trim() || !organization?.trim()) {
      return res.status(400).json({ error: "Quote and organization are required" })
    }
    const [row] = await db.insert(clientSuccessTestimonials).values({
      quote: quote.trim(),
      name: name?.trim() || null,
      title: title?.trim() || null,
      organization: organization.trim(),
    }).returning()
    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to create testimonial:", error)
    res.status(500).json({ error: "Failed to create testimonial" })
  }
})

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

export default router
