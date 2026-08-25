/**
 * Password-reset tokens and delivery.
 *
 * Tokens are stateless (no DB table): an HMAC over the user id, an expiry, and a
 * slice of the user's CURRENT password hash, signed with SESSION_SECRET. Because
 * the current hash is baked in, the token stops validating the instant the
 * password changes — so it is single-use and self-invalidating without any
 * server-side storage. Same idea as Django's default reset token.
 */
import crypto from "node:crypto"

const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour
const RESET_SENDER = process.env.RESET_EMAIL_FROM || "Stamats Lab <ai@stamats.com>"

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSWORD
  if (!s) throw new Error("SESSION_SECRET is required to sign reset tokens")
  return s
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url")
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url")
}

/**
 * Build a reset token for a user. `passwordHash` is the user's current bcrypt
 * hash — embedding a slice of it is what makes the token single-use.
 */
export function signResetToken(userId: string, passwordHash: string, now = Date.now()): string {
  const expires = now + RESET_TTL_MS
  // A short, stable fingerprint of the current password. Changing the password
  // changes the hash, which changes this fingerprint, which invalidates the token.
  const pwFingerprint = crypto.createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16)
  const body = `${userId}.${expires}.${pwFingerprint}`
  return `${b64url(body)}.${sign(body)}`
}

export interface ResetTokenClaims {
  userId: string
  expires: number
  pwFingerprint: string
}

/** Verify signature + expiry. Returns claims or null. Does NOT check the password fingerprint — the caller does, against the live hash. */
export function parseResetToken(token: string, now = Date.now()): ResetTokenClaims | null {
  if (typeof token !== "string" || !token.includes(".")) return null
  const lastDot = token.lastIndexOf(".")
  const bodyB64 = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  let body: string
  try {
    body = Buffer.from(bodyB64, "base64url").toString("utf8")
  } catch {
    return null
  }
  const expected = sign(body)
  // Constant-time comparison.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const [userId, expiresStr, pwFingerprint] = body.split(".")
  const expires = Number(expiresStr)
  if (!userId || !pwFingerprint || !Number.isFinite(expires)) return null
  if (now > expires) return null
  return { userId, expires, pwFingerprint }
}

/** Recompute the fingerprint for a live hash so the caller can confirm the token is still valid (not already used). */
export function passwordFingerprint(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16)
}

/**
 * Send the reset email via Resend. Degrades gracefully: with no RESEND_API_KEY
 * it logs the link and resolves, so the flow works in dev without email set up.
 * Returns whether an email was actually dispatched.
 */
export async function sendResetEmail(to: string, name: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[password-reset] RESEND_API_KEY not set — reset link for ${to}: ${resetUrl}`)
    return false
  }

  const firstName = (name || "there").split(" ")[0]
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1e">
      <h2 style="font-size:18px;color:#0f172a">Reset your Stamats Lab password</h2>
      <p style="font-size:14px;color:#475569;line-height:1.6">Hi ${firstName}, we received a request to reset your password. Click below to choose a new one. This link expires in 1 hour.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#0891b2;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">Reset password</a>
      </p>
      <p style="font-size:12px;color:#94a3b8;line-height:1.6">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <p style="font-size:12px;color:#94a3b8;word-break:break-all">Or paste this link into your browser:<br>${resetUrl}</p>
    </div>`.trim()
  const text = `Hi ${firstName},\n\nReset your Stamats Lab password with this link (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESET_SENDER, to, subject: "Reset your Stamats Lab password", html, text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error("[password-reset] Resend send failed:", res.status, (await res.text()).slice(0, 200))
      return false
    }
    return true
  } catch (err) {
    console.error("[password-reset] Resend send error:", (err as Error)?.message)
    return false
  }
}
