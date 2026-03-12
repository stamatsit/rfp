import { useState, useCallback, useRef, useEffect } from "react"
import {
  Sparkles, PanelLeftOpen, PanelLeftClose, MessageSquarePlus, History,
  Send, Loader2, GraduationCap, Stethoscope, Palette, Globe, BarChart3, TrendingUp,
  Trash2, Pencil, Check as CheckIcon, X,
} from "lucide-react"
import { useChat } from "@/hooks/useChat"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { loadSettings } from "@/components/SettingsPanel"
import type { UseDeckStoreReturn } from "@/hooks/useDeckStore"
import type { PitchDeckOutput } from "@/types/deck"
import type { ConversationSummary } from "@/lib/api"

// ── Quick Actions ────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: GraduationCap, label: "Enrollment Pitch", prompt: "Create a pitch deck for university enrollment marketing services. Include our strongest higher ed results and testimonials." },
  { icon: Stethoscope, label: "Healthcare", prompt: "Build a pitch deck for healthcare marketing services. Focus on our healthcare client results and ROI data." },
  { icon: Palette, label: "Brand Refresh", prompt: "Design a pitch deck proposing a brand refresh for a university." },
  { icon: Globe, label: "Digital Strategy", prompt: "Create a digital marketing strategy pitch deck. Highlight our SEO, web, and digital campaign results." },
  { icon: BarChart3, label: "Competitive", prompt: "Build a pitch deck with competitive comparison slides showing Stamats' advantages." },
  { icon: TrendingUp, label: "ROI Case", prompt: "Design a deck that builds the business case with ROI data from our client success database." },
]

// ── Props ────────────────────────────────────────────────────

interface DeckChatSidebarProps {
  deckStore: UseDeckStoreReturn
  collapsed: boolean
  onToggleCollapse: () => void
}

// ── Component ────────────────────────────────────────────────

export function DeckChatSidebar({ deckStore, collapsed, onToggleCollapse }: DeckChatSidebarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastLoadedDeckRef = useRef<string | null>(null)
  const responseLength = loadSettings().aiResponseLength

  const chat = useChat({
    endpoint: "/pitch-deck/query",
    streamEndpoint: "/pitch-deck/stream",
    page: "pitch-deck",
    parseResult: (data) => ({
      content: data.response as string,
      followUpPrompts: data.followUpPrompts as string[] | undefined,
      refused: data.refused as boolean | undefined,
      refusalReason: data.refusalReason as string | undefined,
      metadata: data.dataUsed as Record<string, unknown> | undefined,
    }),
    buildBody: useCallback((query: string) => ({ query, responseLength }), [responseLength]),
    parseMetadata: useCallback((data: Record<string, unknown>) =>
      (data.dataUsed as Record<string, unknown>) ?? data
    , []),
    errorMessage: "Failed to connect to pitch deck service.",
  })

  // Bridge: detect deckData from AI and load into deck store
  useEffect(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const msg = chat.messages[i]
      if (msg?.role === "assistant" && msg.metadata?.deckData) {
        if (msg.id !== lastLoadedDeckRef.current) {
          lastLoadedDeckRef.current = msg.id
          deckStore.loadFromAI(msg.metadata.deckData as PitchDeckOutput)
        }
        break
      }
    }
  }, [chat.messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Strip DECK_DATA from display content
  const stripDeckData = (content: string) =>
    content.replace(/DECK_DATA:\s*\{[\s\S]*\}\s*$/m, "").replace(/FOLLOW_UP_PROMPTS:\s*\[.*?\]/s, "").trim()

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }, [chat.inputValue])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat.messages])

  const handleSubmit = useCallback((query?: string) => {
    chat.handleSubmit(query)
  }, [chat])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // History popover
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!historyOpen) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [historyOpen])

  // Renaming conversations
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Collapsed view
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-white dark:bg-slate-900 py-4 gap-2">
        <button onClick={onToggleCollapse} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all" title="Expand AI sidebar">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button onClick={onToggleCollapse} className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all" title="AI">
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const hasMessages = chat.messages.length > 0

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 flex-shrink-0 border-b border-slate-100/60 dark:border-slate-800/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tracking-tight">AI</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => { chat.startNewConversation(); setHistoryOpen(false) }} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all" title="New conversation">
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={historyRef}>
            <button onClick={() => setHistoryOpen(!historyOpen)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${historyOpen ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"}`} title="History">
              <History className="w-3.5 h-3.5" />
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-9 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-700/50 overflow-hidden z-20 animate-scale-in">
                <div className="px-3 py-2 border-b border-slate-100/60 dark:border-slate-700/40">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">History</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {chat.conversationList.length === 0 ? (
                    <p className="px-3 py-4 text-[11px] text-slate-400 dark:text-slate-500 text-center">No conversations yet</p>
                  ) : (
                    chat.conversationList.map((conv: ConversationSummary) => (
                      <div key={conv.id} className={`group flex items-center gap-2 px-3 py-2 text-[11px] cursor-pointer transition-colors ${conv.id === chat.conversationId ? "bg-blue-50/60 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
                        {renamingId === conv.id ? (
                          <div className="flex-1 flex items-center gap-1">
                            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="flex-1 text-[11px] bg-transparent border-b border-blue-400 outline-none" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { chat.renameConversation(conv.id, renameValue); setRenamingId(null) } if (e.key === "Escape") setRenamingId(null) }} />
                            <button onClick={() => { chat.renameConversation(conv.id, renameValue); setRenamingId(null) }} className="p-0.5"><CheckIcon className="w-3 h-3 text-blue-500" /></button>
                            <button onClick={() => setRenamingId(null)} className="p-0.5"><X className="w-3 h-3 text-slate-400" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 truncate" onClick={() => { chat.loadConversation(conv.id); setHistoryOpen(false) }}>{conv.title}</span>
                            <div className="hidden group-hover:flex items-center gap-0.5">
                              <button onClick={() => { setRenamingId(conv.id); setRenameValue(conv.title) }} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"><Pencil className="w-2.5 h-2.5" /></button>
                              <button onClick={() => chat.deleteConversation(conv.id)} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={onToggleCollapse} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all" title="Collapse">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages or empty state */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="px-3 py-6">
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Describe the pitch deck you want and AI will build it with real Stamats data.
            </p>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSubmit(action.prompt)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-left
                             text-slate-600 dark:text-slate-300 hover:bg-blue-50/60 dark:hover:bg-blue-900/15
                             hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-150"
                >
                  <action.icon className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {chat.messages.map((msg) => (
              <div key={msg.id} className={`text-[12px] leading-relaxed ${msg.role === "user" ? "text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-300"}`}>
                {msg.role === "user" ? (
                  <div className="bg-blue-50/60 dark:bg-blue-900/15 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-200">
                    {msg.content}
                  </div>
                ) : msg.refused ? (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-red-600 dark:text-red-400 text-[11px]">
                    {msg.refusalReason || "Something went wrong."}
                  </div>
                ) : (
                  <div className="prose-xs [&_*]:text-[12px] [&_*]:leading-relaxed [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_ul]:pl-4 [&_ol]:pl-4 [&_p]:mb-1.5">
                    <MarkdownRenderer content={stripDeckData(msg.content)} />
                  </div>
                )}
              </div>
            ))}
            {chat.isStreaming && (
              <div className="flex items-center gap-2 px-2 py-1">
                <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                <span className="text-[10px] text-slate-400">Generating deck...</span>
              </div>
            )}
            {/* Follow-up prompts */}
            {!chat.isStreaming && chat.messages.length > 0 && (() => {
              const last = [...chat.messages].reverse().find(m => m.role === "assistant" && !m.refused)
              return last?.followUpPrompts?.length ? (
                <div className="space-y-1 pt-1">
                  {last.followUpPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSubmit(prompt)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-slate-500 dark:text-slate-400
                                 hover:bg-blue-50/60 dark:hover:bg-blue-900/15 hover:text-blue-600 dark:hover:text-blue-300
                                 transition-colors border border-transparent hover:border-blue-200/40 dark:hover:border-blue-700/30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null
            })()}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-slate-100/60 dark:border-slate-800/60 p-2">
        <div className="flex items-end gap-1.5 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-200/40 dark:border-slate-700/40 focus-within:border-blue-300 dark:focus-within:border-blue-700 transition-colors">
          <textarea
            ref={textareaRef}
            value={chat.inputValue}
            onChange={(e) => chat.setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your pitch deck..."
            rows={1}
            className="flex-1 bg-transparent text-[12px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none leading-relaxed max-h-[120px]"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!chat.inputValue.trim() || chat.isLoading}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                       bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40
                       transition-colors shadow-sm"
          >
            {chat.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  )
}
