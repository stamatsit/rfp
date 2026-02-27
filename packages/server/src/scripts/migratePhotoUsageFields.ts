/**
 * Migration: Add usage_count and last_used_at columns to photo_assets
 * Run with: npx tsx src/scripts/migratePhotoUsageFields.ts
 */

import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, "..", "..", ".env")
config({ path: envPath })

const { initializeDatabase, db } = await import("../db/index.js")
const { sql } = await import("drizzle-orm")

async function main() {
  await initializeDatabase()

  console.log("Running migration: add usage_count and last_used_at to photo_assets...")

  await db!.execute(sql`
    ALTER TABLE photo_assets
    ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0
  `)
  console.log("  ✓ usage_count column added (or already exists)")

  await db!.execute(sql`
    ALTER TABLE photo_assets
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ
  `)
  console.log("  ✓ last_used_at column added (or already exists)")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
