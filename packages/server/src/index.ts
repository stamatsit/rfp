import "dotenv/config"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import session from "express-session"
import path from "path"
import { fileURLToPath } from "url"
import routes from "./routes/index.js"
import authRoutes from "./routes/auth.js"
import { requireAuth } from "./middleware/auth.js"
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
}))

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.CORS_ORIGIN || false // Reject if not configured in production
    : true,
  credentials: true,
}))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

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

// Auth routes (before requireAuth middleware)
app.use("/api/auth", authRoutes)

// Require authentication for all other API routes
app.use("/api", requireAuth)

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
