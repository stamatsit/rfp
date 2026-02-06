/**
 * Unified AI — Cross-Referential AI Hub
 *
 * Unified AI that connects the dots across:
 * - Q&A Library (answers + photos)
 * - Proposal History (win rates, trends)
 * - Case Studies (40+ case studies, testimonials, awards)
 *
 * The power: answering questions NO SINGLE SOURCE could answer.
 */

import { useState, useEffect, useRef } from "react"
import {
  Layers,
  Send,
  Copy,
  Check,
  Loader2,
  Database,
  Bot,
  User,
  Lightbulb,
  Sparkles,
  Target,
  AlertTriangle,
  FileCheck,
  Search,
  Briefcase,
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
  unifiedAIApi,
  type UnifiedAIResponse,
} from "@/lib/api"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  dataUsed?: UnifiedAIResponse["dataUsed"]
  crossReferenceInsights?: string[]
  followUpPrompts?: string[]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
}

// Quick action buttons — 6 power prompts
const QUICK_ACTIONS = [
  {
    icon: Sparkles,
    label: "Win Formula",
    prompt: "Cross-reference our wins against our case studies and library. What's our true winning formula? Where do we have proof, and where are we missing it?",
  },
  {
    icon: FileCheck,
    label: "Proof Finder",
    prompt: "I need to build a proposal. Find me: (1) relevant case studies with metrics, (2) testimonials from similar clients we've won, (3) library content I can use. I'll tell you the school type and services.",
  },
  {
    icon: AlertTriangle,
    label: "Gap Finder",
    prompt: "Analyze disconnects: services we win but lack case studies for, clients we won but never got testimonials from, opportunities we're missing.",
  },
  {
    icon: Target,
    label: "Content Audit",
    prompt: "Which library content appears in our winning proposals? Which case studies align with our highest win rates? Rate our proof points by performance.",
  },
  {
    icon: Briefcase,
    label: "Prep Proposal",
    prompt: "Prep me for a proposal. I'll give you the school type, services, and affiliation. Give me: win probability, best case studies to feature, key library answers, and strategic approach.",
  },
  {
    icon: Search,
    label: "Smart Search",
    prompt: "Search across ALL my data sources. Find everything related to what I'll describe — proposals we've won, case studies, testimonials, library answers, and photos.",
  },
]

// Starter prompts
const STARTER_PROMPTS = [
  "I'm pitching a community college website project. Prep me.",
  "Find gaps — what have we won but don't have proof for?",
  "What's our true win formula? Where do we have the proof?",
  "Find testimonials from clients we actually won recently",
  "Which case studies should we use for university branding?",
]

export function UnifiedAI() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showDataContext, setShowDataContext] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
      const result = await unifiedAIApi.query(queryText)

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        dataUsed: result.dataUsed,
        crossReferenceInsights: result.crossReferenceInsights,
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
        refusalReason: "Failed to connect to Unified AI. Please try again.",
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

  const formatWinRate = (rate: number) => `${(rate * 100).toFixed(0)}%`

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(79,70,229,0.1) 100%)",
                  boxShadow:
                    "0 4px 20px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <Layers size={36} className="text-indigo-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                Unified AI
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
                Connect the dots across proposals, case studies, and your Q&A library.
              </p>

              {/* Quick Actions — single row */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSubmit(action.prompt)}
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

              {/* Starter prompts as plain text links */}
              <div className="flex flex-col items-center gap-1.5">
                {STARTER_PROMPTS.slice(0, 3).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInputValue(prompt)}
                    className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
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
                          "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
                        boxShadow:
                          "0 4px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                      }}
                    >
                      <Bot size={18} className="text-white" />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
                    {message.role === "user" ? (
                      <div className="bg-gradient-to-br from-indigo-50 to-violet-100/80 text-slate-800 px-5 py-3.5 rounded-2xl rounded-tr-md shadow-[0_1px_3px_rgba(99,102,241,0.1)] border border-indigo-200/60">
                        <p className="leading-relaxed text-[15px]">{message.content}</p>
                      </div>
                    ) : message.refused ? (
                      <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_8px_rgba(245,158,11,0.08)]">
                        <CardContent className="p-5">
                          <p className="text-amber-800 text-[15px]">
                            {message.refusalReason || "Unable to process request."}
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

                          {/* Cross-Reference Insights */}
                          {message.crossReferenceInsights && message.crossReferenceInsights.length > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 rounded-lg">
                              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                                <AlertTriangle size={12} />
                                Cross-Reference Insights
                              </div>
                              <ul className="space-y-1">
                                {message.crossReferenceInsights.map((insight, idx) => (
                                  <li key={idx} className="text-xs text-amber-800 dark:text-amber-300">
                                    {insight}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Data Context (collapsible) */}
                          {message.dataUsed && (
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                              <button
                                onClick={() => toggleDataContext(message.id)}
                                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors w-full"
                              >
                                <Database size={12} className="text-indigo-500" />
                                <span className="font-medium">
                                  {message.dataUsed.proposals.count} proposals &middot; {message.dataUsed.caseStudies.count} case studies &middot; {message.dataUsed.library.answers} answers
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
                                  <div className="grid grid-cols-3 gap-3 text-xs">
                                    <div>
                                      <span className="text-slate-400 block mb-1">Proposals</span>
                                      <span className="text-indigo-600 font-medium">
                                        {message.dataUsed.proposals.count}
                                      </span>
                                      <span className="text-slate-500 ml-1">
                                        ({formatWinRate(message.dataUsed.proposals.winRate)} win)
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block mb-1">Case Studies</span>
                                      <span className="text-indigo-600 font-medium">
                                        {message.dataUsed.caseStudies.count}
                                      </span>
                                      <span className="text-slate-500 ml-1">
                                        + {message.dataUsed.caseStudies.testimonials} testimonials
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block mb-1">Library</span>
                                      <span className="text-indigo-600 font-medium">
                                        {message.dataUsed.library.answers} answers
                                      </span>
                                      <span className="text-slate-500 ml-1">
                                        + {message.dataUsed.library.photos} photos
                                      </span>
                                    </div>
                                  </div>
                                  {message.dataUsed.proposals.relevantClients.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                      <span className="text-slate-400 text-xs">Recent wins: </span>
                                      <span className="text-xs text-slate-600 dark:text-slate-300">
                                        {message.dataUsed.proposals.relevantClients.slice(0, 5).join(", ")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Follow-up Prompts */}
                          {message.followUpPrompts && message.followUpPrompts.length > 0 && (
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                <Lightbulb size={12} className="text-indigo-500" />
                                <span className="font-medium">Dig deeper:</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {message.followUpPrompts.map((prompt, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSubmit(prompt)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50
                                               text-indigo-700 dark:text-indigo-300 text-xs rounded-full border border-indigo-200 dark:border-indigo-700
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
                                  <Check size={12} className="mr-1.5 text-indigo-500" />
                                  <span className="text-indigo-600">Copied</span>
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
                      background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
                      boxShadow:
                        "0 4px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    <Bot size={18} className="text-white" />
                  </div>
                  <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-indigo-500" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 dark:text-slate-300 text-[14px] font-medium">
                            Cross-referencing
                          </span>
                          <span className="flex gap-1">
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            />
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-slate-400 mt-2">
                        Connecting proposals, case studies, and library...
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
                             bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-900/30
                             text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400
                             border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700
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
                placeholder="Ask across all your data sources..."
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
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 shadow-[0_4px_12px_rgba(99,102,241,0.3)]"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
