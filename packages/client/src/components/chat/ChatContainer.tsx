import { useRef, type ReactNode } from "react"
import { AppHeader } from "@/components/AppHeader"
import { ChatMessageItem } from "./ChatMessage"
import { LoadingIndicator } from "./LoadingIndicator"
import { ScrollToBottom } from "./ScrollToBottom"
import { ChatInput } from "./ChatInput"
import type { ChatMessage, ChatTheme, QuickAction } from "@/types/chat"

interface ChatContainerProps {
  messages: ChatMessage[]
  isLoading: boolean
  isStreaming?: boolean
  inputValue: string
  setInputValue: (v: string) => void
  onSubmit: (query?: string) => void
  theme: ChatTheme
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  onFeedback: (id: string, score: "up" | "down") => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  placeholder?: string
  quickActions?: QuickAction[]
  emptyState: ReactNode
  statusBar?: ReactNode
  renderDataContext?: (message: ChatMessage) => ReactNode
  renderExtraContent?: (message: ChatMessage) => ReactNode
  renderContent?: (message: ChatMessage) => ReactNode
  renderActions?: (message: ChatMessage) => ReactNode
  footerExtra?: ReactNode
}

export function ChatContainer({
  messages,
  isLoading,
  isStreaming,
  inputValue,
  setInputValue,
  onSubmit,
  theme,
  copiedId,
  onCopy,
  onFeedback,
  messagesEndRef,
  inputRef,
  placeholder,
  quickActions,
  emptyState,
  statusBar,
  renderDataContext,
  renderExtraContent,
  renderContent,
  renderActions,
  footerExtra,
}: ChatContainerProps) {
  const mainRef = useRef<HTMLElement>(null)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {statusBar}

      <main ref={mainRef} className="flex-1 overflow-y-auto relative">
        <ScrollToBottom containerRef={mainRef} messagesEndRef={messagesEndRef} />
        <div className="max-w-4xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            emptyState
          ) : (
            <div className="space-y-6">
              {messages.map(message => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  theme={theme}
                  copiedId={copiedId}
                  onCopy={onCopy}
                  onFeedback={onFeedback}
                  onFollowUp={onSubmit}
                  dataContextPanel={renderDataContext?.(message)}
                  extraContent={renderExtraContent?.(message)}
                  renderContent={renderContent}
                  renderActions={renderActions}
                />
              ))}

              {isLoading && !isStreaming && <LoadingIndicator theme={theme} />}

              <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
            </div>
          )}
        </div>
      </main>

      {footerExtra || (
        <ChatInput
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSubmit={onSubmit}
          isLoading={isLoading}
          theme={theme}
          placeholder={placeholder}
          quickActions={quickActions}
          showQuickActions={messages.length > 0}
          inputRef={inputRef}
        />
      )}
    </div>
  )
}
