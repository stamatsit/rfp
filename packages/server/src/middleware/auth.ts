import type { Request, Response, NextFunction } from "express"

/**
 * Middleware to require authentication for protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Allow auth routes to pass through
  if (req.path.startsWith("/api/auth")) {
    return next()
  }

  // Allow health check
  if (req.path === "/api/health") {
    return next()
  }

  // Check if authenticated
  if (req.session?.authenticated === true) {
    return next()
  }

  // Not authenticated
  return res.status(401).json({ error: "Authentication required" })
}
