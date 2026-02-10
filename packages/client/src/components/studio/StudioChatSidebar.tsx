import { useState, useCallback, useRef, useEffect } from "react"
import { ArrowRight, Sparkles, FileSearch, PanelLeftOpen, PanelLeftClose, Clock, MessageSquarePlus, Trash2, Pencil, History, Send, Loader2, Paperclip, X, FileText } from "lucide-react"
import { useChat } from "@/hooks/useChat"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { CHAT_THEMES, type ChatTheme, type ChartConfig } from "@/types/chat"
import type { UseDocumentStoreReturn } from "@/hooks/useDocumentStore"
import type { ConversationSummary } from "@/lib/api"
import { markdownToHtml } from "@/lib/markdownToHtml"
import { studioApi } from "@/lib/api"

interface StudioChatSidebarProps {
  documentStore: UseDocumentStoreReturn
  onRFPDetected?: (rfpText: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const theme: ChatTheme = CHAT_THEMES.emerald

export function StudioChatSidebar({ documentStore, onRFPDetected, collapsed, onToggleCollapse }: StudioChatSidebarProps) {
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; isExtracting?: boolean; isRFP?: boolean } | null>(null)
  const attachedFileRef = useRef<{ name: string; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const chat = useChat({
    endpoint: "/studio/chat/query",
    streamEndpoint: "/studio/chat/stream",
    page: documentStore.mode === "review" ? "studio-review" : "studio",
    parseResult: (data) => ({
      content: data.response as string,
      followUpPrompts: data.followUpPrompts as string[] | undefined,
      chartData: data.chartData as ChartConfig | undefined,
      refused: data.refused as boolean | undefined,
      refusalReason: data.refusalReason as string | undefined,
    }),
    buildBody: (query) => ({
      query,
      documentContent: documentStore.content,
      reviewMode: documentStore.mode === "review",
      uploadedFileText: attachedFileRef.current?.text,
    }),
    errorMessage: "Failed to get response from Studio AI",
  })

  const handleFileSelect = useCallback(async (file: File) => {
    setAttachedFile({ name: file.name, text: "", isExtracting: true })
    try {
      const result = await studioApi.extractDocument(file)
      setAttachedFile({ name: file.name, text: result.text, isRFP: result.isRFP })
      attachedFileRef.current = { name: file.name, text: result.text }
      if (result.isRFP && onRFPDetected) {
        onRFPDetected(result.text)
      }
    } catch (err) {
      console.error("File extraction failed:", err)
      setAttachedFile(null)
      attachedFileRef.current = null
    }
  }, [onRFPDetected])

  const handleFileRemove = useCallback(() => {
    setAttachedFile(null)
    attachedFileRef.current = null
  }, [])

  const handleSubmit = useCallback((query?: string) => {
    chat.handleSubmit(query)
    setAttachedFile(null)
    attachedFileRef.current = null
  }, [chat])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }, [chat.inputValue])

  // Chat history popover
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

  const isExtracting = attachedFile?.isExtracting ?? false

  // Collapsed view
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-white dark:bg-slate-900 py-3 gap-3">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Expand AI sidebar"
        >
          <PanelLeftOpen className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: theme.botGradient }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: theme.botGradient }}>
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
            {documentStore.mode === "review" ? "AI Review" : "AI Assistant"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { chat.startNewConversation(); setHistoryOpen(false) }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="New conversation"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                historyOpen
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title="Chat history"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            {historyOpen && (
              <ChatHistoryPopover
                conversations={chat.conversationList}
                activeId={chat.conversationId}
                onSelect={(id) => { chat.loadConversation(id); setHistoryOpen(false) }}
                onDelete={chat.deleteConversation}
                onRename={chat.renameConversation}
              />
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 opacity-80"
              style={{ background: theme.botGradient }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 text-center mb-4 leading-relaxed">
              {documentStore.mode === "review"
                ? "Paste content in the editor, then ask for a review."
                : "Ask me to help with your document."}
            </p>
            {documentStore.mode === "editor" && (
              <div className="space-y-0.5 w-full">
                {[
                  "Write an executive summary",
                  "Create a timeline diagram",
                  "Draft a case study overview",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSubmit(prompt)}
                    className="w-full text-left px-3 py-2 text-[12px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 space-y-2.5">
            {chat.messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-emerald-50 dark:bg-emerald-900/20 text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed">
                      {message.content}
                    </div>
                  </div>
                ) : message.refused ? (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-[13px] text-amber-700 dark:text-amber-300">
                    {message.refusalReason || "Unable to process request."}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed [&_.md-h2]:text-sm [&_.md-h2]:font-semibold [&_.md-h2]:mt-3 [&_.md-h2]:mb-1 [&_.md-h3]:text-[13px] [&_.md-h3]:font-semibold [&_.md-h3]:mt-2 [&_.md-h3]:mb-1 [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:text-[13px] [&_p]:mb-1.5 [&_pre]:text-[11px] [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:bg-slate-50 [&_pre]:dark:bg-slate-800">
                      <MarkdownRenderer content={message.content} />
                    </div>
                    {message.svgData && (
                      <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto">
                        <div dangerouslySetInnerHTML={{ __html: message.svgData.svg }} />
                      </div>
                    )}
                    {/* Follow-ups */}
                    {message.followUpPrompts && message.followUpPrompts.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {message.followUpPrompts.map((prompt, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSubmit(prompt)}
                            className="px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Deploy actions */}
                    {(message.content || message.svgData || message.reviewAnnotations?.length) && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {message.content && (
                          <button
                            onClick={() => documentStore.insertContent(markdownToHtml(message.content))}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Insert
                          </button>
                        )}
                        {message.svgData && (
                          <button
                            onClick={() => documentStore.insertContent(message.svgData!.svg)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Insert Diagram
                          </button>
                        )}
                        {message.reviewAnnotations && message.reviewAnnotations.length > 0 && (
                          <button
                            onClick={() => documentStore.setAnnotations(message.reviewAnnotations!)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
                          >
                            <FileSearch className="w-3 h-3" />
                            Comments ({message.reviewAnnotations.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading */}
            {chat.isStreaming && (
              <div className="flex items-center gap-1.5 py-1 pl-0.5">
                <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Thinking...</span>
              </div>
            )}
            <div ref={chat.messagesEndRef as React.RefObject<HTMLDivElement>} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        {/* Attached file chip */}
        {attachedFile && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
            <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1 truncate">{attachedFile.name}</span>
            {attachedFile.isRFP && !isExtracting && (
              <span className="px-1 py-px text-[9px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded flex-shrink-0">RFP</span>
            )}
            {isExtracting ? (
              <Loader2 className="w-3 h-3 text-emerald-500 animate-spin flex-shrink-0" />
            ) : (
              <button onClick={handleFileRemove} className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-800 rounded transition-colors flex-shrink-0">
                <X className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={chat.isLoading || isExtracting}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
            title="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelect(file)
            e.target.value = ""
          }} className="hidden" />
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={chat.inputValue}
              onChange={(e) => chat.setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder={documentStore.mode === "review" ? "Ask for a review..." : "Ask AI anything..."}
              disabled={chat.isLoading}
              rows={1}
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-[13px] text-slate-900 dark:text-white leading-snug placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-transparent focus:border-emerald-400/40 focus:outline-none focus:ring-0 resize-none overflow-hidden disabled:opacity-50 transition-colors"
              style={{ minHeight: "36px", maxHeight: "120px" }}
            />
          </div>
          <button
            onClick={() => handleSubmit()}
            disabled={!chat.inputValue.trim() || chat.isLoading || isExtracting}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
            style={{ background: !chat.inputValue.trim() || chat.isLoading ? undefined : theme.botGradient }}
          >
            {chat.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : (
              <Send className={`w-3.5 h-3.5 ${chat.inputValue.trim() ? "text-white" : "text-slate-400"}`} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Chat history popover ──────────────────────────────────

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function ChatHistoryPopover({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) {
      editRef.current?.focus()
      editRef.current?.select()
    }
  }, [editingId])

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim())
    setEditingId(null)
  }

  return (
    <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden animate-fade-in-up">
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent Conversations</p>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">No conversations yet</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId
              const isEditing = conv.id === editingId
              return (
                <div
                  key={conv.id}
                  className={`group relative rounded-lg transition-colors ${
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <button
                    onClick={() => !isEditing && onSelect(conv.id)}
                    className="w-full text-left px-3 py-2 pr-14"
                  >
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400 text-slate-900 dark:text-white"
                      />
                    ) : (
                      <p className={`text-xs font-medium truncate ${
                        isActive ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"
                      }`}>
                        {conv.title}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {timeAgo(conv.updatedAt)}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {conv.messageCount} msgs
                      </span>
                    </div>
                  </button>
                  {!isEditing && (
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(conv.id)
                          setEditValue(conv.title)
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-600/60 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                        className="p-1 rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
