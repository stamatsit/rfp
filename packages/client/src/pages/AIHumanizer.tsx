/**
 * AI Humanizer — Rewrites AI-generated text to sound naturally human.
 *
 * Admin-only, URL-only access (/humanize).
 * Uses shared chat infrastructure with amber theme.
 */

import { useState, useCallback, useRef } from "react"
import { Navigate } from "react-router-dom"
import {
  Pen,
  Wand2,
  Zap,
  BookOpen,
  MessageSquare,
  Upload,
  Loader2,
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react"
import { ChatContainer, ChatHistorySidebar } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { useIsAdmin } from "@/contexts/AuthContext"
import { CHAT_THEMES, type QuickAction, type ChatMessage } from "@/types/chat"
import { Badge } from "@/components/ui"
import { addCsrfHeader } from "@/lib/csrfToken"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

const theme = CHAT_THEMES.amber

type Mode = "humanize" | "scan"
type Tone = "professional" | "conversational" | "academic"
type Strength = "light" | "balanced" | "heavy"

const HUMANIZE_ACTIONS: QuickAction[] = [
  { icon: MessageSquare, label: "More Casual", prompt: "Make it more casual and conversational" },
  { icon: Zap, label: "Shorter", prompt: "Make it shorter while keeping the key points" },
  { icon: BookOpen, label: "More Formal", prompt: "Make it more formal and polished" },
  { icon: RefreshCw, label: "Rewrite Again", prompt: "Do another pass. There are still some AI-sounding phrases." },
  { icon: Search, label: "Scan This Version", prompt: "Scan this latest version and score it for AI detectability. Don't rewrite, just analyze." },
]

const SCAN_ACTIONS: QuickAction[] = [
  { icon: Wand2, label: "Humanize It", prompt: "Now humanize this text based on the issues you found" },
  { icon: Search, label: "Scan Again", prompt: "Scan this text again for AI detectability" },
  { icon: AlertTriangle, label: "Most Detectable?", prompt: "Which specific paragraph is the most detectable as AI?" },
]

const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  metadata: data.metadata as Record<string, unknown> | undefined,
})

// ─── Copy Button Hook ───────────────────────────────────────

function useCopyButton() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  return { copiedKey, copy }
}

// ─── Human Score Panel ──────────────────────────────────────

function HumanScorePanel({
  message,
  onSubmit,
}: {
  message: ChatMessage
  onSubmit: (query: string) => void
}) {
  const humanScore = message.metadata?.humanScore as number | undefined
  const aiFlags = message.metadata?.aiFlags as string[] | undefined
  const twoPass = message.metadata?.twoPass as boolean | undefined
  const pass1Score = message.metadata?.pass1Score as number | undefined

  if (humanScore === undefined && humanScore !== 0) return null

  const score = humanScore ?? 0
  const scoreColor =
    score >= 80 ? "emerald" : score >= 50 ? "amber" : "red"

  const colorMap = {
    emerald: {
      bg: "from-emerald-50 to-teal-50/50 dark:from-emerald-900/20 dark:to-teal-900/15",
      border: "border-emerald-200/60 dark:border-emerald-700/50",
      bar: "from-emerald-500 to-teal-500",
      track: "bg-emerald-100 dark:bg-emerald-900/40",
      text: "text-emerald-700 dark:text-emerald-300",
      scoreText: "text-emerald-600 dark:text-emerald-400",
      label: "Looks Human",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    },
    amber: {
      bg: "from-amber-50 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/15",
      border: "border-amber-200/60 dark:border-amber-700/50",
      bar: "from-amber-500 to-orange-500",
      track: "bg-amber-100 dark:bg-amber-900/40",
      text: "text-amber-700 dark:text-amber-300",
      scoreText: "text-amber-600 dark:text-amber-400",
      label: "Needs Work",
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    },
    red: {
      bg: "from-red-50 to-orange-50/50 dark:from-red-900/20 dark:to-orange-900/15",
      border: "border-red-200/60 dark:border-red-700/50",
      bar: "from-red-500 to-orange-500",
      track: "bg-red-100 dark:bg-red-900/40",
      text: "text-red-700 dark:text-red-300",
      scoreText: "text-red-600 dark:text-red-400",
      label: "Highly Detectable",
      icon: <XCircle className="w-5 h-5 text-red-500" />,
    },
  }

  const colors = colorMap[scoreColor]

  return (
    <div className={`mt-4 p-4 bg-gradient-to-r ${colors.bg} rounded-xl border ${colors.border} animate-fade-in`}>
      {/* Score Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-semibold ${colors.text}`}>Human Score</span>
          {twoPass && pass1Score !== undefined && (
            <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="tabular-nums">{pass1Score}%</span>
              <ChevronRight size={10} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${colors.scoreText} tabular-nums`}>
            {score}%
          </span>
          {colors.icon}
        </div>
      </div>

      {/* Progress Bar */}
      <div className={`h-2.5 ${colors.track} rounded-full overflow-hidden mb-3`}>
        <div
          className={`h-full bg-gradient-to-r ${colors.bar} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Status label */}
      <p className={`text-xs font-medium ${colors.text} mb-3`}>{colors.label}</p>

      {/* AI Flags */}
      {aiFlags && aiFlags.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Patterns flagged:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {aiFlags.map((flag, i) => (
              <Badge key={i} variant="warning" className="text-[11px] font-normal">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {aiFlags && aiFlags.length === 0 && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
          <CheckCircle2 size={12} />
          Clean. This text should pass most AI detectors.
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        {score < 90 && (
          <button
            onClick={() => onSubmit("Fix the AI patterns you flagged. Focus on the specific issues and rewrite only those sections.")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700
                       text-slate-600 dark:text-slate-300
                       hover:border-amber-300 dark:hover:border-amber-600 hover:text-amber-700 dark:hover:text-amber-300
                       transition-all duration-200"
          >
            <Wand2 size={12} />
            Fix These Issues
          </button>
        )}
        <button
          onClick={() => onSubmit("Scan this latest version for AI detectability. Don't rewrite, just analyze and score.")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700
                     text-slate-600 dark:text-slate-300
                     hover:border-slate-300 dark:hover:border-slate-600
                     transition-all duration-200"
        >
          <Search size={12} />
          Scan Again
        </button>
      </div>
    </div>
  )
}

// ─── Rewritten Text Output Panel ────────────────────────────
// Shows the humanized text in a clean, copy-friendly container
// instead of raw markdown in a chat bubble.

function RewrittenTextPanel({
  content,
  messageId,
}: {
  content: string
  messageId: string
}) {
  const { copiedKey, copy } = useCopyButton()
  const isCopied = copiedKey === messageId

  if (!content) return null

  return (
    <div className="relative">
      {/* Copy bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <Pen size={11} />
          Rewritten text
        </span>
        <button
          onClick={() => copy(content, messageId)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200
            ${isCopied
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700"
              : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            }`}
        >
          {isCopied ? (
            <>
              <Check size={12} />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy Text
            </>
          )}
        </button>
      </div>

      {/* The actual text */}
      <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80
                      text-[15px] text-slate-800 dark:text-slate-200 leading-[1.8] whitespace-pre-wrap
                      selection:bg-amber-100 dark:selection:bg-amber-900/40">
        {content}
      </div>
    </div>
  )
}

// ─── Pill Selector ─────────────────────────────────────────

function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 rounded-full text-xs capitalize transition-all duration-200
            ${
              value === opt
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function AIHumanizer() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return <Navigate to="/" replace />

  const [mode, setMode] = useState<Mode>("humanize")
  const [tone, setTone] = useState<Tone>("professional")
  const [strength, setStrength] = useState<Strength>("balanced")
  const [twoPass, setTwoPass] = useState(false)
  const [pastedText, setPastedText] = useState("")
  const [attachedFile, setAttachedFile] = useState<{ name: string; isExtracting?: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const chat = useChat({
    endpoint: "/humanizer/stream",
    streamEndpoint: "/humanizer/stream",
    page: "humanizer",
    parseResult,
    buildBody: useCallback(
      (query: string) => ({
        text: query,
        tone,
        strength,
        twoPass,
        scanOnly: mode === "scan",
      }),
      [tone, strength, twoPass, mode]
    ),
    errorMessage: "Failed to process text. Please try again.",
  })

  // ─── File Upload ────────────────────────────────────────

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
        throw new Error(err.error || "Upload failed")
      }

      const data = await response.json()
      setPastedText(data.text)
      setAttachedFile({ name: `${file.name} (${data.wordCount.toLocaleString()} words)` })
    } catch (error) {
      console.error("File upload failed:", error)
      setAttachedFile(null)
      alert(error instanceof Error ? error.message : "Failed to extract text from file")
    }
  }, [])

  const handleChatFileSelect = useCallback(
    async (file: File) => {
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
          throw new Error("Upload failed")
        }

        const data = await response.json()
        setAttachedFile({ name: `${file.name} (${data.wordCount.toLocaleString()} words)` })
        chat.handleSubmit(data.text)
      } catch (error) {
        console.error("File upload failed:", error)
        setAttachedFile(null)
      }
    },
    [chat]
  )

  // ─── Submit from Workspace ──────────────────────────────

  const handleWorkspaceSubmit = useCallback(() => {
    if (!pastedText.trim()) return
    chat.handleSubmit(pastedText.trim())
    setPastedText("")
    setAttachedFile(null)
  }, [pastedText, chat])

  // ─── Custom Content Renderer ──────────────────────────────
  // For assistant messages with humanized text: show in a clean
  // output panel. For scan-only or other messages: use default markdown.

  const renderContent = useCallback(
    (message: ChatMessage) => {
      if (message.role !== "assistant") return undefined

      // Humanize mode produces rewritten text — show in a clean, copy-friendly panel
      // Scan mode produces analysis text — use default markdown rendering
      const isHumanizeResult = message.metadata?.mode === "humanize" && message.content.length > 50

      if (isHumanizeResult) {
        return <RewrittenTextPanel content={message.content} messageId={message.id} />
      }

      // Fall back to default MarkdownRenderer
      return undefined
    },
    []
  )

  // ─── Render Extra Content (Human Score Panel) ───────────

  const renderExtraContent = useCallback(
    (message: ChatMessage) => {
      if (message.role !== "assistant") return null
      if (!message.metadata?.humanScore && message.metadata?.humanScore !== 0) return null
      return <HumanScorePanel message={message} onSubmit={chat.handleSubmit} />
    },
    [chat.handleSubmit]
  )

  const quickActions = mode === "scan" ? SCAN_ACTIONS : HUMANIZE_ACTIONS
  const wordCount = pastedText.split(/\s+/).filter(Boolean).length

  return (
    <ChatContainer
      messages={chat.messages}
      isLoading={chat.isLoading}
      isStreaming={chat.isStreaming}
      inputValue={chat.inputValue}
      setInputValue={chat.setInputValue}
      onSubmit={chat.handleSubmit}
      theme={theme}
      copiedId={chat.copiedId}
      onCopy={chat.handleCopy}
      onFeedback={chat.handleFeedback}
      messagesEndRef={chat.messagesEndRef}
      inputRef={chat.inputRef}
      placeholder="Refine further... 'make it shorter', 'more casual', 'scan this version'"
      quickActions={quickActions}
      renderContent={renderContent}
      renderExtraContent={renderExtraContent}
      onFileSelect={handleChatFileSelect}
      attachedFile={attachedFile}
      onFileRemove={() => setAttachedFile(null)}
      sidebar={
        <ChatHistorySidebar
          conversations={chat.conversationList}
          activeId={chat.conversationId}
          theme={theme}
          onSelect={chat.loadConversation}
          onNew={chat.startNewConversation}
          onDelete={chat.deleteConversation}
          onRename={chat.renameConversation}
        />
      }
      statusBar={
        chat.messages.length > 0 ? (
          <div className="border-b border-slate-200/60 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-6 py-2 flex items-center gap-4 text-xs flex-wrap">
              {/* Mode */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMode("humanize")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all duration-200 ${
                    mode === "humanize"
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Wand2 size={11} />
                  Humanize
                </button>
                <button
                  onClick={() => setMode("scan")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all duration-200 ${
                    mode === "scan"
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Search size={11} />
                  Scan
                </button>
              </div>

              {mode === "humanize" && (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                  <PillSelector label="Tone" options={["professional", "conversational", "academic"]} value={tone} onChange={setTone} />
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                  <PillSelector label="Strength" options={["light", "balanced", "heavy"]} value={strength} onChange={setStrength} />
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={twoPass}
                      onChange={() => setTwoPass(!twoPass)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Two-pass</span>
                  </label>
                </>
              )}
            </div>
          </div>
        ) : undefined
      }
      emptyState={
        <div className="flex flex-col items-center py-16 text-center animate-fade-in">
          {/* Hero Icon */}
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
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-10 text-[15px] leading-relaxed">
            Paste AI-generated text below. Score it for detectability, or rewrite it to sound human.
          </p>

          {/* Single centered textarea */}
          <div className="w-full max-w-2xl mb-5">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste your AI-generated text here..."
              className="w-full min-h-[180px] max-h-[400px] rounded-xl border border-slate-200/80 dark:border-slate-700
                         bg-white dark:bg-slate-800 px-5 py-4 text-[15px] text-slate-900 dark:text-white leading-relaxed
                         placeholder:text-slate-400 dark:placeholder:text-slate-500
                         hover:border-slate-300 dark:hover:border-slate-600
                         focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10
                         resize-none transition-all duration-200
                         shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            />
            <div className="flex items-center justify-between mt-2 px-1">
              {pastedText ? (
                <span className="text-xs text-slate-400 tabular-nums">
                  {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                </span>
              ) : <span />}

              {/* Upload option */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500
                           hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <Upload size={12} />
                {attachedFile ? attachedFile.name : "or upload a file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ""
                }}
                className="hidden"
              />
            </div>
          </div>

          {/* Mode + Controls */}
          <div className="w-full max-w-2xl space-y-3 mb-6">
            {/* Mode toggle */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setMode("scan")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                  ${
                    mode === "scan"
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-700"
                  }`}
              >
                <Search size={15} />
                Scan & Score
              </button>
              <button
                onClick={() => setMode("humanize")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                  ${
                    mode === "humanize"
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-700"
                  }`}
              >
                <Wand2 size={15} />
                Humanize
              </button>
            </div>

            {/* Humanize controls */}
            {mode === "humanize" && (
              <div className="flex items-center justify-center gap-4 flex-wrap animate-fade-in">
                <PillSelector
                  label="Tone"
                  options={["professional", "conversational", "academic"]}
                  value={tone}
                  onChange={setTone}
                />
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                <PillSelector
                  label="Strength"
                  options={["light", "balanced", "heavy"]}
                  value={strength}
                  onChange={setStrength}
                />
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={twoPass}
                    onChange={() => setTwoPass(!twoPass)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Two-pass</span>
                </label>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleWorkspaceSubmit}
            disabled={!pastedText.trim() || chat.isLoading}
            className="w-full max-w-2xl py-3 rounded-xl text-white font-medium text-sm
                       bg-gradient-to-r from-amber-500 to-orange-500
                       hover:from-amber-600 hover:to-orange-600
                       shadow-[0_4px_12px_rgba(245,158,11,0.3)]
                       hover:shadow-[0_6px_20px_rgba(245,158,11,0.4)]
                       transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[0_4px_12px_rgba(245,158,11,0.3)]
                       flex items-center justify-center gap-2"
          >
            {chat.isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === "scan" ? (
              <>
                <Search size={18} />
                Scan This Text
              </>
            ) : (
              <>
                <Wand2 size={18} />
                Humanize This Text
              </>
            )}
          </button>
        </div>
      }
    />
  )
}
