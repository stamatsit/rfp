/**
 * Deep reader: opens a thread or page in full so the analysis sees the
 * conversation, not a two-line snippet, and turns top replies into their own
 * items (each linked to its comment). Reddit blocks most cloud IPs; when it
 * refuses, the optional Arctic Shift archive (LISTENING_REDDIT_ARCHIVE=true)
 * is tried, otherwise the item stays a snippet and coverage says why.
 */
import * as cheerio from "cheerio"
import { DEADLINES_MS, LIMITS } from "../config.js"
import { cacheKey, TTL, type ResponseCache } from "../cache.js"
import { describeError, fetchJson, fetchText } from "../util/http.js"
import { clip, decodeEntities, stripHtml } from "../util/text.js"
import { hostOf, platformOf, redditThreadId } from "../util/url.js"
import type { RawItem } from "../types.js"

export interface ReadResult {
  /** Full body for the source item, when read. */
  body: string | null
  publishedAt?: string | null
  engagement?: RawItem["engagement"]
  /** Replies turned into items. */
  comments: RawItem[]
  via: string
}

export class ReadRefused extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = "ReadRefused"
  }
}

const UNREADABLE = /(^|\.)(facebook|instagram|linkedin|tiktok|threads|quora)\.(com|net)$|bsky\.app$/

export function isReadable(url: string): boolean {
  const host = hostOf(url)
  if (!host || UNREADABLE.test(host)) return false
  if (host.endsWith("youtube.com") || host === "news.google.com") return false
  return true
}

function goodComment(body: string, author?: string | null): boolean {
  if (!body || body.length < 30) return false
  if (/^\[(deleted|removed)\]$/i.test(body.trim())) return false
  if (author && /^(automoderator|\[deleted\])$/i.test(author)) return false
  return true
}

// ─── Reddit ────────────────────────────────────────────────────────────────

interface RedditThing {
  kind: string
  data: {
    id: string
    title?: string
    selftext?: string
    body?: string
    author?: string
    score?: number
    num_comments?: number
    created_utc?: number
    permalink?: string
    subreddit?: string
    stickied?: boolean
  }
}

type RedditListing = Array<{ data: { children: RedditThing[] } }>

function redditCommentItems(threadUrl: string, comments: RedditThing["data"][]): RawItem[] {
  return comments
    .filter((c) => !c.stickied && goodComment(c.body ?? "", c.author))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, LIMITS.commentsPerThread)
    .map((c) => ({
      url: c.permalink ? `https://reddit.com${c.permalink}` : `${threadUrl.replace(/\/$/, "")}/_/${c.id}/`,
      platform: "reddit" as const,
      kind: "comment" as const,
      title: "",
      text: clip(decodeEntities(c.body ?? ""), LIMITS.maxItemChars),
      author: c.author ?? null,
      publishedAt: c.created_utc ? new Date(c.created_utc * 1000).toISOString() : null,
      engagement: { score: c.score ?? 0 },
      parentUrl: threadUrl,
      lane: "read:reddit",
      depth: "full" as const,
    }))
}

async function readReddit(url: string, signal: AbortSignal | undefined, archive: boolean): Promise<ReadResult> {
  const id = redditThreadId(url)
  if (!id) throw new ReadRefused("not a Reddit thread")
  const threadUrl = url
  try {
    const json = await fetchJson<RedditListing>(`https://www.reddit.com/comments/${id}.json?limit=100&sort=top&raw_json=1`, {
      deadlineMs: DEADLINES_MS.page,
      signal,
      headers: { "User-Agent": "StamatsTopicIdeation/1.0 (research tool; contact eric.yerke@stamats.com)" },
    })
    const post = json[0]?.data.children[0]?.data
    const comments = (json[1]?.data.children ?? []).filter((c) => c.kind === "t1").map((c) => c.data)
    return {
      body: post ? clip(`${post.title ?? ""}\n\n${decodeEntities(post.selftext ?? "")}`.trim(), LIMITS.maxPageChars) : null,
      publishedAt: post?.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
      engagement: post ? { score: post.score ?? 0, comments: post.num_comments ?? 0 } : null,
      comments: redditCommentItems(threadUrl, comments),
      via: "reddit",
    }
  } catch (err) {
    if (signal?.aborted) throw err
    if (!archive) throw new ReadRefused(`Reddit refused (${describeError(err)})`)
  }
  // Archive fallback.
  const base = "https://arctic-shift.photon-reddit.com/api"
  const posts = await fetchJson<{ data?: Array<RedditThing["data"]> }>(`${base}/posts/ids?ids=${id}`, {
    deadlineMs: DEADLINES_MS.page,
    signal,
  })
  const tree = await fetchJson<{ data?: RedditThing[] }>(`${base}/comments/tree?link_id=t3_${id}&limit=200`, {
    deadlineMs: DEADLINES_MS.page,
    signal,
  })
  const post = posts.data?.[0]
  const comments = (tree.data ?? []).filter((c) => c.kind === "t1").map((c) => c.data)
  return {
    body: post ? clip(`${post.title ?? ""}\n\n${decodeEntities(post.selftext ?? "")}`.trim(), LIMITS.maxPageChars) : null,
    publishedAt: post?.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
    engagement: post ? { score: post.score ?? 0, comments: post.num_comments ?? 0 } : null,
    comments: redditCommentItems(threadUrl, comments),
    via: "reddit-archive",
  }
}

// ─── Discourse (College Confidential) ──────────────────────────────────────

interface DiscourseTopic {
  title?: string
  created_at?: string
  posts_count?: number
  like_count?: number
  post_stream?: { posts?: Array<{ id: number; post_number: number; username?: string; cooked?: string; created_at?: string; like_count?: number }> }
}

async function readDiscourse(url: string, signal?: AbortSignal): Promise<ReadResult> {
  const u = new URL(url)
  const m = u.pathname.match(/^\/t\/([^/]+)\/(\d+)/)
  if (!m) throw new ReadRefused("not a Discourse topic")
  const base = `${u.protocol}//${u.host}/t/${m[1]}/${m[2]}`
  const json = await fetchJson<DiscourseTopic>(`${base}.json`, { deadlineMs: DEADLINES_MS.page, signal })
  const posts = json.post_stream?.posts ?? []
  const first = posts.find((p) => p.post_number === 1)
  const replies = posts
    .filter((p) => p.post_number > 1)
    .map((p) => ({ ...p, text: stripHtml(p.cooked ?? "") }))
    .filter((p) => goodComment(p.text, p.username))
    .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
    .slice(0, LIMITS.commentsPerThread)
  return {
    body: clip(`${json.title ?? ""}\n\n${stripHtml(first?.cooked ?? "")}`.trim(), LIMITS.maxPageChars),
    publishedAt: json.created_at ?? null,
    engagement: { comments: Math.max(0, (json.posts_count ?? 1) - 1), likes: json.like_count ?? 0 },
    comments: replies.map((p) => ({
      url: `${base}/${p.post_number}`,
      platform: "forums" as const,
      kind: "comment" as const,
      title: "",
      text: clip(p.text, LIMITS.maxItemChars),
      author: p.username ?? null,
      publishedAt: p.created_at ?? null,
      engagement: { likes: p.like_count ?? 0 },
      parentUrl: url,
      lane: "read:forum",
      depth: "full" as const,
    })),
    via: "discourse",
  }
}

// ─── Generic HTML (XenForo, Invision, articles, review pages) ──────────────

const POST_SELECTORS = [
  ".message-body .bbWrapper", // XenForo (studentdoctor.net)
  "[data-role='commentContent']", // Invision (allnurses)
  ".cPost_contentWrap [data-role='commentContent']",
  "article .comment-body",
]

export function extractPage(html: string, url: string): ReadResult {
  const $ = cheerio.load(html)
  $("script,style,noscript,svg,nav,header,footer,form,aside,iframe").remove()
  const published =
    $("meta[property='article:published_time']").attr("content") ??
    $("time[datetime]").first().attr("datetime") ??
    null

  const posts: string[] = []
  for (const sel of POST_SELECTORS) {
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim()
      if (t) posts.push(t)
    })
    if (posts.length) break
  }

  let body: string
  if (posts.length) {
    body = posts[0]!
  } else {
    const main = $("article").first().text() || $("main").first().text() || $("[role='main']").first().text() || $("body").text()
    body = main.replace(/\s+/g, " ").trim()
  }
  const title = $("meta[property='og:title']").attr("content") ?? $("title").first().text() ?? ""
  const platform = platformOf(url)
  const comments: RawItem[] = posts
    .slice(1)
    .filter((t) => goodComment(t))
    .slice(0, LIMITS.commentsPerThread)
    .map((t, i) => ({
      url: `${url}#reply-${i + 1}`,
      platform,
      kind: "comment" as const,
      title: "",
      text: clip(t, LIMITS.maxItemChars),
      author: null,
      publishedAt: null,
      engagement: null,
      parentUrl: url,
      lane: "read:page",
      depth: "full" as const,
    }))
  return {
    body: body ? clip(`${title.trim()}\n\n${body}`.trim(), LIMITS.maxPageChars) : null,
    publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
    comments,
    via: posts.length ? "forum-html" : "page-html",
  }
}

async function readHtml(url: string, signal?: AbortSignal): Promise<ReadResult> {
  const html = await fetchText(url, { deadlineMs: DEADLINES_MS.page, signal, headers: { Accept: "text/html" } })
  if (!/<html|<body|<article/i.test(html)) throw new ReadRefused("page did not return HTML")
  const r = extractPage(html, url)
  if (!r.body || r.body.length < 120) throw new ReadRefused("page needs a browser to render")
  return r
}

// ─── Entry point ───────────────────────────────────────────────────────────

export class PageReader {
  constructor(
    private cache: ResponseCache,
    private redditArchive = process.env["LISTENING_REDDIT_ARCHIVE"] === "true",
  ) {}

  async read(url: string, signal?: AbortSignal): Promise<ReadResult> {
    const key = cacheKey({ p: "read", url, a: this.redditArchive })
    const hit = await this.cache.get<ReadResult>(key)
    if (hit) return hit
    const host = hostOf(url)
    let r: ReadResult
    if (host.endsWith("reddit.com")) r = await readReddit(url, signal, this.redditArchive)
    else if (host === "talk.collegeconfidential.com") r = await readDiscourse(url, signal)
    else r = await readHtml(url, signal)
    await this.cache.set(key, r, TTL.page)
    return r
  }
}
