#!/usr/bin/env node
/**
 * One-off: create the "screenshots" Supabase Storage bucket for the Image
 * Toolkit screenshot library. PRIVATE (images are served through the API),
 * 50 MB max, PNG only.
 *
 * Usage:
 *   node scripts/create-screenshots-bucket.mjs                 # dry run against root .env.local
 *   node scripts/create-screenshots-bucket.mjs --yes           # actually creates the bucket
 *   ENV_FILE=packages/server/.env node scripts/create-screenshots-bucket.mjs --yes   # local dev project
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = process.env.ENV_FILE ? resolve(process.cwd(), process.env.ENV_FILE) : resolve(__dirname, "../.env.local")
config({ path: envFile })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`)
  process.exit(1)
}

const BUCKET_NAME = "screenshots"
const BUCKET_OPTIONS = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024, // 50 MB
  allowedMimeTypes: ["image/png"],
}

const dryRun = !process.argv.includes("--yes")

console.log(`Env file:     ${envFile}`)
console.log(`Supabase URL: ${SUPABASE_URL}`)
console.log(`Bucket:       ${BUCKET_NAME}`)
console.log(`Public:       ${BUCKET_OPTIONS.public}`)
console.log(`Max size:     ${BUCKET_OPTIONS.fileSizeLimit / 1024 / 1024} MB`)
console.log(`Allowed MIME: ${BUCKET_OPTIONS.allowedMimeTypes.join(", ")}`)
console.log()

if (dryRun) {
  console.log("DRY RUN. Pass --yes to actually create the bucket.")
  process.exit(0)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, BUCKET_OPTIONS)

if (error) {
  if (error.message?.includes("already exists")) {
    console.log(`Bucket "${BUCKET_NAME}" already exists. No action taken.`)
    process.exit(0)
  }
  console.error("Failed to create bucket:", error.message)
  process.exit(1)
}

console.log(`Bucket "${BUCKET_NAME}" created successfully.`, data)
