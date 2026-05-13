/**
 * One-time seed: import client/domain rows from Webinar Data/Stamats-Client-Domains-2025-2026.csv
 * into the clients table.
 *
 * Logic:
 *  - For each CSV row, match an existing client by lower(trim(name)) = lower(trim(Organization))
 *  - If match: append the CSV domain to email_domains[] if not already present (case-insensitive)
 *  - If no match: insert a new client (sector heuristic: `.edu` → higher-ed, else other)
 *  - Cross-client domain uniqueness: if a domain is already on another client, log error and skip
 *  - Idempotent: second run produces inserted=0, updated=0
 *
 * Run: npm run seed:client-domains
 */
import "dotenv/config"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { parse } from "csv-parse/sync"
import { sql } from "drizzle-orm"
import { db, clients } from "../db/index.js"
import { DOMAIN_RE } from "../lib/clientLookup.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// packages/server/src/scripts/ → repo root: ../../../..
const CSV_PATH = path.resolve(__dirname, "../../../../Webinar Data/Stamats-Client-Domains-2025-2026.csv")

interface CsvRow {
  Organization: string
  Website: string
  "Email Domain": string
  Notes: string
}

async function main() {
  if (!db) {
    console.error("DATABASE_URL not set; cannot run seed.")
    process.exit(1)
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`)
    process.exit(1)
  }

  const content = fs.readFileSync(CSV_PATH, "utf8")
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[]
  console.log(`Read ${rows.length} rows from CSV.`)

  let inserted = 0
  let updated = 0
  let skipped = 0
  let conflicts = 0

  // Snapshot existing clients once for lookups (small table)
  const allClients = await db.select().from(clients)
  const byNameLower = new Map<string, typeof allClients[number]>()
  for (const c of allClients) byNameLower.set(c.name.toLowerCase().trim(), c)
  const domainToClient = new Map<string, typeof allClients[number]>()
  for (const c of allClients) for (const d of c.emailDomains) domainToClient.set(d.toLowerCase(), c)

  for (const [i, row] of rows.entries()) {
    const orgRaw = row.Organization?.trim() ?? ""
    const domainRaw = row["Email Domain"]?.trim() ?? ""
    const notesRaw = row.Notes?.trim() ?? ""

    if (!orgRaw) {
      console.warn(`  row ${i + 2}: skipping — empty Organization`)
      skipped++
      continue
    }
    if (!domainRaw) {
      console.warn(`  row ${i + 2}: skipping "${orgRaw}" — empty Email Domain`)
      skipped++
      continue
    }
    const domain = domainRaw.toLowerCase()
    if (!DOMAIN_RE.test(domain)) {
      console.warn(`  row ${i + 2}: skipping "${orgRaw}" — invalid domain format "${domainRaw}"`)
      skipped++
      continue
    }

    const nameKey = orgRaw.toLowerCase().trim()
    const existingClient = byNameLower.get(nameKey)

    if (existingClient) {
      // Already exists. Append domain if missing.
      if (existingClient.emailDomains.includes(domain)) {
        // Nothing to do — fully idempotent
        continue
      }
      // Conflict check: is this domain on a DIFFERENT client?
      const owner = domainToClient.get(domain)
      if (owner && owner.id !== existingClient.id) {
        console.error(`  row ${i + 2}: CONFLICT — domain "${domain}" already on client "${owner.name}", not "${orgRaw}". Skipping.`)
        conflicts++
        continue
      }
      const nextDomains = [...existingClient.emailDomains, domain]
      await db.update(clients).set({
        emailDomains: nextDomains,
        updatedAt: new Date(),
      }).where(sql`${clients.id} = ${existingClient.id}`)
      existingClient.emailDomains = nextDomains
      domainToClient.set(domain, existingClient)
      updated++
      console.log(`  updated "${existingClient.name}" — added domain ${domain}`)
    } else {
      // New client
      const owner = domainToClient.get(domain)
      if (owner) {
        console.error(`  row ${i + 2}: CONFLICT — domain "${domain}" already on client "${owner.name}", but CSV row creates new "${orgRaw}". Skipping.`)
        conflicts++
        continue
      }
      const sector = domain.endsWith(".edu") ? "higher-ed" : "other"
      const [row] = await db.insert(clients).values({
        name: orgRaw,
        sector,
        notes: notesRaw || null,
        status: "active",
        emailDomains: [domain],
      }).returning()
      if (row) {
        byNameLower.set(row.name.toLowerCase().trim(), row)
        domainToClient.set(domain, row)
        inserted++
        console.log(`  inserted "${row.name}" (${sector}) — domain ${domain}`)
      }
    }
  }

  console.log("\n---")
  console.log(`Summary: inserted=${inserted}, updated=${updated}, skipped=${skipped}, conflicts=${conflicts}`)
  if (conflicts > 0) {
    console.log("\nSome domain conflicts were detected — review the log above before re-running.")
    process.exit(2)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
