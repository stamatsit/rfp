/**
 * One-off helper: apply a single migration SQL file to the DATABASE_URL.
 * Usage: tsx src/scripts/applyMigration.ts <path-to-sql-file>
 */
import "dotenv/config"
import postgres from "postgres"
import fs from "fs"
import path from "path"

const sqlPath = process.argv[2]
if (!sqlPath) {
  console.error("Usage: tsx src/scripts/applyMigration.ts <path-to-sql-file>")
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const file = path.resolve(sqlPath)
const sql = fs.readFileSync(file, "utf8")

const client = postgres(url, { max: 1 })

async function main() {
  console.log(`Applying ${file}`)
  if (sql.includes("--> statement-breakpoint")) {
    // Drizzle-generated file
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      const preview = (stmt.split("\n")[0] ?? "").slice(0, 100)
      console.log(`  → ${preview}${stmt.length > 100 ? "..." : ""}`)
      await client.unsafe(stmt)
    }
  } else {
    // Hand-written file — apply as one batch (postgres supports multi-statement)
    console.log("  → running entire file as one batch...")
    await client.unsafe(sql)
  }
  console.log("Done.")
  await client.end()
}

main().catch(async (err) => {
  console.error("Error:", err.message)
  await client.end()
  process.exit(1)
})
