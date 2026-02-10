import { Router } from "express"
import multer from "multer"
import path from "path"
import { streamBriefing } from "../services/briefingAIService.js"
import { streamDocumentChat, queryDocumentChat, detectRFPSignals, generateRFPChecklist, checkRFPCompliance, streamInlineEdit } from "../services/documentAIService.js"
import { extractDocumentText } from "../services/rfpService.js"
import { getCurrentUserId } from "../middleware/getCurrentUser.js"
import { db } from "../db/index.js"
import { studioDocuments, studioDocumentVersions, studioTemplates, studioAssets } from "../db/schema.js"
import { eq, and, desc, ilike, or, sql } from "drizzle-orm"

const router = Router()

// Configure multer for document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "application/octet-stream",
    ]
    const allowedExts = [".pdf", ".docx", ".doc", ".txt"]
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: PDF, DOCX, DOC, TXT`))
    }
  },
})

// ─── AI Endpoints ───

// POST /api/studio/briefing/stream
router.post("/briefing/stream", async (_req, res) => {
  try {
    await streamBriefing(res)
  } catch (error) {
    console.error("Briefing stream error:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate briefing" })
    }
  }
})

// POST /api/studio/extract-document
router.post("/extract-document", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }
    const result = await extractDocumentText(req.file.buffer, req.file.mimetype, req.file.originalname)
    const { isRFP } = detectRFPSignals(result.text)
    res.json({ ...result, isRFP })
  } catch (error) {
    console.error("Studio document extraction failed:", error)
    const message = error instanceof Error ? error.message : "Failed to extract document text"
    res.status(500).json({ error: message })
  }
})

// POST /api/studio/chat/stream
router.post("/chat/stream", async (req, res) => {
  const { query, documentContent, reviewMode, conversationHistory, uploadedFileText } = req.body
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Query is required (min 2 characters)" })
  }
  if (query.trim().length > 5000) {
    return res.status(400).json({ error: "Query too long (max 5000 characters)" })
  }
  try {
    await streamDocumentChat(query.trim(), res, {
      documentContent,
      uploadedFileText,
      reviewMode,
      conversationHistory,
    })
  } catch (error) {
    console.error("Chat stream error:", error instanceof Error ? error.stack : error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream response" })
    }
  }
})

// POST /api/studio/chat/query (non-streaming fallback)
router.post("/chat/query", async (req, res) => {
  const { query, documentContent, reviewMode, uploadedFileText } = req.body
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Query is required" })
  }
  try {
    const result = await queryDocumentChat(query.trim(), {
      documentContent,
      uploadedFileText,
      reviewMode,
    })
    res.json(result)
  } catch (error) {
    console.error("Chat query error:", error)
    res.status(500).json({ error: "Failed to generate response" })
  }
})

// POST /api/studio/inline-edit (streaming inline text edit)
router.post("/inline-edit", async (req, res) => {
  const { selectedText, action, customInstruction, documentContext } = req.body
  if (!selectedText || typeof selectedText !== "string" || selectedText.trim().length < 1) {
    return res.status(400).json({ error: "Selected text is required" })
  }
  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "Action is required" })
  }
  try {
    await streamInlineEdit(selectedText.trim(), action, res, {
      customInstruction,
      documentContext,
    })
  } catch (error) {
    console.error("Inline edit error:", error instanceof Error ? error.stack : error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream inline edit" })
    }
  }
})

// ─── RFP Checklist Endpoints ───

// POST /api/studio/checklist/generate
router.post("/checklist/generate", async (req, res) => {
  const { rfpText } = req.body
  if (!rfpText || typeof rfpText !== "string" || rfpText.trim().length < 50) {
    return res.status(400).json({ error: "RFP text is required (min 50 characters)" })
  }
  try {
    const result = await generateRFPChecklist(rfpText)
    res.json(result)
  } catch (error) {
    console.error("Checklist generation error:", error)
    res.status(500).json({ error: "Failed to generate checklist" })
  }
})

// POST /api/studio/checklist/check
router.post("/checklist/check", async (req, res) => {
  const { documentContent, checklistItems } = req.body
  if (!documentContent || !checklistItems || !Array.isArray(checklistItems)) {
    return res.status(400).json({ error: "documentContent and checklistItems are required" })
  }
  try {
    const result = await checkRFPCompliance(documentContent, checklistItems)
    res.json(result)
  } catch (error) {
    console.error("Compliance check error:", error)
    res.status(500).json({ error: "Failed to check compliance" })
  }
})

// ─── Document CRUD ───

// GET /api/studio/documents
router.get("/documents", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const { mode, search, sourceType } = req.query as Record<string, string>
    const conditions = [
      or(
        eq(studioDocuments.userId, userId),
        sql`${studioDocuments.sharedWith}::jsonb @> ${JSON.stringify([{ userId }])}::jsonb`
      ),
    ]
    if (mode) conditions.push(eq(studioDocuments.mode, mode as "draft" | "final" | "template" | "archived"))
    if (sourceType) conditions.push(eq(studioDocuments.sourceType, sourceType as "briefing" | "manual" | "review" | "ai-generated"))
    if (search) conditions.push(ilike(studioDocuments.title, `%${search}%`))

    // Exclude archived by default
    if (!mode) conditions.push(sql`${studioDocuments.mode} != 'archived'`)

    const rows = await db.select().from(studioDocuments)
      .where(and(...conditions))
      .orderBy(desc(studioDocuments.updatedAt))
      .limit(50)
    res.json(rows)
  } catch (error) {
    console.error("List documents error:", error)
    res.status(500).json({ error: "Failed to list documents" })
  }
})

// GET /api/studio/documents/:id
router.get("/documents/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const rows = await db.select().from(studioDocuments).where(eq(studioDocuments.id, req.params.id)).limit(1)
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" })

    const doc = rows[0]!
    // Check access
    const isOwner = doc.userId === userId
    const isShared = (doc.sharedWith as Array<{ userId: string }>).some((s) => s.userId === userId)
    if (!isOwner && !isShared) return res.status(403).json({ error: "Access denied" })

    res.json(doc)
  } catch (error) {
    console.error("Get document error:", error)
    res.status(500).json({ error: "Failed to get document" })
  }
})

// POST /api/studio/documents
router.post("/documents", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const { title, content, formatSettings, sourceType, tags, metadata } = req.body
    const rows = await db.insert(studioDocuments).values({
      title: title || "Untitled",
      content: content || "",
      formatSettings: formatSettings || {},
      sourceType: sourceType || "manual",
      tags: tags || [],
      metadata: metadata || {},
      userId,
    }).returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Create document error:", error)
    res.status(500).json({ error: "Failed to create document" })
  }
})

// PATCH /api/studio/documents/:id
router.patch("/documents/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    // Check ownership or edit permission
    const existing = await db.select().from(studioDocuments).where(eq(studioDocuments.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Document not found" })
    const doc = existing[0]!
    const isOwner = doc.userId === userId
    const hasEdit = (doc.sharedWith as Array<{ userId: string; permission: string }>).some((s) => s.userId === userId && s.permission === "edit")
    if (!isOwner && !hasEdit) return res.status(403).json({ error: "Access denied" })

    const { title, content, formatSettings, mode, tags, sharedWith, exportHistory, metadata } = req.body
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (formatSettings !== undefined) updates.formatSettings = formatSettings
    if (mode !== undefined) updates.mode = mode
    if (tags !== undefined) updates.tags = tags
    if (sharedWith !== undefined) updates.sharedWith = sharedWith
    if (exportHistory !== undefined) updates.exportHistory = exportHistory
    if (metadata !== undefined) updates.metadata = metadata

    // Increment version if content changed
    if (content !== undefined && content !== doc.content) {
      updates.version = doc.version + 1

      // Create version snapshot
      await db.insert(studioDocumentVersions).values({
        documentId: doc.id,
        version: doc.version,
        title: doc.title,
        content: doc.content,
        formatSettings: doc.formatSettings,
        createdBy: userId,
      })
    }

    const rows = await db.update(studioDocuments)
      .set(updates)
      .where(eq(studioDocuments.id, req.params.id))
      .returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Update document error:", error)
    res.status(500).json({ error: "Failed to update document" })
  }
})

// DELETE /api/studio/documents/:id (soft delete — set mode to archived)
router.delete("/documents/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const existing = await db.select().from(studioDocuments).where(eq(studioDocuments.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Document not found" })
    if (existing[0]!.userId !== userId) return res.status(403).json({ error: "Only the owner can delete" })

    await db.update(studioDocuments)
      .set({ mode: "archived", updatedAt: new Date() })
      .where(eq(studioDocuments.id, req.params.id))
    res.json({ success: true })
  } catch (error) {
    console.error("Delete document error:", error)
    res.status(500).json({ error: "Failed to delete document" })
  }
})

// ─── Document Versions ───

// GET /api/studio/documents/:id/versions
router.get("/documents/:id/versions", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  try {
    const rows = await db.select().from(studioDocumentVersions)
      .where(eq(studioDocumentVersions.documentId, req.params.id))
      .orderBy(desc(studioDocumentVersions.version))
      .limit(50)
    res.json(rows)
  } catch (error) {
    console.error("List versions error:", error)
    res.status(500).json({ error: "Failed to list versions" })
  }
})

// ─── Document Sharing ───

// PATCH /api/studio/documents/:id/share
router.patch("/documents/:id/share", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const existing = await db.select().from(studioDocuments).where(eq(studioDocuments.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Document not found" })
    if (existing[0]!.userId !== userId) return res.status(403).json({ error: "Only the owner can share" })

    const { sharedWith } = req.body
    const rows = await db.update(studioDocuments)
      .set({ sharedWith: sharedWith || [], updatedAt: new Date() })
      .where(eq(studioDocuments.id, req.params.id))
      .returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Share document error:", error)
    res.status(500).json({ error: "Failed to update sharing" })
  }
})

// ─── Template CRUD ───

// GET /api/studio/templates
router.get("/templates", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)

  try {
    const { category } = req.query as Record<string, string>
    const conditions = [
      or(
        eq(studioTemplates.isSystem, true),
        userId ? eq(studioTemplates.userId, userId) : undefined
      ),
    ].filter(Boolean)
    if (category) conditions.push(eq(studioTemplates.category, category as "proposal" | "case-study" | "report" | "presentation" | "custom"))

    const rows = await db.select().from(studioTemplates)
      .where(and(...conditions))
      .orderBy(desc(studioTemplates.updatedAt))
    res.json(rows)
  } catch (error) {
    console.error("List templates error:", error)
    res.status(500).json({ error: "Failed to list templates" })
  }
})

// POST /api/studio/templates
router.post("/templates", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)

  try {
    const { name, description, content, formatSettings, category } = req.body
    if (!name || !content) return res.status(400).json({ error: "Name and content are required" })

    const rows = await db.insert(studioTemplates).values({
      name,
      description: description || null,
      content,
      formatSettings: formatSettings || {},
      category: category || "custom",
      userId,
    }).returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Create template error:", error)
    res.status(500).json({ error: "Failed to create template" })
  }
})

// DELETE /api/studio/templates/:id
router.delete("/templates/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)

  try {
    const existing = await db.select().from(studioTemplates).where(eq(studioTemplates.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Template not found" })
    if (existing[0]!.isSystem) return res.status(403).json({ error: "Cannot delete system templates" })
    if (existing[0]!.userId !== userId) return res.status(403).json({ error: "Access denied" })

    await db.delete(studioTemplates).where(eq(studioTemplates.id, req.params.id))
    res.json({ success: true })
  } catch (error) {
    console.error("Delete template error:", error)
    res.status(500).json({ error: "Failed to delete template" })
  }
})

// ─── Asset Bucket ───

// GET /api/studio/assets
router.get("/assets", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const { type, search } = req.query as Record<string, string>
    const conditions = [eq(studioAssets.userId, userId)]
    if (type) conditions.push(eq(studioAssets.type, type as "image" | "svg" | "chart-snapshot" | "document-snippet" | "logo" | "icon"))
    if (search) conditions.push(ilike(studioAssets.name, `%${search}%`))

    const rows = await db.select().from(studioAssets)
      .where(and(...conditions))
      .orderBy(desc(studioAssets.createdAt))
      .limit(100)
    res.json(rows)
  } catch (error) {
    console.error("List assets error:", error)
    res.status(500).json({ error: "Failed to list assets" })
  }
})

// GET /api/studio/assets/:id
router.get("/assets/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  try {
    const rows = await db.select().from(studioAssets).where(eq(studioAssets.id, req.params.id)).limit(1)
    if (rows.length === 0) return res.status(404).json({ error: "Asset not found" })
    res.json(rows[0])
  } catch (error) {
    console.error("Get asset error:", error)
    res.status(500).json({ error: "Failed to get asset" })
  }
})

// POST /api/studio/assets
router.post("/assets", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const { name, type, data, thumbnail, mimeType, fileSize, tags, metadata } = req.body
    if (!name || !type || !data) return res.status(400).json({ error: "Name, type, and data are required" })

    const rows = await db.insert(studioAssets).values({
      userId,
      name,
      type,
      data,
      thumbnail: thumbnail || null,
      mimeType: mimeType || null,
      fileSize: fileSize || null,
      tags: tags || [],
      metadata: metadata || {},
    }).returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Create asset error:", error)
    res.status(500).json({ error: "Failed to create asset" })
  }
})

// PATCH /api/studio/assets/:id
router.patch("/assets/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const existing = await db.select().from(studioAssets).where(eq(studioAssets.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Asset not found" })
    if (existing[0]!.userId !== userId) return res.status(403).json({ error: "Access denied" })

    const { name, tags, metadata } = req.body
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name
    if (tags !== undefined) updates.tags = tags
    if (metadata !== undefined) updates.metadata = metadata

    const rows = await db.update(studioAssets)
      .set(updates)
      .where(eq(studioAssets.id, req.params.id))
      .returning()
    res.json(rows[0])
  } catch (error) {
    console.error("Update asset error:", error)
    res.status(500).json({ error: "Failed to update asset" })
  }
})

// DELETE /api/studio/assets/:id
router.delete("/assets/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database unavailable" })
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })

  try {
    const existing = await db.select().from(studioAssets).where(eq(studioAssets.id, req.params.id)).limit(1)
    if (existing.length === 0) return res.status(404).json({ error: "Asset not found" })
    if (existing[0]!.userId !== userId) return res.status(403).json({ error: "Access denied" })

    await db.delete(studioAssets).where(eq(studioAssets.id, req.params.id))
    res.json({ success: true })
  } catch (error) {
    console.error("Delete asset error:", error)
    res.status(500).json({ error: "Failed to delete asset" })
  }
})

export default router
