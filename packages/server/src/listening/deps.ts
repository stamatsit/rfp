/**
 * Builds engine dependencies from the environment. Shared by the Express
 * route, the Vercel function, the CLI and the eval runner so all four run
 * exactly the same engine.
 *
 * Search provider (LISTENING_SEARCH):
 *   auto (default)  Google PSE first, Serper behind it when SERPER_API_KEY is set
 *   google          Google PSE only
 *   serper          Serper only
 * Google's Custom Search JSON API shuts down 2027-01-01; with Serper configured,
 * "auto" moves to it on its own when Google stops answering.
 */
import { FileCache, type ResponseCache } from "./cache.js"
import { DEFAULT_PSE_ENGINE_ID } from "./config.js"
import type { EngineDeps } from "./engine.js"
import { openAiLlm, type LlmClient } from "./llm.js"
import { NewsSource } from "./sources/news.js"
import { PseProvider, type SearchProvider } from "./sources/pse.js"
import { PageReader } from "./sources/reader.js"
import { FallbackProvider, SerperProvider } from "./sources/serper.js"
import { YoutubeSource } from "./sources/youtube.js"
import type { Store } from "./store.js"

type Mode = "auto" | "google" | "serper"

function mode(): Mode {
  const m = process.env["LISTENING_SEARCH"]?.trim().toLowerCase()
  return m === "google" || m === "serper" ? m : "auto"
}

export function buildSearch(cache: ResponseCache): SearchProvider | null {
  const pseKey = process.env["GOOGLE_PSE_API_KEY"]?.trim()
  const engine = process.env["GOOGLE_PSE_ENGINE_ID"]?.trim() || DEFAULT_PSE_ENGINE_ID
  const serperKey = process.env["SERPER_API_KEY"]?.trim()
  const google = pseKey ? new PseProvider(pseKey, engine, cache) : null
  const serper = serperKey ? new SerperProvider(serperKey, cache) : null
  const m = mode()
  if (m === "google") return google
  if (m === "serper") return serper
  if (google && serper) return new FallbackProvider(google, serper)
  return google ?? serper
}

export function buildDeps(opts: { store: Store; cache?: ResponseCache; cacheDir?: string; llm?: LlmClient }): EngineDeps {
  const cache = opts.cache ?? new FileCache(opts.cacheDir ?? ".cache/listening")
  const ytKey = process.env["YOUTUBE_API_KEY"]?.trim()
  return {
    store: opts.store,
    llm: opts.llm ?? openAiLlm(),
    search: buildSearch(cache),
    youtube: ytKey ? new YoutubeSource(ytKey, cache) : null,
    news: new NewsSource(cache),
    reader: new PageReader(cache),
  }
}

/** Which sources are configured, for the UI's empty state and health check. */
export function configuredSources(): {
  search: boolean
  google: boolean
  serper: boolean
  youtube: boolean
  model: boolean
  redditArchive: boolean
} {
  const m = mode()
  const google = !!process.env["GOOGLE_PSE_API_KEY"]?.trim() && m !== "serper"
  const serper = !!process.env["SERPER_API_KEY"]?.trim() && m !== "google"
  return {
    search: google || serper,
    google,
    serper,
    youtube: !!process.env["YOUTUBE_API_KEY"]?.trim(),
    model: !!process.env["OPENAI_API_KEY"]?.trim(),
    redditArchive: process.env["LISTENING_REDDIT_ARCHIVE"] === "true",
  }
}
