import { Router, type Request, type Response } from "express"
import multer from "multer"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath } from "url"
import {
  getPhotos,
  getPhotoById,
  getPhotoByStorageKey,
  createPhoto,
  updatePhoto,
  renamePhoto,
  deletePhoto,
  recordDownload,
  searchPhotos,
} from "../services/photoService.js"
import { getAllTopics, upsertTopic } from "../services/topicService.js"
import { logAudit } from "../services/auditService.js"
import { getCurrentUserName } from "../middleware/getCurrentUser.js"
import { requireWriteAccess } from "../middleware/auth.js"
import { supabaseAdmin } from "../db/index.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_DIR = path.resolve(__dirname, "../../../../storage/photos")

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR)
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true })
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureStorageDir()
    cb(null, STORAGE_DIR)
  },
  filename: (_req, file, cb) => {
    // Use a temporary name; we'll rename after creating the DB record
    const tempName = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const ext = path.extname(file.originalname)
    cb(null, `${tempName}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Invalid file type. Only PNG, JPEG, GIF, and WebP are allowed."))
    }
  },
})

const router = Router()

/**
 * GET /api/photos
 * List all photos with optional filters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { topicId, status, limit, offset } = req.query

    const photos = await getPhotos({
      topicId: topicId as string | undefined,
      status: status as "Approved" | "Draft" | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    })

    // Batch-generate signed URLs if Supabase is available
    if (supabaseAdmin && photos.length > 0) {
      const paths = photos.map(p => {
        const ext = p.originalFilename?.match(/\.([^.]+)$/)?.[1] || "png"
        return `${p.storageKey}.${ext}`
      })
      const { data } = await supabaseAdmin.storage
        .from("photo-assets")
        .createSignedUrls(paths, 3600) // 1 hour

      if (data) {
        const urlMap = new Map<string, string>()
        data.forEach((item, i) => {
          if (item.signedUrl) urlMap.set(photos[i]!.storageKey, item.signedUrl)
        })
        const photosWithUrls = photos.map(p => ({
          ...p,
          fileUrl: urlMap.get(p.storageKey) || null,
        }))
        return res.json(photosWithUrls)
      }
    }

    res.json(photos)
  } catch (error) {
    console.error("Failed to list photos:", error)
    res.status(500).json({ error: "Failed to list photos" })
  }
})

/**
 * GET /api/photos/file/:storageKey
 * Get photo file by storage key (for displaying in UI)
 * NOTE: This must come before /:id to avoid route conflict
 */
router.get("/file/:storageKey", async (req: Request, res: Response) => {
  try {
    const storageKey = req.params.storageKey
    if (!storageKey) {
      return res.status(400).json({ error: "Storage key is required" })
    }

    const photo = await getPhotoByStorageKey(storageKey)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Determine extension from original filename or mimetype
    const ext = photo.originalFilename?.match(/\.([^.]+)$/)?.[1] ||
                (photo.mimeType?.includes("png") ? "png" :
                 photo.mimeType?.includes("jpeg") || photo.mimeType?.includes("jpg") ? "jpg" : "png")

    // Try Supabase Storage first
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.storage
        .from("photo-assets")
        .download(`${storageKey}.${ext}`)

      if (data && !error) {
        const buffer = Buffer.from(await data.arrayBuffer())
        res.setHeader("Content-Type", photo.mimeType || "application/octet-stream")
        return res.send(buffer)
      }
    }

    // Fallback to local disk
    const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    let filePath: string | null = null

    for (const localExt of extensions) {
      const testPath = path.join(STORAGE_DIR, `${storageKey}${localExt}`)
      try {
        await fs.access(testPath)
        filePath = testPath
        break
      } catch {
        // Try next extension
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: "Photo file not found" })
    }

    res.sendFile(filePath)
  } catch (error) {
    console.error("Failed to get photo file:", error)
    res.status(500).json({ error: "Failed to get photo file" })
  }
})

/**
 * GET /api/photos/search
 * Search photos using full-text search
 * NOTE: This must come before /:id to avoid route conflict
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, topicId, status, limit } = req.query

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Search query (q) is required" })
    }

    const photos = await searchPhotos(q, {
      topicId: topicId as string | undefined,
      status: status as "Approved" | "Draft" | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    })

    res.json(photos)
  } catch (error) {
    console.error("Failed to search photos:", error)
    res.status(500).json({ error: "Failed to search photos" })
  }
})

/**
 * GET /api/photos/:id
 * Get a single photo by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const photo = await getPhotoById(id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    res.json(photo)
  } catch (error) {
    console.error("Failed to get photo:", error)
    res.status(500).json({ error: "Failed to get photo" })
  }
})

/**
 * POST /api/photos/upload
 * Upload one or more photos
 * Expects multipart/form-data with:
 * - files: array of image files
 * - metadata: JSON string with array of { title, topicId, status, tags, description }
 */
router.post(
  "/upload",
  requireWriteAccess,
  upload.array("files", 20),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[]

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" })
      }

      // Parse metadata
      let metadata: Array<{
        title?: string
        topicId: string
        status?: "Approved" | "Draft"
        tags?: string
        description?: string
      }> = []

      if (req.body.metadata) {
        try {
          metadata = JSON.parse(req.body.metadata)
        } catch {
          return res.status(400).json({ error: "Invalid metadata JSON" })
        }
      }

      // Validate that we have metadata for each file
      if (metadata.length !== files.length) {
        // Clean up uploaded files
        for (const file of files) {
          await fs.unlink(file.path).catch(() => {})
        }
        return res.status(400).json({
          error: `Metadata count (${metadata.length}) doesn't match file count (${files.length})`,
        })
      }

      // Validate all topicIds exist
      const topics = await getAllTopics()
      const topicIds = new Set(topics.map((t) => t.id))

      for (const meta of metadata) {
        if (!meta.topicId || !topicIds.has(meta.topicId)) {
          // Clean up uploaded files
          for (const file of files) {
            await fs.unlink(file.path).catch(() => {})
          }
          return res.status(400).json({ error: `Invalid topicId: ${meta.topicId}` })
        }
      }

      const results = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const meta = metadata[i]!

        // Create the photo record (generates storageKey)
        const photo = await createPhoto({
          originalFilename: file.originalname,
          topicId: meta.topicId,
          displayTitle: meta.title,
          status: meta.status,
          tags: meta.tags
            ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
          description: meta.description,
          fileSize: file.size,
          mimeType: file.mimetype,
          createdBy: getCurrentUserName(req),
        })

        // Rename the file to use the storage key
        const ext = path.extname(file.originalname)
        const newPath = path.join(STORAGE_DIR, `${photo.storageKey}${ext}`)
        await fs.rename(file.path, newPath)

        results.push(photo)
      }

      // Log the upload
      await logAudit({
        actionType: "IMPORT",
        entityType: "PHOTO",
        details: {
          filename: `${files.length} photo(s)`,
          totalRows: files.length,
          imported: results.length,
          updated: 0,
          skipped: 0,
        },
        actor: getCurrentUserName(req),
      })

      res.json({
        success: true,
        uploaded: results.length,
        photos: results,
      })
    } catch (error) {
      console.error("Failed to upload photos:", error)
      // Clean up any uploaded files on error
      const files = req.files as Express.Multer.File[] | undefined
      if (files) {
        for (const file of files) {
          await fs.unlink(file.path).catch(() => {})
        }
      }
      res.status(500).json({ error: "Failed to upload photos" })
    }
  }
)

/**
 * PUT /api/photos/:id
 * Update a photo's metadata
 */
router.put("/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const { displayTitle, topicId, status, tags, description } = req.body

    const photo = await updatePhoto(id, {
      displayTitle,
      topicId,
      status,
      tags,
      description,
      createdBy: getCurrentUserName(req),
    })

    res.json(photo)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message.includes("not found")) {
      return res.status(404).json({ error: message })
    }
    console.error("Failed to update photo:", error)
    res.status(500).json({ error: "Failed to update photo" })
  }
})

/**
 * PUT /api/photos/:id/rename
 * Rename a photo (convenience endpoint)
 */
router.put("/:id/rename", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const { title } = req.body

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Title is required" })
    }

    const photo = await renamePhoto(id, title)
    res.json(photo)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message.includes("not found")) {
      return res.status(404).json({ error: message })
    }
    console.error("Failed to rename photo:", error)
    res.status(500).json({ error: "Failed to rename photo" })
  }
})

/**
 * GET /api/photos/:id/download
 * Download a photo file (also logs the download)
 */
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const photo = await getPhotoById(id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Determine extension from original filename or mimetype
    const ext = photo.originalFilename?.match(/\.([^.]+)$/)?.[1] ||
                (photo.mimeType?.includes("png") ? "png" :
                 photo.mimeType?.includes("jpeg") || photo.mimeType?.includes("jpg") ? "jpg" : "png")

    // Log the download
    await recordDownload(photo.id)

    const downloadName = `${photo.displayTitle}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, "_")

    // Try Supabase Storage first
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.storage
        .from("photo-assets")
        .download(`${photo.storageKey}.${ext}`)

      if (data && !error) {
        const buffer = Buffer.from(await data.arrayBuffer())
        res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`)
        res.setHeader("Content-Type", photo.mimeType || "application/octet-stream")
        res.setHeader("Content-Length", buffer.length.toString())
        return res.send(buffer)
      }
    }

    // Fallback to local disk
    const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    let filePath: string | null = null

    for (const localExt of extensions) {
      const testPath = path.join(STORAGE_DIR, `${photo.storageKey}${localExt}`)
      try {
        await fs.access(testPath)
        filePath = testPath
        break
      } catch {
        // Try next extension
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: "Photo file not found" })
    }

    res.download(filePath, downloadName)
  } catch (error) {
    console.error("Failed to download photo:", error)
    res.status(500).json({ error: "Failed to download photo" })
  }
})

/**
 * DELETE /api/photos/:id
 * Delete a photo (record only, file remains)
 */
router.delete("/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(400).json({ error: "Photo ID is required" })
    }

    const photo = await getPhotoById(id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    await deletePhoto(id)

    res.json({ success: true, message: "Photo deleted" })
  } catch (error) {
    console.error("Failed to delete photo:", error)
    res.status(500).json({ error: "Failed to delete photo" })
  }
})

/**
 * POST /api/photos/import-folder
 * Bulk import photos from a local folder
 * Extracts topic from filename pattern: topic-name-description.png
 */
router.post("/import-folder", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const { folderPath, defaultTopicId } = req.body

    if (!folderPath) {
      return res.status(400).json({ error: "Folder path is required" })
    }

    // Security: Validate folder path is within project directory
    const resolvedFolder = path.resolve(String(folderPath))
    const projectRoot = path.resolve(process.cwd())
    if (!resolvedFolder.startsWith(projectRoot)) {
      return res.status(400).json({ error: "Invalid folder path" })
    }

    // Verify folder exists
    try {
      await fs.access(resolvedFolder)
    } catch {
      return res.status(400).json({ error: "Folder not found" })
    }

    // Read all image files from the folder
    const files = await fs.readdir(resolvedFolder)
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    const imageFiles = files.filter((f) =>
      imageExtensions.some((ext) => f.toLowerCase().endsWith(ext))
    )

    if (imageFiles.length === 0) {
      return res.status(400).json({ error: "No image files found in folder" })
    }

    await ensureStorageDir()

    // Get or create default topic
    let defaultTopic = null
    if (defaultTopicId) {
      const topics = await getAllTopics()
      defaultTopic = topics.find((t) => t.id === defaultTopicId)
    }
    if (!defaultTopic) {
      defaultTopic = await upsertTopic("General")
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const filename of imageFiles) {
      try {
        const sourcePath = path.join(folderPath, filename)
        const stats = await fs.stat(sourcePath)

        // Parse filename to extract display title
        const nameWithoutExt = path.basename(filename, path.extname(filename))

        // Use the full filename as the display title, cleaned up
        const displayTitle = nameWithoutExt
          .replace(/-/g, " ")
          .replace(/\s+/g, " ")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")

        // Create the photo record
        const photo = await createPhoto({
          originalFilename: filename,
          topicId: defaultTopic.id,
          displayTitle,
          status: "Approved",
          fileSize: stats.size,
          mimeType: `image/${path.extname(filename).slice(1).toLowerCase()}`,
          createdBy: getCurrentUserName(req),
        })

        // Copy the file to storage
        const ext = path.extname(filename)
        const destPath = path.join(STORAGE_DIR, `${photo.storageKey}${ext}`)
        await fs.copyFile(sourcePath, destPath)

        results.imported++
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        results.errors.push(`${filename}: ${message}`)
        results.skipped++
      }
    }

    // Log the import
    await logAudit({
      actionType: "IMPORT",
      entityType: "PHOTO",
      details: {
        folderPath,
        totalFiles: imageFiles.length,
        imported: results.imported,
        skipped: results.skipped,
      },
      actor: getCurrentUserName(req),
    })

    res.json({
      success: true,
      totalFiles: imageFiles.length,
      ...results,
    })
  } catch (error) {
    console.error("Failed to import photos from folder:", error)
    res.status(500).json({ error: "Failed to import photos from folder" })
  }
})

export default router
