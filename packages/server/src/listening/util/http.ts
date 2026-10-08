/**
 * Fetch with a deadline that covers the whole response, body included.
 * AOS measured a lane that sent headers then trickled the body forever; a
 * headers-only timeout let it hold the entire scan. Here one AbortController
 * bounds connect + headers + body, and it also follows the run's cancel signal.
 */
import { USER_AGENT } from "../config.js"

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export class DeadlineError extends Error {
  constructor(public ms: number) {
    super(`timed out after ${Math.round(ms / 1000)}s`)
    this.name = "DeadlineError"
  }
}

export interface FetchOpts {
  deadlineMs: number
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Retry once on 429/5xx/network error when the deadline still allows it. */
  retry?: boolean
  method?: string
  body?: string
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

let _fetch: FetchLike = (url, init) => fetch(url, init)

/** Test seam: swap the network for fixtures. */
export function setFetch(f: FetchLike): void {
  _fetch = f
}

export function resetFetch(): void {
  _fetch = (url, init) => fetch(url, init)
}

async function once(url: string, opts: FetchOpts, deadlineAt: number): Promise<{ status: number; text: string; headers: Headers }> {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw new DeadlineError(opts.deadlineMs)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DeadlineError(opts.deadlineMs)), remaining)
  const onOuter = () => ctrl.abort(opts.signal?.reason)
  opts.signal?.addEventListener("abort", onOuter, { once: true })
  try {
    const res = await _fetch(url, {
      method: opts.method ?? "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
      body: opts.body,
      signal: ctrl.signal,
      redirect: "follow",
    })
    const text = await res.text()
    return { status: res.status, text, headers: res.headers }
  } catch (err) {
    if (ctrl.signal.aborted) {
      const reason = ctrl.signal.reason
      if (reason instanceof DeadlineError) throw reason
      throw opts.signal?.reason ?? reason ?? err
    }
    throw err
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener("abort", onOuter)
  }
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

export async function fetchText(url: string, opts: FetchOpts): Promise<string> {
  const deadlineAt = Date.now() + opts.deadlineMs
  let attempt = 0
  for (;;) {
    attempt++
    try {
      const r = await once(url, opts, deadlineAt)
      if (r.status >= 200 && r.status < 300) return r.text
      if (opts.retry && attempt === 1 && retryable(r.status) && deadlineAt - Date.now() > 2500) {
        await sleep(800, opts.signal)
        continue
      }
      throw new HttpError(r.status, `HTTP ${r.status}`, r.text.slice(0, 600))
    } catch (err) {
      if (err instanceof HttpError || err instanceof DeadlineError) throw err
      if (opts.signal?.aborted) throw opts.signal.reason ?? err
      if (opts.retry && attempt === 1 && deadlineAt - Date.now() > 2500) {
        await sleep(800, opts.signal)
        continue
      }
      throw err
    }
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } })
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(200, "response was not JSON", text.slice(0, 300))
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

/** Run async work over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

/** Short human reason for a failure, safe to show in the UI. */
export function describeError(err: unknown): string {
  if (err instanceof DeadlineError) return err.message
  if (err instanceof HttpError) {
    if (err.status === 429) return "rate limited (429)"
    if (err.status === 403) return "access refused (403)"
    return err.message
  }
  if (err instanceof Error) return err.message.slice(0, 140)
  return String(err).slice(0, 140)
}
