/**
 * Google Programmable Search (Custom Search JSON API).
 * Works only with a key from a Google Cloud project that had the API before
 * Google closed it to new customers (setup notes are kept outside this repo).
 * The API shuts down 2027-01-01; SearchProvider is the seam a replacement
 * (SerperProvider) plugs into.
 */
import { DEADLINES_MS } from "../config.js"
import { cacheKey, TTL, type ResponseCache } from "../cache.js"
import { fetchJson, HttpError } from "../util/http.js"
import { decodeEntities } from "../util/text.js"
import { platformOf } from "../util/url.js"
import type { Engagement, RawItem } from "../types.js"

export interface SearchRequest {
  q: string
  sites: string[]
  /** 1-based result offset: 1, 11, ... 91. */
  start: number
  dateRestrict: string | null
}

export interface SearchPage {
  items: RawItem[]
  /** Raw hit count on this page (before any filtering). */
  returned: number
  /** Next offset, or null when Google has nothing more for this query. */
  nextStart: number | null
  fromCache: boolean
  /** Which provider answered (for per-provider call counts). */
  provider?: string
}

export interface SearchProvider {
  readonly name: string
  search(req: SearchRequest, laneId: string, signal?: AbortSignal): Promise<SearchPage>
  /** A coverage note about how this run was served, e.g. a mid-run switch. */
  note?(): string | null
}

/** Builds `q` for a site group: one site uses `site:`, several use an OR group. */
export function siteScopedQuery(q: string, sites: string[]): string {
  if (sites.length === 0) return q
  if (sites.length === 1) return `${q} site:${sites[0]}`
  return `${q} (${sites.map((s) => `site:${s}`).join(" OR ")})`
}

interface PseResponse {
  items?: Array<{
    link: string
    title?: string
    snippet?: string
    displayLink?: string
    pagemap?: Record<string, Array<Record<string, string>>>
  }>
  queries?: { nextPage?: Array<{ startIndex: number }> }
  searchInformation?: { totalResults?: string }
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/** Google prefixes many snippets with "Mar 3, 2025 ..." or "4 days ago ...". */
export function snippetDate(snippet: string, now = new Date()): string | null {
  const abs = snippet.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\b/)
  if (abs) {
    const mon = MONTHS[abs[1]!.toLowerCase()]
    if (mon !== undefined) return new Date(Date.UTC(Number(abs[3]), mon, Number(abs[2]))).toISOString()
  }
  const rel = snippet.match(/^(\d{1,3}) (minute|hour|day|week|month|year)s? ago\b/)
  if (rel) {
    const n = Number(rel[1])
    const unitMs: Record<string, number> = {
      minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3,
    }
    return new Date(now.getTime() - n * unitMs[rel[2]!]!).toISOString()
  }
  return null
}

function stripSnippetDate(snippet: string): string {
  return snippet.replace(/^([A-Z][a-z]{2} \d{1,2}, \d{4}|\d{1,3} (minute|hour|day|week|month|year)s? ago)\s*\.\.\.\s*/, "")
}

type Pagemap = Record<string, Array<Record<string, string>>> | undefined

function pagemapDate(pm: Pagemap): string | null {
  const meta = pm?.["metatags"]?.[0]
  const cands = [
    meta?.["article:published_time"],
    meta?.["og:published_time"],
    meta?.["datepublished"],
    pm?.["discussionforumposting"]?.[0]?.["datepublished"],
    pm?.["socialmediaposting"]?.[0]?.["datepublished"],
    pm?.["videoobject"]?.[0]?.["uploaddate"],
  ]
  for (const c of cands) {
    if (c && !Number.isNaN(Date.parse(c))) return new Date(c).toISOString()
  }
  return null
}

function pagemapEngagement(pm: Pagemap): Engagement | null {
  const post = pm?.["discussionforumposting"]?.[0] ?? pm?.["socialmediaposting"]?.[0]
  const comments = Number(post?.["commentcount"])
  const score = Number(post?.["upvotecount"] ?? post?.["interactioncount"])
  const out: Engagement = {}
  if (Number.isFinite(comments) && comments > 0) out.comments = comments
  if (Number.isFinite(score) && score > 0) out.score = score
  return Object.keys(out).length ? out : null
}

export class PseProvider implements SearchProvider {
  readonly name = "google-pse"
  constructor(
    private apiKey: string,
    private engineId: string,
    private cache: ResponseCache,
  ) {}

  async search(req: SearchRequest, laneId: string, signal?: AbortSignal): Promise<SearchPage> {
    const q = siteScopedQuery(req.q, req.sites)
    const key = cacheKey({ p: "pse", cx: this.engineId, q, start: req.start, d: req.dateRestrict })
    let data = await this.cache.get<PseResponse>(key)
    const fromCache = !!data
    if (!data) {
      const params = new URLSearchParams({ key: this.apiKey, cx: this.engineId, q, num: "10", start: String(req.start) })
      if (req.dateRestrict) params.set("dateRestrict", req.dateRestrict)
      try {
        data = await fetchJson<PseResponse>(`https://www.googleapis.com/customsearch/v1?${params}`, {
          deadlineMs: DEADLINES_MS.search,
          signal,
          retry: true,
        })
      } catch (err) {
        throw explainPseError(err)
      }
      await this.cache.set(key, data, TTL.search)
    }
    const items: RawItem[] = (data.items ?? [])
      .filter((it) => it.link)
      .map((it) => {
        const snippet = decodeEntities((it.snippet ?? "").replace(/\s+/g, " ").trim())
        return {
          url: it.link,
          platform: platformOf(it.link),
          kind: kindFor(it.link),
          title: decodeEntities(it.title ?? "").replace(/ : r\/\w+$| - Reddit$| \| Reddit$/i, "").trim(),
          text: stripSnippetDate(snippet),
          publishedAt: pagemapDate(it.pagemap) ?? snippetDate(snippet),
          engagement: pagemapEngagement(it.pagemap),
          lane: laneId,
          depth: "snippet" as const,
        }
      })
    const returned = data.items?.length ?? 0
    const next = data.queries?.nextPage?.[0]?.startIndex
    const nextStart = returned === 10 && next && next <= 91 ? next : null
    return { items, returned, nextStart, fromCache, provider: this.name }
  }
}

function kindFor(url: string): RawItem["kind"] {
  const p = platformOf(url)
  if (p === "youtube") return "video"
  if (p === "reviews") return "review"
  if (p === "news" || p === "other") return "article"
  return "post"
}

/** Turns Google's error bodies into reasons a person can act on. */
export function explainPseError(err: unknown): Error {
  if (err instanceof HttpError) {
    const body = err.body ?? ""
    if (err.status === 429 || /quota|rateLimitExceeded|dailyLimitExceeded/i.test(body)) {
      return new Error("Google search daily allowance is used up (resets at midnight Pacific)")
    }
    if (err.status === 403 && /does not have the access/i.test(body)) {
      return new Error("Google search key is not from the grandfathered project")
    }
    if (err.status === 400 && /API key not valid/i.test(body)) {
      return new Error("Google search key is invalid")
    }
    return new Error(`Google search error ${err.status}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}
