import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  Search, Copy, Check, X, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronDown, Trophy, TrendingUp, Quote, Award, Trash2,
} from "lucide-react"
import { Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui"
import { clientSuccessData } from "@/data/clientSuccessData"
import { clientSuccessApi, testimonialsApi } from "@/lib/api"
import { matchesSearch, formatSuccessItem, type ClientSuccessTab, type SuccessSort, type ResultsSort, type TestimonialsSort, type AwardsSort } from "./libraryUtils"

// ─── SuccessCard ───
type SuccessCardProps = {
  cs: {
    id: number; client: string; category: string; focus: string; challenge: string; solution: string
    metrics: { label: string; value: string }[]; testimonial?: { quote: string; attribution: string }
    awards?: string[]; source: "static" | "user"; dbId: string | null; usageCount: number
  }
  isExpanded: boolean; copiedId: string | null
  onToggle: (id: number | null) => void
  onCopy: (text: string, id: string, usageType?: "entry" | "result" | "testimonial" | "award", dbId?: string | null) => void
  onDelete: (type: "entry" | "result" | "testimonial" | "award", id: string) => void
}

const SuccessCard = React.memo(function SuccessCard({ cs, isExpanded, copiedId, onToggle, onCopy, onDelete }: SuccessCardProps) {
  return (
    <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-2xl bg-white dark:bg-slate-800/60 overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-200 hover:-translate-y-0.5">
      <button
        onClick={() => onToggle(isExpanded ? null : cs.id)}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors duration-150"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900 dark:text-white tracking-[-0.005em]">{cs.client}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
              cs.category === "higher-ed" ? "text-blue-600 border-blue-200/60 dark:border-blue-800/40" :
              cs.category === "healthcare" ? "text-teal-600 border-teal-200/60 dark:border-teal-800/40" :
              "text-slate-500 border-slate-200/60 dark:border-slate-700/40"
            }`}>
              {cs.category === "higher-ed" ? "Higher Ed" : cs.category === "healthcare" ? "Healthcare" : "Other"}
            </Badge>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{cs.focus}</p>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">{cs.metrics.length} metrics</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 border-t border-slate-100/60 dark:border-slate-700/30 space-y-3 pt-3">
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
                  <div key={i} className="bg-slate-50/80 dark:bg-slate-700/40 rounded-xl px-3 py-2.5 border border-slate-200/30 dark:border-slate-600/20">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
            {cs.testimonial && (
              <div className="bg-slate-50/80 dark:bg-slate-700/20 rounded-xl p-3 border-l-2 border-blue-300 dark:border-blue-700">
                <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{cs.testimonial.quote}"</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">— {cs.testimonial.attribution}</p>
              </div>
            )}
            {cs.awards && cs.awards.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Awards</p>
                <div className="flex flex-wrap gap-1.5">
                  {cs.awards.map((award, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] text-amber-600 border-amber-200/60 dark:border-amber-800/40">
                      <Award size={10} className="mr-1" />{award}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => onCopy(formatSuccessItem(cs), `cs-${cs.id}`, "entry", cs.dbId)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150">
                {copiedId === `cs-${cs.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copiedId === `cs-${cs.id}` ? "Copied" : "Copy"}
              </button>
              {cs.usageCount > 0 && <span className="text-[10px] text-slate-400">Used {cs.usageCount}x</span>}
              {cs.source === "user" && cs.dbId && (
                <button onClick={() => onDelete("entry", cs.dbId!)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors duration-150">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// ─── TestimonialCard ───
type TestimonialCardProps = {
  t: { quote: string; name: string; title: string; organization: string; source: "static" | "user"; dbId: string | null; usageCount: number }
  index: number; isExpanded: boolean; copiedId: string | null
  onToggle: (id: number | null) => void
  onCopy: (text: string, id: string, usageType?: "entry" | "result" | "testimonial" | "award", dbId?: string | null) => void
  onDelete: (type: "entry" | "result" | "testimonial" | "award", id: string) => void
}

const TestimonialCard = React.memo(function TestimonialCard({ t, index, isExpanded, copiedId, onToggle, onCopy, onDelete }: TestimonialCardProps) {
  return (
    <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-2xl bg-white dark:bg-slate-800/60 px-4 py-3.5 group border-l-2 border-l-blue-300 dark:border-l-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-200">
      <div className="flex gap-3">
        <Quote size={16} className="text-blue-300 dark:text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-slate-700 dark:text-slate-300 ${!isExpanded ? "line-clamp-2" : ""} cursor-pointer`}
            onClick={() => onToggle(isExpanded ? null : -(index + 1))}>
            {t.quote}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.name && <span className="font-medium">{t.name}</span>}
            {t.name && t.title && ", "}{t.title}
            {(t.name || t.title) && t.organization && " — "}{t.organization}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.usageCount > 0 && <span className="text-[10px] text-slate-400">{t.usageCount}x</span>}
          <button onClick={() => onCopy(`"${t.quote}"\n— ${[t.name, t.title, t.organization].filter(Boolean).join(", ")}`, `t-${index}`, "testimonial", t.dbId)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {copiedId === `t-${index}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
          </button>
          {t.source === "user" && t.dbId && (
            <button onClick={() => onDelete("testimonial", t.dbId!)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <Trash2 size={13} className="text-red-400 hover:text-red-600" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

// ─── Main Section ───
export function ClientSuccessSection({ refreshKey }: { refreshKey: number }) {
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

  const PAGE_SIZE_CS = 20
  const [visibleSuccessCount, setVisibleSuccessCount] = useState(PAGE_SIZE_CS)
  const [visibleResultsCount, setVisibleResultsCount] = useState(PAGE_SIZE_CS)
  const [visibleTestimonialsCount, setVisibleTestimonialsCount] = useState(PAGE_SIZE_CS)
  const [visibleAwardsCount, setVisibleAwardsCount] = useState(PAGE_SIZE_CS)

  const [dbEntries, setDbEntries] = useState<any[]>([])
  const [dbResults, setDbResults] = useState<any[]>([])
  const [dbTestimonials, setDbTestimonials] = useState<any[]>([])
  const [dbAwards, setDbAwards] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      clientSuccessApi.getEntries().catch(() => []),
      clientSuccessApi.getResults().catch(() => []),
      testimonialsApi.list({ limit: 200 }).then(r => r.testimonials).catch(() => []),
      clientSuccessApi.getAwards().catch(() => []),
    ]).then(([entries, results, testimonials, awards]) => {
      setDbEntries(entries as any); setDbResults(results as any)
      setDbTestimonials(testimonials as any); setDbAwards(awards as any)
    })
  }, [refreshKey])

  const handleDelete = useCallback(async (type: "entry" | "result" | "testimonial" | "award", id: string) => {
    try {
      if (type === "entry") { await clientSuccessApi.deleteEntry(id); setDbEntries(prev => prev.filter(e => e.id !== id)) }
      if (type === "result") { await clientSuccessApi.deleteResult(id); setDbResults(prev => prev.filter(e => e.id !== id)) }
      if (type === "testimonial") { await testimonialsApi.delete(id); setDbTestimonials(prev => prev.filter(e => e.id !== id)) }
      if (type === "award") { await clientSuccessApi.deleteAward(id); setDbAwards(prev => prev.filter(e => e.id !== id)) }
    } catch {}
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setQuery(""); setDebouncedQuery(""); setCategoryFilter("all"); setDirectionFilter("all"); setExpandedId(null)
    setVisibleSuccessCount(PAGE_SIZE_CS); setVisibleResultsCount(PAGE_SIZE_CS)
    setVisibleTestimonialsCount(PAGE_SIZE_CS); setVisibleAwardsCount(PAGE_SIZE_CS)
  }, [tab])

  useEffect(() => { setVisibleSuccessCount(PAGE_SIZE_CS); setExpandedId(null) }, [debouncedQuery, categoryFilter, successSort])
  useEffect(() => { setVisibleResultsCount(PAGE_SIZE_CS) }, [debouncedQuery, directionFilter, resultsSort])
  useEffect(() => { setVisibleTestimonialsCount(PAGE_SIZE_CS) }, [debouncedQuery, testimonialSort])
  useEffect(() => { setVisibleAwardsCount(PAGE_SIZE_CS) }, [debouncedQuery, awardSort])

  const handleCopy = useCallback(async (text: string, id: string, usageType?: "entry" | "result" | "testimonial" | "award", dbId?: string | null) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    if (dbId && usageType) {
      if (usageType === "entry") clientSuccessApi.incrementEntryUsage(dbId).catch(() => {})
      if (usageType === "result") clientSuccessApi.incrementResultUsage(dbId).catch(() => {})
      if (usageType === "testimonial") testimonialsApi.incrementUsage(dbId).catch(() => {})
      if (usageType === "award") clientSuccessApi.incrementAwardUsage(dbId).catch(() => {})
    }
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const filteredSuccessItems = useMemo(() => {
    const staticItems = clientSuccessData.caseStudies.map(cs => ({ ...cs, source: "static" as const, dbId: null as string | null, usageCount: 0 }))
    const userItems = dbEntries.map((e: any, i: number) => ({
      id: 10000 + i, client: e.client, category: e.category, focus: e.focus,
      challenge: e.challenge || "", solution: e.solution || "",
      metrics: e.metrics || [], testimonial: e.testimonialQuote ? { quote: e.testimonialQuote, attribution: e.testimonialAttribution || "" } : undefined,
      awards: [] as string[], source: "user" as const, dbId: e.id as string | null, usageCount: e.usageCount || 0,
    }))
    return [...staticItems, ...userItems]
      .filter(cs => (categoryFilter === "all" || cs.category === categoryFilter) && matchesSearch(`${cs.client} ${cs.focus} ${cs.challenge} ${cs.solution}`, debouncedQuery))
      .sort((a, b) => {
        switch (successSort) {
          case "most-used": return b.usageCount - a.usageCount
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
    const staticItems = clientSuccessData.topLineResults.map(r => ({ ...r, source: "static" as const, dbId: null as string | null, usageCount: 0 }))
    const userItems = dbResults.map((r: any) => ({ metric: r.metric, result: r.result, client: r.client, numericValue: r.numericValue, direction: r.direction, source: "user" as const, dbId: r.id as string | null, usageCount: r.usageCount || 0 }))
    return [...staticItems, ...userItems]
      .filter(r => (directionFilter === "all" || r.direction === directionFilter) && matchesSearch(`${r.metric} ${r.client} ${r.result}`, debouncedQuery))
      .sort((a, b) => {
        switch (resultsSort) {
          case "most-used": return b.usageCount - a.usageCount
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
    const staticItems = clientSuccessData.testimonials.map(t => ({ ...t, source: "static" as const, dbId: null as string | null, usageCount: 0 }))
    const userItems = dbTestimonials.map((t: any) => ({ quote: t.quote, name: t.name || "", title: t.title || "", organization: t.organization, source: "user" as const, dbId: t.id as string | null, usageCount: (t as any).usageCount || 0 }))
    return [...staticItems, ...userItems]
      .filter(t => matchesSearch(`${t.quote} ${t.name} ${t.organization}`, debouncedQuery))
      .sort((a, b) => {
        switch (testimonialSort) {
          case "most-used": return b.usageCount - a.usageCount
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
    const staticItems = clientSuccessData.awards.map(a => ({ ...a, source: "static" as const, dbId: null as string | null, usageCount: 0 }))
    const userItems = dbAwards.map((a: any) => ({ name: a.name, year: a.year, clientOrProject: a.clientOrProject, source: "user" as const, dbId: a.id as string | null, usageCount: a.usageCount || 0 }))
    return [...staticItems, ...userItems]
      .filter(a => matchesSearch(`${a.name} ${a.clientOrProject}`, debouncedQuery))
      .sort((a, b) => {
        switch (awardSort) {
          case "most-used": return b.usageCount - a.usageCount
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

  const visibleSuccessItems = filteredSuccessItems.slice(0, visibleSuccessCount)
  const visibleResultsItems = filteredResults.slice(0, visibleResultsCount)
  const visibleTestimonialsItems = filteredTestimonials.slice(0, visibleTestimonialsCount)
  const visibleAwardsItems = filteredAwards.slice(0, visibleAwardsCount)

  const tabs: { id: ClientSuccessTab; label: string; count: number }[] = [
    { id: "success", label: "Client Success", count: totalSuccess },
    { id: "results", label: "Results", count: totalResults },
    { id: "testimonials", label: "Testimonials", count: totalTestimonials },
    { id: "awards", label: "Awards", count: totalAwards },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Segmented control */}
        <div className="flex gap-0.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl p-1 w-fit">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                tab === t.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              {t.label}
              <span className="ml-1.5 text-[11px] opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "success" ? "Search client success..." : tab === "results" ? "Search results..." : tab === "testimonials" ? "Search testimonials..." : "Search awards..."}
              className="pl-9 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]" />
            {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
          </div>
          {tab === "success" && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="w-36 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="increase">Increase</SelectItem>
                <SelectItem value="decrease">Decrease</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "success" && (
            <Select value={successSort} onValueChange={(v) => setSuccessSort(v as SuccessSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="most-used">Most Used</SelectItem><SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="client-za">Client Z–A</SelectItem><SelectItem value="metrics-most">Most Metrics</SelectItem>
                <SelectItem value="metrics-least">Fewest Metrics</SelectItem><SelectItem value="category">Category</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "results" && (
            <Select value={resultsSort} onValueChange={(v) => setResultsSort(v as ResultsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="most-used">Most Used</SelectItem><SelectItem value="value-high">Highest Value</SelectItem>
                <SelectItem value="value-low">Lowest Value</SelectItem><SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="client-za">Client Z–A</SelectItem><SelectItem value="metric-az">Metric A–Z</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "testimonials" && (
            <Select value={testimonialSort} onValueChange={(v) => setTestimonialSort(v as TestimonialsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="most-used">Most Used</SelectItem><SelectItem value="org-az">Organization A–Z</SelectItem>
                <SelectItem value="org-za">Organization Z–A</SelectItem><SelectItem value="name-az">Name A–Z</SelectItem>
                <SelectItem value="shortest">Shortest First</SelectItem><SelectItem value="longest">Longest First</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "awards" && (
            <Select value={awardSort} onValueChange={(v) => setAwardSort(v as AwardsSort)}>
              <SelectTrigger className="w-40 h-10 text-sm bg-white dark:bg-slate-800 dark:border-slate-700/60 rounded-xl border-slate-200/80">
                <ArrowUpDown size={13} className="mr-1.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="most-used">Most Used</SelectItem><SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem><SelectItem value="client-az">Client A–Z</SelectItem>
                <SelectItem value="name-az">Award A–Z</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <p className="text-[13px] text-slate-400 dark:text-slate-500">
          {tab === "success" && `Showing ${visibleSuccessItems.length} of ${filteredSuccessItems.length}${filteredSuccessItems.length < totalSuccess ? ` (${totalSuccess} total)` : ""}`}
          {tab === "results" && `Showing ${visibleResultsItems.length} of ${filteredResults.length}${filteredResults.length < totalResults ? ` (${totalResults} total)` : ""}`}
          {tab === "testimonials" && `Showing ${visibleTestimonialsItems.length} of ${filteredTestimonials.length}${filteredTestimonials.length < totalTestimonials ? ` (${totalTestimonials} total)` : ""}`}
          {tab === "awards" && `Showing ${visibleAwardsItems.length} of ${filteredAwards.length}${filteredAwards.length < totalAwards ? ` (${totalAwards} total)` : ""}`}
        </p>

        {/* Content per tab */}
        {tab === "success" && (
          <div className="space-y-2">
            {visibleSuccessItems.map(cs => <SuccessCard key={cs.id} cs={cs} isExpanded={expandedId === cs.id} copiedId={copiedId} onToggle={setExpandedId} onCopy={handleCopy} onDelete={handleDelete} />)}
            {filteredSuccessItems.length > visibleSuccessCount && (
              <div className="flex justify-center pt-2"><Button variant="outline" size="sm" onClick={() => setVisibleSuccessCount(c => c + PAGE_SIZE_CS)} className="h-9 px-5 rounded-xl">Show more <span className="ml-1.5 text-slate-500 text-sm">({visibleSuccessCount} of {filteredSuccessItems.length})</span></Button></div>
            )}
            {filteredSuccessItems.length === 0 && (
              <div className="text-center py-16"><div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Trophy size={22} className="text-slate-300 dark:text-slate-600" /></div><p className="text-sm font-medium text-slate-500">No matching results</p></div>
            )}
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-1">
            {visibleResultsItems.map((r, i) => (
              <div key={r.dbId ?? `static-${r.metric}-${r.client}`} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white dark:hover:bg-slate-900/60 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] group transition-all duration-200">
                <span className={`text-sm font-bold w-20 shrink-0 text-right ${r.direction === "increase" ? "text-emerald-600" : "text-amber-600"}`}>{r.result}</span>
                {r.direction === "increase" ? <ArrowUp size={12} className="text-emerald-500 shrink-0" /> : <ArrowDown size={12} className="text-amber-500 shrink-0" />}
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{r.metric}</span>
                <span className="text-xs text-slate-400 shrink-0">{r.client}</span>
                {r.usageCount > 0 && <span className="text-[10px] text-slate-400 shrink-0">{r.usageCount}x</span>}
                <button onClick={() => handleCopy(`${r.result} ${r.metric} — ${r.client}`, `r-${i}`, "result", r.dbId)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {copiedId === `r-${i}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
                </button>
                {r.source === "user" && r.dbId && <button onClick={() => handleDelete("result", r.dbId!)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"><Trash2 size={13} className="text-red-400 hover:text-red-600" /></button>}
              </div>
            ))}
            {filteredResults.length > visibleResultsCount && (
              <div className="flex justify-center pt-2"><Button variant="outline" size="sm" onClick={() => setVisibleResultsCount(c => c + PAGE_SIZE_CS)} className="h-9 px-5 rounded-xl">Show more <span className="ml-1.5 text-slate-500 text-sm">({visibleResultsCount} of {filteredResults.length})</span></Button></div>
            )}
            {filteredResults.length === 0 && (
              <div className="text-center py-16"><div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><TrendingUp size={22} className="text-slate-300 dark:text-slate-600" /></div><p className="text-sm font-medium text-slate-500">No matching results</p></div>
            )}
          </div>
        )}

        {tab === "testimonials" && (
          <div className="space-y-2">
            {visibleTestimonialsItems.map((t, i) => <TestimonialCard key={t.dbId ?? `static-${t.organization}-${i}`} t={t} index={i} isExpanded={expandedId === -(i + 1)} copiedId={copiedId} onToggle={setExpandedId} onCopy={handleCopy} onDelete={handleDelete} />)}
            {filteredTestimonials.length > visibleTestimonialsCount && (
              <div className="flex justify-center pt-2"><Button variant="outline" size="sm" onClick={() => setVisibleTestimonialsCount(c => c + PAGE_SIZE_CS)} className="h-9 px-5 rounded-xl">Show more <span className="ml-1.5 text-slate-500 text-sm">({visibleTestimonialsCount} of {filteredTestimonials.length})</span></Button></div>
            )}
            {filteredTestimonials.length === 0 && (
              <div className="text-center py-16"><div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Quote size={22} className="text-slate-300 dark:text-slate-600" /></div><p className="text-sm font-medium text-slate-500">No matching testimonials</p></div>
            )}
          </div>
        )}

        {tab === "awards" && (
          <div className="space-y-1">
            {visibleAwardsItems.map((a, i) => (
              <div key={a.dbId ?? `static-${a.name}-${a.year}`} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white dark:hover:bg-slate-900/60 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] group transition-all duration-200">
                <Award size={14} className="text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">{a.name}</span>
                <Badge variant="outline" className="text-[11px] text-slate-500 border-slate-200/60 dark:border-slate-700/40">{a.year}</Badge>
                <span className="text-xs text-slate-400">{a.clientOrProject}</span>
                {a.usageCount > 0 && <span className="text-[10px] text-slate-400 shrink-0">{a.usageCount}x</span>}
                <button onClick={() => handleCopy(`${a.name} (${a.year}) — ${a.clientOrProject}`, `a-${i}`, "award", a.dbId)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {copiedId === `a-${i}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
                </button>
                {a.source === "user" && a.dbId && <button onClick={() => handleDelete("award", a.dbId!)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"><Trash2 size={13} className="text-red-400 hover:text-red-600" /></button>}
              </div>
            ))}
            {filteredAwards.length > visibleAwardsCount && (
              <div className="flex justify-center pt-2"><Button variant="outline" size="sm" onClick={() => setVisibleAwardsCount(c => c + PAGE_SIZE_CS)} className="h-9 px-5 rounded-xl">Show more <span className="ml-1.5 text-slate-500 text-sm">({visibleAwardsCount} of {filteredAwards.length})</span></Button></div>
            )}
            {filteredAwards.length === 0 && (
              <div className="text-center py-16"><div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Award size={22} className="text-slate-300 dark:text-slate-600" /></div><p className="text-sm font-medium text-slate-500">No matching awards</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
