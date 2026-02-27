/**
 * Migration: Add new fields to client_success_awards
 * Run with: npx tsx src/scripts/migrateAwardFields.ts
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

  console.log("Running migration: add new fields to client_success_awards...")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS company_name TEXT`)
  console.log("  ✓ company_name")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS issuing_agency TEXT`)
  console.log("  ✓ issuing_agency")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS category TEXT`)
  console.log("  ✓ category")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS award_level TEXT`)
  console.log("  ✓ award_level")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS submission_status TEXT CHECK (submission_status IN ('client-submission', 'stamats-submission', 'other'))`)
  console.log("  ✓ submission_status")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS badge_storage_key TEXT`)
  console.log("  ✓ badge_storage_key")

  await db!.execute(sql`ALTER TABLE client_success_awards ADD COLUMN IF NOT EXISTS notes TEXT`)
  console.log("  ✓ notes")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
