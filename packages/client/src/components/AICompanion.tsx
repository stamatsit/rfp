import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import {
  X,
  Minus,
  Trash2,
  Send,
  Square,
  ChevronRight,
  Copy,
  Check,
  History,
  ArrowLeft,
  Clock,
  MoreVertical,
  Pencil,
  Trash,
} from "lucide-react"

function BotMessageSquareIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 6V2H8"/>
      <path d="M15 11v2"/>
      <path d="M2 12h2"/>
      <path d="M20 12h2"/>
      <path d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>
      <path d="M9 11v2"/>
    </svg>
  )
}
import { useAuth } from "@/contexts/AuthContext"
import { useChat } from "@/hooks/useChat"
import { useCompanionBehavior } from "@/hooks/useCompanionBehavior"
import { MarkdownRenderer } from "@/components/chat"
import { loadSettings, saveSettings } from "@/components/SettingsPanel"
import { toast } from "@/hooks/useToast"
import { CHAT_THEMES, type ChatMessage } from "@/types/chat"

const theme = CHAT_THEMES.sky

// ─── Parse result from streaming ─────────────────────────────
const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
})

// Parse metadata to extract data source stats
const parseMetadata = (data: Record<string, unknown>) => {
  const stats = data.stats as Record<string, number> | undefined
  return stats ? { stats } : {}
}

// ─── Context-aware starter prompts ──────────────────────────
const DEFAULT_STARTERS = [
  "What's our overall win rate and best-performing services?",
  "Find me a case study or testimonial I can use in a proposal",
  "I have a new RFP — walk me through responding to it",
  "What are our strongest proof points and stats?",
]

const PAGE_STARTERS: Record<string, string[]> = {
  "/": [
    "Give me a quick summary of our win rates and proposal stats",
    "What should I work on today?",
    "Show me our most recent wins",
    "What features should I try?",
  ],
  "/search": [
    "What topics do we have the most Q&A content for?",
    "Help me find answers about our enrollment marketing approach",
    "Are there any gaps in our library I should fill?",
    "Summarize our strongest Q&A entries",
  ],
  "/ai": [
    "What kind of questions work best with Ask AI?",
    "Help me draft a response about our digital marketing services",
    "What topics have the most approved content?",
    "How is Ask AI different from Unified AI?",
  ],
  "/insights": [
    "What's our win rate trend over the last 3 years?",
    "Which services have the highest win rate?",
    "Compare our performance across school types",
    "Who are our top-performing account executives?",
  ],
  "/case-studies": [
    "What are our most impressive client results?",
    "Find me a testimonial about enrollment growth",
    "Which case studies have the best metrics?",
    "What awards have we won recently?",
  ],
  "/studio": [
    "Help me outline a proposal for a private university",
    "What sections should a strong proposal include?",
    "Find me proof points I can drop into my document",
    "How do I use templates and slash commands?",
  ],
  "/analyze": [
    "What should I look for when analyzing an RFP?",
    "How do I match RFP requirements to our library?",
    "Walk me through the RFP analysis workflow",
    "What services do we win most often for?",
  ],
  "/photos": [
    "How do I organize photos for proposals?",
    "Can photos be linked to Q&A entries?",
    "What image formats are supported?",
    "How should I tag and describe photos?",
  ],
  "/unified-ai": [
    "How is Unified AI different from the other AI tools?",
    "Cross-reference our win rates with case study results",
    "What are our strongest selling points across all data?",
    "Compare our proposal data with client success stories",
  ],
}

// ─── Data source badge ───────────────────────────────────────
function DataSourceBadge({ metadata }: { metadata?: Record<string, unknown> }) {
  if (!metadata?.stats) return null
  const s = metadata.stats as Record<string, number>
  const parts: string[] = []
  if (s.proposals) parts.push(`${s.proposals} proposals`)
  if (s.libraryAnswers) parts.push(`${s.libraryAnswers} Q&A matches`)
  if (s.caseStudies) parts.push(`${s.caseStudies} case studies`)
  if (parts.length === 0) return null
  return (
    <span className="text-[9px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-full">
      Data: {parts.join(" · ")}
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────
export function AICompanion() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { getSuggestion, getContextForPrompt } = useCompanionBehavior()

  const [enabled, setEnabled] = useState(() => loadSettings().companionEnabled)
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyMenuId, setHistoryMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Drag state
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: 0, y: 0 })
  const hasCustomPosition = useRef(false)

  // Apply settings changes requested by the AI
  const handleAction = useCallback((actions: Array<{ key: string; value: unknown; label: string }>) => {
    const current = loadSettings()
    const updated = { ...current }
    for (const action of actions) {
      (updated as Record<string, unknown>)[action.key] = action.value
    }
    saveSettings(updated)
    // Show confirmation for last action label (or combined)
    const label = actions.length === 1
      ? actions[0]!.label
      : `${actions.length} settings updated`
    toast.success(label)
  }, [])

  // Chat hook
  const chat = useChat({
    endpoint: "/companion/stream",
    streamEndpoint: "/companion/stream",
    page: "companion",
    parseResult,
    parseMetadata,
    onAction: handleAction,
    buildBody: useCallback((query: string) => ({
      query,
      behaviorContext: getContextForPrompt(),
    }), [getContextForPrompt]),
  })

  // Context-aware starters based on current page
  const starters = useMemo(() => {
    return PAGE_STARTERS[location.pathname] || DEFAULT_STARTERS
  }, [location.pathname])

  // Listen for settings changes
  useEffect(() => {
    const handler = () => {
      setEnabled(loadSettings().companionEnabled)
    }
    window.addEventListener("settings-changed", handler)
    return () => window.removeEventListener("settings-changed", handler)
  }, [])

  // Keyboard shortcut: Cmd+. (or Ctrl+.) to toggle companion
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault()
        if (!enabled) return
        setIsOpen(prev => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [enabled])

  // Update suggestion on page change
  useEffect(() => {
    if (!suggestionDismissed) {
      const tip = getSuggestion()
      setSuggestion(tip)
    }
  }, [location.pathname, getSuggestion, suggestionDismissed])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat.messages])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingIn(true)
          inputRef.current?.focus()
        })
      })
    } else {
      setIsAnimatingIn(false)
    }
  }, [isOpen])

  // Position panel on open (bottom-right by default)
  useEffect(() => {
    if (isOpen && panelRef.current && !hasCustomPosition.current) {
      const x = window.innerWidth - 400 - 24
      const y = window.innerHeight - 540 - 24
      positionRef.current = { x: Math.max(16, x), y: Math.max(16, y) }
      panelRef.current.style.left = `${positionRef.current.x}px`
      panelRef.current.style.top = `${positionRef.current.y}px`
    }
  }, [isOpen])

  // Close history menu when clicking outside
  useEffect(() => {
    if (!historyMenuId) return
    const handler = () => setHistoryMenuId(null)
    window.addEventListener("click", handler)
    return () => window.removeEventListener("click", handler)
  }, [historyMenuId])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.companion-titlebar') && !(e.target as HTMLElement).closest('button')) {
      isDraggingRef.current = true
      hasCustomPosition.current = true
      dragOffsetRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y,
      }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && panelRef.current) {
        const newX = Math.max(0, Math.min(window.innerWidth - 380, e.clientX - dragOffsetRef.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffsetRef.current.y))
        positionRef.current = { x: newX, y: newY }
        panelRef.current.style.left = `${newX}px`
        panelRef.current.style.top = `${newY}px`
      }
    }
    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Submit handler
  const handleSubmit = useCallback((text?: string) => {
    const query = text || chat.inputValue.trim()
    if (!query) return
    setSuggestionDismissed(true)
    setShowHistory(false)
    chat.handleSubmit(query)
  }, [chat])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleClear = useCallback(() => {
    chat.startNewConversation()
    setSuggestionDismissed(false)
    setShowHistory(false)
  }, [chat])

  // Copy message content to clipboard
  const handleCopy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  // Intercept clicks on internal links to use React Router navigation
  const handleMessagesClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const link = target.closest("a")
    if (!link) return
    const href = link.getAttribute("href")
    if (!href) return
    // Internal link — starts with / and is a known app route
    if (href.startsWith("/") && !href.startsWith("//")) {
      e.preventDefault()
      navigate(href)
      setIsOpen(false)
    }
  }, [navigate])

  // Load a past conversation from history
  const handleLoadConversation = useCallback(async (id: string) => {
    await chat.loadConversation(id)
    setShowHistory(false)
    setSuggestionDismissed(true)
  }, [chat])

  // Delete a conversation from history
  const handleDeleteConversation = useCallback(async (id: string) => {
    await chat.deleteConversation(id)
    setHistoryMenuId(null)
  }, [chat])

  // Rename a conversation
  const handleRenameSubmit = useCallback(async (id: string) => {
    if (renameValue.trim()) {
      await chat.renameConversation(id, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue("")
  }, [chat, renameValue])

  // Don't render if not authenticated or not enabled
  if (!isAuthenticated || !enabled) return null

  // Don't show on login/change-password
  if (location.pathname === "/login" || location.pathname === "/change-password") return null

  const hasNotification = !!suggestion && !suggestionDismissed && !isOpen && chat.messages.length === 0

  return createPortal(
    <>
      {/* Floating Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[900] w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-xl active:scale-95 group"
          style={{ background: theme.botGradient }}
          title="AI Companion (⌘.)"
        >
          <BotMessageSquareIcon size={20} className="text-white" />
          {hasNotification && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
          )}
        </button>
      )}

      {/* Dialog Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-[900] transition-all duration-200 ${
            isAnimatingIn ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          style={{ width: 400, transformOrigin: "bottom right" }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden" style={{ height: 540 }}>

            {/* Title Bar */}
            <div className="companion-titlebar flex items-center justify-between px-4 py-2.5 cursor-grab active:cursor-grabbing select-none border-b border-slate-100 dark:border-slate-800" style={{ background: theme.botGradient }}>
              <div className="flex items-center gap-2">
                {showHistory ? (
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-0.5 rounded-lg hover:bg-white/20 transition-colors"
                    title="Back to chat"
                  >
                    <ArrowLeft size={14} className="text-white/90" />
                  </button>
                ) : (
                  <BotMessageSquareIcon size={15} className="text-white/90" />
                )}
                <span className="text-[13px] font-semibold text-white">
                  {showHistory ? "Conversation History" : "AI Companion"}
                </span>
                {!showHistory && (
                  <span className="text-[10px] text-white/60 bg-white/15 px-1.5 py-0.5 rounded-full">Beta</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!showHistory && (
                  <button
                    onClick={() => { setShowHistory(true); chat.refreshConversationList() }}
                    className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                    title="Conversation history"
                  >
                    <History size={13} className="text-white/70" />
                  </button>
                )}
                <button
                  onClick={handleClear}
                  className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                  title="New conversation"
                >
                  <Trash2 size={13} className="text-white/70" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                  title="Minimize"
                >
                  <Minus size={13} className="text-white/70" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                  title="Close"
                >
                  <X size={13} className="text-white/70" />
                </button>
              </div>
            </div>

            {/* Conversation History Panel */}
            {showHistory ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {chat.conversationList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <Clock size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">No saved conversations yet</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Your conversations will appear here</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {chat.conversationList.map((conv) => (
                      <div key={conv.id} className="relative group">
                        {renamingId === conv.id ? (
                          <div className="px-3 py-2">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSubmit(conv.id)
                                if (e.key === "Escape") { setRenamingId(null); setRenameValue("") }
                              }}
                              onBlur={() => handleRenameSubmit(conv.id)}
                              className="w-full text-[12px] px-2 py-1 rounded-lg border border-sky-300 dark:border-sky-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => handleLoadConversation(conv.id)}
                            className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                              conv.id === chat.conversationId ? "bg-sky-50 dark:bg-sky-900/20 border-l-2 border-sky-400" : ""
                            }`}
                          >
                            <p className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200 truncate pr-6">
                              {conv.title || "Untitled conversation"}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {conv.messageCount} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                            </p>
                          </button>
                        )}
                        {/* Context menu trigger */}
                        {renamingId !== conv.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setHistoryMenuId(historyMenuId === conv.id ? null : conv.id) }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                          >
                            <MoreVertical size={12} className="text-slate-400" />
                          </button>
                        )}
                        {/* Context menu dropdown */}
                        {historyMenuId === conv.id && (
                          <div className="absolute right-2 top-full mt-1 z-10 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 min-w-[120px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRenamingId(conv.id)
                                setRenameValue(conv.title || "")
                                setHistoryMenuId(null)
                              }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
                            >
                              <Pencil size={11} /> Rename
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id) }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                            >
                              <Trash size={11} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar" onClick={handleMessagesClick}>
                  {/* Proactive suggestion banner */}
                  {suggestion && !suggestionDismissed && chat.messages.length === 0 && (
                    <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200/60 dark:border-sky-700/40">
                      <p className="text-[12px] text-sky-700 dark:text-sky-300 leading-relaxed">{suggestion}</p>
                    </div>
                  )}

                  {/* Empty state */}
                  {chat.messages.length === 0 && (
                    <div className="flex flex-col items-center pt-4 pb-2">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: theme.botGradient }}>
                        <BotMessageSquareIcon size={22} className="text-white" />
                      </div>
                      <h3 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 mb-1">Hi! I know everything.</h3>
                      <p className="text-[12px] text-slate-400 dark:text-slate-500 text-center mb-4 px-4">
                        Ask me about your data, proposals, case studies, win rates — or how to use any feature.
                      </p>
                      <div className="flex flex-col gap-1.5 w-full">
                        {starters.map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => handleSubmit(prompt)}
                            className="flex items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:border-sky-200 dark:hover:border-sky-700/40 transition-colors"
                          >
                            <ChevronRight size={12} className="text-sky-400 flex-shrink-0" />
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat messages */}
                  {chat.messages.map((msg: ChatMessage) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "user" ? (
                        <div className={`max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md ${theme.userBubbleBg} ${theme.userBubbleBorder} border ${theme.userBubbleShadow}`}>
                          <p className="text-[12.5px] text-slate-700 dark:text-slate-200 leading-relaxed">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="max-w-[92%] group/msg">
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5" style={{ background: theme.botGradient }}>
                              <BotMessageSquareIcon size={12} className="text-white" />
                            </div>
                            <div className="flex-1 companion-markdown text-[12.5px] text-slate-700 dark:text-slate-200 leading-relaxed">
                              <MarkdownRenderer content={msg.content} />
                            </div>
                          </div>
                          {/* Data source indicator + Copy button */}
                          {msg.content && !chat.isStreaming && (
                            <div className="ml-8 mt-1 flex items-center gap-2">
                              {/* Data sources badge */}
                              <DataSourceBadge metadata={msg.metadata} />
                              {/* Copy button — appears on hover */}
                              <button
                                onClick={() => handleCopy(msg.content, msg.id)}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors opacity-0 group-hover/msg:opacity-100"
                              >
                                {copiedId === msg.id ? (
                                  <><Check size={10} className="text-sky-500" /> <span className="text-sky-500">Copied</span></>
                                ) : (
                                  <><Copy size={10} /> Copy</>
                                )}
                              </button>
                            </div>
                          )}
                          {/* Follow-up prompts */}
                          {msg.followUpPrompts && msg.followUpPrompts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                              {msg.followUpPrompts.map((prompt, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSubmit(prompt)}
                                  className="text-[11px] px-2.5 py-1 rounded-full border border-sky-200 dark:border-sky-700/50 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {(chat.isLoading || chat.isStreaming) && chat.messages[chat.messages.length - 1]?.role !== "assistant" && (
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: theme.botGradient }}>
                        <BotMessageSquareIcon size={12} className="text-white" />
                      </div>
                      <div className="flex gap-1 items-center py-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "0ms" }} />
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "150ms" }} />
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-slate-100 dark:border-slate-800 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={chat.inputValue}
                      onChange={(e) => chat.setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about data, proposals, case studies, or how-to..."
                      rows={1}
                      className="flex-1 resize-none text-[12.5px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-600 focus:border-transparent"
                      style={{ maxHeight: 80 }}
                    />
                    {chat.isStreaming ? (
                      <button
                        onClick={() => chat.abortStream()}
                        className="flex-shrink-0 p-2 rounded-xl bg-slate-500 hover:bg-slate-600 text-white transition-all duration-150 shadow-sm"
                        title="Stop generating"
                      >
                        <Square size={14} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubmit()}
                        disabled={!chat.inputValue.trim() || chat.isLoading}
                        className={`flex-shrink-0 p-2 rounded-xl ${theme.sendButtonGradient} ${theme.sendButtonHoverGradient} text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 ${theme.sendButtonShadow}`}
                      >
                        <Send size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 text-center">
                    ⌘. to toggle · Powered by GPT-4o
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .companion-markdown p { margin: 0 0 0.4em 0; }
        .companion-markdown p:last-child { margin-bottom: 0; }
        .companion-markdown ul, .companion-markdown ol { margin: 0.3em 0; padding-left: 1.2em; }
        .companion-markdown li { margin: 0.15em 0; }
        .companion-markdown strong { font-weight: 600; }
        .companion-markdown code { font-size: 11px; padding: 1px 4px; border-radius: 4px; background: rgba(0,0,0,0.06); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
      `}</style>
    </>,
    document.body
  )
}
