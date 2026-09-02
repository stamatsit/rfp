/**
 * Migration Matrix — snapshot-fed dashboard for the content-migration team.
 *
 * Two exports, two mount points (this split is deliberate):
 *   - ingestHandler: machine-auth POST, mounted PRE-AUTH in src/index.ts
 *     (the agent has no session; auth is the x-mm-ingest-token header).
 *   - default router: session routes, mounted at /api/migration via routes/index.ts.
 *
 * Production twin lives in api/index.ts (pre-auth block + route ladder).
 * Full architecture: ~/Desktop/Apps/migration matrix/PRODUCT-PLAN.md v3.1.
 *
 * - POST /api/migration/ingest    — store a snapshot (dedupe, dry_run, heartbeat)
 * - GET  /api/migration/latest    — latest snapshot + staleness + diff + archive
 * - GET  /api/migration/history   — recent snapshot metadata
 * - POST /api/migration/archive   — toggle a project's archived state
 * - GET  /api/migration/stats     — ingest-log tail for status surfaces
 */
import { Router, type Request, type Response } from "express"
import { timingSafeEqual } from "crypto"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { mmSnapshots, mmProjects, mmIngestLog } from "../db/schema.js"
import { getCurrentUserName } from "../middleware/getCurrentUser.js"

const MAX_BODY_BYTES = 2 * 1024 * 1024

function tokenOk(header: unknown): boolean {
  const expected = process.env.MM_INGEST_TOKEN || ""
  if (!expected || typeof header !== "string") return false
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Hand-rolled contract guards (repo convention: no zod). Returns problems. */
export function snapshotProblems(body: Record<string, unknown>): string[] {
  const problems: string[] = []
  if (typeof body.contract !== "string" || !/^1\.\d+$/.test(body.contract))
    problems.push("contract must be a '1.x' string")
  if (typeof body.generated_at !== "string") problems.push("generated_at missing")
  const sf = body.source_files as Record<string, unknown> | undefined
  const tracker = sf?.tracker as Record<string, unknown> | undefined
  if (!tracker || typeof tracker.sha256 !== "string")
    problems.push("source_files.tracker.sha256 missing")
  if (!Array.isArray(sf?.matrices)) problems.push("source_files.matrices must be an array")
  const data = body.data as Record<string, unknown> | undefined
  if (!data || !Array.isArray(data.clients) || !Array.isArray(data.team) || !data.overview)
    problems.push("data must carry clients[], team[], overview")
  if (!body.facts || typeof body.facts !== "object") problems.push("facts missing")
  if (!Array.isArray(body.findings)) problems.push("findings must be an array")
  return problems
}

export function computeSourceHash(body: Record<string, unknown>): string {
  const sf = body.source_files as { tracker?: { sha256?: string }; matrices?: Array<{ sha256?: string }> }
  const hashes = [sf?.tracker?.sha256 || "", ...(sf?.matrices || []).map((m) => m.sha256 || "").sort()]
  return hashes.join("|")
}

/** Human-readable diff between two snapshot data blobs (plan section 8). */
export function computeDiff(prev: any, cur: any): Array<{ kind: string; text: string }> {
  const out: Array<{ kind: string; text: string; mag: number }> = []
  try {
    const pc = new Map((prev.clients || []).map((c: any) => [c.name, c]))
    const cc = new Map((cur.clients || []).map((c: any) => [c.name, c]))
    const pDone = (prev.clients || []).reduce((s: number, c: any) => s + (c.done || 0), 0)
    const cDone = (cur.clients || []).reduce((s: number, c: any) => s + (c.done || 0), 0)
    if (pDone !== cDone)
      out.push({ kind: "pages", text: `${pDone.toLocaleString()} to ${cDone.toLocaleString()} pages done`, mag: Math.abs(cDone - pDone) + 1e6 })
    for (const [name, c] of cc) {
      const p: any = pc.get(name)
      if (!p) { out.push({ kind: "project", text: `new project: ${name}`, mag: 1e5 }); continue }
      if ((p.done || 0) !== (c as any).done)
        out.push({ kind: "project", text: `${name}: ${p.done} to ${(c as any).done} pages done`, mag: Math.abs((c as any).done - (p.done || 0)) })
      if (p.verdict !== (c as any).verdict)
        out.push({ kind: "project", text: `${name}: ${p.verdict} to ${(c as any).verdict}`, mag: 1e4 })
    }
    for (const name of pc.keys())
      if (!cc.has(name)) out.push({ kind: "project", text: `project no longer in tracker: ${name}`, mag: 1e5 })
    const pOver = new Set(prev.overview?.over || [])
    const cOver = new Set(cur.overview?.over || [])
    for (const p of cOver) if (!pOver.has(p)) out.push({ kind: "capacity", text: `${p} is now over capacity`, mag: 1e3 })
    for (const p of pOver) if (!cOver.has(p)) out.push({ kind: "capacity", text: `${p} is no longer over capacity`, mag: 1e3 })
  } catch (error) {
    console.error("Diff computation failed:", error)
  }
  return out.sort((a, b) => b.mag - a.mag).slice(0, 12).map(({ kind, text }) => ({ kind, text }))
}

/** PRE-AUTH machine endpoint. The 401 here is OUR token check; pre-auth
 *  mounts never reach the session gate. */
export async function ingestHandler(req: Request, res: Response) {
  try {
    if (!tokenOk(req.headers["x-mm-ingest-token"])) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== "object") return res.status(400).json({ error: "JSON object body required" })
    if (JSON.stringify(body).length > MAX_BODY_BYTES)
      return res.status(400).json({ error: "Payload exceeds 2MB cap" })

    if (body.heartbeat === true) {
      await db.insert(mmIngestLog).values({ outcome: "heartbeat", detail: String(body.detail || "") })
      return res.json({ ok: true, heartbeat: true })
    }

    const problems = snapshotProblems(body)
    if (problems.length) {
      // invalid + dry_run short-circuits before ANY db access (db-pure)
      if (body.dry_run === true) return res.json({ ok: false, would: "rejected", problems })
      await db.insert(mmIngestLog).values({ outcome: "rejected", detail: problems.join("; ").slice(0, 500) })
      return res.status(400).json({ error: "Invalid snapshot", problems })
    }
    const sourceHash = computeSourceHash(body)
    const [latest] = await db.select({ id: mmSnapshots.id, sourceHash: mmSnapshots.sourceHash })
      .from(mmSnapshots).orderBy(desc(mmSnapshots.createdAt)).limit(1)
    const would = latest?.sourceHash === sourceHash ? "deduped" : "stored"

    if (body.dry_run === true) {
      return res.json({ ok: true, would, problems: [] })
    }
    if (would === "deduped") {
      await db.insert(mmIngestLog).values({ outcome: "deduped", snapshotId: latest!.id })
      return res.json({ ok: true, deduped: true })
    }

    const [row] = await db.insert(mmSnapshots).values({
      contract: body.contract as string,
      source: (body.source as any) || "mac-agent",
      sourceHash,
      weekLabel: (body.week_lbl as string) || null,
      data: body.data as object,
      facts: body.facts as object,
      findings: (body.findings as object[]) || [],
    }).returning({ id: mmSnapshots.id })
    if (!row) return res.status(500).json({ error: "Insert returned no row" })
    // lazily register any project names we have not seen before (the
    // lower(name) unique index is functional, so ON CONFLICT cannot target
    // it: select-then-insert, and swallow the rare race's duplicate error)
    const names = ((body.data as any).clients || []).map((c: any) => String(c.name || "")).filter(Boolean)
    for (const name of names) {
      const [existing] = await db.select({ id: mmProjects.id }).from(mmProjects)
        .where(sql`lower(${mmProjects.name}) = lower(${name})`).limit(1)
      if (!existing) {
        await db.insert(mmProjects).values({ name }).catch((e) =>
          console.error("mm_projects insert race (harmless):", e?.message))
      }
    }
    await db.insert(mmIngestLog).values({ outcome: "stored", snapshotId: row.id })
    return res.status(201).json({ ok: true, snapshot_id: row.id })
  } catch (error) {
    console.error("Migration ingest failed:", error)
    return res.status(500).json({ error: "Ingest failed" })
  }
}

const router = Router()

// GET /api/migration/latest
router.get("/latest", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const rows = await db.select().from(mmSnapshots).orderBy(desc(mmSnapshots.createdAt)).limit(10)
    const latest = rows[0]
    if (!latest) return res.json({ empty: true })
    const prev = rows.find((r) => r.sourceHash !== latest.sourceHash)
    const [hb] = await db.select({ createdAt: mmIngestLog.createdAt }).from(mmIngestLog)
      .orderBy(desc(mmIngestLog.createdAt)).limit(1)
    const archive = await db.select().from(mmProjects)
    res.json({
      snapshot: { id: latest.id, created_at: latest.createdAt, contract: latest.contract,
        source: latest.source, week_label: latest.weekLabel, data: latest.data,
        facts: latest.facts, findings: latest.findings },
      seconds_old: Math.round((Date.now() - new Date(latest.createdAt as any).getTime()) / 1000),
      last_heartbeat_seconds: hb ? Math.round((Date.now() - new Date(hb.createdAt as any).getTime()) / 1000) : null,
      diff: prev ? computeDiff(prev.data, latest.data) : [],
      archive: archive.map((p) => ({ name: p.name, archived: p.archived,
        archived_by: p.archivedBy, archived_at: p.archivedAt })),
    })
  } catch (error) {
    console.error("Migration latest failed:", error)
    res.status(500).json({ error: "Failed to load latest snapshot" })
  }
})

// GET /api/migration/history
router.get("/history", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const rows = await db.select({ id: mmSnapshots.id, createdAt: mmSnapshots.createdAt,
      source: mmSnapshots.source, weekLabel: mmSnapshots.weekLabel })
      .from(mmSnapshots).orderBy(desc(mmSnapshots.createdAt)).limit(limit)
    res.json(rows)
  } catch (error) {
    console.error("Migration history failed:", error)
    res.status(500).json({ error: "Failed to load history" })
  }
})

// POST /api/migration/archive  { project: string, archived: boolean }
router.post("/archive", async (req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const { project, archived } = req.body || {}
    if (typeof project !== "string" || !project.trim() || typeof archived !== "boolean")
      return res.status(400).json({ error: "project (string) and archived (boolean) required" })
    const [row] = await db.select({ id: mmProjects.id }).from(mmProjects)
      .where(sql`lower(${mmProjects.name}) = lower(${project.trim()})`).limit(1)
    if (!row) return res.status(404).json({ error: "Unknown project" })
    const actor = getCurrentUserName(req)
    await db.update(mmProjects).set({
      archived, archivedBy: archived ? actor : null,
      archivedAt: archived ? new Date() : null,
    }).where(eq(mmProjects.id, row.id))
    res.json({ ok: true, project: project.trim(), archived })
  } catch (error) {
    console.error("Migration archive failed:", error)
    res.status(500).json({ error: "Failed to update archive state" })
  }
})

// POST /api/migration/chat/stream — SSE, grounded + CHART_DATA graphics
router.post("/chat/stream", async (req: Request, res: Response) => {
  const { query, conversationHistory, context } = req.body || {}
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    res.setHeader("Content-Type", "text/event-stream")
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Query too short" })}\n\n`)
    return res.end()
  }
  if (query.length > 2000) {
    res.setHeader("Content-Type", "text/event-stream")
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Query too long (2000 char max)" })}\n\n`)
    return res.end()
  }
  try {
    const { streamMigrationChat } = await import("../services/migrationAIService.js")
    await streamMigrationChat(query.trim(), conversationHistory, String(context || ""), res)
  } catch (error) {
    console.error("Migration chat failed:", error)
    if (!res.headersSent) res.status(500).json({ error: "Chat failed" })
    else res.end()
  }
})

// GET /api/migration/stats
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    if (!db) return res.status(503).json({ error: "Database unavailable" })
    const log = await db.select().from(mmIngestLog).orderBy(desc(mmIngestLog.createdAt)).limit(20)
    const [count] = await db.select({ n: sql<number>`count(*)` }).from(mmSnapshots)
    res.json({ snapshots: Number(count?.n || 0), recent: log })
  } catch (error) {
    console.error("Migration stats failed:", error)
    res.status(500).json({ error: "Failed to load stats" })
  }
})

export default router
