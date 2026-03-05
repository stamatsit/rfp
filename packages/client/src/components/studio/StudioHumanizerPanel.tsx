/**
 * StudioHumanizerPanel — Humanize the current document directly inside Document Studio.
 *
 * Full-power humanizer in a 300px side panel: all 5 tones, audience, persona/voice,
 * two-pass, refine bar with presets + freeform instructions.
 */

import { useState, useRef, useCallback, useEffect } from "react"
import {
  X, Wand2, Search, Loader2, Check, Copy, ChevronDown, Zap,
  BookOpen, MessageSquare, RefreshCw, AlertTriangle, Pen, Send,
  User, Settings2,
} from "lucide-react"
import { fetchSSE } from "@/lib/api"
import { addCsrfHeader } from "@/lib/csrfToken"
import { markdownToHtml } from "@/lib/markdownToHtml"

// ── Types ─────────────────────────────────────────────────────

type HumanizeTone = "professional" | "conversational" | "academic" | "thompson" | "wallace"
type HumanizeStrength = "light" | "balanced" | "heavy"
type HumanizeMode = "humanize" | "scan"
type HumanizeAudience = "general" | "executive" | "technical" | "academic"

interface PersonaSample {
  id: string
  label: string
  charCount: number
}

interface StudioHumanizerPanelProps {
  documentContent: string
  onApply: (html: string) => void
  onClose: () => void
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

// ── Score chip ────────────────────────────────────────────────

function HumanScoreChip({ score }: { score: number }) {
  const isGood = score >= 80
  const isMid = score >= 60
  const color = isGood
    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
    : isMid
    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
    : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
  const label = isGood ? "Human" : isMid ? "Partial" : "AI"
  const ringColor = isGood ? "#10b981" : isMid ? "#f59e0b" : "#ef4444"
  const dash = (score / 100) * 2 * Math.PI * 7
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

// ── Constants ─────────────────────────────────────────────────

const TONES: { value: HumanizeTone; label: string; icon: React.ElementType }[] = [
  { value: "professional", label: "Professional", icon: BookOpen },
  { value: "conversational", label: "Conversational", icon: MessageSquare },
  { value: "academic", label: "Academic", icon: BookOpen },
  { value: "thompson", label: "Gonzo", icon: Zap },
  { value: "wallace", label: "Literary", icon: Pen },
]

const STRENGTHS: { value: HumanizeStrength; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "~20-30% changed" },
  { value: "balanced", label: "Balanced", desc: "~50-60% changed" },
  { value: "heavy", label: "Heavy", desc: "Full rewrite" },
]

const AUDIENCES: { value: HumanizeAudience; label: string; desc: string }[] = [
  { value: "general", label: "General", desc: "Grade 8 reading" },
  { value: "executive", label: "Executive", desc: "Brief, outcomes" },
  { value: "technical", label: "Technical", desc: "Domain precision" },
  { value: "academic", label: "Academic", desc: "Careful qualify" },
]

const REFINE_PRESETS = [
  { label: "More Casual", icon: MessageSquare, prompt: "Make it more casual and conversational" },
  { label: "Shorten", icon: Zap, prompt: "Make it shorter while keeping the key points" },
  { label: "More Formal", icon: BookOpen, prompt: "Make it more formal and polished" },
  { label: "Rewrite Again", icon: RefreshCw, prompt: "Do another full rewrite pass. There are still some AI-sounding phrases." },
]

// ── Main panel ────────────────────────────────────────────────

export function StudioHumanizerPanel({
  documentContent,
  onApply,
  onClose,
}: StudioHumanizerPanelProps) {
  // Settings
  const [mode, setMode] = useState<HumanizeMode>("humanize")
  const [tone, setTone] = useState<HumanizeTone>("professional")
  const [strength, setStrength] = useState<HumanizeStrength>("balanced")
  const [audience, setAudience] = useState<HumanizeAudience>("general")
  const [twoPass, setTwoPass] = useState(false)
  const [voiceSample, setVoiceSample] = useState("")

  // Persona
  const [personaSamples, setPersonaSamples] = useState<PersonaSample[]>([])
  const [personaLoaded, setPersonaLoaded] = useState(false)

  // Stream state
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [humanScore, setHumanScore] = useState<number | undefined>()
  const [aiFlags, setAiFlags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // UI
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refineInput, setRefineInput] = useState("")

  const abortRef = useRef<AbortController | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const refineTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Load persona on mount
  useEffect(() => {
    (async () => {
      try {
        const headers = await addCsrfHeader({})
        const resp = await fetch(`${API_BASE}/humanizer/persona`, { credentials: "include", headers: headers as HeadersInit })
        if (resp.ok) {
          const data = await resp.json()
          setPersonaSamples(data.samples || [])
        }
      } catch { /* ignore */ }
      setPersonaLoaded(true)
    })()
  }, [])

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

  // Auto-resize refine textarea
  useEffect(() => {
    const el = refineTextareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [refineInput])

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

  const hasPersona = personaSamples.length > 0

  // ── Run humanize/scan ──────────────────────────────────────

  const handleRun = useCallback(async (refineInstruction?: string) => {
    const plainText = getPlainText()
    if (!plainText.trim() && !refineInstruction) return
    if (plainText.length > 15000 && !refineInstruction) {
      setError("Document is too long. Maximum 15,000 characters (~2,500 words).")
      return
    }

    setIsStreaming(true)
    setStreamingText("")
    if (!refineInstruction) {
      setResult(null)
      setHumanScore(undefined)
      setAiFlags([])
    }
    setError(null)
    setSettingsOpen(false)

    abortRef.current = new AbortController()
    let accumulated = ""

    // Build request body
    let text = plainText
    if (refineInstruction && result) {
      text = `[REFINE]\n\nCURRENT DOCUMENT:\n${result}\n\nINSTRUCTION: ${refineInstruction}`
    }

    try {
      await fetchSSE(
        "/humanizer/stream",
        {
          text,
          tone,
          strength,
          twoPass,
          scanOnly: mode === "scan",
          audience,
          voiceSample: voiceSample.trim() || undefined,
        },
        {
          onToken(token) {
            accumulated += token
            setStreamingText(accumulated)
          },
          onDone(data) {
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
  }, [getPlainText, tone, strength, mode, twoPass, audience, voiceSample, result])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const handleApply = useCallback(() => {
    if (!result) return
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

  const handleRefineSubmit = useCallback((prompt?: string) => {
    const instruction = prompt || refineInput.trim()
    if (!instruction) return
    setRefineInput("")
    handleRun(instruction)
  }, [refineInput, handleRun])

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
          {/* Settings popover trigger */}
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
              <Settings2 className="w-3 h-3" />
              <ChevronDown className="w-2.5 h-2.5" />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden animate-fade-in-up p-2 space-y-2 max-h-[70vh] overflow-y-auto">

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
                      {TONES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setTone(value)}
                          className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors ${
                            tone === value
                              ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                          }`}
                        >
                          <Icon className={`w-3 h-3 flex-shrink-0 ${tone === value ? "text-violet-500" : "text-slate-400"}`} />
                          {label}
                          {tone === value && <Check className="w-2.5 h-2.5 ml-auto" />}
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

                {/* Audience */}
                {mode === "humanize" && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-1">Audience</p>
                    <div className="grid grid-cols-2 gap-0.5">
                      {AUDIENCES.map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setAudience(value)}
                          className={`text-left px-2 py-1.5 rounded-md text-[10px] transition-colors ${
                            audience === value
                              ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                          }`}
                        >
                          <span className="font-medium block">{label}</span>
                          <span className="text-[8px] text-slate-400 dark:text-slate-500">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Two-pass toggle */}
                {mode === "humanize" && (
                  <div className="flex items-center justify-between px-1 py-1">
                    <div>
                      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">Two-pass</span>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500">Rewrite → score → rewrite</p>
                    </div>
                    <button
                      onClick={() => setTwoPass(!twoPass)}
                      className={`relative w-8 h-4.5 rounded-full transition-all duration-200 ${
                        twoPass
                          ? "bg-amber-500 shadow-inner shadow-amber-600/30"
                          : "bg-slate-200 dark:bg-slate-700"
                      }`}
                      style={{ width: 32, height: 18 }}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${twoPass ? "translate-x-3.5" : ""}`}
                        style={{ width: 14, height: 14 }}
                      />
                    </button>
                  </div>
                )}

                {/* Persona indicator */}
                {personaLoaded && (
                  <div className="px-1 py-1">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {hasPersona
                          ? `${personaSamples.length} persona sample${personaSamples.length !== 1 ? "s" : ""} active`
                          : "No persona — set up in Humanizer page"}
                      </span>
                      {hasPersona && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                    </div>
                  </div>
                )}

                {/* Voice override */}
                {mode === "humanize" && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-1">
                      Quick Voice Override
                    </p>
                    <textarea
                      value={voiceSample}
                      onChange={(e) => setVoiceSample(e.target.value.slice(0, 500))}
                      placeholder="Paste 1-2 sentences in a different voice..."
                      rows={2}
                      className="w-full px-2 py-1.5 text-[10px] rounded-lg border border-slate-200 dark:border-slate-700
                        bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300
                        placeholder:text-slate-300 dark:placeholder:text-slate-600
                        focus:outline-none focus:border-amber-400 resize-none transition-all"
                    />
                    <div className="text-right text-[9px] text-slate-300 dark:text-slate-600 mt-0.5">
                      {voiceSample.length}/500
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            {wordCount > 0 ? `${wordCount.toLocaleString()} words` : "No content"}
          </span>
          {/* Active settings pills */}
          {mode === "humanize" && (
            <div className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {TONES.find(t => t.value === tone)?.label}
              </span>
              {twoPass && (
                <span className="px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  2-pass
                </span>
              )}
            </div>
          )}
        </div>
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
              {mode === "scan" ? "Scanning for AI patterns…" : twoPass ? "Rewriting (two-pass)…" : "Rewriting…"}
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
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">AI Patterns</p>
                {aiFlags.slice(0, 4).map((flag, i) => (
                  <div key={i} className="flex items-start gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">{flag}</span>
                  </div>
                ))}
                {aiFlags.length > 4 && (
                  <span className="text-[9px] text-slate-400 px-2">+{aiFlags.length - 4} more</span>
                )}
                <button
                  onClick={() => handleRefineSubmit("Fix the AI patterns you flagged. Focus on the specific issues and rewrite only those sections.")}
                  disabled={isStreaming}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg
                    bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300
                    border border-amber-200 dark:border-amber-700
                    hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all
                    disabled:opacity-40"
                >
                  <Wand2 className="w-2.5 h-2.5" />
                  Fix These Issues
                </button>
              </div>
            )}

            {/* Refine presets */}
            {mode === "humanize" && (
              <div className="flex flex-wrap gap-1 pt-1">
                {REFINE_PRESETS.map(({ label, icon: Icon, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleRefineSubmit(prompt)}
                    disabled={isStreaming}
                    className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium whitespace-nowrap rounded-full
                      bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400
                      border border-slate-200/80 dark:border-slate-700/80
                      hover:border-amber-300 dark:hover:border-amber-600
                      hover:text-amber-700 dark:hover:text-amber-300
                      hover:bg-amber-50 dark:hover:bg-amber-900/20
                      transition-all disabled:opacity-40"
                  >
                    <Icon className="w-2 h-2" />
                    {label}
                  </button>
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

      {/* Footer — action buttons + refine bar */}
      <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800">
        {/* Refine bar — only after result */}
        {result && mode === "humanize" && !isStreaming && (
          <div className="px-3 pt-2 flex items-end gap-1.5">
            <textarea
              ref={refineTextareaRef}
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleRefineSubmit()
                }
              }}
              placeholder="Refine: 'Fix paragraph 2', 'Add personality'..."
              rows={1}
              className="flex-1 px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white
                placeholder:text-slate-400 dark:placeholder:text-slate-500
                focus:outline-none focus:border-amber-400 dark:focus:border-amber-500
                resize-none transition-all"
              style={{ minHeight: 28, maxHeight: 80 }}
            />
            <button
              onClick={() => handleRefineSubmit()}
              disabled={!refineInput.trim()}
              className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg
                bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600
                text-white disabled:opacity-40 transition-all shadow-sm"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-3 pb-3 pt-2 space-y-1.5">
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
                onClick={() => handleRun()}
                disabled={!hasDoc}
                className="w-full flex items-center justify-center gap-1.5 h-7 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Start Fresh
              </button>
            </>
          ) : (
            <button
              onClick={() => handleRun()}
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
    </div>
  )
}
