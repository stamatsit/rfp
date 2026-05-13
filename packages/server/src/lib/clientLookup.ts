import { and, eq, sql } from "drizzle-orm"
import { db, clients, doNotContact } from "../db/index.js"

/**
 * Canonical domain validator — exported so the chip input, seed script, and
 * route handlers all use the same regex. Each label must start/end with
 * alphanumeric, no leading/trailing hyphens, no consecutive dots, TLD 2+ letters.
 */
export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/**
 * Extract a normalized domain from an email address.
 * Returns lowercase domain string, or null if malformed or domain doesn't pass DOMAIN_RE.
 */
export function extractDomain(email: string): string | null {
  if (!email) return null
  const at = email.indexOf("@")
  if (at < 0 || at === email.length - 1) return null
  const domain = email.slice(at + 1).toLowerCase().trim()
  return DOMAIN_RE.test(domain) ? domain : null
}

/**
 * Find the active client (if any) whose email_domains contains the email's domain.
 * Returns null on no match, no DB, or malformed email.
 */
export async function lookupClientByEmail(email: string) {
  if (!db) return null
  const domain = extractDomain(email)
  if (!domain) return null
  const [row] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        sql`${clients.emailDomains} @> ${JSON.stringify([domain])}::jsonb`,
      ),
    )
    .limit(1)
  return row ?? null
}

export async function listActiveClients() {
  if (!db) return []
  return db.select().from(clients).where(eq(clients.status, "active"))
}

/**
 * Returns the DNC entry that suppresses this email's domain, or null if not suppressed.
 * Important: matches by DOMAIN, not email — per the org-wide suppression decision.
 * The returned entry's email may not be the email passed in; it's whichever entry
 * caused the domain match.
 */
export async function isDoNotContact(email: string) {
  if (!db) return null
  const domain = extractDomain(email)
  if (!domain) return null
  const [row] = await db
    .select()
    .from(doNotContact)
    .where(eq(doNotContact.domain, domain))
    .limit(1)
  return row ?? null
}
