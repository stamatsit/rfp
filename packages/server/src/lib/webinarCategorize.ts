import { extractDomain, lookupClientByEmail, isDoNotContact } from "./clientLookup.js"

export type WebinarCategory = "do-not-contact" | "client" | "employee" | "non-client"

export interface CategorizeResult {
  category: WebinarCategory
  clientId: string | null
}

/**
 * Determine the category for a webinar registrant.
 * Precedence (DNC wins): Do Not Contact → Client → Employee (@stamats.com) → Non-Client.
 *
 * Returns `clientId` only when category === "client" (the resolved client row's id).
 */
export async function categorizeEmail(email: string): Promise<CategorizeResult> {
  const dnc = await isDoNotContact(email)
  if (dnc) return { category: "do-not-contact", clientId: dnc.clientId }

  const client = await lookupClientByEmail(email)
  if (client) return { category: "client", clientId: client.id }

  const domain = extractDomain(email)
  if (domain === "stamats.com") return { category: "employee", clientId: null }

  return { category: "non-client", clientId: null }
}
