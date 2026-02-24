/**
 * One-time seed script: Migrate all static testimonials into the database.
 *
 * Usage: DATABASE_URL="..." npx tsx packages/server/src/scripts/seedTestimonials.ts
 *
 * Idempotent — uses fingerprint (md5 of quote+org) with ON CONFLICT DO NOTHING.
 */

import crypto from "crypto"
import postgres from "postgres"
import { clientSuccessData } from "../data/clientSuccessData.js"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const sql = postgres(DATABASE_URL)

// Build a lookup map: org name → sector from namedClients + caseStudies
function buildSectorMap(): Map<string, "higher-ed" | "healthcare" | "other"> {
  const map = new Map<string, "higher-ed" | "healthcare" | "other">()

  // Named clients have explicit sector
  for (const client of clientSuccessData.namedClients) {
    map.set(client.name.toLowerCase(), client.sector)
  }

  // Case studies also have category (which maps to sector)
  for (const cs of clientSuccessData.caseStudies) {
    if (!map.has(cs.client.toLowerCase())) {
      map.set(cs.client.toLowerCase(), cs.category as "higher-ed" | "healthcare" | "other")
    }
  }

  return map
}

function fingerprint(quote: string, org: string): string {
  return crypto.createHash("md5").update(`${quote}::${org}`).digest("hex")
}

async function seed() {
  const sectorMap = buildSectorMap()
  const testimonials = clientSuccessData.testimonials

  console.log(`Found ${testimonials.length} static testimonials to seed`)
  console.log(`Sector lookup has ${sectorMap.size} known organizations`)

  let inserted = 0
  let skipped = 0

  for (const t of testimonials) {
    const fp = fingerprint(t.quote, t.organization)
    const orgLower = t.organization.toLowerCase()
    const sector = sectorMap.get(orgLower) || null

    try {
      const result = await sql`
        INSERT INTO client_success_testimonials (
          quote, name, title, organization, source,
          status, sector, tags, usage_count, featured,
          added_by, fingerprint
        ) VALUES (
          ${t.quote}, ${t.name || null}, ${t.title || null}, ${t.organization}, ${t.source || null},
          'draft', ${sector}, '[]'::jsonb, 0, false,
          'system-seed', ${fp}
        )
        ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO NOTHING
      `

      if (result.count > 0) {
        inserted++
      } else {
        skipped++
      }
    } catch (err: any) {
      // Duplicate fingerprint or other error
      console.warn(`Skipped "${t.organization}" — ${err.message?.slice(0, 80)}`)
      skipped++
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped (already existed): ${skipped}`)

  // Show final count
  const [{ count }] = await sql`SELECT COUNT(*) as count FROM client_success_testimonials`
  console.log(`Total testimonials in DB: ${count}`)

  await sql.end()
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
