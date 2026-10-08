/**
 * YouTube Data API v3: videos for the topic, then top comments on the most
 * engaged videos. Comments are where the audience's own words are.
 * Quota (10,000 units/day): search.list 100, videos.list 1, commentThreads 1.
 */
import { DEADLINES_MS, LIMITS } from "../config.js"
import { cacheKey, TTL, type ResponseCache } from "../cache.js"
import { fetchJson, HttpError } from "../util/http.js"
import { clip, decodeEntities } from "../util/text.js"
import type { RawItem, TimeWindow } from "../types.js"

interface SearchResp {
  items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string } }>
  nextPageToken?: string
}

interface VideosResp {
  items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>
}

interface CommentsResp {
  items?: Array<{
    id: string
    snippet?: {
      topLevelComment?: {
        id: string
        snippet?: { textOriginal?: string; textDisplay?: string; authorDisplayName?: string; likeCount?: number; publishedAt?: string }
      }
      totalReplyCount?: number
    }
  }>
}

export interface YoutubeHarvest {
  items: RawItem[]
  units: number
  nextPageToken: string | null
  videos: number
  commentVideos: number
  notes: string[]
}

const API = "https://www.googleapis.com/youtube/v3"

function publishedAfter(tw: TimeWindow, now = Date.now()): string | null {
  if (tw === "any") return null
  const days = tw === "3m" ? 92 : 366
  return new Date(now - days * 86400e3).toISOString()
}

export class YoutubeSource {
  constructor(
    private apiKey: string,
    private cache: ResponseCache,
  ) {}

  private async get<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<{ data: T; cached: boolean }> {
    const key = cacheKey({ p: "yt", path, ...params })
    const hit = await this.cache.get<T>(key)
    if (hit) return { data: hit, cached: true }
    const qs = new URLSearchParams({ ...params, key: this.apiKey })
    const data = await fetchJson<T>(`${API}/${path}?${qs}`, { deadlineMs: DEADLINES_MS.youtube, signal, retry: true })
    await this.cache.set(key, data, TTL.youtube)
    return { data, cached: false }
  }

  async harvest(
    q: string,
    tw: TimeWindow,
    opts: { pageToken?: string | null; knownVideoIds?: Set<string>; signal?: AbortSignal },
  ): Promise<YoutubeHarvest> {
    const notes: string[] = []
    let units = 0
    const params: Record<string, string> = {
      part: "snippet",
      type: "video",
      q,
      maxResults: String(LIMITS.youtubeVideos),
      relevanceLanguage: "en",
      order: "relevance",
      safeSearch: "moderate",
    }
    const after = publishedAfter(tw)
    if (after) params["publishedAfter"] = after
    if (opts.pageToken) params["pageToken"] = opts.pageToken
    const s = await this.get<SearchResp>("search", params, opts.signal)
    if (!s.cached) units += 100
    const videos = (s.data.items ?? [])
      .filter((v) => v.id?.videoId)
      .map((v) => ({
        id: v.id!.videoId!,
        title: decodeEntities(v.snippet?.title ?? ""),
        description: decodeEntities(v.snippet?.description ?? ""),
        channel: v.snippet?.channelTitle ?? null,
        publishedAt: v.snippet?.publishedAt ?? null,
      }))
    if (videos.length === 0) {
      return { items: [], units, nextPageToken: s.data.nextPageToken ?? null, videos: 0, commentVideos: 0, notes }
    }

    const stats = new Map<string, { views: number; likes: number; comments: number }>()
    try {
      const v = await this.get<VideosResp>("videos", { part: "statistics", id: videos.map((x) => x.id).join(",") }, opts.signal)
      if (!v.cached) units += 1
      for (const it of v.data.items ?? []) {
        stats.set(it.id, {
          views: Number(it.statistics?.viewCount ?? 0),
          likes: Number(it.statistics?.likeCount ?? 0),
          comments: Number(it.statistics?.commentCount ?? 0),
        })
      }
    } catch {
      notes.push("YouTube view counts unavailable")
    }

    const items: RawItem[] = videos.map((v) => {
      const st = stats.get(v.id)
      return {
        url: `https://youtube.com/watch?v=${v.id}`,
        platform: "youtube",
        kind: "video",
        title: v.title,
        text: clip(v.description, 600),
        author: v.channel,
        publishedAt: v.publishedAt,
        engagement: st ? { views: st.views, likes: st.likes, comments: st.comments } : null,
        lane: "youtube",
        depth: "snippet",
      }
    })

    // Comments on the most-discussed new videos.
    const commentTargets = [...videos]
      .filter((v) => !opts.knownVideoIds?.has(v.id))
      .sort((a, b) => (stats.get(b.id)?.comments ?? 0) - (stats.get(a.id)?.comments ?? 0))
      .filter((v) => (stats.get(v.id)?.comments ?? 1) > 0)
      .slice(0, LIMITS.youtubeCommentVideos)

    let commentVideos = 0
    let disabled = 0
    let failed = 0
    await Promise.all(
      commentTargets.map(async (v) => {
        try {
          const c = await this.get<CommentsResp>(
            "commentThreads",
            { part: "snippet", videoId: v.id, maxResults: String(LIMITS.youtubeCommentsPerVideo), order: "relevance", textFormat: "plainText" },
            opts.signal,
          )
          if (!c.cached) units += 1
          commentVideos++
          for (const t of c.data.items ?? []) {
            const top = t.snippet?.topLevelComment
            const sn = top?.snippet
            const text = (sn?.textOriginal ?? sn?.textDisplay ?? "").trim()
            if (!top?.id || text.length < 20) continue
            items.push({
              url: `https://youtube.com/watch?v=${v.id}&lc=${top.id}`,
              platform: "youtube",
              kind: "comment",
              title: `Comment on "${clip(v.title, 90)}"`,
              text: clip(decodeEntities(text), 1500),
              author: sn?.authorDisplayName ?? null,
              publishedAt: sn?.publishedAt ?? null,
              engagement: { likes: sn?.likeCount ?? 0, comments: t.snippet?.totalReplyCount ?? 0 },
              parentUrl: `https://youtube.com/watch?v=${v.id}`,
              lane: "youtube",
              depth: "full",
            })
          }
        } catch (err) {
          if (opts.signal?.aborted) throw err
          if (err instanceof HttpError && err.status === 403 && /commentsDisabled/i.test(err.body ?? "")) {
            disabled++
            return
          }
          failed++
        }
      }),
    )
    if (disabled) notes.push(`${disabled} video${disabled > 1 ? "s have" : " has"} comments turned off`)
    if (failed) notes.push(`comments could not be read on ${failed} video${failed > 1 ? "s" : ""}`)
    return { items, units, nextPageToken: s.data.nextPageToken ?? null, videos: videos.length, commentVideos, notes }
  }
}
