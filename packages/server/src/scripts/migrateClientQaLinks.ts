/**
 * Migration: Create client_qa_links table
 * Non-destructive overlay — answer_items data is never modified.
 * Links are stored separately; Q&A integrity is preserved.
 *
 * Run with: npx tsx src/scripts/migrateClientQaLinks.ts
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

  console.log("Running migration: create client_qa_links table...")

  await db!.execute(sql`
    CREATE TABLE IF NOT EXISTS client_qa_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      answer_id UUID NOT NULL REFERENCES answer_items(id) ON DELETE CASCADE,
      linked_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(client_name, answer_id)
    )
  `)
  console.log("  ✓ client_qa_links table created")

  await db!.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_client_qa_links_client ON client_qa_links(client_name)
  `)
  await db!.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_client_qa_links_answer ON client_qa_links(answer_id)
  `)
  console.log("  ✓ indexes created")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
