import { useState, useCallback, useRef, useEffect } from "react"
import DOMPurify from "dompurify"
import { ArrowRight, Sparkles, FileSearch, PanelLeftOpen, PanelLeftClose, Clock, MessageSquarePlus, Trash2, Pencil, History, Send, Loader2, Paperclip, X, FileText, ChevronDown, ChevronUp, Copy, Check as CheckIcon, Square, Database, PenLine, Lightbulb, Users, List, Wand2 } from "lucide-react"
import { useChat } from "@/hooks/useChat"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { type ChartConfig } from "@/types/chat"
import type { UseDocumentStoreReturn } from "@/hooks/useDocumentStore"
import type { ConversationSummary } from "@/lib/api"
import { markdownToHtml, svgToImg } from "@/lib/markdownToHtml"
import { studioApi } from "@/lib/api"
import { DataBrowserPanel } from "./DataBrowserPanel"

interface StudioChatSidebarProps {
  documentStore: UseDocumentStoreReturn
  onRFPDetected?: (rfpText: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  blogWizardActive?: boolean
  onBlogWizardChange?: (active: boolean) => void
}

// ── Blog Wizard Steps ────────────────────────────────────

const BLOG_STEPS = [
  { id: "topic" as const, label: "Topic", icon: Lightbulb },
  { id: "audience" as const, label: "Audience", icon: Users },
  { id: "outline" as const, label: "Outline", icon: List },
  { id: "draft" as const, label: "Draft", icon: PenLine },
  { id: "polish" as const, label: "Polish", icon: Wand2 },
]

type BlogWizardStep = typeof BLOG_STEPS[number]["id"]

const BLOG_STEP_PROMPTS: Record<BlogWizardStep, string> = {
  topic: "I want to write a blog post. Help me pick a compelling topic based on Stamats' expertise and recent wins.",
  audience: "Let's define the target audience and tone for this blog post.",
  outline: "Generate a detailed outline for this blog post with key sections, data points, and case studies to reference.",
  draft: "Write the full blog post draft based on our outline. Use real Stamats data and keep it polished.",
  polish: "Review and polish this blog post. Suggest titles, meta description, SEO keywords, and any final improvements.",
}

function BlogWizardProgress({ currentStep, completedSteps, onStepClick }: {
  currentStep: BlogWizardStep
  completedSteps: Set<BlogWizardStep>
  onStepClick: (step: BlogWizardStep) => void
}) {
  const currentIdx = BLOG_STEPS.findIndex(s => s.id === currentStep)
  return (
    <div className="flex items-center gap-1 px-3 py-2.5 border-b border-emerald-100/60 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20">
      {BLOG_STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCurrent = step.id === currentStep
        const isCompleted = completedSteps.has(step.id)
        const isPast = idx < currentIdx
        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => onStepClick(step.id)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150 truncate ${
                isCurrent
                  ? "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40"
                  : isCompleted || isPast
                    ? "text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
              }`}
              title={step.label}
            >
              {isCompleted && !isCurrent ? (
                <CheckIcon className="w-3 h-3 flex-shrink-0" />
              ) : (
                <Icon className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="hidden sm:inline truncate">{step.label}</span>
            </button>
            {idx < BLOG_STEPS.length - 1 && (
              <div className={`w-3 h-px mx-0.5 flex-shrink-0 ${
                isPast || isCompleted ? "bg-emerald-300 dark:bg-emerald-700" : "bg-slate-200 dark:bg-slate-700"
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Strip SVG_DATA markers and raw SVG code from message content for display.
 *  During streaming the SVG arrives token-by-token and would show as raw code.
 *  After streaming, the server's cleanResponse already has SVG stripped,
 *  so this mainly catches the streaming case and any edge cases. */
function stripSVGFromContent(content: string): string {
  let cleaned = content
  // Remove complete SVG_DATA blocks (with or without code fences)
  cleaned = cleaned.replace(/```(?:svg|xml|html)?\s*\n?\s*SVG_DATA:\s*<svg[\s\S]*?<\/svg>\s*\n?\s*```/g, '')
  cleaned = cleaned.replace(/SVG_DATA:\s*<svg[\s\S]*?<\/svg>/g, '')
  cleaned = cleaned.replace(/```(?:svg|xml|html)?\s*\n?\s*<svg[\s\S]*?<\/svg>\s*\n?\s*```/g, '')
  // Remove partial/in-progress SVG_DATA marker during streaming (no closing tag yet)
  cleaned = cleaned.replace(/SVG_DATA:\s*(?:```(?:svg|xml|html)?\s*\n?\s*)?<svg[\s\S]*$/g, '')
  // Remove partial code-fenced SVG during streaming
  cleaned = cleaned.replace(/```(?:svg|xml|html)\s*\n?\s*<svg[\s\S]*$/g, '')
  return cleaned.trim()
}

// ── SVG Diagram Card ──────────────────────────────────────

function SVGDiagramCard({ svgData, onInsert }: { svgData: { svg: string; title: string }; onInsert: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(svgData.svg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/60 dark:bg-emerald-900/20 border-b border-emerald-200/50 dark:border-emerald-800/30">
        <div className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 dark:bg-emerald-800/40">
          <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="5" width="4" height="6" rx="1" />
            <rect x="10" y="5" width="4" height="6" rx="1" />
            <line x1="6" y1="8" x2="10" y2="8" />
          </svg>
        </div>
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex-1 truncate">{svgData.title || "Diagram"}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopy}
            className="w-5 h-5 flex items-center justify-center rounded text-emerald-600/70 dark:text-emerald-400/70 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors"
            title="Copy SVG code"
          >
            {copied ? <CheckIcon className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-5 h-5 flex items-center justify-center rounded text-emerald-600/70 dark:text-emerald-400/70 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {/* SVG preview */}
      {expanded && (
        <div className="p-2 overflow-x-auto [&_svg]:max-w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block bg-white dark:bg-slate-950/40">
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgData.svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
        </div>
      )}

      {/* Insert button */}
      <div className="px-3 py-2 border-t border-emerald-100/60 dark:border-emerald-800/30 bg-emerald-50/40 dark:bg-emerald-900/10">
        <button
          onClick={onInsert}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-lg transition-colors shadow-sm shadow-emerald-500/20"
        >
          <ArrowRight className="w-3 h-3" />
          Insert Diagram
        </button>
      </div>
    </div>
  )
}

export function StudioChatSidebar({ documentStore, onRFPDetected, collapsed, onToggleCollapse, blogWizardActive, onBlogWizardChange }: StudioChatSidebarProps) {
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; isExtracting?: boolean; isRFP?: boolean } | null>(null)
  const attachedFileRef = useRef<{ name: string; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Blog wizard state
  const [wizardStep, setWizardStep] = useState<BlogWizardStep>("topic")
  const [completedSteps, setCompletedSteps] = useState<Set<BlogWizardStep>>(new Set())
  const wizardInitRef = useRef(false)

  const chat = useChat({
    endpoint: "/studio/chat/query",
    streamEndpoint: "/studio/chat/stream",
    page: documentStore.mode === "review" ? "studio-review" : "studio",
    parseResult: (data) => ({
      content: data.response as string,
      followUpPrompts: data.followUpPrompts as string[] | undefined,
      chartData: data.chartData as ChartConfig | undefined,
      refused: data.refused as boolean | undefined,
      refusalReason: data.refusalReason as string | undefined,
    }),
    buildBody: (query) => ({
      query,
      documentContent: documentStore.content,
      reviewMode: documentStore.mode === "review",
      uploadedFileText: attachedFileRef.current?.text,
      blogWizardStep: blogWizardActive ? wizardStep : undefined,
    }),
    errorMessage: "Failed to get response from Studio AI",
  })

  // Auto-start wizard when blogWizardActive transitions to true
  useEffect(() => {
    if (blogWizardActive && !wizardInitRef.current) {
      wizardInitRef.current = true
      setWizardStep("topic")
      setCompletedSteps(new Set())
      chat.startNewConversation()
      // Small delay to let the new conversation start cleanly
      setTimeout(() => {
        chat.handleSubmit(BLOG_STEP_PROMPTS.topic)
      }, 100)
    }
    if (!blogWizardActive) {
      wizardInitRef.current = false
    }
  }, [blogWizardActive])

  const advanceWizardStep = useCallback(() => {
    const currentIdx = BLOG_STEPS.findIndex(s => s.id === wizardStep)
    setCompletedSteps(prev => new Set([...prev, wizardStep]))
    if (currentIdx < BLOG_STEPS.length - 1) {
      const nextStep = BLOG_STEPS[currentIdx + 1]!.id
      setWizardStep(nextStep)
      // Use setTimeout to ensure the state update happens before submit
      setTimeout(() => {
        chat.handleSubmit(BLOG_STEP_PROMPTS[nextStep])
      }, 50)
    } else {
      // Wizard complete
      onBlogWizardChange?.(false)
    }
  }, [wizardStep, chat, onBlogWizardChange])

  const handleWizardStepClick = useCallback((step: BlogWizardStep) => {
    setWizardStep(step)
    chat.handleSubmit(`Let's work on the ${step} step. ${BLOG_STEP_PROMPTS[step]}`)
  }, [chat])

  const handleFileSelect = useCallback(async (file: File) => {
    setAttachedFile({ name: file.name, text: "", isExtracting: true })
    try {
      const result = await studioApi.extractDocument(file)
      setAttachedFile({ name: file.name, text: result.text, isRFP: result.isRFP })
      attachedFileRef.current = { name: file.name, text: result.text }
      if (result.isRFP && onRFPDetected) {
        onRFPDetected(result.text)
      }
    } catch (err) {
      console.error("File extraction failed:", err)
      setAttachedFile(null)
      attachedFileRef.current = null
    }
  }, [onRFPDetected])

  const handleFileRemove = useCallback(() => {
    setAttachedFile(null)
    attachedFileRef.current = null
  }, [])

  const handleSubmit = useCallback((query?: string) => {
    chat.handleSubmit(query)
    setAttachedFile(null)
    attachedFileRef.current = null
  }, [chat])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }, [chat.inputValue])

  // Data browser
  const [dataBrowserOpen, setDataBrowserOpen] = useState(false)

  // Chat history popover
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!historyOpen) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [historyOpen])

  const isExtracting = attachedFile?.isExtracting ?? false

  // Collapsed view
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-white dark:bg-slate-900 py-4 gap-2">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-150"
          title="Expand AI sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
          title="AI"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 flex-shrink-0 border-b border-slate-100/60 dark:border-slate-800/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tracking-tight">
            {documentStore.mode === "review" ? "Review" : "AI"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setDataBrowserOpen((o) => !o)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
              dataBrowserOpen
                ? "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            }`}
            title="Data library"
          >
            <Database className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { chat.startNewConversation(); setHistoryOpen(false) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-150"
            title="New conversation"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
                historyOpen
                  ? "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
              title="Chat history"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            {historyOpen && (
              <ChatHistoryPopover
                conversations={chat.conversationList}
                activeId={chat.conversationId}
                onSelect={(id) => { chat.loadConversation(id); setHistoryOpen(false) }}
                onDelete={chat.deleteConversation}
                onRename={chat.renameConversation}
              />
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-150"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Blog Wizard Progress */}
      {blogWizardActive && (
        <BlogWizardProgress
          currentStep={wizardStep}
          completedSteps={completedSteps}
          onStepClick={handleWizardStepClick}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <p className="text-[12px] text-slate-400 dark:text-slate-500 text-center mb-5 leading-relaxed">
              {documentStore.mode === "review"
                ? "Ask for a review of your document."
                : "Ask AI to help draft or improve your document."}
            </p>
            {documentStore.mode === "editor" && (
              <div className="space-y-1.5 w-full max-w-[260px]">
                {[
                  "Write an executive summary",
                  "Draft a proposal response from Q&A library",
                  "Add a case study from our portfolio",
                ].map((label) => (
                  <button
                    key={label}
                    onClick={() => handleSubmit(label)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-[12px] text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-150 group"
                  >
                    <span className="flex-1 leading-snug">{label}</span>
                    <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-4 space-y-5">
            {chat.messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-1 px-1">You</p>
                    <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-[12px] text-slate-700 dark:text-slate-200 leading-relaxed">
                      {message.content}
                    </div>
                  </div>
                ) : message.refused ? (
                  <div className="pl-3 border-l-2 border-amber-300 dark:border-amber-600">
                    <div className="px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      {message.refusalReason || "Unable to process request."}
                    </div>
                  </div>
                ) : (
                  <div className="pl-3 border-l-2 border-emerald-200 dark:border-emerald-800/60">
                    <div className="space-y-2">
                      <div className="text-[12px] text-slate-700 dark:text-slate-300 leading-[1.7] [&_.md-h2]:text-[13px] [&_.md-h2]:font-semibold [&_.md-h2]:mt-3 [&_.md-h2]:mb-1 [&_.md-h3]:text-[12px] [&_.md-h3]:font-semibold [&_.md-h3]:mt-2 [&_.md-h3]:mb-1 [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:text-[12px] [&_p]:mb-1.5 [&_pre]:text-[11px] [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:bg-slate-50 [&_pre]:dark:bg-slate-800/60">
                        <MarkdownRenderer content={stripSVGFromContent(message.content)} />
                      </div>
                      {message.svgData && (
                        <SVGDiagramCard
                          svgData={message.svgData}
                          onInsert={() => documentStore.insertContent(svgToImg(message.svgData!.svg))}
                        />
                      )}
                      {/* Follow-ups */}
                      {message.followUpPrompts && message.followUpPrompts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {message.followUpPrompts.map((prompt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSubmit(prompt)}
                              className="group flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-full transition-all duration-150"
                            >
                              {prompt}
                              <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity duration-150 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Blog Wizard: Next Step / Finish */}
                      {blogWizardActive && !chat.isStreaming && message.id === chat.messages[chat.messages.length - 1]?.id && (
                        <div className="pt-1.5">
                          {BLOG_STEPS.findIndex(s => s.id === wizardStep) < BLOG_STEPS.length - 1 ? (
                            <button
                              onClick={advanceWizardStep}
                              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-lg transition-colors w-full justify-center"
                            >
                              Next: {BLOG_STEPS[BLOG_STEPS.findIndex(s => s.id === wizardStep) + 1]?.label}
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setCompletedSteps(prev => new Set([...prev, wizardStep]))
                                onBlogWizardChange?.(false)
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-lg transition-colors w-full justify-center"
                            >
                              <CheckIcon className="w-3 h-3" />
                              Finish Blog Post
                            </button>
                          )}
                        </div>
                      )}
                      {/* Insert / Comments actions */}
                      {(message.content || message.svgData || message.reviewAnnotations?.length) && (
                        <div className="flex gap-2 pt-1">
                          {(message.content || message.svgData) && (
                            <button
                              onClick={() => {
                                const textContent = stripSVGFromContent(message.content)
                                const parts: string[] = []
                                if (textContent) parts.push(markdownToHtml(textContent))
                                if (message.svgData) parts.push(svgToImg(message.svgData.svg))
                                if (parts.length > 0) documentStore.insertContent(parts.join(''))
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all duration-150"
                            >
                              <ArrowRight className="w-3 h-3" />
                              Insert into document
                            </button>
                          )}
                          {message.reviewAnnotations && message.reviewAnnotations.length > 0 && (
                            <button
                              onClick={() => documentStore.setAnnotations(message.reviewAnnotations!)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all duration-150"
                            >
                              <FileSearch className="w-3 h-3" />
                              {message.reviewAnnotations.length} comments
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming indicator — subtle pulsing bar */}
            {chat.isStreaming && (
              <div className="pl-3 border-l-2 border-emerald-200 dark:border-emerald-800/60">
                <div className="h-4 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-pulse" />
              </div>
            )}
            <div ref={chat.messagesEndRef as React.RefObject<HTMLDivElement>} />
          </div>
        )}
      </div>

      {/* Data Browser Panel */}
      {dataBrowserOpen && (
        <DataBrowserPanel
          onInsert={(content) => documentStore.insertContent(content)}
          onAskAI={(prompt) => {
            chat.setInputValue(prompt)
            setDataBrowserOpen(false)
          }}
        />
      )}

      {/* Input — unified box with attach + send inside */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-slate-100/60 dark:border-slate-800/60">
        {/* Attached file chip */}
        {attachedFile && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/50 dark:border-slate-700/40">
            <FileText className="w-3 h-3 text-slate-500 dark:text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-600 dark:text-slate-300 flex-1 truncate font-medium">{attachedFile.name}</span>
            {attachedFile.isRFP && !isExtracting && (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded flex-shrink-0 uppercase tracking-wider">RFP</span>
            )}
            {isExtracting ? (
              <Loader2 className="w-3 h-3 text-slate-400 animate-spin flex-shrink-0" />
            ) : (
              <button onClick={handleFileRemove} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0">
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
        )}
        <div className="relative">
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelect(file)
            e.target.value = ""
          }} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={chat.isLoading || isExtracting}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40 z-10"
            title="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <textarea
            ref={textareaRef}
            value={chat.inputValue}
            onChange={(e) => chat.setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={documentStore.mode === "review" ? "Ask for a review..." : "Ask anything..."}
            disabled={chat.isLoading}
            rows={1}
            className="w-full rounded-xl bg-slate-50 dark:bg-slate-800/40 pl-9 pr-9 py-2.5 text-[12px] text-slate-900 dark:text-white leading-snug placeholder:text-slate-400/70 dark:placeholder:text-slate-500/70 border border-slate-200/50 dark:border-slate-700/40 focus:border-slate-300 dark:focus:border-slate-600 focus:outline-none resize-none overflow-hidden disabled:opacity-50 transition-all duration-150"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {chat.isStreaming ? (
              <button
                onClick={() => chat.abortStream()}
                className="w-6 h-6 flex items-center justify-center rounded-md text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-150"
                title="Stop generating"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => handleSubmit()}
                disabled={!chat.inputValue.trim() || chat.isLoading || isExtracting}
                className={`w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150 ${
                  chat.inputValue.trim() && !chat.isLoading
                    ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    : "text-slate-300 dark:text-slate-600"
                } disabled:opacity-25`}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Chat history popover ──────────────────────────────────

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

function ChatHistoryPopover({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) {
      editRef.current?.focus()
      editRef.current?.select()
    }
  }, [editingId])

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim())
    setEditingId(null)
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden animate-fade-in-up">
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent Conversations</p>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">No conversations yet</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId
              const isEditing = conv.id === editingId
              return (
                <div
                  key={conv.id}
                  className={`group relative rounded-lg transition-colors ${
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <button
                    onClick={() => !isEditing && onSelect(conv.id)}
                    className="w-full text-left px-3 py-2 pr-14"
                  >
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400 text-slate-900 dark:text-white"
                      />
                    ) : (
                      <p className={`text-xs font-medium truncate ${
                        isActive ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"
                      }`}>
                        {conv.title}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {timeAgo(conv.updatedAt)}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {conv.messageCount} msgs
                      </span>
                    </div>
                  </button>
                  {!isEditing && (
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(conv.id)
                          setEditValue(conv.title)
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-600/60 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                        className="p-1 rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
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
