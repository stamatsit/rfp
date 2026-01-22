/**
 * Script to import Loopio library entries from Excel file
 * Run with: npx tsx src/scripts/importExcel.ts
 */

import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from server package root BEFORE importing db
const envPath = path.resolve(__dirname, "..", "..", ".env")
console.log(`Loading env from: ${envPath}`)
const envResult = config({ path: envPath })
console.log(`Env loaded:`, envResult.parsed ? "yes" : "no")
console.log(`DATABASE_URL set:`, !!process.env.DATABASE_URL)

// Dynamic imports after env is loaded
const { executeImportWithAI } = await import("../services/importService.js")
const { initializeDatabase, db } = await import("../db/index.js")
const { answerItems, topics } = await import("../db/schema.js")
const drizzle = await import("drizzle-orm")

async function main() {
  // Initialize database
  console.log("\nConnecting to database...")
  const dbReady = await initializeDatabase()
  if (!dbReady) {
    console.error("Failed to connect to database. Check your .env file.")
    process.exit(1)
  }

  // Check current counts
  const answerCount = await db!.select({ count: drizzle.sql`count(*)` }).from(answerItems)
  const topicCount = await db!.select({ count: drizzle.sql`count(*)` }).from(topics)
  console.log(`\nCurrent database state:`)
  console.log(`  - Answer items: ${answerCount[0]?.count ?? 0}`)
  console.log(`  - Topics: ${topicCount[0]?.count ?? 0}`)

  // Path to the Excel file
  const excelPath = path.resolve(__dirname, "..", "..", "..", "..", "Loopio-jan-2026.xlsx")
  console.log(`\nImporting from: ${excelPath}`)

  // Execute import with AI-based category inference
  console.log("\nStarting import with AI category inference...")
  const result = await executeImportWithAI(excelPath)

  // Show results
  console.log("\n=== Import Complete ===")
  console.log(`Success: ${result.success}`)
  console.log(`Imported (new): ${result.imported}`)
  console.log(`Updated (existing): ${result.updated}`)
  console.log(`Skipped: ${result.skipped}`)
  console.log(`Categories inferred by AI: ${result.aiInferredCount}`)

  if (result.issues.length > 0) {
    console.log(`\nIssues (${result.issues.length}):`)
    // Group issues by type
    const byType: Record<string, typeof result.issues> = {}
    for (const issue of result.issues) {
      const type = issue.type
      if (!byType[type]) byType[type] = []
      byType[type].push(issue)
    }

    for (const [type, issues] of Object.entries(byType)) {
      console.log(`\n  ${type} (${issues.length}):`)
      // Show first 5 of each type
      for (const issue of issues.slice(0, 5)) {
        console.log(`    - Row ${issue.row}: ${issue.message}`)
      }
      if (issues.length > 5) {
        console.log(`    ... and ${issues.length - 5} more`)
      }
    }
  }

  // Final counts
  const finalAnswerCount = await db!.select({ count: drizzle.sql`count(*)` }).from(answerItems)
  const finalTopicCount = await db!.select({ count: drizzle.sql`count(*)` }).from(topics)
  console.log(`\nFinal database state:`)
  console.log(`  - Answer items: ${finalAnswerCount[0]?.count ?? 0}`)
  console.log(`  - Topics: ${finalTopicCount[0]?.count ?? 0}`)
}

main()
  .then(() => {
    console.log("\nDone!")
    process.exit(0)
  })
  .catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
