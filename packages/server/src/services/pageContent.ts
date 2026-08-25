/**
 * Lightweight page-content fetcher for the migration worksheet (Slice B).
 * DynoMapper's inventory/body endpoint is broken, so we fetch pages ourselves
 * (same UA + SSRF guard as the URL Scanner) and extract just what the AI needs
 * to score audit dimensions, pull keywords, and draft copy.
 */
import * as cheerio from "cheerio"
import { isPublicUrl, safeFetch } from "../lib/safeFetch.js"

export interface PageContent {
  url: string
  ok: boolean
  status: number | null
  title: string
  h1: string
  metaDescription: string
  headings: string[]
  /** cleaned visible body text, truncated */
  text: string
  wordCount: number
  images: number
  pdfs: string[]
  internalLinks: number
  externalLinks: number
  error?: string
}

const MAX_TEXT_CHARS = 6000

export async function fetchPageContent(url: string, timeoutMs = 12000): Promise<PageContent> {
  const empty: PageContent = {
    url,
    ok: false,
    status: null,
    title: "",
    h1: "",
    metaDescription: "",
    headings: [],
    text: "",
    wordCount: 0,
    images: 0,
    pdfs: [],
    internalLinks: 0,
    externalLinks: 0,
  }
  if (!isPublicUrl(url)) return { ...empty, error: "non-public URL" }

  // safeFetch re-validates every redirect hop, so a public URL can't bounce us
  // onto an internal address.
  let res: Response
  try {
    res = await safeFetch(url, {
      timeoutMs,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)" },
    })
  } catch (err: any) {
    return { ...empty, error: err?.name === "AbortError" ? "timeout" : err?.message || "fetch failed" }
  }

  const status = res.status
  const ctype = res.headers.get("content-type") || ""
  if (!ctype.includes("text/html")) {
    return { ...empty, status, ok: res.ok, error: `non-html (${ctype.split(";")[0] || "unknown"})` }
  }

  let html: string
  try {
    html = await res.text()
  } catch {
    return { ...empty, status, error: "body read failed" }
  }

  const $ = cheerio.load(html)
  $("script, style, noscript, template, svg").remove()

  const title = $("title").first().text().trim()
  const h1 = $("h1").first().text().trim()
  const metaDescription = ($('meta[name="description"]').attr("content") || "").trim()
  const headings: string[] = []
  $("h1, h2, h3").each((_i, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim()
    if (t) headings.push(t)
  })

  // Prefer <main>/<article> if present, else body.
  const scope = $("main").length ? $("main") : $("article").length ? $("article") : $("body")
  const text = scope.text().replace(/\s+/g, " ").trim()
  const wordCount = text ? text.split(/\s+/).length : 0

  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ""
    }
  })()
  let internalLinks = 0
  let externalLinks = 0
  const pdfs = new Set<string>()
  $("a[href]").each((_i, el) => {
    const href = ($(el).attr("href") || "").trim()
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
    let abs: string
    try {
      abs = new URL(href, url).toString()
    } catch {
      return
    }
    if (/\.pdf($|\?)/i.test(abs)) pdfs.add(abs)
    try {
      new URL(abs).hostname === host ? internalLinks++ : externalLinks++
    } catch {
      /* ignore */
    }
  })

  return {
    url,
    ok: res.ok,
    status,
    title,
    h1,
    metaDescription,
    headings: headings.slice(0, 40),
    text: text.slice(0, MAX_TEXT_CHARS),
    wordCount,
    images: $("img").length,
    pdfs: Array.from(pdfs).slice(0, 25),
    internalLinks,
    externalLinks,
  }
}

/** Fetch many URLs with a bounded concurrency pool. Order-independent; returns a url→content map. */
export async function fetchContentMany(
  urls: string[],
  opts?: { concurrency?: number; timeoutMs?: number; cap?: number }
): Promise<Map<string, PageContent>> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 8, 16))
  const cap = opts?.cap ?? 500
  const list = urls.slice(0, cap)
  const out = new Map<string, PageContent>()
  let idx = 0
  async function worker() {
    while (idx < list.length) {
      const my = idx++
      const url = list[my]!
      const content = await fetchPageContent(url, opts?.timeoutMs)
      out.set(url, content)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()))
  return out
}
