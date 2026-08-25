/**
 * SSRF-safe URL validation and fetching.
 *
 * The previous guards checked only the hostname *string*, which let three
 * classes of request through to internal infrastructure:
 *   1. A public DNS name that resolves to a private IP (e.g. localtest.me -> 127.0.0.1),
 *      including DNS-rebinding.
 *   2. IPv4-mapped IPv6 literals, e.g. http://[::ffff:127.0.0.1]/
 *   3. A public URL that 3xx-redirects to a private one — the guard ran once,
 *      then `redirect: "follow"` chased the hop unchecked.
 *
 * This module resolves DNS and validates every resolved address, and follows
 * redirects manually so each hop is re-validated.
 */

import { lookup } from "node:dns/promises"
import net from "node:net"

/**
 * Convert an IPv4-mapped IPv6 address to dotted-quad, or null.
 * Handles both the dotted form (::ffff:127.0.0.1) and the hex form
 * (::ffff:7f00:1) — WHATWG URL parsing normalises to the latter, which is
 * exactly how a naive guard gets bypassed.
 */
function mappedIpv4(ip: string): string | null {
  const v = ip.toLowerCase()
  const dotted = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) return dotted[1]!
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1]!, 16)
    const lo = parseInt(hex[2]!, 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

/** True when an IP literal belongs to a private, loopback, link-local, or otherwise non-routable range. */
export function isPrivateIp(ip: string): boolean {
  // Normalise IPv4-mapped IPv6 down to its IPv4 form before range checks.
  const mapped = mappedIpv4(ip)
  if (mapped) ip = mapped

  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number)
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
    const [a, b] = p as [number, number, number, number]
    if (a === 10) return true                                  // 10.0.0.0/8
    if (a === 127) return true                                 // loopback
    if (a === 0) return true                                   // "this" network
    if (a === 169 && b === 254) return true                    // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true           // 172.16.0.0/12
    if (a === 192 && b === 168) return true                    // 192.168.0.0/16
    if (a === 192 && b === 0) return true                      // 192.0.0.0/24 protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true          // CGNAT 100.64.0.0/10
    if (a >= 224) return true                                  // multicast + reserved
    return false
  }

  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === "::1" || v === "::") return true                 // loopback / unspecified
    if (v.startsWith("fe80")) return true                      // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true   // unique local
    if (v.startsWith("ff")) return true                        // multicast
    return false
  }

  return true // unparseable — refuse
}

/** Cheap synchronous checks: scheme, obvious internal names, IP literals. */
export function isPublicUrl(urlString: string): boolean {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return false
  }
  if (!["http:", "https:"].includes(url.protocol)) return false

  // URL() strips the brackets from IPv6 literals' hostname.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host) return false
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false
  if (host === "metadata.google.internal") return false

  // Node's URL parser normalises decimal/octal/hex IPv4 forms, so by here an
  // address-shaped host is already dotted-quad.
  if (net.isIP(host) && isPrivateIp(host)) return false
  return true
}

/**
 * Full validation: sync checks, then DNS resolution with every returned
 * address checked. Defeats public-name-pointing-at-private-IP.
 */
export async function isPublicUrlWithDns(urlString: string): Promise<boolean> {
  if (!isPublicUrl(urlString)) return false
  const host = new URL(urlString).hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) return !isPrivateIp(host)
  try {
    const addrs = await lookup(host, { all: true })
    if (!addrs.length) return false
    return addrs.every((a) => !isPrivateIp(a.address))
  } catch {
    return false // unresolvable — refuse
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number
  headers?: Record<string, string>
  maxRedirects?: number
}

/**
 * fetch() that validates the target — and every redirect hop — against the
 * SSRF rules above. Redirects are followed manually so a public URL cannot
 * bounce the request to an internal one.
 */
export async function safeFetch(urlString: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, headers = {}, maxRedirects = 5 } = opts
  let current = urlString

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isPublicUrlWithDns(current))) {
      throw new Error(`Blocked non-public URL: ${current}`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual", // never let undici chase an unvalidated hop
        headers,
      })
    } finally {
      clearTimeout(timer)
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) return res
      current = new URL(location, current).toString()
      continue
    }
    return res
  }
  throw new Error("Too many redirects")
}
