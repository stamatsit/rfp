/**
 * Case Studies — AI-powered case study builder.
 *
 * COMPLETELY ISOLATED from Q&A library AI and Proposal Insights.
 * Uses shared chat infrastructure with violet theme.
 */

import { useCallback } from "react"
import {
  BookOpen,
  Database,
  BarChart3,
  Quote,
  FileText,
  Sparkles,
  Award,
} from "lucide-react"
import { ChatContainer } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { clientSuccessData } from "@/data/clientSuccessData"
import { CHAT_THEMES, type QuickAction, type ChatMessage } from "@/types/chat"

const theme = CHAT_THEMES.violet

const QUICK_ACTIONS: QuickAction[] = [
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

const STARTER_PROMPTS = [
  "What are our strongest enrollment growth numbers?",
  "Find a healthcare testimonial I can use",
  "What awards have we won recently?",
]

const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  refused: data.refused as boolean | undefined,
  refusalReason: data.refusalReason as string | undefined,
  metadata: data.dataUsed as Record<string, unknown> | undefined,
})

export function CaseStudies() {
  const chat = useChat({
    endpoint: "/ai/case-studies",
    streamEndpoint: "/ai/case-studies/stream",
    parseResult,
    errorMessage: "Failed to connect to case study service. Please try again.",
  })

  const renderDataContext = useCallback((message: ChatMessage) => {
    const dataUsed = message.metadata as {
      totalCaseStudies?: number
      totalTestimonials?: number
      totalStats?: number
      categoriesSearched?: string[]
    } | undefined
    if (!dataUsed) return null

    return (
      <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500 w-full mb-2">
          <Database size={12} className="text-violet-500" />
          <span className="font-medium">
            Referenced {dataUsed.totalCaseStudies} case studies, {dataUsed.totalTestimonials} testimonials, {dataUsed.totalStats} stats
          </span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Case Studies:</span>
              <span className="ml-2 text-violet-600 font-medium">{dataUsed.totalCaseStudies}</span>
            </div>
            <div>
              <span className="text-slate-400">Top-Line Results:</span>
              <span className="ml-2 text-violet-600 font-medium">{dataUsed.totalStats}</span>
            </div>
            <div>
              <span className="text-slate-400">Testimonials:</span>
              <span className="ml-2 text-violet-600 font-medium">{dataUsed.totalTestimonials}</span>
            </div>
            <div>
              <span className="text-slate-400">Categories:</span>
              <span className="ml-2 text-slate-600 dark:text-slate-300">
                {dataUsed.categoriesSearched?.join(", ")}
              </span>
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
      placeholder="Search client highlights, stats, or testimonials..."
      quickActions={QUICK_ACTIONS}
      renderDataContext={renderDataContext}
      emptyState={
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(124,58,237,0.1) 100%)",
              boxShadow: "0 4px 20px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
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

          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => chat.handleSubmit(action.prompt)}
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

          <div className="flex flex-col items-center gap-1.5">
            {STARTER_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => chat.setInputValue(prompt)}
                className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
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
