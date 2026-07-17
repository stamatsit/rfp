import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Table2,
  Download,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Lock,
  Globe,
  FileSpreadsheet,
  Upload,
  RotateCw,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { toast } from "@/hooks/useToast"
import { useAuth } from "@/contexts/AuthContext"
import {
  dynomapperApi,
  downloadBase64Xlsx,
  type DynoProject,
  type DynoMatrixResult,
  type DynoMatrixRow,
  type DynoStatus,
  type DynoAiField,
  type DynoSyncSummary,
} from "@/lib/api"

const ALLOWED_EMAIL = "eric.yerke@stamats.com"

// Display order for the optional AI columns.
const AI_FIELD_ORDER: DynoAiField[] = [
  "summary",
  "contentType",
  "audience",
  "funnelStage",
  "rot",
  "draftTitle",
  "draftMeta",
]

const GRADIENT = "linear-gradient(135deg, #0EA5E9 0%, #6366F1 50%, #7C3AED 100%)"

function csvEscape(value: unknown): string {
  const s = String(value ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(rows: DynoMatrixRow[], aiFields: DynoAiField[], aiLabels: Record<string, string>): string {
  const headers = ["URL", "Title", "Type", "Depth", "Status", "Issues", ...aiFields.map((f) => aiLabels[f] ?? f)]
  const lines = [headers.map(csvEscape).join(",")]
  for (const r of rows) {
    const base = [r.url, r.title, r.type, r.depth ?? "", r.status ?? "", r.issues.join("; ")]
    const ai = aiFields.map((f) => r.ai?.[f] ?? "")
    lines.push([...base, ...ai].map(csvEscape).join(","))
  }
  return lines.join("\r\n")
}

function downloadCsv(filename: string, csv: string) {
  // Prepend a BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ContentMatrix() {
  const { user } = useAuth()
  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL

  const [status, setStatus] = useState<DynoStatus | null>(null)
  const [projects, setProjects] = useState<DynoProject[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [matrix, setMatrix] = useState<DynoMatrixResult | null>(null)

  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingMatrix, setLoadingMatrix] = useState(false)
  const [enriching, setEnriching] = useState(false)

  const [selectedFields, setSelectedFields] = useState<Set<DynoAiField>>(new Set())
  const [onlyIssues, setOnlyIssues] = useState(true)
  // Which AI fields have actually been generated (drives table columns + CSV).
  const [generatedFields, setGeneratedFields] = useState<DynoAiField[]>([])

  // Migration worksheet (.xlsx export + sync + redirects)
  const [worksheetBusy, setWorksheetBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncSummary, setSyncSummary] = useState<DynoSyncSummary | null>(null)
  const syncInputRef = useRef<HTMLInputElement>(null)
  const [deepAudit, setDeepAudit] = useState(false)
  const [draftCount, setDraftCount] = useState(0)
  const [redirectBusy, setRedirectBusy] = useState(false)
  const [redirectResult, setRedirectResult] = useState<Awaited<ReturnType<typeof dynomapperApi.redirectMap>> | null>(null)
  const redirectInputRef = useRef<HTMLInputElement>(null)

  const DRAFT_STEPS = [0, 10, 25, 50]

  const handleExportWorksheet = async () => {
    if (!projectId) return
    setWorksheetBusy(true)
    try {
      await dynomapperApi.downloadWorksheet(projectId, { body: deepAudit, drafts: draftCount })
      const extras = [deepAudit && "deep audit", draftCount > 0 && `${draftCount} drafts`].filter(Boolean).join(" + ")
      toast.success(`Worksheet exported (editable .xlsx${extras ? ` — ${extras}` : ""}).`)
    } catch (err) {
      toast.error(`Worksheet export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setWorksheetBusy(false)
    }
  }

  const handleRedirectFile = async (file: File) => {
    setRedirectBusy(true)
    setRedirectResult(null)
    try {
      const result = await dynomapperApi.redirectMap(file, true)
      setRedirectResult(result)
      // download the redirect CSV
      const blob = new Blob(["﻿" + result.csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "redirect-map.csv"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Redirect map: ${result.count} pairs${result.unresolved ? `, ${result.unresolved} unresolved` : ""}.`)
    } catch (err) {
      toast.error(`Redirect map failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRedirectBusy(false)
      if (redirectInputRef.current) redirectInputRef.current.value = ""
    }
  }

  const handleSyncFile = async (file: File) => {
    if (!projectId) return
    setSyncBusy(true)
    setSyncSummary(null)
    try {
      const { summary, filename, xlsxBase64 } = await dynomapperApi.syncWorksheet(file, projectId)
      setSyncSummary(summary)
      downloadBase64Xlsx(xlsxBase64, filename)
      toast.success(`Synced: ${summary.added} new, ${summary.removed} kept for redirects, ${summary.humanColumnsPreserved} edits preserved.`)
    } catch (err) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncBusy(false)
      if (syncInputRef.current) syncInputRef.current.value = ""
    }
  }

  // ── Load config + project list ──────────────────────────────
  useEffect(() => {
    if (!isAllowed) return
    ;(async () => {
      try {
        const [st, projs] = await Promise.all([dynomapperApi.status(), dynomapperApi.projects()])
        setStatus(st)
        setProjects(projs)
      } catch (err) {
        toast.error(`Failed to load DynoMapper: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setLoadingProjects(false)
      }
    })()
  }, [isAllowed])

  const loadMatrix = useCallback(async (id: number) => {
    setLoadingMatrix(true)
    setMatrix(null)
    setGeneratedFields([])
    try {
      const result = await dynomapperApi.matrix(id)
      setMatrix(result)
    } catch (err) {
      toast.error(`Failed to build matrix: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingMatrix(false)
    }
  }, [])

  const handleSelectProject = (id: number) => {
    setProjectId(id)
    loadMatrix(id)
  }

  const toggleField = (field: DynoAiField) => {
    setSelectedFields((prev) => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  // Rows that will actually be sent to the AI (scope control).
  const enrichTargetRows = useMemo(() => {
    if (!matrix) return []
    return onlyIssues ? matrix.rows.filter((r) => r.issueCount > 0) : matrix.rows
  }, [matrix, onlyIssues])

  const handleEnrich = async () => {
    if (!matrix || selectedFields.size === 0) return
    const fields = AI_FIELD_ORDER.filter((f) => selectedFields.has(f))
    const targets = enrichTargetRows
    if (targets.length === 0) {
      toast.error("No rows to enrich with the current scope.")
      return
    }
    setEnriching(true)
    try {
      const { enriched, count } = await dynomapperApi.enrich({
        rows: targets.map((r) => ({ url: r.url, title: r.title, type: r.type, issues: r.issues })),
        fields,
        domain: matrix.project.domain,
        projectTitle: matrix.project.title,
      })
      // Merge into matrix rows.
      setMatrix((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          rows: prev.rows.map((r) => {
            const cell = enriched[r.url]
            return cell ? { ...r, ai: { ...r.ai, ...cell } } : r
          }),
        }
      })
      // Union newly-generated fields into the visible set.
      setGeneratedFields((prev) => Array.from(new Set([...prev, ...fields])))
      toast.success(`Generated ${fields.length} column${fields.length > 1 ? "s" : ""} for ${count} pages.`)
    } catch (err) {
      toast.error(`AI enrichment failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnriching(false)
    }
  }

  const handleExport = () => {
    if (!matrix) return
    const csv = buildCsv(matrix.rows, generatedFields, status?.aiFields ?? {})
    const slug = (matrix.project.domain || matrix.project.title || "content-matrix")
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9.-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
    downloadCsv(`content-matrix-${slug}.csv`, csv)
  }

  // ── Access guard ────────────────────────────────────────────
  if (!isAllowed) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Lock className="text-slate-400" size={22} />
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Restricted</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              The Content Matrix is limited to a single account.
            </p>
            <Link to="/" className="inline-block mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Back home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const aiLabels: Record<string, string> = status?.aiFields ?? {}
  const notConfigured = status && !status.configured

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0"
            style={{ background: GRADIENT, boxShadow: "0 4px 12px rgba(99,102,241,0.35)" }}
          >
            <Table2 className="text-white" size={22} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Content Matrix</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Turn a DynoMapper crawl into a per-page remediation worksheet — export to CSV, with optional AI-drafted fixes.
            </p>
          </div>
        </div>

        {notConfigured && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>DynoMapper isn’t configured. Set <code className="font-mono text-xs">DYNOMAPPER_TOKEN</code> on the server.</span>
          </div>
        )}

        {/* Controls */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 sm:p-5 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex-1 min-w-[240px]">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Site</span>
              <div className="relative">
                <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={projectId ?? ""}
                  disabled={loadingProjects}
                  onChange={(e) => handleSelectProject(Number(e.target.value))}
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="" disabled>
                    {loadingProjects ? "Loading crawls…" : `Choose a site (${projects.length} crawled)`}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}{p.pages ? ` · ${p.pages} pages` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            {projectId && (
              <button
                onClick={() => loadMatrix(projectId)}
                disabled={loadingMatrix}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw size={15} className={loadingMatrix ? "animate-spin" : ""} />
                Refresh
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleExport}
                disabled={!matrix || matrix.rows.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={handleExportWorksheet}
                disabled={!projectId || worksheetBusy}
                title="Editable Stamats migration worksheet (.xlsx) — Site Tree, disposition, template, strategy notes"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {worksheetBusy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                Export Worksheet
              </button>
            </div>
          </div>

          {/* Migration worksheet options (deep audit + drafts) */}
          {matrix && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <FileSpreadsheet size={14} className="text-emerald-500" /> Worksheet
              </span>
              <button
                onClick={() => setDeepAudit((v) => !v)}
                title="Fetch each page's real content for Tone / Readability / Keywords / CTAs (slower)"
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  deepAudit
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                Deep audit (fetch pages)
              </button>
              <button
                onClick={() => setDraftCount((c) => DRAFT_STEPS[(DRAFT_STEPS.indexOf(c) + 1) % DRAFT_STEPS.length]!)}
                title="Generate first-pass AI drafts for the top N Write-New / Revise pages (Drafts tab)"
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  draftCount > 0
                    ? "bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-300"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                AI drafts: {draftCount === 0 ? "off" : draftCount}
              </button>
              {(deepAudit || draftCount > 0) && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Fetches page content — slower, higher cost
                </span>
              )}
            </div>
          )}

          {/* Migration worksheet sync + redirects */}
          {matrix && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <RotateCw size={14} className="text-emerald-500" /> Sync edited worksheet
                </span>
                <input
                  ref={syncInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleSyncFile(f)
                  }}
                />
                <button
                  onClick={() => syncInputRef.current?.click()}
                  disabled={syncBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm font-medium disabled:opacity-50"
                >
                  {syncBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {syncBusy ? "Merging…" : "Upload .xlsx to sync"}
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Re-crawls & merges your edits — human columns preserved, dropped URLs kept for redirects.
                </span>
              </div>
              {syncSummary && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    ["Total rows", syncSummary.total],
                    ["New pages", syncSummary.added],
                    ["Kept (redirects)", syncSummary.removed],
                    ["Edits preserved", syncSummary.humanColumnsPreserved],
                    ["Dispositions kept", syncSummary.dispositionsPreserved],
                  ].map(([label, n]) => (
                    <span key={label as string} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300">
                      {label} <strong>{n as number}</strong>
                    </span>
                  ))}
                </div>
              )}

              {/* Redirect map (Slice E) */}
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <RotateCw size={14} className="text-sky-500" /> Redirect map
                </span>
                <input
                  ref={redirectInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleRedirectFile(f)
                  }}
                />
                <button
                  onClick={() => redirectInputRef.current?.click()}
                  disabled={redirectBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-sm font-medium disabled:opacity-50"
                >
                  {redirectBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {redirectBusy ? "Building & verifying…" : "Upload filled worksheet → redirects"}
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Old→New from the New URL column; verifies each resolves; downloads CSV (.htaccess/nginx in the response).
                </span>
              </div>
              {redirectResult && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-900/25 text-sky-700 dark:text-sky-300">
                    Redirects <strong>{redirectResult.count}</strong>
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${redirectResult.unresolved ? "bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300"}`}>
                    Unresolved <strong>{redirectResult.unresolved}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* AI column toggles */}
          {matrix && status?.aiConfigured && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <Sparkles size={14} className="text-indigo-500" /> AI columns
                </span>
                {AI_FIELD_ORDER.map((f) => {
                  const on = selectedFields.has(f)
                  return (
                    <button
                      key={f}
                      onClick={() => toggleField(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        on
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300"
                          : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {aiLabels[f] ?? f}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyIssues}
                    onChange={(e) => setOnlyIssues(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  Only pages with issues ({enrichTargetRows.length})
                </label>
                <button
                  onClick={handleEnrich}
                  disabled={enriching || selectedFields.size === 0 || enrichTargetRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {enriching ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {enriching ? "Generating…" : "Generate AI columns"}
                </button>
                {status && enrichTargetRows.length > status.maxEnrichRows && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Capped at {status.maxEnrichRows} highest-priority pages
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Matrix */}
        {loadingMatrix && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}

        {matrix && !loadingMatrix && (
          <div className="space-y-3">
            {/* Summary bar */}
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {matrix.pageListReturned.toLocaleString()} pages
              </span>
              {matrix.truncated && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  (of {matrix.pageListTotal.toLocaleString()} crawled — all flagged pages included)
                </span>
              )}
              <span className="text-slate-300 dark:text-slate-600">·</span>
              {matrix.issueSummary.length === 0 ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">No issues found</span>
              ) : (
                matrix.issueSummary.slice(0, 8).map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    {s.label} <strong className="text-slate-900 dark:text-slate-100">{s.count}</strong>
                  </span>
                ))
              )}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-auto max-h-[68vh]">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2.5 min-w-[280px]">URL</th>
                      <th className="px-3 py-2.5 min-w-[200px]">Title</th>
                      <th className="px-3 py-2.5">Issues</th>
                      {generatedFields.map((f) => (
                        <th key={f} className="px-3 py-2.5 min-w-[200px] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Sparkles size={11} className="text-indigo-400" />
                            {aiLabels[f] ?? f}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r, i) => (
                      <tr
                        key={r.url + i}
                        className="border-b border-slate-100 dark:border-slate-800/70 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 align-top"
                      >
                        <td className="px-3 py-2 max-w-[340px]">
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline break-all text-xs"
                          >
                            {r.url}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs">
                          {r.title || <span className="text-slate-400 italic">(none)</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.issues.length === 0 ? (
                              <span className="text-emerald-500 text-xs">—</span>
                            ) : (
                              r.issues.map((iss) => (
                                <span
                                  key={iss}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-300 whitespace-nowrap"
                                >
                                  {iss}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        {generatedFields.map((f) => (
                          <td key={f} className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">
                            {r.ai?.[f] ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              AI drafts are inferred from URL, title, and issue flags — review before publishing. Native columns come straight from the DynoMapper crawl.
            </p>
          </div>
        )}

        {!matrix && !loadingMatrix && !loadingProjects && (
          <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-sm">
            Choose a site above to build its content matrix.
          </div>
        )}
      </div>
    </div>
  )
}

export default ContentMatrix
