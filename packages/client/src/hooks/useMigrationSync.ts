/**
 * "Sync now" on the Migration Matrix. Asks the cloud sync to read the
 * spreadsheets right away, then waits until a run that started after the click
 * reports back; the rule for "after the click" lives on the server
 * (packages/server/src/services/migrationSync.ts). State is module-level: the
 * app remounts pages on every path change, so a sync keeps going while you
 * look at another page, and a reload in the middle of one picks it back up.
 * The sync itself runs in GitHub Actions and never depends on this page.
 */
import { useSyncExternalStore } from "react"
import { migrationApi } from "@/lib/api"

/** Which click a poll is about: the server's click time, and the browser's for the timeout. */
interface Watch { since: string; startedAt: number }

/**
 * End states carry `seq` (each is reported exactly once) and `at`: a
 * server-clock time, so "a newer read has arrived since" compares like with like.
 */
export type SyncState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | ({ phase: "syncing" } & Watch)
  | { phase: "done"; seq: number; at: number; outcome: "stored" | "deduped" }
  | ({ phase: "failed"; seq: number; at: number; reason: string } & Partial<Watch>)
  | { phase: "timeout"; seq: number; at: number }
  | { phase: "unavailable"; seq: number; at: number; note: string }

export const SYNC_POLL_MS = 4_000
export const SYNC_TIMEOUT_MS = 5 * 60_000
const STORE_KEY = "mm-sync"

let current: SyncState = { phase: "idle" }
let seq = 0
let claimed = 0
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

/**
 * The click still being listened for. A failure shown on the page keeps
 * listening until the timeout: a run queued behind the failed one can still
 * get the spreadsheets through, and then the failure turns into "Synced".
 */
function watchOf(s: SyncState): Watch | null {
  if (s.phase === "syncing") return { since: s.since, startedAt: s.startedAt }
  if (s.phase === "failed" && s.since && s.startedAt !== undefined) return { since: s.since, startedAt: s.startedAt }
  return null
}

function remember(value: Watch | null) {
  try {
    if (value) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(STORE_KEY)
  } catch { /* storage blocked: a reload just forgets the sync */ }
}

function set(next: SyncState) {
  current = next
  if (!watchOf(next) && timer) { clearTimeout(timer); timer = null }
  if (next.phase !== "syncing") remember(null)
  listeners.forEach((l) => l())
}

type End =
  | { phase: "done"; outcome: "stored" | "deduped"; at?: number }
  | ({ phase: "failed"; reason: string; at?: number } & Partial<Watch>)
  | { phase: "timeout"; at: number }
  | { phase: "unavailable"; note: string; at?: number }

const finish = (s: End) => set({ ...s, seq: ++seq, at: s.at ?? Date.now() } as SyncState)

function follow(w: Watch) {
  set({ phase: "syncing", ...w })
  remember(w)
  timer = setTimeout(poll, SYNC_POLL_MS)
}

async function poll() {
  timer = null
  const s = current
  const w = watchOf(s)
  if (!w) return
  if (Date.now() - w.startedAt > SYNC_TIMEOUT_MS) {
    // a failure already on screen just stops listening; a silent wait says so
    if (s.phase === "syncing") finish({ phase: "timeout", at: Date.parse(w.since) })
    return
  }
  try {
    const r = await migrationApi.getSyncStatus(w.since)
    if (current !== s) return
    if (r.state === "done") return finish({ phase: "done", outcome: r.outcome, at: Date.parse(r.at) })
    if (r.state === "failed" && s.phase === "syncing") finish({ phase: "failed", reason: r.reason, at: Date.parse(r.at), ...w })
  } catch { /* a network blip: keep asking until the timeout */ }
  if (watchOf(current)?.since === w.since && !timer) timer = setTimeout(poll, SYNC_POLL_MS)
}

export async function startSync(): Promise<void> {
  if (current.phase === "requesting" || current.phase === "syncing") return
  set({ phase: "requesting" })
  try {
    const r = await migrationApi.syncNow()
    if (!r.triggered || !r.requested_at) return finish({ phase: "unavailable", note: r.note })
    follow({ since: r.requested_at, startedAt: Date.now() })
  } catch (e) {
    finish({ phase: "failed", reason: e instanceof Error ? e.message : "the sync could not be started" })
  }
}

/** True the first time an end state is seen, so its toast shows once per sync, not once per page visit. */
export function claimOutcome(n: number): boolean {
  if (n <= claimed) return false
  claimed = n
  return true
}

// A reload in the middle of a sync picks it back up; the timeout still counts from the click.
;(function resume() {
  let saved: { since?: unknown; startedAt?: unknown } | null = null
  try { saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || "null") } catch { saved = null }
  if (!saved || typeof saved.since !== "string" || typeof saved.startedAt !== "number") return
  if (Date.now() - saved.startedAt > SYNC_TIMEOUT_MS) return remember(null)
  follow({ since: saved.since, startedAt: saved.startedAt })
})()

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useMigrationSync(): SyncState {
  return useSyncExternalStore(subscribe, () => current)
}
