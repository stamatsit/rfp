import { eq, sql } from "drizzle-orm"
import {
  db,
  photoAssets,
  photoAssetVersions,
  linksAnswerPhoto,
  type PhotoAsset,
  type NewPhotoAsset,
  type PhotoAssetVersion,
} from "../db/index.js"
import { normalizeTags, generateStorageKey, sanitizeFilenameForDisplay } from "../lib/utils.js"
import { logEdit, logRename, logDownload } from "./auditService.js"

export interface PhotoWithMeta extends PhotoAsset {
  linkedAnswersCount?: number
}

/**
 * Get all photos with optional filters
 * Uses a single aggregated query to avoid N+1 performance issues
 */
export async function getPhotos(filters?: {
  topicId?: string
  status?: "Approved" | "Draft"
  limit?: number
  offset?: number
}): Promise<PhotoWithMeta[]> {
  if (!db) throw new Error("Database not available")

  // Build conditions
  const conditions: string[] = []

  if (filters?.topicId) {
    conditions.push(`p.topic_id = '${filters.topicId}'`)
  }

  if (filters?.status) {
    conditions.push(`p.status = '${filters.status}'`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : ""
  const offsetClause = filters?.offset ? `OFFSET ${filters.offset}` : ""

  // Single query with LEFT JOIN and GROUP BY for linked answers count
  const results = await db.execute(sql.raw(`
    SELECT
      p.*,
      COALESCE(COUNT(l.answer_item_id), 0)::int as linked_answers_count
    FROM photo_assets p
    LEFT JOIN links_answer_photo l ON p.id = l.photo_asset_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    ${limitClause}
    ${offsetClause}
  `))

  // Map results to PhotoWithMeta (raw SQL returns snake_case columns)
  // PostgreSQL may return JSON as strings, so we need to parse them
  return (results as unknown as Array<Record<string, unknown>>).map((row) => {
    const tags = row.tags
    const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags
    return {
      id: row.id as string,
      displayTitle: (row.display_title ?? row.displayTitle) as string,
      topicId: (row.topic_id ?? row.topicId) as string,
      status: row.status as "Approved" | "Draft",
      tags: parsedTags as string[] | null,
      description: row.description as string | null,
      storageKey: (row.storage_key ?? row.storageKey) as string,
      originalFilename: (row.original_filename ?? row.originalFilename) as string,
      fileSize: (row.file_size ?? row.fileSize) as number | null,
      mimeType: (row.mime_type ?? row.mimeType) as string | null,
      createdAt: (row.created_at ?? row.createdAt) as Date,
      updatedAt: (row.updated_at ?? row.updatedAt) as Date,
      linkedAnswersCount: row.linked_answers_count as number,
    }
  })
}

/**
 * Get a single photo by ID
 */
export async function getPhotoById(id: string): Promise<PhotoWithMeta | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db.select().from(photoAssets).where(eq(photoAssets.id, id)).limit(1)

  if (!result[0]) return undefined

  const linksCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(linksAnswerPhoto)
    .where(eq(linksAnswerPhoto.photoAssetId, id))

  return {
    ...result[0],
    linkedAnswersCount: linksCount[0]?.count ?? 0,
  }
}

/**
 * Get photo by storage key
 */
export async function getPhotoByStorageKey(storageKey: string): Promise<PhotoAsset | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select()
    .from(photoAssets)
    .where(eq(photoAssets.storageKey, storageKey))
    .limit(1)

  return result[0]
}

/**
 * Get version history for a photo
 */
export async function getPhotoVersions(photoAssetId: string): Promise<PhotoAssetVersion[]> {
  if (!db) throw new Error("Database not available")

  return db
    .select()
    .from(photoAssetVersions)
    .where(eq(photoAssetVersions.photoAssetId, photoAssetId))
    .orderBy(photoAssetVersions.versionNumber)
}

/**
 * Get the latest version number for a photo
 */
async function getLatestVersionNumber(photoAssetId: string): Promise<number> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version_number), 0)` })
    .from(photoAssetVersions)
    .where(eq(photoAssetVersions.photoAssetId, photoAssetId))

  return result[0]?.maxVersion ?? 0
}

/**
 * Create a version record for a photo
 */
async function createPhotoVersion(
  photo: PhotoAsset,
  versionNumber: number,
  createdBy = "local"
): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(photoAssetVersions).values({
    photoAssetId: photo.id,
    displayTitle: photo.displayTitle,
    topicId: photo.topicId,
    status: photo.status,
    tags: photo.tags,
    description: photo.description,
    versionNumber,
    createdBy,
  })
}

/**
 * Create a new photo asset
 * Note: This creates the database record. File upload is handled separately.
 */
export async function createPhoto(data: {
  originalFilename: string
  topicId: string
  displayTitle?: string
  status?: "Approved" | "Draft"
  tags?: string[]
  description?: string
  fileSize?: number
  mimeType?: string
  createdBy?: string
}): Promise<PhotoAsset> {
  if (!db) throw new Error("Database not available")

  const storageKey = generateStorageKey()
  const displayTitle = data.displayTitle || sanitizeFilenameForDisplay(data.originalFilename)
  const normalizedTags = data.tags ? normalizeTags(data.tags) : []

  const newPhoto: NewPhotoAsset = {
    displayTitle: displayTitle.trim(),
    topicId: data.topicId,
    status: data.status ?? "Approved",
    tags: normalizedTags,
    description: data.description?.trim(),
    storageKey,
    originalFilename: data.originalFilename,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
  }

  const result = await db.insert(photoAssets).values(newPhoto).returning()

  if (!result[0]) {
    throw new Error("Failed to create photo")
  }

  // Create initial version
  await createPhotoVersion(result[0], 1, data.createdBy)

  return result[0]
}

/**
 * Update a photo's metadata and create a new version
 * Note: storageKey is NEVER updated - it's immutable
 */
export async function updatePhoto(
  id: string,
  data: {
    displayTitle?: string
    topicId?: string
    status?: "Approved" | "Draft"
    tags?: string[]
    description?: string
    createdBy?: string
  }
): Promise<PhotoAsset> {
  if (!db) throw new Error("Database not available")

  const existing = await getPhotoById(id)
  if (!existing) {
    throw new Error(`Photo not found: ${id}`)
  }

  // Build update object
  const updates: Partial<PhotoAsset> = {}
  const changes: Record<string, { old: unknown; new: unknown }> = {}

  if (data.displayTitle !== undefined && data.displayTitle !== existing.displayTitle) {
    updates.displayTitle = data.displayTitle.trim()
    changes.displayTitle = { old: existing.displayTitle, new: updates.displayTitle }
  }

  if (data.topicId !== undefined && data.topicId !== existing.topicId) {
    updates.topicId = data.topicId
    changes.topicId = { old: existing.topicId, new: updates.topicId }
  }

  if (data.status !== undefined && data.status !== existing.status) {
    updates.status = data.status
    changes.status = { old: existing.status, new: updates.status }
  }

  if (data.description !== undefined && data.description !== existing.description) {
    updates.description = data.description?.trim()
    changes.description = { old: existing.description, new: updates.description }
  }

  if (data.tags !== undefined) {
    const normalizedTags = normalizeTags(data.tags)
    if (JSON.stringify(normalizedTags) !== JSON.stringify(existing.tags)) {
      updates.tags = normalizedTags
      changes.tags = { old: existing.tags, new: updates.tags }
    }
  }

  if (Object.keys(updates).length === 0) {
    return existing // No changes
  }

  updates.updatedAt = new Date()

  // Update the photo
  const result = await db
    .update(photoAssets)
    .set(updates)
    .where(eq(photoAssets.id, id))
    .returning()

  if (!result[0]) {
    throw new Error("Failed to update photo")
  }

  // Create new version
  const versionNumber = (await getLatestVersionNumber(id)) + 1
  await createPhotoVersion(result[0], versionNumber, data.createdBy)

  // Log the edit
  await logEdit("PHOTO", id, changes)

  return result[0]
}

/**
 * Rename a photo (convenience method that updates displayTitle only)
 * IMPORTANT: This does NOT change the storageKey - links remain intact
 */
export async function renamePhoto(id: string, newTitle: string): Promise<PhotoAsset> {
  if (!db) throw new Error("Database not available")

  const existing = await getPhotoById(id)
  if (!existing) {
    throw new Error(`Photo not found: ${id}`)
  }

  const oldTitle = existing.displayTitle

  const result = await updatePhoto(id, { displayTitle: newTitle })

  // Log specifically as a rename
  await logRename(id, oldTitle, newTitle)

  return result
}

/**
 * Record a download event (for audit logging)
 */
export async function recordDownload(id: string): Promise<void> {
  await logDownload(id)
}

/**
 * Delete a photo (cascades to versions and links)
 * Note: Does NOT delete the actual file from storage
 */
export async function deletePhoto(id: string): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.delete(photoAssets).where(eq(photoAssets.id, id))
}

/**
 * Full-text search photos
 * Uses a single aggregated query to avoid N+1 performance issues
 */
export async function searchPhotos(
  query: string,
  filters?: {
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
  }
): Promise<PhotoWithMeta[]> {
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
    filterConditions += ` AND p.topic_id = '${filters.topicId}'`
  }
  if (filters?.status) {
    filterConditions += ` AND p.status = '${filters.status}'`
  }

  const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : ""

  // Single query with LEFT JOIN and GROUP BY
  const results = await db.execute(sql`
    SELECT
      p.*,
      ts_rank(to_tsvector('english', p.display_title || ' ' || COALESCE(p.description, '')), to_tsquery('english', ${searchQuery})) as rank,
      COALESCE(COUNT(l.answer_item_id), 0)::int as linked_answers_count
    FROM photo_assets p
    LEFT JOIN links_answer_photo l ON p.id = l.photo_asset_id
    WHERE to_tsvector('english', p.display_title || ' ' || COALESCE(p.description, '')) @@ to_tsquery('english', ${searchQuery})
    ${sql.raw(filterConditions)}
    GROUP BY p.id
    ORDER BY rank DESC
    ${sql.raw(limitClause)}
  `)

  // Map results to PhotoWithMeta (raw SQL returns snake_case columns)
  // PostgreSQL may return JSON as strings, so we need to parse them
  return (results as unknown as Array<Record<string, unknown>>).map((row) => {
    const tags = row.tags
    const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags
    return {
      id: row.id as string,
      displayTitle: (row.display_title ?? row.displayTitle) as string,
      topicId: (row.topic_id ?? row.topicId) as string,
      status: row.status as "Approved" | "Draft",
      tags: parsedTags as string[] | null,
      description: row.description as string | null,
      storageKey: (row.storage_key ?? row.storageKey) as string,
      originalFilename: (row.original_filename ?? row.originalFilename) as string,
      fileSize: (row.file_size ?? row.fileSize) as number | null,
      mimeType: (row.mime_type ?? row.mimeType) as string | null,
      createdAt: (row.created_at ?? row.createdAt) as Date,
      updatedAt: (row.updated_at ?? row.updatedAt) as Date,
      linkedAnswersCount: row.linked_answers_count as number,
    }
  })
}
