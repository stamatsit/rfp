/**
 * Drives Topic Ideation scans in the browser. State lives in a module-level
 * store, not in a component: the app remounts pages on every path change
 * (PageTransition is keyed by pathname), and a scan must keep its live stream
 * when you move from the topic list to the topic, or browse elsewhere in the
 * app and come back. If the stream drops, or the page reloads mid-scan, it
 * attaches to the run and polls until the server settles it. The scan itself
 * never depends on this page staying open.
 */
import { useSyncExternalStore } from "react"
import { ListeningApiError, listeningApi, streamScan, type ScanRequest } from "@/lib/listeningApi"
import type { LaneResult, Plan, RunEvent, RunTrigger, Stage } from "@/types/listening"

export type ScanPhase = "idle" | "starting" | "running" | "done" | "failed" | "cancelled"

export interface ScanState {
  phase: ScanPhase
  trigger: RunTrigger | null
  topicId: string | null
  runId: string | null
  startedAt: number | null
  stage: Stage | null
  plan: Plan | null
  lanes: LaneResult[]
  toRead: number | null
  fullyRead: number | null
  newItems: number | null
  toLabel: number | null
  labeled: number
  /** True when progress is inferred by polling rather than streamed. */
  detached: boolean
  error: string | null
  errorCode: string | null
}

const initial: ScanState = {
  phase: "idle",
  trigger: null,
  topicId: null,
  runId: null,
  startedAt: null,
  stage: null,
  plan: null,
  lanes: [],
  toRead: null,
  fullyRead: null,
  newItems: null,
  toLabel: null,
  labeled: 0,
  detached: false,
  error: null,
  errorCode: null,
}

export function reduce(s: ScanState, e: RunEvent): ScanState {
  switch (e.type) {
    case "started":
      return { ...s, phase: "running", topicId: e.topicId, runId: e.runId, trigger: e.trigger }
    case "stage":
      if (e.stage === "read") return { ...s, stage: "read", toRead: Number(e.detail ?? 0) }
      if (e.stage === "label") return { ...s, stage: "label", toLabel: Number(e.detail ?? 0) }
      return { ...s, stage: e.stage }
    case "plan":
      return { ...s, plan: e.plan }
    case "lane":
      return { ...s, lanes: [...s.lanes.filter((l) => l.lane !== e.lane.lane), e.lane] }
    case "counts":
      return {
        ...s,
        newItems: e.newItems ?? s.newItems,
        fullyRead: e.fullyRead ?? s.fullyRead,
        labeled: e.labeled ?? s.labeled,
      }
    case "done":
      return { ...s, phase: "done", stage: "save" }
    case "error":
      return { ...s, phase: /cancel/i.test(e.message) ? "cancelled" : "failed", error: e.message }
    default:
      return s
  }
}

// ─── module-level store ─────────────────────────────────────────────────────

let current: ScanState = initial
const listeners = new Set<() => void>()
let streamAbort: AbortController | null = null
let pollTimer: number | null = null

function commit(next: ScanState | ((s: ScanState) => ScanState)) {
  current = typeof next === "function" ? next(current) : next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function stopPolling() {
  if (pollTimer) window.clearTimeout(pollTimer)
  pollTimer = null
}

/** Poll a run until it leaves "running". */
function poll(runId: string) {
  stopPolling()
  const tick = async () => {
    if (current.runId !== runId) return
    try {
      const { run } = await listeningApi.run(runId)
      if (current.runId !== runId) return
      if (run.status === "running") {
        pollTimer = window.setTimeout(tick, 3000)
        return
      }
      const phase: ScanPhase = run.status === "complete" ? "done" : run.status === "cancelled" ? "cancelled" : "failed"
      commit((s) => ({ ...s, phase, error: run.error, newItems: run.newItems }))
    } catch {
      pollTimer = window.setTimeout(tick, 5000)
    }
  }
  void tick()
}

async function start(req: ScanRequest): Promise<void> {
  streamAbort?.abort()
  stopPolling()
  const ctrl = new AbortController()
  streamAbort = ctrl
  const trigger: RunTrigger = req.kind === "new" ? "initial" : req.kind
  commit({ ...initial, phase: "starting", trigger, startedAt: Date.now(), topicId: req.kind === "new" ? null : req.topicId })
  try {
    await streamScan(req, (e) => !ctrl.signal.aborted && commit((s) => reduce(s, e)), ctrl.signal)
  } catch (err) {
    if (ctrl.signal.aborted) return
    const e = err as ListeningApiError
    const message = e.status === 401 ? "Your session ended. Refresh the page and sign in again to scan." : e.message ?? "Could not start the scan"
    commit((s) => ({ ...s, phase: "failed", error: message, errorCode: e.code ?? (e.status === 401 ? "session" : null) }))
    return
  }
  if (ctrl.signal.aborted) return
  if (current.phase === "running" && current.runId) {
    // Stream ended without a verdict: the connection dropped. Keep following the run.
    commit((s) => ({ ...s, detached: true }))
    poll(current.runId)
    return
  }
  if (current.phase === "starting") {
    commit((s) => ({ ...s, phase: "failed", error: "The scan could not start. Check your connection and try again." }))
  }
}

/** Follow a run already in progress (page reload, second tab). */
function attach(topicId: string, runId: string, startedAt: string, trigger: RunTrigger) {
  if (current.runId === runId && (current.phase === "running" || current.phase === "starting")) return
  streamAbort?.abort()
  commit({ ...initial, phase: "running", topicId, runId, trigger, startedAt: new Date(startedAt).getTime(), detached: true })
  poll(runId)
}

async function cancel(): Promise<void> {
  const runId = current.runId
  if (!runId) {
    streamAbort?.abort()
    commit(initial)
    return
  }
  try {
    await listeningApi.cancel(runId)
  } catch {
    // The run may have just finished; the stream or poll will settle it.
  }
}

function reset() {
  streamAbort?.abort()
  stopPolling()
  commit(initial)
}

const actions = { start, attach, cancel, reset }

export function useScan() {
  const state = useSyncExternalStore(subscribe, () => current)
  return { state, ...actions }
}
