/**
 * Client Portal Vercel function: the public face of the Image Toolkit.
 *
 * Everything under /api/portal/* lands here and nowhere else. Portal users
 * are rows in portal_users (never in `users`), sign in through this function
 * only, and carry a `portal-session` cookie signed with a portal-specific key.
 * That cookie is unreadable by api/index.ts, and an internal `rfp-session`
 * cookie is only honoured here on the staff-only /admin/* routes. Every
 * portal query is scoped by the client id baked into the session.
 *
 * Self-contained: duplicates primitives from api/index.ts (session verify,
 * cookie parse, rate limit, multipart parse) per the repo's inline-duplicate
 * convention.
 *
 * Route map (drift-script probes read this comment):
 * /portal/admin/clients /portal/admin/clients/:id /portal/admin/clients/:id/invite
 * /portal/admin/clients/:id/domains /portal/admin/users/:id
 * /portal/auth/login /portal/auth/logout /portal/auth/me /portal/auth/signup
 * /portal/auth/forgot /portal/invite/:token /portal/invite/:token/accept
 * /portal/images /portal/images/:id /portal/ai/alt-text /portal/ai/enhance
 * /portal/ai/enhance-status /portal/ai/enhance-result /portal/ai/help
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "crypto"
import postgres from "postgres"
import bcrypt from "bcryptjs"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

// ─── Environment ────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? ""
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.APP_PASSWORD || ""
const PORTAL_EMAIL_FROM = process.env.PORTAL_EMAIL_FROM || "Stamats <noreply@stamats.com>"
const PORTAL_BUCKET = "portal-images"
const PORTAL_COOKIE = "portal-session"
const STAFF_COOKIE = "rfp-session"
const PORTAL_AI_MODEL = "gpt-5.6-luna"
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RESET_TTL_MS = 2 * 60 * 60 * 1000
const SESSION_TTL_S = 7 * 24 * 60 * 60

// ─── Lazy DB + Supabase + OpenAI ────────────────────────────

let _sql: ReturnType<typeof postgres> | null = null
function db() {
  if (_sql) return _sql
  if (!DATABASE_URL) return null
  _sql = postgres(DATABASE_URL)
  return _sql
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

let _openai: OpenAI | null = null
function openai(): OpenAI | null {
  if (_openai) return _openai
  if (!process.env.OPENAI_API_KEY) return null
  _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// ─── Sessions (two kinds, two keys) ─────────────────────────

interface StaffSession {
  authenticated: boolean
  userId?: string
  userName?: string
  userEmail?: string
  role?: "admin" | "user"
  expires: number
}

interface PortalSession {
  kind: "portal"
  userId: string
  clientId: string
  email: string
  name: string
  expires: number
}

async function hmac(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(data))
  return Buffer.from(sig).toString("base64url")
}

async function verifyToken<T extends { expires: number }>(key: string, token: string | undefined): Promise<T | null> {
  if (!token || !key) return null
  try {
    const [payload, signature] = token.split(".")
    if (!payload || !signature) return null
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as T
    if (!decoded.expires || decoded.expires < Date.now()) return null
    const expected = await hmac(key, payload)
    const a = Buffer.from(signature, "base64url")
    const b = Buffer.from(expected, "base64url")
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    return decoded
  } catch {
    return null
  }
}

async function signToken(key: string, payload: object): Promise<string> {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${p}.${await hmac(key, p)}`
}

const PORTAL_KEY = SESSION_SECRET ? `${SESSION_SECRET}|portal` : ""

async function staffSession(req: VercelRequest): Promise<StaffSession | null> {
  const s = await verifyToken<StaffSession>(SESSION_SECRET, getCookie(req, STAFF_COOKIE))
  if (!s || !s.authenticated || !s.userId || !s.userEmail) return null
  return s
}

async function portalSession(req: VercelRequest): Promise<PortalSession | null> {
  const s = await verifyToken<PortalSession>(PORTAL_KEY, getCookie(req, PORTAL_COOKIE))
  if (!s || s.kind !== "portal" || !s.userId || !s.clientId) return null
  return s
}

function setPortalCookie(res: VercelResponse, token: string | null) {
  res.setHeader(
    "Set-Cookie",
    token
      ? `${PORTAL_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_S}`
      : `${PORTAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  )
}

// ─── Cookie, CSRF, rate limit, helpers ──────────────────────

function getCookie(req: VercelRequest, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? []
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=")
    if (key === name) return value
  }
  return undefined
}

/** Staff mutations reuse the app's double-submit CSRF cookie + header. */
function validateStaffCsrf(req: VercelRequest): boolean {
  const ct = getCookie(req, "csrf-token")
  const ht = req.headers["x-csrf-token"] as string | undefined
  if (!ct || !ht || ct.length !== ht.length) return false
  try { return crypto.timingSafeEqual(Buffer.from(ct), Buffer.from(ht)) } catch { return false }
}

/**
 * Portal mutations: SameSite=Lax already blocks cross-site cookie sends, and a
 * custom header forces a CORS preflight that no foreign origin passes. Origin,
 * when present, must match the host.
 */
function validatePortalRequest(req: VercelRequest): boolean {
  if (req.headers["x-portal-request"] !== "1") return false
  const origin = req.headers.origin
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false } catch { return false }
  }
  return true
}

const rateMap = new Map<string, { count: number; resetTime: number }>()
function rateLimited(key: string, max: number, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now()
  const e = rateMap.get(key)
  if (!e || now > e.resetTime) { rateMap.set(key, { count: 1, resetTime: now + windowMs }); return false }
  e.count++
  return e.count > max
}

function clientIp(req: VercelRequest): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (req.headers["x-real-ip"] as string) || "unknown"
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
}

function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : ""
}

function isEmail(e: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)
}

function domainOf(email: string): string {
  return email.split("@")[1] ?? ""
}

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("base64url")
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function appOrigin(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https"
  return `${proto}://${req.headers.host}`
}

function readBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (!b) return {}
  if (typeof b === "string") { try { return JSON.parse(b) } catch { return {} } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString("utf8")) } catch { return {} } }
  return typeof b === "object" ? (b as Record<string, unknown>) : {}
}

// ─── Multipart (duplicated from api/index.ts) ───────────────

function splitBuffer(buf: Buffer, sep: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  let idx = buf.indexOf(sep, start)
  while (idx !== -1) {
    parts.push(buf.slice(start, idx))
    start = idx + sep.length
    idx = buf.indexOf(sep, start)
  }
  parts.push(buf.slice(start))
  return parts
}

async function parseMultipart(req: VercelRequest): Promise<{ buffer: Buffer; mimetype: string; filename: string; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || ""
    const boundaryMatch = contentType.match(/boundary=(.+)/)
    if (!boundaryMatch) return reject(new Error("No boundary found in content-type"))
    const processBody = (body: Buffer) => {
      const boundaryBytes = Buffer.from(`--${boundaryMatch[1]!}`)
      const parts = splitBuffer(body, boundaryBytes)
      let fileBuffer: Buffer | null = null
      let fileMime = "application/octet-stream"
      let fileFilename = "upload"
      const fields: Record<string, string> = {}
      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n")
        if (headerEnd === -1) continue
        const headers = part.slice(0, headerEnd).toString()
        const cdMatch = headers.match(/Content-Disposition:[^\r\n]+name="([^"]+)"/)
        if (!cdMatch) continue
        const filenameMatch = headers.match(/filename="([^"]*)"/)
        let value = part.slice(headerEnd + 4)
        if (value.length >= 2 && value[value.length - 2] === 0x0d && value[value.length - 1] === 0x0a) value = value.slice(0, -2)
        if (filenameMatch) {
          const ctMatch = headers.match(/Content-Type:\s*(.+)/i)
          fileBuffer = value
          fileMime = ctMatch?.[1]?.trim() || "application/octet-stream"
          fileFilename = filenameMatch[1] || "upload"
        } else {
          fields[cdMatch[1]!] = value.toString("utf-8")
        }
      }
      if (!fileBuffer) return reject(new Error("No file field found in multipart form"))
      resolve({ buffer: fileBuffer, mimetype: fileMime, filename: fileFilename, fields })
    }
    if (Buffer.isBuffer(req.body)) return processBody(req.body)
    if (typeof req.body === "string") return processBody(Buffer.from(req.body))
    let total = 0
    const chunks: Buffer[] = []
    const stream = req as unknown as NodeJS.ReadableStream
    stream.on("data", (c: Buffer) => {
      total += c.length
      if (total > MAX_UPLOAD_BYTES) return reject(new Error("File too large (25MB max)"))
      chunks.push(c)
    })
    stream.on("end", () => processBody(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

// ─── Email (Resend via fetch; degrades to copy-link) ────────

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[portal] RESEND_API_KEY not set; email to ${to} not sent (${subject})`)
    return false
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: PORTAL_EMAIL_FROM, to, subject, text, html }),
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) {
      console.error("[portal] Resend send failed:", r.status, (await r.text()).slice(0, 200))
      return false
    }
    return true
  } catch (err) {
    console.error("[portal] Resend send error:", (err as Error)?.message)
    return false
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

function inviteEmail(clientName: string, url: string, invitedBy: string | null) {
  const who = invitedBy ? ` by ${invitedBy}` : ""
  const subject = `You're invited to the Stamats Image Toolkit for ${clientName}`
  const text = `You've been invited${who} to the Stamats Image Toolkit for ${clientName}.\n\nSet your password and start here:\n${url}\n\nThis link expires in 7 days. If you weren't expecting it, you can ignore this email.`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 12px;font-size:20px">Stamats Image Toolkit</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">You've been invited${esc(who)} to the Image Toolkit for <strong>${esc(clientName)}</strong>. Convert, crop, enhance, erase, and remove backgrounds, then keep your images in one place.</p>
<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#C41230;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Set your password</a></p>
<p style="margin:0;font-size:13px;color:#475569">This link expires in 7 days. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>
</div>`
  return { subject, text, html }
}

function resetEmail(url: string) {
  const subject = "Reset your Stamats Image Toolkit password"
  const text = `Use this link to set a new password:\n${url}\n\nIt expires in 2 hours. If you didn't ask for this, you can ignore this email.`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 12px;font-size:20px">Reset your password</h2>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Use the button below to choose a new password for the Stamats Image Toolkit.</p>
<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#C41230;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Set a new password</a></p>
<p style="margin:0;font-size:13px;color:#475569">This link expires in 2 hours. If you didn't ask for this, ignore this email.</p>
</div>`
  return { subject, text, html }
}

// ─── Replicate models (mirrors api/index.ts) ────────────────

const REPLICATE_ENHANCE_MODELS: Record<string, { version: string; input: (image: string) => Record<string, unknown> }> = {
  "upscale-2x": { version: "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8", input: (image) => ({ image, scale: 2, face_enhance: false }) },
  "upscale-4x": { version: "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8", input: (image) => ({ image, scale: 4, face_enhance: false }) },
  denoise: { version: "660d922d33153019e8c263a3bba265de882e7f4f70396546b6c9c8f9d47a021a", input: (image) => ({ image, task_type: "Color Image Denoising", noise: 15 }) },
  deblur: { version: "018241a6c880319404eaa2714b764313e27e11f950a7ff0a7b5b37b27b74dcf7", input: (image) => ({ image, task_type: "Image Debluring (GoPro)" }) },
  "low-light": { version: "4328e402cfedafa70ad7cec04412e86ab61832204deccd94108ae5222c9b1ae1", input: (image) => ({ image }) },
  retouch: { version: "cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2", input: (image) => ({ image, upscale: 1, face_upsample: true, background_enhance: true, codeformer_fidelity: 0.7 }) },
}

// ─── Help assistant knowledge (the ONLY thing it may talk about) ──

const TOOLKIT_HELP = `
The Stamats Image Toolkit is a browser tool for preparing images. It has two areas: Toolkit and My Photos.

ADDING IMAGES: drag and drop onto the drop zone or click it to browse. JPEG, PNG, WebP, GIF and HEIC are accepted (HEIC is converted to JPEG automatically). Several images can be added at once; they appear in the filmstrip under the preview. Click a thumbnail to select it. Images stay in the browser until you save them to My Photos.

CONVERT AND RESIZE: in the right panel choose the output format (WebP, PNG or JPEG) and quality, and set the output width and height (aspect ratio is kept). Download the selected image, or download everything as a ZIP. Multi-size export produces several sizes of one image at once. Batch rename applies a naming pattern to all files in the ZIP, and the ZIP includes a metadata CSV with alt text.

CROP: open the crop tool, pick a preset (Free, Square 1:1, 5:4, 4:3, 3:2, 16:9, 9:16, 2:3, 3:4) or set a custom size, drag and zoom to frame, then apply. Undo restores the original.

ERASE (magic eraser): paint over the object you want removed and the toolkit fills the area in. Use [ and ] to change the brush size. Works in the browser; large areas take a few seconds. Undo restores the previous version.

REMOVE BACKGROUND: one click removes the background and leaves a transparent PNG. Runs in the browser, so the first use downloads a model and can take a moment. Undo restores the original.

ALT TEXT: the alt text button writes a short accessibility description for the selected image. You can edit it. Alt text is included in the ZIP metadata.

MY PHOTOS: images you save are kept for your organization only. Use "Save to My Photos" in the toolkit to store the current version of an image, or upload files directly on the My Photos page. From My Photos you can open an image in the toolkit, download it, or delete it. Tap photos to select several at once, then use "Open N in toolkit" to send them all in together, which is how you batch rename or export several sizes from work you already saved. Only people invited to your organization can see them. Stamats staff can also see them to help you.

ACCOUNT: access is by invitation from Stamats, or by signing up with an approved organization email. Use "Forgot password" on the sign-in page to get a reset link. Sign out from the menu in the header. Invite links expire after 7 days.
`.trim()

const HELP_SYSTEM_PROMPT = `You are the help assistant inside the Stamats Image Toolkit. You answer questions ONLY about using the Image Toolkit, based strictly on the reference below. If a question is about anything else (other software, Stamats' business, other clients, data, coding, general knowledge, the weather, anything not covered by the reference), reply exactly: "I can only help with using the Image Toolkit. Try asking how to convert, crop, erase, remove a background, enhance, or save an image." Never invent features. Never use em dashes or en dashes; use commas, periods or colons. Keep answers short: two to five sentences, or a short numbered list for step by step instructions.

REFERENCE:
${TOOLKIT_HELP}`

// ─── Handler ────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store")
  const method = (req.method || "GET").toUpperCase()
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`)
  const path = url.pathname.replace(/^\/api\/portal/, "") || "/"
  const ip = clientIp(req)
  const sql = db()

  if (!sql) return json(res, 503, { error: "Database not configured" })
  if (!SESSION_SECRET) return json(res, 503, { error: "Session secret not configured" })
  if (rateLimited(`ip:${ip}`, 600)) return json(res, 429, { error: "Too many requests" })

  try {
    // ════════════════════════════════════════════════════════
    // STAFF ADMIN (internal session, any role)
    // ════════════════════════════════════════════════════════
    if (path.startsWith("/admin/")) {
      const staff = await staffSession(req)
      if (!staff) return json(res, 401, { error: "Staff sign-in required" })
      if (method !== "GET" && !validateStaffCsrf(req)) return json(res, 403, { error: "CSRF validation failed" })
      const actor = staff.userEmail!

      if (path === "/admin/clients" && method === "GET") {
        const rows = await sql`
          select c.id, c.name, c.status,
            (select count(*)::int from portal_users pu where pu.client_id = c.id and pu.status <> 'disabled') as user_count,
            (select count(*)::int from portal_client_domains d where d.client_id = c.id) as domain_count,
            (select count(*)::int from portal_images i where i.client_id = c.id) as image_count
          from clients c
          order by (case when c.status = 'active' then 0 when c.status = 'prospect' then 1 else 2 end), lower(c.name)`
        return json(res, 200, { clients: rows })
      }

      if (path === "/admin/clients" && method === "POST") {
        const body = readBody(req)
        const name = typeof body.name === "string" ? body.name.trim() : ""
        if (name.length < 2 || name.length > 120) return json(res, 400, { error: "Client name must be 2 to 120 characters" })
        const [existing] = await sql`select id, name from clients where lower(name) = lower(${name}) limit 1`
        if (existing) return json(res, 409, { error: "A client with that name already exists", client: existing })
        const [row] = await sql`insert into clients (name, status) values (${name}, 'active') returning id, name, status`
        return json(res, 201, { client: row })
      }

      const m = path.match(/^\/admin\/clients\/([^/]+)(?:\/(invite|domains)(?:\/([^/]+))?)?$/)
      if (m) {
        const clientId = m[1]
        if (!isUuid(clientId)) return json(res, 400, { error: "Invalid client id" })
        const [client] = await sql`select id, name, status from clients where id = ${clientId}`
        if (!client) return json(res, 404, { error: "Client not found" })
        const sub = m[2]
        const subId = m[3]

        if (!sub && method === "GET") {
          const users = await sql`
            select id, email, name, status, invited_by, invited_at, accepted_at, last_login_at,
              (token_purpose = 'invite' and token_expires_at > now()) as invite_live
            from portal_users where client_id = ${clientId} order by created_at desc`
          const domains = await sql`select id, domain, created_by, created_at from portal_client_domains where client_id = ${clientId} order by domain`
          const [img] = await sql`select count(*)::int as n from portal_images where client_id = ${clientId}`
          return json(res, 200, { client, users, domains, imageCount: img?.n ?? 0, emailConfigured: !!process.env.RESEND_API_KEY })
        }

        if (sub === "invite" && method === "POST") {
          if (rateLimited(`invite:${actor}`, 60)) return json(res, 429, { error: "Too many invites, slow down" })
          const body = readBody(req)
          const email = normalizeEmail(body.email)
          if (!isEmail(email)) return json(res, 400, { error: "A valid email is required" })
          const [existing] = await sql`select id, client_id, status from portal_users where email = ${email}`
          if (existing && existing.client_id !== clientId) {
            return json(res, 409, { error: "That email already belongs to a different client workspace" })
          }
          const token = newToken()
          const expires = new Date(Date.now() + INVITE_TTL_MS)
          let userId: string
          if (existing) {
            if (existing.status === "active") {
              return json(res, 409, { error: "That person already has access. Use the reset link on the sign-in page if they need a new password." })
            }
            await sql`update portal_users set status = 'invited', token_hash = ${sha256(token)}, token_purpose = 'invite',
              token_expires_at = ${expires}, invited_by = ${actor}, invited_at = now(), updated_at = now() where id = ${existing.id}`
            userId = existing.id as string
          } else {
            const [row] = await sql`insert into portal_users (client_id, email, status, token_hash, token_purpose, token_expires_at, invited_by)
              values (${clientId}, ${email}, 'invited', ${sha256(token)}, 'invite', ${expires}, ${actor}) returning id`
            userId = row!.id as string
          }
          const inviteUrl = `${appOrigin(req)}/portal/invite/${token}`
          const mail = inviteEmail(client.name as string, inviteUrl, actor)
          const emailed = await sendEmail(email, mail.subject, mail.text, mail.html)
          return json(res, 201, { userId, email, inviteUrl, emailed, expiresAt: expires.toISOString() })
        }

        if (sub === "domains" && method === "POST") {
          const body = readBody(req)
          const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase().replace(/^@/, "") : ""
          if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) return json(res, 400, { error: "Enter a bare domain like university.edu" })
          if (domain === "stamats.com") return json(res, 400, { error: "Stamats staff use the internal app, not the portal" })
          const [taken] = await sql`select d.client_id, c.name from portal_client_domains d join clients c on c.id = d.client_id where d.domain = ${domain}`
          if (taken) return json(res, 409, { error: `${domain} is already assigned to ${taken.name}` })
          const [row] = await sql`insert into portal_client_domains (client_id, domain, created_by) values (${clientId}, ${domain}, ${actor}) returning id, domain, created_by, created_at`
          return json(res, 201, { domain: row })
        }

        if (sub === "domains" && method === "DELETE" && subId) {
          if (!isUuid(subId)) return json(res, 400, { error: "Invalid domain id" })
          const rows = await sql`delete from portal_client_domains where id = ${subId} and client_id = ${clientId} returning id`
          if (!rows.length) return json(res, 404, { error: "Domain not found" })
          return json(res, 200, { ok: true })
        }
      }

      const um = path.match(/^\/admin\/users\/([^/]+)\/(revoke|restore|resend)$/)
      if (um && method === "POST") {
        const userId = um[1]
        if (!isUuid(userId)) return json(res, 400, { error: "Invalid user id" })
        const [u] = await sql`select pu.id, pu.email, pu.status, pu.client_id, c.name as client_name from portal_users pu join clients c on c.id = pu.client_id where pu.id = ${userId}`
        if (!u) return json(res, 404, { error: "User not found" })
        if (um[2] === "revoke") {
          await sql`update portal_users set status = 'disabled', token_hash = null, token_purpose = null, token_expires_at = null, updated_at = now() where id = ${userId}`
          return json(res, 200, { ok: true })
        }
        if (um[2] === "restore") {
          const next = u.status === "disabled" ? "active" : u.status
          await sql`update portal_users set status = ${next}, updated_at = now() where id = ${userId}`
          return json(res, 200, { ok: true, status: next })
        }
        if (um[2] === "resend") {
          if (u.status === "active") return json(res, 409, { error: "Already active. They can use Forgot password on the sign-in page." })
          const token = newToken()
          const expires = new Date(Date.now() + INVITE_TTL_MS)
          await sql`update portal_users set status = 'invited', token_hash = ${sha256(token)}, token_purpose = 'invite', token_expires_at = ${expires}, invited_by = ${actor}, invited_at = now(), updated_at = now() where id = ${userId}`
          const inviteUrl = `${appOrigin(req)}/portal/invite/${token}`
          const mail = inviteEmail(u.client_name as string, inviteUrl, actor)
          const emailed = await sendEmail(u.email as string, mail.subject, mail.text, mail.html)
          return json(res, 200, { inviteUrl, emailed, expiresAt: expires.toISOString() })
        }
      }

      return json(res, 404, { error: "Not found" })
    }

    // ════════════════════════════════════════════════════════
    // PORTAL AUTH (public)
    // ════════════════════════════════════════════════════════
    if (path === "/auth/me" && method === "GET") {
      const s = await portalSession(req)
      if (!s) return json(res, 200, { authenticated: false })
      const [u] = await sql`select pu.id, pu.email, pu.name, pu.status, c.id as client_id, c.name as client_name
        from portal_users pu join clients c on c.id = pu.client_id where pu.id = ${s.userId} and pu.client_id = ${s.clientId}`
      if (!u || u.status !== "active") { setPortalCookie(res, null); return json(res, 200, { authenticated: false }) }
      return json(res, 200, { authenticated: true, user: { id: u.id, email: u.email, name: u.name }, client: { id: u.client_id, name: u.client_name } })
    }

    if (path === "/auth/login" && method === "POST") {
      if (!validatePortalRequest(req)) return json(res, 403, { error: "Bad request origin" })
      if (rateLimited(`login:${ip}`, 30)) return json(res, 429, { error: "Too many attempts. Try again in 15 minutes." })
      const body = readBody(req)
      const email = normalizeEmail(body.email)
      const password = typeof body.password === "string" ? body.password : ""
      if (!isEmail(email) || !password) return json(res, 400, { error: "Email and password are required" })
      const [u] = await sql`select pu.id, pu.email, pu.name, pu.status, pu.password_hash, pu.client_id from portal_users pu where pu.email = ${email}`
      const ok = !!u && u.status === "active" && !!u.password_hash && (await bcrypt.compare(password, u.password_hash as string))
      if (!ok) return json(res, 401, { error: "Incorrect email or password" })
      await sql`update portal_users set last_login_at = now() where id = ${u!.id}`
      const token = await signToken(PORTAL_KEY, { kind: "portal", userId: u!.id, clientId: u!.client_id, email: u!.email, name: u!.name ?? "", expires: Date.now() + SESSION_TTL_S * 1000 } satisfies PortalSession)
      setPortalCookie(res, token)
      return json(res, 200, { ok: true })
    }

    if (path === "/auth/logout" && method === "POST") {
      setPortalCookie(res, null)
      return json(res, 200, { ok: true })
    }

    if (path === "/auth/signup" && method === "POST") {
      if (!validatePortalRequest(req)) return json(res, 403, { error: "Bad request origin" })
      if (rateLimited(`signup:${ip}`, 20)) return json(res, 429, { error: "Too many attempts. Try again later." })
      const body = readBody(req)
      const email = normalizeEmail(body.email)
      if (!isEmail(email)) return json(res, 400, { error: "Enter a valid email address" })
      const [dom] = await sql`select d.client_id, c.name from portal_client_domains d join clients c on c.id = d.client_id where d.domain = ${domainOf(email)}`
      if (!dom) return json(res, 403, { error: "That email domain isn't set up for self sign-up. Ask your Stamats contact for an invite." })
      const [existing] = await sql`select id, client_id, status from portal_users where email = ${email}`
      if (existing && existing.client_id !== dom.client_id) return json(res, 409, { error: "That email is already registered with a different workspace. Contact Stamats." })
      if (existing && existing.status === "disabled") return json(res, 403, { error: "This account has been disabled. Contact Stamats." })
      const token = newToken()
      if (existing && existing.status === "active") {
        const expires = new Date(Date.now() + RESET_TTL_MS)
        await sql`update portal_users set token_hash = ${sha256(token)}, token_purpose = 'reset', token_expires_at = ${expires}, updated_at = now() where id = ${existing.id}`
        const mail = resetEmail(`${appOrigin(req)}/portal/invite/${token}`)
        const emailed = await sendEmail(email, mail.subject, mail.text, mail.html)
        return json(res, 200, { ok: true, emailed, message: emailed ? "You already have access. We emailed you a link to set a new password." : "You already have access, but email isn't configured. Ask Stamats for a reset link." })
      }
      const expires = new Date(Date.now() + INVITE_TTL_MS)
      if (existing) {
        await sql`update portal_users set status = 'invited', token_hash = ${sha256(token)}, token_purpose = 'invite', token_expires_at = ${expires}, invited_by = 'self sign-up', invited_at = now(), updated_at = now() where id = ${existing.id}`
      } else {
        await sql`insert into portal_users (client_id, email, status, token_hash, token_purpose, token_expires_at, invited_by) values (${dom.client_id}, ${email}, 'invited', ${sha256(token)}, 'invite', ${expires}, 'self sign-up')`
      }
      const mail = inviteEmail(dom.name as string, `${appOrigin(req)}/portal/invite/${token}`, null)
      const emailed = await sendEmail(email, mail.subject, mail.text, mail.html)
      if (!emailed) return json(res, 503, { error: "We couldn't send the email right now. Ask your Stamats contact for an invite link." })
      return json(res, 200, { ok: true, emailed: true, message: `Check ${email} for a link to set your password.` })
    }

    if (path === "/auth/forgot" && method === "POST") {
      if (!validatePortalRequest(req)) return json(res, 403, { error: "Bad request origin" })
      if (rateLimited(`forgot:${ip}`, 20)) return json(res, 429, { error: "Too many attempts. Try again later." })
      const email = normalizeEmail(readBody(req).email)
      if (!isEmail(email)) return json(res, 400, { error: "Enter a valid email address" })
      const [u] = await sql`select id, status from portal_users where email = ${email}`
      // Same answer either way so addresses can't be probed.
      const generic = { ok: true, message: "If that address has access, a reset link is on its way." }
      if (!u || u.status !== "active") return json(res, 200, generic)
      const token = newToken()
      const expires = new Date(Date.now() + RESET_TTL_MS)
      await sql`update portal_users set token_hash = ${sha256(token)}, token_purpose = 'reset', token_expires_at = ${expires}, updated_at = now() where id = ${u.id}`
      const mail = resetEmail(`${appOrigin(req)}/portal/invite/${token}`)
      await sendEmail(email, mail.subject, mail.text, mail.html)
      return json(res, 200, generic)
    }

    const im = path.match(/^\/invite\/([A-Za-z0-9_-]{20,})(\/accept)?$/)
    if (im) {
      const tokenHash = sha256(im[1]!)
      const [u] = await sql`select pu.id, pu.email, pu.name, pu.status, pu.token_purpose, pu.token_expires_at, pu.client_id, c.name as client_name
        from portal_users pu join clients c on c.id = pu.client_id where pu.token_hash = ${tokenHash}`
      const live = !!u && u.status !== "disabled" && u.token_expires_at && new Date(u.token_expires_at as string).getTime() > Date.now()
      if (!im[2] && method === "GET") {
        if (!live) return json(res, 404, { error: "This link is invalid or has expired. Ask for a new one." })
        return json(res, 200, { email: u!.email, name: u!.name, clientName: u!.client_name, purpose: u!.token_purpose })
      }
      if (im[2] && method === "POST") {
        if (!validatePortalRequest(req)) return json(res, 403, { error: "Bad request origin" })
        if (rateLimited(`accept:${ip}`, 30)) return json(res, 429, { error: "Too many attempts" })
        if (!live) return json(res, 404, { error: "This link is invalid or has expired. Ask for a new one." })
        const body = readBody(req)
        const password = typeof body.password === "string" ? body.password : ""
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
        if (password.length < 8) return json(res, 400, { error: "Password must be at least 8 characters" })
        if (u!.token_purpose === "invite" && name.length < 1) return json(res, 400, { error: "Please enter your name" })
        const hash = await bcrypt.hash(password, 12)
        await sql`update portal_users set password_hash = ${hash}, name = ${name || u!.name || ""}, status = 'active',
          accepted_at = coalesce(accepted_at, now()), token_hash = null, token_purpose = null, token_expires_at = null,
          last_login_at = now(), updated_at = now() where id = ${u!.id}`
        const token = await signToken(PORTAL_KEY, { kind: "portal", userId: u!.id, clientId: u!.client_id, email: u!.email, name: name || u!.name || "", expires: Date.now() + SESSION_TTL_S * 1000 } satisfies PortalSession)
        setPortalCookie(res, token)
        return json(res, 200, { ok: true })
      }
    }

    // ════════════════════════════════════════════════════════
    // PORTAL (portal session required from here on)
    // ════════════════════════════════════════════════════════
    const session = await portalSession(req)
    if (!session) return json(res, 401, { error: "Sign in required" })
    if (method !== "GET" && !validatePortalRequest(req)) return json(res, 403, { error: "Bad request origin" })
    const clientId = session.clientId

    if (path === "/images" && method === "GET") {
      if (!supabase) return json(res, 503, { error: "Storage not configured" })
      const rows = await sql`select id, storage_key, filename, mime_type, size_bytes, width, height, created_at, user_id from portal_images where client_id = ${clientId} order by created_at desc limit 500`
      const keys = rows.map((r) => r.storage_key as string)
      const urlMap = new Map<string, string>()
      if (keys.length) {
        const { data } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrls(keys, 3600)
        for (const item of data ?? []) if (item.signedUrl && item.path) urlMap.set(item.path, item.signedUrl)
      }
      return json(res, 200, {
        images: rows.map((r) => ({
          id: r.id, filename: r.filename, mimeType: r.mime_type, sizeBytes: r.size_bytes, width: r.width, height: r.height,
          createdAt: r.created_at, mine: r.user_id === session.userId, url: urlMap.get(r.storage_key as string) ?? null,
        })),
      })
    }

    if (path === "/images" && method === "POST") {
      if (!supabase) return json(res, 503, { error: "Storage not configured" })
      if (rateLimited(`upload:${session.userId}`, 300)) return json(res, 429, { error: "Upload limit reached for now" })
      let file: Awaited<ReturnType<typeof parseMultipart>>
      try { file = await parseMultipart(req) } catch (e) { return json(res, 400, { error: (e as Error).message }) }
      if (file.buffer.length > MAX_UPLOAD_BYTES) return json(res, 413, { error: "File too large (25MB max)" })
      const mime = file.mimetype.toLowerCase().split(";")[0]!.trim()
      if (!ALLOWED_MIME.has(mime)) return json(res, 415, { error: "Only JPEG, PNG, WebP and GIF can be saved" })
      const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1]!
      const safeName = (file.fields.filename || file.filename || "image").replace(/[^\w.() -]+/g, "_").slice(0, 160) || "image"
      const key = `${clientId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from(PORTAL_BUCKET).upload(key, file.buffer, { contentType: mime, upsert: false })
      if (upErr) { console.error("[portal] upload failed:", upErr.message); return json(res, 502, { error: "Upload failed" }) }
      const width = Number(file.fields.width) || null
      const height = Number(file.fields.height) || null
      const [row] = await sql`insert into portal_images (client_id, user_id, storage_key, filename, mime_type, size_bytes, width, height)
        values (${clientId}, ${session.userId}, ${key}, ${safeName}, ${mime}, ${file.buffer.length}, ${width}, ${height}) returning id, created_at`
      const { data: signed } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrl(key, 3600)
      return json(res, 201, { image: { id: row!.id, filename: safeName, mimeType: mime, sizeBytes: file.buffer.length, width, height, createdAt: row!.created_at, mine: true, url: signed?.signedUrl ?? null } })
    }

    const imgm = path.match(/^\/images\/([^/]+)(\/download)?$/)
    if (imgm) {
      const id = imgm[1]
      if (!isUuid(id)) return json(res, 400, { error: "Invalid image id" })
      if (!supabase) return json(res, 503, { error: "Storage not configured" })
      const [row] = await sql`select id, storage_key, filename, mime_type from portal_images where id = ${id} and client_id = ${clientId}`
      if (!row) return json(res, 404, { error: "Image not found" })
      if (imgm[2] && method === "GET") {
        const { data: signed } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrl(row.storage_key as string, 600, { download: row.filename as string })
        if (!signed?.signedUrl) return json(res, 502, { error: "Could not sign download" })
        return json(res, 200, { url: signed.signedUrl })
      }
      if (!imgm[2] && method === "DELETE") {
        await supabase.storage.from(PORTAL_BUCKET).remove([row.storage_key as string])
        await sql`delete from portal_images where id = ${id} and client_id = ${clientId}`
        return json(res, 200, { ok: true })
      }
    }

    // ── AI: alt text (OpenAI vision) ──
    if (path === "/ai/alt-text" && method === "POST") {
      const ai = openai()
      if (!ai) return json(res, 503, { error: "AI not configured" })
      if (rateLimited(`ai:${session.userId}`, 120)) return json(res, 429, { error: "AI limit reached for now" })
      const { image } = readBody(req)
      if (!image || typeof image !== "string" || image.length > 4_000_000) return json(res, 400, { error: "Base64 image required" })
      try {
        const completion = await ai.chat.completions.create({
          model: PORTAL_AI_MODEL,
          messages: [{ role: "user", content: [
            { type: "text", text: "Write a concise, descriptive alt text for this image. Focus on what's visually important: people, actions, objects, setting. Keep it under 125 characters for web accessibility best practices. Return only the alt text, no quotes or explanation." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "low" } },
          ] }],
          max_completion_tokens: 100,
        })
        return json(res, 200, { altText: completion.choices[0]?.message?.content?.trim() || "" })
      } catch (err) {
        console.error("[portal] alt text failed:", (err as Error)?.message)
        return json(res, 500, { error: "Alt text generation failed" })
      }
    }

    // ── AI: enhance via Replicate (create / status / result) ──
    if (path === "/ai/enhance" && method === "POST") {
      const { image, op } = readBody(req)
      const model = typeof op === "string" ? REPLICATE_ENHANCE_MODELS[op] : undefined
      if (!image || typeof image !== "string") return json(res, 400, { error: "image (data URL) required" })
      if (!model) return json(res, 400, { error: "Unknown enhance operation" })
      if (!process.env.REPLICATE_API_TOKEN) return json(res, 503, { error: "Enhance isn't configured yet. Tell your Stamats contact." })
      if (rateLimited(`enhance:${session.userId}`, 60)) return json(res, 429, { error: "Enhance limit reached for now" })
      try {
        const create = () => fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ version: model.version, input: model.input(image) }),
          signal: AbortSignal.timeout(15000),
        })
        let r = await create()
        if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 7000)); r = await create() }
        const data = await r.json() as { id?: string; status?: string; detail?: string }
        if (!r.ok) return json(res, 502, { error: r.status === 429 ? "Enhance is busy. Wait a moment and retry." : data?.detail || "Enhance request failed" })
        return json(res, 200, { id: data.id, status: data.status })
      } catch (err) {
        const e = err as Error
        if (e?.name === "TimeoutError" || e?.name === "AbortError") return json(res, 504, { error: "Enhance timed out. Try again." })
        console.error("[portal] enhance create failed:", e?.message)
        return json(res, 500, { error: "Enhance request failed" })
      }
    }

    if ((path === "/ai/enhance-status" || path === "/ai/enhance-result") && method === "GET") {
      const id = url.searchParams.get("id") || ""
      if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json(res, 400, { error: "id required" })
      if (!process.env.REPLICATE_API_TOKEN) return json(res, 503, { error: "Enhance isn't configured yet. Tell your Stamats contact." })
      try {
        const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }, signal: AbortSignal.timeout(15000) })
        const data = await r.json() as { status?: string; error?: string; detail?: string; output?: unknown }
        if (!r.ok) return json(res, 502, { error: data?.detail || "Status check failed" })
        if (path === "/ai/enhance-status") {
          if (data.status === "failed" || data.status === "canceled") return json(res, 200, { status: data.status, error: data.error || "Enhancement failed" })
          return json(res, 200, { status: data.status })
        }
        if (data.status !== "succeeded") return json(res, 409, { error: "Result not ready" })
        const out = Array.isArray(data.output) ? data.output[data.output.length - 1] : data.output
        if (!out || typeof out !== "string") return json(res, 502, { error: "Model produced no image" })
        const imgRes = await fetch(out, { signal: AbortSignal.timeout(30000) })
        if (!imgRes.ok) return json(res, 502, { error: "Could not download result" })
        res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/png")
        return res.status(200).send(Buffer.from(await imgRes.arrayBuffer()))
      } catch (err) {
        const e = err as Error
        if (e?.name === "TimeoutError" || e?.name === "AbortError") return json(res, 504, { error: "Enhance timed out. Try again." })
        console.error("[portal] enhance status failed:", e?.message)
        return json(res, 500, { error: "Enhance status failed" })
      }
    }

    // ── AI: help assistant (toolkit questions only, no data) ──
    if (path === "/ai/help" && method === "POST") {
      const ai = openai()
      if (!ai) return json(res, 503, { error: "Help assistant isn't available right now" })
      if (rateLimited(`help:${session.userId}`, 60)) return json(res, 429, { error: "Slow down a little" })
      const body = readBody(req)
      const raw = Array.isArray(body.messages) ? body.messages : []
      const messages = raw
        .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: m.content.slice(0, 2000) }))
        .slice(-8)
      if (!messages.length || messages[messages.length - 1]!.role !== "user") return json(res, 400, { error: "A question is required" })
      try {
        const completion = await ai.chat.completions.create({
          model: PORTAL_AI_MODEL,
          messages: [{ role: "system", content: HELP_SYSTEM_PROMPT }, ...messages],
          max_completion_tokens: 400,
        })
        const reply = completion.choices[0]?.message?.content?.trim() || "I can only help with using the Image Toolkit."
        return json(res, 200, { reply })
      } catch (err) {
        console.error("[portal] help failed:", (err as Error)?.message)
        return json(res, 500, { error: "The help assistant hit a problem. Try again." })
      }
    }

    return json(res, 404, { error: "Not found" })
  } catch (err) {
    console.error("[portal] unhandled:", (err as Error)?.message)
    return json(res, 500, { error: "Something went wrong" })
  }
}
