/**
 * Client Portfolio — All assets organized by client/institution.
 * 2-panel layout: left client roster, right detail panel with tabs.
 * Color theme: Sky blue (#0EA5E9 → #0284C7 → #0369A1)
 */

import { useState, useEffect } from "react"
import {
  Building2,
  Plus,
  BarChart3,
  Briefcase,
  FileText,
  Palette,
  ArrowLeft,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  ClientPortfolioProvider,
  useClientData,
  useClientSelection,
  type DetailTab,
} from "@/components/client-portfolio/ClientPortfolioContext"
import { ClientRoster } from "@/components/client-portfolio/ClientRoster"
import { ClientDetailHeader } from "@/components/client-portfolio/ClientDetailHeader"
import { ClientOverviewTab } from "@/components/client-portfolio/ClientOverviewTab"
import { ClientAssetsTab } from "@/components/client-portfolio/ClientAssetsTab"
import { ClientDocumentsTab } from "@/components/client-portfolio/ClientDocumentsTab"
import { ClientBrandKitTab } from "@/components/client-portfolio/ClientBrandKitTab"
import { AddClientModal } from "@/components/client-portfolio"
import type { ClientResponse } from "@/lib/api"

// ─── Tab config ──────────────────────────────────────────────────

const TABS: Array<{ id: DetailTab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "assets", label: "Assets", icon: Briefcase },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "brand-kit", label: "Brand Kit", icon: Palette },
]

// ─── Inner component (consumes context) ──────────────────────────

function ClientPortfolioInner() {
  const { globalLoading, clientsWithCounts, isAdmin, dbClients, setDbClients } = useClientData()
  const {
    selectedClient,
    setSelectedClient,
    activeTab,
    setActiveTab,
    profileLoading,
    mergedData,
    clientDocs,
    qaLinks,
    brandKit,
  } = useClientSelection()

  // ── Add/Edit client modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientResponse | null>(null)

  // Listen for edit events from roster
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.clientId) {
        const dbClient = dbClients.find(c => c.id === detail.clientId)
        if (dbClient) { setEditingClient(dbClient); setShowAddModal(true) }
      }
    }
    window.addEventListener("client-portfolio:edit", handler)
    return () => window.removeEventListener("client-portfolio:edit", handler)
  }, [dbClients])

  // ── Tab badge counts
  const tabBadge = (tabId: DetailTab): number | null => {
    if (!mergedData) return null
    switch (tabId) {
      case "overview":
        return mergedData.results.length || null
      case "assets": {
        const total = mergedData.caseStudies.length + mergedData.testimonials.length + mergedData.awards.length + mergedData.proposals.length + qaLinks.length
        return total || null
      }
      case "documents":
        return clientDocs.length || null
      case "brand-kit":
        return null // show dot instead if has data
    }
  }

  const hasBrandKitData = brandKit && (brandKit.primaryColor || brandKit.primaryFont || brandKit.logoUrl || brandKit.logoStorageKey)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">

        {/* ── Page Header ────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0"
                style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 50%, #0369A1 100%)", boxShadow: "0 4px 12px rgba(14,165,233,0.35)" }}
              >
                <Building2 size={20} className="text-white" strokeWidth={2.25} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Client Portfolio
                </h1>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {globalLoading ? "Loading…" : `${clientsWithCounts.length} client${clientsWithCounts.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => { setEditingClient(null); setShowAddModal(true) }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors"
              >
                <Plus size={15} strokeWidth={2.5} />
                Add Client
              </button>
            )}
          </div>
        </div>

        {/* ── 2-Panel Layout ──────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">

          {/* Left: Client Roster (hidden on mobile when client selected) */}
          <div className={`w-full lg:w-auto ${selectedClient ? "hidden lg:block" : ""}`}>
            <ClientRoster />
          </div>

          {/* Right: Detail Panel */}
          <div className="flex-1 min-w-0 w-full">
            {/* Mobile back button */}
            {selectedClient && (
              <button
                onClick={() => setSelectedClient(null)}
                className="lg:hidden flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft size={12} />
                Back to clients
              </button>
            )}

            {!selectedClient ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center min-h-[400px] text-center px-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-slate-100 dark:bg-slate-800">
                  <Building2 size={22} className="text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Select a client to view their assets</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Case studies, testimonials, awards, results, and proposals</p>
              </div>
            ) : profileLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 flex items-center justify-center min-h-[400px]">
                <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mergedData ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm overflow-hidden">
                {/* Client header */}
                <ClientDetailHeader />

                {/* Tab bar */}
                <div className="px-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-0.5 -mb-px">
                    {TABS.map(tab => {
                      const isActive = activeTab === tab.id
                      const badge = tabBadge(tab.id)
                      const Icon = tab.icon
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all duration-200 ${
                            isActive
                              ? "border-sky-500 text-sky-700 dark:text-sky-400"
                              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          <Icon size={13} strokeWidth={isActive ? 2.5 : 2} />
                          {tab.label}
                          {badge !== null && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              isActive
                                ? "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                            }`}>
                              {badge}
                            </span>
                          )}
                          {tab.id === "brand-kit" && hasBrandKitData && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Tab content */}
                <div className="px-6 py-5">
                  {activeTab === "overview" && <ClientOverviewTab />}
                  {activeTab === "assets" && <ClientAssetsTab />}
                  {activeTab === "documents" && <ClientDocumentsTab />}
                  {activeTab === "brand-kit" && <ClientBrandKitTab />}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddClientModal
          client={editingClient}
          onClose={() => { setShowAddModal(false); setEditingClient(null) }}
          onSaved={saved => {
            setDbClients(prev => {
              const existing = prev.findIndex(c => c.id === saved.id)
              if (existing >= 0) {
                const next = [...prev]
                next[existing] = saved
                return next
              }
              return [...prev, saved]
            })
            setSelectedClient(saved.name)
            setShowAddModal(false)
            setEditingClient(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Exported page (wraps in context provider) ───────────────────

export function ClientPortfolio() {
  return (
    <ClientPortfolioProvider>
      <ClientPortfolioInner />
    </ClientPortfolioProvider>
  )
}
