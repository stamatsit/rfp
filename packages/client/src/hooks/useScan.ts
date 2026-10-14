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
  /** The topic, for the tab title and the notification when the scan ends. */
  label: string | null
  /** Show a browser notification when this scan ends while the tab is in the background. */
  notify: boolean
}

const NOTIFY_KEY = "ti-notify"

/** Notifications are on when they were turned on before and the browser still allows them. */
function notifyPreferred(): boolean {
  try {
    return typeof Notification !== "undefined" && Notification.permission === "granted" && window.localStorage.getItem(NOTIFY_KEY) === "1"
  } catch {
    return false
  }
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
  label: null,
  notify: false,
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
  const before = current
  current = typeof next === "function" ? next(current) : next
  if ((before.phase === "running" || before.phase === "starting") && before.runId === current.runId && (current.phase === "done" || current.phase === "failed")) signalEnd(current)
  listeners.forEach((l) => l())
}

/**
 * A scan takes minutes, so people switch tabs. When it ends out of sight, the
 * tab title says so until they come back, and a notification shows if they
 * asked for one.
 */
function signalEnd(s: ScanState) {
  if (typeof document === "undefined" || !document.hidden) return
  const label = s.label ?? "your topic"
  const ok = s.phase === "done"
  const before = document.title
  document.title = ok ? `Ready: ${label}` : `Scan stopped: ${label}`
  const restore = () => {
    if (document.hidden) return
    if (document.title.startsWith("Ready: ") || document.title.startsWith("Scan stopped: ")) document.title = before
    document.removeEventListener("visibilitychange", restore)
  }
  document.addEventListener("visibilitychange", restore)
  if (!s.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return
  try {
    const n = new Notification(ok ? "Your scan is ready" : "Your scan did not finish", { body: label, tag: s.runId ?? undefined })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Some browsers only allow notifications from a service worker; the tab title still says it.
  }
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

async function start(req: ScanRequest, label?: string): Promise<void> {
  streamAbort?.abort()
  stopPolling()
  const ctrl = new AbortController()
  streamAbort = ctrl
  const trigger: RunTrigger = req.kind === "new" ? "initial" : req.kind
  commit({ ...initial, phase: "starting", trigger, startedAt: Date.now(), topicId: req.kind === "new" ? null : req.topicId, label: label ?? (req.kind === "new" ? req.query : null), notify: notifyPreferred() })
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
function attach(topicId: string, runId: string, startedAt: string, trigger: RunTrigger, label?: string) {
  if (current.runId === runId && (current.phase === "running" || current.phase === "starting")) return
  streamAbort?.abort()
  commit({ ...initial, phase: "running", topicId, runId, trigger, startedAt: new Date(startedAt).getTime(), detached: true, label: label ?? null, notify: notifyPreferred() })
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

/**
 * Turn the notification for this scan (and later ones) on or off. Asks the
 * browser the first time. Resolves to what actually happened.
 */
async function setNotify(on: boolean): Promise<"on" | "off" | "blocked"> {
  if (!on || typeof Notification === "undefined") {
    try {
      window.localStorage.setItem(NOTIFY_KEY, "0")
    } catch {
      // storage blocked: the choice lasts for this scan only
    }
    commit((s) => ({ ...s, notify: false }))
    return typeof Notification === "undefined" && on ? "blocked" : "off"
  }
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  if (permission !== "granted") {
    commit((s) => ({ ...s, notify: false }))
    return "blocked"
  }
  try {
    window.localStorage.setItem(NOTIFY_KEY, "1")
  } catch {
    // as above
  }
  commit((s) => ({ ...s, notify: true }))
  return "on"
}

const actions = { start, attach, cancel, reset, setNotify }

export function useScan() {
  const state = useSyncExternalStore(subscribe, () => current)
  return { state, ...actions }
}
