import { Router } from "express"
import multer from "multer"
import path from "path"
import {
  previewImport,
  previewImportFromBuffer,
  executeImport,
  executeImportFromBuffer,
} from "../services/importService.js"

const router = Router()

// Configure multer for Excel file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    // Accept Excel files only
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "application/octet-stream", // Sometimes sent for xlsx
    ]
    const allowedExtensions = [".xlsx", ".xls"]
    const ext = path.extname(file.originalname).toLowerCase()

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"))
    }
  },
})

/**
 * POST /api/import/preview
 * Upload an Excel file and get a preview of what will be imported
 */
router.post("/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const preview = await previewImportFromBuffer(req.file.buffer)

    res.json({
      ...preview,
      filename: req.file.originalname,
    })
  } catch (error) {
    console.error("Error previewing import:", error)

    const message = error instanceof Error ? error.message : "Failed to preview import"
    res.status(400).json({ error: message })
  }
})

/**
 * POST /api/import/execute
 * Upload an Excel file and execute the import
 */
router.post("/execute", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const result = await executeImportFromBuffer(req.file.buffer, req.file.originalname)

    res.json({
      ...result,
      filename: req.file.originalname,
    })
  } catch (error) {
    console.error("Error executing import:", error)

    const message = error instanceof Error ? error.message : "Failed to execute import"
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/import/preview-sample
 * Preview import using the sample file path (for development/testing)
 */
router.post("/preview-sample", async (req, res) => {
  try {
    const { filePath } = req.body

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required" })
    }

    // Security: Only allow paths that look like legitimate Excel files
    if (!filePath.endsWith(".xlsx") && !filePath.endsWith(".xls")) {
      return res.status(400).json({ error: "Only Excel files are allowed" })
    }

    const preview = await previewImport(filePath)

    res.json({
      ...preview,
      filename: path.basename(filePath),
    })
  } catch (error) {
    console.error("Error previewing sample import:", error)

    const message = error instanceof Error ? error.message : "Failed to preview import"
    res.status(400).json({ error: message })
  }
})

/**
 * POST /api/import/execute-sample
 * Execute import using the sample file path (for development/testing)
 */
router.post("/execute-sample", async (req, res) => {
  try {
    const { filePath } = req.body

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required" })
    }

    // Security: Only allow paths that look like legitimate Excel files
    if (!filePath.endsWith(".xlsx") && !filePath.endsWith(".xls")) {
      return res.status(400).json({ error: "Only Excel files are allowed" })
    }

    const result = await executeImport(filePath)

    res.json({
      ...result,
      filename: path.basename(filePath),
    })
  } catch (error) {
    console.error("Error executing sample import:", error)

    const message = error instanceof Error ? error.message : "Failed to execute import"
    res.status(500).json({ error: message })
  }
})

export default router
