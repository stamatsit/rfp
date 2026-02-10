import { useEffect, useCallback, useRef } from "react"
import { useLocation } from "react-router-dom"

// ─── Types ───────────────────────────────────────────────────────────
interface BehaviorEvent {
  type: "page-visit" | "search" | "ai-query"
  page?: string
  query?: string
  timestamp: number
}

interface BehaviorSummary {
  pageVisits: Record<string, number>
  recentSearches: string[]
  aiPagesUsed: string[]
  mostVisitedPage: string | null
  totalEvents: number
}

// ─── Constants ───────────────────────────────────────────────────────
const STORAGE_KEY = "stamats-companion-behavior"
const MAX_EVENTS = 200

const PAGE_NAMES: Record<string, string> = {
  "/": "Home",
  "/search": "Search Library",
  "/ai": "Ask AI",
  "/import": "Import Data",
  "/photos": "Photo Library",
  "/new": "New Entry",
  "/analyze": "RFP Analyzer",
  "/documents": "Saved Documents",
  "/insights": "Proposal Insights",
  "/case-studies": "Case Studies",
  "/unified-ai": "Unified AI",
  "/studio": "Document Studio",
  "/help": "Help",
  "/support": "Support",
}

// ─── Storage helpers ─────────────────────────────────────────────────
function loadEvents(): BehaviorEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveEvents(events: BehaviorEvent[]) {
  // Keep only last MAX_EVENTS
  const trimmed = events.slice(-MAX_EVENTS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full — clear old events
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(-50)))
  }
}

// ─── Summarize ───────────────────────────────────────────────────────
function summarize(events: BehaviorEvent[]): BehaviorSummary {
  const pageVisits: Record<string, number> = {}
  const searches: string[] = []
  const aiPages = new Set<string>()

  for (const e of events) {
    if (e.type === "page-visit" && e.page) {
      pageVisits[e.page] = (pageVisits[e.page] || 0) + 1
      if (["/ai", "/insights", "/case-studies", "/unified-ai"].includes(e.page)) {
        aiPages.add(e.page)
      }
    }
    if (e.type === "search" && e.query) {
      searches.push(e.query)
    }
    if (e.type === "ai-query" && e.page) {
      aiPages.add(e.page)
    }
  }

  const sortedPages = Object.entries(pageVisits).sort((a, b) => b[1] - a[1])

  return {
    pageVisits,
    recentSearches: searches.slice(-5),
    aiPagesUsed: [...aiPages],
    mostVisitedPage: sortedPages[0]?.[0] || null,
    totalEvents: events.length,
  }
}

// ─── Proactive suggestions ──────────────────────────────────────────
function getProactiveSuggestion(summary: BehaviorSummary): string | null {
  const { pageVisits, aiPagesUsed, recentSearches } = summary

  // Searched a lot but never used Ask AI
  if (recentSearches.length >= 3 && !aiPagesUsed.includes("/ai")) {
    return "You've been searching a lot — try Ask AI for synthesized answers across multiple topics."
  }

  // Uses one AI page heavily but not Unified AI
  if (aiPagesUsed.length >= 2 && !aiPagesUsed.includes("/unified-ai")) {
    return "Try Unified AI to cross-reference proposals, case studies, and your Q&A library in one place."
  }

  // Never visited Document Studio
  if (summary.totalEvents > 15 && !pageVisits["/studio"]) {
    return "Have you tried Document Studio? It's a full proposal editor with templates and inline AI."
  }

  // Never visited Photo Library
  if (summary.totalEvents > 20 && !pageVisits["/photos"]) {
    return "The Photo Library lets you upload and organize images for proposals. Photos can be linked to Q&A entries."
  }

  // Never used Case Studies
  if (summary.totalEvents > 10 && !aiPagesUsed.includes("/case-studies")) {
    return "Check out Case Studies for instant access to client success stories, testimonials, and proof points."
  }

  return null
}

// ─── Build context string for AI prompt ─────────────────────────────
export function getBehaviorContextForPrompt(): string {
  const events = loadEvents()
  if (events.length === 0) return "New user — no activity tracked yet."

  const summary = summarize(events)
  const lines: string[] = []

  // Page visit counts
  const topPages = Object.entries(summary.pageVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => `${PAGE_NAMES[path] || path}: ${count} visits`)
  if (topPages.length > 0) lines.push(`Top pages: ${topPages.join(", ")}`)

  // AI pages used
  if (summary.aiPagesUsed.length > 0) {
    const names = summary.aiPagesUsed.map(p => PAGE_NAMES[p] || p)
    lines.push(`AI features used: ${names.join(", ")}`)
  } else {
    lines.push("Has not used any AI features yet.")
  }

  // Recent searches
  if (summary.recentSearches.length > 0) {
    lines.push(`Recent searches: "${summary.recentSearches.join('", "')}"`)
  }

  // Pages never visited (from key pages)
  const keyPages = ["/search", "/ai", "/insights", "/case-studies", "/studio", "/photos"]
  const unvisited = keyPages.filter(p => !summary.pageVisits[p]).map(p => PAGE_NAMES[p] || p)
  if (unvisited.length > 0) {
    lines.push(`Has NOT yet visited: ${unvisited.join(", ")}`)
  }

  return lines.join("\n")
}

// ─── Hook ────────────────────────────────────────────────────────────
export function useCompanionBehavior() {
  const location = useLocation()
  const lastPathRef = useRef<string>("")

  // Track page visits automatically
  useEffect(() => {
    const path = location.pathname
    if (path === lastPathRef.current) return
    if (path === "/login" || path === "/change-password") return
    lastPathRef.current = path

    const events = loadEvents()
    events.push({ type: "page-visit", page: path, timestamp: Date.now() })
    saveEvents(events)
  }, [location.pathname])

  // Listen for custom tracking events from other pages
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.type) return
      const events = loadEvents()
      events.push({
        type: detail.type,
        page: detail.page || location.pathname,
        query: detail.query,
        timestamp: Date.now(),
      })
      saveEvents(events)
    }
    window.addEventListener("companion-track", handler)
    return () => window.removeEventListener("companion-track", handler)
  }, [location.pathname])

  const getSuggestion = useCallback((): string | null => {
    const summary = summarize(loadEvents())
    return getProactiveSuggestion(summary)
  }, [])

  const getContextForPrompt = useCallback((): string => {
    return getBehaviorContextForPrompt()
  }, [])

  return { getSuggestion, getContextForPrompt }
}
