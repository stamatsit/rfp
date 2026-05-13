/**
 * Verify that the new audit_log CHECK constraints are active.
 * - Negative test: inserting action_type='BOGUS' must FAIL with check violation.
 * - Positive test: inserting action_type='DELETE', entity_type='DO_NOT_CONTACT' must SUCCEED.
 * All inside ROLLBACK so nothing persists.
 */
import "dotenv/config"
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) { console.error("DATABASE_URL not set"); process.exit(1) }

const client = postgres(url, { max: 1 })

async function main() {
  // Negative: BOGUS action_type should fail
  let negFailed = false
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`INSERT INTO audit_log (action_type, entity_type) VALUES ('BOGUS', 'ANSWER')`)
      throw new Error("ROLLBACK")
    })
  } catch (e: any) {
    if (e?.code === "23514") {
      negFailed = true
      console.log("✓ Negative test PASSED: 'BOGUS' rejected by check constraint")
    } else if (e?.message === "ROLLBACK") {
      console.log("✗ Negative test FAILED: 'BOGUS' was ACCEPTED — CHECK constraint is NOT active")
    } else {
      console.log("? Negative test inconclusive:", e?.message)
    }
  }

  // Positive: DELETE / DO_NOT_CONTACT should succeed
  let posSucceeded = false
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`INSERT INTO audit_log (action_type, entity_type) VALUES ('DELETE', 'DO_NOT_CONTACT')`)
      posSucceeded = true
      throw new Error("ROLLBACK")
    })
  } catch (e: any) {
    if (e?.message === "ROLLBACK") {
      console.log("✓ Positive test PASSED: 'DELETE'/'DO_NOT_CONTACT' accepted (then rolled back)")
    } else {
      console.log("✗ Positive test FAILED:", e?.message)
    }
  }

  console.log("---")
  if (negFailed && posSucceeded) {
    console.log("All verification tests passed.")
  } else {
    console.log("VERIFICATION FAILED — investigate before continuing.")
    await client.end()
    process.exit(1)
  }
  await client.end()
}

main().catch(async (err) => {
  console.error("Error:", err.message)
  await client.end()
  process.exit(1)
})
