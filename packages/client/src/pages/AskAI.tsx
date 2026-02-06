/**
 * Ask AI — Q&A Library AI assistant.
 *
 * Uses shared chat infrastructure with purple theme.
 * Unique features: sources, photos, refine/adapt panels, topic filter.
 */

import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import {
  Sparkles,
  FileText,
  ChevronDown,
  ExternalLink,
  Image,
  Wand2,
  Loader2,
  Send,
  Copy,
  Check,
} from "lucide-react"
import { MarkdownRenderer } from "@/components/chat"
import { ContextualHelp, askAIPageHelp } from "@/components/ContextualHelp"
import {
  Button,
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
import { ChatContainer } from "@/components/chat"
import { useChat } from "@/hooks/useChat"
import { topicsApi, aiApi, photosApi, type AIQueryResponse, type AdaptationType } from "@/lib/api"
import { CHAT_THEMES, type ChatMessage } from "@/types/chat"
import type { Topic } from "@/types"

const theme = CHAT_THEMES.purple

interface AdaptState {
  messageId: string
  showPanel: boolean
  type: AdaptationType
  customInstruction: string
  targetWordCount: number
  isLoading: boolean
  error?: string
}


const parseResult = (data: Record<string, unknown>) => ({
  content: data.response as string,
  followUpPrompts: data.followUpPrompts as string[] | undefined,
  refused: data.refused as boolean | undefined,
  refusalReason: data.refusalReason as string | undefined,
  metadata: {
    sources: (data as unknown as AIQueryResponse).sources,
    photos: (data as unknown as AIQueryResponse).photos,
  } as unknown as Record<string, unknown>,
})

export function AskAI() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [adaptStates, setAdaptStates] = useState<Map<string, AdaptState>>(new Map())
  const [refineMode, setRefineMode] = useState(false)
  const [refineContent, setRefineContent] = useState("")
  const [refineInstruction, setRefineInstruction] = useState("")

  const chat = useChat({
    endpoint: "/ai/query",
    streamEndpoint: "/ai/stream",
    parseResult,
    buildBody: useCallback((query: string) => ({
      query,
      topicId: topicFilter !== "all" ? topicFilter : undefined,
      maxSources: 5,
    }), [topicFilter]),
    errorMessage: "Failed to connect to AI service. Please try again.",
  })

  useEffect(() => {
    async function loadTopics() {
      try {
        const topicsData = await topicsApi.getAll()
        setTopics(
          topicsData.map(t => ({
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

  const toggleSourceExpanded = (messageId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
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
    setAdaptStates(prev => {
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

  const handleDirectRefine = () => {
    if (!refineContent.trim() || !refineInstruction.trim() || chat.isLoading) return
    chat.handleSubmit(`Refine this content: "${refineInstruction}"\n\n---\n${refineContent}`)
    setRefineContent("")
    setRefineInstruction("")
    setRefineMode(false)
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
        // Submit the adapted content as a follow-up showing what was refined
        chat.handleSubmit(`Refined (${getAdaptationLabel(state.type)}): ${result.adaptedContent?.slice(0, 50)}...`)
        updateAdaptState(messageId, { isLoading: false, showPanel: false })
      }
    } catch {
      updateAdaptState(messageId, {
        isLoading: false,
        error: "Failed to adapt content. Please try again.",
      })
    }
  }

  // Custom content renderer with refinement badge
  const renderContent = useCallback((message: ChatMessage) => {
    const refinementLabel = message.metadata?.refinementLabel as string | undefined

    return (
      <div className="space-y-3">
        {refinementLabel && (
          <div className="flex items-center gap-2">
            <Badge variant="purple" className="text-xs">
              <Wand2 size={10} className="mr-1" />
              {refinementLabel}
            </Badge>
          </div>
        )}

        <MarkdownRenderer content={message.content} />
      </div>
    )
  }, [])

  // Photos + Sources as extra content
  const renderExtraContent = useCallback((message: ChatMessage) => {
    const sources = message.metadata?.sources as AIQueryResponse["sources"] | undefined
    const photos = message.metadata?.photos as AIQueryResponse["photos"] | undefined

    return (
      <>
        {/* Photos */}
        {photos && photos.length > 0 && (
          <div className="pt-4 border-t border-slate-100/80 dark:border-slate-700">
            <div className="flex items-center gap-2 text-[13px] text-slate-500 mb-3">
              <Image size={14} />
              <span className="font-medium">
                {photos.length} photo{photos.length > 1 ? "s" : ""} found
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {photos.map(photo => {
                const imgUrl = (photo as any).fileUrl || photosApi.getFileUrl(photo.storageKey)
                return (
                <a
                  key={photo.id}
                  href={imgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200/60 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-300 hover:shadow-[0_4px_12px_rgba(139,92,246,0.15)]"
                >
                  <img
                    src={imgUrl}
                    alt={photo.displayTitle}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      <p className="text-white text-xs font-medium truncate">{photo.displayTitle}</p>
                    </div>
                  </div>
                </a>
              )})}
            </div>
          </div>
        )}

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={() => toggleSourceExpanded(message.id)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors w-full"
            >
              <FileText size={14} />
              <span className="font-medium">
                {sources.length} source{sources.length > 1 ? "s" : ""} used
              </span>
              <ChevronDown
                size={14}
                className={`ml-auto transition-transform ${expandedSources.has(message.id) ? "rotate-180" : ""}`}
              />
            </button>

            {expandedSources.has(message.id) && (
              <div className="mt-3 space-y-2">
                {sources.map((source, idx) => {
                  const sourceAdaptId = `source-${source.id}`
                  const sourceAdaptState = getAdaptState(sourceAdaptId)
                  return (
                    <div key={source.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700 group">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="text-xs flex-shrink-0">{idx + 1}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{source.question}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 whitespace-pre-wrap">{source.answer}</p>

                          <div className="flex items-center gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => chat.handleCopy(source.answer, source.id)}>
                              {chat.copiedId === source.id ? (
                                <><Check size={12} className="mr-1 text-emerald-500" /><span className="text-emerald-600">Copied</span></>
                              ) : (
                                <><Copy size={12} className="mr-1 text-slate-400" />Copy</>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 text-xs ${sourceAdaptState.showPanel ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : ""}`}
                              onClick={() => toggleAdaptPanel(sourceAdaptId)}
                            >
                              <Wand2 size={12} className="mr-1" />
                              Refine
                            </Button>
                          </div>

                          {sourceAdaptState.showPanel && renderAdaptPanel(sourceAdaptId, source.answer, true)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Message-level Adapt Panel */}
        {getAdaptState(message.id).showPanel && renderAdaptPanel(message.id, message.content, false)}
      </>
    )
  }, [expandedSources, adaptStates, chat.copiedId])

  // Shared adapt panel renderer
  const renderAdaptPanel = (adaptId: string, content: string, isSource: boolean) => {
    const state = getAdaptState(adaptId)
    const sizes = isSource
      ? { container: "mt-3 p-3", buttons: "h-6 text-xs px-2", input: "h-7 w-20 text-xs", textarea: "min-h-[50px] text-xs", apply: "h-7 text-xs" }
      : { container: "p-4", buttons: "h-7 text-xs", input: "h-8 w-24 text-sm", textarea: "min-h-[60px] text-sm", apply: "" }
    const rounding = isSource ? "rounded-lg" : "rounded-xl"

    return (
      <div className={`${sizes.container} bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/20 ${rounding} border border-purple-200 dark:border-purple-800/50 space-y-${isSource ? "2.5" : "3"} animate-fade-in-up`}>
        <div className={`flex flex-wrap gap-${isSource ? "1.5" : "2"}`}>
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
              variant={state.type === type ? "default" : "outline"}
              size="sm"
              onClick={() => updateAdaptState(adaptId, { type })}
              className={`${rounding === "rounded-lg" ? "rounded-md" : "rounded-lg"} ${sizes.buttons} ${state.type === type ? "bg-purple-600 hover:bg-purple-700" : "bg-white dark:bg-slate-800"}`}
            >
              {label}
            </Button>
          ))}
        </div>

        {state.type === "shorten" && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`target-words-${adaptId}`} className="text-xs whitespace-nowrap">Target words:</Label>
            <Input
              id={`target-words-${adaptId}`}
              type="number"
              value={state.targetWordCount}
              onChange={e => updateAdaptState(adaptId, { targetWordCount: parseInt(e.target.value) || 100 })}
              className={`${sizes.input} rounded-md bg-white dark:bg-slate-800 dark:border-slate-700`}
              min={25}
              max={500}
            />
          </div>
        )}

        {state.type === "custom" && (
          <Textarea
            value={state.customInstruction}
            onChange={e => updateAdaptState(adaptId, { customInstruction: e.target.value })}
            placeholder="How should this be adapted?"
            className={`${sizes.textarea} rounded-${isSource ? "md" : "lg"} bg-white dark:bg-slate-800 dark:border-slate-700`}
          />
        )}

        <Button
          onClick={() => handleAdaptContent(adaptId, content)}
          disabled={state.isLoading || (state.type === "custom" && !state.customInstruction.trim())}
          size="sm"
          className={`w-full rounded-${isSource ? "md" : "lg"} ${sizes.apply} bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600`}
        >
          {state.isLoading ? (
            <><Loader2 size={isSource ? 12 : 14} className="mr-1.5 animate-spin" />Adapting...</>
          ) : (
            <><Sparkles size={isSource ? 12 : 14} className="mr-1.5" />Apply</>
          )}
        </Button>

        {state.error && (
          <div className={`p-${isSource ? "1.5" : "2"} bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-${isSource ? "md" : "lg"}`}>
            <p className="text-amber-800 dark:text-amber-300 text-xs">{state.error}</p>
          </div>
        )}
      </div>
    )
  }

  // Custom action buttons (Refine + View in Library)
  const renderActions = useCallback((message: ChatMessage) => {
    const refinementLabel = message.metadata?.refinementLabel as string | undefined
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 rounded-lg text-xs ${getAdaptState(message.id).showPanel ? "bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300" : ""}`}
          onClick={() => toggleAdaptPanel(message.id)}
        >
          <Wand2 size={12} className="mr-1.5" />
          Refine
        </Button>
        {!refinementLabel && (
          <Link to="/search" className="inline-flex">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs">
              <ExternalLink size={12} className="mr-1.5" />
              View in Library
            </Button>
          </Link>
        )}
      </>
    )
  }, [adaptStates])

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
      placeholder="Ask a question about your library..."
      renderContent={renderContent}
      renderExtraContent={renderExtraContent}
      renderActions={renderActions}
      emptyState={
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(124,58,237,0.1) 100%)",
              boxShadow: "0 4px 20px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
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
            ].map(suggestion => (
              <button
                key={suggestion}
                onClick={() => chat.setInputValue(suggestion)}
                className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-[13px] text-slate-600 dark:text-slate-300
                           shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-purple-300 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400
                           hover:shadow-[0_2px_8px_rgba(139,92,246,0.12)] transition-all duration-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      }
      footerExtra={
        <footer className="sticky bottom-0 border-t border-slate-200/60 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
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
              <div className="space-y-3">
                <Textarea
                  value={refineContent}
                  onChange={e => setRefineContent(e.target.value)}
                  placeholder="Paste content to refine here..."
                  className="min-h-[100px] text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl resize-none"
                  disabled={chat.isLoading}
                />
                <div className="flex gap-3 items-end">
                  <div className="flex-1 relative">
                    <Input
                      value={refineInstruction}
                      onChange={e => setRefineInstruction(e.target.value)}
                      placeholder="How should this be refined? (e.g., 'make it shorter', 'add bullet points', 'more formal tone')"
                      className="h-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleDirectRefine()}
                      disabled={chat.isLoading}
                    />
                  </div>
                  <Button
                    onClick={handleDirectRefine}
                    disabled={!refineContent.trim() || !refineInstruction.trim() || chat.isLoading}
                    size="lg"
                    variant="purple"
                    className="h-12 px-6 rounded-xl shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                  >
                    {chat.isLoading ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />}
                  </Button>
                  <ContextualHelp {...askAIPageHelp} />
                </div>
                <p className="text-[12px] text-slate-400 dark:text-slate-500 text-center">
                  Paste any content above, then describe how you want it refined
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-3 items-end">
                  <Select value={topicFilter} onValueChange={setTopicFilter}>
                    <SelectTrigger className="w-40 h-12 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <SelectValue placeholder="All Topics" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Topics</SelectItem>
                      {topics.map(topic => (
                        <SelectItem key={topic.id} value={topic.id}>{topic.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 relative">
                    <Input
                      ref={chat.inputRef as unknown as React.RefObject<HTMLInputElement>}
                      value={chat.inputValue}
                      onChange={e => chat.setInputValue(e.target.value)}
                      placeholder="Ask a question about your library..."
                      className="h-12 pr-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl"
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && chat.handleSubmit()}
                      disabled={chat.isLoading}
                    />
                  </div>

                  <Button
                    onClick={() => chat.handleSubmit()}
                    disabled={!chat.inputValue.trim() || chat.isLoading}
                    size="lg"
                    variant="purple"
                    className="h-12 px-6 rounded-xl shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                  >
                    {chat.isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </Button>

                  <ContextualHelp {...askAIPageHelp} />
                </div>

                {topicFilter !== "all" && (
                  <p className="text-[12px] text-slate-400 mt-2 text-center">
                    Filtering by topic: <span className="font-medium text-slate-600 dark:text-slate-300">{topics.find(t => t.id === topicFilter)?.displayName}</span>
                  </p>
                )}
              </>
            )}
          </div>
        </footer>
      }
    />
  )
}
