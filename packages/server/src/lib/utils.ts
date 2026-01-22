import crypto from "crypto"

/**
 * Normalize text for comparison and fingerprinting
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ")
}

/**
 * Normalize a topic/category name for storage
 * - Lowercase
 * - Trim
 * - Replace spaces with hyphens
 * - Remove special characters
 */
export function normalizeTopicName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars first
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
}

/**
 * Normalize tags array
 * - Lowercase each tag
 * - Trim whitespace
 * - Remove duplicates
 * - Filter empty strings
 */
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => tag.length > 0)

  return [...new Set(normalized)]
}

/**
 * Parse comma-separated tags string into normalized array
 */
export function parseTagsString(tagsString: string | undefined | null): string[] {
  if (!tagsString) return []

  const tags = tagsString.split(",").map((t) => t.trim())
  return normalizeTags(tags)
}

/**
 * Generate a deterministic fingerprint for an answer item
 * Used for upsert deduplication during import
 *
 * Fingerprint = SHA256(normalizedQuestion | normalizedTopicName)[0:16]
 */
export function generateFingerprint(question: string, topicName: string): string {
  const normalized = [normalizeText(question), normalizeTopicName(topicName)].join("|")

  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16)
}

/**
 * Calculate similarity between two strings (for collision detection)
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1)
  const s2 = normalizeText(str2)

  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  // Simple Jaccard similarity on words
  const words1 = new Set(s1.split(" "))
  const words2 = new Set(s2.split(" "))

  const intersection = new Set([...words1].filter((x) => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

/**
 * Check if two answers are materially different (potential collision)
 * Returns true if answers are different enough to warrant review
 */
export function isMateriallyDifferent(answer1: string, answer2: string, threshold = 0.7): boolean {
  const similarity = calculateSimilarity(answer1, answer2)
  return similarity < threshold
}

/**
 * Generate a storage key for photos (UUID-based)
 */
export function generateStorageKey(): string {
  return crypto.randomUUID()
}

/**
 * Sanitize a filename for display
 * Removes extension, replaces dashes/underscores with spaces, title cases
 */
export function sanitizeFilenameForDisplay(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim()
}
