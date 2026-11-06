// Local test only: the real migration routes on a throwaway database, mounted the way src/index.ts
// mounts them. Refuses anything but the local test database. See tools/migration-matrix/tracker_tests/README.md.
const url = process.env.DATABASE_URL || ""
if (!url.includes("@127.0.0.1:55432/")) throw new Error("REFUSING: not the local test database")
const { default: express } = await import("express")
const { default: router, ingestHandler } = await import("../src/routes/migration.js")
const app = express()
app.use(express.json({ limit: "5mb" }))
app.post("/api/migration/ingest", ingestHandler)
app.use("/api/migration", router)
app.listen(3002, "127.0.0.1", () => console.log("harness on 3002"))
export {}
