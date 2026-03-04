/**
 * Migration: Create client_brand_kit table
 * Per-client brand identity data: colors, fonts, logo, tone.
 * Populated via website scraping or manual entry.
 *
 * Run with: npx tsx src/scripts/migrateClientBrandKit.ts
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

  console.log("Running migration: create client_brand_kit table...")

  await db!.execute(sql`
    CREATE TABLE IF NOT EXISTS client_brand_kit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL UNIQUE,
      website_url TEXT,
      scraped_at TIMESTAMPTZ,
      logo_storage_key TEXT,
      logo_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      accent_color TEXT,
      background_color TEXT,
      text_color TEXT,
      raw_colors JSONB,
      primary_font TEXT,
      secondary_font TEXT,
      font_stack TEXT,
      tone TEXT,
      style_notes TEXT,
      scrape_status TEXT DEFAULT 'pending',
      scrape_error TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  console.log("  ✓ client_brand_kit table created")

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
