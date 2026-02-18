import "dotenv/config"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import session from "express-session"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import path from "path"
import { fileURLToPath } from "url"
import routes from "./routes/index.js"
import authRoutes from "./routes/auth.js"
import { getPhotoByStorageKey } from "./services/photoService.js"
import { getUserById } from "./services/userService.js"
import fs from "fs/promises"
import { requireAuth } from "./middleware/auth.js"
import { generateCsrfToken, validateCsrfToken, getCsrfToken } from "./middleware/csrf.js"
import { initializeDatabase } from "./db/index.js"
import { startSyncPolling } from "./services/proposalSyncService.js"
import { startPipelineSyncPolling } from "./services/pipelineSyncService.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT ?? 3001

// Require SESSION_SECRET in production, fallback only for local dev
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.error("FATAL: SESSION_SECRET must be set in production")
  process.exit(1)
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Let Vite/React handle CSP
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow img tags from Vite dev server
}))

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.CORS_ORIGIN || false // Reject if not configured in production
    : true,
  credentials: true,
}))
app.use(express.json({ limit: "20mb" }))
app.use(express.urlencoded({ extended: true, limit: "20mb" }))
app.use(cookieParser())

// Session middleware
app.use(session({
  secret: SESSION_SECRET || "dev-only-secret-not-for-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  },
}))

// Trust proxy in production (for secure cookies behind reverse proxy)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1)
}

// Global rate limiter (all API routes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 100 : 1000, // 100 in prod, 1000 in dev
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use("/api", globalLimiter)

// CSRF protection - generate token for all requests
app.use(generateCsrfToken)

// CSRF token endpoint (public, before auth)
app.get("/api/csrf-token", getCsrfToken)

// Auth routes (before requireAuth middleware)
app.use("/api/auth", authRoutes)

// Public photo file route (before requireAuth so img tags can load without auth)
app.get("/api/photos/file/:storageKey", async (req, res) => {
  try {
    const { storageKey } = req.params
    if (!storageKey) return res.status(400).json({ error: "Storage key required" })

    const photo = await getPhotoByStorageKey(storageKey)
    if (!photo) return res.status(404).json({ error: "Photo not found" })

    const storagePhotosDir = path.resolve(__dirname, "../../../storage/photos")
    const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    let filePath: string | null = null

    for (const ext of extensions) {
      const testPath = path.join(storagePhotosDir, `${storageKey}${ext}`)
      try {
        await fs.access(testPath)
        filePath = testPath
        break
      } catch { /* try next */ }
    }

    if (!filePath) return res.status(404).json({ error: "Photo file not found" })
    res.sendFile(filePath)
  } catch (error) {
    console.error("Failed to get photo file:", error)
    res.status(500).json({ error: "Failed to get photo file" })
  }
})

// Public avatar route (before requireAuth so img tags can load without auth)
app.get("/api/auth/avatar/:userId", async (req, res) => {
  try {
    const { userId } = req.params
    if (!userId) return res.status(400).json({ error: "User ID required" })

    const user = await getUserById(userId)
    if (!user?.avatarUrl) return res.status(404).json({ error: "No avatar" })

    // avatarUrl is a data URL (data:image/webp;base64,...) — serve the bytes directly
    const dataUrlMatch = user.avatarUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
      const mimeType = dataUrlMatch[1]
      const buffer = Buffer.from(dataUrlMatch[2], "base64")
      res.setHeader("Content-Type", mimeType)
      res.setHeader("Cache-Control", "public, max-age=3600")
      return res.send(buffer)
    }

    // Fallback: try serving from disk (legacy file-based avatars)
    const { getAvatarPath } = await import("./services/avatarService.js")
    const filePath = await getAvatarPath(userId)
    if (filePath) return res.sendFile(filePath)

    return res.status(404).json({ error: "Avatar not found" })
  } catch (error) {
    console.error("Failed to get avatar:", error)
    res.status(500).json({ error: "Failed to get avatar" })
  }
})

// Require authentication for all other API routes
app.use("/api", requireAuth)

// CSRF validation for all authenticated state-changing requests
app.use("/api", validateCsrfToken)

// Static file serving for photos (local fallback when not using Supabase Storage)
const storageDir = path.resolve(__dirname, "../../../storage/photos")
app.use("/storage/photos", express.static(storageDir))

// API routes
app.use("/api", routes)

// Initialize database and start server
async function start() {
  const dbConnected = await initializeDatabase()

  if (!dbConnected) {
    console.warn("Server starting without database connection")
    console.warn("Set DATABASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY in .env file")
  } else {
    // Start proposal sync polling (only if database is connected)
    startSyncPolling()
    // Start pipeline sync polling (RFP intake data)
    startPipelineSyncPolling()
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`API available at http://localhost:${PORT}/api`)
  })
}

start().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
