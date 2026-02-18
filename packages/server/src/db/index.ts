import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"
import { createClient } from "@supabase/supabase-js"

// Load environment variables
const DATABASE_URL = process.env.DATABASE_URL ?? ""
const SUPABASE_URL = process.env.SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

// Validate required environment variables
function validateEnv() {
  const missing: string[] = []
  if (!DATABASE_URL) missing.push("DATABASE_URL")
  if (!SUPABASE_URL) missing.push("SUPABASE_URL")
  if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY")

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(", ")}`)
    console.warn("Database features will not work until these are configured.")
    return false
  }
  return true
}

// Create postgres connection for Drizzle
const queryClient = DATABASE_URL ? postgres(DATABASE_URL) : null

// Create Drizzle instance
export const db = queryClient ? drizzle(queryClient, { schema }) : null

// Supabase client for storage and auth
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// Supabase admin client (for server-side operations)
export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

// Export schema for convenience
export * from "./schema.js"

// Initialize database (verify connection)
export async function initializeDatabase(): Promise<boolean> {
  if (!validateEnv()) {
    return false
  }

  if (!db) {
    console.error("Database not initialized - missing DATABASE_URL")
    return false
  }

  try {
    // Test connection by running a simple query
    await db.select().from(schema.topics).limit(1)
    console.log("Database connection established successfully")
    return true
  } catch (error) {
    console.error("Failed to connect to database:", error)
    return false
  }
}

// Check if database is available
export function isDatabaseAvailable(): boolean {
  return db !== null
}
