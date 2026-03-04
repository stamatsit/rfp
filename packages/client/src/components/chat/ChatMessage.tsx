import {
  Bot,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
} from "lucide-react"
import DOMPurify from "dompurify"
import { Button, Card, CardContent } from "@/components/ui"
import { MarkdownRenderer } from "./MarkdownRenderer"
import { InlineChart } from "./InlineChart"
import type { ChatMessage as ChatMessageType, ChatTheme } from "@/types/chat"
import { memo, type ReactNode } from "react"

interface ChatMessageProps {
  message: ChatMessageType
  theme: ChatTheme
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  onFeedback: (id: string, score: "up" | "down") => void
  onFollowUp: (prompt: string) => void
  dataContextPanel?: ReactNode
  extraContent?: ReactNode
  renderContent?: (message: ChatMessageType) => ReactNode
  renderActions?: (message: ChatMessageType) => ReactNode
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  theme,
  copiedId,
  onCopy,
  onFeedback,
  onFollowUp,
  dataContextPanel,
  extraContent,
  renderContent,
  renderActions,
}: ChatMessageProps) {
  return (
    <div
      className={`flex gap-4 animate-fade-in-up ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      {message.role === "assistant" && (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: theme.botGradient, boxShadow: theme.botShadow }}
        >
          <Bot size={18} className="text-white" />
        </div>
      )}

      <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
        {message.role === "user" ? (
          <div className={`${theme.userBubbleBg} text-slate-800 px-5 py-3.5 rounded-2xl rounded-tr-md ${theme.userBubbleShadow} border ${theme.userBubbleBorder}`}>
            <p className="leading-relaxed text-[15px]">{message.content}</p>
          </div>
        ) : message.refused ? (
          <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_8px_rgba(245,158,11,0.08)]">
            <CardContent className="p-5">
              <p className="text-amber-800 text-[15px]">
                {message.refusalReason || "Unable to process request."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="group border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <CardContent className="p-5 space-y-4">
              {renderContent?.(message) ?? <MarkdownRenderer content={message.content} />}

              {message.chartData && <InlineChart config={message.chartData} theme={theme} />}

              {message.svgData && (
                <div className="my-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{message.svgData.title}</p>
                  <div
                    className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.svgData.svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
                  />
                </div>
              )}

              {extraContent}

              {dataContextPanel}

              {/* Follow-up Prompts */}
              {message.followUpPrompts && message.followUpPrompts.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Lightbulb size={12} className={`text-${theme.primary}-500`} />
                    <span className="font-medium">Dig deeper:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.followUpPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => onFollowUp(prompt)}
                        className={`px-3 py-1.5 ${theme.accentBg} ${theme.accentBgHover} ${theme.accentBgDark} ${theme.accentBgHoverDark}
                                   ${theme.accentText} ${theme.accentTextDark} text-xs rounded-full border ${theme.accentBorder} ${theme.accentBorderDark}
                                   transition-colors`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-1 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => onCopy(message.content, message.id)}
                >
                  {copiedId === message.id ? (
                    <>
                      <Check size={12} className={`mr-1.5 text-${theme.primary}-500`} />
                      <span className={`text-${theme.primary}-600`}>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="mr-1.5" />
                      Copy
                    </>
                  )}
                </Button>

                {renderActions?.(message)}

                {/* Feedback */}
                <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onFeedback(message.id, "up")}
                    className={`p-1.5 rounded-lg transition-colors ${
                      message.feedback === "up"
                        ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    onClick={() => onFeedback(message.id, "down")}
                    className={`p-1.5 rounded-lg transition-colors ${
                      message.feedback === "down"
                        ? "text-red-500 bg-red-50 dark:bg-red-900/30"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <ThumbsDown size={13} />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-slate-400 mt-1.5 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {message.role === "user" && (
        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <img src="/stamats-logo.png" alt="" className="w-6 h-6 object-contain" />
        </div>
      )}
    </div>
  )
})
