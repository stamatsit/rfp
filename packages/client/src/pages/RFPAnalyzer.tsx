import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  FileSearch,
  Upload,
  FileText,
  Loader2,
  Search,
  Sparkles,
  Plus,
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  File,
  Send,
  Save,
  FolderOpen,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button, Card, CardContent, Badge, Textarea } from "@/components/ui"
import { rfpApi, searchApi, aiApi, type AnswerResponse, type AIQueryResponse } from "@/lib/api"

type SidePanelMode = "matches" | "ai" | null

const AI_PROMPT_SUGGESTIONS = [
  "Draft a response to this requirement",
  "Find relevant content from our library",
  "Summarize key points",
  "What questions should we clarify?",
]

interface DocumentState {
  text: string
  filename: string
  pageCount?: number
  mimeType?: string
  fileSize?: number
  savedId?: string // If loaded from saved documents
}

export function RFPAnalyzer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentState | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null)
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<AnswerResponse[]>([])
  const [aiResponse, setAiResponse] = useState<AIQueryResponse | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [showAiInput, setShowAiInput] = useState(false)
  const [docSearchQuery, setDocSearchQuery] = useState("")
  const [docSearchMatches, setDocSearchMatches] = useState<number[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const documentViewerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load saved document from URL parameter
  useEffect(() => {
    const docId = searchParams.get("docId")
    if (docId && !document) {
      setIsUploading(true)
      rfpApi
        .getDocument(docId)
        .then((savedDoc) => {
          setDocument({
            text: savedDoc.extractedText,
            filename: savedDoc.originalFilename,
            pageCount: savedDoc.pageCount,
            mimeType: savedDoc.mimeType,
            fileSize: savedDoc.fileSize,
            savedId: savedDoc.id,
          })
        })
        .catch((err) => {
          console.error("Failed to load document:", err)
          setUploadError(err instanceof Error ? err.message : "Failed to load document")
        })
        .finally(() => {
          setIsUploading(false)
        })
    }
  }, [searchParams, document])

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    setUploadError(null)

    try {
      const result = await rfpApi.extract(file)
      setDocument({
        text: result.text,
        filename: result.filename,
        pageCount: result.pageCount,
        mimeType: file.type,
        fileSize: file.size,
      })
      // Clear any previous state
      setSelectedText("")
      setToolbarPosition(null)
      setSidePanelMode(null)
      setSearchResults([])
      setAiResponse(null)
      setSaveSuccess(false)
    } catch (err) {
      console.error("Upload failed:", err)
      setUploadError(err instanceof Error ? err.message : "Failed to extract document text")
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  // Handle text selection in document viewer
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !documentViewerRef.current) {
      setToolbarPosition(null)
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      setToolbarPosition(null)
      return
    }

    // Check if selection is within document viewer
    const range = selection.getRangeAt(0)
    if (!documentViewerRef.current.contains(range.commonAncestorContainer)) {
      setToolbarPosition(null)
      return
    }

    setSelectedText(text)

    // Position toolbar above selection
    const rect = range.getBoundingClientRect()
    const viewerRect = documentViewerRef.current.getBoundingClientRect()

    setToolbarPosition({
      top: rect.top - viewerRect.top - 50,
      left: rect.left - viewerRect.left + rect.width / 2,
    })
  }, [])

  // Add selection listener
  useEffect(() => {
    const viewer = documentViewerRef.current
    if (!viewer) return

    viewer.addEventListener("mouseup", handleTextSelection)
    return () => viewer.removeEventListener("mouseup", handleTextSelection)
  }, [handleTextSelection, document])

  // Close toolbar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-selection-toolbar]") && !window.getSelection()?.toString().trim()) {
        setToolbarPosition(null)
      }
    }

    document && window.addEventListener("mousedown", handleClickOutside)
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [document])

  // Find Matches action
  const handleFindMatches = async () => {
    if (!selectedText) return

    setSidePanelMode("matches")
    setIsSearching(true)
    setSearchResults([])

    try {
      const results = await searchApi.searchAnswers({
        q: selectedText,
        status: "Approved",
        limit: 10,
      })
      setSearchResults(results)
    } catch (err) {
      console.error("Search failed:", err)
    } finally {
      setIsSearching(false)
    }
  }

  // Open AI prompt input
  const handleOpenAiPrompt = () => {
    if (!selectedText) return
    setShowAiInput(true)
    setSidePanelMode("ai")
    setAiResponse(null)
    setAiPrompt("")
    // Focus input after state update
    setTimeout(() => aiInputRef.current?.focus(), 100)
  }

  // Send AI query with custom prompt
  const handleSendAiQuery = async (prompt?: string) => {
    if (!selectedText) return

    const userPrompt = prompt || aiPrompt
    setShowAiInput(false)
    setIsSearching(true)
    setAiResponse(null)

    try {
      // Combine user prompt with selected text, respecting API limit
      const selectedPreview = selectedText.length > 500
        ? selectedText.slice(0, 500) + "..."
        : selectedText

      const fullQuery = userPrompt
        ? `${userPrompt}\n\nContext from RFP:\n"${selectedPreview}"`
        : selectedPreview

      // Truncate if still too long
      const query = fullQuery.length > 950
        ? fullQuery.slice(0, 950) + "..."
        : fullQuery

      const result = await aiApi.query({
        query,
        maxSources: 5,
      })
      setAiResponse(result)
    } catch (err) {
      console.error("AI query failed:", err)
      setAiResponse({
        response: "",
        sources: [],
        photos: [],
        refused: true,
        refusalReason: "Failed to connect to AI service. Please try again.",
      })
    } finally {
      setIsSearching(false)
    }
  }

  // Add to Library action
  const handleAddToLibrary = () => {
    if (!selectedText) return
    // Navigate to manual entry with the selected text pre-filled
    // The text from RFP is the question/requirement that needs an answer
    navigate(`/new?rfpText=${encodeURIComponent(selectedText)}`)
  }

  // Copy handler
  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Reset to upload new document
  const handleReupload = () => {
    setDocument(null)
    setSelectedText("")
    setToolbarPosition(null)
    setSidePanelMode(null)
    setSearchResults([])
    setAiResponse(null)
    setUploadError(null)
    setDocSearchQuery("")
    setDocSearchMatches([])
    setCurrentMatchIndex(0)
    setSaveSuccess(false)
  }

  // Save document to library
  const handleSaveDocument = async () => {
    if (!document) return

    setIsSaving(true)
    try {
      const saved = await rfpApi.saveDocument({
        name: document.filename.replace(/\.[^/.]+$/, ""), // Remove extension for name
        type: "RFP",
        originalFilename: document.filename,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        extractedText: document.text,
      })

      setDocument({ ...document, savedId: saved.id })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error("Save failed:", err)
      setUploadError(err instanceof Error ? err.message : "Failed to save document")
    } finally {
      setIsSaving(false)
    }
  }

  // Document content search
  const handleDocSearch = useCallback((query: string) => {
    setDocSearchQuery(query)
    if (!query.trim() || !document) {
      setDocSearchMatches([])
      setCurrentMatchIndex(0)
      return
    }

    // Find all match positions
    const text = document.text.toLowerCase()
    const searchTerm = query.toLowerCase()
    const matches: number[] = []
    let pos = 0

    while ((pos = text.indexOf(searchTerm, pos)) !== -1) {
      matches.push(pos)
      pos += 1 // Move past current match to find overlapping matches
    }

    setDocSearchMatches(matches)
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1)

    // Scroll to first match
    if (matches.length > 0) {
      scrollToMatch(0, matches)
    }
  }, [document])

  // Navigate between matches
  const navigateMatch = (direction: "next" | "prev") => {
    if (docSearchMatches.length === 0) return

    let newIndex: number
    if (direction === "next") {
      newIndex = (currentMatchIndex + 1) % docSearchMatches.length
    } else {
      newIndex = currentMatchIndex === 0 ? docSearchMatches.length - 1 : currentMatchIndex - 1
    }

    setCurrentMatchIndex(newIndex)
    scrollToMatch(newIndex, docSearchMatches)
  }

  // Scroll to a specific match
  const scrollToMatch = (index: number, matches: number[]) => {
    if (!documentViewerRef.current || matches.length === 0) return

    const matchPosition = matches[index]
    if (matchPosition === undefined) return

    // Find the highlight element for this match
    setTimeout(() => {
      const highlights = documentViewerRef.current?.querySelectorAll("[data-match-index]")
      const targetHighlight = highlights?.[index] as HTMLElement
      if (targetHighlight) {
        targetHighlight.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 50)
  }

  // Render document text with search highlights
  const renderHighlightedText = useCallback(() => {
    if (!document) return null

    if (!docSearchQuery.trim() || docSearchMatches.length === 0) {
      return document.text
    }

    const text = document.text
    const searchTerm = docSearchQuery
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let matchCount = 0

    // Sort matches by position
    const sortedMatches = [...docSearchMatches].sort((a, b) => a - b)

    for (const matchPos of sortedMatches) {
      // Add text before this match
      if (matchPos > lastIndex) {
        parts.push(text.slice(lastIndex, matchPos))
      }

      // Add highlighted match
      const matchEnd = matchPos + searchTerm.length
      const isCurrentMatch = matchCount === currentMatchIndex
      parts.push(
        <mark
          key={matchPos}
          data-match-index={matchCount}
          className={`px-0.5 rounded ${
            isCurrentMatch
              ? "bg-amber-400 text-amber-900 ring-2 ring-amber-500"
              : "bg-amber-200 text-amber-800"
          }`}
        >
          {text.slice(matchPos, matchEnd)}
        </mark>
      )

      lastIndex = matchEnd
      matchCount++
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts
  }, [document, docSearchQuery, docSearchMatches, currentMatchIndex])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <main className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-105 active:scale-95">
                  <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #F43F5E 0%, #EC4899 50%, #DB2777 100%)',
                    boxShadow: '0 4px 12px rgba(244,63,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                  }}
                >
                  <FileSearch size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">RFP Analyzer</h1>
                  <p className="text-slate-500 dark:text-slate-400 text-[13px]">
                    {document ? document.filename : "Upload a document to get started"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/documents">
                <Button variant="outline" className="rounded-xl h-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)] transition-all duration-200">
                  <FolderOpen size={16} className="mr-2" />
                  Saved Documents
                </Button>
              </Link>

              {document && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSaveDocument}
                    disabled={isSaving || !!document.savedId}
                    className="rounded-xl h-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)] transition-all duration-200"
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : saveSuccess || document.savedId ? (
                      <Check size={16} className="mr-2 text-emerald-500" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    {document.savedId ? "Saved" : saveSuccess ? "Saved!" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={handleReupload} className="rounded-xl h-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)] transition-all duration-200">
                    <RefreshCw size={16} className="mr-2" />
                    Upload New
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Upload Zone - shown when no document */}
          {!document && (
            <div
              className={`relative border-2 border-dashed rounded-2xl p-14 text-center transition-all duration-300 ${
                isDragging
                  ? "border-rose-400 bg-rose-50/50 dark:bg-rose-900/20 shadow-[0_0_0_4px_rgba(244,63,94,0.1)]"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-rose-300 dark:hover:border-rose-500 hover:bg-rose-50/20 dark:hover:bg-rose-900/10 hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-5">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
                    style={{
                      background: 'linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(236,72,153,0.1) 100%)',
                      boxShadow: '0 4px 12px rgba(244,63,94,0.12)'
                    }}
                  >
                    <Loader2 size={32} className="text-rose-500 animate-spin" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[15px] font-medium">Extracting document text...</p>
                </div>
              ) : (
                <>
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-7"
                    style={{
                      background: 'linear-gradient(135deg, rgba(244,63,94,0.12) 0%, rgba(236,72,153,0.08) 100%)',
                      boxShadow: '0 4px 16px rgba(244,63,94,0.1), inset 0 1px 0 rgba(255,255,255,0.5)'
                    }}
                  >
                    <Upload size={36} className="text-rose-500" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">
                    Drop your RFP document here
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-7 text-[15px]">
                    Supports PDF, Word (.docx, .doc), and text files up to 20MB
                  </p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl h-11 px-6 text-[15px]"
                    style={{
                      background: 'linear-gradient(135deg, #F43F5E 0%, #EC4899 50%, #DB2777 100%)',
                      boxShadow: '0 4px 12px rgba(244,63,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15)'
                    }}
                  >
                    <Upload size={18} className="mr-2" />
                    Choose File
                  </Button>

                  {uploadError && (
                    <div className="mt-7 p-4 bg-red-50/80 border border-red-200/60 rounded-xl">
                      <p className="text-red-700 text-[14px]">{uploadError}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Document Viewer + Side Panel */}
          {document && (
            <div className="flex gap-6">
              {/* Document Viewer */}
              <div className={`flex-1 transition-all duration-300 ${sidePanelMode ? "max-w-[60%]" : ""}`}>
                <Card className="rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                  {/* Document Header */}
                  <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-200/60 dark:border-slate-700 px-6 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center shadow-[0_2px_4px_rgba(244,63,94,0.1)]">
                      <File size={20} className="text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate text-[15px]">{document.filename}</p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        {document.pageCount ? `${document.pageCount} pages • ` : ""}
                        {document.text.split(/\s+/).length.toLocaleString()} words
                      </p>
                    </div>

                    {/* Document Search */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-rose-500" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search document..."
                          value={docSearchQuery}
                          onChange={(e) => handleDocSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              navigateMatch(e.shiftKey ? "prev" : "next")
                            } else if (e.key === "Escape") {
                              setDocSearchQuery("")
                              setDocSearchMatches([])
                            }
                          }}
                          className="w-48 h-9 pl-9 pr-3 text-[13px] border border-slate-200/80 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-400 transition-all duration-200"
                        />
                        {docSearchQuery && (
                          <button
                            onClick={() => {
                              setDocSearchQuery("")
                              setDocSearchMatches([])
                              searchInputRef.current?.focus()
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
                          >
                            <X size={12} className="text-slate-400" />
                          </button>
                        )}
                      </div>

                      {docSearchMatches.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500 min-w-[60px] text-center">
                            {currentMatchIndex + 1} of {docSearchMatches.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateMatch("prev")}
                          >
                            <ChevronUp size={14} className="text-slate-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateMatch("next")}
                          >
                            <ChevronDown size={14} className="text-slate-600" />
                          </Button>
                        </div>
                      )}

                      {docSearchQuery && docSearchMatches.length === 0 && (
                        <span className="text-xs text-slate-400">No matches</span>
                      )}
                    </div>

                    <Badge variant="outline" className="text-xs">
                      <FileText size={12} className="mr-1" />
                      Extracted
                    </Badge>
                  </div>

                  {/* Document Content */}
                  <div
                    ref={documentViewerRef}
                    data-testid="document-viewer"
                    className="relative p-6 max-h-[calc(100vh-280px)] overflow-y-auto"
                  >
                    {/* Floating Selection Toolbar */}
                    {toolbarPosition && (
                      <div
                        data-selection-toolbar
                        data-testid="selection-toolbar"
                        className="fixed z-[100] flex items-center gap-1 p-1.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700 animate-fade-in-up"
                        style={{
                          top: `calc(${toolbarPosition.top}px + ${documentViewerRef.current?.getBoundingClientRect().top ?? 0}px)`,
                          left: `calc(${toolbarPosition.left}px + ${documentViewerRef.current?.getBoundingClientRect().left ?? 0}px)`,
                          transform: "translate(-50%, -100%) translateY(-8px)",
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)'
                        }}
                      >
                        <button
                          className="h-9 px-3.5 rounded-xl text-[12px] font-semibold flex items-center bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-150 hover:shadow-[0_2px_8px_rgba(16,185,129,0.15)]"
                          onClick={handleFindMatches}
                        >
                          <Search size={14} className="mr-1.5" />
                          Find Matches
                        </button>
                        <button
                          className="h-9 px-3.5 rounded-xl text-[12px] font-semibold flex items-center bg-purple-50 text-purple-700 hover:bg-purple-100 transition-all duration-150 hover:shadow-[0_2px_8px_rgba(139,92,246,0.15)]"
                          onClick={handleOpenAiPrompt}
                        >
                          <Sparkles size={14} className="mr-1.5" />
                          Ask AI
                        </button>
                        <button
                          className="h-9 px-3.5 rounded-xl text-[12px] font-semibold flex items-center bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all duration-150 hover:shadow-[0_2px_8px_rgba(59,130,246,0.15)]"
                          onClick={handleAddToLibrary}
                        >
                          <Plus size={14} className="mr-1.5" />
                          Add to Library
                        </button>
                      </div>
                    )}

                    {/* Document Text */}
                    <div className="prose prose-slate prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-[14px] text-slate-700 dark:text-slate-300 leading-[1.7]">
                        {renderHighlightedText()}
                      </pre>
                    </div>

                  </div>
                </Card>
              </div>

              {/* Side Panel */}
              {sidePanelMode && (
                <div className="w-[40%] min-w-[360px] animate-fade-in-up" data-testid="side-panel">
                  <Card className="rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.06)] sticky top-24">
                    {/* Panel Header */}
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-200/60 dark:border-slate-700 px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {sidePanelMode === "matches" ? (
                          <>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shadow-[0_2px_4px_rgba(16,185,129,0.1)]">
                              <Search size={16} className="text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-[14px]">Library Matches</p>
                              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                                {isSearching ? "Searching..." : `${searchResults.length} results found`}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center shadow-[0_2px_4px_rgba(139,92,246,0.1)]">
                              <Sparkles size={16} className="text-purple-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-[14px]">AI Response</p>
                              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                                {isSearching ? "Generating..." : "Based on your library"}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl hover:bg-slate-200/50 transition-all duration-150"
                        onClick={() => setSidePanelMode(null)}
                      >
                        <X size={16} className="text-slate-400" />
                      </Button>
                    </div>

                    {/* Selected Text Preview */}
                    <div className="px-5 py-3 bg-gradient-to-b from-slate-50/30 to-white border-b border-slate-100/60">
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Selected text</p>
                      <p className="text-[13px] text-slate-700 line-clamp-2 leading-relaxed italic">"{selectedText}"</p>
                    </div>

                    {/* Panel Content */}
                    <CardContent className="p-5 max-h-[calc(100vh-400px)] overflow-y-auto">
                      {isSearching ? (
                        <div className="flex flex-col items-center justify-center py-14">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 animate-pulse">
                            <Loader2 size={24} className="text-slate-400 animate-spin" />
                          </div>
                          <p className="text-[14px] text-slate-500 font-medium">
                            {sidePanelMode === "matches" ? "Searching library..." : "Generating response..."}
                          </p>
                        </div>
                      ) : sidePanelMode === "matches" ? (
                        // Library Matches Results
                        <div className="space-y-3">
                          {searchResults.length === 0 ? (
                            <div className="text-center py-8">
                              <p className="text-slate-500 text-sm">No matching content found</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-3 rounded-lg"
                                onClick={handleAddToLibrary}
                              >
                                <Plus size={14} className="mr-1.5" />
                                Add to Library
                              </Button>
                            </div>
                          ) : (
                            searchResults.map((result) => (
                              <div
                                key={result.id}
                                className="p-4 bg-white rounded-xl border border-slate-200/60 hover:border-emerald-200 hover:shadow-[0_2px_8px_rgba(16,185,129,0.08)] transition-all duration-200 group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="font-semibold text-slate-900 text-[13px] leading-snug">
                                    {result.question}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150"
                                    onClick={() => handleCopy(result.answer, result.id)}
                                  >
                                    {copiedId === result.id ? (
                                      <Check size={14} className="text-emerald-500" />
                                    ) : (
                                      <Copy size={14} className="text-slate-400" />
                                    )}
                                  </Button>
                                </div>
                                <p className="text-[12px] text-slate-600 line-clamp-3 leading-relaxed">{result.answer}</p>
                                <div className="flex items-center gap-2 mt-3">
                                  <Badge variant={result.status === "Approved" ? "success" : "warning"} className="text-[10px]">
                                    {result.status}
                                  </Badge>
                                  <Link
                                    to={`/search?q=${encodeURIComponent(result.question)}`}
                                    className="text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 ml-auto font-medium"
                                  >
                                    View details
                                    <ChevronRight size={12} />
                                  </Link>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        // AI Panel
                        <div className="space-y-4">
                          {/* AI Prompt Input */}
                          {showAiInput && !aiResponse && (
                            <div className="space-y-3">
                              <p className="text-sm text-slate-600">
                                What would you like to do with this selection?
                              </p>

                              {/* Quick suggestions */}
                              <div className="flex flex-wrap gap-2">
                                {AI_PROMPT_SUGGESTIONS.map((suggestion) => (
                                  <button
                                    key={suggestion}
                                    onClick={() => handleSendAiQuery(suggestion)}
                                    className="px-3 py-2 text-[11px] font-medium bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 hover:shadow-[0_2px_6px_rgba(139,92,246,0.1)] transition-all duration-150"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>

                              {/* Custom prompt input */}
                              <div className="relative">
                                <Textarea
                                  ref={aiInputRef}
                                  value={aiPrompt}
                                  onChange={(e) => setAiPrompt(e.target.value)}
                                  placeholder="Or type your own request..."
                                  className="min-h-[80px] pr-12 text-sm rounded-xl resize-none"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && aiPrompt.trim()) {
                                      e.preventDefault()
                                      handleSendAiQuery()
                                    }
                                  }}
                                />
                                <Button
                                  size="icon"
                                  className="absolute bottom-2 right-2 h-8 w-8 rounded-lg bg-purple-600 hover:bg-purple-700"
                                  onClick={() => handleSendAiQuery()}
                                  disabled={!aiPrompt.trim()}
                                >
                                  <Send size={14} />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* AI Response */}
                          {aiResponse?.refused ? (
                            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/60 rounded-xl shadow-[0_1px_3px_rgba(245,158,11,0.05)]">
                              <p className="text-amber-800 text-[13px] leading-relaxed">
                                {aiResponse.refusalReason || "Couldn't find relevant content in the library."}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-3 h-8 text-[12px] rounded-xl"
                                onClick={handleOpenAiPrompt}
                              >
                                Try again
                              </Button>
                            </div>
                          ) : aiResponse ? (
                            <>
                              <div className="p-4 bg-gradient-to-br from-purple-50/40 via-white to-violet-50/30 rounded-xl border border-purple-100/60 shadow-[0_1px_3px_rgba(139,92,246,0.05)]">
                                <p className="text-slate-700 text-[13px] whitespace-pre-wrap leading-[1.7]">
                                  {aiResponse.response}
                                </p>
                                <div className="flex gap-2 mt-3">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs rounded-lg"
                                    onClick={() => handleCopy(aiResponse.response, "ai-response")}
                                  >
                                    {copiedId === "ai-response" ? (
                                      <>
                                        <Check size={12} className="mr-1.5 text-emerald-500" />
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={12} className="mr-1.5" />
                                        Copy
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs rounded-lg"
                                    onClick={handleOpenAiPrompt}
                                  >
                                    Ask something else
                                  </Button>
                                </div>
                              </div>

                              {/* Sources */}
                              {aiResponse.sources && aiResponse.sources.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-slate-500 mb-2">
                                    Sources ({aiResponse.sources.length})
                                  </p>
                                  <div className="space-y-2">
                                    {aiResponse.sources.map((source) => (
                                      <div
                                        key={source.id}
                                        className="p-3 bg-slate-50 rounded-lg border border-slate-100 group"
                                      >
                                        <p className="text-xs font-medium text-slate-800 mb-1">
                                          {source.question}
                                        </p>
                                        <p className="text-xs text-slate-500 line-clamp-2">
                                          {source.answer}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
