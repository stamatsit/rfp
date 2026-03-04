/**
 * ClientOverviewTab — Key Results grid + promoted AI Chat + Gap Analysis.
 */

import { useState, useMemo } from "react"
import {
  BarChart3,
  Building2,
  Loader2,
  SearchX,
} from "lucide-react"
import { useClientSelection } from "./ClientPortfolioContext"
import { SectionHeader } from "./SectionHeader"
import { MetricCard } from "./MetricCard"
import { ClientAIChat } from "./ClientAIChat"
import { ChatMarkdown } from "./ChatMarkdown"
import { clientPortfolioApi } from "@/lib/api"

export function ClientOverviewTab() {
  const {
    selectedClient,
    mergedData,
    clientChatContext,
  } = useClientSelection()

  const [gapAnalysis, setGapAnalysis] = useState<string | null>(null)
  const [analyzingGap, setAnalyzingGap] = useState(false)

  if (!selectedClient || !mergedData) return null

  const hasAnyAssets =
    mergedData.caseStudies.length > 0 ||
    mergedData.results.length > 0 ||
    mergedData.testimonials.length > 0 ||
    mergedData.awards.length > 0 ||
    mergedData.proposals.length > 0

  // ── Smart starter prompts based on available data
  const smartStarters = useMemo(() => {
    const starters: string[] = []
    if (!mergedData) return undefined

    if (mergedData.testimonials.length === 0)
      starters.push("Help me draft a testimonial request email for this client")
    if (mergedData.caseStudies.length === 0)
      starters.push("What information would I need to build a case study for this client?")
    if (mergedData.results.length > 0)
      starters.push("What are the strongest proof points for a new proposal?")
    if (mergedData.proposals.length > 0)
      starters.push(`Summarize our ${mergedData.proposals.length} proposals — wins, losses, and patterns`)

    starters.push("Summarize this client's history with Stamats")
    return starters.slice(0, 4)
  }, [mergedData])

  // ── Gap analysis handler
  const runGapAnalysis = async () => {
    if (!clientChatContext) return
    setAnalyzingGap(true)
    try {
      const result = await clientPortfolioApi.gapAnalysis(selectedClient, clientChatContext)
      setGapAnalysis(result.markdown)
    } catch (err) {
      console.error("Gap analysis failed:", err)
      setGapAnalysis("Failed to analyze gaps. Please try again.")
    } finally {
      setAnalyzingGap(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      {/* Key Results */}
      {mergedData.results.length > 0 && (
        <div>
          <SectionHeader icon={BarChart3} title="Key Results" count={mergedData.results.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {mergedData.results.map((r, i) => (
              <MetricCard
                key={"id" in r ? String(r.id) : `hc-r-${i}`}
                metric={r.metric}
                result={r.result}
                direction={r.direction}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gap Analysis */}
      <div className="flex items-center gap-2">
        <button
          onClick={runGapAnalysis}
          disabled={analyzingGap}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
        >
          {analyzingGap ? <Loader2 size={12} className="animate-spin" /> : <SearchX size={12} strokeWidth={2.5} />}
          {analyzingGap ? "Analyzing…" : "What's missing?"}
        </button>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">AI analyzes gaps in your client assets</span>
      </div>

      {gapAnalysis && (
        <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200/40 dark:border-amber-800/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <SearchX size={14} className="text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Gap Analysis</span>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-sm">
            <ChatMarkdown text={gapAnalysis} />
          </div>
        </div>
      )}

      {/* No assets at all */}
      {!hasAnyAssets && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 size={28} className="text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No assets found for this client</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">They may be listed under a slightly different name</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Try asking AI below for suggestions on what to gather.</p>
        </div>
      )}

      {/* AI Chat (promoted to overview) */}
      {clientChatContext && (
        <div className="bg-sky-50/30 dark:bg-sky-900/10 rounded-xl border border-sky-200/30 dark:border-sky-800/20 p-1">
          <ClientAIChat
            context={clientChatContext}
            clientName={selectedClient}
            smartStarters={smartStarters}
          />
        </div>
      )}
    </div>
  )
}
