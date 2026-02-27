/**
 * Migration: Add forked_to_id column to answer_item_versions
 * Run with: npx tsx src/scripts/migrateAnswerForkField.ts
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

  console.log("Running migration: add forked_to_id column to answer_item_versions...")

  await db!.execute(sql`
    ALTER TABLE answer_item_versions
    ADD COLUMN IF NOT EXISTS forked_to_id UUID
  `)
  console.log("  ✓ forked_to_id column added (or already exists)")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
