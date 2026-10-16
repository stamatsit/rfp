import { describe, expect, it } from "vitest"
import {
  parseSince,
  resolveSyncStatus,
  runStartedAt,
  runTag,
  stripRunTag,
  withRunTag,
  type SyncLogRow,
} from "./migrationSync.js"

const CLICK = Date.parse("2026-10-16T15:00:00.000Z")
const at = (sec: number) => new Date(CLICK + sec * 1000).toISOString()
const tag = (sec: number) => `run_started_at=${at(sec)}`
const row = (outcome: string, wroteSec: number, detail: string | null, snapshot_id: string | null = null): SyncLogRow =>
  ({ outcome, created_at: at(wroteSec), detail, snapshot_id })

describe("runTag", () => {
  it("normalises a valid time to ISO", () => {
    expect(runTag("2026-10-16T15:00:05Z")).toBe("run_started_at=2026-10-16T15:00:05.000Z")
  })
  it("returns nothing for missing, malformed or oversized values", () => {
    expect(runTag(undefined)).toBe("")
    expect(runTag(12345)).toBe("")
    expect(runTag("yesterday-ish")).toBe("")
    expect(runTag("2026-10-16T15:00:05Z".padEnd(41, " "))).toBe("")
  })
})

describe("withRunTag / runStartedAt / stripRunTag", () => {
  it("appends the tag to a detail and reads it back", () => {
    const d = withRunTag("sync failed: share link did not resolve", tag(5))
    expect(d).toBe(`sync failed: share link did not resolve | ${tag(5)}`)
    expect(runStartedAt(d)).toBe(CLICK + 5000)
    expect(stripRunTag(d)).toBe("sync failed: share link did not resolve")
  })
  it("is the bare tag when there is no detail, and null when there is neither", () => {
    expect(withRunTag(null, tag(1))).toBe(tag(1))
    expect(withRunTag("", "")).toBeNull()
    expect(withRunTag("agent alive", "")).toBe("agent alive")
  })
  it("keeps the detail short enough for the tag to survive", () => {
    const d = withRunTag("x".repeat(2000), tag(1))!
    expect(d.length).toBeLessThan(500)
    expect(runStartedAt(d)).toBe(CLICK + 1000)
  })
  it("treats rows without a tag as unknown", () => {
    expect(runStartedAt(null)).toBeNull()
    expect(runStartedAt("agent alive")).toBeNull()
    expect(runStartedAt("run_started_at=garbage")).toBeNull()
  })
})

describe("resolveSyncStatus", () => {
  it("is pending until a run that started after the click reports back", () => {
    expect(resolveSyncStatus([], CLICK)).toEqual({ state: "pending" })
  })

  it("is done when a run that started after the click stored a snapshot", () => {
    const s = resolveSyncStatus([row("stored", 40, tag(8), "snap-1")], CLICK)
    expect(s).toEqual({ state: "done", at: at(40), outcome: "stored", snapshot_id: "snap-1" })
  })

  it("counts a deduped run as done: the spreadsheets were read, nothing changed", () => {
    expect(resolveSyncStatus([row("deduped", 30, tag(6), "snap-0")], CLICK)).toMatchObject({ state: "done", outcome: "deduped" })
  })

  it("ignores a run that was already under way when the click landed", () => {
    // started 20s before the click, finished 10s after: it may have missed the edit
    expect(resolveSyncStatus([row("stored", 10, tag(-20), "old")], CLICK)).toEqual({ state: "pending" })
  })

  it("ignores rows from before runs carried a start time", () => {
    expect(resolveSyncStatus([row("stored", 15, null, "legacy"), row("heartbeat", 16, "agent alive")], CLICK)).toEqual({ state: "pending" })
  })

  it("accepts a scheduled run that started after the click, not only the dispatched one", () => {
    const s = resolveSyncStatus([row("stored", 25, tag(2), "sched"), row("stored", 70, tag(30), "mine")], CLICK)
    expect(s).toMatchObject({ state: "done", snapshot_id: "sched" })
  })

  it("reports a failed run with its reason", () => {
    const s = resolveSyncStatus([row("heartbeat", 20, `sync failed: share link did not resolve | ${tag(4)}`)], CLICK)
    expect(s).toEqual({ state: "failed", at: at(20), reason: "share link did not resolve" })
  })

  it("reports a rejected snapshot as a failure", () => {
    const s = resolveSyncStatus([row("rejected", 20, `facts missing | ${tag(4)}`)], CLICK)
    expect(s).toMatchObject({ state: "failed" })
    expect((s as { reason: string }).reason).toContain("facts missing")
  })

  it("lets a later success win over an earlier failure", () => {
    const s = resolveSyncStatus([
      row("heartbeat", 20, `sync failed: timed out | ${tag(2)}`),
      row("stored", 80, tag(30), "mine"),
    ], CLICK)
    expect(s).toMatchObject({ state: "done", snapshot_id: "mine" })
  })

  it("does not mistake an ordinary heartbeat for a failure", () => {
    expect(resolveSyncStatus([row("heartbeat", 20, `agent alive | ${tag(2)}`)], CLICK)).toEqual({ state: "pending" })
  })

  it("orders by when rows were written, not by input order", () => {
    const s = resolveSyncStatus([row("stored", 90, tag(40), "second"), row("stored", 45, tag(5), "first")], CLICK)
    expect(s).toMatchObject({ snapshot_id: "first" })
  })
})

describe("parseSince", () => {
  const now = CLICK + 30_000
  it("accepts a recent ISO time", () => {
    expect(parseSince(at(0), now)).toBe(CLICK)
  })
  it("rejects garbage, far-future and stale values", () => {
    expect(parseSince(undefined, now)).toBeNull()
    expect(parseSince("soon", now)).toBeNull()
    expect(parseSince(at(5 * 60), now)).toBeNull()
    expect(parseSince(at(-2 * 60 * 60), now)).toBeNull()
    expect(parseSince(["a"], now)).toBeNull()
  })
})
