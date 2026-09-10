#!/usr/bin/env node
// Create (idempotent) the private `portal-images` storage bucket used by the
// Client Portal. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"
const env = fs.readFileSync(".env.local", "utf8")
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1]
const url = get("SUPABASE_URL"), key = get("SUPABASE_SERVICE_ROLE_KEY")
if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing"); process.exit(1) }
const sb = createClient(url, key)
const { data: buckets } = await sb.storage.listBuckets()
const existing = (buckets ?? []).find((b) => b.name === "portal-images")
const opts = { public: false, fileSizeLimit: 25 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] }
const r = existing ? await sb.storage.updateBucket("portal-images", opts) : await sb.storage.createBucket("portal-images", opts)
if (r.error) { console.error(r.error.message); process.exit(1) }
console.log(`${existing ? "updated" : "created"} bucket portal-images (private)`)
