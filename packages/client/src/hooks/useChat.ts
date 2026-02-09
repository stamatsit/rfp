import { useState, useEffect, useRef, useCallback } from "react"
import { fetchSSE, conversationsApi, type ConversationPage, type ConversationSummary } from "@/lib/api"
import type { ChatMessage } from "@/types/chat"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

interface UseChatOptions {
  /** Non-streaming endpoint (fallback) */
  endpoint: string
  /** Streaming endpoint — if provided, streaming is used */
  streamEndpoint?: string
  /** Page identifier for conversation persistence */
  page?: ConversationPage
  parseResult: (data: Record<string, unknown>) => {
    content: string
    followUpPrompts?: string[]
    refused?: boolean
    refusalReason?: string
    metadata?: Record<string, unknown>
    chartData?: import("@/types/chat").ChartConfig
  }
  buildBody?: (query: string) => Record<string, unknown>
  /** Transform raw SSE metadata before storing on message */
  parseMetadata?: (data: Record<string, unknown>) => Record<string, unknown>
  errorMessage?: string
}

interface UseChatReturn {
  messages: ChatMessage[]
  inputValue: string
  setInputValue: (v: string) => void
  isLoading: boolean
  isStreaming: boolean
  handleSubmit: (query?: string) => void
  handleCopy: (text: string, id: string) => void
  copiedId: string | null
  handleFeedback: (messageId: string, score: "up" | "down") => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  showDataContext: Set<string>
  toggleDataContext: (messageId: string) => void
  abortStream: () => void
  clearMessages: () => void
  // Conversation history
  conversationId: string | null
  conversationList: ConversationSummary[]
  loadConversation: (id: string) => Promise<void>
  startNewConversation: () => void
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  refreshConversationList: () => Promise<void>
}

export function useChat({ endpoint, streamEndpoint, page, parseResult, buildBody, parseMetadata, errorMessage }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showDataContext, setShowDataContext] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // RAF batching ref for streaming token updates
  const pendingTokensRef = useRef("")
  const rafRef = useRef<number | null>(null)

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
  const conversationIdRef = useRef<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync
  useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])

  // Load conversation list on mount
  useEffect(() => {
    if (page) {
      refreshConversationList()
    }
  }, [page])

  const refreshConversationList = useCallback(async () => {
    if (!page) return
    try {
      const list = await conversationsApi.list(page)
      setConversationList(list)
    } catch (err) {
      console.error("Failed to load conversation list:", err)
    }
  }, [page])

  // Auto-save conversation after messages change (debounced)
  const saveConversation = useCallback(async (msgs: ChatMessage[]) => {
    if (!page || msgs.length === 0) return
    // Only save messages with content
    const saveable = msgs
      .filter(m => m.content && !m.refused)
      .map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp.toISOString() }))
    if (saveable.length === 0) return

    const title = saveable.find(m => m.role === "user")?.content.slice(0, 80) || "New conversation"

    try {
      if (conversationIdRef.current) {
        await conversationsApi.update(conversationIdRef.current, { messages: saveable })
      } else {
        const created = await conversationsApi.create({ page, title, messages: saveable })
        setConversationId(created.id)
        conversationIdRef.current = created.id
      }
      refreshConversationList()
    } catch (err) {
      console.error("Failed to save conversation:", err)
    }
  }, [page, refreshConversationList])

  // Schedule save after messages change (debounced to avoid saving mid-stream)
  const scheduleSave = useCallback((msgs: ChatMessage[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveConversation(msgs), 500)
  }, [saveConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /**
   * Build conversation history from messages for the API.
   * Only includes user + assistant messages with actual content.
   */
  const buildConversationHistory = useCallback(() => {
    return messages
      .filter(m => m.content && !m.refused)
      .map(m => ({ role: m.role, content: m.content }))
  }, [messages])

  const abortStream = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setIsLoading(false)
  }, [])

  const handleSubmit = useCallback(async (query?: string) => {
    const queryText = query || inputValue.trim()
    if (!queryText || isLoading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: queryText,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    // Build the request body
    const conversationHistory = buildConversationHistory()
    const baseBody = buildBody ? buildBody(queryText) : { query: queryText }
    const bodyWithHistory = {
      ...baseBody,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
    }

    // Use streaming if streamEndpoint is configured
    if (streamEndpoint) {
      const assistantId = `assistant-${Date.now()}`

      // Add empty assistant message to fill in via streaming
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }])

      setIsStreaming(true)
      const controller = new AbortController()
      abortControllerRef.current = controller
      pendingTokensRef.current = ""

      try {
        await fetchSSE(streamEndpoint, bodyWithHistory, {
          onMetadata: (data) => {
            // Use parseMetadata if provided, otherwise store raw
            const metadata = parseMetadata ? parseMetadata(data) : data
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, metadata } : m
            ))
          },
          onToken: (token) => {
            // Batch token updates with requestAnimationFrame
            pendingTokensRef.current += token
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                const batch = pendingTokensRef.current
                pendingTokensRef.current = ""
                rafRef.current = null
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + batch }
                    : m
                ))
              })
            }
          },
          onDone: (data) => {
            // Flush any remaining buffered tokens
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current)
              rafRef.current = null
            }
            const remainingTokens = pendingTokensRef.current
            pendingTokensRef.current = ""

            setMessages(prev => {
              const updated = prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: data.cleanResponse || (m.content + remainingTokens),
                      followUpPrompts: data.followUpPrompts,
                      chartData: data.chartData as import("@/types/chat").ChartConfig | undefined,
                      svgData: data.svgData ?? undefined,
                      reviewAnnotations: data.reviewAnnotations as import("@/types/chat").ReviewAnnotation[] | undefined,
                    }
                  : m
              )
              // Save after streaming completes
              scheduleSave(updated)
              return updated
            })
            setIsStreaming(false)
            setIsLoading(false)
            inputRef.current?.focus()
          },
          onError: (error) => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "",
                    refused: true,
                    refusalReason: error || errorMessage || "Streaming failed. Please try again.",
                  }
                : m
            ))
            setIsStreaming(false)
            setIsLoading(false)
            inputRef.current?.focus()
          },
        }, controller.signal)
      } catch (err) {
        // Abort errors are expected when user cancels
        if (err instanceof Error && err.name === "AbortError") {
          setIsStreaming(false)
          setIsLoading(false)
          return
        }
        console.error("Stream failed:", err)
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content || "",
                refused: !m.content,
                refusalReason: !m.content ? (errorMessage || "Failed to connect. Please try again.") : undefined,
              }
            : m
        ))
        setIsStreaming(false)
        setIsLoading(false)
        inputRef.current?.focus()
      }
      return
    }

    // Non-streaming fallback
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyWithHistory),
      })

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const data = await response.json()
      const parsed = parseResult(data)

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: parsed.content,
        followUpPrompts: parsed.followUpPrompts,
        refused: parsed.refused,
        refusalReason: parsed.refusalReason,
        metadata: parsed.metadata,
        chartData: parsed.chartData,
        timestamp: new Date(),
      }

      setMessages(prev => {
        const updated = [...prev, assistantMessage]
        scheduleSave(updated)
        return updated
      })
    } catch (err) {
      console.error("Query failed:", err)
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        refused: true,
        refusalReason: errorMessage || "Failed to connect. Please try again.",
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [inputValue, isLoading, endpoint, streamEndpoint, parseResult, buildBody, parseMetadata, buildConversationHistory, errorMessage, scheduleSave])

  const handleCopy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleFeedback = useCallback((messageId: string, score: "up" | "down") => {
    setMessages(prev => {
      const message = prev.find(m => m.id === messageId)
      const newScore = message?.feedback === score ? null : score

      // Fire-and-forget POST to server
      if (newScore) {
        const userMsg = prev.slice(0, prev.indexOf(message!)).reverse().find(m => m.role === "user")
        fetch(`${API_BASE}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messageId,
            score: newScore,
            page: endpoint,
            query: userMsg?.content?.slice(0, 200),
          }),
        }).catch(() => { /* silent */ })
      }

      return prev.map(m => m.id !== messageId ? m : { ...m, feedback: newScore })
    })
  }, [endpoint])

  const toggleDataContext = useCallback((messageId: string) => {
    setShowDataContext(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }, [])

  const clearMessages = useCallback(() => {
    abortStream()
    setMessages([])
    setConversationId(null)
    conversationIdRef.current = null
  }, [abortStream])

  const loadConversation = useCallback(async (id: string) => {
    try {
      const conv = await conversationsApi.get(id)
      const restored: ChatMessage[] = conv.messages.map((m, i) => ({
        id: `${m.role}-restored-${i}-${Date.now()}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      }))
      setMessages(restored)
      setConversationId(id)
      conversationIdRef.current = id
      inputRef.current?.focus()
    } catch (err) {
      console.error("Failed to load conversation:", err)
    }
  }, [])

  const startNewConversation = useCallback(() => {
    abortStream()
    setMessages([])
    setConversationId(null)
    conversationIdRef.current = null
    inputRef.current?.focus()
  }, [abortStream])

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await conversationsApi.delete(id)
      if (conversationIdRef.current === id) {
        setMessages([])
        setConversationId(null)
        conversationIdRef.current = null
      }
      refreshConversationList()
    } catch (err) {
      console.error("Failed to delete conversation:", err)
    }
  }, [refreshConversationList])

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await conversationsApi.update(id, { title })
      refreshConversationList()
    } catch (err) {
      console.error("Failed to rename conversation:", err)
    }
  }, [refreshConversationList])

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    isStreaming,
    handleSubmit,
    handleCopy,
    copiedId,
    handleFeedback,
    messagesEndRef,
    inputRef,
    showDataContext,
    toggleDataContext,
    abortStream,
    clearMessages,
    conversationId,
    conversationList,
    loadConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
    refreshConversationList,
  }
}
