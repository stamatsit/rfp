/**
 * Unified AI — Cross-Referential AI Hub
 *
 * Unified AI that connects the dots across:
 * - Q&A Library (answers + photos)
 * - Proposal History (win rates, trends)
 * - Client Results (40+ client results, testimonials, awards)
 *
 * The power: answering questions NO SINGLE SOURCE could answer.
 */

import { useCallback } from "react"
import {
  Layers,
  Database,
  Sparkles,
  Target,
  AlertTriangle,
  FileCheck,
  Search,
  Briefcase,
} from "lucide-react"
import { ChatContainer, ChatHistorySidebar } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { CHAT_THEMES, type QuickAction, type ChatMessage } from "@/types/chat"

const theme = CHAT_THEMES.indigo

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Sparkles,
    label: "Win Formula",
    prompt: "Cross-reference our wins against our client results and library. What's our true winning formula? Where do we have proof, and where are we missing it?",
  },
  {
    icon: FileCheck,
    label: "Proof Finder",
    prompt: "I need to build a proposal. Find me: (1) relevant client results with metrics, (2) testimonials from similar clients we've won, (3) library content I can use. I'll tell you the school type and services.",
  },
  {
    icon: AlertTriangle,
    label: "Gap Finder",
    prompt: "Analyze disconnects: services we win but lack client results for, clients we won but never got testimonials from, opportunities we're missing.",
  },
  {
    icon: Target,
    label: "Content Audit",
    prompt: "Which library content appears in our winning proposals? Which client results align with our highest win rates? Rate our proof points by performance.",
  },
  {
    icon: Briefcase,
    label: "Prep Proposal",
    prompt: "Prep me for a proposal. I'll give you the school type, services, and affiliation. Give me: win probability, best client results to feature, key library answers, and strategic approach.",
  },
  {
    icon: Search,
    label: "Smart Search",
    prompt: "Search across ALL my data sources. Find everything related to what I'll describe — proposals we've won, client results, testimonials, library answers, and photos.",
  },
]

const STARTER_PROMPTS = [
  "I'm pitching a community college website project. Prep me.",
  "Find gaps — what have we won but don't have proof for?",
  "What's our true win formula? Where do we have the proof?",
]

const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  refused: data.refused as boolean | undefined,
  refusalReason: data.refusalReason as string | undefined,
  metadata: {
    ...(data.dataUsed as Record<string, unknown> | undefined),
    crossReferenceInsights: data.crossReferenceInsights as string[] | undefined,
  },
  chartData: data.chartData as import("@/types/chat").ChartConfig | undefined,
})

export function UnifiedAI() {
  const chat = useChat({
    endpoint: "/unified-ai/query",
    streamEndpoint: "/unified-ai/stream",
    page: "unified-ai",
    parseResult,
    parseMetadata: useCallback((data: Record<string, unknown>) => ({
      ...(data.dataUsed as Record<string, unknown> | undefined),
      crossReferenceInsights: data.crossReferenceInsights as string[] | undefined,
    }), []),
    errorMessage: "Failed to connect to Unified AI. Please try again.",
  })

  const formatWinRate = (rate: number) => `${(rate * 100).toFixed(0)}%`

  const renderExtraContent = useCallback((message: ChatMessage) => {
    const insights = message.metadata?.crossReferenceInsights as string[] | undefined
    if (!insights || insights.length === 0) return null

    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 rounded-lg">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
          <AlertTriangle size={12} />
          Cross-Reference Insights
        </div>
        <ul className="space-y-1">
          {insights.map((insight, idx) => (
            <li key={idx} className="text-xs text-amber-800 dark:text-amber-300">{insight}</li>
          ))}
        </ul>
      </div>
    )
  }, [])

  const renderDataContext = useCallback((message: ChatMessage) => {
    const md = message.metadata
    const proposals = md?.proposals as { count?: number; winRate?: number; relevantClients?: string[] } | undefined
    const caseStudies = md?.caseStudies as { count?: number; testimonials?: number } | undefined
    const library = md?.library as { answers?: number; photos?: number } | undefined
    if (!proposals && !caseStudies && !library) return null

    return (
      <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500 w-full mb-2">
          <Database size={12} className="text-indigo-500" />
          <span className="font-medium">
            {proposals?.count ?? 0} proposals &middot; {caseStudies?.count ?? 0} client results &middot; {library?.answers ?? 0} answers
          </span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Proposals</span>
              <span className="text-indigo-600 font-medium">{proposals?.count ?? 0}</span>
              <span className="text-slate-500 ml-1">({formatWinRate(proposals?.winRate ?? 0)} win)</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Client Results</span>
              <span className="text-indigo-600 font-medium">{caseStudies?.count ?? 0}</span>
              <span className="text-slate-500 ml-1">+ {caseStudies?.testimonials ?? 0} testimonials</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Library</span>
              <span className="text-indigo-600 font-medium">{library?.answers ?? 0} answers</span>
              <span className="text-slate-500 ml-1">+ {library?.photos ?? 0} photos</span>
            </div>
          </div>
          {proposals?.relevantClients && proposals.relevantClients.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-slate-400 text-xs">Recent wins: </span>
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {proposals.relevantClients.slice(0, 5).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }, [])

  return (
    <ChatContainer
      messages={chat.messages}
      isLoading={chat.isLoading}
      isStreaming={chat.isStreaming}
      inputValue={chat.inputValue}
      setInputValue={chat.setInputValue}
      onSubmit={chat.handleSubmit}
      theme={theme}
      copiedId={chat.copiedId}
      onCopy={chat.handleCopy}
      onFeedback={chat.handleFeedback}
      messagesEndRef={chat.messagesEndRef}
      inputRef={chat.inputRef}
      placeholder="Ask across all your data sources..."
      quickActions={QUICK_ACTIONS}
      renderDataContext={renderDataContext}
      renderExtraContent={renderExtraContent}
      sidebar={
        <ChatHistorySidebar
          conversations={chat.conversationList}
          activeId={chat.conversationId}
          theme={theme}
          onSelect={chat.loadConversation}
          onNew={chat.startNewConversation}
          onDelete={chat.deleteConversation}
          onRename={chat.renameConversation}
        />
      }
      emptyState={
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(79,70,229,0.1) 100%)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            <Layers size={36} className="text-indigo-500" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
            Unified AI
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
            Connect the dots across proposals, client results, and your Q&A library.
          </p>

          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => chat.handleSubmit(action.prompt)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px]
                           bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700
                           text-slate-500 dark:text-slate-400
                           hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400
                           transition-all duration-200"
              >
                <action.icon size={14} />
                {action.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            {STARTER_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => chat.setInputValue(prompt)}
                className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      }
    />
  )
}
