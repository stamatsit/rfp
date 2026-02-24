/**
 * RFP Document Routes
 * Handles document upload, text extraction, and saved documents
 */

import { Router } from "express"
import multer from "multer"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath } from "url"
import { eq, and } from "drizzle-orm"
import { extractDocumentText } from "../services/rfpService.js"
import { scanDocument, type ScanCriterion } from "../services/documentAIService.js"
import { createPhoto } from "../services/photoService.js"
import { getCurrentUserName } from "../middleware/getCurrentUser.js"
import { requireWriteAccess } from "../middleware/auth.js"
import { db, savedDocuments, scanCriteria, supabaseAdmin } from "../db/index.js"
import {
  saveDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  deleteDocument,
} from "../services/documentService.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PHOTO_STORAGE_DIR = path.resolve(__dirname, "../../../../storage/photos")

const router = Router()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/msword", // doc
      "text/plain",
      "application/octet-stream", // Sometimes used for binary files
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

/**
 * POST /api/rfp/extract
 * Upload a document and extract its text content
 */
router.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const result = await extractDocumentText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    )

    res.json(result)
  } catch (error) {
    console.error("RFP extraction failed:", error)
    const message = error instanceof Error ? error.message : "Failed to extract document text"
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/rfp/status
 * Check if RFP service is available
 */
router.get("/status", (_req, res) => {
  res.json({
    available: true,
    supportedFormats: ["pdf", "docx", "doc", "txt"],
    maxFileSize: "20MB",
  })
})

// ============================================
// Saved Documents Endpoints
// ============================================

/**
 * POST /api/rfp/documents
 * Save a document (after extraction)
 */
router.post("/documents", async (req, res) => {
  try {
    const { name, type, originalFilename, mimeType, fileSize, pageCount, extractedText, notes, tags } = req.body

    if (!name || !extractedText || !originalFilename) {
      return res.status(400).json({ error: "Missing required fields: name, extractedText, originalFilename" })
    }

    const doc = await saveDocument({
      name,
      type: type ?? "RFP",
      originalFilename,
      mimeType,
      fileSize,
      pageCount,
      extractedText,
      notes,
      tags,
      userId: req.session?.userId,
      uploaderName: req.session?.userName,
    })

    res.status(201).json(doc)
  } catch (error) {
    console.error("Failed to save document:", error)
    const message = error instanceof Error ? error.message : "Failed to save document"
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/rfp/documents
 * List saved documents with optional filtering
 */
router.get("/documents", async (req, res) => {
  try {
    const { type, search, limit, offset } = req.query

    const result = await listDocuments({
      type: type as "RFP" | "Proposal" | "Other" | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("Failed to list documents:", error)
    const message = error instanceof Error ? error.message : "Failed to list documents"
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/rfp/documents/:id
 * Get a specific document by ID
 */
router.get("/documents/:id", async (req, res) => {
  try {
    const doc = await getDocumentById(req.params.id)

    if (!doc) {
      return res.status(404).json({ error: "Document not found" })
    }

    res.json(doc)
  } catch (error) {
    console.error("Failed to get document:", error)
    const message = error instanceof Error ? error.message : "Failed to get document"
    res.status(500).json({ error: message })
  }
})

/**
 * PATCH /api/rfp/documents/:id
 * Update a document's metadata
 */
router.patch("/documents/:id", requireWriteAccess, async (req, res) => {
  try {
    const { name, type, notes, tags } = req.body

    const doc = await updateDocument(req.params.id, { name, type, notes, tags })

    if (!doc) {
      return res.status(404).json({ error: "Document not found" })
    }

    res.json(doc)
  } catch (error) {
    console.error("Failed to update document:", error)
    const message = error instanceof Error ? error.message : "Failed to update document"
    res.status(500).json({ error: message })
  }
})

/**
 * DELETE /api/rfp/documents/:id
 * Delete a saved document
 */
router.delete("/documents/:id", requireWriteAccess, async (req, res) => {
  try {
    const deleted = await deleteDocument(req.params.id)

    if (!deleted) {
      return res.status(404).json({ error: "Document not found" })
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete document:", error)
    const message = error instanceof Error ? error.message : "Failed to delete document"
    res.status(500).json({ error: message })
  }
})

// ============================================
// AI Scan Endpoints
// ============================================

/**
 * POST /api/rfp/scan
 * AI-scan a document for flags based on criteria
 */
router.post("/scan", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" })

    const { documentId, documentText, documentType, criteria, originalFilename, mimeType, fileSize, pageCount, name } = req.body

    if (!documentText || !criteria || !Array.isArray(criteria)) {
      return res.status(400).json({ error: "Missing required fields: documentText, criteria" })
    }

    // Run AI scan
    const result = await scanDocument(documentText, documentType || "RFP", criteria)

    // Save or update document in DB
    const userId = req.session?.userId || "unknown"
    const uploaderName = req.session?.userName || "Unknown"

    let docId = documentId
    if (docId) {
      // Update existing document with scan results
      await db.update(savedDocuments).set({
        scanResults: result.flags,
        scanCriteria: criteria,
        scanSummary: result.summary,
        scannedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(savedDocuments.id, docId))
    } else {
      // Create new document with scan results
      const [newDoc] = await db.insert(savedDocuments).values({
        name: name || originalFilename || "Untitled",
        type: documentType || "RFP",
        originalFilename: originalFilename || "upload",
        mimeType,
        fileSize,
        pageCount,
        extractedText: documentText,
        userId,
        uploaderName,
        scanResults: result.flags,
        scanCriteria: criteria,
        scanSummary: result.summary,
        scannedAt: new Date(),
      }).returning()
      docId = newDoc?.id
    }

    res.json({
      documentId: docId,
      flags: result.flags,
      summary: result.summary,
      scannedAt: result.scannedAt,
    })
  } catch (error) {
    console.error("Scan failed:", error)
    const message = error instanceof Error ? error.message : "Scan failed"
    res.status(500).json({ error: message })
  }
})

// ============================================
// Scan Criteria Endpoints
// ============================================

const DEFAULT_CRITERIA = [
  { label: "Budget over $500K", description: "Flag any dollar amounts above $500,000" },
  { label: "Insurance & liability", description: "Flag insurance requirements, liability clauses, indemnification" },
  { label: "Deadlines & timelines", description: "Flag submission deadlines, project timelines, milestones" },
]

/**
 * GET /api/rfp/scan-criteria
 * List user's custom criteria + system defaults
 */
router.get("/scan-criteria", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" })

    const userId = req.session?.userId || "unknown"

    // Seed system defaults if needed (idempotent)
    const existing = await db.select().from(scanCriteria).where(eq(scanCriteria.userId, "system"))
    if (existing.length === 0) {
      for (const c of DEFAULT_CRITERIA) {
        await db.insert(scanCriteria).values({
          userId: "system",
          label: c.label,
          description: c.description,
          isDefault: true,
          isActive: true,
        })
      }
    }

    // Fetch system + user criteria
    const rows = await db.select().from(scanCriteria).where(
      eq(scanCriteria.userId, "system")
    )
    const userRows = await db.select().from(scanCriteria).where(
      eq(scanCriteria.userId, userId)
    )

    res.json({ defaults: rows, criteria: userRows })
  } catch (error) {
    console.error("Failed to load criteria:", error)
    const message = error instanceof Error ? error.message : "Failed to load criteria"
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/rfp/scan-criteria
 * Add a custom criterion
 */
router.post("/scan-criteria", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" })

    const userId = req.session?.userId || "unknown"
    const { label, description } = req.body

    if (!label) return res.status(400).json({ error: "label is required" })

    const [row] = await db.insert(scanCriteria).values({
      userId,
      label,
      description: description || null,
      isDefault: false,
      isActive: true,
    }).returning()

    res.status(201).json(row)
  } catch (error) {
    console.error("Failed to add criterion:", error)
    const message = error instanceof Error ? error.message : "Failed to add criterion"
    res.status(500).json({ error: message })
  }
})

/**
 * DELETE /api/rfp/scan-criteria/:id
 * Delete a user's custom criterion
 */
router.delete("/scan-criteria/:id", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" })

    const userId = req.session?.userId || "unknown"
    const { id } = req.params

    // Only allow deleting own criteria (not system defaults)
    const result = await db.delete(scanCriteria).where(
      and(eq(scanCriteria.id, id), eq(scanCriteria.userId, userId))
    ).returning()

    if (result.length === 0) {
      return res.status(404).json({ error: "Criterion not found or cannot be deleted" })
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Failed to delete criterion:", error)
    const message = error instanceof Error ? error.message : "Failed to delete criterion"
    res.status(500).json({ error: message })
  }
})

/**
 * PATCH /api/rfp/documents/:id/flags
 * Update flags array (dismiss, notes, etc.)
 */
router.patch("/documents/:id/flags", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Database not connected" })

    const { flags } = req.body
    if (!Array.isArray(flags)) return res.status(400).json({ error: "flags must be an array" })

    const [doc] = await db.update(savedDocuments).set({
      scanResults: flags,
      updatedAt: new Date(),
    }).where(eq(savedDocuments.id, req.params.id)).returning()

    if (!doc) return res.status(404).json({ error: "Document not found" })
    res.json({ success: true })
  } catch (error) {
    console.error("Failed to update flags:", error)
    const message = error instanceof Error ? error.message : "Failed to update flags"
    res.status(500).json({ error: message })
  }
})

// ============================================
// Image Extraction → Photo Library
// ============================================

/**
 * POST /api/rfp/save-images
 * Save extracted document images to the photo library
 */
router.post("/save-images", async (req, res) => {
  try {
    const { images, topicId, documentName } = req.body

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "images array is required" })
    }
    if (!topicId) {
      return res.status(400).json({ error: "topicId is required" })
    }

    // Ensure storage dir exists
    await fs.mkdir(PHOTO_STORAGE_DIR, { recursive: true })

    const results = []
    const createdBy = getCurrentUserName(req)
    const baseName = (documentName || "document").replace(/\.[^.]+$/, "")

    for (const img of images) {
      try {
        // Parse data URL → Buffer
        const match = img.dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
        if (!match) continue

        const mimeType = match[1]!
        const ext = `.${match[2]!}`
        const buffer = Buffer.from(match[3]!, "base64")
        const originalFilename = `${baseName}-${img.name}${ext}`

        // Create photo record in DB
        const photo = await createPhoto({
          originalFilename,
          topicId,
          displayTitle: `${baseName} - ${img.name}`,
          status: "Draft",
          mimeType,
          fileSize: buffer.length,
          createdBy,
        })

        // Write to local storage
        const filePath = path.join(PHOTO_STORAGE_DIR, `${photo.storageKey}${ext}`)
        await fs.writeFile(filePath, buffer)

        // Upload to Supabase if available
        if (supabaseAdmin) {
          const { error: uploadError } = await supabaseAdmin.storage
            .from("photo-assets")
            .upload(`${photo.storageKey}${ext}`, buffer, {
              contentType: mimeType,
              upsert: true,
            })
          if (uploadError) {
            console.warn(`Supabase upload failed for ${photo.storageKey}: ${uploadError.message}`)
          }
        }

        results.push(photo)
      } catch (err) {
        console.warn(`Failed to save image ${img.name}:`, err)
      }
    }

    res.json({ success: true, saved: results.length, photos: results })
  } catch (error) {
    console.error("Failed to save images:", error)
    const message = error instanceof Error ? error.message : "Failed to save images"
    res.status(500).json({ error: message })
  }
})

export default router
