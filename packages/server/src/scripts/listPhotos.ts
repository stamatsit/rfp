/**
 * List all photo assets
 */
import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"

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

const photos = await db.select().from(photoAssets)
console.log("All photo assets:")
photos.forEach((p) => console.log(`- ${p.id}: "${p.displayTitle}" (file: ${p.originalFilename})`))
console.log(`\nTotal: ${photos.length} photos`)

process.exit(0)
