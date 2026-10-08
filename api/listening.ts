/**
 * Topic Ideation Vercel function (social listening for content ideas).
 * Mirrors packages/server/src/routes/listening.ts; both adapt
 * packages/server/src/listening/service.ts. Self-contained primitives
 * (session verify, CSRF, rate limit, cookie parse) per the repo's
 * inline-duplicate convention. A scan takes 2 to 3 minutes, so this function
 * gets maxDuration 300 (vercel.json and the config export below).
 *
 * Route map (drift-script probes read this comment):
 * /listening/access /listening/topics /listening/runs
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "crypto"
import postgres from "postgres"

// ─── Environment ────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? ""
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.APP_PASSWORD || ""

// ─── Lazy DB ────────────────────────────────────────────────

let _sql: ReturnType<typeof postgres> | null = null
function getSql() {
  if (_sql) return _sql
  if (!DATABASE_URL) return null
  // prepare:false is required behind Supabase's transaction pooler: with prepared
  // statements, concurrent queries hung (measured 2026-10-07).
  _sql = postgres(DATABASE_URL, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 })
  return _sql
}

// ─── Session HMAC verify (duplicated from api/index.ts) ─────

interface SessionData {
  authenticated: boolean
  userId?: string
  userName?: string
  userEmail?: string
  role?: "admin" | "user"
  expires: number
}

async function createHmac(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return Buffer.from(sig).toString("base64url")
}

async function verifySession(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null
  try {
    const [payload, signature] = token.split(".")
    if (!payload || !signature) return null
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData
    if (decoded.expires < Date.now()) return null
    const expectedSig = await createHmac(payload)
    try {
      const sigBuf = Buffer.from(signature, "base64url")
      const expBuf = Buffer.from(expectedSig, "base64url")
      if (sigBuf.length !== expBuf.length) return null
      if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
    } catch {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

// ─── Cookie + CSRF (duplicated) ─────────────────────────────

function getCookie(req: VercelRequest, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? []
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=")
    if (key === name) return value
  }
  return undefined
}

function validateCsrf(req: VercelRequest): boolean {
  const safe = ["GET", "HEAD", "OPTIONS"]
  if (safe.includes(req.method || "GET")) return true
  const ct = getCookie(req, "csrf-token")
  const ht = req.headers["x-csrf-token"] as string | undefined
  if (!ct || !ht || ct.length !== ht.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(ct), Buffer.from(ht))
  } catch {
    return false
  }
}

// ─── Rate limit (in-memory, per-instance) ───────────────────

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 })
    return true
  }
  entry.count++
  return entry.count <= 300
}

// ─── Shared engine (loaded on first use) ────────────────────

type Mods = {
  svc: typeof import("../packages/server/src/listening/service.js")
  store: typeof import("../packages/server/src/listening/store.js")
  deps: typeof import("../packages/server/src/listening/deps.js")
  access: typeof import("../packages/server/src/listening/access.js")
}
let _mods: Promise<Mods> | null = null
function mods(): Promise<Mods> {
  _mods ??= Promise.all([
    import("../packages/server/src/listening/service.js"),
    import("../packages/server/src/listening/store.js"),
    import("../packages/server/src/listening/deps.js"),
    import("../packages/server/src/listening/access.js"),
  ]).then(([svc, store, deps, access]) => ({ svc, store, deps, access }))
  return _mods
}

// ─── Handler ────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown"
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests" })

  const session = await verifySession(getCookie(req, "rfp-session"))
  if (!session?.authenticated) return res.status(401).json({ error: "Authentication required" })

  const m = await mods()
  if (!m.access.listeningAllowed(session.userEmail)) return res.status(403).json({ error: "Access denied" })
  if (!validateCsrf(req)) return res.status(403).json({ error: "Invalid CSRF token" })

  const sql = getSql()
  if (!sql) return res.status(503).json({ error: "Database not configured" })
  const store = new m.store.PgStore(sql as never)
  const ctx = {
    store,
    userEmail: (session.userEmail ?? "").toLowerCase(),
    deps: () => m.deps.buildDeps({ store, cache: new m.store.PgCache(sql as never) }),
  }

  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`)
  const path = url.pathname.replace(/^\/api\/listening/, "") || "/"
  const method = (req.method || "GET").toUpperCase()
  const send = (r: { ok: true; body: unknown } | { ok: false; status: number; error: string; code?: string }) =>
    r.ok ? res.json(r.body) : res.status(r.status).json({ error: r.error, code: r.code })

  const stream = async (request: Parameters<typeof m.svc.prepareRun>[1]) => {
    const prepared = await m.svc.prepareRun(ctx, request)
    if (!prepared.ok) return res.status(prepared.status).json({ error: prepared.error, code: prepared.code })
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.status(200)
    res.flushHeaders?.()
    const write = (e: { type: string }) => {
      if (res.writableEnded || res.destroyed) return
      res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    }
    await m.svc.streamRun(ctx, prepared.body, { write })
    if (!res.writableEnded) res.end()
  }

  try {
    let mm: RegExpMatchArray | null
    if (method === "GET" && path === "/access") return res.json(await m.svc.access(ctx))
    if (method === "GET" && path === "/topics") return res.json(await m.svc.listTopics(ctx))
    if (method === "POST" && path === "/topics") {
      const body = (req.body ?? {}) as { query?: unknown; timeWindow?: unknown }
      return await stream({ trigger: "initial", query: body.query, timeWindow: body.timeWindow })
    }
    if ((mm = path.match(/^\/topics\/([^/]+)$/))) {
      if (method === "GET") return send(await m.svc.topicDetail(ctx, mm[1]!))
      if (method === "DELETE") return send(await m.svc.removeTopic(ctx, mm[1]!))
    }
    if (method === "POST" && (mm = path.match(/^\/topics\/([^/]+)\/(rescan|rebuild)$/))) {
      return await stream({ trigger: mm[2] as "rescan" | "rebuild", topicId: mm[1]! })
    }
    if (method === "GET" && (mm = path.match(/^\/runs\/([^/]+)$/))) return send(await m.svc.runStatus(ctx, mm[1]!))
    if (method === "POST" && (mm = path.match(/^\/runs\/([^/]+)\/cancel$/))) return send(await m.svc.cancelRun(ctx, mm[1]!))
    return res.status(404).json({ error: "Not found" })
  } catch (err) {
    console.error("[listening]", err)
    if (!res.headersSent) return res.status(500).json({ error: "Something went wrong. Try again." })
    if (!res.writableEnded) res.end()
  }
}

export const config = {
  maxDuration: 300,
}
