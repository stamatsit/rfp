/**
 * Report viewer — renders a generated report HTML in a full-viewport iframe.
 * Lightweight top bar with back + copy-link + open-in-new-tab controls.
 */
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Copy, Check, ExternalLink, AlertCircle } from "lucide-react"

interface ReportMeta {
  slug: string
  clientName: string
  score: number
  generatedAt: string
}

export function ReportViewer() {
  const { slug } = useParams<{ slug: string }>()
  const [meta, setMeta] = useState<ReportMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/reports/${slug}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Report not found" : await r.text())
        return r.json()
      })
      .then((data) => setMeta(data))
      .catch((e) => setError(e?.message || "Failed to load"))
  }, [slug])

  function copyLink() {
    const shareUrl = `${window.location.origin}/api/reports/${slug}/html`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-[hsl(224,20%,8%)] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle size={32} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{error}</h2>
          <Link to="/reports" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            ← Back to reports
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={14} />
          All Reports
        </Link>
        <div className="text-xs text-slate-400 truncate mx-2 flex-1 text-center">
          {meta?.clientName ?? slug}
          {meta && <span className="text-slate-600 ml-2">· {meta.score}/100</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={`/api/reports/${slug}/html`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ExternalLink size={14} />
            Open
          </a>
        </div>
      </div>
      <iframe
        src={`/api/reports/${slug}/html`}
        title={`Report ${slug}`}
        className="flex-1 w-full border-0 bg-black"
      />
    </div>
  )
}
