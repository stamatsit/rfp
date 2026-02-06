import type { Request } from "express"

/**
 * Extract user display name from session for attribution.
 * Returns "local" for backward compatibility when no user is logged in.
 */
export function getCurrentUserName(req: Request): string {
  return req.session?.userName || "local"
}

/**
 * Extract user ID from session, or null if not logged in.
 */
export function getCurrentUserId(req: Request): string | null {
  return req.session?.userId || null
}
