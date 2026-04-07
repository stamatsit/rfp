import "dotenv/config"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../db/schema.js"
import bcrypt from "bcrypt"
import { eq } from "drizzle-orm"

const SALT_ROUNDS = 12

async function main() {
  const email = process.argv[2]
  const newPassword = process.argv[3] ?? "St@mats"
  if (!email) {
    console.error("Usage: tsx resetPassword.ts <email> [newPassword]")
    process.exit(1)
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is required")
    process.exit(1)
  }

  const queryClient = postgres(databaseUrl)
  const db = drizzle(queryClient, { schema })

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  const result = await db
    .update(schema.users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(schema.users.email, email))
    .returning({ id: schema.users.id, email: schema.users.email })

  if (result.length === 0) {
    console.error(`No user found with email: ${email}`)
    process.exit(1)
  }

  console.log(`Reset password for ${result[0]!.email} → ${newPassword}`)
  await queryClient.end()
}

main().catch((err) => {
  console.error("Reset failed:", err)
  process.exit(1)
})
