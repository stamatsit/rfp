#!/usr/bin/env node
/**
 * Route-drift detector.
 *
 * Production is served by the single-file Vercel function `api/index.ts`, which
 * REIMPLEMENTS the Express routes in `packages/server/src/routes/*.ts`. When a
 * route is added to Express but not to the bundle, the feature works locally and
 * 404s in production — this is how the Import Wizard silently died.
 *
 * Run: node scripts/check-route-drift.mjs
 * Exit 1 if drift is found (unless ALLOWLIST covers it).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const routesDir = path.join(root, "packages/server/src/routes")
const bundlePath = path.join(root, "api/index.ts")

// Routes intentionally absent from production (local-dev or filesystem-bound).
const ALLOWLIST = new Set([
  "/topics/cleanup-test-data", // test-data cleanup, dev only
  "/photos/import-folder",     // reads a server filesystem path; not meaningful on serverless
])

const bundle = fs.readFileSync(bundlePath, "utf8")
const indexTs = fs.readFileSync(path.join(routesDir, "index.ts"), "utf8")

// import <ident> from "./<file>.js"  +  router.use("/<mount>", <ident>)
const identToFile = new Map()
for (const m of indexTs.matchAll(/import\s+(\w+)\s+from\s+"\.\/(\w+)\.js"/g)) {
  identToFile.set(m[1], m[2])
}
const fileToMount = new Map()
for (const m of indexTs.matchAll(/router\.use\("(\/[a-z-]+)",\s*(\w+)/gi)) {
  const file = identToFile.get(m[2])
  if (file) fileToMount.set(file, m[1])
}

const missing = []
for (const file of fs.readdirSync(routesDir)) {
  if (!file.endsWith(".ts") || file === "index.ts") continue
  const base = file.slice(0, -3)
  const mount = fileToMount.get(base)
  if (!mount) continue
  const src = fs.readFileSync(path.join(routesDir, file), "utf8")
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\("([^"]*)"/g)) {
    const method = m[1].toUpperCase()
    const sub = m[2]
    // First static path segment after the mount — enough to detect "this route
    // group was never ported", without trying to parse every :param form.
    const seg = sub.replace(/^\//, "").split("/")[0].replace(/:.*/, "")
    const probe = seg ? `${mount}/${seg}` : mount
    const full = `${mount}${sub}`
    if (!probe || ALLOWLIST.has(probe) || ALLOWLIST.has(full)) continue
    if (!bundle.includes(probe)) missing.push({ method, full, probe })
  }
}

const unique = [...new Map(missing.map((r) => [r.probe, r])).values()]

if (unique.length === 0) {
  console.log("No route drift: every Express route group is present in api/index.ts")
  process.exit(0)
}

console.error(`\nROUTE DRIFT — ${unique.length} Express route group(s) missing from api/index.ts (production):\n`)
for (const r of unique) console.error(`  ${r.method.padEnd(6)} ${r.full}`)
console.error(`
These work locally but will fail in production.
Port them into api/index.ts, or add them to ALLOWLIST in scripts/check-route-drift.mjs
if they are intentionally local-only.
`)
process.exit(1)
