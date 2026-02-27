/**
 * StudioHumanizerPanel — Humanize the current document directly inside Document Studio.
 *
 * Slides in as a right-side panel (320px). Takes the editor's plain text, streams
 * through /api/humanizer/stream, shows live preview + AI score, and lets the user
 * apply the result back to the document with a single click.
 */

import { useState, useRef, useCallback, useEffect } from "react"
import {
  X, Wand2, Search, Loader2, Check, Copy, ChevronDown, Zap,
  BookOpen, MessageSquare, RefreshCw, AlertTriangle,
} from "lucide-react"
import { fetchSSE } from "@/lib/api"
import { markdownToHtml } from "@/lib/markdownToHtml"

// ── Types ─────────────────────────────────────────────────────

type HumanizeTone = "professional" | "conversational" | "academic"
type HumanizeStrength = "light" | "balanced" | "heavy"
type HumanizeMode = "humanize" | "scan"

interface StudioHumanizerPanelProps {
  /** Raw HTML content of the current document */
  documentContent: string
  /** Called when user applies the humanized result — receives HTML */
  onApply: (html: string) => void
  /** Close the panel */
  onClose: () => void
}

// ── Score chip ────────────────────────────────────────────────

function HumanScoreChip({ score }: { score: number }) {
  const isGood = score >= 80
  const isMid = score >= 60
  const color = isGood
    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
    : isMid
    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-amber-200 dark:border-amber-700"
    : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
  const label = isGood ? "Human" : isMid ? "Partial" : "AI"
  const ringColor = isGood ? "#10b981" : isMid ? "#f59e0b" : "#ef4444"
  const dash = (score / 100) * 2 * Math.PI * 7 // radius = 7
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${color}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
        <circle
          cx="8" cy="8" r="7" fill="none"
          stroke={ringColor} strokeWidth="2"
          strokeDasharray={`${dash} 100`}
          strokeLinecap="round"
          transform="rotate(-90 8 8)"
        />
      </svg>
      {label} · {score}%
    </div>
  )
}

// ── Tone selector ─────────────────────────────────────────────

const TONES: { value: HumanizeTone; label: string; icon: React.ElementType }[] = [
  { value: "professional", label: "Professional", icon: BookOpen },
  { value: "conversational", label: "Conversational", icon: MessageSquare },
  { value: "academic", label: "Academic", icon: BookOpen },
]

const STRENGTHS: { value: HumanizeStrength; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "~20-30% changed" },
  { value: "balanced", label: "Balanced", desc: "~50-60% changed" },
  { value: "heavy", label: "Heavy", desc: "Full rewrite" },
]

// ── Main panel ────────────────────────────────────────────────

export function StudioHumanizerPanel({
  documentContent,
  onApply,
  onClose,
}: StudioHumanizerPanelProps) {
  const [mode, setMode] = useState<HumanizeMode>("humanize")
  const [tone, setTone] = useState<HumanizeTone>("professional")
  const [strength, setStrength] = useState<HumanizeStrength>("balanced")

  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [humanScore, setHumanScore] = useState<number | undefined>()
  const [aiFlags, setAiFlags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  // Close settings popover on outside click
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [settingsOpen])

  // Extract plain text from the document HTML
  const getPlainText = useCallback(() => {
    const div = document.createElement("div")
    div.innerHTML = documentContent
    return div.textContent || div.innerText || ""
  }, [documentContent])

  const wordCount = (() => {
    const plain = getPlainText()
    return plain.trim() ? plain.trim().split(/\s+/).length : 0
  })()

  const resultWordCount = result
    ? result.trim().split(/\s+/).filter(Boolean).length
    : 0

  const wordCountDelta = result ? resultWordCount - wordCount : null

  const handleRun = useCallback(async () => {
    const plainText = getPlainText()
    if (!plainText.trim()) return
    if (plainText.length > 15000) {
      setError("Document is too long. Maximum 15,000 characters (~2,500 words).")
      return
    }

    setIsStreaming(true)
    setStreamingText("")
    setResult(null)
    setHumanScore(undefined)
    setAiFlags([])
    setError(null)
    setSettingsOpen(false)

    abortRef.current = new AbortController()
    let accumulated = ""

    try {
      await fetchSSE(
        "/humanizer/stream",
        {
          text: plainText,
          tone,
          strength,
          twoPass: false,
          scanOnly: mode === "scan",
        },
        {
          onToken(token) {
            accumulated += token
            setStreamingText(accumulated)
          },
          onDone(data) {
            // Server sends: { cleanResponse, followUpPrompts, metadata: { humanScore, aiFlags } }
            const d = data as {
              cleanResponse?: string
              metadata?: { humanScore?: number; aiFlags?: string[] }
            }
            const clean = d.cleanResponse ?? accumulated
            const score = d.metadata?.humanScore
            const flags = d.metadata?.aiFlags ?? []

            setResult(clean)
            setStreamingText("")
            if (score !== undefined) setHumanScore(score)
            setAiFlags(flags)
            setIsStreaming(false)
          },
          onError(msg) {
            setError(msg)
            setIsStreaming(false)
          },
        },
        abortRef.current.signal
      )
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Failed to process document")
      }
      setIsStreaming(false)
    }
  }, [getPlainText, tone, strength, mode])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const handleApply = useCallback(() => {
    if (!result) return
    // Convert plain text paragraphs to HTML
    const html = markdownToHtml(result)
    onApply(html)
  }, [result, onApply])

  const handleCopy = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [result])

  const hasDoc = wordCount > 0

  return (
    <div className="w-[300px] flex-shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200/50 dark:border-slate-800/80 animate-inspector-in overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-100/80 dark:border-slate-800/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" }}>
            <Wand2 className="w-2.5 h-2.5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 tracking-tight">Humanizer</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Settings popover */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className={`flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-medium transition-colors ${
                settingsOpen
                  ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title="Humanizer settings"
            >
              {TONES.find((t) => t.value === tone)?.label ?? tone}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden animate-fade-in-up p-2 space-y-2">
                {/* Mode */}
                <div>
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-1">Mode</p>
                  <div className="flex bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5 gap-0.5">
                    {([
                      { value: "humanize" as HumanizeMode, label: "Rewrite", icon: Wand2 },
                      { value: "scan" as HumanizeMode, label: "Scan", icon: Search },
                    ]).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setMode(value)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded-md transition-all ${
                          mode === value
                            ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        <Icon className="w-2.5 h-2.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                {mode === "humanize" && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-1">Tone</p>
                    <div className="space-y-0.5">
                      {TONES.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setTone(value)}
                          className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] transition-colors ${
                            tone === value
                              ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                          }`}
                        >
                          {label}
                          {tone === value && <Check className="w-2.5 h-2.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strength */}
                {mode === "humanize" && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-1">Strength</p>
                    <div className="space-y-0.5">
                      {STRENGTHS.map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setStrength(value)}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors ${
                            strength === value
                              ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{label}</span>
                            {strength === value && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            title="Close humanizer"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Document info strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          {wordCount > 0 ? `${wordCount.toLocaleString()} words in document` : "No document content"}
        </span>
        {humanScore !== undefined && <HumanScoreChip score={humanScore} />}
      </div>

      {/* Streaming progress bar */}
      {isStreaming && (
        <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden">
          <div
            className="h-full rounded-full animate-progress-indeterminate"
            style={{ background: "linear-gradient(90deg, #8b5cf6, #6d28d9, #8b5cf6)", backgroundSize: "200% 100%" }}
          />
        </div>
      )}

      {/* Content area */}
      <div ref={resultRef} className="flex-1 overflow-y-auto min-h-0">
        {!hasDoc ? (
          <div className="flex flex-col items-center justify-center h-full px-5 text-center">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3 opacity-30"
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)" }}>
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed max-w-[180px]">
              Add content to your document first, then humanize it.
            </p>
          </div>
        ) : isStreaming ? (
          <div className="px-3 py-3">
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
              {mode === "scan" ? "Scanning for AI patterns…" : "Rewriting…"}
            </div>
            <div className="text-[12px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {streamingText || (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-md w-full" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-md w-5/6" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-md w-full" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-md w-4/5" />
                </div>
              )}
              {streamingText && (
                <span className="inline-block w-[2px] h-[1em] bg-amber-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              )}
            </div>
          </div>
        ) : error ? (
          <div className="px-3 py-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">{error}</p>
            </div>
          </div>
        ) : result ? (
          <div className="px-3 py-3 space-y-2">
            {/* Result meta */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Wand2 className="w-2.5 h-2.5" />
                {mode === "scan" ? "Scan Results" : "Humanized"}
              </span>
              <div className="flex items-center gap-1">
                {wordCountDelta !== null && wordCountDelta !== 0 && (
                  <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
                    wordCountDelta < 0
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                  }`}>
                    {wordCountDelta > 0 ? "+" : ""}{wordCountDelta} words
                  </span>
                )}
                <button
                  onClick={handleCopy}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Copy result"
                >
                  {copied ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                </button>
              </div>
            </div>

            {/* Result text */}
            <div className="rounded-xl border border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-900/5 p-3">
              <p className="text-[12px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {result}
              </p>
            </div>

            {/* AI flags */}
            {aiFlags.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Remaining AI Patterns</p>
                {aiFlags.slice(0, 4).map((flag, i) => (
                  <div key={i} className="flex items-start gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">{flag}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full px-5 text-center">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)" }}>
              <Wand2 className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              {mode === "scan" ? "Scan for AI patterns" : "Humanize your document"}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed max-w-[200px]">
              {mode === "scan"
                ? "Score your document for AI detectability and get specific feedback."
                : "Rewrite AI-generated text to sound naturally human and pass AI detectors."}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-4">
              {[
                { label: "Light touch", icon: Zap, action: () => { setStrength("light"); setMode("humanize") } },
                { label: "Balanced", icon: Wand2, action: () => { setStrength("balanced"); setMode("humanize") } },
                { label: "Scan first", icon: Search, action: () => setMode("scan") },
              ].map(({ label, icon: Icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <Icon className="w-2.5 h-2.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
        {isStreaming ? (
          <button
            onClick={handleCancel}
            className="w-full flex items-center justify-center gap-1.5 h-8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        ) : result && mode === "humanize" ? (
          <>
            <button
              onClick={handleApply}
              className="w-full flex items-center justify-center gap-1.5 h-8 text-[11px] font-semibold text-white rounded-lg transition-all shadow-sm hover:opacity-90 active:opacity-75"
              style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" }}
            >
              <Check className="w-3 h-3" />
              Apply to Document
            </button>
            <button
              onClick={handleRun}
              disabled={!hasDoc}
              className="w-full flex items-center justify-center gap-1.5 h-7 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Rewrite Again
            </button>
          </>
        ) : (
          <button
            onClick={handleRun}
            disabled={!hasDoc || isStreaming}
            className="w-full flex items-center justify-center gap-1.5 h-8 text-[11px] font-semibold text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:opacity-90 active:opacity-75"
            style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" }}
          >
            {mode === "scan"
              ? <><Search className="w-3 h-3" /> Scan Document</>
              : <><Wand2 className="w-3 h-3" /> Humanize Document</>}
          </button>
        )}
      </div>
    </div>
  )
}
