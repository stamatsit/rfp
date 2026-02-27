/**
 * Migration: Add notes + testimonial_date columns to client_success_testimonials
 * Run with: npx tsx src/scripts/migrateTestimonialFields.ts
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

  console.log("Running migration: add notes + testimonial_date columns...")

  await db!.execute(sql`
    ALTER TABLE client_success_testimonials
    ADD COLUMN IF NOT EXISTS notes TEXT
  `)
  console.log("  ✓ notes column added (or already exists)")

  await db!.execute(sql`
    ALTER TABLE client_success_testimonials
    ADD COLUMN IF NOT EXISTS testimonial_date DATE
  `)
  console.log("  ✓ testimonial_date column added (or already exists)")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
