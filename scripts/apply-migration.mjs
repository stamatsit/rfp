#!/usr/bin/env node
// Apply one SQL migration file to the database in .env.local (DATABASE_URL).
// Usage: node scripts/apply-migration.mjs packages/server/migrations/008_client_portal.sql
// Run `npm run whichdb` first and confirm it says rfp-prod.
import fs from "node:fs"
import postgres from "postgres"
const file = process.argv[2]
if (!file) { console.error("usage: apply-migration.mjs <file.sql>"); process.exit(1) }
const env = fs.readFileSync(".env.local", "utf8")
const url = (env.match(/^DATABASE_URL="?([^"\n]+)"?/m) || [])[1]
if (!url) { console.error("No DATABASE_URL in .env.local"); process.exit(1) }
const sql = postgres(url, { ssl: "require", max: 1 })
try {
  await sql.unsafe(fs.readFileSync(file, "utf8"))
  console.log(`applied ${file}`)
} finally {
  await sql.end()
}
