/**
 * Migration: Create writing_persona_samples table
 * Run with: npx tsx src/scripts/migratePersonaSamples.ts
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

  console.log("Running migration: create writing_persona_samples table...")

  await db!.execute(sql`
    CREATE TABLE IF NOT EXISTS writing_persona_samples (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'paste',
      original_filename TEXT,
      char_count INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  console.log("  ✓ writing_persona_samples table created")

  await db!.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_persona_samples_user_id ON writing_persona_samples(user_id)
  `)
  console.log("  ✓ user_id index created")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err)
    process.exit(1)
  })
