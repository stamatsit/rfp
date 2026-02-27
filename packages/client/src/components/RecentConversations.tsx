import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Sparkles, TrendingUp, BookOpen, Layers, FileEdit, Wand2, ChevronRight, ChevronDown, Clock, MessageSquare } from "lucide-react"
import { conversationsApi, type ConversationSummary } from "@/lib/api"
import { SkeletonConversationItem } from "@/components/ui/skeleton"

interface PageMeta {
  icon: React.ElementType
  route: string
  label: string
  color: string
}

const PAGE_META: Record<string, PageMeta> = {
  "ask-ai": { icon: Sparkles, route: "/ai", label: "Ask AI", color: "text-purple-500" },
  "case-studies": { icon: BookOpen, route: "/ai?tab=client-success", label: "Client Success", color: "text-violet-500" },
  "proposal-insights": { icon: TrendingUp, route: "/ai?tab=proposals", label: "Proposal Insights", color: "text-cyan-500" },
  "unified-ai": { icon: Layers, route: "/ai?tab=unified", label: "Unified AI", color: "text-indigo-500" },
  "studio": { icon: FileEdit, route: "/studio", label: "Document Studio", color: "text-emerald-500" },
  "studio-briefing": { icon: FileEdit, route: "/studio", label: "Document Studio", color: "text-emerald-500" },
  "studio-review": { icon: FileEdit, route: "/studio", label: "Document Studio", color: "text-emerald-500" },
  "humanizer": { icon: Wand2, route: "/humanize", label: "AI Humanizer", color: "text-amber-500" },
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

export function RecentConversations() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(true)

  useEffect(() => {
    conversationsApi.list()
      .then(list => setConversations(list.slice(0, 6)))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (!isLoading && conversations.length === 0) return null

  return (
    <div className="mt-10">
      <button
        onClick={() => setIsCollapsed(c => !c)}
        className="flex items-center gap-1.5 mb-3 group"
      >
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-600 tracking-[0.08em] uppercase group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">Recent</p>
        <ChevronDown
          size={12}
          className={`text-slate-400 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-all ${isCollapsed ? "-rotate-90" : ""}`}
        />
      </button>
      {!isCollapsed && (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl border border-slate-200/60 dark:border-slate-700/60 p-3 bg-white dark:bg-slate-900">
                <SkeletonConversationItem />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {conversations.map(conv => {
              const meta = PAGE_META[conv.page] ?? { icon: MessageSquare, route: "/ai", label: conv.page, color: "text-slate-500" }
              const Icon = meta.icon
              return (
                <button
                  key={conv.id}
                  onClick={() => navigate(`${meta.route}${meta.route.includes("?") ? "&" : "?"}conv=${conv.id}`)}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 p-2.5 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all text-left"
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center ${meta.color}`}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200 truncate leading-tight">{conv.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 flex items-center gap-1 mt-0.5">
                      <Clock size={9} />
                      {timeAgo(conv.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight size={12} className="flex-shrink-0 text-slate-300 dark:text-slate-700 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
                </button>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
