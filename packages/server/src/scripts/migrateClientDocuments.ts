/**
 * Migration: Create client_documents table
 * Per-client file uploads (PDFs, DOCX, TXT, images, SVG).
 * AI extracts text and generates summaries asynchronously on upload.
 *
 * Run with: npx tsx src/scripts/migrateClientDocuments.ts
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

  console.log("Running migration: create client_documents table...")

  await db!.execute(sql`
    CREATE TABLE IF NOT EXISTS client_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'general',
      storage_key TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      extracted_text TEXT,
      summary TEXT,
      key_points JSONB,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  console.log("  ✓ client_documents table created")

  await db!.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_client_docs_client ON client_documents(client_name)
  `)
  await db!.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_client_docs_type ON client_documents(doc_type)
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
