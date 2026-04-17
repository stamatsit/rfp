/**
 * Modal for initiating polished-report generation from a scan result.
 * Collects client name + firm name (optional competitor URLs + screenshots),
 * streams generation progress via SSE, and on completion routes to the report view.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { X, Loader2, FileText, AlertCircle, CheckCircle2 } from "lucide-react"
import { addCsrfHeader } from "@/lib/csrfToken"

interface Props {
  isOpen: boolean
  onClose: () => void
  /** URL that was scanned — prefilled into the form. */
  scannedUrl: string
  /** Optional desktop screenshot URL to include in the report. */
  screenshotUrl?: string
  /** Optional mobile screenshot URL. */
  screenshotMobileUrl?: string
}

type Stage =
  | "scan"
  | "fetch-text"
  | "classify"
  | "vision"
  | "narrative"
  | "fact-check"
  | "assemble"

interface StageState {
  status: "pending" | "running" | "done" | "error"
  detail?: string
}

const STAGE_LABELS: Record<Stage, string> = {
  scan: "Scanning page",
  "fetch-text": "Reading page content",
  classify: "Classifying the site",
  vision: "Analyzing screenshots",
  narrative: "Writing polished copy",
  "fact-check": "Verifying numbers",
  assemble: "Assembling the report",
}

const STAGES: Stage[] = ["scan", "fetch-text", "classify", "vision", "narrative", "fact-check", "assemble"]

export function CreateReportModal({ isOpen, onClose, scannedUrl, screenshotUrl, screenshotMobileUrl }: Props) {
  const navigate = useNavigate()
  const [clientName, setClientName] = useState("")
  const [competitorUrls, setCompetitorUrls] = useState("")
  const [firmName, setFirmName] = useState("Stamats")
  const [firmLogoUrl, setFirmLogoUrl] = useState("screenshots/stamats-logo.png")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stages, setStages] = useState<Record<Stage, StageState>>(() =>
    Object.fromEntries(STAGES.map((s) => [s, { status: "pending" } as StageState])) as Record<Stage, StageState>,
  )
  const abortRef = useRef<AbortController | null>(null)

  // Default client name from hostname
  const defaultName = useMemo(() => {
    try {
      return new URL(scannedUrl).hostname.replace(/^www\./, "").split(".")[0]!.replace(/^\w/, (c) => c.toUpperCase())
    } catch {
      return ""
    }
  }, [scannedUrl])

  useEffect(() => {
    if (isOpen) {
      setClientName(defaultName)
      setError(null)
      setGenerating(false)
      setStages(Object.fromEntries(STAGES.map((s) => [s, { status: "pending" } as StageState])) as Record<Stage, StageState>)
    }
    return () => abortRef.current?.abort()
  }, [isOpen, defaultName])

  if (!isOpen) return null

  async function handleGenerate() {
    if (!clientName.trim()) {
      setError("Client name is required")
      return
    }
    setError(null)
    setGenerating(true)

    const controller = new AbortController()
    abortRef.current = controller

    const body = {
      url: scannedUrl,
      clientName: clientName.trim(),
      clientShortName: clientName.trim().split(" ")[0],
      competitorUrls: competitorUrls
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean),
      firmName: firmName.trim() || "Stamats",
      firmLogoUrl: firmLogoUrl.trim() || "screenshots/stamats-logo.png",
      screenshots: screenshotUrl ? { desktop: screenshotUrl, mobile: screenshotMobileUrl } : undefined,
    }

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: await addCsrfHeader({ "Content-Type": "application/json" }),
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "")
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events separated by blank lines
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""

        for (const event of events) {
          const line = event.split("\n").find((l) => l.startsWith("data: "))
          if (!line) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.step === "complete" && data.slug) {
              navigate(`/reports/${data.slug}`)
              return
            }
            if (data.step === "error") {
              throw new Error(data.message || "Generation failed")
            }
            if (data.step && STAGES.includes(data.step as Stage)) {
              setStages((prev) => ({
                ...prev,
                [data.step]: { status: data.status === "done" ? "done" : data.status === "error" ? "error" : "running", detail: data.detail },
              }))
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Generation failed") {
              console.warn("SSE parse:", parseErr)
            } else {
              throw parseErr
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return
      console.error(err)
      setError(err?.message ?? "Generation failed")
      setGenerating(false)
    }
  }

  function handleClose() {
    if (generating) {
      abortRef.current?.abort()
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={() => !generating && handleClose()}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create Client Report</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Turns this scan into a polished gap analysis.</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" disabled={generating}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!generating && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Client name <span className="text-red-500">*</span>
                </label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Coe College"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Firm name</label>
                <input
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Firm logo path</label>
                <input
                  value={firmLogoUrl}
                  onChange={(e) => setFirmLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Competitor URLs <span className="text-slate-400 font-normal">(optional, one per line)</span>
                </label>
                <textarea
                  value={competitorUrls}
                  onChange={(e) => setCompetitorUrls(e.target.value)}
                  rows={3}
                  placeholder="https://peer1.edu&#10;https://peer2.edu"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                Generation takes <strong>60–120 seconds</strong>. Includes scan, site classification, screenshot analysis, and LLM-written copy.
              </div>
            </>
          )}

          {generating && (
            <div className="space-y-2.5">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Generating polished report for <strong>{clientName}</strong>…
              </p>
              {STAGES.map((s) => {
                const state = stages[s]
                const isRunning = state.status === "running"
                const isDone = state.status === "done"
                const isError = state.status === "error"
                return (
                  <div key={s} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {isRunning && <Loader2 size={14} className="text-indigo-500 animate-spin" />}
                      {isDone && <CheckCircle2 size={16} className="text-emerald-500" />}
                      {isError && <AlertCircle size={16} className="text-red-500" />}
                      {state.status === "pending" && <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />}
                    </div>
                    <span
                      className={
                        isDone
                          ? "text-slate-500 dark:text-slate-400"
                          : isRunning
                            ? "text-slate-900 dark:text-white font-medium"
                            : isError
                              ? "text-red-500"
                              : "text-slate-400 dark:text-slate-500"
                      }
                    >
                      {STAGE_LABELS[s]}
                    </span>
                    {state.detail && isRunning && (
                      <span className="text-xs text-slate-400">— {state.detail}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={handleClose}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          {!generating && (
            <button
              onClick={handleGenerate}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <FileText size={14} />
              Generate Report
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
