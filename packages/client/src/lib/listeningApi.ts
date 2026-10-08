/**
 * Typed client for /api/listening (Topic Ideation).
 * Scans stream progress as server-sent events over a POST; the scan keeps
 * running server-side if the stream drops, so callers fall back to polling
 * the run (see useScan).
 */
import { fetchWithCredentials, handleResponse } from "./api"
import { addCsrfHeader } from "./csrfToken"
import type { AccessInfo, RunEvent, RunSummary, TimeWindow, TopicDetail, TopicRow } from "@/types/listening"

const BASE = "/api/listening"

export class ListeningApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = "ListeningApiError"
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetchWithCredentials(`${BASE}${path}`)
  return handleResponse<T>(res)
}

async function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const headers = await addCsrfHeader(body ? { "Content-Type": "application/json" } : {})
  const res = await fetchWithCredentials(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new ListeningApiError(err.error ?? `Request failed (${res.status})`, res.status, err.code)
  }
  return res.json() as Promise<T>
}

export const listeningApi = {
  access: () => get<AccessInfo>("/access"),
  topics: () => get<{ topics: TopicRow[] }>("/topics"),
  topic: (id: string) => get<TopicDetail>(`/topics/${id}`),
  run: (id: string) => get<{ run: RunSummary }>(`/runs/${id}`),
  cancel: (runId: string) => send<{ ok: true }>("POST", `/runs/${runId}/cancel`),
  remove: (id: string) => send<{ ok: true }>("DELETE", `/topics/${id}`),
}

export type ScanRequest =
  | { kind: "new"; query: string; timeWindow: TimeWindow }
  | { kind: "rescan" | "rebuild"; topicId: string }

/**
 * Start a scan and stream its events. Resolves when the stream ends (done,
 * error, or dropped connection). Throws ListeningApiError when the server
 * refuses to start (bad input, allowance spent, a scan already running).
 */
export async function streamScan(req: ScanRequest, onEvent: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  const path = req.kind === "new" ? "/topics" : `/topics/${req.topicId}/${req.kind}`
  const body = req.kind === "new" ? { query: req.query, timeWindow: req.timeWindow } : {}
  const headers = await addCsrfHeader({ "Content-Type": "application/json", Accept: "text/event-stream" })
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, credentials: "include", body: JSON.stringify(body), signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new ListeningApiError(err.error ?? `Request failed (${res.status})`, res.status, err.code)
  }
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("")
        if (!data) continue
        try {
          onEvent(JSON.parse(data) as RunEvent)
        } catch {
          // ignore a malformed frame
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return
    // Network drop: the scan continues on the server; the caller polls.
  }
}
