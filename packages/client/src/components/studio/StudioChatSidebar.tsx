import { useState, useCallback, useRef } from "react"
import { ArrowRight, Sparkles, FileSearch } from "lucide-react"
import { useChat } from "@/hooks/useChat"
import { ChatInput } from "@/components/chat/ChatInput"
import { ChatMessageItem } from "@/components/chat/ChatMessage"
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar"
import { LoadingIndicator } from "@/components/chat/LoadingIndicator"
import { CHAT_THEMES, type ChatTheme, type ChartConfig } from "@/types/chat"
import type { UseDocumentStoreReturn } from "@/hooks/useDocumentStore"
import { markdownToHtml } from "@/lib/markdownToHtml"
import { studioApi } from "@/lib/api"

interface StudioChatSidebarProps {
  documentStore: UseDocumentStoreReturn
  onRFPDetected?: (rfpText: string) => void
}

const theme: ChatTheme = CHAT_THEMES.emerald

export function StudioChatSidebar({ documentStore, onRFPDetected }: StudioChatSidebarProps) {
  // File attachment state
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; isExtracting?: boolean; isRFP?: boolean } | null>(null)
  const attachedFileRef = useRef<{ name: string; text: string } | null>(null)

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
    }),
    errorMessage: "Failed to get response from Studio AI",
  })

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
    // Clear file after submission
    setAttachedFile(null)
    attachedFileRef.current = null
  }, [chat])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: theme.botGradient }}>
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {documentStore.mode === "review" ? "AI Review" : "AI Assistant"}
          </span>
        </div>
        <ChatHistorySidebar
          conversations={chat.conversationList}
          onSelect={chat.loadConversation}
          onDelete={chat.deleteConversation}
          onRename={chat.renameConversation}
          onNew={chat.startNewConversation}
          activeId={chat.conversationId}
          theme={theme}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {chat.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ background: theme.botGradient, boxShadow: theme.botShadow }}>
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {documentStore.mode === "review"
                ? "Paste content in the editor, then ask for a review."
                : "Ask me to write content, create diagrams, or help with your document."}
            </p>
            {documentStore.mode === "editor" && (
              <div className="space-y-2 w-full max-w-xs">
                {[
                  "Write an executive summary for a proposal",
                  "Create a timeline diagram",
                  "Draft a case study overview",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSubmit(prompt)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-700 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chat.messages.map((message) => (
          <div key={message.id}>
            <ChatMessageItem
              message={message}
              theme={theme}
              onCopy={chat.handleCopy}
              copiedId={chat.copiedId}
              onFeedback={chat.handleFeedback}
              onFollowUp={(prompt) => handleSubmit(prompt)}
            />
            {/* Deploy button for assistant messages */}
            {message.role === "assistant" && (message.content || message.svgData || message.reviewAnnotations?.length) && (
              <div className="mt-1.5 ml-10 flex gap-2">
                {message.content && (
                  <button
                    onClick={() => documentStore.insertContent(markdownToHtml(message.content))}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md border border-emerald-200 dark:border-emerald-700 transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Deploy Text
                  </button>
                )}
                {message.svgData && (
                  <button
                    onClick={() => documentStore.insertContent(message.svgData!.svg)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md border border-emerald-200 dark:border-emerald-700 transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Deploy Diagram
                  </button>
                )}
                {message.reviewAnnotations && message.reviewAnnotations.length > 0 && (
                  <button
                    onClick={() => documentStore.setAnnotations(message.reviewAnnotations!)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-md border border-amber-200 dark:border-amber-700 transition-colors"
                  >
                    <FileSearch className="w-3 h-3" />
                    Deploy Comments ({message.reviewAnnotations.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {chat.isStreaming && <LoadingIndicator theme={theme} />}
        <div ref={chat.messagesEndRef as React.RefObject<HTMLDivElement>} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-3">
        <ChatInput
          inputValue={chat.inputValue}
          setInputValue={chat.setInputValue}
          onSubmit={() => handleSubmit()}
          isLoading={chat.isLoading}
          theme={theme}
          inputRef={chat.inputRef}
          placeholder={
            documentStore.mode === "review"
              ? "Ask for a review of the document..."
              : "Write content, create diagrams..."
          }
          onFileSelect={handleFileSelect}
          attachedFile={attachedFile}
          onFileRemove={handleFileRemove}
        />
      </div>
    </div>
  )
}
