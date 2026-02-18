import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useIsAdmin } from "@/contexts/AuthContext"
import {
  Search,
  Copy,
  Download,
  Image as ImageIcon,
  FileText,
  Link2,
  Sparkles,
  Check,
  Loader2,
  X,
  Unlink,
  ChevronRight,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Save,
  Wand2,
  ChevronDown,
  History,
  RotateCcw,
  AlertTriangle,
  Trash2,
  FolderOpen,
  Trophy,
  TrendingUp,
  Quote,
  Award,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { RelatedContent } from "@/components/RelatedContent"
import { clientSuccessData } from "@/data/clientSuccessData"
import { proposalInsightsApi, type ProposalMetrics, clientSuccessApi } from "@/lib/api"
import { NewEntryPanel } from "@/components/NewEntryPanel"
import {
  Button,
  Card,
  CardContent,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Textarea,
  Label,
} from "@/components/ui"
import {
  topicsApi,
  searchApi,
  photosApi,
  aiApi,
  answersApi,
  type AnswerResponse,
  type PhotoResponse,
  type AdaptationType,
  type AIAdaptResponse,
  type AnswerVersion,
} from "@/lib/api"
import type { Topic, SearchItemType, ItemStatus } from "@/types"
import { loadSettings } from "@/components/SettingsPanel"

// Topic color mapping for consistent color coding
const topicColors: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
}

function getTopicColor(topicId: string, index: number): { bg: string; text: string; border: string } {
  const cached = topicColors[topicId]
  if (cached) return cached

  const colors = [
    { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  ]

  const idx = Math.abs(index) % colors.length
  return colors[idx] ?? topicColors.default!
}

type SortOption = "relevance" | "newest" | "oldest" | "alphabetical"

/** Cache the highlight regex per query to avoid re-creating on every call */
let _hlCache: { query: string; regex: RegExp } | null = null
function getHighlightRegex(query: string): RegExp | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  if (_hlCache && _hlCache.query === trimmed) return _hlCache.regex
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`(${escaped})`, "gi")
  _hlCache = { query: trimmed, regex }
  return regex
}

/** Highlight search terms in text by wrapping matches in <mark> tags */
function highlightText(text: string, query: string): React.ReactNode {
  const regex = getHighlightRegex(query)
  if (!regex) return text
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5">{part}</mark>
      : part
  )
}

// Skeleton loader for answer cards
function AnswerCardSkeleton() {
  return (
    <Card className="p-4 rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800">
      <div className="shimmer space-y-3">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="space-y-2">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
        </div>
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      </div>
    </Card>
  )
}

// Skeleton loader for photo cards
function PhotoCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800">
      <div className="shimmer">
        <div className="aspect-square bg-slate-200 dark:bg-slate-700" />
        <div className="p-2 space-y-2">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="flex gap-1">
            <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="h-4 w-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>
        </div>
      </div>
    </Card>
  )
}

type LibrarySection = "qa" | "client-success" | "proposals"
type ClientSuccessTab = "success" | "results" | "testimonials" | "awards"

// ─── Client-side search helper ───
function matchesSearch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const terms = query.toLowerCase().split(/\s+/)
  const lower = text.toLowerCase()
  return terms.every((term) => lower.includes(term))
}

// ─── Sort option types per tab ───
type SuccessSort = "client-az" | "client-za" | "metrics-most" | "metrics-least" | "category"
type ResultsSort = "value-high" | "value-low" | "client-az" | "client-za" | "metric-az"
type TestimonialsSort = "org-az" | "org-za" | "name-az" | "shortest" | "longest"
type AwardsSort = "newest" | "oldest" | "client-az" | "name-az"

// ─── Client Success Section ───
function ClientSuccessSection({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<ClientSuccessTab>("success")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState("all")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [successSort, setSuccessSort] = useState<SuccessSort>("client-az")
  const [resultsSort, setResultsSort] = useState<ResultsSort>("value-high")
  const [testimonialSort, setTestimonialSort] = useState<TestimonialsSort>("org-az")
  const [awardSort, setAwardSort] = useState<AwardsSort>("newest")

  // DB-sourced entries (merged with static data)
  const [dbEntries, setDbEntries] = useState<{ id: string; client: string; category: "higher-ed" | "healthcare" | "other"; focus: string; challenge: string | null; solution: string | null; metrics: { label: string; value: string }[]; testimonialQuote: string | null; testimonialAttribution: string | null }[]>([])
  const [dbResults, setDbResults] = useState<{ id: string; metric: string; result: string; client: string; numericValue: number; direction: "increase" | "decrease" }[]>([])
  const [dbTestimonials, setDbTestimonials] = useState<{ id: string; quote: string; name: string | null; title: string | null; organization: string }[]>([])
  const [dbAwards, setDbAwards] = useState<{ id: string; name: string; year: string; clientOrProject: string }[]>([])

  // Fetch DB entries
  useEffect(() => {
    Promise.all([
      clientSuccessApi.getEntries().catch(() => []),
      clientSuccessApi.getResults().catch(() => []),
      clientSuccessApi.getTestimonials().catch(() => []),
      clientSuccessApi.getAwards().catch(() => []),
    ]).then(([entries, results, testimonials, awards]) => {
      setDbEntries(entries as any)
      setDbResults(results as any)
      setDbTestimonials(testimonials as any)
      setDbAwards(awards as any)
    })
  }, [refreshKey])

  const handleDelete = useCallback(async (type: "entry" | "result" | "testimonial" | "award", id: string) => {
    try {
      if (type === "entry") { await clientSuccessApi.deleteEntry(id); setDbEntries(prev => prev.filter(e => e.id !== id)) }
      if (type === "result") { await clientSuccessApi.deleteResult(id); setDbResults(prev => prev.filter(e => e.id !== id)) }
      if (type === "testimonial") { await clientSuccessApi.deleteTestimonial(id); setDbTestimonials(prev => prev.filter(e => e.id !== id)) }
      if (type === "award") { await clientSuccessApi.deleteAward(id); setDbAwards(prev => prev.filter(e => e.id !== id)) }
    } catch { /* ignore */ }
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Reset filters when switching tabs
  useEffect(() => {
    setQuery("")
    setDebouncedQuery("")
    setCategoryFilter("all")
    setDirectionFilter("all")
    setExpandedId(null)
  }, [tab])

  const handleCopy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  // Filtered + sorted data (merge static + DB entries)
  const filteredSuccessItems = useMemo(() => {
    const staticItems = clientSuccessData.caseStudies.map(cs => ({ ...cs, source: "static" as const, dbId: null as string | null }))
    const userItems = dbEntries.map((e, i) => ({
      id: 10000 + i,
      client: e.client,
      category: e.category,
      focus: e.focus,
      challenge: e.challenge || "",
      solution: e.solution || "",
      metrics: e.metrics || [],
      testimonial: e.testimonialQuote ? { quote: e.testimonialQuote, attribution: e.testimonialAttribution || "" } : undefined,
      awards: [] as string[],
      source: "user" as const,
      dbId: e.id as string | null,
    }))
    const all = [...staticItems, ...userItems]
    const filtered = all.filter((cs) => {
      if (categoryFilter !== "all" && cs.category !== categoryFilter) return false
      const searchText = `${cs.client} ${cs.focus} ${cs.challenge} ${cs.solution}`
      return matchesSearch(searchText, debouncedQuery)
    })
    return filtered.sort((a, b) => {
      switch (successSort) {
        case "client-az": return a.client.localeCompare(b.client)
        case "client-za": return b.client.localeCompare(a.client)
        case "metrics-most": return b.metrics.length - a.metrics.length
        case "metrics-least": return a.metrics.length - b.metrics.length
        case "category": return a.category.localeCompare(b.category)
        default: return 0
      }
    })
  }, [debouncedQuery, categoryFilter, successSort, dbEntries])

  const filteredResults = useMemo(() => {
    const staticItems = clientSuccessData.topLineResults.map(r => ({ ...r, source: "static" as const, dbId: null as string | null }))
    const userItems = dbResults.map(r => ({
      metric: r.metric,
      result: r.result,
      client: r.client,
      numericValue: r.numericValue,
      direction: r.direction,
      source: "user" as const,
      dbId: r.id as string | null,
    }))
    const all = [...staticItems, ...userItems]
    const filtered = all.filter((r) => {
      if (directionFilter !== "all" && r.direction !== directionFilter) return false
      const searchText = `${r.metric} ${r.client} ${r.result}`
      return matchesSearch(searchText, debouncedQuery)
    })
    return filtered.sort((a, b) => {
      switch (resultsSort) {
        case "value-high": return b.numericValue - a.numericValue
        case "value-low": return a.numericValue - b.numericValue
        case "client-az": return a.client.localeCompare(b.client)
        case "client-za": return b.client.localeCompare(a.client)
        case "metric-az": return a.metric.localeCompare(b.metric)
        default: return 0
      }
    })
  }, [debouncedQuery, directionFilter, resultsSort, dbResults])

  const filteredTestimonials = useMemo(() => {
    const staticItems = clientSuccessData.testimonials.map(t => ({ ...t, source: "static" as const, dbId: null as string | null }))
    const userItems = dbTestimonials.map(t => ({
      quote: t.quote,
      name: t.name || "",
      title: t.title || "",
      organization: t.organization,
      source: "user" as const,
      dbId: t.id as string | null,
    }))
    const all = [...staticItems, ...userItems]
    const filtered = all.filter((t) => {
      const searchText = `${t.quote} ${t.name} ${t.organization}`
      return matchesSearch(searchText, debouncedQuery)
    })
    return filtered.sort((a, b) => {
      switch (testimonialSort) {
        case "org-az": return a.organization.localeCompare(b.organization)
        case "org-za": return b.organization.localeCompare(a.organization)
        case "name-az": return (a.name || "").localeCompare(b.name || "")
        case "shortest": return a.quote.length - b.quote.length
        case "longest": return b.quote.length - a.quote.length
        default: return 0
      }
    })
  }, [debouncedQuery, testimonialSort, dbTestimonials])

  const filteredAwards = useMemo(() => {
    const staticItems = clientSuccessData.awards.map(a => ({ ...a, source: "static" as const, dbId: null as string | null }))
    const userItems = dbAwards.map(a => ({
      name: a.name,
      year: a.year,
      clientOrProject: a.clientOrProject,
      source: "user" as const,
      dbId: a.id as string | null,
    }))
    const all = [...staticItems, ...userItems]
    const filtered = all.filter((a) => {
      const searchText = `${a.name} ${a.clientOrProject}`
      return matchesSearch(searchText, debouncedQuery)
    })
    return filtered.sort((a, b) => {
      switch (awardSort) {
        case "newest": return b.year.localeCompare(a.year)
        case "oldest": return a.year.localeCompare(b.year)
        case "client-az": return a.clientOrProject.localeCompare(b.clientOrProject)
        case "name-az": return a.name.localeCompare(b.name)
        default: return 0
      }
    })
  }, [debouncedQuery, awardSort, dbAwards])

  const totalSuccess = clientSuccessData.caseStudies.length + dbEntries.length
  const totalResults = clientSuccessData.topLineResults.length + dbResults.length
  const totalTestimonials = clientSuccessData.testimonials.length + dbTestimonials.length
  const totalAwards = clientSuccessData.awards.length + dbAwards.length

  const tabs: { id: ClientSuccessTab; label: string; count: number }[] = [
    { id: "success", label: "Client Success", count: totalSuccess },
    { id: "results", label: "Results", count: totalResults },
    { id: "testimonials", label: "Testimonials", count: totalTestimonials },
    { id: "awards", label: "Awards", count: totalAwards },
  ]

  const formatSuccessItem = (cs: typeof clientSuccessData.caseStudies[0]) => {
    let text = `## ${cs.client} — ${cs.focus}\n\n`
    text += `**Challenge:** ${cs.challenge}\n\n`
    text += `**Solution:** ${cs.solution}\n\n`
    text += `**Results:**\n`
    for (const m of cs.metrics) {
      text += `- ${m.label}: ${m.value}\n`
    }
    if (cs.testimonial) {
      text += `\n**Testimonial:**\n"${cs.testimonial.quote}"\n— ${cs.testimonial.attribution}\n`
    }
    return text
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Sub-tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                tab === t.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[11px] opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Search + Filter + Sort row */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "success" ? "Search client success..." :
                tab === "results" ? "Search results..." :
                tab === "testimonials" ? "Search testimonials..." :
                "Search awards..."
              }
              className="pl-9 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          {/* Filter dropdown (only for tabs that need it) */}
          {tab === "success" && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="higher-ed">Higher Ed</SelectItem>
                <SelectItem value="healthcare">Healthcare</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "results" && (
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-36 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="increase">Increase</SelectItem>
                <SelectItem value="decrease">Decrease</SelectItem>
              </SelectContent>
            </Select>
          )}
          {/* Sort dropdown */}
          {tab === "success" && (
            <Select value={successSort} onValueChange={(v) => setSuccessSort(v as SuccessSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="client-za">Client Z–A</SelectItem>
                <SelectItem value="metrics-most">Most Metrics</SelectItem>
                <SelectItem value="metrics-least">Fewest Metrics</SelectItem>
                <SelectItem value="category">Category</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "results" && (
            <Select value={resultsSort} onValueChange={(v) => setResultsSort(v as ResultsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value-high">Highest Value</SelectItem>
                <SelectItem value="value-low">Lowest Value</SelectItem>
                <SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="client-za">Client Z–A</SelectItem>
                <SelectItem value="metric-az">Metric A–Z</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "testimonials" && (
            <Select value={testimonialSort} onValueChange={(v) => setTestimonialSort(v as TestimonialsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org-az">Organization A–Z</SelectItem>
                <SelectItem value="org-za">Organization Z–A</SelectItem>
                <SelectItem value="name-az">Name A–Z</SelectItem>
                <SelectItem value="shortest">Shortest First</SelectItem>
                <SelectItem value="longest">Longest First</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "awards" && (
            <Select value={awardSort} onValueChange={(v) => setAwardSort(v as AwardsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="name-az">Award A–Z</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Results count */}
        <p className="text-[13px] text-slate-400 dark:text-slate-500">
          {tab === "success" && `Showing ${filteredSuccessItems.length} of ${totalSuccess}`}
          {tab === "results" && `Showing ${filteredResults.length} of ${totalResults}`}
          {tab === "testimonials" && `Showing ${filteredTestimonials.length} of ${totalTestimonials}`}
          {tab === "awards" && `Showing ${filteredAwards.length} of ${totalAwards}`}
        </p>

        {/* ─── Client Success ─── */}
        {tab === "success" && (
          <div className="space-y-2">
            {filteredSuccessItems.map((cs) => (
              <div key={cs.id} className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800/60 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === cs.id ? null : cs.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900 dark:text-white">{cs.client}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        cs.category === "higher-ed" ? "text-blue-600 border-blue-200 dark:border-blue-800" :
                        cs.category === "healthcare" ? "text-teal-600 border-teal-200 dark:border-teal-800" :
                        "text-slate-500 border-slate-200 dark:border-slate-700"
                      }`}>
                        {cs.category === "higher-ed" ? "Higher Ed" : cs.category === "healthcare" ? "Healthcare" : "Other"}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{cs.focus}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{cs.metrics.length} metrics</span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${expandedId === cs.id ? "rotate-180" : ""}`} />
                </button>

                {expandedId === cs.id && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 space-y-3 pt-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Challenge</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{cs.challenge}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Solution</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{cs.solution}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Results</p>
                      <div className="grid grid-cols-2 gap-2">
                        {cs.metrics.map((m, i) => (
                          <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {cs.testimonial && (
                      <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3 border-l-2 border-slate-300 dark:border-slate-600">
                        <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{cs.testimonial.quote}"</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">— {cs.testimonial.attribution}</p>
                      </div>
                    )}
                    {cs.awards && cs.awards.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Awards</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cs.awards.map((award, i) => (
                            <Badge key={i} variant="outline" className="text-[11px] text-amber-600 border-amber-200 dark:border-amber-800">
                              <Award size={10} className="mr-1" />{award}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => handleCopy(formatSuccessItem(cs), `cs-${cs.id}`)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      >
                        {copiedId === `cs-${cs.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        {copiedId === `cs-${cs.id}` ? "Copied" : "Copy"}
                      </button>
                      {cs.source === "user" && cs.dbId && (
                        <button
                          onClick={() => handleDelete("entry", cs.dbId!)}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredSuccessItems.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">No results match your search.</div>
            )}
          </div>
        )}

        {/* ─── Results ─── */}
        {tab === "results" && (
          <div className="space-y-1">
            {filteredResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 group transition-colors">
                <span className={`text-sm font-bold w-20 shrink-0 text-right ${
                  r.direction === "increase" ? "text-emerald-600" : "text-amber-600"
                }`}>
                  {r.result}
                </span>
                {r.direction === "increase"
                  ? <ArrowUp size={12} className="text-emerald-500 shrink-0" />
                  : <ArrowDown size={12} className="text-amber-500 shrink-0" />
                }
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{r.metric}</span>
                <span className="text-xs text-slate-400 shrink-0">{r.client}</span>
                <button
                  onClick={() => handleCopy(`${r.result} ${r.metric} — ${r.client}`, `r-${i}`)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {copiedId === `r-${i}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
                </button>
                {r.source === "user" && r.dbId && (
                  <button
                    onClick={() => handleDelete("result", r.dbId!)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} className="text-red-400 hover:text-red-600" />
                  </button>
                )}
              </div>
            ))}
            {filteredResults.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">No results match your search.</div>
            )}
          </div>
        )}

        {/* ─── Testimonials ─── */}
        {tab === "testimonials" && (
          <div className="space-y-2">
            {filteredTestimonials.map((t, i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800/60 px-4 py-3 group">
                <div className="flex gap-3">
                  <Quote size={16} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm text-slate-700 dark:text-slate-300 ${expandedId !== -(i + 1) ? "line-clamp-2" : ""} cursor-pointer`}
                      onClick={() => setExpandedId(expandedId === -(i + 1) ? null : -(i + 1))}
                    >
                      {t.quote}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t.name && <span className="font-medium">{t.name}</span>}
                      {t.name && t.title && ", "}
                      {t.title}
                      {(t.name || t.title) && t.organization && " — "}
                      {t.organization}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(
                        `"${t.quote}"\n— ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`,
                        `t-${i}`
                      )}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copiedId === `t-${i}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
                    </button>
                    {t.source === "user" && t.dbId && (
                      <button
                        onClick={() => handleDelete("testimonial", t.dbId!)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={13} className="text-red-400 hover:text-red-600" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredTestimonials.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">No testimonials match your search.</div>
            )}
          </div>
        )}

        {/* ─── Awards ─── */}
        {tab === "awards" && (
          <div className="space-y-1">
            {filteredAwards.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 group transition-colors">
                <Award size={14} className="text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">{a.name}</span>
                <Badge variant="outline" className="text-[11px] text-slate-500 border-slate-200 dark:border-slate-700">{a.year}</Badge>
                <span className="text-xs text-slate-400">{a.clientOrProject}</span>
                {a.source === "user" && a.dbId && (
                  <button
                    onClick={() => handleDelete("award", a.dbId!)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} className="text-red-400 hover:text-red-600" />
                  </button>
                )}
              </div>
            ))}
            {filteredAwards.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">No awards match your search.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Proposals Section ───
function ProposalsSection() {
  const [metrics, setMetrics] = useState<ProposalMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [breakdownTab, setBreakdownTab] = useState<"service" | "ce" | "schoolType" | "year">("service")
  const [query, setQuery] = useState("")
  const [sortCol, setSortCol] = useState<"name" | "total" | "won" | "rate">("rate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    proposalInsightsApi.getMetrics()
      .then((data) => { if (!cancelled) setMetrics(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const breakdownData = useMemo(() => {
    if (!metrics) return []
    const source =
      breakdownTab === "service" ? metrics.byService :
      breakdownTab === "ce" ? metrics.byCE :
      breakdownTab === "schoolType" ? metrics.bySchoolType :
      metrics.byYear
    return Object.entries(source)
      .map(([name, data]) => ({ name, ...data, rate: Math.round(data.rate * 100) }))
      .filter((row) => !query.trim() || row.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const val = sortCol === "name" ? a.name.localeCompare(b.name) :
          sortCol === "total" ? a.total - b.total :
          sortCol === "won" ? a.won - b.won :
          a.rate - b.rate
        return sortDir === "desc" ? -val : val
      })
  }, [metrics, breakdownTab, query, sortCol, sortDir])

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc")
    } else {
      setSortCol(col)
      setSortDir("desc")
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !metrics?.summary) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-500">{error || "No proposal data available"}</p>
        </div>
      </div>
    )
  }

  const { summary } = metrics

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Proposals", value: summary.total },
            { label: "Win Rate", value: `${summary.winRate}%` },
            { label: "Won", value: summary.won },
            { label: "Lost", value: summary.lost },
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Breakdown tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          {([
            { id: "service" as const, label: "By Service" },
            { id: "ce" as const, label: "By Account Exec" },
            { id: "schoolType" as const, label: "By School Type" },
            { id: "year" as const, label: "By Year" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setBreakdownTab(t.id); setQuery("") }}
              className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                breakdownTab === t.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative group max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter..."
            className="pl-9 h-9 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg"
          />
        </div>

        {/* Table */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                {([
                  { col: "name" as const, label: breakdownTab === "ce" ? "Account Exec" : breakdownTab === "schoolType" ? "School Type" : breakdownTab === "year" ? "Year" : "Service" },
                  { col: "total" as const, label: "Proposals" },
                  { col: "won" as const, label: "Won" },
                  { col: "rate" as const, label: "Win Rate" },
                ]).map((h) => (
                  <th
                    key={h.col}
                    onClick={() => handleSort(h.col)}
                    className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none"
                  >
                    <span className="flex items-center gap-1">
                      {h.label}
                      {sortCol === h.col && (
                        sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronDown size={12} className="rotate-180" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {breakdownData.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white font-medium">{row.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.total}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{row.won}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(row.rate, 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{row.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {breakdownData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">No data matches your filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-400">
          {summary.dateRange.from && summary.dateRange.to && (
            <>Data range: {new Date(summary.dateRange.from).toLocaleDateString()} — {new Date(summary.dateRange.to).toLocaleDateString()} · {summary.pending} pending</>
          )}
        </p>
      </div>
    </div>
  )
}

export function SearchLibrary() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSection] = useState<LibrarySection>("qa")
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [newEntryRefreshKey, setNewEntryRefreshKey] = useState(0)
  const didAutoOpen = useRef(false)

  // Auto-open New Entry panel if ?newEntry=true
  useEffect(() => {
    if (!didAutoOpen.current && searchParams.get("newEntry") === "true") {
      didAutoOpen.current = true
      setShowNewEntry(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Load user settings for search behavior
  const appSettings = useMemo(() => loadSettings(), [])
  const shouldHighlight = appSettings.searchHighlightMatches
  const showPhotos = appSettings.searchIncludePhotos

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<SearchItemType>("all")
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all")
  const [sortBy, setSortBy] = useState<SortOption>("relevance")
  const [answers, setAnswers] = useState<AnswerResponse[]>([])
  const [photos, setPhotos] = useState<PhotoResponse[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  // showFilters state removed - filters now inline

  // Pagination state
  const PAGE_SIZE = 50
  const [totalAnswers, setTotalAnswers] = useState(0)
  const [totalPhotos, setTotalPhotos] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Detail view state
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerResponse | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoResponse | null>(null)
  const [linkedPhotos, setLinkedPhotos] = useState<PhotoResponse[]>([])
  const [linkedAnswers, setLinkedAnswers] = useState<AnswerResponse[]>([])
  const [loadingLinked, setLoadingLinked] = useState(false)

  // Link picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkPickerType, setLinkPickerType] = useState<"photo" | "answer">("photo")
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null)
  const [availableForLink, setAvailableForLink] = useState<(AnswerResponse | PhotoResponse)[]>([])
  const [linkPickerSearch, setLinkPickerSearch] = useState("")
  const [linkPickerLoading, setLinkPickerLoading] = useState(false)


  // Accordion state for topic grouping
  const [expandedAnswerTopics, setExpandedAnswerTopics] = useState<Set<string>>(new Set())
  // Photo accordion state removed - now showing flat list
  const [answerLimits, setAnswerLimits] = useState<Record<string, number>>({})
  // photoLimits removed - photos now shown as flat list
  const ITEMS_PER_PAGE = 5

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Photo edit state
  const [isEditingPhoto, setIsEditingPhoto] = useState(false)
  const [editPhotoForm, setEditPhotoForm] = useState({
    displayTitle: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
    description: "",
  })
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)

  // Answer edit state
  const [isEditingAnswer, setIsEditingAnswer] = useState(false)
  const [editAnswerForm, setEditAnswerForm] = useState({
    question: "",
    answer: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
  })
  const [isSavingAnswer, setIsSavingAnswer] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  // Version history state
  const [answerVersions, setAnswerVersions] = useState<AnswerVersion[]>([])
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<AnswerVersion | null>(null)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeletingAnswer, setIsDeletingAnswer] = useState(false)

  // Adapt content state
  const [showAdaptPanel, setShowAdaptPanel] = useState(false)
  const [adaptationType, setAdaptationType] = useState<AdaptationType>("shorten")
  const [adaptOptions, setAdaptOptions] = useState({
    customInstruction: "",
    targetWordCount: 100,
    clientName: "",
    industry: "",
  })
  const [adaptResult, setAdaptResult] = useState<AIAdaptResponse | null>(null)
  const [isAdapting, setIsAdapting] = useState(false)

  // Count active filters
  const activeFilterCount = [
    typeFilter !== "all",
    topicFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length

  // Load topics on mount
  useEffect(() => {
    async function loadTopics() {
      try {
        const topicsData = await topicsApi.getAll()
        setTopics(
          topicsData.map((t) => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            createdAt: new Date(t.createdAt).getTime(),
          }))
        )
      } catch (err) {
        console.error("Failed to load topics:", err)
      }
    }
    loadTopics()
  }, [])

  // Search function - resets pagination (uses debounced query)
  const performSearch = useCallback(async () => {
    setIsSearching(true)
    try {
      const result = await searchApi.search({
        q: debouncedQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        topicId: topicFilter === "all" ? undefined : topicFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset: 0,
      })
      setAnswers(result.answers)
      setPhotos(result.photos)
      setTotalAnswers(result.totalAnswers)
      setTotalPhotos(result.totalPhotos)
    } catch (err) {
      console.error("Search failed:", err)
    } finally {
      setIsSearching(false)
      setIsLoading(false)
    }
  }, [debouncedQuery, typeFilter, topicFilter, statusFilter])

  // Load more function - appends to existing results
  const loadMore = useCallback(async () => {
    setIsLoadingMore(true)
    try {
      const result = await searchApi.search({
        q: debouncedQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        topicId: topicFilter === "all" ? undefined : topicFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset: answers.length, // Use current answers length as offset
      })
      setAnswers(prev => [...prev, ...result.answers])
      setPhotos(prev => [...prev, ...result.photos])
    } catch (err) {
      console.error("Load more failed:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [debouncedQuery, typeFilter, topicFilter, statusFilter, answers.length])

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Initial load and search on filter changes
  useEffect(() => {
    performSearch()
  }, [performSearch])

  // Listen for entries saved from global NewEntryPanel
  useEffect(() => {
    const handler = () => {
      setNewEntryRefreshKey(k => k + 1)
      performSearch()
    }
    window.addEventListener("new-entry-saved", handler)
    return () => window.removeEventListener("new-entry-saved", handler)
  }, [performSearch])

  // Sort answers - for "relevance", preserve API order (already sorted by score)
  const sortedAnswers = sortBy === "relevance"
    ? answers
    : [...answers].sort((a, b) => {
        switch (sortBy) {
          case "newest":
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          case "oldest":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          case "alphabetical":
            return a.question.localeCompare(b.question)
          default:
            return 0
        }
      })

  // Sort photos - for "relevance", preserve API order (already sorted by score)
  const sortedPhotos = sortBy === "relevance"
    ? photos
    : [...photos].sort((a, b) => {
        switch (sortBy) {
          case "newest":
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          case "oldest":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          case "alphabetical":
            return a.displayTitle.localeCompare(b.displayTitle)
          default:
            return 0
        }
      })

  // Group answers by topic
  const answersByTopic = useMemo(() => {
    const grouped: Record<string, AnswerResponse[]> = {}
    for (const answer of sortedAnswers) {
      const topicId = answer.topicId
      if (!grouped[topicId]) grouped[topicId] = []
      grouped[topicId].push(answer)
    }
    return grouped
  }, [sortedAnswers])

  // Sort topic IDs by count (most results first) - for answers only
  const sortedAnswerTopicIds = useMemo(() => {
    return Object.keys(answersByTopic).sort((a, b) => (answersByTopic[b]?.length || 0) - (answersByTopic[a]?.length || 0))
  }, [answersByTopic])

  // Toggle accordion expansion
  const toggleAnswerTopic = (topicId: string) => {
    setExpandedAnswerTopics(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  // Show more items within a topic
  const showMoreAnswers = (topicId: string) => {
    setAnswerLimits(prev => ({
      ...prev,
      [topicId]: (prev[topicId] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE
    }))
  }

  // Load linked items when detail view opens
  useEffect(() => {
    async function loadLinkedItems() {
      if (selectedAnswer) {
        setLoadingLinked(true)
        try {
          const photos = await searchApi.getLinkedPhotos(selectedAnswer.id)
          setLinkedPhotos(photos)
        } catch (err) {
          console.error("Failed to load linked photos:", err)
        } finally {
          setLoadingLinked(false)
        }
      } else if (selectedPhoto) {
        setLoadingLinked(true)
        try {
          const answers = await searchApi.getLinkedAnswers(selectedPhoto.id)
          setLinkedAnswers(answers)
        } catch (err) {
          console.error("Failed to load linked answers:", err)
        } finally {
          setLoadingLinked(false)
        }
      }
    }
    loadLinkedItems()
  }, [selectedAnswer, selectedPhoto])

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    if (id.startsWith("a")) {
      searchApi.logCopy(id).catch(() => {})
    }
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDownload = (photo: PhotoResponse) => {
    window.open(photosApi.getDownloadUrl(photo.id), "_blank")
  }

  const openLinkPicker = async (type: "photo" | "answer", forId: string) => {
    setLinkPickerType(type)
    setLinkPickerFor(forId)
    setShowLinkPicker(true)
    setLinkPickerSearch("")
    setLinkPickerLoading(true)

    try {
      if (type === "photo") {
        const result = await searchApi.searchPhotos({})
        setAvailableForLink(result)
      } else {
        const result = await searchApi.searchAnswers({})
        setAvailableForLink(result)
      }
    } catch (err) {
      console.error("Failed to load items for linking:", err)
    } finally {
      setLinkPickerLoading(false)
    }
  }

  const handleLink = async (itemId: string) => {
    if (!linkPickerFor) return

    try {
      if (linkPickerType === "photo") {
        await searchApi.link(linkPickerFor, itemId)
        const photos = await searchApi.getLinkedPhotos(linkPickerFor)
        setLinkedPhotos(photos)
      } else {
        await searchApi.link(itemId, linkPickerFor)
        const answers = await searchApi.getLinkedAnswers(linkPickerFor)
        setLinkedAnswers(answers)
      }
      setShowLinkPicker(false)
      performSearch()
    } catch (err) {
      console.error("Failed to create link:", err)
    }
  }

  const handleUnlink = async (answerId: string, photoId: string) => {
    try {
      await searchApi.unlink(answerId, photoId)
      if (selectedAnswer) {
        const photos = await searchApi.getLinkedPhotos(selectedAnswer.id)
        setLinkedPhotos(photos)
      } else if (selectedPhoto) {
        const answers = await searchApi.getLinkedAnswers(selectedPhoto.id)
        setLinkedAnswers(answers)
      }
      performSearch()
    } catch (err) {
      console.error("Failed to unlink:", err)
    }
  }

  const clearAllFilters = () => {
    setSearchQuery("")
    setTypeFilter("all")
    setTopicFilter("all")
    setStatusFilter("all")
    setSortBy("relevance")
  }

  const startEditingPhoto = (photo: PhotoResponse) => {
    setEditPhotoForm({
      displayTitle: photo.displayTitle,
      topicId: photo.topicId,
      status: photo.status,
      tags: photo.tags?.join(", ") || "",
      description: photo.description || "",
    })
    setIsEditingPhoto(true)
  }

  const cancelEditingPhoto = () => {
    setIsEditingPhoto(false)
  }

  const savePhotoChanges = async () => {
    if (!selectedPhoto) return

    setIsSavingPhoto(true)
    try {
      const updatedPhoto = await photosApi.update(selectedPhoto.id, {
        displayTitle: editPhotoForm.displayTitle,
        topicId: editPhotoForm.topicId,
        status: editPhotoForm.status,
        tags: editPhotoForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        description: editPhotoForm.description || undefined,
      })
      setSelectedPhoto(updatedPhoto)
      setIsEditingPhoto(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to save photo:", err)
    } finally {
      setIsSavingPhoto(false)
    }
  }

  // Answer editing functions
  const startEditingAnswer = (answer: AnswerResponse) => {
    setEditAnswerForm({
      question: answer.question,
      answer: answer.answer,
      topicId: answer.topicId,
      status: answer.status,
      tags: answer.tags?.join(", ") || "",
    })
    setIsEditingAnswer(true)
  }

  const cancelEditingAnswer = () => {
    setIsEditingAnswer(false)
    setShowSaveConfirm(false)
  }

  const hasAnswerChanges = () => {
    if (!selectedAnswer) return false
    return (
      editAnswerForm.question !== selectedAnswer.question ||
      editAnswerForm.answer !== selectedAnswer.answer ||
      editAnswerForm.topicId !== selectedAnswer.topicId ||
      editAnswerForm.status !== selectedAnswer.status ||
      editAnswerForm.tags !== (selectedAnswer.tags?.join(", ") || "")
    )
  }

  const confirmSaveAnswer = () => {
    if (hasAnswerChanges()) {
      setShowSaveConfirm(true)
    }
  }

  const saveAnswerChanges = async () => {
    if (!selectedAnswer) return

    setIsSavingAnswer(true)
    try {
      const updatedAnswer = await answersApi.update(selectedAnswer.id, {
        question: editAnswerForm.question,
        answer: editAnswerForm.answer,
        topicId: editAnswerForm.topicId,
        status: editAnswerForm.status,
        tags: editAnswerForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      })
      setSelectedAnswer(updatedAnswer)
      setIsEditingAnswer(false)
      setShowSaveConfirm(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to save answer:", err)
    } finally {
      setIsSavingAnswer(false)
    }
  }

  const deleteAnswer = async () => {
    if (!selectedAnswer) return

    setIsDeletingAnswer(true)
    try {
      await answersApi.delete(selectedAnswer.id)
      setSelectedAnswer(null)
      setShowDeleteConfirm(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to delete answer:", err)
    } finally {
      setIsDeletingAnswer(false)
    }
  }

  // Version history functions
  const loadVersionHistory = async (answerId: string) => {
    setLoadingVersions(true)
    try {
      const versions = await answersApi.getVersions(answerId)
      setAnswerVersions(versions)
      setShowVersionHistory(true)
    } catch (err) {
      console.error("Failed to load version history:", err)
    } finally {
      setLoadingVersions(false)
    }
  }

  const restoreVersion = (version: AnswerVersion) => {
    setEditAnswerForm({
      question: version.question,
      answer: version.answer,
      topicId: version.topicId,
      status: version.status,
      tags: version.tags?.join(", ") || "",
    })
    setIsEditingAnswer(true)
    setShowVersionHistory(false)
    setSelectedVersion(null)
  }

  const getTopicIndex = (topicId: string): number => {
    const idx = topics.findIndex((t) => t.id === topicId)
    return idx >= 0 ? idx : 0
  }

  const handleAdaptContent = async (content: string) => {
    setIsAdapting(true)
    setAdaptResult(null)

    try {
      const result = await aiApi.adapt({
        content,
        adaptationType,
        customInstruction: adaptationType === "custom" ? adaptOptions.customInstruction : undefined,
        targetWordCount: adaptationType === "shorten" ? adaptOptions.targetWordCount : undefined,
        clientName: adaptOptions.clientName || undefined,
        industry: adaptOptions.industry || undefined,
      })
      setAdaptResult(result)
    } catch (err) {
      console.error("Adaptation failed:", err)
      setAdaptResult({
        adaptedContent: "",
        originalContent: content,
        instruction: adaptationType,
        refused: true,
        refusalReason: "Failed to adapt content. Please try again.",
      })
    } finally {
      setIsAdapting(false)
    }
  }

  const resetAdaptPanel = () => {
    setShowAdaptPanel(false)
    setAdaptResult(null)
    setAdaptationType("shorten")
    setAdaptOptions({
      customInstruction: "",
      targetWordCount: 100,
      clientName: "",
      industry: "",
    })
  }

  if (isLoading && activeSection === "qa") {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
        <AppHeader />
        <div className="flex-1 flex">
          <aside className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 pt-4 pb-6 px-2.5 space-y-1">
            {([
              { id: "qa" as const, label: "Q&A Library", icon: FileText },
              { id: "client-success" as const, label: "Client Success", icon: Trophy },
              { id: "proposals" as const, label: "Proposal Data", icon: TrendingUp },
            ]).map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                  activeSection === section.id
                    ? "bg-slate-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                }`}
              >
                <section.icon size={15} className={activeSection === section.id ? "text-white" : ""} />
                <span className="text-[13px] font-medium">{section.label}</span>
              </button>
            ))}
            {isAdmin && (
              <div className="border-t border-slate-200 dark:border-slate-700 mt-3 pt-3">
                <button onClick={() => setShowNewEntry(true)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all text-[13px] font-medium">
                  <Plus size={15} /> New Entry
                </button>
              </div>
            )}
          </aside>
          <main className="flex-1">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
              <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-xl shimmer" />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 space-y-4">
                  <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded shimmer" />
                  {[...Array(5)].map((_, i) => (
                    <AnswerCardSkeleton key={i} />
                  ))}
                </div>
                <div className="lg:col-span-2 space-y-3">
                  <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded shimmer" />
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <PhotoCardSkeleton key={i} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <div className="flex-1 flex">
        {/* Sidebar Navigation */}
        <aside className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 pt-4 pb-6 px-2.5 space-y-1">
          {([
            { id: "qa" as const, label: "Q&A Library", icon: FileText },
            { id: "client-success" as const, label: "Client Success", icon: Trophy },
            { id: "proposals" as const, label: "Proposal Data", icon: TrendingUp },
          ]).map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                activeSection === section.id
                  ? "bg-slate-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
              }`}
            >
              <section.icon size={15} className={activeSection === section.id ? "text-white" : ""} />
              <span className="text-[13px] font-medium">{section.label}</span>
            </button>
          ))}
          {isAdmin && (
            <div className="border-t border-slate-200 dark:border-slate-700 mt-3 pt-3">
              <button onClick={() => setShowNewEntry(true)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all text-[13px] font-medium">
                <Plus size={15} /> New Entry
              </button>
            </div>
          )}
        </aside>

        {/* Content Area */}
        {activeSection === "qa" ? (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
          {/* Search bar + Filters (same row) */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search input - left side */}
            <div className="flex-1 min-w-[200px] relative group">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search answers and photos..."
                className="pl-11 h-11 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && performSearch()}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Filters - right side */}
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as SearchItemType)}
            >
              <SelectTrigger className="w-32 h-11 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="answers">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-blue-500" />
                    Answers
                  </div>
                </SelectItem>
                <SelectItem value="photos">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-purple-500" />
                    Photos
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="w-36 h-11 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {topics.map((topic, i) => {
                  const color = getTopicColor(topic.id, i)
                  return (
                    <SelectItem key={topic.id} value={topic.id}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${color.bg} border ${color.border}`} />
                        {topic.displayName}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ItemStatus | "all")}
            >
              <SelectTrigger className="w-32 h-11 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Approved">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    Approved
                  </div>
                </SelectItem>
                <SelectItem value="Draft">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-amber-500" />
                    Draft
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-36 h-11 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <ArrowUpDown size={14} className="mr-2 text-slate-400" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="alphabetical">A-Z</SelectItem>
              </SelectContent>
            </Select>

            {isSearching && (
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
            )}
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalAnswers}</span> answers,{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalPhotos}</span> photos
            </p>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-slate-500 hover:text-slate-700 h-8 rounded-lg"
              >
                <X size={14} className="mr-1" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Results - Two Column Layout */}
          <div className={`grid grid-cols-1 ${showPhotos ? "lg:grid-cols-5" : ""} gap-6`}>
            {/* Answers Column - Takes up 3 columns (or full width if photos hidden) */}
            <div className={`${showPhotos ? "lg:col-span-3" : ""} space-y-3`}>
              {/* Answers Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText size={18} className="text-blue-600" />
                  Answers
                  <span className="text-slate-500 dark:text-slate-400 font-normal text-sm">
                    ({sortedAnswers.length}{totalAnswers > sortedAnswers.length ? ` of ${totalAnswers}` : ""})
                  </span>
                </h2>
              </div>

              {/* Top 10 Most Relevant Answers (when searching) */}
              {searchQuery && sortedAnswers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Sparkles size={14} className="text-amber-500" />
                    <span>Top results</span>
                  </div>
                  {sortedAnswers.slice(0, 10).map((answer) => {
                    const topicColor = getTopicColor(answer.topicId, getTopicIndex(answer.topicId))
                    return (
                      <Card
                        key={answer.id}
                        className="hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer group rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 transition-all duration-200 ease-out"
                        onClick={() => setSelectedAnswer(answer)}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/80 flex items-center justify-center flex-shrink-0 group-hover:from-blue-100 group-hover:to-blue-200 transition-all duration-200 group-hover:shadow-[0_2px_8px_rgba(59,130,246,0.15)]">
                              <FileText size={20} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                {shouldHighlight && debouncedQuery ? highlightText(answer.question, debouncedQuery) : answer.question}
                              </h3>
                              <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm line-clamp-2 leading-relaxed">
                                {shouldHighlight && debouncedQuery ? highlightText(answer.answer, debouncedQuery) : answer.answer}
                              </p>
                              <div className="flex items-center gap-2 mt-3 flex-wrap">
                                <Badge
                                  variant="secondary"
                                  className={`${topicColor.bg} ${topicColor.text} border ${topicColor.border}`}
                                >
                                  {topics.find((t) => t.id === answer.topicId)?.displayName || "Unknown"}
                                </Badge>
                                {answer.status === "Approved" ? (
                                  <Badge variant="success" className="text-xs">Approved</Badge>
                                ) : (
                                  <Badge variant="warning" className="text-xs">Draft</Badge>
                                )}
                                {answer.tags.slice(0, 2).map((tag, i) => (
                                  <Badge key={tag} variant={i === 0 ? "purple" : "teal"} className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {answer.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">+{answer.tags.length - 2}</Badge>
                                )}
                                {answer.linkedPhotosCount != null && answer.linkedPhotosCount > 0 && (
                                  <Badge variant="outline" className="text-xs ml-auto">
                                    <ImageIcon size={10} className="mr-1" />
                                    {answer.linkedPhotosCount}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopy(answer.answer, answer.id)}
                                className="h-9 w-9 p-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                {copiedId === answer.id ? (
                                  <Check size={16} className="text-emerald-500" />
                                ) : (
                                  <Copy size={16} className="text-slate-400" />
                                )}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
                                <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* Browse by Topic Section */}
              {sortedAnswers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 pt-2">
                    <Filter size={14} />
                    <span>Browse by topic</span>
                  </div>
                </div>
              )}

              {/* Answers - Grouped by Topic Accordions */}
              {sortedAnswers.length > 0 && sortedAnswerTopicIds.map((topicId) => {
                const topicAnswers = answersByTopic[topicId] || []
                if (topicAnswers.length === 0) return null
                const topic = topics.find(t => t.id === topicId)
                const topicColor = getTopicColor(topicId, getTopicIndex(topicId))
                const isExpanded = expandedAnswerTopics.has(topicId)
                const limit = answerLimits[topicId] || ITEMS_PER_PAGE
                const visibleAnswers = topicAnswers.slice(0, limit)
                const hasMore = topicAnswers.length > limit
                const remaining = topicAnswers.length - limit

                return (
                  <div key={topicId} className="rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                    {/* Accordion Header */}
                    <button
                      onClick={() => toggleAnswerTopic(topicId)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <ChevronRight
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <Badge
                        variant="secondary"
                        className={`${topicColor.bg} ${topicColor.text} border ${topicColor.border} flex items-center gap-1.5`}
                      >
                        <FolderOpen size={12} />
                        {topic?.displayName || "Unknown"}
                      </Badge>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">
                        ({topicAnswers.length} {topicAnswers.length === 1 ? 'answer' : 'answers'})
                      </span>
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/60 dark:border-slate-700">
                        <div className="p-3 space-y-3">
                          {visibleAnswers.map((answer) => (
                            <Card
                              key={answer.id}
                              className="hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer group rounded-xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-900 transition-all duration-200 ease-out"
                              onClick={() => setSelectedAnswer(answer)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/80 flex items-center justify-center flex-shrink-0 group-hover:from-blue-100 group-hover:to-blue-200 transition-all duration-200">
                                    <FileText size={16} className="text-blue-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug text-sm">
                                      {shouldHighlight && debouncedQuery ? highlightText(answer.question, debouncedQuery) : answer.question}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm line-clamp-2 leading-relaxed">
                                      {shouldHighlight && debouncedQuery ? highlightText(answer.answer, debouncedQuery) : answer.answer}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                      {answer.status === "Approved" ? (
                                        <Badge variant="success" className="text-xs">Approved</Badge>
                                      ) : (
                                        <Badge variant="warning" className="text-xs">Draft</Badge>
                                      )}
                                      {answer.tags.slice(0, 2).map((tag, i) => (
                                        <Badge key={tag} variant={i === 0 ? "purple" : "teal"} className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                      {answer.tags.length > 2 && (
                                        <Badge variant="outline" className="text-xs">+{answer.tags.length - 2}</Badge>
                                      )}
                                      {answer.linkedPhotosCount != null && answer.linkedPhotosCount > 0 && (
                                        <Badge variant="outline" className="text-xs ml-auto">
                                          <ImageIcon size={10} className="mr-1" />
                                          {answer.linkedPhotosCount}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCopy(answer.answer, answer.id)}
                                      className="h-8 w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                      {copiedId === answer.id ? (
                                        <Check size={14} className="text-emerald-500" />
                                      ) : (
                                        <Copy size={14} className="text-slate-400" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        {/* Show More Button */}
                        {hasMore && (
                          <div className="px-3 pb-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showMoreAnswers(topicId)}
                              className="w-full h-9 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              Show {Math.min(ITEMS_PER_PAGE, remaining)} more
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {sortedAnswers.length === 0 && (
                <div className="text-center py-14 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px]">No answers found</p>
                </div>
              )}
            </div>

            {/* Photos Column - Takes up 2 columns (hidden if searchIncludePhotos is off) */}
            {showPhotos && <div className="lg:col-span-2 space-y-3">
              {/* Photos Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon size={18} className="text-purple-600" />
                  Photos
                  <span className="text-slate-500 dark:text-slate-400 font-normal text-sm">
                    ({sortedPhotos.length}{totalPhotos > sortedPhotos.length ? ` of ${totalPhotos}` : ""})
                  </span>
                </h2>
              </div>

              {/* Photos Grid - Flat list sorted by relevance */}
              {sortedPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {sortedPhotos.map((photo) => {
                    const topicColor = getTopicColor(photo.topicId, getTopicIndex(photo.topicId))
                    return (
                      <Card
                        key={photo.id}
                        className="overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] cursor-pointer group rounded-xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 transition-all duration-300 ease-out hover:-translate-y-0.5"
                        onClick={() => setSelectedPhoto(photo)}
                      >
                        <div className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
                          <img
                            src={photosApi.getFileUrl(photo.storageKey)}
                            alt={photo.displayTitle}
                            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            onError={(e) => {
                              e.currentTarget.style.display = "none"
                              e.currentTarget.nextElementSibling?.classList.remove("hidden")
                            }}
                          />
                          <div className="hidden absolute inset-0 flex items-center justify-center">
                            <ImageIcon size={24} className="text-slate-300 dark:text-slate-500" />
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full h-7 bg-white/95 backdrop-blur-sm hover:bg-white text-[10px] rounded-lg shadow-lg"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownload(photo)
                              }}
                            >
                              <Download size={10} className="mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="font-medium text-xs text-slate-900 dark:text-white truncate">
                            {photo.displayTitle}
                          </p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1 py-0 ${topicColor.bg} ${topicColor.text}`}
                            >
                              {topics.find((t) => t.id === photo.topicId)?.displayName || "Unknown"}
                            </Badge>
                            {photo.status === "Approved" ? (
                              <Badge variant="success" className="text-[9px] px-1 py-0">Approved</Badge>
                            ) : (
                              <Badge variant="warning" className="text-[9px] px-1 py-0">Draft</Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}

              {sortedPhotos.length === 0 && (
                <div className="text-center py-14 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <ImageIcon size={24} className="text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px]">No photos found</p>
                </div>
              )}
            </div>}
          </div>

          {/* Load More Button */}
          {(answers.length < totalAnswers || photos.length < totalPhotos) && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="h-12 px-8 rounded-xl border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Load More
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      ({answers.length} of {totalAnswers} answers, {photos.length} of {totalPhotos} photos)
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Empty state when both are empty */}
          {answers.length === 0 && photos.length === 0 && (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200/80 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mx-auto mb-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <Search size={32} className="text-slate-400" />
              </div>
              <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">No results found</p>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto text-[15px] leading-relaxed">
                Try adjusting your search query or filters to find what you're looking for.
              </p>
              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  className="mt-5 rounded-xl h-11"
                >
                  <X size={16} className="mr-2" />
                  Clear all filters
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
        ) : activeSection === "client-success" ? (
          <ClientSuccessSection refreshKey={newEntryRefreshKey} />
        ) : (
          <ProposalsSection />
        )}
      </div>

      {/* New Entry Panel */}
      <NewEntryPanel
        isOpen={showNewEntry}
        onClose={() => setShowNewEntry(false)}
        onSaved={() => {
          setNewEntryRefreshKey(k => k + 1)
          // Re-fetch Q&A data when a new Q&A or photo entry is saved
          performSearch()
        }}
        defaultType={activeSection === "client-success" ? "success" : activeSection === "qa" ? "qa" : undefined}
      />

      {/* Answer Detail Dialog */}
      <Dialog open={!!selectedAnswer} onOpenChange={(open) => {
        if (!open && !showSaveConfirm && !showDeleteConfirm) {
          setSelectedAnswer(null)
          resetAdaptPanel()
          setIsEditingAnswer(false)
          setShowVersionHistory(false)
          setShowSaveConfirm(false)
          setShowDeleteConfirm(false)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between pr-8">
              <DialogTitle className="text-xl leading-tight">
                {isEditingAnswer ? "Edit Answer" : selectedAnswer?.question}
              </DialogTitle>
              {selectedAnswer && !isEditingAnswer && !showVersionHistory && !showDeleteConfirm && (
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadVersionHistory(selectedAnswer.id)}
                    className="rounded-lg"
                    disabled={loadingVersions}
                  >
                    {loadingVersions ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <History size={14} className="mr-1.5" />
                    )}
                    History
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditingAnswer(selectedAnswer)}
                      className="rounded-lg"
                    >
                      <Pencil size={14} className="mr-1.5" />
                      Edit
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </div>
            <DialogDescription className="sr-only">
              Answer details and linked photos
            </DialogDescription>
          </DialogHeader>
          {selectedAnswer && showDeleteConfirm ? (
            /* Delete Confirmation View */
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                    <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-red-900 dark:text-red-200">Delete this answer?</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      This action cannot be undone. The answer and all its version history will be permanently deleted.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">Answer to delete:</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{selectedAnswer.question}</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-xl"
                  disabled={isDeletingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={deleteAnswer}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeletingAnswer}
                >
                  {isDeletingAnswer ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} className="mr-2" />
                      Delete Answer
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : selectedAnswer && showVersionHistory ? (
            /* Version History View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <History size={18} className="text-blue-600" />
                  Version History
                  <span className="text-slate-500 font-normal">({answerVersions.length} versions)</span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowVersionHistory(false)
                    setSelectedVersion(null)
                  }}
                  className="rounded-lg"
                >
                  <X size={14} className="mr-1.5" />
                  Close
                </Button>
              </div>

              {answerVersions.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  No version history available yet.
                </p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {answerVersions.slice().reverse().map((version) => (
                    <div
                      key={version.id}
                      className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                        selectedVersion?.id === version.id
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            v{version.versionNumber}
                          </Badge>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(version.createdAt).toLocaleDateString()} at{" "}
                            {new Date(version.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {version.versionNumber === answerVersions.length && (
                          <Badge variant="success" className="text-xs">Current</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{version.question}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">{version.answer}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedVersion && selectedVersion.versionNumber !== answerVersions.length && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-900 dark:text-amber-200">Restore this version?</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        This will open the editor with v{selectedVersion.versionNumber}'s content.
                        You can review and save it as a new version.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3 rounded-lg"
                        onClick={() => restoreVersion(selectedVersion)}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        Restore Version
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : selectedAnswer && isEditingAnswer ? (
            /* Edit Mode */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="answer-question">Question</Label>
                <Textarea
                  id="answer-question"
                  value={editAnswerForm.question}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, question: e.target.value })}
                  placeholder="Enter the question..."
                  className="rounded-xl min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer-content">Answer</Label>
                <Textarea
                  id="answer-content"
                  value={editAnswerForm.answer}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, answer: e.target.value })}
                  placeholder="Enter the answer..."
                  className="rounded-xl min-h-[150px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="answer-topic">Topic</Label>
                  <Select
                    value={editAnswerForm.topicId}
                    onValueChange={(v) => setEditAnswerForm({ ...editAnswerForm, topicId: v })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {topic.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="answer-status">Status</Label>
                  <Select
                    value={editAnswerForm.status}
                    onValueChange={(v) => setEditAnswerForm({ ...editAnswerForm, status: v as "Approved" | "Draft" })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Approved">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          Approved
                        </div>
                      </SelectItem>
                      <SelectItem value="Draft">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={14} className="text-amber-500" />
                          Draft
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer-tags">Tags (comma-separated)</Label>
                <Input
                  id="answer-tags"
                  value={editAnswerForm.tags}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, tags: e.target.value })}
                  placeholder="tag1, tag2, tag3"
                  className="rounded-xl"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={cancelEditingAnswer}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmSaveAnswer}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer || !editAnswerForm.question.trim() || !editAnswerForm.answer.trim() || !hasAnswerChanges()}
                >
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : selectedAnswer && (
            /* View Mode */
            <div className="space-y-5">
              <div className="flex gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={`${getTopicColor(selectedAnswer.topicId, getTopicIndex(selectedAnswer.topicId)).bg} ${getTopicColor(selectedAnswer.topicId, getTopicIndex(selectedAnswer.topicId)).text}`}
                >
                  {topics.find((t) => t.id === selectedAnswer.topicId)?.displayName}
                </Badge>
                {selectedAnswer.status === "Approved" ? (
                  <Badge variant="success">Approved</Badge>
                ) : (
                  <Badge variant="warning">Draft</Badge>
                )}
                {selectedAnswer.tags.map((tag, i) => (
                  <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedAnswer.answer}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleCopy(selectedAnswer.answer, selectedAnswer.id + "-modal")}
                  className="flex-1 rounded-xl"
                  variant="success"
                >
                  {copiedId === selectedAnswer.id + "-modal" ? (
                    <>
                      <Check size={16} className="mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} className="mr-2" />
                      Copy Answer
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowAdaptPanel(!showAdaptPanel)}
                  className={`flex-1 rounded-xl ${showAdaptPanel ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  variant={showAdaptPanel ? "default" : "outline"}
                >
                  <Wand2 size={16} className="mr-2" />
                  Adapt for RFP
                  <ChevronDown size={14} className={`ml-2 transition-transform ${showAdaptPanel ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {/* Adapt Panel */}
              {showAdaptPanel && (
                <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-xl border border-purple-200 dark:border-purple-800 space-y-4 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-2">
                    <Wand2 size={16} className="text-purple-600" />
                    <span className="font-medium text-slate-900 dark:text-white">Adapt Content</span>
                  </div>

                  {/* Adaptation Type Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { type: "shorten", label: "Shorten" },
                      { type: "expand", label: "Expand" },
                      { type: "bullets", label: "Bullets" },
                      { type: "formal", label: "Formal" },
                      { type: "casual", label: "Casual" },
                      { type: "custom", label: "Custom" },
                    ] as const).map(({ type, label }) => (
                      <Button
                        key={type}
                        variant={adaptationType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAdaptationType(type)}
                        className={`rounded-lg ${adaptationType === type ? "bg-purple-600 hover:bg-purple-700" : "bg-white dark:bg-slate-800"}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {/* Conditional Options */}
                  {adaptationType === "shorten" && (
                    <div className="space-y-2">
                      <Label htmlFor="target-words">Target Word Count</Label>
                      <Input
                        id="target-words"
                        type="number"
                        value={adaptOptions.targetWordCount}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, targetWordCount: parseInt(e.target.value) || 100 })}
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl w-32"
                        min={25}
                        max={500}
                      />
                    </div>
                  )}

                  {adaptationType === "custom" && (
                    <div className="space-y-2">
                      <Label htmlFor="custom-instruction">Custom Instruction</Label>
                      <Textarea
                        id="custom-instruction"
                        value={adaptOptions.customInstruction}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, customInstruction: e.target.value })}
                        placeholder="Describe how you want the content adapted..."
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl min-h-[80px]"
                      />
                    </div>
                  )}

                  {/* Optional Context */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="client-name">Client Name (optional)</Label>
                      <Input
                        id="client-name"
                        value={adaptOptions.clientName}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, clientName: e.target.value })}
                        placeholder="e.g., Acme Corp"
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry (optional)</Label>
                      <Input
                        id="industry"
                        value={adaptOptions.industry}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, industry: e.target.value })}
                        placeholder="e.g., Healthcare"
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => handleAdaptContent(selectedAnswer.answer)}
                    disabled={isAdapting || (adaptationType === "custom" && !adaptOptions.customInstruction.trim())}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    {isAdapting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Adapting...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="mr-2" />
                        Adapt Content
                      </>
                    )}
                  </Button>

                  {/* Adapt Result */}
                  {adaptResult && (
                    <div className="space-y-3 animate-fade-in-up">
                      {adaptResult.refused ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                          <p className="text-amber-800 dark:text-amber-200 text-sm">{adaptResult.refusalReason}</p>
                        </div>
                      ) : (
                        <>
                          <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                              {adaptResult.adaptedContent}
                            </p>
                          </div>
                          <Button
                            onClick={() => handleCopy(adaptResult.adaptedContent, "adapted-content")}
                            variant="success"
                            className="w-full rounded-xl"
                          >
                            {copiedId === "adapted-content" ? (
                              <>
                                <Check size={16} className="mr-2" />
                                Copied Adapted Content
                              </>
                            ) : (
                              <>
                                <Copy size={16} className="mr-2" />
                                Copy Adapted Content
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Related Content */}
              <RelatedContent
                currentAnswerId={selectedAnswer.id}
                currentQuestion={selectedAnswer.question}
                currentTopicId={selectedAnswer.topicId}
              />

              {/* Linked Photos section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ImageIcon size={16} />
                    Linked Photos
                    <span className="text-slate-500 dark:text-slate-400 font-normal">({linkedPhotos.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openLinkPicker("photo", selectedAnswer.id)}
                      className="rounded-lg"
                    >
                      <Link2 size={14} className="mr-1.5" />
                      Link Photos
                    </Button>
                  )}
                </div>
                {linkedPhotos.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    No photos linked to this answer yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {linkedPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-xl relative group overflow-hidden"
                      >
                        <img
                          src={photosApi.getFileUrl(photo.storageKey)}
                          alt={photo.displayTitle}
                          className="w-full h-full object-cover"
                        />
                        {isAdmin && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg rounded-lg"
                            onClick={() => handleUnlink(selectedAnswer.id, photo.id)}
                          >
                            <Unlink size={12} />
                          </Button>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs truncate font-medium">
                            {photo.displayTitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Detail Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={(open) => {
        if (!open) {
          setSelectedPhoto(null)
          setIsEditingPhoto(false)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between pr-8">
              <DialogTitle className="text-xl">
                {isEditingPhoto ? "Edit Photo" : selectedPhoto?.displayTitle}
              </DialogTitle>
              {selectedPhoto && !isEditingPhoto && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditingPhoto(selectedPhoto)}
                  className="rounded-lg ml-4"
                >
                  <Pencil size={14} className="mr-1.5" />
                  Edit
                </Button>
              )}
            </div>
            <DialogDescription className="sr-only">
              Photo details and linked answers
            </DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-5">
              <div className="aspect-video bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                <img
                  src={photosApi.getFileUrl(selectedPhoto.storageKey)}
                  alt={selectedPhoto.displayTitle}
                  className="w-full h-full object-contain"
                />
              </div>

              {isEditingPhoto ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="photo-title">Title</Label>
                    <Input
                      id="photo-title"
                      value={editPhotoForm.displayTitle}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, displayTitle: e.target.value })}
                      placeholder="Photo title"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="photo-topic">Topic</Label>
                      <Select
                        value={editPhotoForm.topicId}
                        onValueChange={(v) => setEditPhotoForm({ ...editPhotoForm, topicId: v })}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select topic" />
                        </SelectTrigger>
                        <SelectContent>
                          {topics.map((topic) => (
                            <SelectItem key={topic.id} value={topic.id}>
                              {topic.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="photo-status">Status</Label>
                      <Select
                        value={editPhotoForm.status}
                        onValueChange={(v) => setEditPhotoForm({ ...editPhotoForm, status: v as "Approved" | "Draft" })}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Approved">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-emerald-500" />
                              Approved
                            </div>
                          </SelectItem>
                          <SelectItem value="Draft">
                            <div className="flex items-center gap-2">
                              <AlertCircle size={14} className="text-amber-500" />
                              Draft
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="photo-tags">Tags (comma-separated)</Label>
                    <Input
                      id="photo-tags"
                      value={editPhotoForm.tags}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, tags: e.target.value })}
                      placeholder="tag1, tag2, tag3"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="photo-description">Description</Label>
                    <Textarea
                      id="photo-description"
                      value={editPhotoForm.description}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, description: e.target.value })}
                      placeholder="Optional description..."
                      className="rounded-xl min-h-[80px]"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={cancelEditingPhoto}
                      className="flex-1 rounded-xl"
                      disabled={isSavingPhoto}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={savePhotoChanges}
                      className="flex-1 rounded-xl"
                      disabled={isSavingPhoto || !editPhotoForm.displayTitle.trim()}
                    >
                      {isSavingPhoto ? (
                        <Loader2 size={16} className="mr-2 animate-spin" />
                      ) : (
                        <Save size={16} className="mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div className="flex gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={`${getTopicColor(selectedPhoto.topicId, getTopicIndex(selectedPhoto.topicId)).bg} ${getTopicColor(selectedPhoto.topicId, getTopicIndex(selectedPhoto.topicId)).text}`}
                    >
                      {topics.find((t) => t.id === selectedPhoto.topicId)?.displayName}
                    </Badge>
                    {selectedPhoto.status === "Approved" ? (
                      <Badge variant="success">Approved</Badge>
                    ) : (
                      <Badge variant="warning">Draft</Badge>
                    )}
                    {selectedPhoto.tags?.map((tag, i) => (
                      <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {selectedPhoto.description && (
                    <p className="text-slate-600 dark:text-slate-400">{selectedPhoto.description}</p>
                  )}

                  <Button onClick={() => handleDownload(selectedPhoto)} className="w-full rounded-xl">
                    <Download size={16} className="mr-2" />
                    Download Photo
                  </Button>
                </>
              )}

              {/* Linked Answers section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText size={16} />
                    Linked Answers
                    <span className="text-slate-500 dark:text-slate-400 font-normal">({linkedAnswers.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLinkPicker("answer", selectedPhoto.id)}
                    className="rounded-lg"
                  >
                    <Link2 size={14} className="mr-1.5" />
                    Link Answers
                  </Button>
                </div>
                {linkedAnswers.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    No answers linked to this photo yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedAnswers.map((answer) => (
                      <div
                        key={answer.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-start gap-3 group hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <FileText size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                            {answer.question}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-1 mt-0.5">
                            {answer.answer}
                          </p>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleUnlink(answer.id, selectedPhoto.id)}
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Picker Dialog */}
      <Dialog open={showLinkPicker} onOpenChange={(open) => {
        setShowLinkPicker(open)
        if (!open) {
          setLinkPickerSearch("")
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {linkPickerType === "photo" ? (
                <ImageIcon size={20} className="text-purple-600" />
              ) : (
                <FileText size={20} className="text-blue-600" />
              )}
              Link {linkPickerType === "photo" ? "Photos" : "Answers"}
            </DialogTitle>
            <DialogDescription>
              Select {linkPickerType === "photo" ? "photos" : "answers"} to link to this {linkPickerType === "photo" ? "answer" : "photo"}
            </DialogDescription>
          </DialogHeader>

          {/* Search Input */}
          <div className="relative mt-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={linkPickerSearch}
              onChange={(e) => setLinkPickerSearch(e.target.value)}
              placeholder={`Search ${linkPickerType === "photo" ? "photos" : "answers"}...`}
              className="pl-9 rounded-xl"
            />
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto space-y-2 mt-3 min-h-[200px] max-h-[400px]">
            {linkPickerLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {availableForLink
                  .filter((item) => {
                    if (!linkPickerSearch.trim()) return true
                    const searchLower = linkPickerSearch.toLowerCase()
                    if (linkPickerType === "photo") {
                      const photo = item as PhotoResponse
                      return photo.displayTitle.toLowerCase().includes(searchLower) ||
                        photo.tags?.some(tag => tag.toLowerCase().includes(searchLower))
                    } else {
                      const answer = item as AnswerResponse
                      return answer.question.toLowerCase().includes(searchLower) ||
                        answer.answer.toLowerCase().includes(searchLower)
                    }
                  })
                  .filter((item) => {
                    // Filter out already linked items
                    if (linkPickerType === "photo") {
                      return !linkedPhotos.some(p => p.id === item.id)
                    } else {
                      return !linkedAnswers.some(a => a.id === item.id)
                    }
                  })
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 border border-transparent transition-all group"
                      onClick={() => handleLink(item.id)}
                    >
                      {linkPickerType === "photo" ? (
                        <>
                          <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={photosApi.getFileUrl((item as PhotoResponse).storageKey)}
                              alt={(item as PhotoResponse).displayTitle}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                              {(item as PhotoResponse).displayTitle}
                            </p>
                            {(item as PhotoResponse).tags && (item as PhotoResponse).tags.length > 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {(item as PhotoResponse).tags.slice(0, 3).join(", ")}
                              </p>
                            )}
                          </div>
                          <Link2 size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <FileText size={18} className="text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-white line-clamp-1">
                              {(item as AnswerResponse).question}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {(item as AnswerResponse).answer}
                            </p>
                          </div>
                          <Link2 size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </>
                      )}
                    </div>
                  ))}
                {availableForLink.filter((item) => {
                  if (!linkPickerSearch.trim()) return true
                  const searchLower = linkPickerSearch.toLowerCase()
                  if (linkPickerType === "photo") {
                    const photo = item as PhotoResponse
                    return photo.displayTitle.toLowerCase().includes(searchLower) ||
                      photo.tags?.some(tag => tag.toLowerCase().includes(searchLower))
                  } else {
                    const answer = item as AnswerResponse
                    return answer.question.toLowerCase().includes(searchLower) ||
                      answer.answer.toLowerCase().includes(searchLower)
                  }
                }).filter((item) => {
                  if (linkPickerType === "photo") {
                    return !linkedPhotos.some(p => p.id === item.id)
                  } else {
                    return !linkedAnswers.some(a => a.id === item.id)
                  }
                }).length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      {linkPickerType === "photo" ? (
                        <ImageIcon size={20} className="text-slate-400" />
                      ) : (
                        <FileText size={20} className="text-slate-400" />
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      {linkPickerSearch ? "No matching items found" : `No ${linkPickerType === "photo" ? "photos" : "answers"} available to link`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              Confirm Changes
            </DialogTitle>
            <DialogDescription>
              Review your changes before saving. A new version will be created.
            </DialogDescription>
          </DialogHeader>
          {selectedAnswer && (
            <div className="space-y-4">
              {/* Changes Summary */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {editAnswerForm.question !== selectedAnswer.question && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Question</p>
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-700 dark:text-red-300 line-through">{selectedAnswer.question}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">{editAnswerForm.question}</p>
                      </div>
                    </div>
                  </div>
                )}

                {editAnswerForm.answer !== selectedAnswer.answer && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Answer</p>
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800 max-h-[100px] overflow-y-auto">
                        <p className="text-sm text-red-700 dark:text-red-300 line-through whitespace-pre-wrap">{selectedAnswer.answer}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800 max-h-[100px] overflow-y-auto">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap">{editAnswerForm.answer}</p>
                      </div>
                    </div>
                  </div>
                )}

                {editAnswerForm.topicId !== selectedAnswer.topicId && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Topic</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="line-through text-red-600 dark:text-red-400">
                        {topics.find(t => t.id === selectedAnswer.topicId)?.displayName}
                      </Badge>
                      <span className="text-slate-400">→</span>
                      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
                        {topics.find(t => t.id === editAnswerForm.topicId)?.displayName}
                      </Badge>
                    </div>
                  </div>
                )}

                {editAnswerForm.status !== selectedAnswer.status && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Status</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedAnswer.status === "Approved" ? "success" : "warning"} className="line-through opacity-60">
                        {selectedAnswer.status}
                      </Badge>
                      <span className="text-slate-400">→</span>
                      <Badge variant={editAnswerForm.status === "Approved" ? "success" : "warning"}>
                        {editAnswerForm.status}
                      </Badge>
                    </div>
                  </div>
                )}

                {editAnswerForm.tags !== (selectedAnswer.tags?.join(", ") || "") && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 line-through">{selectedAnswer.tags?.join(", ") || "(none)"}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">{editAnswerForm.tags || "(none)"}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Note:</strong> The original content will be preserved in version history. You can always restore it later.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveConfirm(false)}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveAnswerChanges}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  disabled={isSavingAnswer}
                >
                  {isSavingAnswer ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-2" />
                      Confirm & Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
