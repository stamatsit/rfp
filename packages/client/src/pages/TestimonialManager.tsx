/**
 * Testimonials & Awards — Browse client quotes and award history.
 *
 * Top-level tabs: Testimonials | Awards
 * Testimonials sub-tabs: Browse | AI Finder
 * Color theme: Orange/warm (#F97316 → #EA580C → #C2410C)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  Quote,
  Search,
  Star,
  Copy,
  Check,
  CheckCircle2,
  EyeOff,
  FileEdit,
  Trash2,
  Plus,
  Sparkles,
  X,
  RefreshCw,
  BarChart3,
  Clock,
  Building2,
  Send,
  ChevronDown,
  MessageSquare,
  Calendar,
  Tag,
  Trophy,
  Upload,
  ImageOff,
  Filter,
  AlertCircle,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  testimonialsApi,
  awardsApi,
  type ClientSuccessTestimonialResponse,
  type ClientSuccessAwardResponse,
  type TestimonialFinderMatch,
} from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

// ─── Types ──────────────────────────────────────────────────

type PageTab = "testimonials" | "awards"
type Tab = "browse" | "finder"
type StatusFilter = "all" | "approved" | "draft" | "hidden"
type SectorFilter = "all" | "higher-ed" | "healthcare" | "other"
type SortOption = "recent" | "most-used" | "org-asc" | "shortest" | "longest"
type AwardSortOption = "year-desc" | "year-asc" | "name-asc" | "agency-asc" | "most-used"
type AwardSubmissionFilter = "all" | "client-submission" | "stamats-submission" | "other"

// ─── Constants ──────────────────────────────────────────────

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  "client-submission": "Client Submission",
  "stamats-submission": "Stamats Submission",
  "other": "Other",
}

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  "client-submission": "bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800/40",
  "stamats-submission": "bg-violet-50 text-violet-700 border-violet-200/70 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/40",
  "other": "bg-slate-100 text-slate-500 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/40",
}

const STATUS_COLORS = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40",
  draft: "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40",
  hidden: "bg-slate-100 text-slate-400 border-slate-200/60 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700/40",
}

const SECTOR_LABELS: Record<string, string> = {
  "higher-ed": "Higher Ed",
  healthcare: "Healthcare",
  other: "Other",
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Most Recent" },
  { value: "most-used", label: "Most Used" },
  { value: "org-asc", label: "Org A–Z" },
  { value: "shortest", label: "Shortest" },
  { value: "longest", label: "Longest" },
]

const AWARD_SORT_OPTIONS: { value: AwardSortOption; label: string }[] = [
  { value: "year-desc", label: "Newest First" },
  { value: "year-asc", label: "Oldest First" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "agency-asc", label: "Agency A–Z" },
  { value: "most-used", label: "Most Used" },
]

const AWARD_LEVEL_PRESETS = ["Gold", "Silver", "Bronze", "1st Place", "2nd Place", "3rd Place", "Merit", "Excellence", "Honorable Mention"]

const FINDER_EXAMPLES = [
  "Enrollment growth at a small college",
  "Website redesign ROI",
  "Long-term partnership success",
  "Healthcare marketing results",
  "Brand strategy impact",
]

// ─── Shared input/select styles ──────────────────────────────

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
const selectCls = "w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
const filterSelectCls = "appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
const fieldLabelCls = "text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5"

// ─── Component ──────────────────────────────────────────────

export function TestimonialManager() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const [pageTab, setPageTab] = useState<PageTab>("testimonials")
  const [activeTab, setActiveTab] = useState<Tab>("browse")

  // Testimonials browse state
  const [testimonials, setTestimonials] = useState<ClientSuccessTestimonialResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("recent")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeTestimonialId, setActiveTestimonialId] = useState<string | null>(null)
  const activeTestimonial = testimonials.find(t => t.id === activeTestimonialId) ?? null
  const [editingTestimonial, setEditingTestimonial] = useState<ClientSuccessTestimonialResponse | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // AI Finder state
  const [finderQuery, setFinderQuery] = useState("")
  const [finderSector, setFinderSector] = useState<SectorFilter>("all")
  const [finderResults, setFinderResults] = useState<TestimonialFinderMatch[]>([])
  const [finderLoading, setFinderLoading] = useState(false)
  const [finderSearched, setFinderSearched] = useState(false)
  const [finderError, setFinderError] = useState<string | null>(null)

  // Awards state
  const [awards, setAwards] = useState<ClientSuccessAwardResponse[]>([])
  const [awardsLoading, setAwardsLoading] = useState(false)
  const [awardsSearch, setAwardsSearch] = useState("")
  const [awardSort, setAwardSort] = useState<AwardSortOption>("year-desc")
  const [awardSubmissionFilter, setAwardSubmissionFilter] = useState<AwardSubmissionFilter>("all")
  const [activeAwardId, setActiveAwardId] = useState<string | null>(null)
  const activeAward = awards.find(a => a.id === activeAwardId) ?? null
  const [editingAward, setEditingAward] = useState<ClientSuccessAwardResponse | null>(null)
  const [showAddAwardModal, setShowAddAwardModal] = useState(false)
  const [confirmDeleteAwardId, setConfirmDeleteAwardId] = useState<string | null>(null)
  const [awardCopiedId, setAwardCopiedId] = useState<string | null>(null)

  const filteredSortedAwards = useMemo(() => {
    let result = [...awards]
    // Filter by submission status
    if (awardSubmissionFilter !== "all") {
      result = result.filter(a => a.submissionStatus === awardSubmissionFilter)
    }
    // Text search
    if (awardsSearch.trim()) {
      const q = awardsSearch.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.companyName || a.clientOrProject || "").toLowerCase().includes(q) ||
        (a.issuingAgency || "").toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q) ||
        a.year.toLowerCase().includes(q)
      )
    }
    // Sort
    result.sort((a, b) => {
      switch (awardSort) {
        case "year-desc": return (b.year || "").localeCompare(a.year || "")
        case "year-asc": return (a.year || "").localeCompare(b.year || "")
        case "name-asc": return a.name.localeCompare(b.name)
        case "agency-asc": return (a.issuingAgency || "zzz").localeCompare(b.issuingAgency || "zzz")
        case "most-used": return (b.usageCount || 0) - (a.usageCount || 0)
        default: return 0
      }
    })
    return result
  }, [awards, awardsSearch, awardSort, awardSubmissionFilter])

  // Clear active award if it's been filtered out
  useEffect(() => {
    if (activeAwardId && !filteredSortedAwards.find(a => a.id === activeAwardId)) {
      setActiveAwardId(null)
    }
  }, [filteredSortedAwards, activeAwardId])

  // ─── Data Fetching ──────────────────────────────────────

  const fetchTestimonials = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { sort: sortBy, limit: 200 }
      if (statusFilter !== "all") params.status = statusFilter
      if (sectorFilter !== "all") params.sector = sectorFilter
      if (searchQuery.trim()) params.search = searchQuery.trim()
      const data = await testimonialsApi.list(params as any)
      const filtered = isAdmin ? data.testimonials : data.testimonials.filter(t => t.status !== "hidden")
      setTestimonials(filtered)
      setTotal(isAdmin ? data.total : filtered.length)
    } catch (err) {
      console.error("Failed to fetch testimonials:", err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, sectorFilter, searchQuery, sortBy])

  useEffect(() => { fetchTestimonials() }, [fetchTestimonials])

  const fetchAwards = useCallback(async () => {
    setAwardsLoading(true)
    try {
      const data = await awardsApi.list()
      setAwards(data)
    } catch (err) {
      console.error("Failed to fetch awards:", err)
    } finally {
      setAwardsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (pageTab === "awards" && awards.length === 0) fetchAwards()
  }, [pageTab, awards.length, fetchAwards])

  // ─── Actions ────────────────────────────────────────────

  const handleCopy = useCallback(async (t: ClientSuccessTestimonialResponse) => {
    const attribution = [t.name, t.title, t.organization].filter(Boolean).join(", ")
    await navigator.clipboard.writeText(`"${t.quote}" — ${attribution}`)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
    try {
      await testimonialsApi.incrementUsage(t.id)
      setTestimonials(prev => prev.map(item => item.id === t.id ? { ...item, usageCount: item.usageCount + 1 } : item))
    } catch {}
  }, [])

  const handleStatusChange = useCallback(async (id: string, status: "approved" | "draft" | "hidden") => {
    try {
      const updated = await testimonialsApi.updateStatus(id, status)
      setTestimonials(prev => prev.map(t => t.id === id ? updated : t))
    } catch (err) { console.error("Failed to update status:", err) }
  }, [])

  const handleToggleFeatured = useCallback(async (id: string) => {
    try {
      const updated = await testimonialsApi.toggleFeatured(id)
      setTestimonials(prev => prev.map(t => t.id === id ? updated : t))
    } catch (err) { console.error("Failed to toggle featured:", err) }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await testimonialsApi.delete(id)
      setTestimonials(prev => prev.filter(t => t.id !== id))
      setTotal(prev => prev - 1)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
      setActiveTestimonialId(prev => prev === id ? null : prev)
    } catch (err) { console.error("Failed to delete:", err) }
  }, [])

  const handleBulkAction = useCallback(async (status: "approved" | "draft" | "hidden") => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    try {
      const result = await testimonialsApi.bulkUpdateStatus(ids, status)
      setTestimonials(prev => {
        const map = new Map(result.testimonials.map(t => [t.id, t]))
        return prev.map(t => map.get(t.id) || t)
      })
      setSelectedIds(new Set())
    } catch (err) { console.error("Failed to bulk update:", err) }
  }, [selectedIds])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(selectedIds.size === testimonials.length ? new Set() : new Set(testimonials.map(t => t.id)))
  }, [selectedIds.size, testimonials])

  const handleAwardCopy = useCallback(async (a: ClientSuccessAwardResponse) => {
    const parts = [a.name, a.year, a.companyName || a.clientOrProject].filter(Boolean)
    await navigator.clipboard.writeText(parts.join(" — "))
    setAwardCopiedId(a.id)
    setTimeout(() => setAwardCopiedId(null), 2000)
    try { await awardsApi.incrementUsage(a.id) } catch {}
  }, [])

  const handleAwardDelete = useCallback(async (id: string) => {
    try {
      await awardsApi.delete(id)
      setAwards(prev => prev.filter(a => a.id !== id))
      setActiveAwardId(prev => prev === id ? null : prev)
    } catch (err) { console.error("Failed to delete award:", err) }
  }, [])

  // AI Finder
  const handleFind = useCallback(async (queryOverride?: string) => {
    const q = (queryOverride ?? finderQuery).trim()
    if (!q) return
    if (queryOverride) setFinderQuery(queryOverride)
    setFinderLoading(true)
    setFinderSearched(true)
    setFinderError(null)
    try {
      const result = await testimonialsApi.findWithAI(q, {
        sector: finderSector !== "all" ? finderSector : undefined,
      })
      setFinderResults(result.matches)
    } catch (err) {
      console.error("AI finder failed:", err)
      setFinderError("Couldn't reach the AI service. Please try again.")
      setFinderResults([])
    } finally {
      setFinderLoading(false)
    }
  }, [finderQuery, finderSector])

  const handleFinderCopy = useCallback(async (match: TestimonialFinderMatch) => {
    const attribution = [match.name, match.title, match.organization].filter(Boolean).join(", ")
    await navigator.clipboard.writeText(`"${match.quote}" — ${attribution}`)
    setCopiedId(match.testimonialId)
    setTimeout(() => setCopiedId(null), 2000)
    try { await testimonialsApi.incrementUsage(match.testimonialId) } catch {}
  }, [])

  // Stats
  const stats = useMemo(() => ({
    approved: testimonials.filter(t => t.status === "approved").length,
    draft: testimonials.filter(t => t.status === "draft").length,
    hidden: testimonials.filter(t => t.status === "hidden").length,
  }), [testimonials])

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete testimonial"
        description="This testimonial will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId) }}
      />
      <ConfirmDialog
        open={!!confirmDeleteAwardId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteAwardId(null) }}
        title="Delete award"
        description="This award will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteAwardId) handleAwardDelete(confirmDeleteAwardId) }}
      />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">

        {/* ── Page Header ─────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            {/* Left: icon + title */}
            <div className="flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0"
                style={{ background: "linear-gradient(135deg, #F97316 0%, #C2410C 100%)", boxShadow: "0 4px 12px rgba(249,115,22,0.35)" }}
              >
                {pageTab === "awards" ? <Trophy size={20} className="text-white" strokeWidth={2.25} /> : <Quote size={20} className="text-white" strokeWidth={2.25} />}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Testimonials & Awards
                </h1>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {pageTab === "testimonials"
                    ? `${total} quote${total !== 1 ? "s" : ""} in library`
                    : `${filteredSortedAwards.length} of ${awards.length} award${awards.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Right: page tabs + sub-tabs + add button */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Page tab toggle */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/60 dark:border-slate-700/60">
                {([
                  { id: "testimonials" as PageTab, label: "Testimonials", icon: Quote },
                  { id: "awards" as PageTab, label: "Awards", icon: Trophy },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPageTab(id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      pageTab === id
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Testimonials sub-tabs */}
              {pageTab === "testimonials" && (
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/60 dark:border-slate-700/60">
                  <button
                    onClick={() => setActiveTab("browse")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === "browse"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    Browse
                  </button>
                  <button
                    onClick={() => setActiveTab("finder")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === "finder"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <Sparkles size={12} />
                    AI Finder
                  </button>
                </div>
              )}

              {/* Add button */}
              {isAdmin && pageTab === "testimonials" && activeTab === "browse" && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249,115,22,0.25)" }}
                >
                  <Plus size={14} strokeWidth={2.5} /> Add
                </button>
              )}
              {isAdmin && pageTab === "awards" && (
                <button
                  onClick={() => setShowAddAwardModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249,115,22,0.25)" }}
                >
                  <Plus size={14} strokeWidth={2.5} /> Add Award
                </button>
              )}
            </div>
          </div>

          {/* Status stat chips — admin + testimonials browse only */}
          {isAdmin && pageTab === "testimonials" && activeTab === "browse" && (
            <div className="flex items-center gap-1.5">
              {([
                { key: "approved" as StatusFilter, label: `${stats.approved} approved`, activeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-400 dark:border-emerald-800", dotClass: "bg-emerald-400" },
                { key: "draft" as StatusFilter, label: `${stats.draft} draft`, activeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/25 dark:text-amber-400 dark:border-amber-800", dotClass: "bg-amber-400" },
                { key: "hidden" as StatusFilter, label: `${stats.hidden} hidden`, activeClass: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600", dotClass: "bg-slate-400" },
              ]).map(({ key, label, activeClass, dotClass }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                    statusFilter === key
                      ? activeClass
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === key ? dotClass : "bg-slate-300 dark:bg-slate-600"}`} />
                  {label}
                </button>
              ))}
              {statusFilter !== "all" && (
                <button onClick={() => setStatusFilter("all")} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-1 flex items-center gap-0.5">
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Browse Tab ─────────────────────────────── */}
        {pageTab === "testimonials" && activeTab === "browse" && (
          <>
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search quotes, names, organizations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="relative">
                <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value as SectorFilter)} className={filterSelectCls}>
                  <option value="all">All Sectors</option>
                  <option value="higher-ed">Higher Ed</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)} className={filterSelectCls}>
                  {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button onClick={fetchTestimonials} className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors" title="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Bulk Actions Bar */}
            {isAdmin && selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-orange-50/80 dark:bg-orange-900/15 border border-orange-200/60 dark:border-orange-800/40 rounded-xl">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{selectedIds.size} selected</span>
                <div className="h-3.5 w-px bg-orange-200 dark:bg-orange-800" />
                <button onClick={() => handleBulkAction("approved")} className="px-3 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors">Approve All</button>
                <button onClick={() => handleBulkAction("hidden")} className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 transition-colors">Hide All</button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-0.5"><X size={11} /> Clear</button>
              </div>
            )}

            {/* Content */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-9 h-9 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-400">Loading testimonials...</p>
              </div>
            ) : testimonials.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-900/15 flex items-center justify-center mx-auto mb-4">
                  <Quote size={28} className="text-orange-300 dark:text-orange-700" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">No testimonials found</p>
                <p className="text-sm text-slate-400">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              <div className="flex gap-4 items-start">
                {/* Left: list */}
                <div
                  className="w-[340px] shrink-0 flex flex-col overflow-y-auto rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80"
                  style={{ maxHeight: "calc(100vh - 300px)", boxShadow: "0 1px 3px rgb(0 0 0 / 0.04)" }}
                >
                  {isAdmin && (
                    <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-slate-100 dark:border-slate-700/50 shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === testimonials.length && testimonials.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500/30"
                      />
                      <span className="text-xs text-slate-400 dark:text-slate-500">{testimonials.length} testimonials</span>
                    </div>
                  )}
                  {testimonials.map(t => (
                    <TestimonialRow
                      key={t.id}
                      testimonial={t}
                      isAdmin={isAdmin}
                      isActive={activeTestimonialId === t.id}
                      isChecked={selectedIds.has(t.id)}
                      onSelect={() => setActiveTestimonialId(t.id)}
                      onCheck={() => handleToggleSelect(t.id)}
                    />
                  ))}
                </div>

                {/* Right: detail panel */}
                <div className="flex-1 min-w-0">
                  {activeTestimonial ? (
                    <TestimonialDetail
                      testimonial={activeTestimonial}
                      isAdmin={isAdmin}
                      isCopied={copiedId === activeTestimonial.id}
                      onCopy={() => handleCopy(activeTestimonial)}
                      onStatusChange={(status) => handleStatusChange(activeTestimonial.id, status)}
                      onToggleFeatured={() => handleToggleFeatured(activeTestimonial.id)}
                      onEdit={() => setEditingTestimonial(activeTestimonial)}
                      onDelete={() => setConfirmDeleteId(activeTestimonial.id)}
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/20 text-center"
                      style={{ minHeight: 380 }}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                        <Quote size={26} className="text-slate-300 dark:text-slate-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Select a testimonial</p>
                      <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Click any item in the list to view details</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── AI Finder Tab ──────────────────────────── */}
        {pageTab === "testimonials" && activeTab === "finder" && (
          <div className="max-w-2xl mx-auto">
            {/* Input card */}
            <div
              className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-5 mb-6"
              style={{ boxShadow: "0 1px 3px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)" }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)" }}>
                  <Sparkles size={15} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What do you need a testimonial for?</h2>
                  <p className="text-xs text-slate-400">Describe the context — AI finds the best matches</p>
                </div>
              </div>

              <textarea
                value={finderQuery}
                onChange={e => setFinderQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFind() } }}
                placeholder="e.g., enrollment growth at a small liberal arts college..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 resize-none transition-all mb-3"
              />

              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <select value={finderSector} onChange={e => setFinderSector(e.target.value as SectorFilter)} className={filterSelectCls}>
                    <option value="all">Any Sector</option>
                    <option value="higher-ed">Higher Ed</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button
                  onClick={() => handleFind()}
                  disabled={!finderQuery.trim() || finderLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249,115,22,0.2)" }}
                >
                  {finderLoading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                  Find
                </button>
              </div>

              {/* Example prompts */}
              {!finderSearched && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-2">Try these:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FINDER_EXAMPLES.map(ex => (
                      <button
                        key={ex}
                        onClick={() => handleFind(ex)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 border border-transparent hover:border-orange-200/60 dark:hover:border-orange-800/40 transition-all"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* States */}
            {finderLoading && (
              <div className="flex flex-col items-center justify-center py-14">
                <div className="w-9 h-9 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500">Searching {total} testimonials...</p>
              </div>
            )}

            {finderError && !finderLoading && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 mb-4">
                <AlertCircle size={16} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{finderError}</p>
              </div>
            )}

            {finderSearched && !finderLoading && !finderError && finderResults.length === 0 && (
              <div className="text-center py-14">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} className="text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">No matches found</p>
                <p className="text-sm text-slate-400">Try rephrasing or broadening your description.</p>
              </div>
            )}

            {finderResults.length > 0 && !finderLoading && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{finderResults.length} matches</p>
                {finderResults.map((match, idx) => (
                  <div
                    key={match.testimonialId}
                    className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-5 hover:border-orange-200 dark:hover:border-orange-800/50 transition-all"
                    style={{ boxShadow: "0 1px 3px rgb(0 0 0 / 0.04)" }}
                  >
                    <div className="absolute left-0 top-5 bottom-5 w-0.5 rounded-r-full bg-gradient-to-b from-orange-400 to-orange-500" />
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <span className="text-[11px] font-semibold text-orange-500 dark:text-orange-400 uppercase tracking-wide">#{idx + 1}</span>
                      <button
                        onClick={() => handleFinderCopy(match)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          copiedId === match.testimonialId
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        }`}
                      >
                        {copiedId === match.testimonialId ? <Check size={11} /> : <Copy size={11} />}
                        {copiedId === match.testimonialId ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <blockquote className="text-sm text-slate-700 dark:text-slate-200 italic leading-relaxed mb-3">
                      "{match.quote}"
                    </blockquote>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                      <Building2 size={12} className="text-slate-400 shrink-0" />
                      <span className="font-medium">{[match.name, match.title, match.organization].filter(Boolean).join(", ")}</span>
                      {match.sector && (
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-[10px] font-medium">
                          {SECTOR_LABELS[match.sector] || match.sector}
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-orange-50/80 dark:bg-orange-900/10 border border-orange-100/60 dark:border-orange-900/20 text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                      <span className="font-semibold">Why this matches:</span> {match.relevanceReason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Awards Tab ─────────────────────────────── */}
        {pageTab === "awards" && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, company, agency, category..."
                  value={awardsSearch}
                  onChange={e => setAwardsSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                />
                {awardsSearch && (
                  <button onClick={() => setAwardsSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <X size={13} />
                  </button>
                )}
              </div>
              {/* Submission status filter */}
              <div className="relative">
                <select value={awardSubmissionFilter} onChange={e => setAwardSubmissionFilter(e.target.value as AwardSubmissionFilter)} className={filterSelectCls}>
                  <option value="all">All Submissions</option>
                  <option value="client-submission">Client Submission</option>
                  <option value="stamats-submission">Stamats Submission</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {/* Sort */}
              <div className="relative">
                <select value={awardSort} onChange={e => setAwardSort(e.target.value as AwardSortOption)} className={filterSelectCls}>
                  {AWARD_SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button onClick={fetchAwards} className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors" title="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Active filters summary */}
            {(awardSubmissionFilter !== "all" || awardsSearch) && (
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                <Filter size={11} className="text-slate-400" />
                {awardsSearch && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">"{awardsSearch}"</span>}
                {awardSubmissionFilter !== "all" && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">{SUBMISSION_STATUS_LABELS[awardSubmissionFilter]}</span>}
                <button onClick={() => { setAwardsSearch(""); setAwardSubmissionFilter("all") }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center gap-0.5 ml-1">
                  <X size={11} /> Clear
                </button>
              </div>
            )}

            {/* Content */}
            {awardsLoading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-9 h-9 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-400">Loading awards...</p>
              </div>
            ) : filteredSortedAwards.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-900/15 flex items-center justify-center mx-auto mb-4">
                  <Trophy size={28} className="text-orange-300 dark:text-orange-700" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {awardsSearch || awardSubmissionFilter !== "all" ? "No awards match your filters" : "No awards yet"}
                </p>
                <p className="text-sm text-slate-400">
                  {awardsSearch || awardSubmissionFilter !== "all"
                    ? "Try adjusting your search or filter."
                    : isAdmin ? `Click "Add Award" to add your first award.` : "No awards have been added yet."}
                </p>
              </div>
            ) : (
              <div className="flex gap-4 items-start">
                {/* Left: award list */}
                <div
                  className="w-[340px] shrink-0 flex flex-col overflow-y-auto rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80"
                  style={{ maxHeight: "calc(100vh - 300px)", boxShadow: "0 1px 3px rgb(0 0 0 / 0.04)" }}
                >
                  <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-700/50 shrink-0 flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">{filteredSortedAwards.length} award{filteredSortedAwards.length !== 1 ? "s" : ""}</span>
                    {filteredSortedAwards.length !== awards.length && (
                      <span className="text-[10px] text-orange-500 dark:text-orange-400 font-medium">filtered</span>
                    )}
                  </div>
                  {filteredSortedAwards.map(a => (
                    <AwardRow
                      key={a.id}
                      award={a}
                      isActive={activeAwardId === a.id}
                      onSelect={() => setActiveAwardId(a.id)}
                    />
                  ))}
                </div>

                {/* Right: award detail */}
                <div className="flex-1 min-w-0">
                  {activeAward ? (
                    <AwardDetail
                      award={activeAward}
                      isAdmin={isAdmin}
                      isCopied={awardCopiedId === activeAward.id}
                      onCopy={() => handleAwardCopy(activeAward)}
                      onEdit={() => setEditingAward(activeAward)}
                      onDelete={() => setConfirmDeleteAwardId(activeAward.id)}
                      onBadgeUploaded={(updated) => setAwards(prev => prev.map(a => a.id === updated.id ? updated : a))}
                      onBadgeDeleted={(updated) => setAwards(prev => prev.map(a => a.id === updated.id ? updated : a))}
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/20 text-center"
                      style={{ minHeight: 380 }}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                        <Trophy size={26} className="text-slate-300 dark:text-slate-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Select an award</p>
                      <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Click any item in the list to view details</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {(showAddModal || editingTestimonial) && (
        <TestimonialFormModal
          testimonial={editingTestimonial}
          onClose={() => { setShowAddModal(false); setEditingTestimonial(null) }}
          onSaved={(saved) => {
            if (editingTestimonial) {
              setTestimonials(prev => prev.map(t => t.id === saved.id ? saved : t))
            } else {
              setTestimonials(prev => [saved, ...prev])
              setTotal(prev => prev + 1)
            }
            setShowAddModal(false)
            setEditingTestimonial(null)
          }}
        />
      )}
      {(showAddAwardModal || editingAward) && (
        <AwardFormModal
          award={editingAward}
          onClose={() => { setShowAddAwardModal(false); setEditingAward(null) }}
          onSaved={(saved) => {
            if (editingAward) {
              setAwards(prev => prev.map(a => a.id === saved.id ? saved : a))
            } else {
              setAwards(prev => [saved, ...prev])
            }
            setShowAddAwardModal(false)
            setEditingAward(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

function formatTestimonialDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

// ─── Testimonial Row ─────────────────────────────────────────

function TestimonialRow({
  testimonial: t, isAdmin, isActive, isChecked, onSelect, onCheck,
}: {
  testimonial: ClientSuccessTestimonialResponse
  isAdmin: boolean; isActive: boolean; isChecked: boolean
  onSelect: () => void; onCheck: () => void
}) {
  const statusDot = t.status === "approved" ? "bg-emerald-400" : t.status === "draft" ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600"
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors duration-150 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 ${
        isActive ? "bg-orange-50/80 dark:bg-orange-900/15" : "hover:bg-slate-50/80 dark:hover:bg-slate-700/25"
      }`}
    >
      <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${statusDot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate leading-snug ${isActive ? "text-orange-700 dark:text-orange-300" : "text-slate-700 dark:text-slate-200"}`}>
          {t.organization}
        </p>
        {t.name && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{t.name}{t.title ? `, ${t.title}` : ""}</p>}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug line-clamp-2 italic mt-1">"{t.quote}"</p>
      </div>
      {isAdmin && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => { e.stopPropagation(); onCheck() }}
          onClick={e => e.stopPropagation()}
          className="mt-1 rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500/30 cursor-pointer shrink-0"
        />
      )}
    </button>
  )
}

// ─── Testimonial Detail ───────────────────────────────────────

function TestimonialDetail({
  testimonial: t, isAdmin, isCopied, onCopy, onStatusChange, onToggleFeatured, onEdit, onDelete,
}: {
  testimonial: ClientSuccessTestimonialResponse
  isAdmin: boolean; isCopied: boolean
  onCopy: () => void
  onStatusChange: (status: "approved" | "draft" | "hidden") => void
  onToggleFeatured: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const formattedDate = formatTestimonialDate(t.testimonialDate)

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgb(0 0 0 / 0.04), 0 4px 20px rgb(0 0 0 / 0.04)" }}>
      {/* Accent bar */}
      <div className={`h-1 w-full ${t.status === "approved" ? "bg-gradient-to-r from-orange-400 to-orange-500" : t.status === "draft" ? "bg-gradient-to-r from-amber-300 to-amber-400" : "bg-slate-200 dark:bg-slate-700"}`} />

      <div className="p-5">
        {/* Header: badges + actions */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {t.status === "approved" && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS.approved}`}>
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Approved
              </span>
            )}
            {t.status !== "approved" && isAdmin && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[t.status]}`}>
                <span className={`w-1 h-1 rounded-full ${t.status === "draft" ? "bg-amber-400" : "bg-slate-400"}`} />
                {t.status}
              </span>
            )}
            {t.sector && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100/60 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/40">
                {SECTOR_LABELS[t.sector] || t.sector}
              </span>
            )}
            {t.featured && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-600 border border-yellow-100/60 dark:bg-yellow-900/20 dark:text-yellow-400">
                <Star size={9} fill="currentColor" /> Featured
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                isCopied ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {isCopied ? <Check size={12} /> : <Copy size={12} />}
              {isCopied ? "Copied!" : "Copy"}
            </button>
            {isAdmin && (
              <>
                {t.status !== "approved" && <button onClick={() => onStatusChange("approved")} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-all" title="Approve"><CheckCircle2 size={14} /></button>}
                {t.status === "approved" && <button onClick={() => onStatusChange("draft")} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 transition-all" title="Move to draft"><Clock size={14} /></button>}
                {t.status !== "hidden" && <button onClick={() => onStatusChange("hidden")} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-all" title="Hide"><EyeOff size={14} /></button>}
                <button onClick={onToggleFeatured} className={`p-1.5 rounded-lg transition-all ${t.featured ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"}`} title={t.featured ? "Unfeature" : "Feature"}>
                  <Star size={14} fill={t.featured ? "currentColor" : "none"} />
                </button>
                <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-all" title="Edit"><FileEdit size={14} /></button>
                <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all" title="Delete"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        </div>

        {/* Quote */}
        <blockquote className="relative text-[17px] text-slate-800 dark:text-slate-100 italic leading-relaxed mb-5 font-light pl-5">
          <span className="absolute left-0 top-0 text-3xl font-serif text-orange-300 dark:text-orange-600 leading-none not-italic">"</span>
          {t.quote}
          <span className="text-3xl font-serif text-orange-300 dark:text-orange-600 leading-none not-italic ml-0.5">"</span>
        </blockquote>

        {/* Attribution + meta grid */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700/40">
          <div>
            <p className={fieldLabelCls}>School / Institution</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
              <Building2 size={11} className="text-slate-400 shrink-0" />{t.organization}
            </p>
          </div>
          <div>
            <p className={fieldLabelCls}>Name</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{t.name || <span className="text-slate-300 dark:text-slate-600 italic">—</span>}</p>
          </div>
          <div>
            <p className={fieldLabelCls}>Title</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{t.title || <span className="text-slate-300 dark:text-slate-600 italic">—</span>}</p>
          </div>
          <div>
            <p className={fieldLabelCls}>Date</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
              {formattedDate ? <><Calendar size={11} className="text-slate-400 shrink-0" />{formattedDate}</> : <span className="text-slate-300 dark:text-slate-600 italic">—</span>}
            </p>
          </div>
        </div>

        {/* Tags */}
        {t.tags && t.tags.length > 0 && (
          <div className="mb-4">
            <p className={fieldLabelCls}>Tags</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {t.tags.map(tag => (
                <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                  <Tag size={9} className="text-slate-400" />{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {t.notes && (
          <div className="mb-4">
            <p className={fieldLabelCls}>Notes</p>
            <div className="flex gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/40 mt-1">
              <MessageSquare size={11} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{t.notes}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        {(t.usageCount > 0 || t.source) && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/40">
            {t.usageCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                <BarChart3 size={11} />Used {t.usageCount}x
              </span>
            )}
            {t.source && <span className="text-[10px] text-slate-400 dark:text-slate-500 italic ml-auto">{t.source}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Award Row ────────────────────────────────────────────────

function AwardRow({ award: a, isActive, onSelect }: {
  award: ClientSuccessAwardResponse; isActive: boolean; onSelect: () => void
}) {
  const company = a.companyName || a.clientOrProject
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors duration-150 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 ${
        isActive ? "bg-orange-50/80 dark:bg-orange-900/15" : "hover:bg-slate-50/80 dark:hover:bg-slate-700/25"
      }`}
    >
      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${isActive ? "bg-orange-100 dark:bg-orange-900/30" : "bg-slate-100 dark:bg-slate-700/60"}`}>
        <Trophy size={12} className={isActive ? "text-orange-500" : "text-slate-400 dark:text-slate-500"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5 mb-0.5">
          <p className={`text-[13px] font-semibold leading-snug truncate flex-1 ${isActive ? "text-orange-700 dark:text-orange-300" : "text-slate-700 dark:text-slate-200"}`}>
            {a.name}
          </p>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">{a.year}</span>
        </div>
        {company && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{company}</p>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {a.issuingAgency && <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[110px]">{a.issuingAgency}</span>}
          {a.submissionStatus && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${SUBMISSION_STATUS_COLORS[a.submissionStatus]}`}>
              {a.submissionStatus === "client-submission" ? "Client" : a.submissionStatus === "stamats-submission" ? "Stamats" : "Other"}
            </span>
          )}
          {a.awardLevel && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 border border-yellow-200/60 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/40">
              {a.awardLevel}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Award Detail ─────────────────────────────────────────────

function AwardDetail({
  award: a, isAdmin, isCopied, onCopy, onEdit, onDelete, onBadgeUploaded, onBadgeDeleted,
}: {
  award: ClientSuccessAwardResponse; isAdmin: boolean; isCopied: boolean
  onCopy: () => void; onEdit: () => void; onDelete: () => void
  onBadgeUploaded: (updated: ClientSuccessAwardResponse) => void
  onBadgeDeleted: (updated: ClientSuccessAwardResponse) => void
}) {
  const badgeRef = useRef<HTMLInputElement>(null)
  const [uploadingBadge, setUploadingBadge] = useState(false)

  const handleBadgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBadge(true)
    try {
      const updated = await awardsApi.uploadBadge(a.id, file)
      onBadgeUploaded(updated)
    } catch (err) { console.error("Badge upload failed:", err) } finally {
      setUploadingBadge(false)
      if (badgeRef.current) badgeRef.current.value = ""
    }
  }

  const handleBadgeDelete = async () => {
    try {
      const updated = await awardsApi.deleteBadge(a.id)
      onBadgeDeleted(updated)
    } catch (err) { console.error("Badge delete failed:", err) }
  }

  const badgeUrl = a.badgeStorageKey ? awardsApi.getBadgeUrl(a.badgeStorageKey) : null

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgb(0 0 0 / 0.04), 0 4px 20px rgb(0 0 0 / 0.04)" }}>
      <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-orange-500" />

      <div className="p-5">
        {/* Top: badge image + name + actions */}
        <div className="flex items-start gap-4 mb-5">
          {/* Badge image */}
          <div className="shrink-0">
            {badgeUrl ? (
              <div className="relative w-[72px] h-[72px]">
                <img src={badgeUrl} alt="Award badge" className="w-full h-full object-contain rounded-xl border border-slate-200/60 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-900/40" />
                {isAdmin && (
                  <button onClick={handleBadgeDelete} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-sm transition-colors" title="Remove badge">
                    <X size={9} />
                  </button>
                )}
              </div>
            ) : isAdmin ? (
              <button onClick={() => badgeRef.current?.click()} disabled={uploadingBadge}
                className="w-[72px] h-[72px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-slate-400 hover:border-orange-300 hover:text-orange-500 dark:hover:border-orange-700 dark:hover:text-orange-400 transition-colors disabled:opacity-50"
                title="Upload badge"
              >
                {uploadingBadge ? <RefreshCw size={15} className="animate-spin" /> : <><Upload size={15} className="mb-1" /><span className="text-[9px] font-medium">Badge</span></>}
              </button>
            ) : (
              <div className="w-[72px] h-[72px] flex items-center justify-center rounded-xl border border-slate-100 dark:border-slate-700/50 text-slate-200 dark:text-slate-700">
                <ImageOff size={18} />
              </div>
            )}
            <input ref={badgeRef} type="file" accept="image/*" className="hidden" onChange={handleBadgeUpload} />
          </div>

          {/* Name, year, badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{a.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{a.year}</p>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={onCopy} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isCopied ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                }`}>
                  {isCopied ? <Check size={11} /> : <Copy size={11} />}
                  {isCopied ? "Copied!" : "Copy"}
                </button>
                {isAdmin && (
                  <>
                    <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-all" title="Edit"><FileEdit size={14} /></button>
                    <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all" title="Delete"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {a.submissionStatus && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SUBMISSION_STATUS_COLORS[a.submissionStatus]}`}>
                  {SUBMISSION_STATUS_LABELS[a.submissionStatus]}
                </span>
              )}
              {a.awardLevel && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-600 border border-yellow-200/60 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/40">
                  {a.awardLevel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fields grid */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700/40">
          <div>
            <p className={fieldLabelCls}>Company / Client</p>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">
              <Building2 size={10} className="text-slate-400 shrink-0" />
              {a.companyName || a.clientOrProject || <span className="text-slate-300 dark:text-slate-600 italic font-normal">—</span>}
            </p>
          </div>
          <div>
            <p className={fieldLabelCls}>Issuing Agency</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{a.issuingAgency || <span className="text-slate-300 dark:text-slate-600 italic">—</span>}</p>
          </div>
          <div>
            <p className={fieldLabelCls}>Category</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{a.category || <span className="text-slate-300 dark:text-slate-600 italic">—</span>}</p>
          </div>
          <div>
            <p className={fieldLabelCls}>Submission</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {a.submissionStatus ? SUBMISSION_STATUS_LABELS[a.submissionStatus] : <span className="text-slate-300 dark:text-slate-600 italic">—</span>}
            </p>
          </div>
        </div>

        {/* Notes */}
        {a.notes && (
          <div className="mb-4">
            <p className={fieldLabelCls}>Notes</p>
            <div className="flex gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/40 mt-1">
              <MessageSquare size={11} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{a.notes}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        {a.usageCount > 0 && (
          <div className="flex items-center pt-3 border-t border-slate-100 dark:border-slate-700/40">
            <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              <BarChart3 size={11} />Used {a.usageCount}x
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Award Form Modal ─────────────────────────────────────────

function AwardFormModal({ award, onClose, onSaved }: {
  award: ClientSuccessAwardResponse | null
  onClose: () => void
  onSaved: (a: ClientSuccessAwardResponse) => void
}) {
  const [name, setName] = useState(award?.name || "")
  const [year, setYear] = useState(award?.year || "")
  const [companyName, setCompanyName] = useState(award?.companyName || award?.clientOrProject || "")
  const [issuingAgency, setIssuingAgency] = useState(award?.issuingAgency || "")
  const [category, setCategory] = useState(award?.category || "")
  const [awardLevel, setAwardLevel] = useState(award?.awardLevel || "")
  const [awardLevelCustom, setAwardLevelCustom] = useState(
    award?.awardLevel && !AWARD_LEVEL_PRESETS.includes(award.awardLevel) ? award.awardLevel : ""
  )
  const [useCustomLevel, setUseCustomLevel] = useState(
    !!award?.awardLevel && !AWARD_LEVEL_PRESETS.includes(award.awardLevel)
  )
  const [submissionStatus, setSubmissionStatus] = useState(award?.submissionStatus || "")
  const [notes, setNotes] = useState(award?.notes || "")
  const [saving, setSaving] = useState(false)
  const [yearError, setYearError] = useState("")

  const effectiveLevel = useCustomLevel ? awardLevelCustom : awardLevel

  const handleYearChange = (v: string) => {
    setYear(v)
    if (v && !/^\d{4}$/.test(v.trim())) setYearError("Enter a 4-digit year")
    else setYearError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !year.trim() || yearError) return
    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        year: year.trim(),
        companyName: companyName.trim() || undefined,
        issuingAgency: issuingAgency.trim() || undefined,
        category: category.trim() || undefined,
        awardLevel: effectiveLevel.trim() || undefined,
        submissionStatus: (submissionStatus || undefined) as "client-submission" | "stamats-submission" | "other" | undefined,
        notes: notes.trim() || undefined,
      }
      const saved = award ? await awardsApi.update(award.id, data) : await awardsApi.create(data)
      onSaved(saved)
    } catch (err) { console.error("Failed to save award:", err) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-slate-200/60 dark:border-slate-700/60"
        style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.03), 0 8px 32px rgb(0 0 0 / 0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)" }}>
              <Trophy size={15} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{award ? "Edit Award" : "Add Award"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Award Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Best Higher Education Website" className={inputCls} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Year <span className="text-red-500">*</span></label>
              <input type="text" value={year} onChange={e => handleYearChange(e.target.value)} placeholder="2024" maxLength={4} className={`${inputCls} ${yearError ? "border-red-400 focus:border-red-400 focus:ring-red-500/20" : ""}`} required />
              {yearError && <p className="text-xs text-red-500 mt-1">{yearError}</p>}
            </div>
            <div>
              <label className={labelCls}>Award Level</label>
              {!useCustomLevel ? (
                <div className="relative">
                  <select
                    value={awardLevel}
                    onChange={e => {
                      if (e.target.value === "__custom__") { setUseCustomLevel(true); setAwardLevel("") }
                      else setAwardLevel(e.target.value)
                    }}
                    className={selectCls}
                  >
                    <option value="">None</option>
                    {AWARD_LEVEL_PRESETS.map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input type="text" value={awardLevelCustom} onChange={e => setAwardLevelCustom(e.target.value)} placeholder="e.g., Platinum" className={inputCls} autoFocus />
                  <button type="button" onClick={() => { setUseCustomLevel(false); setAwardLevelCustom("") }} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"><X size={13} /></button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Company / Client</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g., University of Vermont" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Issuing Agency</label>
              <input type="text" value={issuingAgency} onChange={e => setIssuingAgency(e.target.value)} placeholder="e.g., CASE, UCDA" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g., Website Design" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Submission Status</label>
            <div className="relative">
              <select value={submissionStatus} onChange={e => setSubmissionStatus(e.target.value)} className={selectCls}>
                <option value="">None</option>
                <option value="client-submission">Client Submission</option>
                <option value="stamats-submission">Stamats Submission</option>
                <option value="other">Other</option>
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-xs text-slate-400 font-normal">(visible to all team members)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal context, submission history..." className={`${inputCls} resize-none`} />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !year.trim() || !!yearError}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249,115,22,0.2)" }}
            >
              {saving ? "Saving..." : award ? "Update Award" : "Add Award"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Testimonial Form Modal ────────────────────────────────────

function TestimonialFormModal({ testimonial, onClose, onSaved }: {
  testimonial: ClientSuccessTestimonialResponse | null
  onClose: () => void
  onSaved: (t: ClientSuccessTestimonialResponse) => void
}) {
  const [quote, setQuote] = useState(testimonial?.quote || "")
  const [name, setName] = useState(testimonial?.name || "")
  const [title, setTitle] = useState(testimonial?.title || "")
  const [organization, setOrganization] = useState(testimonial?.organization || "")
  const [source, setSource] = useState(testimonial?.source || "")
  const [sector, setSector] = useState(testimonial?.sector || "")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(testimonial?.tags || [])
  const [notes, setNotes] = useState(testimonial?.notes || "")
  const [testimonialDate, setTestimonialDate] = useState(testimonial?.testimonialDate || "")
  const [saving, setSaving] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const addTag = (v: string) => {
    const trimmed = v.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) setTags(prev => [...prev, trimmed])
    setTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) setTags(prev => prev.slice(0, -1))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quote.trim() || !organization.trim()) return
    setSaving(true)
    try {
      const data = {
        quote: quote.trim(),
        name: name.trim() || undefined,
        title: title.trim() || undefined,
        organization: organization.trim(),
        notes: notes.trim() || undefined,
        testimonialDate: testimonialDate || null,
        source: source.trim() || undefined,
        sector: (sector || undefined) as "higher-ed" | "healthcare" | "other" | undefined,
        tags,
      }
      const saved = testimonial ? await testimonialsApi.update(testimonial.id, data as any) : await testimonialsApi.create(data)
      onSaved(saved)
    } catch (err) { console.error("Failed to save:", err) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-slate-200/60 dark:border-slate-700/60"
        style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.03), 0 8px 32px rgb(0 0 0 / 0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)" }}>
              <Quote size={15} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {testimonial ? "Edit Testimonial" : "Add Testimonial"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quote */}
          <div>
            <label className={labelCls}>Quote <span className="text-red-500">*</span></label>
            <textarea value={quote} onChange={e => setQuote(e.target.value)} rows={4} className={`${inputCls} resize-none`} placeholder="The quote text..." required />
          </div>

          {/* Attribution */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 space-y-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Attribution</p>
            <div>
              <label className={labelCls}>Organization <span className="text-red-500">*</span></label>
              <input type="text" value={organization} onChange={e => setOrganization(e.target.value)} className={inputCls} placeholder="e.g., University of Vermont" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="First Last" />
              </div>
              <div>
                <label className={labelCls}>Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="VP of Marketing" />
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Sector</label>
              <div className="relative">
                <select value={sector} onChange={e => setSector(e.target.value)} className={selectCls}>
                  <option value="">None</option>
                  <option value="higher-ed">Higher Ed</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Date <span className="text-xs text-slate-400 font-normal">(optional)</span></label>
              <input type="date" value={testimonialDate} onChange={e => setTestimonialDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Source <span className="text-xs text-slate-400 font-normal">(publication, event, etc.)</span></label>
            <input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g., PR Newswire, CASE Conference" className={inputCls} />
          </div>

          {/* Tag pills input */}
          <div>
            <label className={labelCls}>Tags</label>
            <div
              className="flex flex-wrap gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-text min-h-[44px] focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-400 transition-all"
              onClick={() => tagInputRef.current?.focus()}
            >
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-200/60 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/40">
                  {tag}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setTags(prev => prev.filter(t => t !== tag)) }} className="text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 transition-colors">
                    <X size={9} />
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                placeholder={tags.length === 0 ? "enrollment, branding... (Enter or comma to add)" : ""}
                className="flex-1 min-w-[120px] text-sm bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-xs text-slate-400 font-normal">(internal)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes visible to all team members..." className={`${inputCls} resize-none`} />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !quote.trim() || !organization.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249,115,22,0.2)" }}
            >
              {saving ? "Saving..." : testimonial ? "Update" : "Add Testimonial"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
