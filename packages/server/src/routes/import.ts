import { Router } from "express"
import { requireWriteAccess } from "../middleware/auth.js"
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
router.post("/preview", requireWriteAccess, upload.single("file"), async (req, res) => {
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
router.post("/execute", requireWriteAccess, upload.single("file"), async (req, res) => {
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

// Security: Validate file path is within the project directory and is an Excel file
function validateFilePath(filePath: string): string | null {
  const resolvedPath = path.resolve(filePath)
  const projectRoot = path.resolve(process.cwd())

  if (!resolvedPath.startsWith(projectRoot)) {
    return null // Path traversal attempt
  }

  const ext = path.extname(resolvedPath).toLowerCase()
  if (ext !== ".xlsx" && ext !== ".xls") {
    return null // Not an Excel file
  }

  return resolvedPath
}

/**
 * POST /api/import/preview-sample
 * Preview import using the sample file path (for development/testing)
 */
router.post("/preview-sample", requireWriteAccess, async (req, res) => {
  try {
    const { filePath } = req.body

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required" })
    }

    const safePath = validateFilePath(filePath)
    if (!safePath) {
      return res.status(400).json({ error: "Invalid file path" })
    }

    const preview = await previewImport(safePath)

    res.json({
      ...preview,
      filename: path.basename(safePath),
    })
  } catch (error) {
    console.error("Error previewing sample import:", error)
    res.status(400).json({ error: "Failed to preview import" })
  }
})

/**
 * POST /api/import/execute-sample
 * Execute import using the sample file path (for development/testing)
 */
router.post("/execute-sample", requireWriteAccess, async (req, res) => {
  try {
    const { filePath } = req.body

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required" })
    }

    const safePath = validateFilePath(filePath)
    if (!safePath) {
      return res.status(400).json({ error: "Invalid file path" })
    }

    const result = await executeImport(safePath)

    res.json({
      ...result,
      filename: path.basename(safePath),
    })
  } catch (error) {
    console.error("Error executing sample import:", error)
    res.status(500).json({ error: "Failed to execute import" })
  }
})

export default router
