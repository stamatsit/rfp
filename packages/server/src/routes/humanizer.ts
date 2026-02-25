import { Router, type Request, type Response } from "express"
import multer from "multer"
import path from "path"
import { streamHumanizerRewrite, type HumanizerOptions } from "../services/humanizerAIService.js"
import { extractDocumentText } from "../services/rfpService.js"

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
  const { text, tone, strength, twoPass, scanOnly, conversationHistory } = req.body || {}

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" })
  }
  if (text.trim().length < 10) {
    return res.status(400).json({ error: "Text must be at least 10 characters" })
  }
  if (text.length > 15000) {
    return res.status(400).json({ error: "Text must be under 15,000 characters" })
  }

  const options: HumanizerOptions = {
    tone: ["professional", "conversational", "academic"].includes(tone) ? tone : "professional",
    strength: ["light", "balanced", "heavy"].includes(strength) ? strength : "balanced",
    twoPass: twoPass === true,
    scanOnly: scanOnly === true,
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

export default router
