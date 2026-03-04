import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import {
  Search,
  Home,
  Sparkles,
  TrendingUp,
  BookOpen,
  Layers,
  FileEdit,
  Wand2,
  Quote,
  FileSearch,
  FileSpreadsheet,
  Image,
  PenLine,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Clock,
  X,
  Building2,
  ImageDown,
} from "lucide-react"
import { conversationsApi, clientsApi, type ConversationSummary, type ClientResponse } from "@/lib/api"
import { loadSettings } from "./SettingsPanel"

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

interface PaletteItem {
  id: string
  type: "route" | "conversation"
  label: string
  description?: string
  icon: React.ElementType
  href: string
  conversationId?: string
  updatedAt?: string
}

const ROUTE_ITEMS: PaletteItem[] = [
  { id: "home", type: "route", label: "Home", description: "Dashboard", icon: Home, href: "/" },
  { id: "search", type: "route", label: "Search Library", description: "Search Q&A content", icon: Search, href: "/search" },
  { id: "ai-tools", type: "route", label: "AI Tools", description: "Ask AI, Proposals, Client Success, Unified", icon: Sparkles, href: "/ai" },
  { id: "ai-proposals", type: "route", label: "Proposal Insights", description: "Win rate analytics", icon: TrendingUp, href: "/ai?tab=proposals" },
  { id: "ai-client-success", type: "route", label: "Client Success", description: "Case studies & results", icon: BookOpen, href: "/ai?tab=client-success" },
  { id: "ai-unified", type: "route", label: "Unified AI", description: "Cross-reference all data", icon: Layers, href: "/ai?tab=unified" },
  { id: "studio", type: "route", label: "Document Studio", description: "Rich document editor", icon: FileEdit, href: "/studio" },
  { id: "humanize", type: "route", label: "AI Humanizer", description: "Rewrite AI text", icon: Wand2, href: "/humanize" },
  { id: "testimonials", type: "route", label: "Testimonials & Awards", description: "Client testimonials", icon: Quote, href: "/testimonials" },
  { id: "clients", type: "route", label: "Client Portfolio", description: "All assets by client", icon: Building2, href: "/clients" },
  { id: "analyze", type: "route", label: "Document Scanner", description: "Scan RFPs for red flags", icon: FileSearch, href: "/analyze" },
  { id: "import", type: "route", label: "Import Data", description: "Bulk Excel import", icon: FileSpreadsheet, href: "/import" },
  { id: "photos", type: "route", label: "Photo Library", description: "Image assets", icon: Image, href: "/photos" },
  { id: "image-converter", type: "route", label: "Image Converter", description: "Convert images to WebP", icon: ImageDown, href: "/convert" },
  { id: "new", type: "route", label: "New Entry", description: "Create a Q&A entry", icon: PenLine, href: "/new" },
  { id: "help", type: "route", label: "Help", description: "Documentation & guides", icon: HelpCircle, href: "/help" },
  { id: "support", type: "route", label: "Support", description: "Contact support", icon: LifeBuoy, href: "/support" },
]

const PAGE_ROUTE_MAP: Record<string, string> = {
  "ask-ai": "/ai",
  "case-studies": "/ai?tab=client-success",
  "proposal-insights": "/ai?tab=proposals",
  "unified-ai": "/ai?tab=unified",
  "studio": "/studio",
  "studio-briefing": "/studio",
  "studio-review": "/studio",
  "humanizer": "/humanize",
  "general": "/ai",
}

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

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [clients, setClients] = useState<ClientResponse[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch recent conversations + client list on open
  useEffect(() => {
    if (!isOpen) return
    setQuery("")
    setSelectedIndex(0)
    inputRef.current?.focus()
    conversationsApi.list()
      .then(list => setConversations(list.slice(0, 5)))
      .catch(() => {})
    clientsApi.list()
      .then(setClients)
      .catch(() => {})
  }, [isOpen])

  // Build filtered items
  const q = query.toLowerCase()
  const filteredRoutes = ROUTE_ITEMS.filter(
    item => !q || item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
  )
  const filteredConvs: PaletteItem[] = conversations
    .filter(c => !q || c.title.toLowerCase().includes(q))
    .map(c => ({
      id: `conv-${c.id}`,
      type: "conversation" as const,
      label: c.title,
      description: timeAgo(c.updatedAt),
      icon: MessageSquare,
      href: (() => { const base = PAGE_ROUTE_MAP[c.page] ?? "/ai"; return base + (base.includes("?") ? "&" : "?") + `conv=${c.id}` })(),
      conversationId: c.id,
      updatedAt: c.updatedAt,
    }))

  // Client quick actions — only show when query matches a client name
  const filteredClients: PaletteItem[] = q
    ? clients
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({
          id: `client-${c.id}`,
          type: "route" as const,
          label: c.name,
          description: `View client portfolio`,
          icon: Building2,
          href: `/clients?select=${encodeURIComponent(c.name)}`,
        }))
    : []

  const allItems = [...filteredRoutes, ...filteredClients, ...filteredConvs]

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = allItems[selectedIndex]
      if (item) {
        navigate(item.href)
        onClose()
      }
    } else if (e.key === "Escape") {
      onClose()
    }
  }, [allItems, selectedIndex, navigate, onClose])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (!isOpen) return null

  const settings = loadSettings()
  if (!settings.commandPaletteEnabled) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]" />

      {/* Palette modal */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/60 dark:border-slate-700">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages and conversations..."
            className="flex-1 bg-transparent text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <X size={14} className="text-slate-400" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {allItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              No results for "{query}"
            </div>
          ) : (
            <>
              {filteredRoutes.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Pages
                  </div>
                  {filteredRoutes.map((item, i) => {
                    const Icon = item.icon
                    const isSelected = i === selectedIndex
                    return (
                      <button
                        key={item.id}
                        data-index={i}
                        onClick={() => { navigate(item.href); onClose() }}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left
                          ${isSelected ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                          ${isSelected ? "bg-white dark:bg-slate-600 shadow-sm" : "bg-slate-100 dark:bg-slate-700"}`}>
                          <Icon size={15} className="text-slate-600 dark:text-slate-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{item.label}</p>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{item.description}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {filteredClients.length > 0 && (
                <div className={filteredRoutes.length > 0 ? "mt-1 pt-1 border-t border-slate-100 dark:border-slate-700/60" : ""}>
                  <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Clients
                  </div>
                  {filteredClients.map((item, i) => {
                    const globalIndex = filteredRoutes.length + i
                    const isSelected = globalIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        data-index={globalIndex}
                        onClick={() => { navigate(item.href); onClose() }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left
                          ${isSelected ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                          ${isSelected ? "bg-sky-50 dark:bg-sky-900/40 shadow-sm" : "bg-sky-50 dark:bg-sky-900/20"}`}>
                          <Building2 size={15} className="text-sky-500 dark:text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{item.label}</p>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{item.description}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {filteredConvs.length > 0 && (
                <div className={(filteredRoutes.length > 0 || filteredClients.length > 0) ? "mt-1 pt-1 border-t border-slate-100 dark:border-slate-700/60" : ""}>
                  <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Recent Conversations
                  </div>
                  {filteredConvs.map((item, i) => {
                    const globalIndex = filteredRoutes.length + filteredClients.length + i
                    const isSelected = globalIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        data-index={globalIndex}
                        onClick={() => { navigate(item.href); onClose() }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left
                          ${isSelected ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                          ${isSelected ? "bg-white dark:bg-slate-600 shadow-sm" : "bg-slate-100 dark:bg-slate-700"}`}>
                          <MessageSquare size={15} className="text-slate-500 dark:text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{item.label}</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Clock size={10} />
                            {item.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
