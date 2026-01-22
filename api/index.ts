import type { VercelRequest, VercelResponse } from "@vercel/node"
import "dotenv/config"
import express from "express"
import cors from "cors"
import session from "express-session"

// Import server modules
import routes from "../packages/server/src/routes/index"
import authRoutes from "../packages/server/src/routes/auth"
import { requireAuth } from "../packages/server/src/middleware/auth"
import { initializeDatabase } from "../packages/server/src/db/index"

const app = express()
const SESSION_SECRET = process.env.SESSION_SECRET || "rfp-library-secret-key-change-in-production"

// Initialize database on cold start
let dbInitialized = false
const ensureDb = async () => {
  if (!dbInitialized) {
    await initializeDatabase()
    dbInitialized = true
  }
}

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Trust proxy for secure cookies
app.set("trust proxy", 1)

// Session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
}))

// Database initialization middleware
app.use(async (_req, _res, next) => {
  await ensureDb()
  next()
})

// Auth routes (before requireAuth middleware)
app.use("/api/auth", authRoutes)

// Require authentication for all other API routes
app.use("/api", requireAuth)

// API routes
app.use("/api", routes)

// Vercel serverless handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any)
}
