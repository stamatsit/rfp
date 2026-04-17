/**
 * Reports archive — grid of all generated gap-analysis reports.
 */
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FileText, ExternalLink, Loader2, AlertCircle, Plus } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"

interface ReportMeta {
  id: string
  slug: string
  clientName: string
  clientUrl: string
  score: number
  totalIssues: number
  critical: number
  high: number
  generatedAt: string
  generatedBy: string
  firmName: string
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
  if (score >= 40) return "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
  return "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400"
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function ReportsArchive() {
  const [reports, setReports] = useState<ReportMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/reports", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: { reports: ReportMeta[] }) => setReports(data.reports))
      .catch((e) => setError(e?.message || "Failed to load reports"))
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-[hsl(224,20%,8%)]">
      <AppHeader title="Client Reports" />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Client Reports</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Polished gap-analysis deliverables generated from URL scans.
            </p>
          </div>
          <Link
            to="/scanner"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all"
          >
            <Plus size={14} />
            New Report
          </Link>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm mb-6">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {!reports && !error && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {reports && reports.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-8 py-16 text-center">
            <FileText size={32} className="text-slate-300 dark:text-slate-700 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">No reports yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Scan a URL, then click <strong>Create Client Report</strong> on the results view.
            </p>
            <Link
              to="/scanner"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors"
            >
              Start a scan
            </Link>
          </div>
        )}

        {reports && reports.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r) => (
              <Link
                key={r.slug}
                to={`/reports/${r.slug}`}
                className="group rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all bg-white dark:bg-slate-900/50 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{r.clientName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{r.clientUrl.replace(/^https?:\/\//, "")}</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${scoreColor(r.score)}`}>
                    {r.score}/100
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="text-red-500">{r.critical}</span>
                  <span>critical</span>
                  <span className="text-amber-500">{r.high}</span>
                  <span>high</span>
                  <span className="text-slate-400">· {r.totalIssues} total</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">{timeAgo(r.generatedAt)}</span>
                  <ExternalLink size={12} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
