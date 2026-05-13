import { db, auditLog } from "../db/index.js"
import type { AuditActionType, AuditEntityType } from "../types/index.js"
import type { DoNotContactEntry } from "../db/schema.js"

/**
 * Drizzle transaction handle type — derived so we don't depend on internal Drizzle types.
 */
type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0]

export interface LogAuditParams {
  actionType: AuditActionType
  entityType: AuditEntityType
  entityId?: string
  details?: Record<string, unknown>
  actor?: string
}

/**
 * Log an action to the audit log
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  if (!db) {
    console.warn("Audit log skipped - database not available")
    return
  }

  const { actionType, entityType, entityId, details, actor = "local" } = params

  try {
    await db.insert(auditLog).values({
      actionType,
      entityType,
      entityId,
      details,
      actor,
    })
  } catch (error) {
    console.error("Failed to log audit entry:", error)
    // Don't throw - audit logging should not break main operations
  }
}

/**
 * Log an import action
 */
export async function logImport(details: {
  filename: string
  totalRows: number
  imported: number
  updated: number
  skipped: number
  issues: number
}): Promise<void> {
  await logAudit({
    actionType: "IMPORT",
    entityType: "SYSTEM",
    details,
  })
}

/**
 * Log an edit action
 */
export async function logEdit(
  entityType: "ANSWER" | "PHOTO",
  entityId: string,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<void> {
  await logAudit({
    actionType: "EDIT",
    entityType,
    entityId,
    details: { changes },
  })
}

/**
 * Log a rename action (specifically for photos)
 */
export async function logRename(
  photoId: string,
  oldTitle: string,
  newTitle: string
): Promise<void> {
  await logAudit({
    actionType: "RENAME",
    entityType: "PHOTO",
    entityId: photoId,
    details: { oldTitle, newTitle },
  })
}

/**
 * Log a download action
 */
export async function logDownload(photoId: string): Promise<void> {
  await logAudit({
    actionType: "DOWNLOAD",
    entityType: "PHOTO",
    entityId: photoId,
  })
}

/**
 * Log a copy action
 */
export async function logCopy(answerId: string): Promise<void> {
  await logAudit({
    actionType: "COPY",
    entityType: "ANSWER",
    entityId: answerId,
  })
}

/**
 * Log a link action
 */
export async function logLink(answerId: string, photoId: string): Promise<void> {
  await logAudit({
    actionType: "LINK",
    entityType: "ANSWER",
    entityId: answerId,
    details: { linkedPhotoId: photoId },
  })
}

/**
 * Log an unlink action
 */
export async function logUnlink(answerId: string, photoId: string): Promise<void> {
  await logAudit({
    actionType: "UNLINK",
    entityType: "ANSWER",
    entityId: answerId,
    details: { unlinkedPhotoId: photoId },
  })
}

/**
 * Log an AI request
 */
export async function logAIRequest(details: {
  query: string
  sourceIds: string[]
  refused: boolean
  refusalReason?: string
}): Promise<void> {
  await logAudit({
    actionType: "AI_REQUEST",
    entityType: "SYSTEM",
    details,
  })
}

/**
 * Log a Do Not Contact entry deletion.
 *
 * Unlike logAudit (which swallows errors so audit failures don't break main ops),
 * this MUST throw on failure so the surrounding transaction rolls back. The DNC
 * delete and the audit row must commit together — otherwise we lose the "why was
 * X ever on the list" record.
 *
 * Date fields on `snapshot` are serialized to ISO strings before going into
 * the details jsonb — postgres-js will serialize a raw `Date` as `{}` otherwise.
 */
export async function logDoNotContactDelete(
  tx: Tx,
  snapshot: DoNotContactEntry,
  deletedBy: string,
): Promise<void> {
  const details: Record<string, unknown> = {
    email: snapshot.email,
    domain: snapshot.domain,
    institution: snapshot.institution,
    comment: snapshot.comment,
    clientId: snapshot.clientId,
    createdAt: snapshot.createdAt instanceof Date ? snapshot.createdAt.toISOString() : snapshot.createdAt,
    createdBy: snapshot.createdBy,
    deletedAt: new Date().toISOString(),
    deletedBy,
  }
  await tx.insert(auditLog).values({
    actionType: "DELETE",
    entityType: "DO_NOT_CONTACT",
    entityId: snapshot.id,
    details,
    actor: deletedBy,
  })
}
