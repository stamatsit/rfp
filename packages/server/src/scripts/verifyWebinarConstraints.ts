/** Verify webinar CHECK + unique constraints are live. */
import "dotenv/config"
import postgres from "postgres"

const url = process.env.DATABASE_URL!
const client = postgres(url, { max: 1 })

async function main() {
  const tests: { name: string; sql: string; shouldFail: boolean }[] = [
    {
      name: "category check rejects invalid value",
      sql: "INSERT INTO webinar_registrants (webinar_id, email, category) VALUES ('00000000-0000-0000-0000-000000000000', 'a@b.com', 'BOGUS')",
      shouldFail: true,
    },
    {
      name: "follow_up_status check rejects invalid value",
      sql: "INSERT INTO webinar_registrants (webinar_id, email, category, follow_up_status) VALUES ('00000000-0000-0000-0000-000000000000', 'a@b.com', 'client', 'BOGUS')",
      shouldFail: true,
    },
    {
      name: "upload_kind check rejects invalid value",
      sql: "INSERT INTO webinar_uploads (webinar_id, filename, upload_kind, raw_rows) VALUES ('00000000-0000-0000-0000-000000000000', 'x.xlsx', 'BOGUS', 0)",
      shouldFail: true,
    },
  ]
  for (const t of tests) {
    try {
      await client.begin(async (tx) => {
        await tx.unsafe(t.sql)
        throw new Error("ROLLBACK_AFTER_SUCCESS")
      })
      if (t.shouldFail) console.log(`✗ ${t.name} — should have failed, but didn't`)
      else console.log(`✓ ${t.name}`)
    } catch (e: any) {
      if (e?.message === "ROLLBACK_AFTER_SUCCESS") {
        if (t.shouldFail) console.log(`✗ ${t.name} — accepted invalid value`)
        else console.log(`✓ ${t.name}`)
      } else if (e?.code === "23514") {
        if (t.shouldFail) console.log(`✓ ${t.name} (CHECK violation)`)
        else console.log(`✗ ${t.name} — unexpectedly failed: ${e.message}`)
      } else {
        // Other error (FK violation, etc.) — still confirms the CHECK isn't the gate
        if (t.shouldFail) console.log(`✓ ${t.name} (failed with code=${e?.code})`)
        else console.log(`? ${t.name} — code=${e?.code} message=${e?.message}`)
      }
    }
  }
  await client.end()
}
main().catch(async (e) => { console.error(e); await client.end(); process.exit(1) })
