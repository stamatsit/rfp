/**
 * Backfill: Copy internalNote from static data into DB notes column.
 *
 * Usage: DATABASE_URL="..." npx tsx packages/server/src/scripts/backfillTestimonialNotes.ts
 *
 * Matches by fingerprint (md5 of quote+org). Only updates rows where notes IS NULL.
 */

import crypto from "crypto"
import postgres from "postgres"
// Import from CLIENT data which has the internalNote fields
import { clientSuccessData } from "../../../client/src/data/clientSuccessData.js"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const sql = postgres(DATABASE_URL)

function fingerprint(quote: string, org: string): string {
  return crypto.createHash("md5").update(`${quote}::${org}`).digest("hex")
}

async function backfill() {
  const testimonials = clientSuccessData.testimonials.filter(t => t.internalNote)
  console.log(`Found ${testimonials.length} testimonials with internalNote to backfill`)

  let updated = 0

  for (const t of testimonials) {
    const fp = fingerprint(t.quote, t.organization)

    const result = await sql`
      UPDATE client_success_testimonials
      SET notes = ${t.internalNote!}
      WHERE fingerprint = ${fp}
        AND (notes IS NULL OR notes = '')
    `

    if (result.count > 0) {
      updated++
      console.log(`  ✓ ${t.organization}: "${t.internalNote!.slice(0, 60)}..."`)
    }
  }

  console.log(`\nDone! Updated ${updated} of ${testimonials.length} testimonials`)
  await sql.end()
}

backfill().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
