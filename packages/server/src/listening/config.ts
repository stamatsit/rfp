/**
 * Topic Ideation tuning. Every number here was chosen against a measured
 * constraint; see docs/in-progress/social-listening.md.
 */
import type { Platform, TimeWindow } from "./types.js"

/**
 * Google Programmable Search engine created 2025-12-07 with "Search the
 * entire web" on.
 * Engines created after Google closed the API answer for a few calls, then
 * return 404 "Requested entity was not found" (our "Stamats Topic Ideation"
 * engine f485f47ea1e154da1 did exactly that on 2026-10-07). Lanes scope with
 * site: operators in the query, so a whole-web engine reaches any forum.
 * Read-only use: never edit this engine's settings, other tools may share it.
 */
export const DEFAULT_PSE_ENGINE_ID = "53f1b86685fe84d6c"

/** Site groups searched as separate lanes so one platform cannot crowd out the rest. */
export const SITE_GROUPS: Array<{ id: string; label: string; sites: string[] }> = [
  { id: "reddit", label: "Reddit", sites: ["reddit.com"] },
  {
    id: "forums",
    label: "Forums",
    sites: ["collegeconfidential.com", "allnurses.com", "studentdoctor.net", "quora.com", "connect.mayoclinic.org", "patient.info"],
  },
  {
    id: "social",
    label: "Social",
    sites: ["facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "threads.net", "bsky.app"],
  },
  {
    id: "reviews",
    label: "Reviews",
    sites: ["niche.com", "unigo.com", "gradreports.com", "ratemyprofessors.com", "healthgrades.com", "vitals.com", "yelp.com"],
  },
]

/** Host suffix to platform. First match wins. */
export const HOST_PLATFORM: Array<[string, Platform]> = [
  ["reddit.com", "reddit"],
  ["redd.it", "reddit"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["facebook.com", "facebook"],
  ["instagram.com", "instagram"],
  ["linkedin.com", "linkedin"],
  ["tiktok.com", "tiktok"],
  ["threads.net", "threads"],
  ["bsky.app", "bluesky"],
  ["quora.com", "quora"],
  ["collegeconfidential.com", "forums"],
  ["allnurses.com", "forums"],
  ["studentdoctor.net", "forums"],
  ["connect.mayoclinic.org", "forums"],
  ["patient.info", "forums"],
  ["niche.com", "reviews"],
  ["unigo.com", "reviews"],
  ["gradreports.com", "reviews"],
  ["ratemyprofessors.com", "reviews"],
  ["healthgrades.com", "reviews"],
  ["vitals.com", "reviews"],
  ["yelp.com", "reviews"],
  ["news.google.com", "news"],
]

export const PLATFORM_LABEL: Record<Platform, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  threads: "Threads",
  bluesky: "Bluesky",
  quora: "Quora",
  forums: "Forums",
  reviews: "Reviews",
  news: "News",
  other: "Web",
}

export const TIME_WINDOW_RESTRICT: Record<TimeWindow, string | null> = {
  "3m": "m3",
  "1y": "y1",
  any: null,
}

export const LIMITS = {
  /** Search phrasings per run: the topic itself plus up to this many rewrites. */
  maxSearches: 4,
  /** Extra Reddit result pages for the first phrasing (10 results each). */
  redditExtraPages: 1,
  /** YouTube: videos fetched per run and videos whose comments are read. */
  youtubeVideos: 8,
  youtubeCommentVideos: 4,
  youtubeCommentsPerVideo: 25,
  /** Pages read in full per run (new items only), and comments kept per thread. */
  deepReads: 8,
  commentsPerThread: 15,
  /** Text clip sizes. */
  maxItemChars: 1800,
  maxPageChars: 6000,
  /** Items labeled per model call, and parallel label calls. */
  labelBatch: 30,
  labelConcurrency: 5,
  /** Hard cap on new items labeled per run (cost and time bound). */
  maxNewItemsPerRun: 260,
  /** Relevant items handed to the writing pass. */
  maxItemsForWriting: 140,
  /** Below this many relevant items the report is flagged thin. */
  thinThreshold: 15,
  /** A content idea needs at least this many distinct supporting items. */
  minIdeaEvidence: 2,
  maxIdeas: 8,
  maxSubtopics: 8,
  maxQuestions: 12,
  maxQuotes: 10,
} as const

export const DEADLINES_MS = {
  search: 12_000,
  youtube: 15_000,
  news: 10_000,
  page: 12_000,
  /** One model call, including the SDK's own retry. */
  llm: 75_000,
  /** Whole run; the Vercel function allows 300s. */
  run: 270_000,
} as const

/** Rough daily Google PSE budget (100 free calls per project per day). */
export const DAILY_SEARCH_BUDGET = 100

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
