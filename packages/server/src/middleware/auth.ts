import type { Request, Response, NextFunction } from "express"

/**
 * Middleware to require authentication for protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Allow health check (path is relative to /api mount point)
  if (req.path === "/health") {
    return next()
  }

  // Check if authenticated
  if (req.session?.authenticated === true) {
    return next()
  }

  // Not authenticated
  return res.status(401).json({ error: "Authentication required" })
}

/**
 * Middleware to require admin role for write operations.
 * Returns 403 if the user is authenticated but has "user" (read-only) role.
 */
export function requireWriteAccess(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role ?? "user"
  if (role !== "admin") {
    return res.status(403).json({ error: "Write access requires admin role" })
  }
  return next()
}
