import "dotenv/config"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../db/schema.js"
import bcrypt from "bcrypt"
import { eq } from "drizzle-orm"

const SALT_ROUNDS = 12
const DEFAULT_PASSWORD = "St@mats"

const SEED_USERS = [
  { email: "eric.yerke@stamats.com", name: "Eric Yerke" },
  { email: "becky.morehouse@stamats.com", name: "Becky Morehouse" },
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is required")
    process.exit(1)
  }

  const queryClient = postgres(databaseUrl)
  const db = drizzle(queryClient, { schema })

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS)

  for (const user of SEED_USERS) {
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, user.email))
      .limit(1)

    if (existing[0]) {
      console.log(`  Skipped ${user.email} (already exists)`)
      continue
    }

    await db.insert(schema.users).values({
      email: user.email,
      name: user.name,
      passwordHash,
      mustChangePassword: true,
    })

    console.log(`  Created ${user.name} (${user.email})`)
  }

  console.log("\nDone. Default password for all new users: St@mats")
  console.log("Users will be prompted to change password on first login.")

  await queryClient.end()
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
