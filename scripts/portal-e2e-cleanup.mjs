#!/usr/bin/env node
// Remove everything the client-portal end-to-end run created on production.
// Deletes portal rows (users, domains, images + their storage objects), the
// two smoke clients, and the throwaway staff user. Idempotent.
import fs from "node:fs"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
const env = fs.readFileSync(".env.local", "utf8")
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1]
const sql = postgres(get("DATABASE_URL"), { ssl: "require", max: 1 })
const sb = createClient(get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"))
const CLIENTS = ["Portal Smoke College", "Portal Smoke Two"]
const STAFF = "portal.smoke@stamats.com"
try {
  const clients = await sql`select id, name from clients where name = any(${CLIENTS})`
  const ids = clients.map((c) => c.id)
  if (ids.length) {
    const imgs = await sql`select storage_key from portal_images where client_id = any(${ids})`
    if (imgs.length) {
      const { error } = await sb.storage.from("portal-images").remove(imgs.map((i) => i.storage_key))
      console.log(`storage objects removed: ${imgs.length}${error ? ` (error: ${error.message})` : ""}`)
    }
    const u = await sql`delete from portal_users where client_id = any(${ids}) returning email`
    const d = await sql`delete from portal_client_domains where client_id = any(${ids}) returning domain`
    const i = await sql`delete from portal_images where client_id = any(${ids}) returning id`
    const c = await sql`delete from clients where id = any(${ids}) returning name`
    console.log(`portal_users: ${u.map((x) => x.email).join(", ") || "none"}`)
    console.log(`domains: ${d.map((x) => x.domain).join(", ") || "none"}`)
    console.log(`portal_images rows: ${i.length}`)
    console.log(`clients: ${c.map((x) => x.name).join(", ")}`)
  } else console.log("no smoke clients found")
  const s = await sql`delete from users where email = ${STAFF} returning email`
  console.log(`staff user: ${s.length ? "deleted" : "not present"}`)
  const left = await sql`select (select count(*)::int from portal_users) as users, (select count(*)::int from portal_client_domains) as domains, (select count(*)::int from portal_images) as images`
  console.log("remaining portal rows:", JSON.stringify(left[0]))
  const { data: objs } = await sb.storage.from("portal-images").list("", { limit: 100 })
  console.log("bucket top-level entries:", (objs ?? []).map((o) => o.name).join(", ") || "none")
} finally {
  await sql.end()
}
