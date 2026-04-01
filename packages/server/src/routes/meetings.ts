/**
 * Meeting Intake Routes
 *
 * Endpoints for uploading audio recordings, transcripts, and processing
 * them into structured meeting notes via AI.
 */

import { Router, type Request, type Response } from "express"
import multer from "multer"
import crypto from "crypto"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { execFile } from "child_process"
import { promisify } from "util"
import { db, supabaseAdmin } from "../db/index.js"
import { clientDocuments } from "../db/schema.js"
import { eq, desc, and, sql } from "drizzle-orm"
import { processMeetingIntake, diarizeTranscript } from "../services/meetingAIService.js"
import { requireWriteAccess } from "../middleware/auth.js"
import mammoth from "mammoth"

const execFileAsync = promisify(execFile)

/**
 * Extract audio from a video file using ffmpeg.
 * Returns the path to a compressed MP3 file suitable for Whisper (< 25MB).
 */
async function extractAudioFromVideo(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^.]+$/, ".mp3")
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-vn",              // no video
    "-ac", "1",         // mono
    "-ar", "16000",     // 16kHz sample rate (Whisper optimal)
    "-b:a", "64k",      // 64kbps bitrate — keeps file small
    "-y",               // overwrite
    outputPath,
  ], { timeout: 300000 }) // 5 min timeout for long videos
  return outputPath
}

/**
 * Check if a mime type or extension is a video format.
 */
function isVideoFile(mimeType: string, filename: string): boolean {
  return mimeType.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/i.test(filename)
}

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
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".tmp"
      cb(null, `meeting-${crypto.randomBytes(16).toString("hex")}${ext}`)
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB — large video files, audio extracted server-side
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/webm", "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave",
      "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg",
      "video/webm", "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska",
    ]
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|mp3|wav|m4a|ogg|mp4|mov|avi|mkv)$/i)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file format: ${file.mimetype}`))
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

// ─── Upload audio/video and process ─────────────────────────────────────────
router.post("/process-audio", audioUpload.single("audio"), async (req: Request, res: Response) => {
  const tempFiles: string[] = [] // track temp files for cleanup

  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    if (!supabaseAdmin) return res.status(503).json({ error: "Storage unavailable" })

    const file = req.file
    if (!file) return res.status(400).json({ error: "No audio file provided" })

    const { clientName, title, meetingDate } = req.body
    if (!clientName?.trim()) return res.status(400).json({ error: "Client name is required" })

    tempFiles.push(file.path) // multer disk file

    let uploadBuffer: Buffer
    let uploadMimeType: string
    let uploadExt: string

    // If it's a video file, extract audio with ffmpeg
    if (isVideoFile(file.mimetype, file.originalname)) {
      console.log(`[Meetings] Video detected (${(file.size / (1024 * 1024)).toFixed(1)}MB) — extracting audio with ffmpeg...`)
      try {
        const audioPath = await extractAudioFromVideo(file.path)
        tempFiles.push(audioPath)
        uploadBuffer = await fs.readFile(audioPath)
        uploadMimeType = "audio/mpeg"
        uploadExt = "mp3"
        console.log(`[Meetings] Audio extracted: ${(uploadBuffer.length / (1024 * 1024)).toFixed(1)}MB MP3`)
      } catch (ffmpegErr) {
        console.error("[Meetings] ffmpeg audio extraction failed:", ffmpegErr)
        return res.status(422).json({
          error: "Failed to extract audio from video. The file may be corrupted or in an unsupported codec.",
        })
      }
    } else {
      // Regular audio file — read from disk
      uploadBuffer = await fs.readFile(file.path)
      uploadMimeType = file.mimetype
      uploadExt = file.originalname.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "webm"
    }

    // Check extracted audio is within Whisper's 25MB limit
    if (uploadBuffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({
        error: `Audio is ${(uploadBuffer.length / (1024 * 1024)).toFixed(1)}MB which exceeds the 25MB transcription limit. Try a shorter recording.`,
      })
    }

    const normalizedClient = clientName.trim().toLowerCase()
    const audioStorageKey = `meeting-audio/${normalizedClient}/${crypto.randomBytes(16).toString("hex")}.${uploadExt}`

    // Upload audio to Supabase
    const { error: uploadError } = await supabaseAdmin.storage
      .from("client-documents")
      .upload(audioStorageKey, uploadBuffer, { contentType: uploadMimeType, upsert: true })

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
  } finally {
    // Clean up temp files
    for (const tmpFile of tempFiles) {
      fs.unlink(tmpFile).catch(() => {})
    }
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
