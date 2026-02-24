/**
 * Saved Documents Service
 * Manages RFPs and Proposals that users save for reference
 */

import { eq, desc, ilike, or, sql } from "drizzle-orm"
import { db, savedDocuments, type SavedDocument } from "../db/index.js"

export interface SaveDocumentInput {
  name: string
  type: "RFP" | "Proposal" | "Other"
  originalFilename: string
  mimeType?: string
  fileSize?: number
  pageCount?: number
  extractedText: string
  notes?: string
  tags?: string[]
  userId?: string
  uploaderName?: string
}

export interface UpdateDocumentInput {
  name?: string
  type?: "RFP" | "Proposal" | "Other"
  notes?: string
  tags?: string[]
}

export interface ListDocumentsParams {
  type?: "RFP" | "Proposal" | "Other"
  search?: string
  limit?: number
  offset?: number
}

/**
 * Save a new document
 */
export async function saveDocument(input: SaveDocumentInput): Promise<SavedDocument> {
  if (!db) throw new Error("Database not connected")

  const [doc] = await db
    .insert(savedDocuments)
    .values({
      name: input.name,
      type: input.type,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      pageCount: input.pageCount,
      extractedText: input.extractedText,
      notes: input.notes,
      tags: input.tags ?? [],
      userId: input.userId,
      uploaderName: input.uploaderName,
    })
    .returning()

  if (!doc) throw new Error("Failed to save document")
  return doc
}

/**
 * Get a document by ID
 */
export async function getDocumentById(id: string): Promise<SavedDocument | null> {
  if (!db) throw new Error("Database not connected")

  const [doc] = await db.select().from(savedDocuments).where(eq(savedDocuments.id, id))
  return doc ?? null
}

/**
 * List documents with optional filtering
 */
export async function listDocuments(params: ListDocumentsParams = {}): Promise<{
  documents: SavedDocument[]
  total: number
}> {
  if (!db) throw new Error("Database not connected")

  const { type, search, limit = 50, offset = 0 } = params

  // Build conditions
  const conditions = []
  if (type) {
    conditions.push(eq(savedDocuments.type, type))
  }
  if (search) {
    conditions.push(
      or(
        ilike(savedDocuments.name, `%${search}%`),
        ilike(savedDocuments.originalFilename, `%${search}%`)
      )
    )
  }

  // Get documents
  let query = db.select().from(savedDocuments).orderBy(desc(savedDocuments.createdAt))

  if (conditions.length > 0) {
    const combined = conditions.length === 1 ? conditions[0]! : sql`${conditions[0]} AND ${conditions[1]}`
    query = query.where(combined) as typeof query
  }

  const documents = await query.limit(limit).offset(offset)

  // Get total count
  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedDocuments)

  if (conditions.length > 0) {
    const combined = conditions.length === 1 ? conditions[0]! : sql`${conditions[0]} AND ${conditions[1]}`
    countQuery = countQuery.where(combined) as typeof countQuery
  }

  const [countResult] = await countQuery
  const total = countResult?.count ?? 0

  return { documents, total }
}

/**
 * Update a document
 */
export async function updateDocument(
  id: string,
  input: UpdateDocumentInput
): Promise<SavedDocument | null> {
  if (!db) throw new Error("Database not connected")

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (input.name !== undefined) updateData.name = input.name
  if (input.type !== undefined) updateData.type = input.type
  if (input.notes !== undefined) updateData.notes = input.notes
  if (input.tags !== undefined) updateData.tags = input.tags

  const [doc] = await db
    .update(savedDocuments)
    .set(updateData)
    .where(eq(savedDocuments.id, id))
    .returning()

  return doc ?? null
}

/**
 * Delete a document
 */
export async function deleteDocument(id: string): Promise<boolean> {
  if (!db) throw new Error("Database not connected")

  const result = await db.delete(savedDocuments).where(eq(savedDocuments.id, id)).returning()
  return result.length > 0
}
