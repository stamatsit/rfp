/**
 * Shared helper: fetch approved testimonials from DB with a short TTL cache.
 * Falls back to static data if DB is unavailable.
 */

import { db } from "../../db/index.js"
import { clientSuccessTestimonials } from "../../db/schema.js"
import { ne } from "drizzle-orm"
import { clientSuccessData } from "../../data/clientSuccessData.js"

interface CachedTestimonial {
  id: string
  quote: string
  name: string | null
  title: string | null
  organization: string
  source: string | null
  sector: string | null
  tags: string[]
}

let cache: CachedTestimonial[] | null = null
let cacheExpiry = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Returns approved testimonials from the DB, with a 5-minute TTL cache.
 * Falls back to static clientSuccessData.testimonials if DB is unavailable.
 */
export async function getApprovedTestimonials(): Promise<CachedTestimonial[]> {
  const now = Date.now()
  if (cache && now < cacheExpiry) return cache

  try {
    if (!db) throw new Error("DB unavailable")

    const rows = await db
      .select({
        id: clientSuccessTestimonials.id,
        quote: clientSuccessTestimonials.quote,
        name: clientSuccessTestimonials.name,
        title: clientSuccessTestimonials.title,
        organization: clientSuccessTestimonials.organization,
        source: clientSuccessTestimonials.source,
        sector: clientSuccessTestimonials.sector,
        tags: clientSuccessTestimonials.tags,
      })
      .from(clientSuccessTestimonials)
      .where(ne(clientSuccessTestimonials.status, "hidden"))

    cache = rows.map(r => ({
      ...r,
      tags: (r.tags as string[]) || [],
    }))
    cacheExpiry = now + CACHE_TTL
    return cache
  } catch {
    // Fallback to static data
    return clientSuccessData.testimonials.map((t, i) => ({
      id: `static-${i}`,
      quote: t.quote,
      name: t.name || null,
      title: t.title || null,
      organization: t.organization,
      source: t.source || null,
      sector: null,
      tags: [],
    }))
  }
}

/** Invalidate the cache (call after status changes) */
export function invalidateTestimonialCache() {
  cache = null
  cacheExpiry = 0
}
