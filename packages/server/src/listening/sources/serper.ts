/**
 * Serper (google.serper.dev): Google results through a paid API, ~$1 per 1,000
 * searches, no shutdown date. Same SearchProvider contract as PseProvider, so
 * the engine cannot tell them apart. 1 credit per 10-result page.
 */
import { DEADLINES_MS } from "../config.js"
import { cacheKey, TTL, type ResponseCache } from "../cache.js"
import { fetchJson, HttpError } from "../util/http.js"
import { decodeEntities } from "../util/text.js"
import { platformOf } from "../util/url.js"
import type { RawItem } from "../types.js"
import { siteScopedQuery, snippetDate, type SearchPage, type SearchProvider, type SearchRequest } from "./pse.js"

interface SerperResponse {
  organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string; position?: number }>
  credits?: number
}

/** PSE-style dateRestrict ("y1", "m3") to Google's tbs. "m3" uses an explicit range. */
export function tbsFor(dateRestrict: string | null, now = new Date()): string | null {
  if (!dateRestrict) return null
  if (dateRestrict === "y1") return "qdr:y"
  const m = dateRestrict.match(/^([dwmy])(\d+)$/)
  if (!m) return null
  const n = Number(m[2])
  if (n === 1) return `qdr:${m[1]}`
  const days = { d: 1, w: 7, m: 31, y: 366 }[m[1] as "d" | "w" | "m" | "y"] * n
  const from = new Date(now.getTime() - days * 86400e3)
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
  return `cdr:1,cd_min:${fmt(from)},cd_max:${fmt(now)}`
}

export function explainSerperError(err: unknown): Error {
  if (err instanceof HttpError) {
    const body = err.body ?? ""
    if (/credit/i.test(body)) return new Error("Serper credits are used up (top up at serper.dev)")
    if (err.status === 401 || err.status === 403) return new Error("Serper key was refused")
    if (err.status === 429) return new Error("Serper rate limit hit")
    return new Error(`Serper error ${err.status}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function kindFor(url: string): RawItem["kind"] {
  const p = platformOf(url)
  if (p === "youtube") return "video"
  if (p === "reviews") return "review"
  if (p === "news" || p === "other") return "article"
  return "post"
}

export class SerperProvider implements SearchProvider {
  readonly name = "serper"
  constructor(
    private apiKey: string,
    private cache: ResponseCache,
  ) {}

  async search(req: SearchRequest, laneId: string, signal?: AbortSignal): Promise<SearchPage> {
    const q = siteScopedQuery(req.q, req.sites)
    const page = Math.floor((req.start - 1) / 10) + 1
    const tbs = tbsFor(req.dateRestrict)
    const key = cacheKey({ p: "serper", q, page, tbs })
    let data = await this.cache.get<SerperResponse>(key)
    const fromCache = !!data
    if (!data) {
      try {
        data = await fetchJson<SerperResponse>("https://google.serper.dev/search", {
          method: "POST",
          body: JSON.stringify({ q, num: 10, page, gl: "us", hl: "en", ...(tbs ? { tbs } : {}) }),
          headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
          deadlineMs: DEADLINES_MS.search,
          signal,
          retry: true,
        })
      } catch (err) {
        throw explainSerperError(err)
      }
      await this.cache.set(key, data, TTL.search)
    }
    const items: RawItem[] = (data.organic ?? [])
      .filter((o) => o.link)
      .map((o) => ({
        url: o.link!,
        platform: platformOf(o.link!),
        kind: kindFor(o.link!),
        title: decodeEntities(o.title ?? "").replace(/ : r\/\w+$| - Reddit$| \| Reddit$/i, "").trim(),
        text: decodeEntities((o.snippet ?? "").replace(/\s+/g, " ").trim()),
        publishedAt: o.date ? snippetDate(o.date) : null,
        engagement: null,
        lane: laneId,
        depth: "snippet" as const,
      }))
    const returned = data.organic?.length ?? 0
    return { items, returned, nextStart: returned >= 10 && req.start < 91 ? req.start + 10 : null, fromCache, provider: this.name }
  }
}

/**
 * Google first, Serper behind it. A hard Google failure (allowance used up,
 * key or engine refused, the 2027-01-01 shutdown) switches the rest of the run
 * to Serper; a one-off failure (timeout, 5xx) retries just that call on Serper.
 */
export class FallbackProvider implements SearchProvider {
  readonly name: string
  private switchedBecause: string | null = null
  constructor(
    private primary: SearchProvider,
    private secondary: SearchProvider,
  ) {
    this.name = `${primary.name}+${secondary.name}`
  }

  note(): string | null {
    return this.switchedBecause ? `Searches moved to ${this.secondary.name === "serper" ? "Serper" : this.secondary.name} partway through (${this.switchedBecause})` : null
  }

  async search(req: SearchRequest, laneId: string, signal?: AbortSignal): Promise<SearchPage> {
    if (!this.switchedBecause) {
      try {
        const p = await this.primary.search(req, laneId, signal)
        return { ...p, provider: p.provider ?? this.primary.name }
      } catch (err) {
        if (signal?.aborted) throw err
        const msg = err instanceof Error ? err.message : String(err)
        const hard = /allowance is used up|grandfathered|invalid|error 4\d\d/i.test(msg)
        if (hard) this.switchedBecause = `Google: ${msg.replace(/^Google search /i, "")}`
      }
    }
    const p = await this.secondary.search(req, laneId, signal)
    return { ...p, provider: p.provider ?? this.secondary.name }
  }
}
