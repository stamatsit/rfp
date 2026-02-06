import { eq } from "drizzle-orm"
import bcrypt from "bcrypt"
import { db, users, type User, type NewUser } from "../db/index.js"

const SALT_ROUNDS = 12

export async function createUser(data: {
  email: string
  password: string
  name: string
  mustChangePassword?: boolean
}): Promise<User> {
  if (!db) throw new Error("Database not available")

  const email = data.email.toLowerCase().trim()

  // Enforce @stamats.com domain
  if (!email.endsWith("@stamats.com")) {
    throw new Error("Only @stamats.com email addresses are allowed")
  }

  // Check if user exists
  const existing = await getUserByEmail(email)
  if (existing) {
    throw new Error("Email already registered")
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)

  const newUser: NewUser = {
    email,
    passwordHash,
    name: data.name.trim(),
    mustChangePassword: data.mustChangePassword ?? true,
  }

  const result = await db.insert(users).values(newUser).returning()
  if (!result[0]) throw new Error("Failed to create user")

  return result[0]
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1)

  return result[0]
}

export async function getUserById(id: string): Promise<User | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  return result[0]
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash)
}

export async function updateLastLogin(userId: string): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId))
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  if (!db) throw new Error("Database not available")

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
}

export async function updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

export async function getAllUsers(): Promise<User[]> {
  if (!db) throw new Error("Database not available")

  return db.select().from(users).orderBy(users.name)
}
