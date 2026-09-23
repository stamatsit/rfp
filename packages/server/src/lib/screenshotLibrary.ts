/**
 * Screenshot library helpers shared by the Express screenshot route. The Vercel
 * bundle (api/index.ts) carries an inline copy of these, by convention: it
 * never imports from packages/server. Keep the two in step.
 *
 * Bytes live in the private Supabase Storage bucket below; the
 * screenshot_captures table holds metadata only.
 */
import { createHash } from "crypto"

export const SCREENSHOT_BUCKET = "screenshots"

/** Same rules as the client's normalizeUrlKey: lowercase scheme and host, drop www., hash and trailing slash. */
export function normalizeUrlKey(input: string): string {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return ""
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return ""
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  const port = u.port ? `:${u.port}` : ""
  let path = u.pathname
  if (path.length > 1) path = path.replace(/\/+$/, "")
  if (path === "/") path = ""
  return `${u.protocol}//${host}${port}${path}${u.search}`
}

export function domainOf(input: string): string {
  try {
    return new URL(input.trim()).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

const SLUG_MAX = 60

function pathSlug(input: string): string {
  let pathname = ""
  try {
    pathname = new URL(input).pathname
  } catch {
    return "index"
  }
  const slug = pathname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "")
  return slug || "index"
}

/**
 * <domain>/<yyyy-mm>/<slug>-<viewport>-<yyyymmddThhmmss>-<sha1 8>.png
 * Readable in the bucket browser, unique per capture, and the hash makes
 * accidental double-uploads of identical bytes collide instead of duplicate.
 */
export function buildStorageKey(url: string, viewport: "desktop" | "mobile", now: Date, bytes: Buffer): string {
  const domain = domainOf(url) || "unknown"
  const iso = now.toISOString() // 2026-09-23T14:05:09.000Z
  const ym = iso.slice(0, 7)
  const ts = iso.replace(/[-:]/g, "").slice(0, 15) // 20260923T140509
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8)
  return `${domain}/${ym}/${pathSlug(url)}-${viewport}-${ts}-${hash}.png`
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from the IHDR chunk, which is always first. Null if not a PNG. */
export function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
