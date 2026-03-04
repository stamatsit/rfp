import { Router, type Request, type Response } from "express"
import multer from "multer"
import path from "path"
import { eq, asc, and } from "drizzle-orm"
import { streamHumanizerRewrite, type HumanizerOptions } from "../services/humanizerAIService.js"
import { extractDocumentText } from "../services/rfpService.js"
import { db } from "../db/index.js"
import { writingPersonaSamples } from "../db/schema.js"
import { getCurrentUserId } from "../middleware/getCurrentUser.js"

const router = Router()

// Configure multer for document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedExts = [".pdf", ".docx", ".doc", ".txt"]
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExts.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: PDF, DOCX, DOC, TXT`))
    }
  },
})

// POST /api/humanizer/stream — Humanize or scan text via SSE
router.post("/stream", async (req: Request, res: Response) => {
  const { text, tone, strength, twoPass, scanOnly, audience, voiceSample, conversationHistory } = req.body || {}

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" })
  }
  if (text.trim().length < 10) {
    return res.status(400).json({ error: "Text must be at least 10 characters" })
  }
  if (text.length > 15000) {
    return res.status(400).json({ error: "Text must be under 15,000 characters" })
  }

  // Fetch stored persona for this user
  let personaText: string | undefined
  const userId = getCurrentUserId(req)
  if (userId && db) {
    try {
      const samples = await db
        .select({ extractedText: writingPersonaSamples.extractedText })
        .from(writingPersonaSamples)
        .where(eq(writingPersonaSamples.userId, userId))
        .orderBy(asc(writingPersonaSamples.createdAt))

      if (samples.length > 0) {
        personaText = samples
          .map((s) => s.extractedText.trim())
          .join("\n\n---\n\n")
          .slice(0, 8000)
      }
    } catch (err) {
      console.error("Failed to fetch persona samples:", err)
    }
  }

  const options: HumanizerOptions = {
    tone: ["professional", "conversational", "academic", "thompson", "wallace"].includes(tone) ? tone : "professional",
    strength: ["light", "balanced", "heavy"].includes(strength) ? strength : "balanced",
    twoPass: twoPass === true,
    scanOnly: scanOnly === true,
    audience: ["general", "executive", "technical", "academic"].includes(audience) ? audience : "general",
    voiceSample: typeof voiceSample === "string" && voiceSample.trim() ? voiceSample.trim().slice(0, 500) : undefined,
    personaText,
  }

  try {
    await streamHumanizerRewrite(text.trim(), options, res, conversationHistory)
  } catch (error) {
    console.error("Humanizer stream error:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process text" })
    }
  }
})

// POST /api/humanizer/upload — Extract text from uploaded file
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }
    const result = await extractDocumentText(req.file.buffer, req.file.mimetype, req.file.originalname)
    const wordCount = result.text.split(/\s+/).filter(Boolean).length
    res.json({
      text: result.text,
      wordCount,
      filename: result.filename || req.file.originalname,
    })
  } catch (error) {
    console.error("Humanizer file extraction failed:", error)
    const message = error instanceof Error ? error.message : "Failed to extract document text"
    res.status(500).json({ error: message })
  }
})

// ─── Persona CRUD ────────────────────────────────────────────

const PERSONA_BUDGET = 8000
const PER_SAMPLE_CAP = 3000
const MIN_SAMPLE_LENGTH = 50

// GET /api/humanizer/persona — list samples (metadata only)
router.get("/persona", async (req: Request, res: Response) => {
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })
  if (!db) return res.status(500).json({ error: "Database unavailable" })

  try {
    const samples = await db
      .select({
        id: writingPersonaSamples.id,
        label: writingPersonaSamples.label,
        sourceType: writingPersonaSamples.sourceType,
        originalFilename: writingPersonaSamples.originalFilename,
        charCount: writingPersonaSamples.charCount,
        createdAt: writingPersonaSamples.createdAt,
      })
      .from(writingPersonaSamples)
      .where(eq(writingPersonaSamples.userId, userId))
      .orderBy(asc(writingPersonaSamples.createdAt))

    const totalChars = samples.reduce((sum, s) => sum + s.charCount, 0)
    return res.json({ samples, totalChars, budget: PERSONA_BUDGET })
  } catch (error) {
    console.error("Failed to fetch persona samples:", error)
    return res.status(500).json({ error: "Failed to fetch persona" })
  }
})

// POST /api/humanizer/persona — add pasted text sample
router.post("/persona", async (req: Request, res: Response) => {
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })
  if (!db) return res.status(500).json({ error: "Database unavailable" })

  const { text: rawText, label } = req.body || {}
  if (!rawText || typeof rawText !== "string" || rawText.trim().length < MIN_SAMPLE_LENGTH) {
    return res.status(400).json({ error: `Sample must be at least ${MIN_SAMPLE_LENGTH} characters` })
  }

  const trimmed = rawText.trim().slice(0, PER_SAMPLE_CAP)

  try {
    const existing = await db
      .select({ charCount: writingPersonaSamples.charCount })
      .from(writingPersonaSamples)
      .where(eq(writingPersonaSamples.userId, userId))
    const total = existing.reduce((s, r) => s + r.charCount, 0)

    if (total + trimmed.length > PERSONA_BUDGET) {
      return res.status(400).json({ error: `Persona budget exceeded (${PERSONA_BUDGET} chars total). Remove a sample first.` })
    }

    const [row] = await db.insert(writingPersonaSamples).values({
      userId,
      label: (typeof label === "string" && label.trim()) ? label.trim().slice(0, 80) : "Pasted sample",
      sourceType: "paste" as const,
      charCount: trimmed.length,
      extractedText: trimmed,
    }).returning()

    return res.status(201).json(row)
  } catch (error) {
    console.error("Failed to add persona sample:", error)
    return res.status(500).json({ error: "Failed to save sample" })
  }
})

// POST /api/humanizer/persona/upload — add uploaded document sample
router.post("/persona/upload", upload.single("file"), async (req: Request, res: Response) => {
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })
  if (!db) return res.status(500).json({ error: "Database unavailable" })
  if (!req.file) return res.status(400).json({ error: "No file uploaded" })

  try {
    const result = await extractDocumentText(req.file.buffer, req.file.mimetype, req.file.originalname)
    const trimmed = result.text.trim().slice(0, PER_SAMPLE_CAP)

    if (trimmed.length < MIN_SAMPLE_LENGTH) {
      return res.status(400).json({ error: `Extracted text is too short (${trimmed.length} chars). Need at least ${MIN_SAMPLE_LENGTH}.` })
    }

    const existing = await db
      .select({ charCount: writingPersonaSamples.charCount })
      .from(writingPersonaSamples)
      .where(eq(writingPersonaSamples.userId, userId))
    const total = existing.reduce((s, r) => s + r.charCount, 0)

    if (total + trimmed.length > PERSONA_BUDGET) {
      return res.status(400).json({ error: `Persona budget exceeded (${PERSONA_BUDGET} chars total). Remove a sample first.` })
    }

    const [row] = await db.insert(writingPersonaSamples).values({
      userId,
      label: req.file.originalname.replace(/\.[^.]+$/, "").slice(0, 80),
      sourceType: "upload" as const,
      originalFilename: req.file.originalname,
      charCount: trimmed.length,
      extractedText: trimmed,
    }).returning()

    return res.status(201).json(row)
  } catch (error) {
    console.error("Failed to upload persona sample:", error)
    const message = error instanceof Error ? error.message : "Failed to process file"
    return res.status(500).json({ error: message })
  }
})

// PATCH /api/humanizer/persona/:id — rename a sample
router.patch("/persona/:id", async (req: Request, res: Response) => {
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })
  if (!db) return res.status(500).json({ error: "Database unavailable" })

  const { label } = req.body || {}
  if (!label || typeof label !== "string" || !label.trim()) {
    return res.status(400).json({ error: "Label is required" })
  }

  try {
    const [row] = await db
      .update(writingPersonaSamples)
      .set({ label: label.trim().slice(0, 80) })
      .where(
        and(
          eq(writingPersonaSamples.id, req.params.id),
          eq(writingPersonaSamples.userId, userId)
        )
      )
      .returning()

    if (!row) return res.status(404).json({ error: "Sample not found" })
    return res.json(row)
  } catch (error) {
    console.error("Failed to rename persona sample:", error)
    return res.status(500).json({ error: "Failed to rename sample" })
  }
})

// DELETE /api/humanizer/persona/:id — delete a sample
router.delete("/persona/:id", async (req: Request, res: Response) => {
  const userId = getCurrentUserId(req)
  if (!userId) return res.status(401).json({ error: "Not authenticated" })
  if (!db) return res.status(500).json({ error: "Database unavailable" })

  try {
    const deleted = await db
      .delete(writingPersonaSamples)
      .where(
        and(
          eq(writingPersonaSamples.id, req.params.id),
          eq(writingPersonaSamples.userId, userId)
        )
      )
      .returning()

    if (!deleted.length) return res.status(404).json({ error: "Sample not found" })
    return res.status(204).end()
  } catch (error) {
    console.error("Failed to delete persona sample:", error)
    return res.status(500).json({ error: "Failed to delete sample" })
  }
})

export default router
