import { useState, useEffect, useRef, useCallback } from "react"
import {
  Sparkles,
  Send,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react"
import { fetchSSE } from "@/lib/api"
import type { ClientChatContext } from "./types"
import { ChatMarkdown } from "./ChatMarkdown"

interface AIChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  followUpPrompts?: string[]
}

let msgCounter = 0
function nextMsgId(role: string): string {
  return `${role}-${++msgCounter}-${Date.now()}`
}

const CHAT_STARTERS = [
  "What are the strongest proof points for a new proposal?",
  "Summarize this client's history with Stamats",
  "Draft a case study intro from their results",
  "What's our win rate and top services for this client?",
]

export function ClientAIChat({ context, clientName, smartStarters }: { context: ClientChatContext; clientName: string; smartStarters?: string[] }) {
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Reset chat when client changes
  useEffect(() => {
    setMessages([])
    setInput("")
    setStreamingText("")
    setError(null)
    setCollapsed(false)
  }, [clientName])

  // Auto-scroll as tokens stream
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [streamingText, messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    setError(null)
    const userMsg: AIChatMessage = { id: nextMsgId("user"), role: "user", content: text.trim() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput("")
    setStreamingText("")
    setStreaming(true)
    setCollapsed(false)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      await fetchSSE(
        "/ai/client-chat/stream",
        {
          query: text.trim(),
          clientContext: context,
          conversationHistory: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        },
        {
          onToken: token => {
            setStreamingText(prev => prev + token)
          },
          onDone: data => {
            setMessages(prev => [
              ...prev,
              { id: nextMsgId("assistant"), role: "assistant", content: data.cleanResponse, followUpPrompts: data.followUpPrompts || [] },
            ])
            setStreamingText("")
            setStreaming(false)
          },
          onError: msg => {
            setError(msg)
            setStreaming(false)
            setStreamingText("")
          },
        },
        abort.signal
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Something went wrong")
      setStreaming(false)
      setStreamingText("")
    }
  }, [messages, context, streaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    if (streamingText) {
      setMessages(prev => [...prev, { id: nextMsgId("assistant"), role: "assistant", content: streamingText }])
    }
    setStreamingText("")
    setStreaming(false)
  }

  const lastAssistantMsg = messages.filter(m => m.role === "assistant").slice(-1)[0]
  const followUps = lastAssistantMsg?.followUpPrompts ?? []

  return (
    <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-2xl overflow-hidden bg-gradient-to-b from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-900">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/40 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
      >
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)", boxShadow: "0 2px 8px rgba(14,165,233,0.3)" }}
        >
          <Sparkles size={13} className="text-white" strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Ask AI about this client</span>
          <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40">GPT-4o</span>
        </div>
        {messages.length > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1">{messages.filter(m => m.role === "user").length} message{messages.filter(m => m.role === "user").length !== 1 ? "s" : ""}</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); setMessages([]); setStreamingText(""); setError(null) }}
          className={`p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors mr-0.5 ${messages.length === 0 ? "opacity-0 pointer-events-none" : ""}`}
          title="Clear conversation"
        >
          <RotateCcw size={12} />
        </button>
        {collapsed ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {!collapsed && (
        <div className="flex flex-col">
          {/* Message history */}
          {messages.length > 0 || streaming ? (
            <div className="max-h-[420px] overflow-y-auto px-5 py-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}
                    >
                      <Sparkles size={11} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] ${msg.role === "user" ? "order-first" : ""}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-sky-600 text-white rounded-br-sm ml-auto"
                          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/40 rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "assistant"
                        ? <ChatMarkdown text={msg.content} />
                        : msg.content
                      }
                    </div>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-400">
                      U
                    </div>
                  )}
                </div>
              ))}
              {streaming && streamingText && (
                <div className="flex gap-2.5 justify-start">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}
                  >
                    <Sparkles size={11} className="text-white" />
                  </div>
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/40">
                      <ChatMarkdown text={streamingText} />
                      <span className="inline-block w-1.5 h-4 bg-sky-500 animate-pulse ml-0.5 rounded-sm align-middle" />
                    </div>
                  </div>
                </div>
              )}
              {streaming && !streamingText && (
                <div className="flex gap-2.5 justify-start">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}
                  >
                    <Sparkles size={11} className="text-white" />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              {error && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          ) : (
            // Empty state: starter prompts
            <div className="px-5 py-5">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 font-medium uppercase tracking-widest">Try asking…</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(smartStarters ?? CHAT_STARTERS).map(starter => (
                  <button
                    key={starter}
                    onClick={() => sendMessage(starter)}
                    className="text-left px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/40 text-sm text-slate-700 dark:text-slate-300 hover:border-sky-300 dark:hover:border-sky-600/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-all duration-200 leading-snug"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up chips */}
          {!streaming && followUps.length > 0 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {followUps.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  className="text-xs px-3 py-1.5 rounded-full bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-slate-200/60 dark:border-slate-700/40 px-4 py-3 bg-white/60 dark:bg-slate-900/60 flex items-end gap-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask anything about ${clientName}…`}
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all max-h-32 overflow-y-auto disabled:opacity-50"
              style={{ lineHeight: "1.5" }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = Math.min(el.scrollHeight, 128) + "px"
              }}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors"
                title="Stop"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white transition-colors"
                title="Send"
              >
                <Send size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
