/**
 * Testimonial Manager — Browse, approve, and find the perfect client quote.
 *
 * Two tabs:
 *   1. Browse — filter, search, sort, bulk actions, edit, approve/hide
 *   2. AI Finder — describe what you need, get the best matches
 *
 * Color theme: Orange/warm (#F97316 → #EA580C → #C2410C)
 */

import { useState, useEffect, useCallback, useMemo } from "react"
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
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  testimonialsApi,
  type ClientSuccessTestimonialResponse,
  type TestimonialFinderMatch,
} from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

// ─── Types ──────────────────────────────────────────────────

type Tab = "browse" | "finder"
type StatusFilter = "all" | "approved" | "draft" | "hidden"
type SectorFilter = "all" | "higher-ed" | "healthcare" | "other"
type SortOption = "recent" | "most-used" | "org-asc" | "shortest" | "longest"

// ─── Constants ──────────────────────────────────────────────

const STATUS_COLORS = {
  approved: "bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40",
  draft: "bg-amber-50 text-amber-600 border border-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40",
  hidden: "bg-slate-100 text-slate-400 border border-slate-200/60 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700/40 line-through",
}

const SECTOR_LABELS: Record<string, string> = {
  "higher-ed": "Higher Ed",
  healthcare: "Healthcare",
  other: "Other",
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Most Recent" },
  { value: "most-used", label: "Most Used" },
  { value: "org-asc", label: "Org A-Z" },
  { value: "shortest", label: "Shortest" },
  { value: "longest", label: "Longest" },
]

const FINDER_EXAMPLES = [
  "Enrollment growth at a small college",
  "Website redesign ROI",
  "Long-term partnership success",
  "Healthcare marketing results",
  "Brand strategy testimonial",
]

// ─── Component ──────────────────────────────────────────────

export function TestimonialManager() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("browse")

  // Browse state
  const [testimonials, setTestimonials] = useState<ClientSuccessTestimonialResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("recent")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Edit modal state
  const [editingTestimonial, setEditingTestimonial] = useState<ClientSuccessTestimonialResponse | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // AI Finder state
  const [finderQuery, setFinderQuery] = useState("")
  const [finderSector, setFinderSector] = useState<SectorFilter>("all")
  const [finderResults, setFinderResults] = useState<TestimonialFinderMatch[]>([])
  const [finderLoading, setFinderLoading] = useState(false)
  const [finderSearched, setFinderSearched] = useState(false)

  // ─── Data Fetching ──────────────────────────────────────

  const fetchTestimonials = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { sort: sortBy, limit: 200 }
      if (statusFilter !== "all") params.status = statusFilter
      if (sectorFilter !== "all") params.sector = sectorFilter
      if (searchQuery.trim()) params.search = searchQuery.trim()

      const data = await testimonialsApi.list(params as any)
      // Non-admin users never see hidden testimonials
      const filtered = isAdmin ? data.testimonials : data.testimonials.filter(t => t.status !== "hidden")
      setTestimonials(filtered)
      setTotal(isAdmin ? data.total : filtered.length)
    } catch (err) {
      console.error("Failed to fetch testimonials:", err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, sectorFilter, searchQuery, sortBy])

  useEffect(() => {
    fetchTestimonials()
  }, [fetchTestimonials])

  // ─── Actions ────────────────────────────────────────────

  const handleCopy = useCallback(async (t: ClientSuccessTestimonialResponse) => {
    const attribution = [t.name, t.title, t.organization].filter(Boolean).join(", ")
    const text = `"${t.quote}" — ${attribution}`
    await navigator.clipboard.writeText(text)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
    // Increment usage
    try {
      await testimonialsApi.incrementUsage(t.id)
      setTestimonials(prev => prev.map(item =>
        item.id === t.id ? { ...item, usageCount: item.usageCount + 1 } : item
      ))
    } catch {}
  }, [])

  const handleStatusChange = useCallback(async (id: string, status: "approved" | "draft" | "hidden") => {
    try {
      const updated = await testimonialsApi.updateStatus(id, status)
      setTestimonials(prev => prev.map(t => t.id === id ? updated : t))
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }, [])

  const handleToggleFeatured = useCallback(async (id: string) => {
    try {
      const updated = await testimonialsApi.toggleFeatured(id)
      setTestimonials(prev => prev.map(t => t.id === id ? updated : t))
    } catch (err) {
      console.error("Failed to toggle featured:", err)
    }
  }, [])

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = useCallback(async (id: string) => {
    try {
      await testimonialsApi.delete(id)
      setTestimonials(prev => prev.filter(t => t.id !== id))
      setTotal(prev => prev - 1)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (err) {
      console.error("Failed to delete:", err)
    }
  }, [])

  const handleBulkAction = useCallback(async (status: "approved" | "draft" | "hidden") => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const result = await testimonialsApi.bulkUpdateStatus(ids, status)
      setTestimonials(prev => {
        const updatedMap = new Map(result.testimonials.map(t => [t.id, t]))
        return prev.map(t => updatedMap.get(t.id) || t)
      })
      setSelectedIds(new Set())
    } catch (err) {
      console.error("Failed to bulk update:", err)
    }
  }, [selectedIds])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === testimonials.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(testimonials.map(t => t.id)))
    }
  }, [selectedIds.size, testimonials])

  // AI Finder
  const handleFind = useCallback(async () => {
    if (!finderQuery.trim()) return
    setFinderLoading(true)
    setFinderSearched(true)
    try {
      const result = await testimonialsApi.findWithAI(finderQuery.trim(), {
        sector: finderSector !== "all" ? finderSector : undefined,
      })
      setFinderResults(result.matches)
    } catch (err) {
      console.error("AI finder failed:", err)
    } finally {
      setFinderLoading(false)
    }
  }, [finderQuery, finderSector])

  const handleFinderCopy = useCallback(async (match: TestimonialFinderMatch) => {
    const attribution = [match.name, match.title, match.organization].filter(Boolean).join(", ")
    const text = `"${match.quote}" — ${attribution}`
    await navigator.clipboard.writeText(text)
    setCopiedId(match.testimonialId)
    setTimeout(() => setCopiedId(null), 2000)
    try {
      await testimonialsApi.incrementUsage(match.testimonialId)
    } catch {}
  }, [])

  // ─── Stats ──────────────────────────────────────────────

  const stats = useMemo(() => {
    const approved = testimonials.filter(t => t.status === "approved").length
    const draft = testimonials.filter(t => t.status === "draft").length
    const hidden = testimonials.filter(t => t.status === "hidden").length
    return { approved, draft, hidden }
  }, [testimonials])

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

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #F97316 0%, #EA580C 50%, #C2410C 100%)",
                  boxShadow: "0 4px 14px rgba(249, 115, 22, 0.3), 0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <Quote size={22} className="text-white" strokeWidth={2.25} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                  Testimonials
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {total} quotes in your library
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Tab Toggle */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/60 dark:border-slate-700/60">
                <button
                  onClick={() => setActiveTab("browse")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === "browse"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  All Testimonials
                </button>
                <button
                  onClick={() => setActiveTab("finder")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                    activeTab === "finder"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Sparkles size={14} />
                  AI Finder
                </button>
              </div>

              {isAdmin && activeTab === "browse" && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249, 115, 22, 0.25)",
                  }}
                >
                  <Plus size={15} strokeWidth={2.5} />
                  Add New
                </button>
              )}
            </div>
          </div>

          {/* Stats Chips — admin only (regular users don't need workflow filters) */}
          {isAdmin && activeTab === "browse" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === "approved" ? "all" : "approved")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  statusFilter === "approved"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-emerald-200 hover:text-emerald-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:border-emerald-800"
                }`}
              >
                <CheckCircle2 size={12} />
                {stats.approved} approved
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === "draft" ? "all" : "draft")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  statusFilter === "draft"
                    ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-orange-200 hover:text-orange-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:border-orange-800"
                }`}
              >
                <Clock size={12} />
                {stats.draft} draft
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === "hidden" ? "all" : "hidden")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  statusFilter === "hidden"
                    ? "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600"
                    : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <EyeOff size={12} />
                {stats.hidden} hidden
              </button>
              {statusFilter !== "all" && (
                <button
                  onClick={() => setStatusFilter("all")}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-1"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Browse Tab ─────────────────────────────── */}
        {activeTab === "browse" && (
          <>
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {/* Search */}
              <div className="relative flex-1 min-w-[240px] max-w-lg">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search quotes, names, organizations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
                  style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Sector Filter */}
              <div className="relative">
                <select
                  value={sectorFilter}
                  onChange={e => setSectorFilter(e.target.value as SectorFilter)}
                  className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <option value="all">All Sectors</option>
                  <option value="higher-ed">Higher Ed</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                  className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              <button
                onClick={fetchTestimonials}
                className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Bulk Actions Bar */}
            {isAdmin && selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-orange-50/80 dark:bg-orange-900/15 border border-orange-200/60 dark:border-orange-800/40 rounded-xl backdrop-blur-sm">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  {selectedIds.size} selected
                </span>
                <div className="h-4 w-px bg-orange-200 dark:bg-orange-800" />
                <button
                  onClick={() => handleBulkAction("approved")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  Approve All
                </button>
                <button
                  onClick={() => handleBulkAction("hidden")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 transition-colors"
                >
                  Hide All
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Testimonial Grid */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-10 h-10 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-400">Loading testimonials...</p>
              </div>
            ) : testimonials.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/10 flex items-center justify-center mx-auto mb-5">
                  <Quote size={32} className="text-orange-400 dark:text-orange-500" />
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No testimonials found</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Select All */}
                {isAdmin && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 px-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === testimonials.length && testimonials.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500/30"
                    />
                    <span>Select all ({testimonials.length})</span>
                  </div>
                )}

                {testimonials.map(t => (
                  <TestimonialCard
                    key={t.id}
                    testimonial={t}
                    isAdmin={isAdmin}
                    isSelected={selectedIds.has(t.id)}
                    isCopied={copiedId === t.id}
                    onCopy={() => handleCopy(t)}
                    onToggleSelect={() => handleToggleSelect(t.id)}
                    onStatusChange={(status) => handleStatusChange(t.id, status)}
                    onToggleFeatured={() => handleToggleFeatured(t.id)}
                    onEdit={() => setEditingTestimonial(t)}
                    onDelete={() => setConfirmDeleteId(t.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── AI Finder Tab ──────────────────────────── */}
        {activeTab === "finder" && (
          <div className="max-w-3xl mx-auto">
            {/* Finder Input Card */}
            <div
              className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-6 mb-8 bg-white dark:bg-slate-800/80"
              style={{
                boxShadow: '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 16px rgb(0 0 0 / 0.04)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-900/15">
                  <Sparkles size={18} className="text-orange-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    What do you need a testimonial for?
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Describe the context and AI will find the best matches
                  </p>
                </div>
              </div>

              <div className="relative mb-3">
                <textarea
                  value={finderQuery}
                  onChange={e => setFinderQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleFind()
                    }
                  }}
                  placeholder="e.g., I need a quote about enrollment growth from a small liberal arts college..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 resize-none transition-all duration-200"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <select
                    value={finderSector}
                    onChange={e => setFinderSector(e.target.value as SectorFilter)}
                    className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <option value="all">Any Sector</option>
                    <option value="higher-ed">Higher Ed</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                <button
                  onClick={handleFind}
                  disabled={!finderQuery.trim() || finderLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249, 115, 22, 0.2)",
                  }}
                >
                  {finderLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Find Testimonials
                </button>
              </div>

              {/* Example Prompts */}
              {!finderSearched && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Try these examples:</p>
                  <div className="flex flex-wrap gap-2">
                    {FINDER_EXAMPLES.map(ex => (
                      <button
                        key={ex}
                        onClick={() => { setFinderQuery(ex); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 border border-transparent hover:border-orange-200/60 dark:hover:border-orange-800/40 transition-all duration-200"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Finder Results */}
            {finderLoading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-10 h-10 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Searching {total} testimonials...
                </p>
              </div>
            )}

            {finderSearched && !finderLoading && finderResults.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={28} className="text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No matches found</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Try a different description or broaden your search.</p>
              </div>
            )}

            {finderResults.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Found {finderResults.length} relevant testimonials
                </p>
                {finderResults.map((match, idx) => (
                  <div
                    key={match.testimonialId}
                    className="group relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-6 hover:border-orange-200 dark:hover:border-orange-800/50 transition-all duration-300"
                    style={{
                      boxShadow: '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 2px 8px rgb(0 0 0 / 0.02)',
                    }}
                  >
                    {/* Match rank indicator */}
                    <div className="absolute -left-px top-6 w-1 h-8 rounded-r-full bg-gradient-to-b from-orange-400 to-orange-500" />

                    <div className="flex items-start justify-between gap-4 mb-4">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
                        Match #{idx + 1}
                      </span>
                      <button
                        onClick={() => handleFinderCopy(match)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                          copiedId === match.testimonialId
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        }`}
                      >
                        {copiedId === match.testimonialId ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === match.testimonialId ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    <blockquote className="text-[15px] text-slate-700 dark:text-slate-200 italic leading-relaxed mb-4">
                      "{match.quote}"
                    </blockquote>

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
                      <Building2 size={13} className="text-slate-400 dark:text-slate-500" />
                      <span className="font-medium">
                        {[match.name, match.title, match.organization].filter(Boolean).join(", ")}
                      </span>
                      {match.sector && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-medium">
                          {SECTOR_LABELS[match.sector] || match.sector}
                        </span>
                      )}
                    </div>

                    <div className="px-3.5 py-2.5 rounded-xl bg-orange-50/80 dark:bg-orange-900/10 border border-orange-100/60 dark:border-orange-900/20 text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                      <span className="font-semibold">Why this matches:</span>{" "}
                      {match.relevanceReason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
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
    </div>
  )
}

// ─── Testimonial Card ────────────────────────────────────────

function TestimonialCard({
  testimonial: t,
  isAdmin,
  isSelected,
  isCopied,
  onCopy,
  onToggleSelect,
  onStatusChange,
  onToggleFeatured,
  onEdit,
  onDelete,
}: {
  testimonial: ClientSuccessTestimonialResponse
  isAdmin: boolean
  isSelected: boolean
  isCopied: boolean
  onCopy: () => void
  onToggleSelect: () => void
  onStatusChange: (status: "approved" | "draft" | "hidden") => void
  onToggleFeatured: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = t.quote.length > 200

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-300 ${
        isSelected
          ? "border-orange-300 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/10"
          : "border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
      style={{
        boxShadow: isSelected
          ? '0 0 0 1px rgba(249, 115, 22, 0.1), 0 2px 8px rgba(249, 115, 22, 0.06)'
          : '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.02)',
      }}
    >
      {/* Approved indicator — subtle left border accent */}
      {t.status === "approved" && (
        <div className="absolute left-0 top-5 bottom-5 w-0.5 rounded-full bg-emerald-400/60 dark:bg-emerald-500/40" />
      )}

      <div className="flex items-start gap-3 p-5">
        {/* Checkbox */}
        {isAdmin && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="mt-1.5 rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500/30 cursor-pointer"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Quote */}
          <blockquote className="text-[15px] text-slate-700 dark:text-slate-200 italic leading-relaxed mb-3">
            <span className="not-italic text-orange-400/60 dark:text-orange-500/40 text-xl font-serif leading-none mr-0.5">"</span>
            {expanded || !isLong ? t.quote : `${t.quote.slice(0, 200)}...`}
            <span className="not-italic text-orange-400/60 dark:text-orange-500/40 text-xl font-serif leading-none ml-0.5">"</span>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-2 text-orange-500 hover:text-orange-600 dark:hover:text-orange-400 not-italic text-xs font-medium transition-colors"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </blockquote>

          {/* Attribution */}
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-3">
            <span className="font-medium">{[t.name, t.title].filter(Boolean).join(", ")}</span>
            {t.organization && (
              <>
                <span className="text-slate-300 dark:text-slate-600">—</span>
                <span className="text-slate-500 dark:text-slate-400">{t.organization}</span>
              </>
            )}
          </div>

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Status badge — approved visible to all, draft/hidden admin-only */}
            {t.status === "approved" && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_COLORS.approved}`}>
                <CheckCircle2 size={10} />
                Approved
              </span>
            )}
            {t.status !== "approved" && isAdmin && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_COLORS[t.status]}`}>
                {t.status}
              </span>
            )}

            {/* Sector */}
            {t.sector && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-100/60 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/40">
                {SECTOR_LABELS[t.sector] || t.sector}
              </span>
            )}

            {/* Featured */}
            {t.featured && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-yellow-50 text-yellow-600 border border-yellow-100/60 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/40">
                <Star size={10} fill="currentColor" />
                Featured
              </span>
            )}

            {/* Usage Count */}
            {t.usageCount > 0 && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-100/60 dark:bg-slate-700/30 dark:text-slate-400 dark:border-slate-600/40">
                <BarChart3 size={10} />
                Used {t.usageCount}x
              </span>
            )}

            {/* Source */}
            {t.source && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-500 border border-purple-100/60 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/40">
                {t.source}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={onCopy}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isCopied
                ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20"
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            }`}
            title="Copy quote"
          >
            {isCopied ? <Check size={15} /> : <Copy size={15} />}
          </button>

          {isAdmin && (
            <>
              {t.status !== "approved" && (
                <button
                  onClick={() => onStatusChange("approved")}
                  className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-all duration-200"
                  title="Approve"
                >
                  <CheckCircle2 size={15} />
                </button>
              )}
              {t.status === "approved" && (
                <button
                  onClick={() => onStatusChange("draft")}
                  className="p-2 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 transition-all duration-200"
                  title="Move to draft"
                >
                  <Clock size={15} />
                </button>
              )}
              {t.status !== "hidden" && (
                <button
                  onClick={() => onStatusChange("hidden")}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-all duration-200"
                  title="Hide"
                >
                  <EyeOff size={15} />
                </button>
              )}
              <button
                onClick={onToggleFeatured}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  t.featured
                    ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                    : "text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                }`}
                title={t.featured ? "Remove featured" : "Mark as featured"}
              >
                <Star size={15} fill={t.featured ? "currentColor" : "none"} />
              </button>
              <button
                onClick={onEdit}
                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-all duration-200"
                title="Edit"
              >
                <FileEdit size={15} />
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all duration-200"
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add/Edit Modal ──────────────────────────────────────────

function TestimonialFormModal({
  testimonial,
  onClose,
  onSaved,
}: {
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
  const [tags, setTags] = useState((testimonial?.tags || []).join(", "))
  const [saving, setSaving] = useState(false)

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
        source: source.trim() || undefined,
        sector: (sector || undefined) as "higher-ed" | "healthcare" | "other" | undefined,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      }
      let saved: ClientSuccessTestimonialResponse
      if (testimonial) {
        saved = await testimonialsApi.update(testimonial.id, data as any)
      } else {
        saved = await testimonialsApi.create(data)
      }
      onSaved(saved)
    } catch (err) {
      console.error("Failed to save:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-slate-200/60 dark:border-slate-700/60"
        style={{
          boxShadow: '0 0 0 1px rgb(0 0 0 / 0.03), 0 4px 16px rgb(0 0 0 / 0.08), 0 24px 48px rgb(0 0 0 / 0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 dark:border-slate-700/60">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {testimonial ? "Edit Testimonial" : "Add New Testimonial"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Quote <span className="text-red-500">*</span>
            </label>
            <textarea
              value={quote}
              onChange={e => setQuote(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 resize-none transition-all duration-200"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Organization <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sector</label>
              <div className="relative">
                <select
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  className="w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="">None</option>
                  <option value="higher-ed">Higher Ed</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Source</label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="e.g., PR Newswire"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tags <span className="text-xs text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="enrollment, branding, website"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all duration-200"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !quote.trim() || !organization.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(249, 115, 22, 0.2)",
              }}
            >
              {saving ? "Saving..." : testimonial ? "Update" : "Add Testimonial"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
