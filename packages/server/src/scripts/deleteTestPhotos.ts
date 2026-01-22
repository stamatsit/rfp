/**
 * Delete test/mock photo assets from the database
 */
import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"
import { eq, or, like } from "drizzle-orm"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, "..", "..", ".env")
config({ path: envPath })

const { db } = await import("../db/index.js")
const { photoAssets } = await import("../db/schema.js")

if (!db) {
  console.log("DB not available")
  process.exit(1)
}

// Find test photos by patterns
const testPhotos = await db
  .select()
  .from(photoAssets)
  .where(
    or(
      like(photoAssets.displayTitle, "Test Image%"),
      like(photoAssets.displayTitle, "link test%"),
      like(photoAssets.displayTitle, "unlink test%"),
      like(photoAssets.originalFilename, "test-image%"),
      like(photoAssets.originalFilename, "rename-test%"),
      like(photoAssets.originalFilename, "link-test%"),
      like(photoAssets.originalFilename, "unlink-test%"),
      eq(photoAssets.displayTitle, "New Title")
    )
  )

console.log(`Found ${testPhotos.length} test/mock photos to delete:`)
testPhotos.forEach((p) => console.log(`  - ${p.displayTitle} (${p.originalFilename})`))

if (testPhotos.length === 0) {
  console.log("No test photos found.")
  process.exit(0)
}

// Delete them
for (const photo of testPhotos) {
  await db.delete(photoAssets).where(eq(photoAssets.id, photo.id))
  console.log(`Deleted: ${photo.displayTitle}`)
}

console.log(`\nDeleted ${testPhotos.length} test/mock photos.`)

process.exit(0)
