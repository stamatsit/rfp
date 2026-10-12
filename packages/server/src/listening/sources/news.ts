/**
 * Google News RSS: keyless context lane. News is not "people talking", so the
 * report keeps it out of sentiment and shows it as context.
 */
import { DEADLINES_MS } from "../config.js"
import { cacheKey, TTL, type ResponseCache } from "../cache.js"
import { fetchText } from "../util/http.js"
import { clip, decodeEntities, stripHtml } from "../util/text.js"
import type { RawItem } from "../types.js"
import type { DateWindow } from "../window.js"

/** Google News search operators for a range: "when:7d" for the last N days, "after: before:" for fixed dates. */
export function newsDateOperators(w: DateWindow): string {
  if (w.fixed && w.after && w.before) {
    // "before:" excludes its own day, so name the day after the last one.
    const end = new Date(w.before.getTime() + 86400e3)
    return ` after:${w.after.toISOString().slice(0, 10)} before:${end.toISOString().slice(0, 10)}`
  }
  return w.days ? ` when:${w.days}d` : ""
}

export function parseNewsRss(xml: string, max = 15): RawItem[] {
  const out: RawItem[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!
    const tag = (name: string) => {
      const t = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
      return t ? decodeEntities(t[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim() : ""
    }
    const link = tag("link")
    if (!link) continue
    const source = tag("source")
    let title = tag("title")
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    const pub = tag("pubDate")
    out.push({
      url: link,
      platform: "news",
      kind: "article",
      title,
      text: clip(stripHtml(tag("description")).replace(title, "").trim() || title, 400),
      author: source || null,
      publishedAt: pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null,
      engagement: null,
      lane: "news",
      depth: "snippet",
    })
    if (out.length >= max) break
  }
  return out
}

export class NewsSource {
  constructor(private cache: ResponseCache) {}

  async harvest(q: string, window: DateWindow, signal?: AbortSignal): Promise<RawItem[]> {
    const query = `${q}${newsDateOperators(window)}`
    const key = cacheKey({ p: "news", q: query })
    let xml = await this.cache.get<string>(key)
    if (!xml) {
      const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" })
      xml = await fetchText(`https://news.google.com/rss/search?${params}`, { deadlineMs: DEADLINES_MS.news, signal, retry: true })
      await this.cache.set(key, xml, TTL.news)
    }
    return parseNewsRss(xml)
  }
}
