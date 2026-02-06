/**
 * Avatar Storage Service — Local disk storage for user avatars.
 * Stores files in /storage/avatars/<userId>.<ext>
 * Supabase-ready: swap this service to use bucket storage when configured.
 */

import path from "path"
import { fileURLToPath } from "url"
import fs from "fs/promises"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AVATARS_DIR = path.resolve(__dirname, "../../../../storage/avatars")

const EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif"]

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/webp": ".webp",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
  }
  return map[mimeType] || ".webp"
}

/** Ensure the avatars directory exists */
async function ensureDir(): Promise<void> {
  await fs.mkdir(AVATARS_DIR, { recursive: true })
}

/** Save an avatar file. Overwrites any existing avatar for the user. */
export async function saveAvatar(
  userId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  await ensureDir()

  // Remove any existing avatar first
  await deleteAvatarFile(userId)

  const ext = mimeToExt(mimeType)
  const filename = `${userId}${ext}`
  const filePath = path.join(AVATARS_DIR, filename)

  await fs.writeFile(filePath, fileBuffer)

  return `avatars/${filename}`
}

/** Delete the avatar file for a user. */
export async function deleteAvatarFile(userId: string): Promise<void> {
  for (const ext of EXTENSIONS) {
    const filePath = path.join(AVATARS_DIR, `${userId}${ext}`)
    try {
      await fs.unlink(filePath)
    } catch {
      // File doesn't exist with this extension — try next
    }
  }
}

/** Get the full filesystem path to a user's avatar, or null if not found. */
export async function getAvatarPath(userId: string): Promise<string | null> {
  for (const ext of EXTENSIONS) {
    const filePath = path.join(AVATARS_DIR, `${userId}${ext}`)
    try {
      await fs.access(filePath)
      return filePath
    } catch {
      // Try next extension
    }
  }
  return null
}
