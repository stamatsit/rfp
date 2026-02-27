import { eq, sql } from "drizzle-orm"
import {
  db,
  answerItems,
  answerItemVersions,
  linksAnswerPhoto,
  type AnswerItem,
  type NewAnswerItem,
  type AnswerItemVersion,
} from "../db/index.js"
import { generateFingerprint, normalizeTags, isMateriallyDifferent } from "../lib/utils.js"
import { logEdit } from "./auditService.js"
import type { ImportIssue } from "../types/index.js"

export interface AnswerWithMeta extends AnswerItem {
  linkedPhotosCount?: number
}

export interface UpsertAnswerResult {
  answer: AnswerItem
  isNew: boolean
  versionNumber: number
  issue?: ImportIssue
}

/**
 * Get all answers with optional filters
 * Uses a single aggregated query to avoid N+1 performance issues
 */
export async function getAnswers(filters?: {
  topicId?: string
  status?: "Approved" | "Draft"
  limit?: number
  offset?: number
}): Promise<AnswerWithMeta[]> {
  if (!db) throw new Error("Database not available")

  // Build conditions
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters?.topicId) {
    conditions.push(`a.topic_id = $${params.length + 1}`)
    params.push(filters.topicId)
  }

  if (filters?.status) {
    conditions.push(`a.status = $${params.length + 1}`)
    params.push(filters.status)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : ""
  const offsetClause = filters?.offset ? `OFFSET ${filters.offset}` : ""

  // Single query with LEFT JOIN and GROUP BY for linked photos count
  const results = await db.execute(sql.raw(`
    SELECT
      a.*,
      COALESCE(COUNT(l.photo_asset_id), 0)::int as linked_photos_count
    FROM answer_items a
    LEFT JOIN links_answer_photo l ON a.id = l.answer_item_id
    ${whereClause}
    GROUP BY a.id
    ORDER BY a.created_at DESC
    ${limitClause}
    ${offsetClause}
  `))

  // Map results to AnswerWithMeta (raw SQL returns snake_case columns)
  // PostgreSQL may return JSON as strings, so we need to parse them
  return (results as unknown as Array<Record<string, unknown>>).map((row) => {
    const tags = row.tags
    const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags
    return {
      id: row.id as string,
      question: row.question as string,
      answer: row.answer as string,
      topicId: (row.topic_id ?? row.topicId) as string,
      subtopic: row.subtopic as string | null,
      status: row.status as "Approved" | "Draft",
      tags: parsedTags as string[] | null,
      fingerprint: row.fingerprint as string,
      createdAt: (row.created_at ?? row.createdAt) as Date,
      updatedAt: (row.updated_at ?? row.updatedAt) as Date,
      linkedPhotosCount: row.linked_photos_count as number,
    }
  })
}

/**
 * Get a single answer by ID
 */
export async function getAnswerById(id: string): Promise<AnswerWithMeta | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db.select().from(answerItems).where(eq(answerItems.id, id)).limit(1)

  if (!result[0]) return undefined

  const linksCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(linksAnswerPhoto)
    .where(eq(linksAnswerPhoto.answerItemId, id))

  return {
    ...result[0],
    linkedPhotosCount: linksCount[0]?.count ?? 0,
  }
}

/**
 * Get answer by fingerprint
 */
export async function getAnswerByFingerprint(fingerprint: string): Promise<AnswerItem | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select()
    .from(answerItems)
    .where(eq(answerItems.fingerprint, fingerprint))
    .limit(1)

  return result[0]
}

/**
 * Get version history for an answer
 */
export async function getAnswerVersions(answerItemId: string): Promise<AnswerItemVersion[]> {
  if (!db) throw new Error("Database not available")

  return db
    .select()
    .from(answerItemVersions)
    .where(eq(answerItemVersions.answerItemId, answerItemId))
    .orderBy(answerItemVersions.versionNumber)
}

/**
 * Get the latest version number for an answer
 */
async function getLatestVersionNumber(answerItemId: string): Promise<number> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version_number), 0)` })
    .from(answerItemVersions)
    .where(eq(answerItemVersions.answerItemId, answerItemId))

  return result[0]?.maxVersion ?? 0
}

/**
 * Create a version record for an answer
 */
async function createAnswerVersion(
  answer: AnswerItem,
  versionNumber: number,
  createdBy = "local",
  forkedToId?: string
): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(answerItemVersions).values({
    answerItemId: answer.id,
    question: answer.question,
    answer: answer.answer,
    topicId: answer.topicId,
    subtopic: answer.subtopic,
    status: answer.status,
    tags: answer.tags,
    versionNumber,
    createdBy,
    ...(forkedToId ? { forkedToId } : {}),
  })
}

/**
 * Create a new answer
 */
export async function createAnswer(data: {
  question: string
  answer: string
  topicId: string
  topicName: string // needed for fingerprint
  subtopic?: string
  status?: "Approved" | "Draft"
  tags?: string[]
  createdBy?: string
}): Promise<AnswerItem> {
  if (!db) throw new Error("Database not available")

  const fingerprint = generateFingerprint(data.question, data.topicName)
  const normalizedTags = data.tags ? normalizeTags(data.tags) : []

  const newAnswer: NewAnswerItem = {
    question: data.question.trim(),
    answer: data.answer.trim(),
    topicId: data.topicId,
    subtopic: data.subtopic?.trim(),
    status: data.status ?? "Approved",
    tags: normalizedTags,
    fingerprint,
  }

  const result = await db.insert(answerItems).values(newAnswer).returning()

  if (!result[0]) {
    throw new Error("Failed to create answer")
  }

  // Create initial version
  await createAnswerVersion(result[0], 1, data.createdBy)

  return result[0]
}

/**
 * Update an existing answer and create a new version
 */
export async function updateAnswer(
  id: string,
  data: {
    question?: string
    answer?: string
    topicId?: string
    topicName?: string
    subtopic?: string
    status?: "Approved" | "Draft"
    tags?: string[]
    createdBy?: string
  }
): Promise<AnswerItem> {
  if (!db) throw new Error("Database not available")

  const existing = await getAnswerById(id)
  if (!existing) {
    throw new Error(`Answer not found: ${id}`)
  }

  // Build update object
  const updates: Partial<AnswerItem> = {}
  const changes: Record<string, { old: unknown; new: unknown }> = {}

  if (data.question !== undefined && data.question !== existing.question) {
    updates.question = data.question.trim()
    changes.question = { old: existing.question, new: updates.question }
  }

  if (data.answer !== undefined && data.answer !== existing.answer) {
    updates.answer = data.answer.trim()
    changes.answer = { old: existing.answer, new: updates.answer }
  }

  if (data.topicId !== undefined && data.topicId !== existing.topicId) {
    updates.topicId = data.topicId
    changes.topicId = { old: existing.topicId, new: updates.topicId }
  }

  if (data.subtopic !== undefined && data.subtopic !== existing.subtopic) {
    updates.subtopic = data.subtopic?.trim()
    changes.subtopic = { old: existing.subtopic, new: updates.subtopic }
  }

  if (data.status !== undefined && data.status !== existing.status) {
    updates.status = data.status
    changes.status = { old: existing.status, new: updates.status }
  }

  if (data.tags !== undefined) {
    const normalizedTags = normalizeTags(data.tags)
    if (JSON.stringify(normalizedTags) !== JSON.stringify(existing.tags)) {
      updates.tags = normalizedTags
      changes.tags = { old: existing.tags, new: updates.tags }
    }
  }

  // Regenerate fingerprint if question or topic changed
  if ((data.question || data.topicName) && data.topicName) {
    updates.fingerprint = generateFingerprint(
      data.question ?? existing.question,
      data.topicName
    )
  }

  if (Object.keys(updates).length === 0) {
    return existing // No changes
  }

  updates.updatedAt = new Date()

  // Update the answer
  const result = await db
    .update(answerItems)
    .set(updates)
    .where(eq(answerItems.id, id))
    .returning()

  if (!result[0]) {
    throw new Error("Failed to update answer")
  }

  // Create new version
  const versionNumber = (await getLatestVersionNumber(id)) + 1
  await createAnswerVersion(result[0], versionNumber, data.createdBy)

  // Log the edit
  await logEdit("ANSWER", id, changes)

  return result[0]
}

/**
 * Upsert an answer - used during import
 * - If fingerprint doesn't exist: create new
 * - If fingerprint exists: update and version
 * - If fingerprint exists but content is materially different: flag for review
 */
export async function upsertAnswer(
  data: {
    question: string
    answer: string
    topicId: string
    topicName: string
    subtopic?: string
    tags?: string[]
  },
  rowNumber: number
): Promise<UpsertAnswerResult> {
  if (!db) throw new Error("Database not available")

  const fingerprint = generateFingerprint(data.question, data.topicName)

  // Check if answer exists
  const existing = await getAnswerByFingerprint(fingerprint)

  if (!existing) {
    // Create new answer
    const answer = await createAnswer({
      ...data,
      status: "Approved",
    })

    return {
      answer,
      isNew: true,
      versionNumber: 1,
    }
  }

  // Check for material differences (potential collision)
  if (isMateriallyDifferent(existing.answer, data.answer)) {
    // Return existing but flag as potential collision
    return {
      answer: existing,
      isNew: false,
      versionNumber: await getLatestVersionNumber(existing.id),
      issue: {
        row: rowNumber,
        type: "collision",
        message: `Question matches existing entry but answer is significantly different. Review needed.`,
      },
    }
  }

  // Update existing answer
  const updated = await updateAnswer(existing.id, {
    answer: data.answer,
    topicId: data.topicId,
    topicName: data.topicName,
    subtopic: data.subtopic,
    tags: data.tags,
  })

  const versionNumber = await getLatestVersionNumber(existing.id)

  return {
    answer: updated,
    isNew: false,
    versionNumber,
  }
}

/**
 * Fork an answer — create a new entry with edited content, then write a
 * fork version record on the original pointing to the new entry's ID.
 */
export async function forkAnswer(
  sourceId: string,
  data: {
    question: string
    answer: string
    topicId: string
    topicName: string
    subtopic?: string
    status?: "Approved" | "Draft"
    tags?: string[]
    createdBy?: string
  }
): Promise<AnswerItem> {
  if (!db) throw new Error("Database not available")

  const source = await getAnswerById(sourceId)
  if (!source) throw new Error(`Answer not found: ${sourceId}`)

  // Create the new entry
  const newAnswer = await createAnswer(data)

  // Write a fork version record on the source so history shows the fork
  const versionNumber = (await getLatestVersionNumber(sourceId)) + 1
  await createAnswerVersion(source, versionNumber, data.createdBy, newAnswer.id)

  return newAnswer
}

/**
 * Delete an answer (cascades to versions and links)
 */
export async function deleteAnswer(id: string): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.delete(answerItems).where(eq(answerItems.id, id))
}

/**
 * Full-text search answers
 * Uses a single aggregated query to avoid N+1 performance issues
 */
export async function searchAnswers(
  query: string,
  filters?: {
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
  }
): Promise<AnswerWithMeta[]> {
  if (!db) throw new Error("Database not available")

  // Use Postgres full-text search
  const searchQuery = query
    .trim()
    .split(/\s+/)
    .map((word) => `${word}:*`)
    .join(" & ")

  // Build filter conditions
  let filterConditions = ""
  if (filters?.topicId) {
    filterConditions += ` AND a.topic_id = '${filters.topicId}'`
  }
  if (filters?.status) {
    filterConditions += ` AND a.status = '${filters.status}'`
  }

  const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : ""

  // Single query with LEFT JOIN and GROUP BY
  const results = await db.execute(sql`
    SELECT
      a.*,
      ts_rank(to_tsvector('english', a.question || ' ' || a.answer), to_tsquery('english', ${searchQuery})) as rank,
      COALESCE(COUNT(l.photo_asset_id), 0)::int as linked_photos_count
    FROM answer_items a
    LEFT JOIN links_answer_photo l ON a.id = l.answer_item_id
    WHERE to_tsvector('english', a.question || ' ' || a.answer) @@ to_tsquery('english', ${searchQuery})
    ${sql.raw(filterConditions)}
    GROUP BY a.id
    ORDER BY rank DESC
    ${sql.raw(limitClause)}
  `)

  // Map results to AnswerWithMeta (raw SQL returns snake_case columns)
  // PostgreSQL may return JSON as strings, so we need to parse them
  return (results as unknown as Array<Record<string, unknown>>).map((row) => {
    const tags = row.tags
    const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags
    return {
      id: row.id as string,
      question: row.question as string,
      answer: row.answer as string,
      topicId: (row.topic_id ?? row.topicId) as string,
      subtopic: row.subtopic as string | null,
      status: row.status as "Approved" | "Draft",
      tags: parsedTags as string[] | null,
      fingerprint: row.fingerprint as string,
      createdAt: (row.created_at ?? row.createdAt) as Date,
      updatedAt: (row.updated_at ?? row.updatedAt) as Date,
      linkedPhotosCount: row.linked_photos_count as number,
    }
  })
}
