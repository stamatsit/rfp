/**
 * Shared context for ClientPortfolio sub-components.
 * Splits into two contexts to avoid re-render cascades:
 *   1. ClientDataContext — global data loaded once on mount (rarely changes)
 *   2. ClientSelectionContext — selected client + per-client state (changes on click)
 */

import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import {
  clientSuccessApi,
  awardsApi,
  testimonialsApi,
  clientPortfolioApi,
  clientsApi,
  clientQaApi,
  clientDocumentsApi,
  clientBrandKitApi,
  studioApi,
  type ClientSuccessEntryResponse,
  type ClientSuccessResultResponse,
  type ClientSuccessTestimonialResponse,
  type ClientSuccessAwardResponse,
  type ClientProfileApiResponse,
  type ClientResponse,
  type LinkedQaAnswer,
  type ClientWinRate,
  type ClientDocument,
  type ClientBrandKit,
} from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { clientSuccessData, type NamedClient } from "@/data/clientSuccessData"
import {
  matchHardcodedCaseStudies,
  matchHardcodedResults,
  matchHardcodedTestimonials,
  matchHardcodedAwards,
  computeClientCounts,
  computeClientHealthScore,
  type ClientAssetCounts,
  type ClientHealthScore,
  type ClientWinRateData,
} from "@/lib/clientUtils"
// toast imported for potential future use by sub-components via context
// import { toast } from "@/hooks/useToast"
import { markdownToHtml } from "@/lib/markdownToHtml"
import type { ClientChatContext } from "./types"

// ─── Types ───────────────────────────────────────────────────────

export type SectorFilter = "all" | "higher-ed" | "healthcare" | "other"
export type DetailTab = "overview" | "assets" | "documents" | "brand-kit"

export interface ClientWithCounts extends NamedClient {
  counts: ClientAssetCounts
  dbId?: string
  health?: ClientHealthScore
}

export interface NormalizedCaseStudy {
  id: string
  focus: string
  challenge: string | null
  solution: string | null
  metrics: Array<{ label: string; value: string }>
  testimonial: { quote: string; attribution?: string } | null
}

export function normalizeCaseStudy(cs: Record<string, unknown>, i: number): NormalizedCaseStudy {
  return {
    id: typeof cs.id === "string" ? cs.id : `hc-cs-${i}`,
    focus: typeof cs.focus === "string" ? cs.focus : "",
    challenge: typeof cs.challenge === "string" ? cs.challenge : null,
    solution: typeof cs.solution === "string" ? cs.solution : null,
    metrics: Array.isArray(cs.metrics) ? cs.metrics : [],
    testimonial: cs.testimonial && typeof cs.testimonial === "object"
      ? { quote: (cs.testimonial as { quote?: string }).quote || "", attribution: (cs.testimonial as { attribution?: string }).attribution }
      : null,
  }
}

// ─── Hardcoded → DB type adapters ────────────────────────────────

export function adaptHardcodedTestimonial(t: { quote: string; name: string; title: string; organization: string; internalNote?: string }, i: number) {
  return {
    ...t,
    id: `hc-${t.quote.slice(0, 8)}-${i}`,
    status: "approved" as const,
    sector: null,
    tags: [],
    usageCount: 0,
    lastUsedAt: null,
    featured: false,
    addedBy: null,
    approvedBy: null,
    approvedAt: null,
    fingerprint: null,
    notes: t.internalNote || null,
    testimonialDate: null,
    createdAt: "",
    updatedAt: "",
  }
}

export function adaptHardcodedAward(a: { name: string; year: number | string; clientOrProject: string }, i: number) {
  return {
    ...a,
    id: `hc-${a.name.slice(0, 8)}-${i}`,
    companyName: a.clientOrProject,
    issuingAgency: null,
    category: null,
    awardLevel: null,
    submissionStatus: null,
    badgeStorageKey: null,
    notes: null,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  }
}

// ─── Merged asset data type ──────────────────────────────────────

export interface MergedAssetData {
  caseStudies: Array<Record<string, unknown>>
  results: Array<{ metric: string; result: string; direction: "increase" | "decrease"; id?: string }>
  testimonials: Array<Record<string, unknown>>
  awards: Array<Record<string, unknown>>
  proposals: Array<Record<string, unknown>>
}

// ─── Context shapes ──────────────────────────────────────────────

interface ClientDataContextValue {
  dbEntries: ClientSuccessEntryResponse[]
  dbResults: ClientSuccessResultResponse[]
  dbTestimonials: ClientSuccessTestimonialResponse[]
  dbAwards: ClientSuccessAwardResponse[]
  dbClients: ClientResponse[]
  setDbClients: React.Dispatch<React.SetStateAction<ClientResponse[]>>
  winRates: Record<string, ClientWinRate>
  globalLoading: boolean
  clientsWithCounts: ClientWithCounts[]
  isAdmin: boolean
}

interface ClientSelectionContextValue {
  selectedClient: string | null
  setSelectedClient: (name: string | null) => void
  activeClient: ClientWithCounts | null
  activeTab: DetailTab
  setActiveTab: (tab: DetailTab) => void

  // Profile
  profile: ClientProfileApiResponse | null
  profileLoading: boolean
  mergedData: MergedAssetData | null
  clientChatContext: ClientChatContext | null

  // Q&A
  qaLinks: LinkedQaAnswer[]
  setQaLinks: React.Dispatch<React.SetStateAction<LinkedQaAnswer[]>>
  qaLinksLoading: boolean

  // Documents
  clientDocs: ClientDocument[]
  setClientDocs: React.Dispatch<React.SetStateAction<ClientDocument[]>>
  docsLoading: boolean

  // Brand Kit
  brandKit: ClientBrandKit | null
  setBrandKit: React.Dispatch<React.SetStateAction<ClientBrandKit | null>>

  // Brief generation
  generatingBrief: boolean
  handleGenerateBrief: () => Promise<void>

  // Navigation
  navigate: ReturnType<typeof useNavigate>
}

const ClientDataContext = createContext<ClientDataContextValue | null>(null)
const ClientSelectionContext = createContext<ClientSelectionContextValue | null>(null)

export function useClientData() {
  const ctx = useContext(ClientDataContext)
  if (!ctx) throw new Error("useClientData must be used within ClientPortfolioProvider")
  return ctx
}

export function useClientSelection() {
  const ctx = useContext(ClientSelectionContext)
  if (!ctx) throw new Error("useClientSelection must be used within ClientPortfolioProvider")
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────

export function ClientPortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // ── Global data (loaded once)
  const [dbEntries, setDbEntries] = useState<ClientSuccessEntryResponse[]>([])
  const [dbResults, setDbResults] = useState<ClientSuccessResultResponse[]>([])
  const [dbTestimonials, setDbTestimonials] = useState<ClientSuccessTestimonialResponse[]>([])
  const [dbAwards, setDbAwards] = useState<ClientSuccessAwardResponse[]>([])
  const [dbClients, setDbClients] = useState<ClientResponse[]>([])
  const [winRates, setWinRates] = useState<Record<string, ClientWinRate>>({})
  const [globalLoading, setGlobalLoading] = useState(true)

  // ── Selection
  const [selectedClient, setSelectedClient] = useState<string | null>(
    () => { const p = searchParams.get("select"); return p ? decodeURIComponent(p) : null }
  )
  const selectedClientRef = useRef<string | null>(null)
  selectedClientRef.current = selectedClient
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")

  // ── Per-client profile
  const [profile, setProfile] = useState<ClientProfileApiResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // ── Q&A
  const [qaLinks, setQaLinks] = useState<LinkedQaAnswer[]>([])
  const [qaLinksLoading, setQaLinksLoading] = useState(false)

  // ── Documents
  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  // ── Brand Kit
  const [brandKit, setBrandKit] = useState<ClientBrandKit | null>(null)

  // ── Brief
  const [generatingBrief, setGeneratingBrief] = useState(false)

  // ── Load global data on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [entries, results, testimonialsData, awards, dbClientList, rates] = await Promise.all([
          clientSuccessApi.getEntries(),
          clientSuccessApi.getResults(),
          testimonialsApi.list({ limit: 500 }),
          awardsApi.list(),
          clientsApi.list(),
          clientPortfolioApi.getWinRates().catch(() => ({})),
        ])
        if (cancelled) return
        setDbEntries(entries)
        setDbResults(results)
        setDbTestimonials(testimonialsData.testimonials)
        setDbAwards(awards)
        setDbClients(dbClientList)
        setWinRates(rates)
      } catch (err) {
        console.error("Failed to load client portfolio data:", err)
      } finally {
        if (!cancelled) setGlobalLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Handle ?select= deep-link
  useEffect(() => {
    const selectParam = searchParams.get("select")
    if (selectParam && !globalLoading) {
      setSelectedClient(decodeURIComponent(selectParam))
    }
  }, [searchParams, globalLoading])

  // ── Reset tab on client change + load per-client data
  useEffect(() => {
    setActiveTab("overview")
    if (!selectedClient) {
      setProfile(null); setQaLinks([]); setClientDocs([]); setBrandKit(null)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    setQaLinksLoading(true)
    setDocsLoading(true)
    Promise.all([
      clientPortfolioApi.getClientProfile(selectedClient),
      clientQaApi.list(selectedClient),
      clientDocumentsApi.list(selectedClient),
      clientBrandKitApi.get(selectedClient),
    ])
      .then(([profileData, links, docs, kit]) => {
        if (!cancelled) {
          setProfile(profileData)
          setQaLinks(links)
          setClientDocs(docs)
          setBrandKit(kit)
        }
      })
      .catch(err => console.error("Failed to load client profile:", err))
      .finally(() => {
        if (!cancelled) { setProfileLoading(false); setQaLinksLoading(false); setDocsLoading(false) }
      })
    return () => { cancelled = true }
  }, [selectedClient])

  // ── Compute client roster
  const clientsWithCounts = useMemo<ClientWithCounts[]>(() => {
    if (globalLoading) return []
    const countArgs = {
      hardcodedCaseStudies: clientSuccessData.caseStudies,
      hardcodedResults: clientSuccessData.topLineResults,
      hardcodedTestimonials: clientSuccessData.testimonials,
      hardcodedAwards: clientSuccessData.awards,
      dbTestimonials,
      dbAwards,
      dbEntries,
      dbResults,
    }
    const hardcoded = clientSuccessData.namedClients.map(client => {
      const winRateKey = client.name.toLowerCase()
      const winRateData = winRates[winRateKey] as ClientWinRateData | undefined
      const counts = computeClientCounts(client.name, countArgs, winRateData)
      return { ...client, counts, health: computeClientHealthScore(counts, winRateData) }
    })
    const hardcodedNames = new Set(hardcoded.map(c => c.name.toLowerCase()))
    const fromDb: ClientWithCounts[] = dbClients
      .filter(c => !hardcodedNames.has(c.name.toLowerCase()))
      .map(c => {
        const winRateKey = c.name.toLowerCase()
        const winRateData = winRates[winRateKey] as ClientWinRateData | undefined
        const counts = computeClientCounts(c.name, countArgs, winRateData)
        return { name: c.name, sector: c.sector, dbId: c.id, counts, health: computeClientHealthScore(counts, winRateData) }
      })
    return [...hardcoded, ...fromDb]
  }, [globalLoading, dbEntries, dbResults, dbTestimonials, dbAwards, dbClients, winRates])

  // ── Merged asset data for selected client
  const mergedData = useMemo<MergedAssetData | null>(() => {
    if (!selectedClient) return null
    const hardCaseStudies = matchHardcodedCaseStudies(selectedClient, clientSuccessData.caseStudies)
    const hardResults = matchHardcodedResults(selectedClient, clientSuccessData.topLineResults)
    const hardTestimonials = matchHardcodedTestimonials(selectedClient, clientSuccessData.testimonials)
    const hardAwards = matchHardcodedAwards(selectedClient, clientSuccessData.awards)
    const dbCaseStudies = profile?.caseStudies ?? []
    const dbResultsForClient = profile?.results ?? []
    const dbTestimonialsForClient = profile?.testimonials ?? []
    const dbAwardsForClient = profile?.awards ?? []
    return {
      caseStudies: [...hardCaseStudies, ...dbCaseStudies] as unknown as Array<Record<string, unknown>>,
      results: [...hardResults, ...dbResultsForClient],
      testimonials: [
        ...hardTestimonials.map((t, i) => adaptHardcodedTestimonial(t, i)),
        ...dbTestimonialsForClient,
      ] as unknown as Array<Record<string, unknown>>,
      awards: [
        ...hardAwards.map((a, i) => adaptHardcodedAward(a, i)),
        ...dbAwardsForClient,
      ] as unknown as Array<Record<string, unknown>>,
      proposals: (profile?.proposals ?? []) as unknown as Array<Record<string, unknown>>,
    }
  }, [selectedClient, profile])

  // ── Active client entry
  const activeClient = useMemo(
    () => clientsWithCounts.find(c => c.name === selectedClient) ?? null,
    [clientsWithCounts, selectedClient]
  )

  // ── Build client chat context
  const clientChatContext = useMemo<ClientChatContext | null>(() => {
    if (!selectedClient || !mergedData) return null
    return {
      clientName: selectedClient,
      sector: activeClient?.sector,
      caseStudies: mergedData.caseStudies.map((cs, i) => {
        const n = normalizeCaseStudy(cs, i)
        return {
          focus: n.focus,
          challenge: n.challenge,
          solution: n.solution,
          metrics: n.metrics,
          testimonialQuote: n.testimonial?.quote ?? null,
          testimonialAttribution: n.testimonial?.attribution ?? null,
        }
      }),
      results: mergedData.results.map(r => ({ metric: r.metric, result: r.result, direction: r.direction })),
      testimonials: (mergedData.testimonials as Array<{ quote: string; name?: string; title?: string; organization?: string }>).map(t => ({
        quote: t.quote, name: t.name ?? null, title: t.title ?? null, organization: t.organization ?? null,
      })),
      awards: (mergedData.awards as Array<{ name: string; year: number | string; issuingAgency?: string | null; awardLevel?: string | null }>).map(a => ({
        name: a.name, year: a.year,
        issuingAgency: "issuingAgency" in a ? a.issuingAgency ?? null : null,
        awardLevel: "awardLevel" in a ? a.awardLevel ?? null : null,
      })),
      proposals: (mergedData.proposals as Array<{ date?: string | null; projectType?: string | null; category?: string | null; won?: string | null; servicesOffered?: string[] }>).map(p => ({
        date: p.date ?? null, projectType: p.projectType ?? null, category: p.category ?? null, won: p.won ?? null, servicesOffered: p.servicesOffered ?? [],
      })),
      qaAnswers: qaLinks.map(l => ({ question: l.question, answer: l.answer, topic: l.topic || "" })),
      documents: clientDocs.map(d => ({ title: d.title, docType: d.docType, summary: d.summary, keyPoints: d.keyPoints })),
      brandKit: brandKit ? {
        primaryColor: brandKit.primaryColor, primaryFont: brandKit.primaryFont, tone: brandKit.tone, styleNotes: brandKit.styleNotes, websiteUrl: brandKit.websiteUrl,
      } : null,
    }
  }, [selectedClient, mergedData, activeClient, qaLinks, clientDocs, brandKit])

  // ── Brief generation
  const handleGenerateBrief = useCallback(async () => {
    if (!selectedClient || !clientChatContext) return
    setGeneratingBrief(true)
    try {
      const { markdown } = await clientPortfolioApi.generateBrief(selectedClient, clientChatContext as unknown as Record<string, unknown>)
      const html = markdownToHtml(markdown)
      const doc = await studioApi.createDocument({
        title: `${selectedClient} — Client Brief`,
        content: `<div>${html}</div>`,
        sourceType: "ai-generated",
        tags: [selectedClient.toLowerCase(), "brief", "client"],
        metadata: { generatedFor: selectedClient },
      }) as { id: string }
      navigate(`/studio?doc=${doc.id}`)
    } catch (err) {
      console.error("Brief generation failed:", err)
    } finally {
      setGeneratingBrief(false)
    }
  }, [selectedClient, clientChatContext, navigate])

  // ── Context values (memoized to avoid unnecessary re-renders)
  const dataValue = useMemo<ClientDataContextValue>(() => ({
    dbEntries, dbResults, dbTestimonials, dbAwards, dbClients, setDbClients, winRates, globalLoading, clientsWithCounts, isAdmin,
  }), [dbEntries, dbResults, dbTestimonials, dbAwards, dbClients, winRates, globalLoading, clientsWithCounts, isAdmin])

  const selectionValue = useMemo<ClientSelectionContextValue>(() => ({
    selectedClient, setSelectedClient, activeClient, activeTab, setActiveTab,
    profile, profileLoading, mergedData, clientChatContext,
    qaLinks, setQaLinks, qaLinksLoading,
    clientDocs, setClientDocs, docsLoading,
    brandKit, setBrandKit,
    generatingBrief, handleGenerateBrief,
    navigate,
  }), [
    selectedClient, activeClient, activeTab,
    profile, profileLoading, mergedData, clientChatContext,
    qaLinks, qaLinksLoading,
    clientDocs, docsLoading,
    brandKit,
    generatingBrief, handleGenerateBrief,
    navigate,
  ])

  return (
    <ClientDataContext.Provider value={dataValue}>
      <ClientSelectionContext.Provider value={selectionValue}>
        {children}
      </ClientSelectionContext.Provider>
    </ClientDataContext.Provider>
  )
}
