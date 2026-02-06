import { useState, useEffect, useRef, useCallback } from "react"
import { fetchSSE } from "@/lib/api"
import type { ChatMessage } from "@/types/chat"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

interface UseChatOptions {
  /** Non-streaming endpoint (fallback) */
  endpoint: string
  /** Streaming endpoint — if provided, streaming is used */
  streamEndpoint?: string
  parseResult: (data: Record<string, unknown>) => {
    content: string
    followUpPrompts?: string[]
    refused?: boolean
    refusalReason?: string
    metadata?: Record<string, unknown>
  }
  buildBody?: (query: string) => Record<string, unknown>
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
}

export function useChat({ endpoint, streamEndpoint, parseResult, buildBody, errorMessage }: UseChatOptions): UseChatReturn {
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
            // Store metadata on the assistant message
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, metadata: data } : m
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

            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content: data.cleanResponse || (m.content + remainingTokens),
                    followUpPrompts: data.followUpPrompts,
                  }
                : m
            ))
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
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
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
  }, [inputValue, isLoading, endpoint, streamEndpoint, parseResult, buildBody, buildConversationHistory, errorMessage])

  const handleCopy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleFeedback = useCallback((messageId: string, score: "up" | "down") => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      return { ...m, feedback: m.feedback === score ? null : score }
    }))
  }, [])

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
  }, [abortStream])

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
  }
}
