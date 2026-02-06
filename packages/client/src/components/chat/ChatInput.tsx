import { useRef, useEffect, useCallback } from "react"
import { Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui"
import type { ChatTheme, QuickAction } from "@/types/chat"

interface ChatInputProps {
  inputValue: string
  setInputValue: (v: string) => void
  onSubmit: (query?: string) => void
  isLoading: boolean
  theme: ChatTheme
  placeholder?: string
  quickActions?: QuickAction[]
  showQuickActions?: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}

export function ChatInput({
  inputValue,
  setInputValue,
  onSubmit,
  isLoading,
  theme,
  placeholder = "Ask a question...",
  quickActions,
  showQuickActions = false,
  inputRef,
}: ChatInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef || internalRef

  const adjustHeight = useCallback(() => {
    const el = (ref as React.RefObject<HTMLTextAreaElement>).current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [ref])

  useEffect(() => {
    adjustHeight()
  }, [inputValue, adjustHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <footer className="sticky bottom-0 border-t border-slate-200/60 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
      <div className="max-w-4xl mx-auto px-6 py-4">
        {showQuickActions && quickActions && quickActions.length > 0 && (
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
            <span className="text-xs text-slate-400 whitespace-nowrap">Quick:</span>
            {quickActions.slice(0, 4).map(action => (
              <button
                key={action.label}
                onClick={() => onSubmit(action.prompt)}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-full
                           bg-slate-100 dark:bg-slate-800
                           text-slate-600 dark:text-slate-300
                           border border-transparent
                           hover:${theme.accentBg} ${theme.accentBgHoverDark || ""}
                           hover:${theme.accentText} ${theme.accentTextDark ? `dark:hover:${theme.accentTextDark.replace("dark:", "")}` : ""}
                           hover:${theme.accentBorder} ${theme.accentBorderDark ? `dark:hover:${theme.accentBorderDark.replace("dark:", "")}` : ""}
                           transition-all duration-200 disabled:opacity-50`}
              >
                <action.icon size={12} />
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={ref as React.RefObject<HTMLTextAreaElement>}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={placeholder}
              className="flex w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800
                         px-4 py-3 text-[15px] text-slate-900 dark:text-white leading-relaxed
                         shadow-[0_1px_2px_rgba(0,0,0,0.02)]
                         transition-all duration-200 ease-out
                         placeholder:text-slate-400 dark:placeholder:text-slate-500
                         hover:border-slate-300 dark:hover:border-slate-600
                         focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10
                         disabled:cursor-not-allowed disabled:opacity-50
                         resize-none overflow-hidden"
              style={{ minHeight: "48px", maxHeight: "200px" }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
            />
          </div>

          <Button
            onClick={() => onSubmit()}
            disabled={!inputValue.trim() || isLoading}
            size="lg"
            className={`h-12 px-6 rounded-xl ${theme.sendButtonGradient} ${theme.sendButtonHoverGradient} ${theme.sendButtonShadow}`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </Button>
        </div>
      </div>
    </footer>
  )
}
