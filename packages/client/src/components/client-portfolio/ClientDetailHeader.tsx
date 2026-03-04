/**
 * ClientDetailHeader — Brand gradient bar, logo, client name, quick-stat pills,
 * health ring, action buttons (Website, Proposals, Brief).
 */

import {
  Building2,
  TrendingUp,
  Link2,
  Wand2,
  Loader2,
} from "lucide-react"
import { useClientSelection } from "./ClientPortfolioContext"

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

export function ClientDetailHeader() {
  const {
    selectedClient,
    activeClient,
    mergedData,
    brandKit,
    clientDocs,
    generatingBrief,
    handleGenerateBrief,
    navigate,
  } = useClientSelection()

  if (!selectedClient || !mergedData) return null

  const proposalCount = (mergedData.proposals ?? []).length
  const health = activeClient?.health

  return (
    <>
      {/* Brand gradient bar */}
      <div
        className="h-1.5 w-full"
        style={{
          background: brandKit?.primaryColor
            ? `linear-gradient(90deg, ${brandKit.primaryColor}, ${brandKit.secondaryColor || brandKit.primaryColor})`
            : "linear-gradient(90deg, #0EA5E9, #0369A1)",
        }}
      />

      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          {/* Logo / Brand icon */}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 overflow-hidden"
            style={brandKit?.primaryColor
              ? { background: `linear-gradient(135deg, ${brandKit.primaryColor} 0%, ${brandKit.secondaryColor || brandKit.primaryColor} 100%)`, boxShadow: `0 3px 8px ${brandKit.primaryColor}55` }
              : { background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)", boxShadow: "0 3px 8px rgba(14,165,233,0.3)" }
            }
          >
            {brandKit?.logoUrl
              ? <img src={brandKit.logoUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              : <Building2 size={18} className="text-white" strokeWidth={2.25} />
            }
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{selectedClient}</h2>

            {/* Quick-stat pills */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {activeClient?.sector && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SECTOR_COLORS[activeClient.sector]}`}>
                  {SECTOR_LABELS[activeClient.sector]}
                </span>
              )}
              {health && health.proposalCount > 0 && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  health.tier === "champion"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : health.tier === "active"
                      ? "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                }`}>
                  {health.winRate}% win · {health.tier}
                </span>
              )}
              {mergedData.caseStudies.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {mergedData.caseStudies.length} case {mergedData.caseStudies.length !== 1 ? "studies" : "study"}
                </span>
              )}
              {mergedData.testimonials.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {mergedData.testimonials.length} quote{mergedData.testimonials.length !== 1 ? "s" : ""}
                </span>
              )}
              {proposalCount > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {proposalCount} proposal{proposalCount !== 1 ? "s" : ""}
                </span>
              )}
              {clientDocs.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {clientDocs.length} doc{clientDocs.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons + Health ring */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Health score ring */}
            {(() => {
              if (!health || health.tier === "new" || health.score === 0) return null
              const r = 16, circ = 2 * Math.PI * r
              const dash = (health.score / 100) * circ
              const tierColor = health.tier === "champion" ? "#10b981" : health.tier === "active" ? "#0ea5e9" : "#f59e0b"
              return (
                <div className="flex items-center gap-1.5" title={`Health score: ${health.score}/100 (${health.tier})`}>
                  <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
                    <circle cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-100 dark:text-slate-800" />
                    <circle cx="19" cy="19" r={r} fill="none" stroke={tierColor} strokeWidth="3" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
                  </svg>
                  <div className="-ml-[30px] flex items-center justify-center w-[38px] text-[10px] font-bold" style={{ color: tierColor }}>{health.score}</div>
                </div>
              )
            })()}

            {brandKit?.websiteUrl && (
              <a
                href={brandKit.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200/60 dark:border-slate-700/40"
                title={brandKit.websiteUrl}
              >
                <Link2 size={11} />
                Website
              </a>
            )}
            {proposalCount > 0 && (
              <button
                onClick={() => navigate(`/ai?tab=proposals&client=${encodeURIComponent(selectedClient!)}`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200/60 dark:border-cyan-800/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors"
                title="Open Proposal Insights for this client"
              >
                <TrendingUp size={12} strokeWidth={2.5} />
                Proposals
              </button>
            )}
            <button
              onClick={handleGenerateBrief}
              disabled={generatingBrief}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-800/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
              title="Generate a client brief in Document Studio"
            >
              {generatingBrief ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} strokeWidth={2.5} />}
              Brief
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
