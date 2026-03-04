/**
 * AI Humanizer — Workspace for rewriting AI-generated text to sound naturally human.
 *
 * Admin-only. Two-pane workspace: original input (left) + humanized output (right).
 * Supports word-level diff view, paragraph-level rewrite, sentence-level rewrite,
 * version history, score history strip, per-paragraph scores, and a refine bar.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react"
import { Navigate, useSearchParams, useNavigate } from "react-router-dom"
import {
  Pen,
  Wand2,
  Zap,
  BookOpen,
  MessageSquare,
  Upload,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Copy,
  Check,
  Undo2,
  Redo2,
  GitCompare,
  FileText,
  Send,
  History,
  ChevronDown,
  Plus,
  ArrowLeft,
  Settings2,
  Download,
  Clock,
  X,
  Trash2,
  User,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { ChatHistorySidebar } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { useIsAdmin } from "@/contexts/AuthContext"
import { CHAT_THEMES } from "@/types/chat"
import { addCsrfHeader } from "@/lib/csrfToken"
import { fetchSSE } from "@/lib/api"
import { toast } from "@/hooks/useToast"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

const theme = CHAT_THEMES.amber

type Mode = "humanize" | "scan"
type Tone = "professional" | "conversational" | "academic" | "thompson" | "wallace"
type Strength = "light" | "balanced" | "heavy"
type Audience = "general" | "executive" | "technical" | "academic"
type ViewMode = "clean" | "diff"

interface PersonaSample {
  id: string
  label: string
  sourceType: "upload" | "paste"
  originalFilename?: string | null
  charCount: number
  createdAt: string
}

interface PersonaState {
  samples: PersonaSample[]
  totalChars: number
  budget: number
  loading: boolean
}

// ─── Word Diff Algorithm ─────────────────────────────────────

interface DiffToken {
  type: "equal" | "added" | "removed"
  text: string
}

function paragraphFallbackDiff(original: string, revised: string): DiffToken[] {
  const origParas = original.split(/\n\n+/)
  const revParas = revised.split(/\n\n+/)
  const result: DiffToken[] = []
  const len = Math.max(origParas.length, revParas.length)
  for (let i = 0; i < len; i++) {
    const o = origParas[i]
    const r = revParas[i]
    if (o === r) {
      result.push({ type: "equal", text: o ?? "" })
    } else if (o && !r) {
      result.push({ type: "removed", text: o })
    } else if (!o && r) {
      result.push({ type: "added", text: r })
    } else {
      result.push({ type: "removed", text: o ?? "" })
      result.push({ type: "added", text: r ?? "" })
    }
    if (i < len - 1) result.push({ type: "equal", text: "\n\n" })
  }
  return result
}

function wordDiff(original: string, revised: string): DiffToken[] {
  const tokenize = (t: string) => t.match(/\S+|\s+/g) ?? []
  const a = tokenize(original)
  const b = tokenize(revised)

  if (a.length > 1000 || b.length > 1000) {
    return paragraphFallbackDiff(original, revised)
  }

  const m = a.length
  const n = b.length

  const lcs: number[][] = Array(m + 1)
    .fill(null)
    .map(() => new Array(n + 1).fill(0) as number[])

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i]![j] =
        a[i - 1] === b[j - 1]
          ? lcs[i - 1]![j - 1]! + 1
          : Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!)
    }
  }

  const result: DiffToken[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "equal", text: a[i - 1]! })
      i--
      j--
    } else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
      result.unshift({ type: "added", text: b[j - 1]! })
      j--
    } else {
      result.unshift({ type: "removed", text: a[i - 1]! })
      i--
    }
  }
  return result
}

// ─── Parse result from useChat ───────────────────────────────

const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  metadata: data.metadata as Record<string, unknown> | undefined,
})

// ─── Score color helpers ─────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-500"
  if (score >= 50) return "bg-amber-500"
  return "bg-red-500"
}

// ─── WorkspaceControlsBar ────────────────────────────────────

function WorkspaceControlsBar({
  mode,
  viewMode, onViewModeChange,
  hasDoc, hasOriginal,
  canUndo, onUndo,
  canRedo, onRedo,
  versionLabel,
  onNewDocument,
  scoreHistory,
  sidebarOpen, onToggleSidebar,
  personaSidebarOpen, onTogglePersonaSidebar,
  hasPersona,
}: {
  mode: Mode
  viewMode: ViewMode; onViewModeChange: (v: ViewMode) => void
  hasDoc: boolean; hasOriginal: boolean
  canUndo: boolean; onUndo: () => void
  canRedo: boolean; onRedo: () => void
  versionLabel: string
  onNewDocument: () => void
  scoreHistory: Array<{ version: number; score: number }>
  sidebarOpen: boolean; onToggleSidebar: () => void
  personaSidebarOpen: boolean; onTogglePersonaSidebar: () => void
  hasPersona: boolean
}) {
  return (
    <div className="border-b border-slate-200/60 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm flex-shrink-0">
      <div className="px-4 h-10 flex items-center gap-2">

        {/* History toggle — left side, matches Settings button style */}
        <button
          onClick={onToggleSidebar}
          title="Conversation history"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
            ${sidebarOpen
              ? "bg-amber-500 text-white shadow-sm shadow-amber-500/25"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 border border-slate-200 dark:border-slate-700"
            }`}
        >
          <History size={13} />
          History
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Score history dots */}
        {scoreHistory.length > 1 && (
          <div className="flex items-center gap-1 mr-2">
            {scoreHistory.map((h, i) => (
              <ScoreHistoryDot key={i} version={h.version} score={h.score} />
            ))}
          </div>
        )}

        {/* Diff toggle — only when we have both panes */}
        {hasDoc && hasOriginal && (
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5">
            <button
              onClick={() => onViewModeChange("clean")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200
                ${viewMode === "clean"
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-sm"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"}`}
            >
              <FileText size={9} /> Clean
            </button>
            <button
              onClick={() => onViewModeChange("diff")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200
                ${viewMode === "diff"
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-sm"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"}`}
            >
              <GitCompare size={9} /> Diff
            </button>
          </div>
        )}

        {/* Version undo/redo */}
        {hasDoc && (
          <>
            {hasDoc && hasOriginal && <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />}
            <div className="flex items-center gap-0.5">
              <button
                onClick={onUndo} disabled={!canUndo}
                title="Undo — ⌘Z"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                           hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"
              >
                <Undo2 size={12} />
              </button>
              <span className="text-[11px] text-slate-400 tabular-nums px-0.5 min-w-[32px] text-center">{versionLabel}</span>
              <button
                onClick={onRedo} disabled={!canRedo}
                title="Redo — ⌘Y"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                           hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"
              >
                <Redo2 size={12} />
              </button>
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={onNewDocument}
              title="New document"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                         hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <Plus size={13} />
            </button>
          </>
        )}

        {/* Sidebar toggle — prominent button */}
        {mode === "humanize" && (
          <>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={onTogglePersonaSidebar}
              title="Settings & writing persona"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                ${personaSidebarOpen
                  ? "bg-amber-500 text-white shadow-sm shadow-amber-500/25"
                  : hasPersona
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 border border-slate-200 dark:border-slate-700"
                }`}
            >
              <Settings2 size={13} />
              Settings
              {hasPersona && !personaSidebarOpen && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── PersonaSidebar ────────────────────────────────────────────

function PersonaSidebar({
  persona, onAddPasteSample, onUploadSample, onDeleteSample, onRenameSample,
  tone, onToneChange,
  strength, onStrengthChange,
  twoPass, onTwoPassChange,
  audience, onAudienceChange,
  voiceSample, onVoiceSampleChange,
}: {
  persona: PersonaState
  onAddPasteSample: (text: string, label: string) => Promise<void>
  onUploadSample: (file: File) => Promise<void>
  onDeleteSample: (id: string) => Promise<void>
  onRenameSample: (id: string, label: string) => Promise<void>
  tone: Tone; onToneChange: (t: Tone) => void
  strength: Strength; onStrengthChange: (s: Strength) => void
  twoPass: boolean; onTwoPassChange: (v: boolean) => void
  audience: Audience; onAudienceChange: (a: Audience) => void
  voiceSample: string; onVoiceSampleChange: (v: string) => void
}) {
  const personaFileRef = useRef<HTMLInputElement>(null)
  const [pastePanelOpen, setPastePanelOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasteLabel, setPasteLabel] = useState("")
  const [savingPaste, setSavingPaste] = useState(false)
  const [uploadingSample, setUploadingSample] = useState(false)
  const [quickOverrideOpen, setQuickOverrideOpen] = useState(false)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingLabelText, setEditingLabelText] = useState("")

  const AUDIENCES: { value: Audience; label: string; desc: string }[] = [
    { value: "general", label: "General", desc: "Grade 8 reading level" },
    { value: "executive", label: "Executive", desc: "Outcome-focused, brief" },
    { value: "technical", label: "Technical", desc: "Domain precision OK" },
    { value: "academic", label: "Academic", desc: "Careful qualification" },
  ]

  const TONES: { value: Tone; label: string; icon: typeof Pen }[] = [
    { value: "professional", label: "Professional", icon: BookOpen },
    { value: "conversational", label: "Conversational", icon: MessageSquare },
    { value: "academic", label: "Academic", icon: Search },
    { value: "thompson", label: "Gonzo", icon: Zap },
    { value: "wallace", label: "Literary", icon: Pen },
  ]

  const STRENGTHS: { value: Strength; label: string; desc: string }[] = [
    { value: "light", label: "Light", desc: "Minimal changes" },
    { value: "balanced", label: "Balanced", desc: "Natural rewrite" },
    { value: "heavy", label: "Heavy", desc: "Full transformation" },
  ]

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-slate-950">
      <div className="p-4 space-y-5">

        {/* Section: Tone */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
            <Wand2 size={10} />
            Tone
          </label>
          <div className="space-y-1">
            {TONES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => onToneChange(t.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150
                    ${tone === t.value
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shadow-sm shadow-amber-500/10"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent"
                    }`}
                >
                  <Icon size={13} className={tone === t.value ? "text-amber-500" : "text-slate-400"} />
                  {t.label}
                  {tone === t.value && <Check size={12} className="ml-auto text-amber-500" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200/60 dark:border-slate-700" />

        {/* Section: Strength */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Strength</label>
          <div className="flex gap-1.5">
            {STRENGTHS.map((s) => (
              <button
                key={s.value}
                onClick={() => onStrengthChange(s.value)}
                className={`flex-1 flex flex-col items-center px-2 py-2 rounded-lg text-center transition-all duration-150
                  ${strength === s.value
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shadow-sm shadow-amber-500/10"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                  }`}
              >
                <span className="text-xs font-medium">{s.label}</span>
                <span className="text-[10px] opacity-60 mt-0.5">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Two-pass toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Two-pass rewrite</span>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Rewrite → score → rewrite again</p>
          </div>
          <button
            onClick={() => onTwoPassChange(!twoPass)}
            className={`relative w-9 h-5 rounded-full transition-all duration-200 ${
              twoPass
                ? "bg-amber-500 shadow-inner shadow-amber-600/30"
                : "bg-slate-200 dark:bg-slate-700"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${twoPass ? "translate-x-4" : ""}`} />
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200/60 dark:border-slate-700" />

        {/* Section: Writing Persona */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
            <User size={10} />
            Your Writing Persona
          </label>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
            Upload writing samples so the AI always matches your voice.
          </p>

          {/* Sample list */}
          {persona.loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          ) : persona.samples.length > 0 ? (
            <div className="space-y-1 mb-3">
              {persona.samples.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 group"
                >
                  <FileText size={12} className="text-slate-400 flex-shrink-0" />
                  {editingLabelId === s.id ? (
                    <input
                      autoFocus
                      value={editingLabelText}
                      onChange={(e) => setEditingLabelText(e.target.value)}
                      onBlur={() => {
                        if (editingLabelText.trim() && editingLabelText.trim() !== s.label) {
                          onRenameSample(s.id, editingLabelText.trim())
                        }
                        setEditingLabelId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        if (e.key === "Escape") setEditingLabelId(null)
                      }}
                      className="flex-1 min-w-0 text-xs bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-600 rounded px-1.5 py-0.5 outline-none text-slate-700 dark:text-slate-200"
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingLabelId(s.id); setEditingLabelText(s.label) }}
                      className="flex-1 min-w-0 text-xs text-slate-600 dark:text-slate-400 truncate cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                      title={`Click to rename — ${s.label}`}
                    >
                      {s.label}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums">
                    {(s.charCount / 1000).toFixed(1)}k
                  </span>
                  <button
                    onClick={() => onDeleteSample(s.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                    title="Remove sample"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-lg mb-3">
              No samples yet. Add your writing to build your persona.
            </div>
          )}

          {/* Budget bar */}
          {persona.samples.length > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">
                <span>{persona.totalChars.toLocaleString()} / {persona.budget.toLocaleString()} chars</span>
                <span>{Math.round((persona.totalChars / persona.budget) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    persona.totalChars / persona.budget > 0.75
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, (persona.totalChars / persona.budget) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Add sample actions */}
          {!pastePanelOpen && (
            <div className="flex gap-2">
              <button
                onClick={() => setPastePanelOpen(true)}
                disabled={persona.totalChars >= persona.budget}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700
                  hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-200 dark:hover:border-amber-700
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Pen size={11} />
                Paste text
              </button>
              <button
                onClick={() => personaFileRef.current?.click()}
                disabled={persona.totalChars >= persona.budget || uploadingSample}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700
                  hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-200 dark:hover:border-amber-700
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {uploadingSample ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                Upload doc
              </button>
              <input
                ref={personaFileRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploadingSample(true)
                  try { await onUploadSample(file) } finally { setUploadingSample(false) }
                  e.target.value = ""
                }}
              />
            </div>
          )}

          {/* Paste panel */}
          {pastePanelOpen && (
            <div className="space-y-2">
              <input
                value={pasteLabel}
                onChange={(e) => setPasteLabel(e.target.value.slice(0, 80))}
                placeholder="Sample name (optional)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300
                  placeholder:text-slate-300 dark:placeholder:text-slate-600
                  focus:outline-none focus:border-amber-400 transition-all"
              />
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value.slice(0, 3000))}
                placeholder="Paste a paragraph or two of your writing..."
                rows={5}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300
                  placeholder:text-slate-300 dark:placeholder:text-slate-600
                  focus:outline-none focus:border-amber-400 resize-none transition-all"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{pasteText.length}/3000</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPastePanelOpen(false); setPasteText(""); setPasteLabel("") }}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (pasteText.trim().length < 50) return
                      setSavingPaste(true)
                      try {
                        await onAddPasteSample(pasteText, pasteLabel)
                        setPastePanelOpen(false)
                        setPasteText("")
                        setPasteLabel("")
                      } finally { setSavingPaste(false) }
                    }}
                    disabled={pasteText.trim().length < 50 || savingPaste}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white
                      hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  >
                    {savingPaste && <Loader2 size={11} className="animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200/60 dark:border-slate-700" />

        {/* Section 2: Audience */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Audience</label>
          <div className="grid grid-cols-2 gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a.value}
                onClick={() => onAudienceChange(a.value)}
                className={`flex flex-col items-start px-3 py-2 rounded-lg text-left transition-all duration-150
                  ${audience === a.value
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                  }`}
              >
                <span className="text-xs font-medium">{a.label}</span>
                <span className="text-[10px] opacity-60 mt-0.5">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200/60 dark:border-slate-700" />

        {/* Section 3: Quick Override */}
        <div>
          <button
            onClick={() => setQuickOverrideOpen(!quickOverrideOpen)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide hover:text-slate-600 dark:hover:text-slate-400 transition-colors mb-1"
          >
            <ChevronDown size={10} className={`transition-transform ${quickOverrideOpen ? "" : "-rotate-90"}`} />
            Quick Override
            {voiceSample.trim() && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </button>
          {quickOverrideOpen && (
            <div className="mt-2">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                Overrides your stored persona for this session only.
              </p>
              <div className="relative">
                <textarea
                  value={voiceSample}
                  onChange={(e) => onVoiceSampleChange(e.target.value.slice(0, 500))}
                  placeholder="Paste 1–2 sentences in a different voice..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700
                             bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300
                             placeholder:text-slate-300 dark:placeholder:text-slate-600
                             focus:outline-none focus:border-amber-400 dark:focus:border-amber-500
                             resize-none transition-all"
                />
                {voiceSample && (
                  <button
                    onClick={() => onVoiceSampleChange("")}
                    className="absolute top-2 right-2 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="text-right text-[10px] text-slate-300 dark:text-slate-600 mt-1">
                {voiceSample.length}/500
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Score History Dot ────────────────────────────────────────

function ScoreHistoryDot({ version, score }: { version: number; score: number }) {
  const [hovered, setHovered] = useState(false)
  const color = scoreBg(score)

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className={`w-2 h-2 rounded-full ${color} cursor-default`} />
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                        bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-medium
                        px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none shadow-lg">
          v{version}: {score}%
        </div>
      )}
    </div>
  )
}

// ─── Human Score Chip ────────────────────────────────────────

function HumanScoreChip({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const duration = 600
    let animId = 0

    function tick() {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(score * eased))
      if (progress < 1) animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [score])

  const color =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/60"
      : score >= 50
      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/60"
      : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/60"
  const icon =
    score >= 80 ? <CheckCircle2 size={11} /> : score >= 50 ? <AlertTriangle size={11} /> : <XCircle size={11} />

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {icon}
      <span className="tabular-nums">{displayed}%</span> human
    </span>
  )
}

// ─── Two-Pass Progress Bar ────────────────────────────────────

function TwoPassProgress({ pass, pass1Score }: { pass: 1 | 2; pass1Score?: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/40">
      <div className="flex items-center gap-1.5 flex-1">
        <div className={`flex items-center gap-1 text-[11px] font-medium ${pass >= 1 ? "text-amber-700 dark:text-amber-300" : "text-slate-400"}`}>
          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
            ${pass === 1 ? "bg-amber-500 text-white animate-pulse" : "bg-amber-500 text-white"}`}>
            {pass > 1 ? <Check size={8} /> : "1"}
          </div>
          Rewriting
          {pass1Score !== undefined && pass > 1 && (
            <span className={`ml-1 ${scoreColor(pass1Score)}`}>({pass1Score}%)</span>
          )}
        </div>

        <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-2">
          <div
            className="h-1 bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: pass === 1 ? "45%" : "100%" }}
          />
        </div>

        <div className={`flex items-center gap-1 text-[11px] font-medium ${pass === 2 ? "text-amber-700 dark:text-amber-300" : "text-slate-400"}`}>
          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
            ${pass === 2 ? "bg-amber-500 text-white animate-pulse" : "bg-slate-200 dark:bg-slate-700 text-slate-500"}`}>
            2
          </div>
          Hardening
        </div>
      </div>
    </div>
  )
}

// ─── AI Flags Footer ─────────────────────────────────────────

function AIFlagsFooter({
  flags,
  onFix,
}: {
  flags: string[]
  onFix: (prompt: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (!flags.length) return null

  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <AlertTriangle size={11} className="text-amber-500" />
        {flags.length} AI pattern{flags.length !== 1 ? "s" : ""} flagged
        <ChevronDown size={10} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{flag}</span>
            </div>
          ))}
          <button
            onClick={() => onFix("Fix the AI patterns you flagged. Focus on the specific issues and rewrite only those sections.")}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300
                       border border-amber-200 dark:border-amber-700
                       hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all"
          >
            <Wand2 size={11} />
            Fix These Issues
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Original Pane ───────────────────────────────────────────

function OriginalPane({
  text,
  diff,
  diffMode,
  isScanning,
}: {
  text: string
  diff: DiffToken[] | null
  diffMode?: boolean
  isScanning?: boolean
}) {
  const wordCount = useMemo(() => text.split(/\s+/).filter(Boolean).length, [text])

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium flex items-center gap-1.5 ${
            diffMode ? "text-red-500 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
          }`}>
            <FileText size={11} />
            Original
          </span>
          {diffMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20
                             text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800/60 font-medium">
              removed
            </span>
          )}
          {isScanning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20
                             text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 font-medium animate-pulse">
              scanning…
            </span>
          )}
        </div>
        {wordCount > 0 && (
          <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">
            {wordCount.toLocaleString()} words
          </span>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80
                   bg-slate-50/50 dark:bg-slate-800/30 p-4 text-[14px] leading-[1.8]
                   text-slate-600 dark:text-slate-400 whitespace-pre-wrap"
      >
        {diff ? (
          <>
            {diff.map((token, i) =>
              token.type === "removed" ? (
                <mark
                  key={i}
                  className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-0.5 line-through"
                >
                  {token.text}
                </mark>
              ) : token.type === "equal" ? (
                <span key={i}>{token.text}</span>
              ) : null
            )}
          </>
        ) : (
          text
        )}
      </div>
    </div>
  )
}

// ─── Scan Analysis Renderer ──────────────────────────────────

function ScanAnalysisView({ content }: { content: string }) {
  const lines = content.split(/\n/)
  return (
    <div className="text-[13.5px] leading-[1.75] text-slate-700 dark:text-slate-300 space-y-3">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        const headerMatch = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/)
        if (headerMatch) {
          return (
            <div key={i}>
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {headerMatch[1]}
              </span>
              {headerMatch[2] && (
                <span className="text-slate-600 dark:text-slate-400">: {headerMatch[2]}</span>
              )}
            </div>
          )
        }
        const bulletMatch = line.match(/^[-•]\s+(.+)$/)
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-2 ml-1">
              <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span>{bulletMatch[1]}</span>
            </div>
          )
        }
        const numMatch = line.match(/^(\d+)\.\s+(.+)$/)
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 ml-1">
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 w-4 flex-shrink-0 mt-[3px]">{numMatch[1]}.</span>
              <span>{numMatch[2]}</span>
            </div>
          )
        }
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

// ─── Paragraph with sentence-level rewrite ───────────────────

function ParagraphBlock({
  paraText,
  paraIdx,
  score,
  isRewriting,
  onParagraphRewrite,
  onSentenceRewrite,
  onCopyParagraph,
  copiedIdx,
}: {
  paraText: string
  paraIdx: number
  score?: number
  isRewriting: boolean
  onParagraphRewrite: (idx: number, text: string) => void
  onSentenceRewrite: (paraIdx: number, sentIdx: number, text: string) => void
  onCopyParagraph: (idx: number, text: string) => void
  copiedIdx: number | null
}) {
  // Split paragraph into sentences for hover-level rewrite
  const sentences = useMemo(() => {
    // Split on . ! ? followed by space or end, keeping delimiter
    return paraText.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) ?? [paraText]
  }, [paraText])

  const [hoveredSentIdx, setHoveredSentIdx] = useState<number | null>(null)

  return (
    <div
      className="relative group rounded-xl border border-transparent
                 hover:border-amber-200/80 dark:hover:border-amber-700/60
                 hover:bg-amber-50/40 dark:hover:bg-amber-900/10
                 transition-all duration-150 p-2 -mx-2"
    >
      <div className="text-[14px] leading-[1.8] text-slate-800 dark:text-slate-200 pr-20">
        {sentences.map((sent, si) => (
          <span
            key={si}
            className="relative"
            onMouseEnter={() => setHoveredSentIdx(si)}
            onMouseLeave={() => setHoveredSentIdx(null)}
          >
            <span className={`${hoveredSentIdx === si ? "bg-amber-100/60 dark:bg-amber-900/30 rounded" : ""} transition-colors`}>
              {sent}
            </span>
            {hoveredSentIdx === si && !isRewriting && sentences.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onSentenceRewrite(paraIdx, si, sent.trim()) }}
                className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded
                           bg-amber-500 hover:bg-amber-600 text-white shadow-sm align-middle
                           transition-all duration-100"
              >
                <RefreshCw size={7} />
                sentence
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Paragraph score badge */}
      {score !== undefined && (
        <div className={`absolute top-2 left-2 flex items-center gap-0.5 text-[10px] font-bold tabular-nums
                         opacity-0 group-hover:opacity-100 transition-opacity ${scoreColor(score)}`}
          title={`This paragraph scores ${score}% human`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${scoreBg(score)}`} />
          {score}%
        </div>
      )}

      {/* Paragraph action buttons */}
      {!isRewriting && (
        <div className="absolute top-2 right-2 flex items-center gap-1
                        opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => onCopyParagraph(paraIdx, paraText)}
            title="Copy paragraph"
            className="flex items-center justify-center w-6 h-6 rounded-md
                       bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600
                       text-slate-400 dark:text-slate-500
                       hover:text-slate-600 dark:hover:text-slate-300
                       shadow-sm transition-all duration-100"
          >
            {copiedIdx === paraIdx ? <Check size={10} /> : <Copy size={10} />}
          </button>
          <button
            onClick={() => onParagraphRewrite(paraIdx, paraText)}
            title="Rewrite this paragraph"
            className="flex items-center gap-1 px-1.5 py-1
                       text-[11px] font-medium rounded-md
                       bg-amber-500 hover:bg-amber-600
                       text-white shadow-sm transition-all duration-100"
          >
            <RefreshCw size={9} />
            Rewrite
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isRewriting && (
        <div className="absolute inset-0 rounded-xl bg-amber-50/90 dark:bg-amber-900/30
                        flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin text-amber-500" />
          <span className="text-xs text-amber-600 dark:text-amber-400">Rewriting…</span>
        </div>
      )}
    </div>
  )
}

// ─── Output Pane ─────────────────────────────────────────────

function OutputPane({
  paragraphs,
  diff,
  isStreaming,
  streamingContent,
  humanScore,
  aiFlags,
  scanAnalysis,
  onParagraphRewrite,
  onSentenceRewrite,
  paragraphRewritingIdx,
  onCopy,
  copiedAll,
  onExport,
  onRefineSubmit,
  wordCountDelta,
  paragraphScores,
  twoPassState,
}: {
  paragraphs: string[]
  diff: DiffToken[] | null
  isStreaming: boolean
  streamingContent: string | null
  humanScore: number | undefined
  aiFlags: string[] | undefined
  scanAnalysis: string | null
  onParagraphRewrite: (idx: number, text: string) => void
  onSentenceRewrite: (paraIdx: number, sentIdx: number, text: string) => void
  paragraphRewritingIdx: number | null
  onCopy: () => void
  copiedAll: boolean
  onExport: () => void
  onRefineSubmit: (prompt: string) => void
  wordCountDelta: number | null
  paragraphScores: Array<{ idx: number; score: number }>
  twoPassState: { active: boolean; pass: 1 | 2; pass1Score?: number }
}) {
  const [copiedParaIdx, setCopiedParaIdx] = useState<number | null>(null)

  const handleCopyParagraph = useCallback(async (idx: number, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedParaIdx(idx)
    setTimeout(() => setCopiedParaIdx(null), 1500)
  }, [])

  const wordCount = useMemo(
    () => paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
    [paragraphs]
  )

  const readingTime = useMemo(() => Math.max(1, Math.ceil(wordCount / 200)), [wordCount])

  const scoreMap = useMemo(() => {
    const m: Record<number, number> = {}
    for (const ps of paragraphScores) m[ps.idx] = ps.score
    return m
  }, [paragraphScores])

  const showStreaming = isStreaming

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ flex: 1, minWidth: 220 }}
    >
      {/* Two-pass progress bar */}
      {twoPassState.active && isStreaming && (
        <TwoPassProgress pass={twoPassState.pass} pass1Score={twoPassState.pass1Score} />
      )}

      <div className="flex flex-col overflow-hidden p-4 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Wand2 size={11} />
              {scanAnalysis ? "Scan Results" : "Humanized"}
            </span>
            {diff && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20
                               text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 font-medium">
                added
              </span>
            )}
            {wordCountDelta !== null && wordCountDelta !== 0 && !scanAnalysis && !isStreaming && (
              <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
                wordCountDelta < 0
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
              }`}>
                {wordCountDelta > 0 ? "+" : ""}{wordCountDelta} words
              </span>
            )}
            {!scanAnalysis && !isStreaming && wordCount > 0 && (
              <>
                <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums">
                  {wordCount.toLocaleString()} words
                </span>
                <span className="flex items-center gap-0.5 text-[11px] text-slate-300 dark:text-slate-600">
                  <Clock size={9} />
                  {readingTime} min
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {humanScore !== undefined && !isStreaming && <HumanScoreChip score={humanScore} />}
            {!scanAnalysis && !isStreaming && paragraphs.length > 0 && (
              <>
                <button
                  onClick={onExport}
                  title="Download as .txt"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200
                             text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300
                             hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download size={11} />
                </button>
                <button
                  onClick={onCopy}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-200
                    ${copiedAll
                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700"
                      : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                    }`}
                >
                  {copiedAll ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy All</>}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-amber-200/60 dark:border-amber-700/60
                        bg-white dark:bg-slate-800/60 p-4">
          {showStreaming ? (
            <div className="text-[14px] leading-[1.8] text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {streamingContent || (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-md w-full" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-md w-5/6" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-md w-full" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-md w-4/5" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-md w-full" />
                </div>
              )}
              {streamingContent && (
                <span className="inline-block w-[2px] h-[1.1em] bg-amber-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              )}
            </div>
          ) : scanAnalysis ? (
            <ScanAnalysisView content={scanAnalysis} />
          ) : diff ? (
            <div className="text-[14px] leading-[1.8] whitespace-pre-wrap">
              {diff.map((token, i) =>
                token.type === "added" ? (
                  <mark
                    key={i}
                    className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded px-0.5"
                  >
                    {token.text}
                  </mark>
                ) : token.type === "equal" ? (
                  <span key={i} className="text-slate-800 dark:text-slate-200">{token.text}</span>
                ) : null
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paragraphs.map((para, idx) => (
                <ParagraphBlock
                  key={idx}
                  paraText={para}
                  paraIdx={idx}
                  score={scoreMap[idx]}
                  isRewriting={paragraphRewritingIdx === idx}
                  onParagraphRewrite={onParagraphRewrite}
                  onSentenceRewrite={onSentenceRewrite}
                  onCopyParagraph={handleCopyParagraph}
                  copiedIdx={copiedParaIdx}
                />
              ))}
            </div>
          )}
        </div>

        {/* AI Flags */}
        {aiFlags && !scanAnalysis && !isStreaming && (
          <AIFlagsFooter flags={aiFlags} onFix={onRefineSubmit} />
        )}
      </div>
    </div>
  )
}

// ─── Two-Pane Layout with Resizable Splitter ─────────────────

function TwoPaneLayout({
  originalText,
  diffTokens,
  paragraphs,
  isStreaming,
  streamingContent,
  humanScore,
  aiFlags,
  scanAnalysis,
  onParagraphRewrite,
  onSentenceRewrite,
  paragraphRewritingIdx,
  onCopy,
  copiedAll,
  onExport,
  onRefineSubmit,
  wordCountDelta,
  paragraphScores,
  twoPassState,
}: {
  originalText: string
  diffTokens: DiffToken[] | null
  paragraphs: string[]
  isStreaming: boolean
  streamingContent: string | null
  humanScore: number | undefined
  aiFlags: string[] | undefined
  scanAnalysis: string | null
  onParagraphRewrite: (idx: number, text: string) => void
  onSentenceRewrite: (paraIdx: number, sentIdx: number, text: string) => void
  paragraphRewritingIdx: number | null
  onCopy: () => void
  copiedAll: boolean
  onExport: () => void
  onRefineSubmit: (prompt: string) => void
  wordCountDelta: number | null
  paragraphScores: Array<{ idx: number; score: number }>
  twoPassState: { active: boolean; pass: 1 | 2; pass1Score?: number }
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPercent, setSplitPercent] = useState(50)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pct = Math.min(80, Math.max(20, (x / rect.width) * 100))
      setSplitPercent(pct)
    }
    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      <div style={{ width: `${splitPercent}%`, minWidth: 160 }} className="flex flex-col overflow-hidden">
        <OriginalPane
          text={originalText}
          diff={diffTokens}
          diffMode={diffTokens !== null}
          isScanning={isStreaming && !!scanAnalysis}
        />
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="w-1 flex-shrink-0 cursor-col-resize flex items-center justify-center group relative
                   bg-slate-200/80 dark:bg-slate-700/80 hover:bg-amber-300 dark:hover:bg-amber-600
                   transition-colors duration-150"
        title="Drag to resize"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
        <div className="w-0.5 h-8 rounded-full bg-slate-300 dark:bg-slate-600
                        group-hover:bg-amber-400 dark:group-hover:bg-amber-500
                        transition-colors duration-150 opacity-0 group-hover:opacity-100" />
      </div>

      <div style={{ flex: 1, minWidth: 160 }} className="flex flex-col overflow-hidden">
        <OutputPane
          paragraphs={paragraphs}
          diff={diffTokens}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          humanScore={humanScore}
          aiFlags={aiFlags}
          scanAnalysis={scanAnalysis}
          onParagraphRewrite={onParagraphRewrite}
          onSentenceRewrite={onSentenceRewrite}
          paragraphRewritingIdx={paragraphRewritingIdx}
          onCopy={onCopy}
          copiedAll={copiedAll}
          onExport={onExport}
          onRefineSubmit={onRefineSubmit}
          wordCountDelta={wordCountDelta}
          paragraphScores={paragraphScores}
          twoPassState={twoPassState}
        />
      </div>
    </div>
  )
}

// ─── Refine Bar ──────────────────────────────────────────────

const REFINE_ACTIONS = [
  { label: "More Casual", icon: MessageSquare, prompt: "Make it more casual and conversational" },
  { label: "Shorten", icon: Zap, prompt: "Make it shorter while keeping the key points" },
  { label: "More Formal", icon: BookOpen, prompt: "Make it more formal and polished" },
  { label: "Scan This", icon: Search, prompt: "Scan this version for AI detectability. Score it and identify specific issues." },
  { label: "Rewrite Again", icon: RefreshCw, prompt: "Do another full rewrite pass. There are still some AI-sounding phrases." },
]

function RefineBar({
  isLoading,
  inputValue,
  setInputValue,
  onSubmit,
  mode,
  onModeChange,
}: {
  isLoading: boolean
  inputValue: string
  setInputValue: (v: string) => void
  onSubmit: (query?: string) => void
  mode: Mode
  onModeChange: (m: Mode) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [inputValue])

  return (
    <div className="border-t border-slate-200/60 dark:border-slate-700
                    bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 pt-2.5 pb-3 flex-shrink-0">

      <div className="flex items-end gap-2 mb-2">
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5 flex-shrink-0 self-end mb-0.5">
          <button
            onClick={() => onModeChange("humanize")}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all duration-150
              ${mode === "humanize"
                ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"}`}
          >
            <Wand2 size={9} />
          </button>
          <button
            onClick={() => onModeChange("scan")}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-all duration-150
              ${mode === "scan"
                ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"}`}
          >
            <Search size={9} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={mode === "scan" ? "Ask about AI detectability, or click Run Scan below…" : "Give an instruction… 'Fix paragraph 2', 'Add personality'"}
          rows={1}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white
                     placeholder:text-slate-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:border-amber-400 dark:focus:border-amber-500
                     focus:ring-2 focus:ring-amber-500/10
                     resize-none disabled:opacity-50 transition-all"
          style={{ minHeight: 36, maxHeight: 120, overflowY: "auto" }}
        />
        <button
          onClick={() => onSubmit()}
          disabled={!inputValue.trim() || isLoading}
          className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-xl
                     bg-gradient-to-br from-amber-500 to-orange-500
                     hover:from-amber-600 hover:to-orange-600
                     text-white disabled:opacity-40 transition-all shadow-sm hover:shadow-md"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {mode === "humanize" && REFINE_ACTIONS.filter(a => a.label !== "Scan This").map((action) => (
          <button
            key={action.label}
            onClick={() => onSubmit(action.prompt)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-full
                       bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400
                       border border-slate-200/80 dark:border-slate-700/80
                       hover:border-amber-300 dark:hover:border-amber-600
                       hover:text-amber-700 dark:hover:text-amber-300
                       hover:bg-amber-50 dark:hover:bg-amber-900/20
                       transition-all duration-150 disabled:opacity-40 flex-shrink-0"
          >
            <action.icon size={9} />
            {action.label}
          </button>
        ))}
        {mode === "scan" && (
          <button
            onClick={() => onSubmit("Scan this version for AI detectability. Score it and identify specific issues.")}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-full
                       bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300
                       border border-amber-200 dark:border-amber-700
                       hover:bg-amber-100 dark:hover:bg-amber-900/40
                       transition-all duration-150 disabled:opacity-40 flex-shrink-0"
          >
            <Search size={9} /> Run Scan
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Empty Workspace ─────────────────────────────────────────

function EmptyWorkspace({
  pastedText,
  onPastedTextChange,
  onSubmit,
  mode,
  onModeChange,
  isLoading,
  attachedFile,
  onFileUpload,
  fileInputRef,
}: {
  pastedText: string
  onPastedTextChange: (v: string) => void
  onSubmit: () => void
  mode: Mode
  onModeChange: (m: Mode) => void
  isLoading: boolean
  attachedFile: { name: string; isExtracting?: boolean } | null
  onFileUpload: (file: File) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}) {
  const wordCount = pastedText.split(/\s+/).filter(Boolean).length
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      onFileUpload(file)
    } else {
      const text = e.dataTransfer.getData("text")
      if (text) onPastedTextChange(text)
    }
  }, [onFileUpload, onPastedTextChange])

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 overflow-y-auto animate-fade-in">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
        style={{
          background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.1) 100%)",
          boxShadow: "0 4px 20px rgba(245,158,11,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <Pen size={36} className="text-amber-500" />
      </div>

      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
        AI Humanizer
      </h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-10 text-[15px] leading-relaxed text-center">
        Paste AI-generated text below. Score it for detectability, or rewrite it to sound human.
      </p>

      <div
        className="w-full max-w-2xl mb-5"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          value={pastedText}
          onChange={(e) => onPastedTextChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="Paste your AI-generated text here, or drop a PDF/DOCX..."
          className={`w-full min-h-[200px] max-h-[420px] rounded-xl border px-5 py-4 text-[15px] text-slate-900 dark:text-white leading-relaxed
                     bg-white dark:bg-slate-800
                     placeholder:text-slate-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:ring-4
                     resize-none transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]
                     ${isDragging
                       ? "border-amber-400 dark:border-amber-500 ring-4 ring-amber-500/10 bg-amber-50/30 dark:bg-amber-900/10"
                       : "border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-amber-400 dark:focus:border-amber-500 focus:ring-amber-500/10"
                     }`}
        />
        <div className="flex items-center justify-between mt-2 px-1">
          {pastedText ? (
            <span className="text-xs text-slate-400 tabular-nums">
              {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
            </span>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600">⌘↵ to submit</span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500
                       hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <Upload size={12} />
            {attachedFile
              ? attachedFile.isExtracting
                ? "Extracting..."
                : attachedFile.name
              : "upload PDF / DOCX"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileUpload(file)
              e.target.value = ""
            }}
            className="hidden"
          />
        </div>
      </div>

      <div className="w-full max-w-2xl flex items-center gap-3 mb-2">
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-shrink-0">
          <button
            onClick={() => onModeChange("scan")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${mode === "scan"
                ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
          >
            <Search size={14} />
            Scan
          </button>
          <button
            onClick={() => onModeChange("humanize")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${mode === "humanize"
                ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
          >
            <Wand2 size={14} />
            Humanize
          </button>
        </div>

        <button
          onClick={onSubmit}
          disabled={!pastedText.trim() || isLoading}
          className="flex-1 py-2.5 rounded-xl text-white font-medium text-sm
                     bg-gradient-to-r from-amber-500 to-orange-500
                     hover:from-amber-600 hover:to-orange-600
                     shadow-[0_4px_12px_rgba(245,158,11,0.3)]
                     hover:shadow-[0_6px_20px_rgba(245,158,11,0.4)]
                     transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : mode === "scan" ? (
            <><Search size={17} /> Scan for AI</>
          ) : (
            <><Wand2 size={17} /> Humanize</>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function AIHumanizer() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return <Navigate to="/" replace />

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // ── Settings ───────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("humanize")
  const [tone, setTone] = useState<Tone>("professional")
  const [strength, setStrength] = useState<Strength>("balanced")
  const [twoPass, setTwoPass] = useState(false)
  const [audience, setAudience] = useState<Audience>("general")
  const [voiceSample, setVoiceSample] = useState("")

  // ── Persona state ────────────────────────────────────────
  const [persona, setPersona] = useState<PersonaState>({ samples: [], totalChars: 0, budget: 8000, loading: true })

  const fetchPersona = useCallback(async () => {
    try {
      const headers = await addCsrfHeader({})
      const resp = await fetch(`${API_BASE}/humanizer/persona`, { credentials: "include", headers: headers as HeadersInit })
      if (resp.ok) {
        const data = await resp.json()
        setPersona({ samples: data.samples, totalChars: data.totalChars, budget: data.budget, loading: false })
      } else {
        setPersona((p) => ({ ...p, loading: false }))
      }
    } catch {
      setPersona((p) => ({ ...p, loading: false }))
    }
  }, [])

  useEffect(() => { fetchPersona() }, [fetchPersona])

  const handleAddPasteSample = useCallback(async (text: string, label: string) => {
    const headers = await addCsrfHeader({ "Content-Type": "application/json" })
    const resp = await fetch(`${API_BASE}/humanizer/persona`, {
      method: "POST", credentials: "include", headers: headers as HeadersInit,
      body: JSON.stringify({ text, label: label || undefined }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Failed to save" }))
      toast.error(err.error || "Failed to save sample")
      return
    }
    toast.success("Sample added to your persona")
    await fetchPersona()
  }, [fetchPersona])

  const handleUploadSample = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    const headers = await addCsrfHeader({})
    const resp = await fetch(`${API_BASE}/humanizer/persona/upload`, {
      method: "POST", credentials: "include", headers: headers as HeadersInit, body: formData,
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Failed to upload" }))
      toast.error(err.error || "Failed to upload sample")
      return
    }
    toast.success("Document added to your persona")
    await fetchPersona()
  }, [fetchPersona])

  const handleDeleteSample = useCallback(async (id: string) => {
    const headers = await addCsrfHeader({})
    const resp = await fetch(`${API_BASE}/humanizer/persona/${id}`, {
      method: "DELETE", credentials: "include", headers: headers as HeadersInit,
    })
    if (!resp.ok) {
      toast.error("Failed to remove sample")
      return
    }
    toast.success("Sample removed")
    await fetchPersona()
  }, [fetchPersona])

  const handleRenameSample = useCallback(async (id: string, label: string) => {
    const headers = await addCsrfHeader({ "Content-Type": "application/json" })
    await fetch(`${API_BASE}/humanizer/persona/${id}`, {
      method: "PATCH", credentials: "include", headers: headers as HeadersInit,
      body: JSON.stringify({ label }),
    })
    await fetchPersona()
  }, [fetchPersona])

  // ── Workspace state ────────────────────────────────────────
  const [docVersions, setDocVersions] = useState<string[]>([])
  const [currentDocIdx, setCurrentDocIdx] = useState(-1)
  const [viewMode, setViewMode] = useState<ViewMode>("clean")
  const [originalForDiff, setOriginalForDiff] = useState("")
  const [latestHumanScore, setLatestHumanScore] = useState<number | undefined>()
  const [latestAiFlags, setLatestAiFlags] = useState<string[] | undefined>()
  const [scanAnalysis, setScanAnalysis] = useState<string | null>(null)
  const [paragraphRewritingIdx, setParagraphRewritingIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [personaSidebarOpen, setPersonaSidebarOpen] = useState(false)
  const [paragraphScores, setParagraphScores] = useState<Array<{ idx: number; score: number }>>([])
  const [scoreHistory, setScoreHistory] = useState<Array<{ version: number; score: number }>>([])
  const [twoPassState, setTwoPassState] = useState<{ active: boolean; pass: 1 | 2; pass1Score?: number }>({ active: false, pass: 1 })

  // ── Input state ────────────────────────────────────────────
  const [pastedText, setPastedText] = useState("")
  const [attachedFile, setAttachedFile] = useState<{ name: string; isExtracting?: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastProcessedIdRef = useRef<string | null>(null)

  // ── Derived ────────────────────────────────────────────────
  const currentDoc = currentDocIdx >= 0 ? (docVersions[currentDocIdx] ?? "") : ""
  const paragraphs = useMemo(
    () => currentDoc.split(/\n\n+/).filter(Boolean),
    [currentDoc]
  )
  const canUndo = currentDocIdx > 0
  const canRedo = currentDocIdx < docVersions.length - 1
  const versionLabel = docVersions.length > 0 ? `v${currentDocIdx + 1}/${docVersions.length}` : ""

  const wordCountDelta = useMemo(() => {
    if (!currentDoc || !originalForDiff) return null
    const orig = originalForDiff.split(/\s+/).filter(Boolean).length
    const curr = currentDoc.split(/\s+/).filter(Boolean).length
    return curr - orig
  }, [currentDoc, originalForDiff])

  // ── Chat hook ──────────────────────────────────────────────
  const chat = useChat({
    endpoint: "/humanizer/stream",
    streamEndpoint: "/humanizer/stream",
    page: "humanizer",
    parseResult,
    buildBody: useCallback(
      (query: string) => {
        if (mode === "scan") {
          return {
            text: currentDoc || query,
            tone, strength, twoPass, scanOnly: true,
            audience, voiceSample: voiceSample.trim() || undefined,
          }
        }
        if (currentDoc && !query.startsWith("[PARAGRAPH REWRITE]")) {
          return {
            text: `[REFINE]\n\nCURRENT DOCUMENT:\n${currentDoc}\n\nINSTRUCTION: ${query}`,
            tone, strength, twoPass, scanOnly: false,
            audience, voiceSample: voiceSample.trim() || undefined,
          }
        }
        return {
          text: query,
          tone, strength, twoPass, scanOnly: false,
          audience, voiceSample: voiceSample.trim() || undefined,
        }
      },
      [tone, strength, twoPass, mode, currentDoc, audience, voiceSample]
    ),
    errorMessage: "Failed to process text. Please try again.",
  })

  // ── Streaming content (live preview during generation) ─────
  const streamingContent = useMemo(() => {
    if (!chat.isStreaming) return null
    return [...chat.messages].reverse().find((m) => m.role === "assistant")?.content ?? null
  }, [chat.isStreaming, chat.messages])

  // ── Track two-pass state from SSE events ───────────────────
  // Note: the `pass` SSE event is handled by the backend; we detect it
  // by watching for pass2 tokens in messages metadata
  useEffect(() => {
    if (!chat.isStreaming) {
      setTwoPassState({ active: false, pass: 1 })
      return
    }
    if (twoPass) {
      setTwoPassState((prev) => ({ ...prev, active: true }))
    }
  }, [chat.isStreaming, twoPass])

  // ── Capture completed humanize results into docVersions ────
  useEffect(() => {
    const last = [...chat.messages]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          !m.refused &&
          (m.metadata?.mode === "humanize") &&
          m.content.length > 20
      )

    if (!last?.content || last.id === lastProcessedIdRef.current) return
    lastProcessedIdRef.current = last.id

    const newText = last.content
    const original = (last.metadata?.originalText as string | undefined) ?? ""
    const score = last.metadata?.humanScore as number | undefined
    const flags = last.metadata?.aiFlags as string[] | undefined
    const paraScores = (last.metadata?.paragraphScores as Array<{ idx: number; score: number }> | undefined) ?? []

    setDocVersions((prev) => {
      const base = prev.slice(0, currentDocIdx + 1)
      const updated = [...base, newText].slice(-20)
      return updated
    })
    setCurrentDocIdx((prev) => Math.min(prev + 1, 19))
    if (original) setOriginalForDiff(original)
    if (score !== undefined) {
      setLatestHumanScore(score)
      setScoreHistory((prev) => [...prev, { version: prev.length + 1, score }].slice(-10))
    }
    if (flags) setLatestAiFlags(flags)
    if (paraScores.length > 0) setParagraphScores(paraScores)
    setViewMode("clean")
  }, [chat.messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Capture scan results ──────────────────────────────────
  useEffect(() => {
    if (chat.isStreaming) return
    const last = [...chat.messages]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          !m.refused &&
          m.metadata?.mode === "scan" &&
          m.content.length > 20
      )
    if (!last || last.id === lastProcessedIdRef.current) return
    lastProcessedIdRef.current = last.id
    const score = last.metadata?.humanScore as number | undefined
    const flags = last.metadata?.aiFlags as string[] | undefined
    if (score !== undefined) setLatestHumanScore(score)
    if (flags) setLatestAiFlags(flags)
    setScanAnalysis(last.content)
  }, [chat.messages, chat.isStreaming])

  useEffect(() => {
    if (chat.isStreaming) setScanAnalysis(null)
  }, [chat.isStreaming])

  // ── Deep-link: ?conv= ──────────────────────────────────────
  useEffect(() => {
    const convId = searchParams.get("conv")
    if (convId) {
      chat.loadConversation(convId)
      navigate("/humanize", { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keyboard shortcuts ──────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === "z" && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault()
          setCurrentDocIdx((p) => Math.max(0, p - 1))
        }
      }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        if (canRedo) {
          e.preventDefault()
          setCurrentDocIdx((p) => Math.min(docVersions.length - 1, p + 1))
        }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [canUndo, canRedo, docVersions.length])

  // ── New document ───────────────────────────────────────────
  const handleNewDocument = useCallback(() => {
    setDocVersions([])
    setCurrentDocIdx(-1)
    setOriginalForDiff("")
    setLatestHumanScore(undefined)
    setLatestAiFlags(undefined)
    setScanAnalysis(null)
    setViewMode("clean")
    setPastedText("")
    setAttachedFile(null)
    setParagraphScores([])
    setScoreHistory([])
    chat.startNewConversation()
  }, [chat])

  // ── File upload ────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setAttachedFile({ name: file.name, isExtracting: true })
    const formData = new FormData()
    formData.append("file", file)
    try {
      const headers = await addCsrfHeader({})
      const response = await fetch(`${API_BASE}/humanizer/upload`, {
        method: "POST",
        headers,
        credentials: "include",
        body: formData,
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "Upload failed")
      }
      const data = await response.json() as { text: string; wordCount: number }
      setPastedText(data.text)
      setAttachedFile({ name: `${file.name} (${data.wordCount.toLocaleString()} words)` })
    } catch (error) {
      console.error("File upload failed:", error)
      setAttachedFile(null)
      toast.error(error instanceof Error ? error.message : "Failed to extract text from file")
    }
  }, [])

  // ── Initial submit from empty workspace ───────────────────
  const handleWorkspaceSubmit = useCallback(() => {
    if (!pastedText.trim()) return
    chat.handleSubmit(pastedText.trim())
    setPastedText("")
    setAttachedFile(null)
  }, [pastedText, chat])

  // ── Paragraph rewrite ──────────────────────────────────────
  const handleParagraphRewrite = useCallback(
    async (idx: number, paragraphText: string) => {
      if (paragraphRewritingIdx !== null) return

      setParagraphRewritingIdx(idx)

      const prompt = [
        "[PARAGRAPH REWRITE]",
        paragraphs.slice(0, idx).length > 0
          ? `CONTEXT_BEFORE:\n${paragraphs.slice(0, idx).join("\n\n")}`
          : "",
        `TARGET:\n${paragraphText}`,
        paragraphs.slice(idx + 1).length > 0
          ? `CONTEXT_AFTER:\n${paragraphs.slice(idx + 1).join("\n\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")

      try {
        await fetchSSE(
          "/humanizer/stream",
          { text: prompt, tone, strength, twoPass: false, scanOnly: false, audience, voiceSample: voiceSample.trim() || undefined },
          {
            onDone: (data) => {
              const rewritten = data.cleanResponse.trim()
              if (!rewritten) return

              const newParagraphs = [...paragraphs]
              newParagraphs[idx] = rewritten
              const newDoc = newParagraphs.join("\n\n")

              setDocVersions((prev) => {
                const base = prev.slice(0, currentDocIdx + 1)
                return [...base, newDoc].slice(-20)
              })
              setCurrentDocIdx((prev) => Math.min(prev + 1, 19))
            },
            onError: (err) => {
              console.error("Paragraph rewrite failed:", err)
              toast.error("Paragraph rewrite failed. Please try again.")
            },
          }
        )
      } finally {
        setParagraphRewritingIdx(null)
      }
    },
    [paragraphs, currentDocIdx, tone, strength, paragraphRewritingIdx, audience, voiceSample]
  )

  // ── Sentence rewrite ────────────────────────────────────────
  const handleSentenceRewrite = useCallback(
    async (paraIdx: number, sentIdx: number, sentenceText: string) => {
      if (paragraphRewritingIdx !== null) return
      setParagraphRewritingIdx(paraIdx)

      const para = paragraphs[paraIdx] ?? ""
      const prompt = [
        "[SENTENCE REWRITE]",
        para ? `CONTEXT_PARAGRAPH:\n${para}` : "",
        `TARGET_SENTENCE:\n${sentenceText}`,
      ]
        .filter(Boolean)
        .join("\n\n")

      try {
        await fetchSSE(
          "/humanizer/stream",
          { text: prompt, tone, strength, twoPass: false, scanOnly: false },
          {
            onDone: (data) => {
              const rewritten = data.cleanResponse.trim()
              if (!rewritten) return

              // Replace the sentence within the paragraph
              const sentences = para.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) ?? [para]
              sentences[sentIdx] = rewritten + (rewritten.match(/[.!?]$/) ? " " : ". ")
              const newPara = sentences.join("").trim()

              const newParagraphs = [...paragraphs]
              newParagraphs[paraIdx] = newPara
              const newDoc = newParagraphs.join("\n\n")

              setDocVersions((prev) => {
                const base = prev.slice(0, currentDocIdx + 1)
                return [...base, newDoc].slice(-20)
              })
              setCurrentDocIdx((prev) => Math.min(prev + 1, 19))
            },
            onError: (err) => {
              console.error("Sentence rewrite failed:", err)
              toast.error("Sentence rewrite failed.")
            },
          }
        )
      } finally {
        setParagraphRewritingIdx(null)
      }
    },
    [paragraphs, currentDocIdx, tone, strength, paragraphRewritingIdx]
  )

  // ── Copy all ───────────────────────────────────────────────
  const handleCopyAll = useCallback(async () => {
    if (!currentDoc) return
    await navigator.clipboard.writeText(currentDoc)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }, [currentDoc])

  // ── Export ──────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!currentDoc) return
    const blob = new Blob([currentDoc], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "humanized.txt"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Downloaded humanized.txt")
  }, [currentDoc])

  // ── Diff tokens (memoized, only computed in diff mode) ──────
  const diffTokens = useMemo(() => {
    if (viewMode !== "diff" || !currentDoc || !originalForDiff) return null
    return wordDiff(originalForDiff, currentDoc)
  }, [viewMode, currentDoc, originalForDiff])

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 overflow-hidden">
      <AppHeader />

      <WorkspaceControlsBar
        mode={mode}
        viewMode={viewMode} onViewModeChange={setViewMode}
        hasDoc={!!currentDoc}
        hasOriginal={!!originalForDiff}
        canUndo={canUndo} onUndo={() => setCurrentDocIdx((p) => Math.max(0, p - 1))}
        canRedo={canRedo} onRedo={() => setCurrentDocIdx((p) => Math.min(docVersions.length - 1, p + 1))}
        versionLabel={versionLabel}
        onNewDocument={handleNewDocument}
        scoreHistory={scoreHistory}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        personaSidebarOpen={personaSidebarOpen}
        onTogglePersonaSidebar={() => setPersonaSidebarOpen((o) => !o)}
        hasPersona={persona.samples.length > 0}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* History sidebar */}
        <div className={`flex-shrink-0 border-r border-slate-200/60 dark:border-slate-700 transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-64" : "w-0 border-r-0"}`}>
          {sidebarOpen && (
            <div className="relative w-64 h-full overflow-hidden">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-3 right-3 z-10 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                title="Collapse history"
              >
                <ArrowLeft size={13} />
              </button>
              <ChatHistorySidebar
                conversations={chat.conversationList}
                activeId={chat.conversationId}
                theme={theme}
                onSelect={chat.loadConversation}
                onNew={chat.startNewConversation}
                onDelete={chat.deleteConversation}
                onRename={chat.renameConversation}
              />
            </div>
          )}
        </div>

        {/* Main workspace */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!currentDoc && !chat.isStreaming ? (
            <div className="flex-1 flex overflow-hidden">
              <EmptyWorkspace
                pastedText={pastedText}
                onPastedTextChange={setPastedText}
                onSubmit={handleWorkspaceSubmit}
                mode={mode}
                onModeChange={setMode}
                isLoading={chat.isLoading}
                attachedFile={attachedFile}
                onFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
              />
            </div>
          ) : (
            <>
              <TwoPaneLayout
                originalText={originalForDiff || pastedText}
                diffTokens={diffTokens}
                paragraphs={paragraphs}
                isStreaming={chat.isStreaming}
                streamingContent={streamingContent}
                humanScore={latestHumanScore}
                aiFlags={latestAiFlags}
                scanAnalysis={scanAnalysis}
                onParagraphRewrite={handleParagraphRewrite}
                onSentenceRewrite={handleSentenceRewrite}
                paragraphRewritingIdx={paragraphRewritingIdx}
                onCopy={handleCopyAll}
                copiedAll={copiedAll}
                onExport={handleExport}
                onRefineSubmit={chat.handleSubmit}
                wordCountDelta={wordCountDelta}
                paragraphScores={paragraphScores}
                twoPassState={twoPassState}
              />

              <RefineBar
                isLoading={chat.isLoading || chat.isStreaming}
                inputValue={chat.inputValue}
                setInputValue={chat.setInputValue}
                onSubmit={chat.handleSubmit}
                mode={mode}
                onModeChange={setMode}
              />
            </>
          )}
        </div>

        {/* Persona sidebar (right) */}
        {mode === "humanize" && (
          <div className={`flex-shrink-0 border-l border-slate-200/60 dark:border-slate-700 transition-all duration-200 ${personaSidebarOpen ? "w-72" : "w-0"} overflow-hidden`}>
            {personaSidebarOpen && (
              <PersonaSidebar
                persona={persona}
                onAddPasteSample={handleAddPasteSample}
                onUploadSample={handleUploadSample}
                onDeleteSample={handleDeleteSample}
                onRenameSample={handleRenameSample}
                tone={tone}
                onToneChange={setTone}
                strength={strength}
                onStrengthChange={setStrength}
                twoPass={twoPass}
                onTwoPassChange={setTwoPass}
                audience={audience}
                onAudienceChange={setAudience}
                voiceSample={voiceSample}
                onVoiceSampleChange={setVoiceSample}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
