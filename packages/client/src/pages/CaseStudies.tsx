/**
 * Case Studies — AI-powered case study builder.
 *
 * COMPLETELY ISOLATED from Q&A library AI and Proposal Insights.
 * Same UI pattern as ProposalInsights.tsx but with violet theme.
 */

import { useState, useEffect, useRef } from "react"
import DOMPurify from "dompurify"
import {
  BookOpen,
  Send,
  Copy,
  Check,
  Loader2,
  Database,
  Bot,
  User,
  Lightbulb,
  BarChart3,
  Quote,
  FileText,
  Sparkles,
  Award,
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
  caseStudiesApi,
  type CaseStudyInsightResponse,
} from "@/lib/api"
import { clientSuccessData } from "@/data/clientSuccessData"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  dataUsed?: CaseStudyInsightResponse["dataUsed"]
  followUpPrompts?: string[]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
}

// Quick actions — use-case suggestions + data grabs
const USE_CASE_ACTIONS = [
  {
    icon: BookOpen,
    label: "For a Case Study",
    prompt: "I'm building a case study. Find me relevant client results, metrics, and testimonials.",
  },
  {
    icon: FileText,
    label: "For a Proposal",
    prompt: "I'm writing a proposal. Pull our strongest proof points and comparable wins.",
  },
  {
    icon: Sparkles,
    label: "For a Presentation",
    prompt: "I need highlights for a presentation. Give me our most impressive stats and quotes.",
  },
]

const GRAB_ACTIONS = [
  {
    icon: BarChart3,
    label: "Grab a Stat",
    prompt: "Show me the most compelling stats from our client success database.",
  },
  {
    icon: Quote,
    label: "Find Quote",
    prompt: "Find a testimonial from our database that I can use.",
  },
  {
    icon: Award,
    label: "Find Proof",
    prompt: "What awards or third-party validations do we have that I can reference?",
  },
]

const ALL_ACTIONS = [...USE_CASE_ACTIONS, ...GRAB_ACTIONS]

// Starter prompts
const STARTER_PROMPTS = [
  "What are our strongest enrollment growth numbers?",
  "Find a healthcare testimonial I can use",
  "What awards have we won recently?",
]

export function CaseStudies() {
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
      const result = await caseStudiesApi.query(queryText)

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
        refusalReason: "Failed to connect to case study service. Please try again.",
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
                    "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(124,58,237,0.1) 100%)",
                  boxShadow:
                    "0 4px 20px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <BookOpen size={36} className="text-violet-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                Client Success
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
                Pull stats, testimonials, awards, and highlights from {clientSuccessData.caseStudies.length} client projects.
              </p>

              {/* Quick Actions — single row */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {ALL_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSubmit(action.prompt)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px]
                               bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700
                               text-slate-500 dark:text-slate-400
                               hover:border-violet-300 dark:hover:border-violet-600 hover:text-violet-600 dark:hover:text-violet-400
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
                    className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
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
                          "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
                        boxShadow:
                          "0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                      }}
                    >
                      <Bot size={18} className="text-white" />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
                    {message.role === "user" ? (
                      <div className="bg-gradient-to-br from-violet-50 to-purple-100/80 text-slate-800 px-5 py-3.5 rounded-2xl rounded-tr-md shadow-[0_1px_3px_rgba(139,92,246,0.1)] border border-violet-200/60">
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
                                __html: DOMPurify.sanitize(
                                  message.content
                                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                                    .replace(/\n/g, "<br />"),
                                  { ALLOWED_TAGS: ["strong", "br", "em", "ul", "ol", "li", "p"] }
                                ),
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
                                <Database size={12} className="text-violet-500" />
                                <span className="font-medium">
                                  Referenced {message.dataUsed.totalCaseStudies} case studies, {message.dataUsed.totalTestimonials} testimonials, {message.dataUsed.totalStats} stats
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
                                      <span className="text-slate-400">Case Studies:</span>
                                      <span className="ml-2 text-violet-600 font-medium">
                                        {message.dataUsed.totalCaseStudies}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Top-Line Results:</span>
                                      <span className="ml-2 text-violet-600 font-medium">
                                        {message.dataUsed.totalStats}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Testimonials:</span>
                                      <span className="ml-2 text-violet-600 font-medium">
                                        {message.dataUsed.totalTestimonials}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Categories:</span>
                                      <span className="ml-2 text-slate-600 dark:text-slate-300">
                                        {message.dataUsed.categoriesSearched.join(", ")}
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
                                <Lightbulb size={12} className="text-violet-500" />
                                <span className="font-medium">Dig deeper:</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {message.followUpPrompts.map((prompt, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSubmit(prompt)}
                                    className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50
                                               text-violet-700 dark:text-violet-300 text-xs rounded-full border border-violet-200 dark:border-violet-700
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
                                  <Check size={12} className="mr-1.5 text-violet-500" />
                                  <span className="text-violet-600">Copied</span>
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
                      background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
                      boxShadow:
                        "0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    <Bot size={18} className="text-white" />
                  </div>
                  <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-violet-500" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 dark:text-slate-300 text-[14px] font-medium">
                            Building
                          </span>
                          <span className="flex gap-1">
                            <span
                              className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            />
                            <span
                              className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            />
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-slate-400 mt-2">
                        Thinking...
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
              {ALL_ACTIONS.slice(0, 4).map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSubmit(action.prompt)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-full
                             bg-slate-100 hover:bg-violet-50 dark:bg-slate-800 dark:hover:bg-violet-900/30
                             text-slate-600 hover:text-violet-600 dark:text-slate-300 dark:hover:text-violet-400
                             border border-transparent hover:border-violet-200 dark:hover:border-violet-700
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
                placeholder="Search client highlights, stats, or testimonials..."
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
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
