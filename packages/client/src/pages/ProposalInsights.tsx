/**
 * Proposal Insights Page
 *
 * COMPLETELY ISOLATED from the Q&A library AI (AskAI.tsx).
 * Uses the shared chat infrastructure with cyan theme and proposal-specific functionality.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  TrendingUp,
  RefreshCw,
  Database,
  Calendar,
  AlertCircle,
  BarChart3,
  Target,
  Users,
  LineChart,
  Building2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui"
import { ChatContainer, ChatHistorySidebar } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { proposalInsightsApi, type ProposalSyncStatus } from "@/lib/api"
import { CHAT_THEMES, type QuickAction, type ChatMessage } from "@/types/chat"
import { loadSettings } from "@/components/SettingsPanel"
import { useIsAdmin } from "@/contexts/AuthContext"

const theme = CHAT_THEMES.cyan

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: BarChart3,
    label: "Full Funnel",
    prompt: "Give me a complete funnel analysis: How many RFPs do we review, what percentage do we pursue, and of those we pursue, what's our win rate? Include trends over time.",
  },
  {
    icon: Target,
    label: "Win Formula",
    prompt: "Analyze our winning formula: What combination of school type, services, and account executive gives us the highest probability of winning? Find the patterns in our wins.",
  },
  {
    icon: Users,
    label: "Team Intel",
    prompt: "Deep dive on our team: Who has the highest pursuit-to-win conversion? Who specializes in which school types? Show me hidden patterns in how we assign opportunities.",
  },
  {
    icon: LineChart,
    label: "Momentum",
    prompt: "Are we getting better or worse? Compare our last 12 months vs the previous 12 months across pursuit rate, win rate, and deal volume. What's the trajectory?",
  },
  {
    icon: Building2,
    label: "Sweet Spots",
    prompt: "What's our sweet spot? Cross-reference school type, affiliation, and service category to find where we dramatically outperform our average. Where should we double down?",
  },
  {
    icon: Sparkles,
    label: "Strategy Brief",
    prompt: "Act as our VP of Business Development. Based on 10+ years of data, give me a strategic brief: Our strengths, blind spots, biggest opportunities, and 3 actionable changes that would have the highest ROI.",
  },
]

const STARTER_PROMPTS = [
  "What's our complete funnel - from RFP intake to win?",
  "Find the winning patterns in our best deals",
  "Why do we pass on 60% of opportunities?",
]

const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  refused: data.refused as boolean | undefined,
  refusalReason: data.refusalReason as string | undefined,
  metadata: data.dataUsed as Record<string, unknown> | undefined,
  chartData: data.chartData as import("@/types/chat").ChartConfig | undefined,
})

export function ProposalInsights() {
  const isAdmin = useIsAdmin()
  const responseLength = useMemo(() => loadSettings().aiResponseLength, [])

  const chat = useChat({
    endpoint: "/proposals/query",
    streamEndpoint: "/proposals/stream",
    page: "proposal-insights",
    parseResult,
    buildBody: useCallback((query: string) => ({ query, responseLength }), [responseLength]),
    parseMetadata: useCallback((data: Record<string, unknown>) =>
      (data.dataUsed as Record<string, unknown>) ?? data
    , []),
    errorMessage: "Failed to connect to insights service. Please try again.",
  })

  const [syncStatus, setSyncStatus] = useState<ProposalSyncStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    loadSyncStatus()
  }, [])

  const loadSyncStatus = async () => {
    try {
      const status = await proposalInsightsApi.getSyncStatus()
      setSyncStatus(status)
    } catch (err) {
      console.error("Failed to load sync status:", err)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await proposalInsightsApi.triggerSync()
      await loadSyncStatus()
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setIsSyncing(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A"
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }

  const renderDataContext = useCallback((message: ChatMessage) => {
    const dataUsed = message.metadata as {
      totalProposals?: number
      dateRange?: { from: string | null; to: string | null }
      overallWinRate?: number
      wonCount?: number
      lostCount?: number
    } | undefined
    if (!dataUsed) return null

    return (
      <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500 w-full mb-2">
          <Database size={12} className="text-cyan-500" />
          <span className="font-medium">Based on {dataUsed.totalProposals} proposals</span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Date Range:</span>
              <span className="ml-2 text-slate-600 dark:text-slate-300">
                {formatDate(dataUsed.dateRange?.from ?? null)} - {formatDate(dataUsed.dateRange?.to ?? null)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Win Rate:</span>
              <span className="ml-2 text-cyan-600 font-medium">
                {((dataUsed.overallWinRate ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-slate-400">Won:</span>
              <span className="ml-2 text-green-600">{dataUsed.wonCount}</span>
            </div>
            <div>
              <span className="text-slate-400">Lost:</span>
              <span className="ml-2 text-red-500">{dataUsed.lostCount}</span>
            </div>
          </div>
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
      placeholder="Ask about your proposal history..."
      quickActions={QUICK_ACTIONS}
      renderDataContext={renderDataContext}
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
      statusBar={
        <div className="border-b border-slate-200/60 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-cyan-500" />
                <span className="text-slate-600 dark:text-slate-300">
                  {syncStatus?.totalProposals || 0} proposals
                </span>
              </div>
              {syncStatus?.lastSync && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-slate-500 dark:text-slate-400">
                    Last sync: {new Date(syncStatus.lastSync).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing || !syncStatus?.configured}
                className="h-8 border-cyan-200 hover:border-cyan-300 hover:bg-cyan-50"
              >
                <RefreshCw size={14} className={`mr-1.5 ${isSyncing ? "animate-spin text-cyan-500" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
            )}
          </div>
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(8,145,178,0.1) 100%)",
              boxShadow: "0 4px 20px rgba(6,182,212,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            <TrendingUp size={36} className="text-cyan-500" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
            Proposal Insights
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
            Uncover win rate patterns, trends, and strategy from your proposal history.
          </p>

          {syncStatus && !syncStatus.configured && (
            <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl max-w-md">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-amber-800 font-medium text-sm">Not Configured</p>
                  <p className="text-amber-700 text-xs mt-1">
                    Set PROPOSAL_SUMMARY_PATH in your .env file to enable auto-sync.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => chat.handleSubmit(action.prompt)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px]
                           bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700
                           text-slate-500 dark:text-slate-400
                           hover:border-cyan-300 dark:hover:border-cyan-600 hover:text-cyan-600 dark:hover:text-cyan-400
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
                className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors"
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
