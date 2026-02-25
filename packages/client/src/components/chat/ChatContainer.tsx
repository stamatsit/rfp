import { useState, useRef, type ReactNode } from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
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
  sidebar?: ReactNode
  onFileSelect?: (file: File) => void
  attachedFile?: { name: string; isExtracting?: boolean; isRFP?: boolean } | null
  onFileRemove?: () => void
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
  sidebar,
  onFileSelect,
  attachedFile,
  onFileRemove,
}: ChatContainerProps) {
  const mainRef = useRef<HTMLElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!!sidebar)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {statusBar}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        {sidebar && (
          <>
            <aside
              className={`flex-shrink-0 border-r border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm
                         transition-all duration-300 ease-out overflow-hidden
                         ${sidebarOpen ? "w-64" : "w-0"}`}
            >
              <div className="w-64 h-full">
                {sidebar}
              </div>
            </aside>

            {/* Toggle button */}
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className={`absolute top-3 z-10 p-1.5 rounded-lg transition-all duration-300 ease-out
                         text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300
                         bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm
                         border border-slate-200/60 dark:border-slate-700/60
                         hover:bg-slate-50 dark:hover:bg-slate-800
                         shadow-sm hover:shadow
                         ${sidebarOpen ? "left-[252px]" : "left-3"}`}
              title={sidebarOpen ? "Hide chat history" : "Show chat history"}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          </>
        )}

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
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
              onFileSelect={onFileSelect}
              attachedFile={attachedFile}
              onFileRemove={onFileRemove}
            />
          )}
        </div>
      </div>
    </div>
  )
}
