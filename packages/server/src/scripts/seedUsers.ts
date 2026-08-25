import "dotenv/config"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../db/schema.js"
import bcrypt from "bcrypt"
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"

const SALT_ROUNDS = 12
// Never hardcode a credential — this repo is public. Supply one via
// SEED_PASSWORD, otherwise a random per-run password is generated and printed once.
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url")

const SEED_USERS = [
  { email: "eric.yerke@stamats.com", name: "Eric Yerke" },
  { email: "becky.morehouse@stamats.com", name: "Becky Morehouse" },
  { email: "ericyerke@gmail.com", name: "Eric Yerke" },
  { email: "eyerke@gmail.com", name: "Eric Yerke" },
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

  console.log(`\nDone. Default password for all new users: ${DEFAULT_PASSWORD}`)
  console.log("(shown once — not stored anywhere; set SEED_PASSWORD to choose your own)")
  console.log("Users will be prompted to change password on first login.")

  await queryClient.end()
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
