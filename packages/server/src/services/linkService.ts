import { eq, and } from "drizzle-orm"
import {
  db,
  linksAnswerPhoto,
  answerItems,
  photoAssets,
  type LinkAnswerPhoto,
  type AnswerItem,
  type PhotoAsset,
} from "../db/index.js"
import { logLink, logUnlink } from "./auditService.js"

/**
 * Create a link between an answer and a photo
 */
export async function linkAnswerToPhoto(
  answerItemId: string,
  photoAssetId: string,
  createdBy = "local"
): Promise<LinkAnswerPhoto> {
  if (!db) throw new Error("Database not available")

  // Verify both entities exist
  const answer = await db
    .select()
    .from(answerItems)
    .where(eq(answerItems.id, answerItemId))
    .limit(1)

  if (!answer[0]) {
    throw new Error(`Answer not found: ${answerItemId}`)
  }

  const photo = await db
    .select()
    .from(photoAssets)
    .where(eq(photoAssets.id, photoAssetId))
    .limit(1)

  if (!photo[0]) {
    throw new Error(`Photo not found: ${photoAssetId}`)
  }

  // Check if link already exists
  const existing = await db
    .select()
    .from(linksAnswerPhoto)
    .where(
      and(
        eq(linksAnswerPhoto.answerItemId, answerItemId),
        eq(linksAnswerPhoto.photoAssetId, photoAssetId)
      )
    )
    .limit(1)

  if (existing[0]) {
    return existing[0] // Link already exists
  }

  // Create the link
  const result = await db
    .insert(linksAnswerPhoto)
    .values({
      answerItemId,
      photoAssetId,
      createdBy,
    })
    .returning()

  if (!result[0]) {
    throw new Error("Failed to create link")
  }

  // Log the link
  await logLink(answerItemId, photoAssetId)

  return result[0]
}

/**
 * Remove a link between an answer and a photo
 */
export async function unlinkAnswerFromPhoto(
  answerItemId: string,
  photoAssetId: string
): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db
    .delete(linksAnswerPhoto)
    .where(
      and(
        eq(linksAnswerPhoto.answerItemId, answerItemId),
        eq(linksAnswerPhoto.photoAssetId, photoAssetId)
      )
    )

  // Log the unlink
  await logUnlink(answerItemId, photoAssetId)
}

/**
 * Get all photos linked to an answer
 */
export async function getLinkedPhotos(answerItemId: string): Promise<PhotoAsset[]> {
  if (!db) throw new Error("Database not available")

  const links = await db
    .select()
    .from(linksAnswerPhoto)
    .where(eq(linksAnswerPhoto.answerItemId, answerItemId))

  if (links.length === 0) return []

  const photoIds = links.map((l) => l.photoAssetId)

  const photos: PhotoAsset[] = []
  for (const photoId of photoIds) {
    const photo = await db
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.id, photoId))
      .limit(1)

    if (photo[0]) {
      photos.push(photo[0])
    }
  }

  return photos
}

/**
 * Get all answers linked to a photo
 */
export async function getLinkedAnswers(photoAssetId: string): Promise<AnswerItem[]> {
  if (!db) throw new Error("Database not available")

  const links = await db
    .select()
    .from(linksAnswerPhoto)
    .where(eq(linksAnswerPhoto.photoAssetId, photoAssetId))

  if (links.length === 0) return []

  const answerIds = links.map((l) => l.answerItemId)

  const answers: AnswerItem[] = []
  for (const answerId of answerIds) {
    const answer = await db
      .select()
      .from(answerItems)
      .where(eq(answerItems.id, answerId))
      .limit(1)

    if (answer[0]) {
      answers.push(answer[0])
    }
  }

  return answers
}

/**
 * Get all links
 */
export async function getAllLinks(): Promise<LinkAnswerPhoto[]> {
  if (!db) throw new Error("Database not available")

  return db.select().from(linksAnswerPhoto)
}

/**
 * Check if a link exists
 */
export async function linkExists(
  answerItemId: string,
  photoAssetId: string
): Promise<boolean> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select()
    .from(linksAnswerPhoto)
    .where(
      and(
        eq(linksAnswerPhoto.answerItemId, answerItemId),
        eq(linksAnswerPhoto.photoAssetId, photoAssetId)
      )
    )
    .limit(1)

  return result.length > 0
}
