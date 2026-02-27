import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { Sparkles, TrendingUp, BookOpen, Layers } from "lucide-react"
import { AskAI } from "./AskAI"
import { ProposalInsights } from "./ProposalInsights"
import { CaseStudies } from "./CaseStudies"
import { UnifiedAI } from "./UnifiedAI"

export type AIHubTab = "ask-ai" | "proposals" | "client-success" | "unified"

const VALID_TABS: AIHubTab[] = ["ask-ai", "proposals", "client-success", "unified"]
const STORAGE_KEY = "stamats-ai-tab"

interface AIHubTabContextValue {
  tabBar: ReactNode
}

const AIHubTabContext = createContext<AIHubTabContextValue | null>(null)

export function useAIHubTabContext() {
  return useContext(AIHubTabContext)
}

const TAB_DEFS: { id: AIHubTab; label: string; icon: React.ElementType; color: string; activeClass: string; glowClass: string }[] = [
  {
    id: "ask-ai",
    label: "Ask AI",
    icon: Sparkles,
    color: "text-violet-500 dark:text-violet-400",
    activeClass: "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-700/50",
    glowClass: "shadow-[0_0_12px_rgba(139,92,246,0.25)]",
  },
  {
    id: "proposals",
    label: "Proposals",
    icon: TrendingUp,
    color: "text-cyan-500 dark:text-cyan-400",
    activeClass: "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-700/50",
    glowClass: "shadow-[0_0_12px_rgba(6,182,212,0.25)]",
  },
  {
    id: "client-success",
    label: "Client Success",
    icon: BookOpen,
    color: "text-slate-500 dark:text-slate-400",
    activeClass: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600/50",
    glowClass: "shadow-sm",
  },
  {
    id: "unified",
    label: "Unified",
    icon: Layers,
    color: "text-indigo-500 dark:text-indigo-400",
    activeClass: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-700/50",
    glowClass: "shadow-[0_0_12px_rgba(99,102,241,0.25)]",
  },
]

function isValidTab(v: string | null): v is AIHubTab {
  return v !== null && (VALID_TABS as string[]).includes(v)
}

export function AIHub() {
  const [searchParams, setSearchParams] = useSearchParams()

  const getInitialTab = (): AIHubTab => {
    const param = searchParams.get("tab")
    if (isValidTab(param)) return param
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isValidTab(saved)) return saved
    return "ask-ai"
  }

  const [activeTab, setActiveTab] = useState<AIHubTab>(getInitialTab)

  // Consume ?tab= param on mount
  useEffect(() => {
    const param = searchParams.get("tab")
    if (isValidTab(param)) {
      setActiveTab(param)
      localStorage.setItem(STORAGE_KEY, param)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (tab: AIHubTab) => {
    setActiveTab(tab)
    localStorage.setItem(STORAGE_KEY, tab)
    setSearchParams({}, { replace: true })
  }

  const tabBar = (
    <div className="flex justify-center px-6 py-3 bg-transparent pointer-events-none absolute left-0 right-0 z-10 top-0">
      <div className="pointer-events-auto flex items-center gap-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/50 rounded-2xl px-1.5 py-1.5 shadow-lg shadow-slate-900/8 dark:shadow-slate-900/40">
        {TAB_DEFS.map(({ id, label, icon: Icon, color, activeClass, glowClass }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? `${activeClass} ${glowClass}`
                  : `text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent`
              }`}
            >
              <Icon
                size={13}
                className={isActive ? "" : `${color} opacity-70`}
              />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderActiveTab = () => {
    switch (activeTab) {
      case "ask-ai": return <AskAI />
      case "proposals": return <ProposalInsights />
      case "client-success": return <CaseStudies />
      case "unified": return <UnifiedAI />
    }
  }

  return (
    <AIHubTabContext.Provider value={{ tabBar }}>
      {renderActiveTab()}
    </AIHubTabContext.Provider>
  )
}
