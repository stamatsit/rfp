import { useState, useRef, useEffect } from "react"
import { MessageSquarePlus, Trash2, MessageSquare, Clock, Pencil } from "lucide-react"
import type { ConversationSummary } from "@/lib/api"
import type { ChatTheme } from "@/types/chat"

interface ChatHistorySidebarProps {
  conversations: ConversationSummary[]
  activeId: string | null
  theme: ChatTheme
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function ChatHistorySidebar({
  conversations,
  activeId,
  theme,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ChatHistorySidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingId])

  const startEditing = (conv: ConversationSummary) => {
    setEditingId(conv.id)
    setEditValue(conv.title)
  }

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3 border-b border-slate-200/60 dark:border-slate-700/60">
        <button
          onClick={onNew}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200
                     border border-dashed border-slate-300 dark:border-slate-600
                     text-slate-600 dark:text-slate-300
                     hover:border-slate-400 dark:hover:border-slate-500
                     hover:bg-slate-50 dark:hover:bg-slate-800/50`}
        >
          <MessageSquarePlus size={15} />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400 dark:text-slate-500">No conversations yet</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {conversations.map(conv => {
              const isActive = conv.id === activeId
              const isHovered = conv.id === hoveredId
              const isEditing = conv.id === editingId

              return (
                <div
                  key={conv.id}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative rounded-lg transition-all duration-150 cursor-pointer
                    ${isActive
                      ? `${theme.accentBg} ${theme.accentBgDark} ${theme.accentBorder} ${theme.accentBorderDark} border`
                      : "hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                    }`}
                >
                  <button
                    onClick={() => !isEditing && onSelect(conv.id)}
                    className="w-full text-left px-3 py-2.5 pr-16"
                  >
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") cancelEdit()
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-[13px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 dark:focus:border-blue-500 text-slate-900 dark:text-white"
                      />
                    ) : (
                      <p
                        className={`text-[13px] font-medium truncate leading-tight
                          ${isActive
                            ? `${theme.accentText} ${theme.accentTextDark}`
                            : "text-slate-700 dark:text-slate-300"
                          }`}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startEditing(conv)
                        }}
                      >
                        {conv.title}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        {timeAgo(conv.updatedAt)}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {conv.messageCount} msgs
                      </span>
                    </div>
                  </button>

                  {/* Action buttons on hover */}
                  {isHovered && !isEditing && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditing(conv)
                        }}
                        className="p-1.5 rounded-md
                                   text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                                   hover:bg-slate-200/60 dark:hover:bg-slate-700/60
                                   transition-colors duration-150"
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(conv.id)
                        }}
                        className="p-1.5 rounded-md
                                   text-slate-400 hover:text-red-500 dark:hover:text-red-400
                                   hover:bg-red-50 dark:hover:bg-red-900/20
                                   transition-colors duration-150"
                        title="Delete"
                      >
                        <Trash2 size={12} />
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
