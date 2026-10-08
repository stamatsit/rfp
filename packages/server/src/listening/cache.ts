/**
 * Response cache for search/API calls. Google PSE allows 100 free calls a day
 * per project, so identical calls inside the TTL are served from cache:
 * a file cache in local dev (and for evals), the database in production.
 * Keys never contain API keys; callers pass a key built from the request
 * parameters only.
 */
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

export interface ResponseCache {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
}

export function cacheKey(parts: Record<string, unknown>): string {
  const stable = JSON.stringify(parts, Object.keys(parts).sort())
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 40)
}

export class MemoryCache implements ResponseCache {
  private map = new Map<string, { value: unknown; exp: number }>()
  async get<T>(key: string): Promise<T | null> {
    const hit = this.map.get(key)
    if (!hit) return null
    if (hit.exp < Date.now()) {
      this.map.delete(key)
      return null
    }
    return hit.value as T
  }
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(key, { value, exp: Date.now() + ttlMs })
  }
}

export class FileCache implements ResponseCache {
  constructor(private dir: string) {}
  private file(key: string) {
    return path.join(this.dir, `${key}.json`)
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file(key), "utf8")) as { exp: number; value: T }
      if (raw.exp < Date.now()) return null
      return raw.value
    } catch {
      return null
    }
  }
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(this.file(key), JSON.stringify({ exp: Date.now() + ttlMs, value }))
    } catch {
      // A cache write failure must never fail a run.
    }
  }
}

/** Never caches. Used when a fresh harvest is explicitly wanted. */
export class NoCache implements ResponseCache {
  async get<T>(): Promise<T | null> {
    return null
  }
  async set(): Promise<void> {}
}

export const TTL = {
  /** Search results: a rescan the same day reuses them; a rescan tomorrow does not. */
  search: 6 * 60 * 60 * 1000,
  youtube: 6 * 60 * 60 * 1000,
  news: 2 * 60 * 60 * 1000,
  page: 24 * 60 * 60 * 1000,
} as const
