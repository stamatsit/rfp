import { Router, type Request, type Response } from "express"
import { eq } from "drizzle-orm"
import { db, doNotContact, clients } from "../db/index.js"
import { requireWriteAccess } from "../middleware/auth.js"
import { extractDomain } from "../lib/clientLookup.js"
import { logDoNotContactDelete } from "../services/auditService.js"

export const doNotContactRouter = Router()

// GET /api/client-success/do-not-contact — list all DNC entries
doNotContactRouter.get("/", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(doNotContact).orderBy(doNotContact.createdAt)
    return res.json(rows)
  } catch (error) {
    console.error("Failed to list DNC entries:", error)
    return res.status(500).json({ error: "Failed to list DNC entries" })
  }
})

// POST /api/client-success/do-not-contact — add an entry
doNotContactRouter.post("/", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { email, institution, comment, clientId } = req.body ?? {}

    const domain = typeof email === "string" ? extractDomain(email) : null
    if (!domain) {
      return res.status(400).json({ error: "Invalid email — domain must be a valid format" })
    }
    if (typeof institution !== "string" || institution.trim() === "") {
      return res.status(400).json({ error: "Institution name is required" })
    }
    if (clientId != null) {
      if (typeof clientId !== "string") {
        return res.status(400).json({ error: "Invalid clientId" })
      }
      const [clientRow] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
      if (!clientRow) {
        return res.status(400).json({ error: "Linked client not found" })
      }
    }

    const createdBy = (req.session as any)?.userName || "unknown"

    try {
      const [row] = await db.insert(doNotContact).values({
        email: email.trim(),
        domain,
        institution: institution.trim(),
        comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
        clientId: clientId ?? null,
        createdBy,
      }).returning()
      return res.status(201).json(row)
    } catch (e: any) {
      if (e?.code === "23505") {
        return res.status(409).json({ error: "A DNC entry already exists for this email" })
      }
      throw e
    }
  } catch (error) {
    console.error("Failed to create DNC entry:", error)
    return res.status(500).json({ error: "Failed to create DNC entry" })
  }
})

// DELETE /api/client-success/do-not-contact/:id — remove an entry (audit + delete in transaction)
doNotContactRouter.delete("/:id", requireWriteAccess, async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const id = req.params.id!
    const deletedBy = (req.session as any)?.userName || "unknown"
    const safeDb = db

    const [existing] = await safeDb.select().from(doNotContact).where(eq(doNotContact.id, id)).limit(1)
    if (!existing) return res.status(404).json({ error: "DNC entry not found" })

    await safeDb.transaction(async (tx) => {
      await logDoNotContactDelete(tx, existing, deletedBy)
      await tx.delete(doNotContact).where(eq(doNotContact.id, id))
    })

    return res.status(204).end()
  } catch (error) {
    console.error("Failed to delete DNC entry:", error)
    return res.status(500).json({ error: "Failed to delete DNC entry" })
  }
})
