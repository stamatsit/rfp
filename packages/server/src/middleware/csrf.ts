import type { Request, Response, NextFunction } from "express"
import crypto from "crypto"

/**
 * CSRF Protection Middleware
 *
 * Uses double-submit cookie pattern:
 * 1. Server generates random token and stores in cookie
 * 2. Client includes token in X-CSRF-Token header
 * 3. Server validates that cookie matches header
 */

const CSRF_COOKIE_NAME = "csrf-token"
const CSRF_HEADER_NAME = "x-csrf-token"

/**
 * Generate a CSRF token and attach it to the response
 */
export function generateCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Skip if token already exists (for efficiency)
  if (req.cookies?.[CSRF_COOKIE_NAME]) {
    return next()
  }

  // Generate random token
  const token = crypto.randomBytes(32).toString("hex")

  // Set cookie (same-site protection)
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 4 * 60 * 60 * 1000, // 4 hours (match session)
  })

  next()
}

/**
 * Validate CSRF token on state-changing requests
 * Apply to POST, PUT, PATCH, DELETE routes
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Skip validation for safe methods
  const safeMethods = ["GET", "HEAD", "OPTIONS"]
  if (safeMethods.includes(req.method)) {
    return next()
  }

  // Get token from cookie and header
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME]
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined

  // Debug logging for multipart requests
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    console.log("[CSRF] Multipart request:", req.method, req.path)
    console.log("[CSRF] Cookie token:", cookieToken ? "present" : "missing")
    console.log("[CSRF] Header token:", headerToken ? "present" : "missing")
  }

  // Validate tokens exist
  if (!cookieToken) {
    return res.status(403).json({
      error: "CSRF token missing. Please refresh the page."
    })
  }

  if (!headerToken) {
    return res.status(403).json({
      error: "CSRF token not provided in request header."
    })
  }

  // Validate tokens match (constant-time comparison to prevent timing attacks)
  const cookieBuffer = Buffer.from(cookieToken)
  const headerBuffer = Buffer.from(headerToken)

  // Buffers must be same length for timingSafeEqual
  if (cookieBuffer.length !== headerBuffer.length) {
    return res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page."
    })
  }

  if (!crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
    return res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page."
    })
  }

  next()
}

/**
 * Endpoint to get CSRF token for client-side requests
 */
export function getCsrfToken(req: Request, res: Response) {
  const token = req.cookies?.[CSRF_COOKIE_NAME]

  if (!token) {
    return res.status(500).json({
      error: "CSRF token not initialized"
    })
  }

  res.json({ csrfToken: token })
}
