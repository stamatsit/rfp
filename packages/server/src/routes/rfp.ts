/**
 * RFP Document Routes
 * Handles document upload, text extraction, and saved documents
 */

import { Router } from "express"
import multer from "multer"
import path from "path"
import { extractDocumentText } from "../services/rfpService.js"
import { requireWriteAccess } from "../middleware/auth.js"
import {
  saveDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  deleteDocument,
} from "../services/documentService.js"

const router = Router()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
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
router.post("/extract", requireWriteAccess, upload.single("file"), async (req, res) => {
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
router.post("/documents", requireWriteAccess, async (req, res) => {
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

export default router
