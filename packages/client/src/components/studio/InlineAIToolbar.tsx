import { useState, useCallback, useRef, useEffect } from "react"
import { Sparkles, Wand2, Minimize2, Maximize2, Type, Check, X, ChevronDown, Loader2, CornerDownLeft } from "lucide-react"
import { fetchSSE } from "@/lib/api"

interface InlineAIToolbarProps {
  selectedText: string
  position: { top: number; left: number }
  documentContext: string
  onApply: (newText: string) => void
  onClose: () => void
}

type ActionId = "rewrite" | "shorten" | "expand" | "grammar" | "tone-formal" | "tone-casual" | "tone-confident" | "custom"

interface QuickAction {
  id: ActionId
  label: string
  icon: typeof Sparkles
  description: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "rewrite", label: "Rewrite", icon: Wand2, description: "Rewrite this text differently" },
  { id: "shorten", label: "Shorten", icon: Minimize2, description: "Make it more concise" },
  { id: "expand", label: "Expand", icon: Maximize2, description: "Add more detail" },
  { id: "grammar", label: "Fix Grammar", icon: Type, description: "Fix grammar and spelling" },
]

const TONE_OPTIONS = [
  { id: "tone-formal" as ActionId, label: "More Formal" },
  { id: "tone-casual" as ActionId, label: "More Casual" },
  { id: "tone-confident" as ActionId, label: "More Confident" },
]

export function InlineAIToolbar({ selectedText, position, documentContext, onApply, onClose }: InlineAIToolbarProps) {
  const [mode, setMode] = useState<"actions" | "streaming" | "result" | "custom">("actions")
  const [streamedText, setStreamedText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")
  const [showToneMenu, setShowToneMenu] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const customInputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const toneMenuRef = useRef<HTMLDivElement>(null)

  // Close tone menu on outside click
  useEffect(() => {
    if (!showToneMenu) return
    const handler = (e: MouseEvent) => {
      if (toneMenuRef.current && !toneMenuRef.current.contains(e.target as Node)) {
        setShowToneMenu(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showToneMenu])

  // Focus custom input when switching to custom mode
  useEffect(() => {
    if (mode === "custom") {
      setTimeout(() => customInputRef.current?.focus(), 50)
    }
  }, [mode])

  const runAction = useCallback(async (action: ActionId, customInstruction?: string) => {
    setMode("streaming")
    setStreamedText("")
    setIsStreaming(true)
    setShowToneMenu(false)

    const controller = new AbortController()
    abortRef.current = controller

    let accumulated = ""

    try {
      await fetchSSE(
        "/studio/inline-edit",
        {
          selectedText,
          action,
          customInstruction,
          documentContext: documentContext.slice(0, 3000),
        },
        {
          onToken: (token: string) => {
            accumulated += token
            setStreamedText(accumulated)
          },
          onDone: (data: Record<string, unknown>) => {
            if (data.result && typeof data.result === "string") {
              setStreamedText(data.result)
            }
            setIsStreaming(false)
            setMode("result")
          },
          onError: (err: string) => {
            console.error("Inline AI error:", err)
            setIsStreaming(false)
            setMode("actions")
          },
        },
        controller.signal
      )
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Inline AI fetch error:", err)
      }
      setIsStreaming(false)
      if (mode === "streaming") setMode("actions")
    }
  }, [selectedText, documentContext, mode])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStreamedText("")
    setMode("actions")
  }, [])

  const handleApply = useCallback(() => {
    if (streamedText.trim()) {
      onApply(streamedText.trim())
    }
  }, [streamedText, onApply])

  const handleCustomSubmit = useCallback(() => {
    if (customPrompt.trim()) {
      runAction("custom", customPrompt.trim())
    }
  }, [customPrompt, runAction])

  // Calculate position (clamp to viewport)
  const toolbarStyle: React.CSSProperties = {
    top: position.top,
    left: Math.max(8, Math.min(position.left, window.innerWidth - 380)),
  }

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 animate-fade-in-up"
      style={toolbarStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{ minWidth: 320, maxWidth: 420 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">AI Edit</span>
          </div>
          <button onClick={onClose} className="p-0.5 hover:bg-white/20 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selected text preview */}
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-0.5">Selected text</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            "{selectedText.slice(0, 150)}{selectedText.length > 150 ? "..." : ""}"
          </p>
        </div>

        {/* Actions mode */}
        {mode === "actions" && (
          <div className="p-2">
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.id}
                    onClick={() => runAction(action.id)}
                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg transition-colors text-left"
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    {action.label}
                  </button>
                )
              })}
            </div>

            {/* Tone dropdown */}
            <div className="relative mt-1.5" ref={toneMenuRef}>
              <button
                onClick={() => setShowToneMenu(!showToneMenu)}
                className="flex items-center justify-between w-full px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg transition-colors"
              >
                <span>Change Tone</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showToneMenu ? "rotate-180" : ""}`} />
              </button>
              {showToneMenu && (
                <div className="absolute left-0 right-0 mt-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 py-0.5">
                  {TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => runAction(opt.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom prompt */}
            <div className="mt-1.5 border-t border-slate-100 dark:border-slate-700 pt-2">
              <button
                onClick={() => setMode("custom")}
                className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Custom instruction...
              </button>
            </div>
          </div>
        )}

        {/* Custom prompt input */}
        {mode === "custom" && (
          <div className="p-2">
            <div className="relative">
              <textarea
                ref={customInputRef}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCustomSubmit()
                  }
                  if (e.key === "Escape") {
                    setMode("actions")
                  }
                }}
                placeholder="e.g. Make this sound more persuasive..."
                className="w-full px-3 py-2 pr-8 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                rows={2}
              />
              <button
                onClick={handleCustomSubmit}
                disabled={!customPrompt.trim()}
                className="absolute right-2 bottom-2 p-1 text-emerald-500 hover:text-emerald-600 disabled:text-slate-300 dark:disabled:text-slate-600 transition-colors"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setMode("actions")}
              className="mt-1.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Back to quick actions
            </button>
          </div>
        )}

        {/* Streaming / Result */}
        {(mode === "streaming" || mode === "result") && (
          <div className="p-3">
            <div className="relative">
              {isStreaming && (
                <div className="absolute top-2 right-2">
                  <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                </div>
              )}
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                {streamedText || (
                  <span className="text-slate-400 dark:text-slate-500 italic">Generating...</span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2.5">
              {mode === "result" ? (
                <>
                  <button
                    onClick={handleApply}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Apply
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Discard
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
