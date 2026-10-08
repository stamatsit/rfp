import { HOST_PLATFORM } from "../config.js"
import type { Platform } from "../types.js"

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igshid$|si$|ref$|ref_src$|share_id$|context$|rdt$)/i

/**
 * Canonical form used to dedupe items across lanes and runs: https, no www or
 * old/m/np subdomain prefixes, no tracking params, no hash, no trailing slash,
 * lowercased host. Reddit thread URLs are trimmed to /r/<sub>/comments/<id>/
 * so the same thread found with different slugs dedupes; comment permalinks
 * keep their comment id.
 */
export function canonicalUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return raw.trim()
  }
  u.protocol = "https:"
  // Replies read from a forum page share its URL; "#reply-N" keeps them distinct.
  const replyHash = /^#reply-\d+$/.test(u.hash) ? u.hash : ""
  u.hash = ""
  let host = u.hostname.toLowerCase().replace(/^(www|m|old|np|new|mobile)\./, "")
  if (host === "redd.it") {
    return `https://reddit.com/comments/${u.pathname.replace(/\//g, "")}`
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1)
    return `https://youtube.com/watch?v=${id}`
  }
  u.hostname = host
  const keep = new URLSearchParams()
  for (const [k, v] of u.searchParams) {
    if (TRACKING_PARAMS.test(k)) continue
    if (host.endsWith("youtube.com") && k !== "v" && k !== "lc") continue
    keep.append(k, v)
  }
  let path = u.pathname
  if (host.endsWith("reddit.com")) {
    const m = path.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/[^/]*)?(?:\/([a-z0-9]+))?/i)
    if (m) {
      path = `/r/${m[1]!.toLowerCase()}/comments/${m[2]!.toLowerCase()}/` + (m[3] ? `_/${m[3].toLowerCase()}/` : "")
    }
  }
  path = path.replace(/\/+$/, "") || "/"
  const qs = keep.toString()
  return `https://${host}${path}${qs ? `?${qs}` : ""}${replyHash}`
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

export function platformOf(raw: string): Platform {
  const host = hostOf(raw)
  for (const [suffix, platform] of HOST_PLATFORM) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return platform
  }
  return "other"
}

/** Reddit thread id from any reddit thread URL, or null. */
export function redditThreadId(raw: string): string | null {
  const m = raw.match(/reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i)
  return m ? m[1]!.toLowerCase() : null
}

export function youtubeVideoId(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1) || null
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v")
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      if (m) return m[1]!
    }
  } catch {
    // not a URL
  }
  return null
}
