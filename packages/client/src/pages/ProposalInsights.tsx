/**
 * Proposal Insights Page
 *
 * COMPLETELY ISOLATED from the Q&A library AI (AskAI.tsx).
 * Uses the same UI pattern but with cyan theme and proposal-specific functionality.
 */

import { useState, useEffect, useRef } from "react"
import {
  TrendingUp,
  Send,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Database,
  Calendar,
  AlertCircle,
  Bot,
  User,
  Lightbulb,
  BarChart3,
  Target,
  Users,
  LineChart,
  Building2,
  Sparkles,
  ChevronDown,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  Button,
  Card,
  CardContent,
  Input,
} from "@/components/ui"
import {
  proposalInsightsApi,
  type ProposalInsightResponse,
  type ProposalSyncStatus,
} from "@/lib/api"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  dataUsed?: ProposalInsightResponse["dataUsed"]
  followUpPrompts?: string[]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
}

// Quick action buttons with predefined prompts
const QUICK_ACTIONS = [
  {
    icon: BarChart3,
    label: "Win Rates",
    prompt: "Give me a comprehensive breakdown of our win rates by all dimensions",
  },
  {
    icon: Target,
    label: "Services",
    prompt: "Analyze our services - what wins, what doesn't, and bundling opportunities",
  },
  {
    icon: Users,
    label: "Team",
    prompt: "Show me account executive performance with insights",
  },
  {
    icon: LineChart,
    label: "Trends",
    prompt: "Analyze temporal trends - best months, years, and trajectory",
  },
  {
    icon: Building2,
    label: "By School Type",
    prompt: "Break down performance by school type with recommendations",
  },
  {
    icon: Sparkles,
    label: "Recommendations",
    prompt: "Based on all our data, give me 5 strategic recommendations to improve win rate",
  },
]

// Starter prompts for empty state
const STARTER_PROMPTS = [
  "What's our overall win rate?",
  "Which services win the most?",
  "Compare community colleges vs universities",
  "Best performing account executives",
  "Show trends over time",
]

export function ProposalInsights() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<ProposalSyncStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showDataContext, setShowDataContext] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load sync status on mount
  useEffect(() => {
    loadSyncStatus()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
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

  const handleSubmit = async (query?: string) => {
    const queryText = query || inputValue.trim()
    if (!queryText || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: queryText,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    try {
      const result = await proposalInsightsApi.query(queryText)

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        dataUsed: result.dataUsed,
        followUpPrompts: result.followUpPrompts,
        refused: result.refused,
        refusalReason: result.refusalReason,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error("Query failed:", err)
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        refused: true,
        refusalReason: "Failed to connect to insights service. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleDataContext = (messageId: string) => {
    setShowDataContext((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Status Bar */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing || !syncStatus?.configured}
            className="h-8 border-cyan-200 hover:border-cyan-300 hover:bg-cyan-50"
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${isSyncing ? "animate-spin text-cyan-500" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(8,145,178,0.1) 100%)",
                  boxShadow:
                    "0 4px 20px rgba(6,182,212,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <TrendingUp size={36} className="text-cyan-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                Proposal Insights
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
                AI-powered analytics on your proposal history. Ask questions to uncover win rate
                patterns, trends, and strategic insights.
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

              {/* Starter Prompts */}
              <div className="flex flex-wrap gap-2.5 justify-center max-w-lg mb-8">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInputValue(prompt)}
                    className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-[13px] text-slate-600 dark:text-slate-300
                               shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-cyan-300 dark:hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400
                               hover:shadow-[0_2px_8px_rgba(6,182,212,0.12)] transition-all duration-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="w-full max-w-2xl">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Quick Insights
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSubmit(action.prompt)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700
                                 hover:border-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-all duration-200 group"
                    >
                      <action.icon
                        size={20}
                        className="text-slate-400 group-hover:text-cyan-500 transition-colors"
                      />
                      <span className="text-[11px] font-medium text-slate-500 group-hover:text-cyan-600 transition-colors">
                        {action.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)",
                        boxShadow:
                          "0 4px 12px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                      }}
                    >
                      <Bot size={18} className="text-white" />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
                    {message.role === "user" ? (
                      <div className="bg-gradient-to-br from-cyan-50 to-teal-100/80 text-slate-800 px-5 py-3.5 rounded-2xl rounded-tr-md shadow-[0_1px_3px_rgba(6,182,212,0.1)] border border-cyan-200/60">
                        <p className="leading-relaxed text-[15px]">{message.content}</p>
                      </div>
                    ) : message.refused ? (
                      <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_8px_rgba(245,158,11,0.08)]">
                        <CardContent className="p-5">
                          <p className="text-amber-800 text-[15px]">
                            {message.refusalReason || "Unable to analyze proposals."}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                        <CardContent className="p-5 space-y-4">
                          {/* AI Response */}
                          <div className="prose prose-slate prose-sm max-w-none">
                            <div
                              className="whitespace-pre-wrap leading-[1.7] text-slate-700 dark:text-slate-200 text-[15px]"
                              dangerouslySetInnerHTML={{
                                __html: message.content
                                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                                  .replace(/\n/g, "<br />"),
                              }}
                            />
                          </div>

                          {/* Data Context (collapsible) */}
                          {message.dataUsed && (
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                              <button
                                onClick={() => toggleDataContext(message.id)}
                                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors w-full"
                              >
                                <Database size={12} className="text-cyan-500" />
                                <span className="font-medium">
                                  Based on {message.dataUsed.totalProposals} proposals
                                </span>
                                <ChevronDown
                                  size={12}
                                  className={`ml-auto transition-transform ${
                                    showDataContext.has(message.id) ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {showDataContext.has(message.id) && (
                                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <span className="text-slate-400">Date Range:</span>
                                      <span className="ml-2 text-slate-600 dark:text-slate-300">
                                        {formatDate(message.dataUsed.dateRange.from)} -{" "}
                                        {formatDate(message.dataUsed.dateRange.to)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Win Rate:</span>
                                      <span className="ml-2 text-cyan-600 font-medium">
                                        {(message.dataUsed.overallWinRate * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Won:</span>
                                      <span className="ml-2 text-green-600">
                                        {message.dataUsed.wonCount}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Lost:</span>
                                      <span className="ml-2 text-red-500">
                                        {message.dataUsed.lostCount}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Follow-up Prompts */}
                          {message.followUpPrompts && message.followUpPrompts.length > 0 && (
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                <Lightbulb size={12} className="text-cyan-500" />
                                <span className="font-medium">Dig deeper:</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {message.followUpPrompts.map((prompt, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSubmit(prompt)}
                                    className="px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:hover:bg-cyan-900/50
                                               text-cyan-700 dark:text-cyan-300 text-xs rounded-full border border-cyan-200 dark:border-cyan-700
                                               transition-colors"
                                  >
                                    {prompt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => handleCopy(message.content, message.id)}
                            >
                              {copiedId === message.id ? (
                                <>
                                  <Check size={12} className="mr-1.5 text-cyan-500" />
                                  <span className="text-cyan-600">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} className="mr-1.5" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <p className="text-xs text-slate-400 mt-1.5 px-1">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {message.role === "user" && (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                      <User size={18} className="text-slate-600" />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-4 justify-start animate-fade-in-up">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)",
                      boxShadow:
                        "0 4px 12px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    <Bot size={18} className="text-white" />
                  </div>
                  <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-cyan-500" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 dark:text-slate-300 text-[14px] font-medium">
                            Analyzing
                          </span>
                          <span className="flex gap-1">
                            <span
                              className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            />
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-slate-400 mt-2">
                        Processing your proposal data...
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 border-t border-slate-200/60 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Quick Actions Bar (when messages exist) */}
          {messages.length > 0 && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">Quick:</span>
              {QUICK_ACTIONS.slice(0, 4).map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSubmit(action.prompt)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-full
                             bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-cyan-900/30
                             text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400
                             border border-transparent hover:border-cyan-200 dark:hover:border-cyan-700
                             transition-all duration-200 disabled:opacity-50"
                >
                  <action.icon size={12} />
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3 items-end">
            {/* Input */}
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your proposal history..."
                className="h-12 pr-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                disabled={isLoading}
              />
            </div>

            {/* Send Button */}
            <Button
              onClick={() => handleSubmit()}
              disabled={!inputValue.trim() || isLoading}
              size="lg"
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 shadow-[0_4px_12px_rgba(6,182,212,0.3)]"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
