/**
 * Per-feature email allowlists for soft-launched tools.
 *
 * These gate UI visibility only (nav rail, home tiles, settings tiles). The
 * routes themselves are behind ProtectedRoute and the API is session-auth'd,
 * so this is discoverability control, not a security boundary.
 */

export const ERIC_ONLY = ["eric.yerke@stamats.com"] as const

/** Migration Matrix soft launch: Eric plus the content-migration leads. */
export const MIGRATION_MATRIX_ALLOW = [
  "eric.yerke@stamats.com",
  "laura.hynes@stamats.com",
  "crystal.weber@stamats.com",
  "sandra.fancher@stamats.com",
] as const

/**
 * Topic Ideation soft launch: Eric plus Content Marketing. The API enforces the
 * same list (server listening/access.ts); keep the two in step.
 */
export const TOPIC_IDEATION_ALLOW = [
  "eric.yerke@stamats.com",
  "joe.volk@stamats.com",
  "mariah.tang@stamats.com",
] as const

/** Case-insensitive membership test; tolerates a missing/loading user. */
export function canAccess(allow: readonly string[], email: string | null | undefined): boolean {
  return !!email && allow.includes(email.trim().toLowerCase())
}
