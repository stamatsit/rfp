/**
 * Webinars Feature — routes for GoToWebinar export upload + queryable archive.
 *
 * Mount: /api/webinars
 *
 * - POST   /upload                          — any authenticated user
 * - GET    /                                — list webinars with summary counts
 * - GET    /:id                             — webinar detail + registrants
 * - PATCH  /:id/registrants/:registrantId   — update follow-up status / notes / manual category override
 * - POST   /:id/recategorize                — re-run categorize for all non-overridden registrants
 * - DELETE /:id                             — admin only
 * - GET    /:id/export.csv                  — CSV export
 * - GET    /:id/export.xlsx                 — XLSX export
 * - GET    /people                          — cross-webinar deduped people view
 * - GET    /stats                           — top orgs + counts over time
 */
import { Router, type Request, type Response } from "express"
import multer from "multer"
import { and, eq, sql, desc, asc } from "drizzle-orm"
import xlsx from "xlsx"
import { db, webinars, webinarUploads, webinarRegistrants, clients } from "../db/index.js"
import { requireWriteAccess } from "../middleware/auth.js"
import { parseWebinarXlsx } from "../lib/webinarXlsxParser.js"
import { categorizeEmail } from "../lib/webinarCategorize.js"

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },  // 25 MB
})

const FOLLOWUP_STATUSES = new Set(["no-outreach", "vm-left", "email-sent", "connected", "dead"])
const CATEGORIES = new Set(["do-not-contact", "client", "employee", "non-client"])

// ─── POST /upload ────────────────────────────────────────────
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    if (!req.file) return res.status(400).json({ error: "No file uploaded" })

    const safeDb = db
    const uploadedBy = (req.session as any)?.userName || "unknown"
    const optionalWebinarId = typeof req.body?.webinarId === "string" ? req.body.webinarId : null

    let parsed
    try {
      parsed = parseWebinarXlsx(req.file.buffer)
    } catch (e: any) {
      return res.status(400).json({ error: `Could not parse file: ${e?.message ?? "unknown"}` })
    }

    // Resolve or create the webinar row
    let webinarId = optionalWebinarId
    if (!webinarId) {
      // Try to match an existing webinar by source_key (webinarKey from GoToWebinar)
      if (parsed.webinarKey) {
        const [existing] = await safeDb.select().from(webinars).where(eq(webinars.sourceKey, parsed.webinarKey)).limit(1)
        if (existing) webinarId = existing.id
      }
      if (!webinarId) {
        // Create new
        const dateValue = parsed.webinarDate ? toDateString(parsed.webinarDate) : null
        const [created] = await safeDb.insert(webinars).values({
          title: parsed.title || (req.file.originalname.replace(/\.xlsx?$/i, "") || "Untitled webinar"),
          webinarDate: dateValue,
          sourceKey: parsed.webinarKey,
          createdBy: uploadedBy,
        }).returning()
        webinarId = created!.id
      }
    }

    // Record the upload itself
    const [uploadRow] = await safeDb.insert(webinarUploads).values({
      webinarId,
      filename: req.file.originalname,
      uploadKind: parsed.uploadKind,
      rawRows: parsed.rawRows,
      uploadedBy,
    }).returning()

    // Process registrants (categorize + upsert)
    let inserted = 0, updated = 0
    for (const r of parsed.registrants) {
      const cat = await categorizeEmail(r.email)
      // Try to find an existing row for this (webinar_id, lower(email))
      const [existing] = await safeDb.select().from(webinarRegistrants)
        .where(and(
          eq(webinarRegistrants.webinarId, webinarId),
          sql`lower(${webinarRegistrants.email}) = ${r.email.toLowerCase()}`,
        )).limit(1)

      if (existing) {
        // Update: don't overwrite manual override category; do overlay attendance info if present
        const patch: any = {
          firstName: existing.firstName ?? r.firstName,
          lastName: existing.lastName ?? r.lastName,
          organizationRaw: existing.organizationRaw ?? r.organizationRaw,
          uploadId: uploadRow!.id,
          updatedAt: new Date(),
        }
        if (parsed.uploadKind === "attendance") {
          if (r.attended !== null) patch.attended = r.attended
          if (r.attendanceDate) patch.attendedAt = r.attendanceDate
        }
        if (!existing.manualOverride) {
          patch.category = cat.category
          patch.clientId = cat.clientId
        }
        await safeDb.update(webinarRegistrants).set(patch).where(eq(webinarRegistrants.id, existing.id))
        updated++
      } else {
        await safeDb.insert(webinarRegistrants).values({
          webinarId,
          uploadId: uploadRow!.id,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          organizationRaw: r.organizationRaw,
          clientId: cat.clientId,
          category: cat.category,
          attended: r.attended,
          registeredAt: r.registrationDate,
          attendedAt: r.attendanceDate,
        })
        inserted++
      }
    }

    return res.status(201).json({
      webinarId,
      uploadId: uploadRow!.id,
      uploadKind: parsed.uploadKind,
      rawRows: parsed.rawRows,
      inserted,
      updated,
      title: parsed.title,
      webinarDate: parsed.webinarDate,
    })
  } catch (error: any) {
    console.error("Failed to process webinar upload:", error)
    return res.status(500).json({ error: error?.message || "Failed to process upload" })
  }
})

// ─── GET /people ──────────────────────────────────────────────
// IMPORTANT: must come before GET /:id (Express matches in declaration order).
router.get("/people", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const rows = await safeDb.select({
      email: webinarRegistrants.email,
      firstName: webinarRegistrants.firstName,
      lastName: webinarRegistrants.lastName,
      organizationRaw: webinarRegistrants.organizationRaw,
      category: webinarRegistrants.category,
      clientId: webinarRegistrants.clientId,
      webinarCount: sql<number>`count(distinct ${webinarRegistrants.webinarId})::int`,
      attendedCount: sql<number>`sum(case when ${webinarRegistrants.attended} = true then 1 else 0 end)::int`,
      lastSeen: sql<string>`max(${webinarRegistrants.createdAt})`,
    }).from(webinarRegistrants)
      .groupBy(
        webinarRegistrants.email,
        webinarRegistrants.firstName,
        webinarRegistrants.lastName,
        webinarRegistrants.organizationRaw,
        webinarRegistrants.category,
        webinarRegistrants.clientId,
      )
      .orderBy(desc(sql`count(distinct ${webinarRegistrants.webinarId})`))
    return res.json(rows)
  } catch (error: any) {
    console.error("Failed to load people view:", error)
    return res.status(500).json({ error: error?.message || "Failed to load people view" })
  }
})

// ─── GET /stats ───────────────────────────────────────────────
// IMPORTANT: must come before GET /:id.
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const catCounts = await safeDb.select({
      category: webinarRegistrants.category,
      n: sql<number>`count(*)::int`,
    }).from(webinarRegistrants).groupBy(webinarRegistrants.category)

    // Roll up by client; join to clients to get the canonical name.
    const topOrgs = await safeDb.select({
      clientId: webinarRegistrants.clientId,
      clientName: clients.name,
      organizationRaw: webinarRegistrants.organizationRaw,
      n: sql<number>`count(*)::int`,
    }).from(webinarRegistrants)
      .leftJoin(clients, eq(clients.id, webinarRegistrants.clientId))
      .where(eq(webinarRegistrants.category, "client"))
      .groupBy(webinarRegistrants.clientId, clients.name, webinarRegistrants.organizationRaw)
      .orderBy(desc(sql`count(*)`))
      .limit(25)

    return res.json({ categoryCounts: catCounts, topOrgs })
  } catch (error: any) {
    console.error("Failed to load stats:", error)
    return res.status(500).json({ error: error?.message || "Failed to load stats" })
  }
})

// ─── GET / ────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    // Fetch webinars + counts per category
    const rows = await safeDb.select().from(webinars).orderBy(desc(webinars.webinarDate), desc(webinars.createdAt))
    if (rows.length === 0) return res.json([])

    const counts = await safeDb.select({
      webinarId: webinarRegistrants.webinarId,
      category: webinarRegistrants.category,
      total: sql<number>`count(*)::int`,
      attended: sql<number>`sum(case when ${webinarRegistrants.attended} = true then 1 else 0 end)::int`,
    }).from(webinarRegistrants).groupBy(webinarRegistrants.webinarId, webinarRegistrants.category)

    const grouped = new Map<string, { client: number; "non-client": number; employee: number; "do-not-contact": number; attended: number; total: number }>()
    for (const c of counts) {
      const entry = grouped.get(c.webinarId) ?? { client: 0, "non-client": 0, employee: 0, "do-not-contact": 0, attended: 0, total: 0 }
      ;(entry as any)[c.category] = Number(c.total)
      entry.total += Number(c.total)
      entry.attended += Number(c.attended) || 0
      grouped.set(c.webinarId, entry)
    }

    const result = rows.map(w => ({
      ...w,
      counts: grouped.get(w.id) ?? { client: 0, "non-client": 0, employee: 0, "do-not-contact": 0, attended: 0, total: 0 },
    }))
    return res.json(result)
  } catch (error: any) {
    console.error("Failed to list webinars:", error)
    return res.status(500).json({ error: error?.message || "Failed to list webinars" })
  }
})

// ─── GET /:id ─────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const id = req.params.id!
    const [webinar] = await safeDb.select().from(webinars).where(eq(webinars.id, id)).limit(1)
    if (!webinar) return res.status(404).json({ error: "Webinar not found" })

    const registrants = await safeDb.select().from(webinarRegistrants)
      .where(eq(webinarRegistrants.webinarId, id))
      .orderBy(asc(webinarRegistrants.lastName), asc(webinarRegistrants.firstName))

    const uploads = await safeDb.select().from(webinarUploads)
      .where(eq(webinarUploads.webinarId, id))
      .orderBy(desc(webinarUploads.uploadedAt))

    return res.json({ webinar, registrants, uploads })
  } catch (error: any) {
    console.error("Failed to load webinar:", error)
    return res.status(500).json({ error: error?.message || "Failed to load webinar" })
  }
})

// ─── PATCH /:id/registrants/:registrantId ─────────────────────
router.patch("/:id/registrants/:registrantId", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const { id: webinarId, registrantId } = req.params
    const body = req.body ?? {}
    const patch: any = { updatedAt: new Date() }

    if (typeof body.category === "string") {
      if (!CATEGORIES.has(body.category)) return res.status(400).json({ error: "Invalid category" })
      patch.category = body.category
      patch.manualOverride = true
    }
    if (typeof body.followUpStatus === "string") {
      if (!FOLLOWUP_STATUSES.has(body.followUpStatus)) return res.status(400).json({ error: "Invalid follow_up_status" })
      patch.followUpStatus = body.followUpStatus
    }
    if (typeof body.followUpNotes === "string") {
      patch.followUpNotes = body.followUpNotes.trim() || null
    }
    if (typeof body.manualOverride === "boolean") {
      patch.manualOverride = body.manualOverride
    }

    const [row] = await safeDb.update(webinarRegistrants).set(patch).where(and(
      eq(webinarRegistrants.id, registrantId!),
      eq(webinarRegistrants.webinarId, webinarId!),
    )).returning()
    if (!row) return res.status(404).json({ error: "Registrant not found" })
    return res.json(row)
  } catch (error: any) {
    console.error("Failed to patch registrant:", error)
    return res.status(500).json({ error: error?.message || "Failed to patch registrant" })
  }
})

// ─── POST /:id/recategorize ───────────────────────────────────
router.post("/:id/recategorize", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const id = req.params.id!
    const rows = await safeDb.select().from(webinarRegistrants)
      .where(and(eq(webinarRegistrants.webinarId, id), eq(webinarRegistrants.manualOverride, false)))
    let changed = 0
    for (const r of rows) {
      const cat = await categorizeEmail(r.email)
      if (cat.category !== r.category || cat.clientId !== r.clientId) {
        await safeDb.update(webinarRegistrants).set({
          category: cat.category,
          clientId: cat.clientId,
          updatedAt: new Date(),
        }).where(eq(webinarRegistrants.id, r.id))
        changed++
      }
    }
    return res.json({ scanned: rows.length, changed })
  } catch (error: any) {
    console.error("Failed to recategorize:", error)
    return res.status(500).json({ error: error?.message || "Failed to recategorize" })
  }
})

// ─── DELETE /:id ──────────────────────────────────────────────
router.delete("/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    await db.delete(webinars).where(eq(webinars.id, req.params.id!))
    return res.json({ success: true })
  } catch (error: any) {
    console.error("Failed to delete webinar:", error)
    return res.status(500).json({ error: error?.message || "Failed to delete webinar" })
  }
})

// ─── GET /:id/export.csv ──────────────────────────────────────
router.get("/:id/export.csv", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const id = req.params.id!
    const [webinar] = await safeDb.select().from(webinars).where(eq(webinars.id, id)).limit(1)
    if (!webinar) return res.status(404).json({ error: "Webinar not found" })
    const rows = await filterRegistrantsFromQuery(safeDb, id, req.query)
    const csv = toCsv(rows)
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(webinar.title)}.csv"`)
    return res.send(csv)
  } catch (error: any) {
    console.error("Failed to export csv:", error)
    return res.status(500).json({ error: error?.message || "Failed to export csv" })
  }
})

// ─── GET /:id/export.xlsx ─────────────────────────────────────
router.get("/:id/export.xlsx", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const safeDb = db
    const id = req.params.id!
    const [webinar] = await safeDb.select().from(webinars).where(eq(webinars.id, id)).limit(1)
    if (!webinar) return res.status(404).json({ error: "Webinar not found" })
    const rows = await filterRegistrantsFromQuery(safeDb, id, req.query)
    const aoa = [
      ["First Name", "Last Name", "Email", "Organization", "Category", "Attended", "Follow-up Status", "Notes", "Registered At", "Attended At"],
      ...rows.map(r => [
        r.firstName, r.lastName, r.email, r.organizationRaw, r.category,
        r.attended === null ? "" : r.attended ? "Yes" : "No",
        r.followUpStatus, r.followUpNotes,
        r.registeredAt ? new Date(r.registeredAt).toISOString() : "",
        r.attendedAt ? new Date(r.attendedAt).toISOString() : "",
      ]),
    ]
    const ws = xlsx.utils.aoa_to_sheet(aoa)
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, "Registrants")
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" })
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(webinar.title)}.xlsx"`)
    return res.send(buf)
  } catch (error: any) {
    console.error("Failed to export xlsx:", error)
    return res.status(500).json({ error: error?.message || "Failed to export xlsx" })
  }
})

export default router

// ─── Helpers ──────────────────────────────────────────────────

async function filterRegistrantsFromQuery(safeDb: NonNullable<typeof db>, webinarId: string, query: any) {
  const conditions: any[] = [eq(webinarRegistrants.webinarId, webinarId)]
  if (typeof query.category === "string" && CATEGORIES.has(query.category)) {
    conditions.push(eq(webinarRegistrants.category, query.category as any))
  }
  if (typeof query.followUpStatus === "string" && FOLLOWUP_STATUSES.has(query.followUpStatus)) {
    conditions.push(eq(webinarRegistrants.followUpStatus, query.followUpStatus as any))
  }
  // excludeDnc=true → drop any rows in the do-not-contact category (matches the UI's
  // "Show DNC" toggle being off, which is the default).
  if (query.excludeDnc === "true" || query.excludeDnc === true) {
    conditions.push(sql`${webinarRegistrants.category} <> 'do-not-contact'`)
  }
  // q=… → free-text search on name / email / organization, same fields as the UI search box.
  if (typeof query.q === "string" && query.q.trim()) {
    const term = `%${query.q.trim().toLowerCase()}%`
    conditions.push(sql`(
      lower(${webinarRegistrants.email}) LIKE ${term}
      OR lower(coalesce(${webinarRegistrants.firstName}, '')) LIKE ${term}
      OR lower(coalesce(${webinarRegistrants.lastName}, '')) LIKE ${term}
      OR lower(coalesce(${webinarRegistrants.organizationRaw}, '')) LIKE ${term}
    )`)
  }
  const rows = await safeDb.select().from(webinarRegistrants)
    .where(and(...conditions))
    .orderBy(asc(webinarRegistrants.lastName), asc(webinarRegistrants.firstName))
  return rows
}

function toCsv(rows: any[]): string {
  const headers = ["firstName", "lastName", "email", "organizationRaw", "category", "attended", "followUpStatus", "followUpNotes", "registeredAt", "attendedAt"]
  const escape = (v: any) => {
    if (v === null || v === undefined) return ""
    const s = String(v)
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, "\"\"")}"`
    return s
  }
  const lines = [headers.join(",")]
  for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(","))
  return lines.join("\n")
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9\-_.]+/gi, "_").slice(0, 80) || "webinar"
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
