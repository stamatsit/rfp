import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Sparkles,
  Send,
  Copy,
  Check,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  Bot,
  Image,
  Wand2,
  Brain,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { ContextualHelp, askAIPageHelp } from "@/components/ContextualHelp"
import {
  Button,
  Card,
  CardContent,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Textarea,
} from "@/components/ui"
import { topicsApi, aiApi, photosApi, type AIQueryResponse, type AdaptationType } from "@/lib/api"
import type { Topic } from "@/types"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: AIQueryResponse["sources"]
  photos?: AIQueryResponse["photos"]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
  // For refined messages, stores the refinement type label
  refinementLabel?: string
}

interface AdaptState {
  messageId: string
  showPanel: boolean
  type: AdaptationType
  customInstruction: string
  targetWordCount: number
  isLoading: boolean
  error?: string
}

// Helper to parse thinking chain from AI response
function parseThinkingChain(content: string): { thinking: string | null; answer: string } {
  // Look for **Thinking:** and **Answer:** sections
  const thinkingMatch = content.match(/\*\*Thinking:\*\*\s*([\s\S]*?)(?=\*\*Answer:\*\*|$)/i)
  const answerMatch = content.match(/\*\*Answer:\*\*\s*([\s\S]*?)$/i)

  if (thinkingMatch?.[1] && answerMatch?.[1]) {
    return {
      thinking: thinkingMatch[1].trim(),
      answer: answerMatch[1].trim(),
    }
  }

  // If no structured format, return content as answer
  return { thinking: null, answer: content }
}

// Simple markdown-like renderer for thinking bullets
function renderThinkingContent(content: string) {
  const lines = content.split('\n').filter(line => line.trim())
  return lines.map((line, i) => {
    // Remove leading "- " from bullets
    const text = line.replace(/^-\s*/, '')
    return (
      <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
        <span className="text-purple-400 mt-0.5">•</span>
        <span>{text}</span>
      </div>
    )
  })
}

export function AskAI() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [topics, setTopics] = useState<Topic[]>([])
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const [adaptStates, setAdaptStates] = useState<Map<string, AdaptState>>(new Map())

  // Direct refine mode - paste content and refine with custom prompt
  const [refineMode, setRefineMode] = useState(false)
  const [refineContent, setRefineContent] = useState("")
  const [refineInstruction, setRefineInstruction] = useState("")
  const [isRefining, setIsRefining] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggleThinkingExpanded = (messageId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  // Load topics on mount
  useEffect(() => {
    async function loadTopics() {
      try {
        const topicsData = await topicsApi.getAll()
        setTopics(
          topicsData.map((t) => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            createdAt: new Date(t.createdAt).getTime(),
          }))
        )
      } catch (err) {
        console.error("Failed to load topics:", err)
      }
    }
    loadTopics()
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    try {
      const result = await aiApi.query({
        query: userMessage.content,
        topicId: topicFilter !== "all" ? topicFilter : undefined,
        maxSources: 5,
      })

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        sources: result.sources,
        photos: result.photos,
        refused: result.refused,
        refusalReason: result.refusalReason,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error("AI query failed:", err)
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        refused: true,
        refusalReason: "Failed to connect to AI service. Please try again.",
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

  const toggleSourceExpanded = (messageId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  const getAdaptState = (messageId: string): AdaptState => {
    return adaptStates.get(messageId) || {
      messageId,
      showPanel: false,
      type: "shorten" as AdaptationType,
      customInstruction: "",
      targetWordCount: 100,
      isLoading: false,
    }
  }

  const updateAdaptState = (messageId: string, updates: Partial<AdaptState>) => {
    setAdaptStates((prev) => {
      const next = new Map(prev)
      const current = getAdaptState(messageId)
      next.set(messageId, { ...current, ...updates })
      return next
    })
  }

  const toggleAdaptPanel = (messageId: string) => {
    const current = getAdaptState(messageId)
    updateAdaptState(messageId, { showPanel: !current.showPanel })
  }

  const getAdaptationLabel = (type: AdaptationType): string => {
    switch (type) {
      case "shorten": return "Shortened"
      case "expand": return "Expanded"
      case "bullets": return "Bullet Points"
      case "formal": return "Formal Tone"
      case "casual": return "Casual Tone"
      case "custom": return "Custom Refinement"
      default: return "Refined"
    }
  }

  // Handle direct refine from input area
  const handleDirectRefine = async () => {
    if (!refineContent.trim() || !refineInstruction.trim() || isRefining) return

    // Add user message showing they're refining
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `Refine this content: "${refineInstruction}"\n\n---\n${refineContent}`,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsRefining(true)

    try {
      const result = await aiApi.adapt({
        content: refineContent.trim(),
        adaptationType: "custom",
        customInstruction: refineInstruction.trim(),
      })

      if (result.refused) {
        const errorMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "",
          refused: true,
          refusalReason: result.refusalReason || "Failed to refine content.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      } else {
        const refinedMessage: Message = {
          id: `assistant-refined-${Date.now()}`,
          role: "assistant",
          content: result.adaptedContent || "",
          timestamp: new Date(),
          refinementLabel: "Custom Refinement",
        }
        setMessages((prev) => [...prev, refinedMessage])
      }

      // Clear the inputs and exit refine mode
      setRefineContent("")
      setRefineInstruction("")
      setRefineMode(false)
    } catch (err) {
      console.error("Direct refine failed:", err)
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        refused: true,
        refusalReason: "Failed to refine content. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsRefining(false)
      inputRef.current?.focus()
    }
  }

  const handleAdaptContent = async (messageId: string, content: string) => {
    const state = getAdaptState(messageId)
    updateAdaptState(messageId, { isLoading: true, error: undefined })

    try {
      const result = await aiApi.adapt({
        content,
        adaptationType: state.type,
        customInstruction: state.type === "custom" ? state.customInstruction : undefined,
        targetWordCount: state.type === "shorten" ? state.targetWordCount : undefined,
      })

      if (result.refused) {
        updateAdaptState(messageId, { isLoading: false, error: result.refusalReason })
      } else {
        // Add the adapted content as a new assistant message
        const refinedMessage: Message = {
          id: `assistant-refined-${Date.now()}`,
          role: "assistant",
          content: result.adaptedContent || "",
          timestamp: new Date(),
          refinementLabel: getAdaptationLabel(state.type),
        }
        setMessages((prev) => [...prev, refinedMessage])
        updateAdaptState(messageId, { isLoading: false, showPanel: false })
      }
    } catch (err) {
      console.error("Adaptation failed:", err)
      updateAdaptState(messageId, {
        isLoading: false,
        error: "Failed to adapt content. Please try again.",
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(124,58,237,0.1) 100%)',
                  boxShadow: '0 4px 20px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.5)'
                }}
              >
                <Sparkles size={36} className="text-purple-500" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                Ask anything about your library
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 text-[15px] leading-relaxed">
                I'll search through your approved Q&A content to provide accurate answers based on your organization's knowledge base.
              </p>
              <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
                {[
                  "What are our data privacy policies?",
                  "How do we handle customer support?",
                  "What is our refund policy?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInputValue(suggestion)}
                    className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-[13px] text-slate-600 dark:text-slate-300
                               shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-purple-300 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400
                               hover:shadow-[0_2px_8px_rgba(139,92,246,0.12)] transition-all duration-200"
                  >
                    {suggestion}
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
                        background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)',
                        boxShadow: '0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                      }}
                    >
                      <Bot size={18} className="text-white" />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
                    {message.role === "user" ? (
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100/80 text-slate-800 px-5 py-3.5 rounded-2xl rounded-tr-md shadow-[0_1px_3px_rgba(59,130,246,0.1)] border border-blue-200/60">
                        <p className="leading-relaxed text-[15px]">{message.content}</p>
                      </div>
                    ) : message.refused ? (
                      <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_8px_rgba(245,158,11,0.08)]">
                        <CardContent className="p-5">
                          <p className="text-amber-800 text-[15px]">
                            {message.refusalReason || "I couldn't find relevant content in the library."}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                        <CardContent className="p-5 space-y-4">
                          {/* AI Response with Thinking Chain */}
                          {(() => {
                            const { thinking, answer } = parseThinkingChain(message.content)
                            return (
                              <div className="space-y-3">
                                {message.refinementLabel && (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="purple" className="text-xs">
                                      <Wand2 size={10} className="mr-1" />
                                      {message.refinementLabel}
                                    </Badge>
                                  </div>
                                )}

                                {/* Thinking Section (collapsible) */}
                                {thinking && (
                                  <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50/40 via-white to-violet-50/30 overflow-hidden shadow-[0_1px_3px_rgba(139,92,246,0.06)]">
                                    <button
                                      onClick={() => toggleThinkingExpanded(message.id)}
                                      className="w-full flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-purple-700 hover:bg-purple-50/50 transition-all duration-150"
                                    >
                                      <Brain size={16} className="text-purple-500" />
                                      <span>Thinking Process</span>
                                      <ChevronRight
                                        size={16}
                                        className={`ml-auto text-purple-400 transition-transform duration-200 ${
                                          expandedThinking.has(message.id) ? "rotate-90" : ""
                                        }`}
                                      />
                                    </button>
                                    {expandedThinking.has(message.id) && (
                                      <div className="px-4 pb-4 space-y-1.5 border-t border-purple-100/60 animate-fade-in-up">
                                        <div className="pt-3">
                                          {renderThinkingContent(thinking)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Answer Section */}
                                <div className="prose prose-slate prose-sm max-w-none">
                                  <p className="whitespace-pre-wrap leading-[1.7] text-slate-700 text-[15px]">
                                    {answer}
                                  </p>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Photos Section */}
                          {message.photos && message.photos.length > 0 && (
                            <div className="pt-4 border-t border-slate-100/80">
                              <div className="flex items-center gap-2 text-[13px] text-slate-500 mb-3">
                                <Image size={14} />
                                <span className="font-medium">
                                  {message.photos.length} photo{message.photos.length > 1 ? "s" : ""} found
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {message.photos.map((photo) => (
                                  <a
                                    key={photo.id}
                                    href={photosApi.getFileUrl(photo.storageKey)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200/60 hover:border-purple-300 transition-all duration-300 hover:shadow-[0_4px_12px_rgba(139,92,246,0.15)]"
                                  >
                                    <img
                                      src={photosApi.getFileUrl(photo.storageKey)}
                                      alt={photo.displayTitle}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                                        <p className="text-white text-xs font-medium truncate">
                                          {photo.displayTitle}
                                        </p>
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Sources Section */}
                          {message.sources && message.sources.length > 0 && (
                            <div className="pt-3 border-t border-slate-100">
                              <button
                                onClick={() => toggleSourceExpanded(message.id)}
                                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors w-full"
                              >
                                <FileText size={14} />
                                <span className="font-medium">
                                  {message.sources.length} source{message.sources.length > 1 ? "s" : ""} used
                                </span>
                                <ChevronDown
                                  size={14}
                                  className={`ml-auto transition-transform ${
                                    expandedSources.has(message.id) ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {expandedSources.has(message.id) && (
                                <div className="mt-3 space-y-2">
                                  {message.sources.map((source, idx) => {
                                    const sourceAdaptId = `source-${source.id}`
                                    const sourceAdaptState = getAdaptState(sourceAdaptId)
                                    return (
                                      <div
                                        key={source.id}
                                        className="p-3 bg-slate-50 rounded-xl border border-slate-100 group"
                                      >
                                        <div className="flex items-start gap-2">
                                          <Badge variant="outline" className="text-xs flex-shrink-0">
                                            {idx + 1}
                                          </Badge>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-slate-900">
                                              {source.question}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">
                                              {source.answer}
                                            </p>

                                            {/* Source Action Buttons */}
                                            <div className="flex items-center gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => handleCopy(source.answer, source.id)}
                                              >
                                                {copiedId === source.id ? (
                                                  <>
                                                    <Check size={12} className="mr-1 text-emerald-500" />
                                                    <span className="text-emerald-600">Copied</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Copy size={12} className="mr-1 text-slate-400" />
                                                    Copy
                                                  </>
                                                )}
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-7 px-2 text-xs ${sourceAdaptState.showPanel ? "bg-purple-100 text-purple-700" : ""}`}
                                                onClick={() => toggleAdaptPanel(sourceAdaptId)}
                                              >
                                                <Wand2 size={12} className="mr-1" />
                                                Refine
                                              </Button>
                                            </div>

                                            {/* Source Adapt Panel */}
                                            {sourceAdaptState.showPanel && (
                                              <div className="mt-3 p-3 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 space-y-2.5 animate-fade-in-up">
                                                <div className="flex flex-wrap gap-1.5">
                                                  {([
                                                    { type: "shorten", label: "Shorten" },
                                                    { type: "expand", label: "Expand" },
                                                    { type: "bullets", label: "Bullets" },
                                                    { type: "formal", label: "Formal" },
                                                    { type: "casual", label: "Casual" },
                                                    { type: "custom", label: "Custom" },
                                                  ] as const).map(({ type, label }) => (
                                                    <Button
                                                      key={type}
                                                      variant={sourceAdaptState.type === type ? "default" : "outline"}
                                                      size="sm"
                                                      onClick={() => updateAdaptState(sourceAdaptId, { type })}
                                                      className={`rounded-md h-6 text-xs px-2 ${sourceAdaptState.type === type ? "bg-purple-600 hover:bg-purple-700" : "bg-white"}`}
                                                    >
                                                      {label}
                                                    </Button>
                                                  ))}
                                                </div>

                                                {sourceAdaptState.type === "shorten" && (
                                                  <div className="flex items-center gap-2">
                                                    <Label htmlFor={`target-words-${sourceAdaptId}`} className="text-xs whitespace-nowrap">Target words:</Label>
                                                    <Input
                                                      id={`target-words-${sourceAdaptId}`}
                                                      type="number"
                                                      value={sourceAdaptState.targetWordCount}
                                                      onChange={(e) => updateAdaptState(sourceAdaptId, { targetWordCount: parseInt(e.target.value) || 100 })}
                                                      className="h-7 w-20 text-xs rounded-md bg-white"
                                                      min={25}
                                                      max={500}
                                                    />
                                                  </div>
                                                )}

                                                {sourceAdaptState.type === "custom" && (
                                                  <Textarea
                                                    value={sourceAdaptState.customInstruction}
                                                    onChange={(e) => updateAdaptState(sourceAdaptId, { customInstruction: e.target.value })}
                                                    placeholder="How should this be adapted?"
                                                    className="rounded-md min-h-[50px] text-xs bg-white"
                                                  />
                                                )}

                                                <Button
                                                  onClick={() => handleAdaptContent(sourceAdaptId, source.answer)}
                                                  disabled={sourceAdaptState.isLoading || (sourceAdaptState.type === "custom" && !sourceAdaptState.customInstruction.trim())}
                                                  size="sm"
                                                  className="w-full rounded-md h-7 text-xs bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                                >
                                                  {sourceAdaptState.isLoading ? (
                                                    <>
                                                      <Loader2 size={12} className="mr-1 animate-spin" />
                                                      Adapting...
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Sparkles size={12} className="mr-1" />
                                                      Apply
                                                    </>
                                                  )}
                                                </Button>

                                                {sourceAdaptState.error && (
                                                  <div className="p-1.5 bg-amber-50 border border-amber-200 rounded-md">
                                                    <p className="text-amber-800 text-xs">{sourceAdaptState.error}</p>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
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
                                  <Check size={12} className="mr-1.5 text-emerald-500" />
                                  <span className="text-emerald-600">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} className="mr-1.5" />
                                  Copy
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-8 rounded-lg text-xs ${getAdaptState(message.id).showPanel ? "bg-purple-100 border-purple-300 text-purple-700" : ""}`}
                              onClick={() => toggleAdaptPanel(message.id)}
                            >
                              <Wand2 size={12} className="mr-1.5" />
                              Refine
                            </Button>
                            {!message.refinementLabel && (
                              <Link to="/search" className="inline-flex">
                                <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs">
                                  <ExternalLink size={12} className="mr-1.5" />
                                  View in Library
                                </Button>
                              </Link>
                            )}
                          </div>

                          {/* Adapt Panel */}
                          {getAdaptState(message.id).showPanel && (
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 space-y-3 animate-fade-in-up">
                              <div className="flex flex-wrap gap-2">
                                {([
                                  { type: "shorten", label: "Shorten" },
                                  { type: "expand", label: "Expand" },
                                  { type: "bullets", label: "Bullets" },
                                  { type: "formal", label: "Formal" },
                                  { type: "casual", label: "Casual" },
                                  { type: "custom", label: "Custom" },
                                ] as const).map(({ type, label }) => (
                                  <Button
                                    key={type}
                                    variant={getAdaptState(message.id).type === type ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => updateAdaptState(message.id, { type })}
                                    className={`rounded-lg h-7 text-xs ${getAdaptState(message.id).type === type ? "bg-purple-600 hover:bg-purple-700" : "bg-white"}`}
                                  >
                                    {label}
                                  </Button>
                                ))}
                              </div>

                              {getAdaptState(message.id).type === "shorten" && (
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`target-words-${message.id}`} className="text-xs whitespace-nowrap">Target words:</Label>
                                  <Input
                                    id={`target-words-${message.id}`}
                                    type="number"
                                    value={getAdaptState(message.id).targetWordCount}
                                    onChange={(e) => updateAdaptState(message.id, { targetWordCount: parseInt(e.target.value) || 100 })}
                                    className="h-8 w-24 text-sm rounded-lg bg-white"
                                    min={25}
                                    max={500}
                                  />
                                </div>
                              )}

                              {getAdaptState(message.id).type === "custom" && (
                                <Textarea
                                  value={getAdaptState(message.id).customInstruction}
                                  onChange={(e) => updateAdaptState(message.id, { customInstruction: e.target.value })}
                                  placeholder="How should this be adapted?"
                                  className="rounded-lg min-h-[60px] text-sm bg-white"
                                />
                              )}

                              <Button
                                onClick={() => handleAdaptContent(message.id, message.content)}
                                disabled={getAdaptState(message.id).isLoading || (getAdaptState(message.id).type === "custom" && !getAdaptState(message.id).customInstruction.trim())}
                                size="sm"
                                className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                              >
                                {getAdaptState(message.id).isLoading ? (
                                  <>
                                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                                    Adapting...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={14} className="mr-1.5" />
                                    Apply
                                  </>
                                )}
                              </Button>

                              {getAdaptState(message.id).error && (
                                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <p className="text-amber-800 text-xs">{getAdaptState(message.id).error}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <p className="text-xs text-slate-400 mt-1.5 px-1">
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                      background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)',
                      boxShadow: '0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                  >
                    <Bot size={18} className="text-white" />
                  </div>
                  <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-purple-500" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 dark:text-slate-300 text-[14px] font-medium">Thinking</span>
                          <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-slate-400 mt-2">
                        Searching your approved library content...
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
      <footer
        className="sticky bottom-0 border-t border-slate-200/60 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl"
      >
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Mode Toggle */}
          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setRefineMode(false)}
              className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                !refineMode
                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shadow-[0_1px_3px_rgba(139,92,246,0.1)]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Sparkles size={14} className="inline mr-1.5" />
              Ask Library
            </button>
            <button
              onClick={() => setRefineMode(true)}
              className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                refineMode
                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shadow-[0_1px_3px_rgba(139,92,246,0.1)]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Wand2 size={14} className="inline mr-1.5" />
              Refine Content
            </button>
          </div>

          {refineMode ? (
            /* Refine Mode Input */
            <div className="space-y-3">
              <Textarea
                value={refineContent}
                onChange={(e) => setRefineContent(e.target.value)}
                placeholder="Paste content to refine here..."
                className="min-h-[100px] text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl resize-none"
                disabled={isRefining}
              />
              <div className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <Input
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="How should this be refined? (e.g., 'make it shorter', 'add bullet points', 'more formal tone')"
                    className="h-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleDirectRefine()}
                    disabled={isRefining}
                  />
                </div>
                <Button
                  onClick={handleDirectRefine}
                  disabled={!refineContent.trim() || !refineInstruction.trim() || isRefining}
                  size="lg"
                  variant="purple"
                  className="h-12 px-6 rounded-xl shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                >
                  {isRefining ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Wand2 size={20} />
                  )}
                </Button>
                <ContextualHelp {...askAIPageHelp} />
              </div>
              <p className="text-[12px] text-slate-400 dark:text-slate-500 text-center">
                Paste any content above, then describe how you want it refined
              </p>
            </div>
          ) : (
            /* Normal Ask Mode Input */
            <>
              <div className="flex gap-3 items-end">
                {/* Topic Filter */}
                <Select value={topicFilter} onValueChange={setTopicFilter}>
                  <SelectTrigger className="w-40 h-12 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <SelectValue placeholder="All Topics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Topics</SelectItem>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Input */}
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask a question about your library..."
                    className="h-12 pr-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                    disabled={isLoading}
                  />
                </div>

                {/* Send Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isLoading}
                  size="lg"
                  variant="purple"
                  className="h-12 px-6 rounded-xl shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Send size={20} />
                  )}
                </Button>

                {/* Help */}
                <ContextualHelp {...askAIPageHelp} />
              </div>

              {topicFilter !== "all" && (
                <p className="text-[12px] text-slate-400 mt-2 text-center">
                  Filtering by topic: <span className="font-medium text-slate-600">{topics.find(t => t.id === topicFilter)?.displayName}</span>
                </p>
              )}
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
