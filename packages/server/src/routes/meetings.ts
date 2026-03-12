/**
 * Meeting Intake Routes
 *
 * Endpoints for uploading audio recordings, transcripts, and processing
 * them into structured meeting notes via AI.
 */

import { Router, type Request, type Response } from "express"
import multer from "multer"
import crypto from "crypto"
import { db, supabaseAdmin } from "../db/index.js"
import { clientDocuments } from "../db/schema.js"
import { eq, desc, and, sql } from "drizzle-orm"
import { processMeetingIntake, diarizeTranscript } from "../services/meetingAIService.js"
import { requireWriteAccess } from "../middleware/auth.js"
import mammoth from "mammoth"

// Text extraction for uploaded transcript files
async function extractTranscriptText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) {
      const result = await mammoth.extractRawText({ buffer })
      return result.value.slice(0, 50000)
    }
    if (mimeType.startsWith("text/")) {
      return buffer.toString("utf-8").slice(0, 50000)
    }
    return null
  } catch (err) {
    console.error("Transcript text extraction failed:", err)
    return null
  }
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — Whisper API limit
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/webm", "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave",
      "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg",
      "video/webm", // MediaRecorder sometimes produces video/webm with audio-only
    ]
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|mp3|wav|m4a|ogg|mp4)$/i)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`))
    }
  },
})

const transcriptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for text files
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith("text/") ||
      file.mimetype.includes("wordprocessingml") ||
      file.mimetype.includes("msword") ||
      file.originalname.match(/\.(txt|docx|doc)$/i)
    ) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported transcript format: ${file.mimetype}`))
    }
  },
})

const router = Router()

// ─── Upload audio and process ────────────────────────────────────────────────
router.post("/process-audio", audioUpload.single("audio"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    if (!supabaseAdmin) return res.status(503).json({ error: "Storage unavailable" })

    const file = req.file
    if (!file) return res.status(400).json({ error: "No audio file provided" })

    const { clientName, title, meetingDate } = req.body
    if (!clientName?.trim()) return res.status(400).json({ error: "Client name is required" })

    const normalizedClient = clientName.trim().toLowerCase()
    const ext = file.originalname.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "webm"
    const audioStorageKey = `meeting-audio/${normalizedClient}/${crypto.randomBytes(16).toString("hex")}.${ext}`

    // Upload audio to Supabase
    const { error: uploadError } = await supabaseAdmin.storage
      .from("client-documents")
      .upload(audioStorageKey, file.buffer, { contentType: file.mimetype, upsert: true })

    if (uploadError) {
      console.error("Audio upload error:", uploadError)
      return res.status(500).json({ error: "Failed to upload audio to storage" })
    }

    const uploadedBy = (req.session as any)?.userName || "unknown"

    // Create the document record
    const [row] = await db.insert(clientDocuments).values({
      clientName: normalizedClient,
      title: title?.trim() || `Meeting Recording ${new Date().toLocaleDateString()}`,
      docType: "meeting-notes",
      storageKey: audioStorageKey,
      originalFilename: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      audioStorageKey,
      audioDurationSecs: req.body.durationSecs ? parseInt(req.body.durationSecs, 10) : null,
      transcriptSource: "whisper",
      processingStatus: "uploading",
      meetingDate: meetingDate ? new Date(meetingDate) : new Date(),
      uploadedBy,
      published: false,
    }).returning()

    if (!row) return res.status(500).json({ error: "Failed to create document record" })

    // Fire-and-forget processing
    processMeetingIntake(row.id, { audioStorageKey }).catch(err => {
      console.error("Background meeting processing error:", err)
    })

    res.json({ id: row.id, processingStatus: "uploading" })
  } catch (error) {
    console.error("Process audio failed:", error)
    res.status(500).json({ error: "Failed to process audio" })
  }
})

// ─── Analyze text transcript ─────────────────────────────────────────────────
router.post("/analyze-text", transcriptUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const { clientName, title, meetingDate } = req.body
    if (!clientName?.trim()) return res.status(400).json({ error: "Client name is required" })

    let transcriptText = req.body.text?.trim() || ""

    // If a file was uploaded, extract text from it
    if (req.file && !transcriptText) {
      transcriptText = (await extractTranscriptText(req.file.buffer, req.file.mimetype)) || ""
    }

    if (!transcriptText) {
      return res.status(400).json({ error: "No transcript text provided" })
    }

    const normalizedClient = clientName.trim().toLowerCase()
    const uploadedBy = (req.session as any)?.userName || "unknown"

    const [row] = await db.insert(clientDocuments).values({
      clientName: normalizedClient,
      title: title?.trim() || `Meeting Notes ${new Date().toLocaleDateString()}`,
      docType: "meeting-notes",
      storageKey: `meeting-text/${normalizedClient}/${crypto.randomBytes(16).toString("hex")}.txt`,
      originalFilename: req.file?.originalname || "pasted-transcript.txt",
      fileSize: Buffer.byteLength(transcriptText, "utf-8"),
      mimeType: "text/plain",
      extractedText: transcriptText,
      transcriptSource: req.file ? "uploaded" : "manual",
      processingStatus: "analyzing",
      meetingDate: meetingDate ? new Date(meetingDate) : new Date(),
      uploadedBy,
      published: false,
    }).returning()

    if (!row) return res.status(500).json({ error: "Failed to create document record" })

    // Fire-and-forget processing
    processMeetingIntake(row.id, { transcriptText }).catch(err => {
      console.error("Background meeting text processing error:", err)
    })

    res.json({ id: row.id, processingStatus: "analyzing" })
  } catch (error) {
    console.error("Analyze text failed:", error)
    res.status(500).json({ error: "Failed to analyze transcript" })
  }
})

// ─── Get processing status ───────────────────────────────────────────────────
router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db
      .select({
        id: clientDocuments.id,
        processingStatus: clientDocuments.processingStatus,
        processingError: clientDocuments.processingError,
      })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))

    if (!row) return res.status(404).json({ error: "Meeting not found" })
    res.json(row)
  } catch (error) {
    console.error("Status check failed:", error)
    res.status(500).json({ error: "Failed to check status" })
  }
})

// ─── Publish meeting to client portfolio (admin only) ────────────────────────
router.patch("/:id/publish", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db.update(clientDocuments)
      .set({ published: true, updatedAt: new Date() })
      .where(eq(clientDocuments.id, req.params.id!))
      .returning({ id: clientDocuments.id, published: clientDocuments.published })

    if (!row) return res.status(404).json({ error: "Meeting not found" })
    res.json(row)
  } catch (error) {
    console.error("Publish meeting failed:", error)
    res.status(500).json({ error: "Failed to publish meeting" })
  }
})

// ─── Re-analyze a meeting ────────────────────────────────────────────────────
router.post("/:id/reanalyze", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db
      .select({ id: clientDocuments.id, extractedText: clientDocuments.extractedText, audioStorageKey: clientDocuments.audioStorageKey })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))

    if (!row) return res.status(404).json({ error: "Meeting not found" })
    if (!row.extractedText && !row.audioStorageKey) {
      return res.status(400).json({ error: "No transcript or audio to re-analyze" })
    }

    await db.update(clientDocuments)
      .set({ processingStatus: row.extractedText ? "analyzing" : "transcribing", processingError: null, updatedAt: new Date() })
      .where(eq(clientDocuments.id, req.params.id!))

    processMeetingIntake(row.id, {
      transcriptText: row.extractedText || undefined,
      audioStorageKey: !row.extractedText ? (row.audioStorageKey || undefined) : undefined,
    }).catch(err => console.error("Re-analyze meeting error:", err))

    res.json({ id: row.id, processingStatus: row.extractedText ? "analyzing" : "transcribing" })
  } catch (error) {
    console.error("Re-analyze meeting failed:", error)
    res.status(500).json({ error: "Failed to re-analyze meeting" })
  }
})

// ─── On-demand speaker diarization ──────────────────────────────────────────
router.post("/:id/diarize", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db
      .select({
        id: clientDocuments.id,
        extractedText: clientDocuments.extractedText,
        meetingAttendees: clientDocuments.meetingAttendees,
      })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))

    if (!row) return res.status(404).json({ error: "Meeting not found" })
    if (!row.extractedText) return res.status(400).json({ error: "No transcript to diarize" })

    const attendees = Array.isArray(row.meetingAttendees) ? row.meetingAttendees : []
    const diarized = await diarizeTranscript(row.extractedText, attendees)

    await db.update(clientDocuments)
      .set({ diarizedTranscript: diarized, updatedAt: new Date() })
      .where(eq(clientDocuments.id, req.params.id!))

    res.json({ id: row.id, diarizedTranscript: diarized })
  } catch (error) {
    console.error("Diarize meeting failed:", error)
    res.status(500).json({ error: "Failed to diarize transcript" })
  }
})

// ─── Delete a meeting ────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db
      .select({ id: clientDocuments.id, audioStorageKey: clientDocuments.audioStorageKey })
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))

    if (!row) return res.status(404).json({ error: "Meeting not found" })

    // Delete audio from storage if exists
    if (row.audioStorageKey && supabaseAdmin) {
      await supabaseAdmin.storage.from("client-documents").remove([row.audioStorageKey]).catch(() => {})
    }

    // Delete the database record
    await db.delete(clientDocuments).where(eq(clientDocuments.id, req.params.id!))

    res.json({ success: true })
  } catch (error) {
    console.error("Delete meeting failed:", error)
    res.status(500).json({ error: "Failed to delete meeting" })
  }
})

// ─── Get full meeting record ─────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const [row] = await db
      .select()
      .from(clientDocuments)
      .where(eq(clientDocuments.id, req.params.id!))

    if (!row) return res.status(404).json({ error: "Meeting not found" })
    res.json(row)
  } catch (error) {
    console.error("Get meeting failed:", error)
    res.status(500).json({ error: "Failed to get meeting" })
  }
})

// ─── List meetings ───────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })

    const { clientName } = req.query
    const conditions = [
      sql`${clientDocuments.docType} = 'meeting-notes'`,
    ]
    if (clientName && typeof clientName === "string") {
      conditions.push(sql`${clientDocuments.clientName} = ${clientName.toLowerCase()}`)
    }

    const rows = await db
      .select({
        id: clientDocuments.id,
        clientName: clientDocuments.clientName,
        title: clientDocuments.title,
        summary: clientDocuments.summary,
        meetingDate: clientDocuments.meetingDate,
        meetingAttendees: clientDocuments.meetingAttendees,
        processingStatus: clientDocuments.processingStatus,
        transcriptSource: clientDocuments.transcriptSource,
        audioDurationSecs: clientDocuments.audioDurationSecs,
        meetingActionItems: clientDocuments.meetingActionItems,
        uploadedBy: clientDocuments.uploadedBy,
        createdAt: clientDocuments.createdAt,
      })
      .from(clientDocuments)
      .where(and(...conditions))
      .orderBy(desc(clientDocuments.createdAt))
      .limit(100)

    res.json(rows)
  } catch (error) {
    console.error("List meetings failed:", error)
    res.status(500).json({ error: "Failed to list meetings" })
  }
})

export default router
