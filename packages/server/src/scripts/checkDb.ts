/**
 * Quick script to check database state
 * Run with: npx tsx src/scripts/checkDb.ts
 */

import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, "..", "..", ".env")
config({ path: envPath })

const { initializeDatabase, db } = await import("../db/index.js")
const { answerItems, topics } = await import("../db/schema.js")
const { sql } = await import("drizzle-orm")

async function main() {
  await initializeDatabase()

  const answerCount = await db!.select({ count: sql`count(*)` }).from(answerItems)
  const topicCount = await db!.select({ count: sql`count(*)` }).from(topics)

  console.log("Database state:")
  console.log("  - Answer items:", answerCount[0]?.count)
  console.log("  - Topics:", topicCount[0]?.count)

  const allTopics = await db!.select().from(topics)
  console.log("\nAll topics:")
  allTopics.forEach(t => console.log("  -", t.displayName))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
