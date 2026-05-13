/**
 * ClientRoster — Left panel: searchable, sortable, groupable client list.
 * Upgrades: sort toggle, tier group headers, activity dots, keyboard nav, sector counts.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import {
  Search,
  Pencil,
  Trash2,
  ArrowUpDown,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react"
import { useClientData, useClientSelection, type ClientWithCounts, type SectorFilter } from "./ClientPortfolioContext"
import { clientsApi, type ClientStatus, type ClientResponse } from "@/lib/api"
import { DoNotContactDialog } from "./DoNotContactDialog"

type StatusFilter = "active" | "inactive" | "dnc"

const STATUS_LABEL: Record<StatusFilter, string> = {
  active: "Active",
  inactive: "Inactive",
  dnc: "DNC",
}

// "Inactive" rolls up the three non-active lifecycle states.
const INACTIVE_STATUSES = new Set(["prospect", "former", "archived"])

const STATUS_PILL: Record<NonNullable<ClientStatus>, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/60",
  prospect: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/60",
  former: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-slate-300/60",
  archived: "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-300 border-slate-400/60",
}

// ─── Constants ────────────────────────────────────────────────────

const TIER_RING: Record<string, string> = {
  champion: "border-emerald-400 dark:border-emerald-600",
  active: "border-sky-400 dark:border-sky-600",
  dormant: "border-amber-400 dark:border-amber-600",
  new: "border-slate-300 dark:border-slate-600",
}

const TIER_COLORS: Record<string, string> = {
  champion: "text-emerald-600 dark:text-emerald-400",
  active: "text-sky-600 dark:text-sky-400",
  dormant: "text-amber-600 dark:text-amber-400",
  new: "text-slate-400 dark:text-slate-500",
}

const SECTOR_LABELS: Record<string, string> = {
  "higher-ed": "Higher Ed",
  healthcare: "Healthcare",
  other: "Other",
}

const SECTOR_COLORS: Record<string, string> = {
  "higher-ed": "bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800/40",
  healthcare: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40",
  other: "bg-slate-100 text-slate-500 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/40",
}

const TIER_ORDER: Record<string, number> = { champion: 0, active: 1, dormant: 2, new: 3 }
const TIER_LABELS: Record<string, string> = { champion: "Champion", active: "Active", dormant: "Dormant", new: "New" }
const TIER_DOT_COLORS: Record<string, string> = {
  champion: "bg-emerald-400",
  active: "bg-sky-400",
  dormant: "bg-amber-400",
  new: "bg-slate-300 dark:bg-slate-600",
}

type SortMode = "alpha" | "health" | "assets"

export function ClientRoster() {
  const { globalLoading, clientsWithCounts, isAdmin, setDbClients, dncEntries, setDncEntries, dbClients } = useClientData()
  const { selectedClient, setSelectedClient } = useClientSelection()

  const [searchQuery, setSearchQuery] = useState("")
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [sortMode, setSortMode] = useState<SortMode>("alpha")
  const [groupByTier, setGroupByTier] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [moveToDncTarget, setMoveToDncTarget] = useState<ClientResponse | null>(null)
  const [movePickDomainOpen, setMovePickDomainOpen] = useState<{ client: ClientResponse; domains: string[] } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  // Quick lookups
  const dncDomains = useMemo(() => new Set(dncEntries.map(e => e.domain)), [dncEntries])
  const dncByClientId = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of dncEntries) {
      if (e.clientId) m.set(e.clientId, (m.get(e.clientId) ?? 0) + 1)
    }
    return m
  }, [dncEntries])

  // ── Sector counts for filter pills
  const sectorCounts = useMemo(() => {
    const counts = { all: clientsWithCounts.length, "higher-ed": 0, healthcare: 0, other: 0 }
    for (const c of clientsWithCounts) {
      counts[c.sector as keyof typeof counts] = (counts[c.sector as keyof typeof counts] || 0) + 1
    }
    return counts
  }, [clientsWithCounts])

  // ── Status counts for segmented control
  const statusCounts = useMemo(() => {
    const counts = { active: 0, inactive: 0, dnc: 0 }
    for (const c of clientsWithCounts) {
      const s = c.status ?? "active"
      if (s === "active") counts.active++
      else if (INACTIVE_STATUSES.has(s)) counts.inactive++
      const matchesDnc =
        (c.dbId && dncByClientId.has(c.dbId)) ||
        (c.emailDomains?.some(d => dncDomains.has(d)) ?? false)
      if (matchesDnc) counts.dnc++
    }
    return counts
  }, [clientsWithCounts, dncDomains, dncByClientId])

  // ── Filtered + sorted client list
  const filteredClients = useMemo(() => {
    let list = clientsWithCounts
    if (sectorFilter !== "all") list = list.filter(c => c.sector === sectorFilter)
    if (statusFilter === "dnc") {
      // Show only clients with at least one DNC entry linked or matching domain
      list = list.filter(c => {
        if (c.dbId && dncByClientId.has(c.dbId)) return true
        if (c.emailDomains?.some(d => dncDomains.has(d))) return true
        return false
      })
    } else if (statusFilter === "active") {
      // Default to "active" for hardcoded clients without a status (no dbId)
      list = list.filter(c => (c.status ?? "active") === "active")
    } else if (statusFilter === "inactive") {
      // Prospect, former, archived — anything DB-backed that isn't active
      list = list.filter(c => INACTIVE_STATUSES.has(c.status ?? ""))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    const sorted = [...list]
    switch (sortMode) {
      case "health":
        sorted.sort((a, b) => (b.health?.score ?? 0) - (a.health?.score ?? 0))
        break
      case "assets":
        sorted.sort((a, b) => b.counts.total - a.counts.total)
        break
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted
  }, [clientsWithCounts, sectorFilter, statusFilter, searchQuery, sortMode, dncDomains, dncByClientId])

  // ── Grouped clients (only used when groupByTier is true)
  const groupedClients = useMemo(() => {
    if (!groupByTier) return null
    const groups: Record<string, ClientWithCounts[]> = { champion: [], active: [], dormant: [], new: [] }
    for (const c of filteredClients) {
      const tier = c.health?.tier ?? "new"
      groups[tier]!.push(c)
    }
    return Object.entries(groups)
      .filter(([, clients]) => clients.length > 0)
      .sort(([a], [b]) => (TIER_ORDER[a] ?? 99) - (TIER_ORDER[b] ?? 99))
  }, [groupByTier, filteredClients])

  // ── Flat list for keyboard nav (respects grouping + collapsed state)
  const flatList = useMemo(() => {
    if (!groupByTier || !groupedClients) return filteredClients
    const flat: ClientWithCounts[] = []
    for (const [tier, clients] of groupedClients) {
      if (!collapsedGroups.has(tier)) flat.push(...clients)
    }
    return flat
  }, [groupByTier, groupedClients, collapsedGroups, filteredClients])

  // ── Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!flatList.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusedIndex(prev => {
        const next = Math.min(prev + 1, flatList.length - 1)
        itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" })
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusedIndex(prev => {
        const next = Math.max(prev - 1, 0)
        itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" })
        return next
      })
    } else if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < flatList.length) {
      e.preventDefault()
      const focused = flatList[focusedIndex]
      if (focused) setSelectedClient(focused.name)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setSelectedClient(null)
      setFocusedIndex(-1)
    }
  }, [flatList, focusedIndex, setSelectedClient])

  // Reset focused index when filters change
  useEffect(() => { setFocusedIndex(-1) }, [searchQuery, sectorFilter, statusFilter, sortMode, groupByTier])

  const toggleGroup = (tier: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(tier) ? next.delete(tier) : next.add(tier)
      return next
    })
  }

  // ── Render a single client row
  const renderClientRow = (client: ClientWithCounts, flatIdx: number) => {
    const isActive = selectedClient === client.name
    const isFocused = focusedIndex === flatIdx
    const { counts, health } = client
    const parts: string[] = []
    if (counts.caseStudies > 0) parts.push(`${counts.caseStudies} case${counts.caseStudies !== 1 ? "s" : ""}`)
    if (counts.testimonials > 0) parts.push(`${counts.testimonials} quote${counts.testimonials !== 1 ? "s" : ""}`)
    if (counts.results > 0) parts.push(`${counts.results} result${counts.results !== 1 ? "s" : ""}`)
    if (counts.awards > 0) parts.push(`${counts.awards} award${counts.awards !== 1 ? "s" : ""}`)
    if (health?.proposalCount) parts.push(`${health.proposalCount} prop${health.proposalCount !== 1 ? "s" : ""}`)

    const hasRecentActivity = health?.lastProposalDate
      ? (Date.now() - new Date(health.lastProposalDate).getTime()) / (1000 * 60 * 60 * 24) < 180
      : false

    return (
      <div
        key={client.name}
        ref={el => { if (el) itemRefs.current.set(flatIdx, el); else itemRefs.current.delete(flatIdx) }}
        className={`group relative border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors ${
          isActive
            ? "bg-sky-50 dark:bg-sky-900/20 border-l-2 border-l-sky-500"
            : isFocused
              ? "bg-slate-50 dark:bg-slate-800/60 border-l-2 border-l-slate-300 dark:border-l-slate-600"
              : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
        }`}
      >
        <button
          onClick={() => setSelectedClient(client.name)}
          className="w-full text-left px-4 py-3 pr-16"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {health && health.tier !== "new" && (
                <span
                  className={`shrink-0 w-2 h-2 rounded-full border-2 ${TIER_RING[health.tier]} bg-white dark:bg-slate-900`}
                  title={`${health.tier} · score ${health.score}`}
                />
              )}
              <span className={`text-sm font-medium leading-tight truncate ${isActive ? "text-sky-700 dark:text-sky-300" : "text-slate-800 dark:text-slate-200"}`}>
                {client.name}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {hasRecentActivity && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Active in last 6 months" />
              )}
              {health && health.proposalCount > 0 && (
                <span className={`text-[9px] font-semibold tabular-nums ${TIER_COLORS[health.tier]}`}>{health.winRate}%</span>
              )}
              {/* Status pill — only shown for DB-backed clients (hardcoded have no status) */}
              {client.status && client.status !== "active" && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${STATUS_PILL[client.status]}`}>
                  {client.status[0]!.toUpperCase() + client.status.slice(1)}
                </span>
              )}
              {/* DNC badge — present if a DNC entry references this client OR shares a domain */}
              {((client.dbId && dncByClientId.has(client.dbId)) ||
                client.emailDomains?.some(d => dncDomains.has(d))) && (
                <span
                  className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md border bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200/60"
                  title="Has a Do Not Contact entry"
                >
                  <ShieldAlert size={9} className="mr-0.5" />
                  DNC
                </span>
              )}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${SECTOR_COLORS[client.sector]}`}>
                {SECTOR_LABELS[client.sector]}
              </span>
            </div>
          </div>
          {parts.length > 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              {parts.join(" · ")}
            </p>
          )}
        </button>
        {/* Admin edit/delete (edit available for both DB-backed and hardcoded-only clients) */}
        {isAdmin && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => {
                e.stopPropagation()
                if (client.dbId) {
                  window.dispatchEvent(new CustomEvent("client-portfolio:edit", { detail: { clientId: client.dbId } }))
                } else {
                  // Hardcoded-only client — open in create mode with prefilled name/sector so editing
                  // (e.g., adding email_domains) materializes a real DB row.
                  window.dispatchEvent(new CustomEvent("client-portfolio:edit", { detail: { name: client.name, sector: client.sector } }))
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
              title={client.dbId ? "Edit client" : "Edit (creates a DB record on save)"}
            >
              <Pencil size={12} />
            </button>
            {client.dbId && (
            <button
              onClick={e => {
                e.stopPropagation()
                const dbClient = dbClients.find(c => c.id === client.dbId)
                if (!dbClient) return
                const domains = dbClient.emailDomains
                if (domains.length === 0) {
                  // No domain on this client — open DNC dialog with just the institution name
                  setMoveToDncTarget(dbClient)
                } else if (domains.length === 1) {
                  setMoveToDncTarget(dbClient)
                } else {
                  // Multi-domain: ask which one
                  setMovePickDomainOpen({ client: dbClient, domains })
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Move to Do Not Contact (suppresses entire domain)"
            >
              <ShieldAlert size={12} />
            </button>
            )}
            {client.dbId && (
            <button
              onClick={async e => {
                e.stopPropagation()
                if (!client.dbId) return
                if (!confirm(`Remove "${client.name}" from the client list?`)) return
                try {
                  const result = await clientsApi.delete(client.dbId)
                  setDbClients(prev => prev.filter(c => c.id !== client.dbId))
                  if (selectedClient === client.name) setSelectedClient(null)
                  if (result.orphanedDnc > 0) {
                    alert(`Client deleted. ${result.orphanedDnc} Do Not Contact ${result.orphanedDnc === 1 ? "entry was" : "entries were"} unlinked but kept on the suppression list.`)
                  }
                } catch (err) {
                  alert(`Failed to remove: ${err instanceof Error ? err.message : "unknown error"}`)
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Remove client"
            >
              <Trash2 size={12} />
            </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="w-full flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 overflow-hidden shadow-sm"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Search + Controls */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search clients…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
          />
        </div>

        {/* Status segmented control + advanced-filter trigger */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 grid grid-cols-3 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/40">
            {(["active", "inactive", "dnc"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  statusFilter === s
                    ? s === "dnc"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                title={
                  s === "dnc"
                    ? "Show only clients with a Do Not Contact entry"
                    : s === "inactive"
                      ? "Show prospect, former, and archived clients"
                      : "Show active clients"
                }
              >
                <span>{STATUS_LABEL[s]}</span>
                <span className={`text-[10px] tabular-nums ${statusFilter === s ? "opacity-80" : "opacity-50"}`}>
                  {statusCounts[s]}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowMore(v => !v)}
            className={`p-1.5 rounded-lg border transition-all ${
              showMore || sortMode !== "alpha" || sectorFilter !== "all" || groupByTier
                ? "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/40"
                : "bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            }`}
            title={showMore ? "Hide sort & filter" : "Sort & filter"}
            aria-label="Sort and filter options"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {/* Collapsible: sort + sector + group */}
        {showMore && (
          <div className="space-y-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            {/* Sort */}
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-1">Sort</div>
              <div className="flex items-center gap-1.5">
                {(["alpha", "health", "assets"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                      sortMode === mode
                        ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/40"
                        : "text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {mode === "alpha" && <><ArrowUpDown size={9} /> A→Z</>}
                    {mode === "health" && <><ArrowUpDown size={9} /> Health</>}
                    {mode === "assets" && <><ArrowUpDown size={9} /> Assets</>}
                  </button>
                ))}
                <button
                  onClick={() => setGroupByTier(v => !v)}
                  className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                    groupByTier
                      ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/40"
                      : "text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                  title="Group by tier"
                >
                  <Layers size={10} /> Group
                </button>
              </div>
            </div>

            {/* Sector */}
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-1">Sector</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", "higher-ed", "healthcare", "other"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSectorFilter(s)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all duration-200 ${
                      sectorFilter === s
                        ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    {s === "all" ? "All" : SECTOR_LABELS[s]} ({sectorCounts[s]})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Client List */}
      {globalLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500 text-sm px-4 text-center">
          No clients match your filters
        </div>
      ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
          {groupByTier && groupedClients ? (
            // Grouped view
            groupedClients.map(([tier, clients]) => {
              const isCollapsed = collapsedGroups.has(tier)
              // Compute flat indices for keyboard nav
              let startIdx = 0
              for (const [t, c] of groupedClients) {
                if (t === tier) break
                if (!collapsedGroups.has(t)) startIdx += c.length
              }
              return (
                <div key={tier}>
                  <button
                    onClick={() => toggleGroup(tier)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronRight size={12} className="text-slate-400 shrink-0" />
                      : <ChevronDown size={12} className="text-slate-400 shrink-0" />
                    }
                    <span className={`w-2 h-2 rounded-full ${TIER_DOT_COLORS[tier]}`} />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {TIER_LABELS[tier]}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{clients.length}</span>
                  </button>
                  {!isCollapsed && clients.map((client, i) => renderClientRow(client, startIdx + i))}
                </div>
              )
            })
          ) : (
            // Flat view
            filteredClients.map((client, i) => renderClientRow(client, i))
          )}
        </div>
      )}

      {/* Move-to-DNC dialog (single-domain or no-domain client) */}
      {moveToDncTarget && (
        <DoNotContactDialog
          defaults={{
            institution: moveToDncTarget.name,
            email: moveToDncTarget.emailDomains[0] ? `@${moveToDncTarget.emailDomains[0]}` : "",
            clientId: moveToDncTarget.id,
          }}
          onClose={() => setMoveToDncTarget(null)}
          onSaved={(entry) => {
            setDncEntries(prev => [...prev, entry])
            setMoveToDncTarget(null)
          }}
        />
      )}

      {/* Multi-domain picker — choose which domain(s) to suppress */}
      {movePickDomainOpen && (
        <DomainPicker
          institution={movePickDomainOpen.client.name}
          domains={movePickDomainOpen.domains}
          onCancel={() => setMovePickDomainOpen(null)}
          onPick={(domain) => {
            setMoveToDncTarget({ ...movePickDomainOpen.client, emailDomains: [domain] })
            setMovePickDomainOpen(null)
          }}
        />
      )}
    </div>
  )
}

function DomainPicker({
  institution,
  domains,
  onCancel,
  onPick,
}: {
  institution: string
  domains: string[]
  onCancel: () => void
  onPick: (domain: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm mx-4 border border-slate-200/60 dark:border-slate-700/60 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Pick a domain to suppress
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>{institution}</strong> has multiple domains. DNC is org-wide per domain — pick one to add to Do Not Contact. To suppress more than one, repeat for each.
        </p>
        <ul className="space-y-1.5">
          {domains.map(d => (
            <li key={d}>
              <button
                onClick={() => onPick(d)}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm text-slate-800 dark:text-slate-200 transition-colors"
              >
                @{d}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
