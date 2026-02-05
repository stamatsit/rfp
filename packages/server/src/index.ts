import "dotenv/config"
import express from "express"
import cors from "cors"
import session from "express-session"
import path from "path"
import { fileURLToPath } from "url"
import routes from "./routes/index.js"
import authRoutes from "./routes/auth.js"
import { requireAuth } from "./middleware/auth.js"
import { initializeDatabase } from "./db/index.js"
import { startSyncPolling } from "./services/proposalSyncService.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT ?? 3001
const SESSION_SECRET = process.env.SESSION_SECRET || "rfp-library-secret-key-change-in-production"

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.CORS_ORIGIN || true
    : true,
  credentials: true,
}))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
