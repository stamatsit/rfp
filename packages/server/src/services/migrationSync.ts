/**
 * Migration Matrix "Sync now": how a click learns that its sync finished.
 *
 * The pipeline (GitHub Action -> tools/migration-matrix/cloud_sync.py) stamps
 * every run with the moment it started reading the spreadsheets, and the
 * ingest keeps that stamp in mm_ingest_log.detail as "run_started_at=<iso>".
 * A click records when it asked (requested_at, server clock). The sync it
 * asked for is done once any run that STARTED after that moment reports back:
 * the run the click dispatched, or a scheduled run that happened to start
 * first. Either one read the spreadsheets after the click, so either carries
 * the edits the user wanted to see. Runs already under way when the click
 * landed are ignored, and so are rows written before runs carried the stamp.
 *
 * Pure functions, shared by the Express routes (routes/migration.ts) and the
 * Vercel twin (api/index.ts), so the two cannot drift.
 */

export const RUN_TAG = "run_started_at="

/** A failed run reports a heartbeat whose detail starts with this. */
export const FAILED_PREFIX = "sync failed:"

/** The tag for an ingest body's run_started_at, or "" when absent or malformed. */
export function runTag(value: unknown): string {
  if (typeof value !== "string" || value.length > 40) return ""
  const t = Date.parse(value)
  return Number.isFinite(t) ? `${RUN_TAG}${new Date(t).toISOString()}` : ""
}

/** A log detail with the run tag appended; null when there is nothing to keep. */
export function withRunTag(detail: string | null | undefined, tag: string): string | null {
  const d = (detail || "").trim().slice(0, 440)
  if (!tag) return d || null
  return d ? `${d} | ${tag}` : tag
}

/** When the run behind a log row started, or null for rows without the tag. */
export function runStartedAt(detail: string | null | undefined): number | null {
  const m = /run_started_at=(\S+)/.exec(detail || "")
  if (!m) return null
  const t = Date.parse(m[1]!)
  return Number.isFinite(t) ? t : null
}

/** A log detail without its run tag, for showing to people. */
export function stripRunTag(detail: string | null | undefined): string {
  return (detail || "").replace(/\s*\|?\s*run_started_at=\S+/, "").trim()
}

export interface SyncLogRow {
  outcome: string
  created_at: Date | string
  detail: string | null
  snapshot_id: string | null
}

export type SyncStatus =
  | { state: "pending" }
  | { state: "done"; at: string; outcome: "stored" | "deduped"; snapshot_id: string | null }
  | { state: "failed"; at: string; reason: string }

/**
 * Where the sync requested at `since` stands, given the ingest log rows written
 * since then. A success wins over a failure: if one run that started after the
 * click failed and another succeeded, the user's edits did arrive.
 */
export function resolveSyncStatus(rows: SyncLogRow[], since: number): SyncStatus {
  const ours = rows
    .filter((r) => { const s = runStartedAt(r.detail); return s !== null && s >= since })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const ok = ours.find((r) => r.outcome === "stored" || r.outcome === "deduped")
  if (ok) return { state: "done", at: new Date(ok.created_at).toISOString(), outcome: ok.outcome as "stored" | "deduped", snapshot_id: ok.snapshot_id }
  for (const r of ours) {
    const text = stripRunTag(r.detail)
    if (r.outcome === "rejected")
      return { state: "failed", at: new Date(r.created_at).toISOString(), reason: `the dashboard refused the new numbers (${text || "no detail"})` }
    if (r.outcome === "heartbeat" && text.toLowerCase().startsWith(FAILED_PREFIX))
      return { state: "failed", at: new Date(r.created_at).toISOString(), reason: text.slice(FAILED_PREFIX.length).trim() || "no detail" }
  }
  return { state: "pending" }
}

/**
 * The ?since= of a status check: an ISO time from the last hour, at most a
 * minute ahead of this server's clock. Null when it is anything else.
 */
export function parseSince(value: unknown, now = Date.now()): number | null {
  if (typeof value !== "string" || value.length > 40) return null
  const t = Date.parse(value)
  if (!Number.isFinite(t) || t > now + 60_000 || t < now - 60 * 60_000) return null
  return t
}
