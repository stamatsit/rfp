import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useIsAdmin } from "@/contexts/AuthContext"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { useScanCriteria } from "@/hooks/useScanCriteria"
import { useDocumentScan } from "@/hooks/useDocumentScan"
import {
  ArrowLeft,
  FileSearch,
  Upload,
  FileText,
  Loader2,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  File,
  Shield,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Calendar,
  ScanLine,
  FolderOpen,
  ChevronRight,
  MessageSquare,
  ImageIcon,
  CheckSquare,
  Square,
  Download,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button, Card, CardContent, Badge } from "@/components/ui"
import { rfpApi, topicsApi, type SavedDocument, type ScanFlag, type ExtractedImage } from "@/lib/api"

type ActiveTab = "scan" | "library"
type DocumentType = "RFP" | "Proposal"

interface DocumentState {
  text: string
  filename: string
  pageCount?: number
  mimeType?: string
  fileSize?: number
  savedId?: string
  images?: ExtractedImage[]
}

// ─── Severity helpers ───
const severityConfig = {
  high: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", bar: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  medium: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", bar: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  low: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", bar: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
}

export function RFPAnalyzer() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>("scan")

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentState | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [docType, setDocType] = useState<DocumentType>("RFP")
  const [showCriteria, setShowCriteria] = useState(false)
  const [newCriterionLabel, setNewCriterionLabel] = useState("")

  // In-document search
  const [docSearchQuery, setDocSearchQuery] = useState("")
  const [docSearchMatches, setDocSearchMatches] = useState<number[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Flag note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")

  // Extracted images state
  const [showImagesPanel, setShowImagesPanel] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [imageSaveTopicId, setImageSaveTopicId] = useState<string>("")
  const [topics, setTopics] = useState<Array<{ id: string; displayName: string }>>([])
  const [isSavingImages, setIsSavingImages] = useState(false)
  const [imageSaveResult, setImageSaveResult] = useState<string | null>(null)

  // Library state
  const [libraryDocs, setLibraryDocs] = useState<SavedDocument[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<"all" | DocumentType>("all")
  const [libraryTotal, setLibraryTotal] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Hooks
  const criteria = useScanCriteria()
  const scanner = useDocumentScan()

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const documentViewerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load saved document from URL parameter
  useEffect(() => {
    const docId = searchParams.get("docId")
    if (docId && !document) {
      setIsUploading(true)
      rfpApi.getDocument(docId).then((savedDoc) => {
        setDocument({
          text: savedDoc.extractedText,
          filename: savedDoc.originalFilename,
          pageCount: savedDoc.pageCount,
          mimeType: savedDoc.mimeType,
          fileSize: savedDoc.fileSize,
          savedId: savedDoc.id,
        })
        setDocType(savedDoc.type === "Proposal" ? "Proposal" : "RFP")
        // Load existing scan results if available
        if (savedDoc.scanResults && savedDoc.scanResults.length > 0) {
          scanner.loadFromDocument(savedDoc.scanResults, {
            documentId: savedDoc.id,
            summary: savedDoc.scanSummary || "",
            scannedAt: savedDoc.scannedAt || "",
          })
        }
      }).catch((err) => {
        setUploadError(err instanceof Error ? err.message : "Failed to load document")
      }).finally(() => {
        setIsUploading(false)
      })
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load library when tab switches
  useEffect(() => {
    if (activeTab === "library") loadLibrary()
  }, [activeTab, librarySearch, libraryTypeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadLibrary = async () => {
    setLibraryLoading(true)
    try {
      const result = await rfpApi.listDocuments({
        type: libraryTypeFilter === "all" ? undefined : libraryTypeFilter,
        search: librarySearch || undefined,
        limit: 50,
      })
      setLibraryDocs(result.documents)
      setLibraryTotal(result.total)
    } catch (err) {
      console.error("Failed to load documents:", err)
    } finally {
      setLibraryLoading(false)
    }
  }

  // ─── File Upload ───
  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    setUploadError(null)
    scanner.reset()

    try {
      const result = await rfpApi.extract(file)
      setDocument({
        text: result.text,
        filename: result.filename,
        pageCount: result.pageCount,
        mimeType: file.type,
        fileSize: file.size,
        images: result.images,
      })
      setDocSearchQuery("")
      setDocSearchMatches([])
      setSelectedImageIds(new Set())
      setShowImagesPanel(false)
      setImageSaveResult(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to extract document text")
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  // ─── Scan ───
  const handleScan = async () => {
    if (!document) return
    try {
      await scanner.scan({
        documentId: document.savedId,
        documentText: document.text,
        documentType: docType,
        criteria: criteria.getActiveCriteria(),
        originalFilename: document.filename,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
      })
      // Update savedId if this was a new upload (scan endpoint saves it)
      if (!document.savedId && scanner.scanResult?.documentId) {
        setDocument((prev) => prev ? { ...prev, savedId: scanner.scanResult!.documentId } : prev)
      }
    } catch {
      // error is already in scanner.error
    }
  }

  // After scan completes, update savedId
  useEffect(() => {
    if (scanner.scanResult?.documentId && document && !document.savedId) {
      setDocument((prev) => prev ? { ...prev, savedId: scanner.scanResult!.documentId } : prev)
    }
  }, [scanner.scanResult?.documentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReupload = () => {
    setDocument(null)
    scanner.reset()
    setUploadError(null)
    setDocSearchQuery("")
    setDocSearchMatches([])
    setDocType("RFP")
    setShowImagesPanel(false)
    setSelectedImageIds(new Set())
    setImageSaveResult(null)
  }

  // ─── Add Custom Criterion ───
  const handleAddCriterion = async () => {
    if (!newCriterionLabel.trim()) return
    await criteria.addCriterion(newCriterionLabel.trim())
    setNewCriterionLabel("")
  }

  // ─── In-document search ───
  const handleDocSearch = useCallback((query: string) => {
    setDocSearchQuery(query)
    if (!query.trim() || !document) {
      setDocSearchMatches([])
      setCurrentMatchIndex(0)
      return
    }
    const text = document.text.toLowerCase()
    const searchTerm = query.toLowerCase()
    const matches: number[] = []
    let pos = 0
    while ((pos = text.indexOf(searchTerm, pos)) !== -1) {
      matches.push(pos)
      pos += 1
    }
    setDocSearchMatches(matches)
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1)
    if (matches.length > 0) scrollToMatch(0, matches)
  }, [document])

  const navigateMatch = (direction: "next" | "prev") => {
    if (docSearchMatches.length === 0) return
    const newIndex = direction === "next"
      ? (currentMatchIndex + 1) % docSearchMatches.length
      : currentMatchIndex === 0 ? docSearchMatches.length - 1 : currentMatchIndex - 1
    setCurrentMatchIndex(newIndex)
    scrollToMatch(newIndex, docSearchMatches)
  }

  const scrollToMatch = (index: number, matches: number[]) => {
    if (!documentViewerRef.current || matches.length === 0) return
    setTimeout(() => {
      const highlights = documentViewerRef.current?.querySelectorAll("[data-match-index]")
      const target = highlights?.[index] as HTMLElement
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 50)
  }

  const renderHighlightedText = useCallback(() => {
    if (!document) return null
    if (!docSearchQuery.trim() || docSearchMatches.length === 0) return document.text
    const text = document.text
    const searchTerm = docSearchQuery
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let matchCount = 0
    const sortedMatches = [...docSearchMatches].sort((a, b) => a - b)
    for (const matchPos of sortedMatches) {
      if (matchPos > lastIndex) parts.push(text.slice(lastIndex, matchPos))
      const matchEnd = matchPos + searchTerm.length
      const isCurrentMatch = matchCount === currentMatchIndex
      parts.push(
        <mark key={matchPos} data-match-index={matchCount} className={`px-0.5 rounded ${isCurrentMatch ? "bg-red-400 text-red-900 ring-2 ring-red-500" : "bg-red-200 text-red-800"}`}>
          {text.slice(matchPos, matchEnd)}
        </mark>
      )
      lastIndex = matchEnd
      matchCount++
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }, [document, docSearchQuery, docSearchMatches, currentMatchIndex])

  // Scroll to flag excerpt in document
  const scrollToExcerpt = (excerpt: string) => {
    if (!document || !documentViewerRef.current) return
    const idx = document.text.indexOf(excerpt.slice(0, 80))
    if (idx === -1) return
    // Temporarily set search to highlight the excerpt
    handleDocSearch(excerpt.slice(0, 60))
    setTimeout(() => {
      setDocSearchQuery("")
      setDocSearchMatches([])
    }, 3000)
  }

  // ─── Library helpers ───
  const handleDeleteDoc = async (id: string) => {
    setDeletingId(id)
    try {
      await rfpApi.deleteDocument(id)
      setLibraryDocs((prev) => prev.filter((d) => d.id !== id))
      setLibraryTotal((prev) => prev - 1)
    } catch (err) {
      console.error("Delete failed:", err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleOpenDoc = (doc: SavedDocument) => {
    setDocument({
      text: doc.extractedText,
      filename: doc.originalFilename,
      pageCount: doc.pageCount,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      savedId: doc.id,
    })
    setDocType(doc.type === "Proposal" ? "Proposal" : "RFP")
    if (doc.scanResults && doc.scanResults.length > 0) {
      scanner.loadFromDocument(doc.scanResults, {
        documentId: doc.id,
        summary: doc.scanSummary || "",
        scannedAt: doc.scannedAt || "",
      })
    } else {
      scanner.reset()
    }
    setActiveTab("scan")
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ""
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  // ─── Image helpers ───
  const extractedImages = document?.images || []
  const imageCount = extractedImages.length

  const toggleImageSelection = (name: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAllImages = () => {
    if (selectedImageIds.size === imageCount) {
      setSelectedImageIds(new Set())
    } else {
      setSelectedImageIds(new Set(extractedImages.map((img) => img.name)))
    }
  }

  const handleSaveImages = async () => {
    if (selectedImageIds.size === 0 || !imageSaveTopicId) return
    setIsSavingImages(true)
    setImageSaveResult(null)
    try {
      const selected = extractedImages.filter((img) => selectedImageIds.has(img.name))
      const result = await rfpApi.saveImages(
        selected.map((img) => ({ dataUrl: img.dataUrl, name: img.name, contentType: img.contentType })),
        imageSaveTopicId,
        document?.filename || "document"
      )
      setImageSaveResult(`Saved ${result.saved} image${result.saved !== 1 ? "s" : ""} to photo library`)
      setSelectedImageIds(new Set())
    } catch (err) {
      setImageSaveResult(err instanceof Error ? err.message : "Failed to save images")
    } finally {
      setIsSavingImages(false)
    }
  }

  // Load topics when images panel opens
  useEffect(() => {
    if (showImagesPanel && topics.length === 0) {
      topicsApi.getAll().then(setTopics).catch(() => {})
    }
  }, [showImagesPanel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived ───
  const activeFlags = scanner.flags.filter((f) => !f.dismissed)
  const dismissedFlags = scanner.flags.filter((f) => f.dismissed)
  const hasScanResults = scanner.scanResult !== null || scanner.flags.length > 0

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />
      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete document"
        description="This document will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteId) handleDeleteDoc(confirmDeleteId) }}
      />

      <main className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-105 active:scale-95">
                  <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #FF3B30 0%, #E0312B 50%, #C5221F 100%)", boxShadow: "0 4px 14px rgba(255,59,48,0.3), 0 1px 3px rgba(0,0,0,0.1)" }}>
                  <ScanLine size={22} className="text-white" strokeWidth={2.25} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Document Scanner</h1>
                  <p className="text-slate-500 dark:text-slate-400 text-[13px]">
                    {document ? document.filename : "Upload RFPs and proposals for AI scanning"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Tab toggle */}
              <div className="flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                <button onClick={() => setActiveTab("scan")} className={`px-4 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 ${activeTab === "scan" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                  <ScanLine size={14} className="inline-block mr-1.5 -mt-0.5" />Scan
                </button>
                <button onClick={() => setActiveTab("library")} className={`px-4 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 ${activeTab === "library" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                  <FolderOpen size={14} className="inline-block mr-1.5 -mt-0.5" />Library
                </button>
              </div>

              {document && activeTab === "scan" && (
                <Button variant="outline" onClick={handleReupload} className="rounded-xl h-10">
                  <RefreshCw size={16} className="mr-2" /> Upload New
                </Button>
              )}
            </div>
          </div>

          {/* ─── SCAN TAB ─── */}
          {activeTab === "scan" && (
            <>
              {/* Upload Zone */}
              {!document && (
                <div
                  className={`relative border-2 border-dashed rounded-2xl p-14 text-center transition-all duration-300 ${isDragging ? "border-red-400 bg-red-50/50 dark:bg-red-900/20 shadow-[0_0_0_4px_rgba(255,59,48,0.1)]" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-red-300 dark:hover:border-red-500 hover:bg-red-50/20 dark:hover:bg-red-900/10"}`}
                  onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFileInputChange} className="hidden" />

                  {isUploading ? (
                    <div className="flex flex-col items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, rgba(255,59,48,0.15) 0%, rgba(224,49,43,0.1) 100%)" }}>
                        <Loader2 size={32} className="text-red-500 animate-spin" />
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[15px] font-medium">Extracting document text...</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-7" style={{ background: "linear-gradient(135deg, rgba(255,59,48,0.12) 0%, rgba(224,49,43,0.08) 100%)" }}>
                        <Upload size={36} className="text-red-500" />
                      </div>
                      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 tracking-tight">Drop your document here</h2>
                      <p className="text-slate-500 dark:text-slate-400 mb-7 text-[15px]">Supports PDF, Word (.docx, .doc), and text files up to 50MB</p>
                      <Button onClick={() => fileInputRef.current?.click()} className="rounded-xl h-11 px-6 text-[15px]" style={{ background: "linear-gradient(135deg, #FF3B30 0%, #E0312B 50%, #C5221F 100%)", boxShadow: "0 4px 12px rgba(255,59,48,0.35)" }}>
                        <Upload size={18} className="mr-2" /> Choose File
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

              {/* Document loaded — show type selector + scan button OR split panel */}
              {document && !hasScanResults && !scanner.isScanning && (
                <Card className="rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 p-8">
                  <div className="max-w-xl mx-auto text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "linear-gradient(135deg, rgba(255,59,48,0.12) 0%, rgba(224,49,43,0.08) 100%)" }}>
                      <File size={28} className="text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{document.filename}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      {document.pageCount ? `${document.pageCount} pages · ` : ""}{document.text.split(/\s+/).length.toLocaleString()} words
                    </p>

                    {imageCount > 0 && (
                      <button
                        onClick={() => setShowImagesPanel(!showImagesPanel)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <ImageIcon size={14} />
                        {imageCount} image{imageCount !== 1 ? "s" : ""} found
                        <ChevronRight size={14} className={`transition-transform ${showImagesPanel ? "rotate-90" : ""}`} />
                      </button>
                    )}

                    {showImagesPanel && imageCount > 0 && (
                      <div className="text-left mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Extracted Images ({imageCount})</p>
                          <button onClick={toggleAllImages} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 font-medium">
                            {selectedImageIds.size === imageCount ? "Deselect All" : "Select All"}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {extractedImages.map((img) => (
                            <button
                              key={img.name}
                              onClick={() => toggleImageSelection(img.name)}
                              className={`relative rounded-lg overflow-hidden border-2 transition-all ${selectedImageIds.has(img.name) ? "border-red-400 shadow-[0_0_0_2px_rgba(255,59,48,0.2)]" : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"}`}
                            >
                              <img src={img.dataUrl} alt={img.name} className="w-full h-24 object-cover bg-white dark:bg-slate-800" />
                              <div className="absolute top-1.5 right-1.5">
                                {selectedImageIds.has(img.name) ? (
                                  <CheckSquare size={18} className="text-red-500 drop-shadow" />
                                ) : (
                                  <Square size={18} className="text-white/70 drop-shadow" />
                                )}
                              </div>
                              <div className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {img.width > 0 ? `${img.width}×${img.height}` : img.name}
                                {img.pageNumber ? ` · p${img.pageNumber}` : ""}
                              </div>
                            </button>
                          ))}
                        </div>
                        {/* Save controls */}
                        <div className="flex items-center gap-2">
                          <select
                            value={imageSaveTopicId}
                            onChange={(e) => setImageSaveTopicId(e.target.value)}
                            className="flex-1 h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                          >
                            <option value="">Select topic...</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>{t.displayName}</option>
                            ))}
                          </select>
                          <Button
                            onClick={handleSaveImages}
                            disabled={selectedImageIds.size === 0 || !imageSaveTopicId || isSavingImages}
                            size="sm"
                            className="rounded-lg h-9 bg-red-500 hover:bg-red-600 whitespace-nowrap"
                          >
                            {isSavingImages ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
                            Save {selectedImageIds.size > 0 ? `${selectedImageIds.size} ` : ""}to Library
                          </Button>
                        </div>
                        {imageSaveResult && (
                          <p className={`text-xs mt-2 ${imageSaveResult.startsWith("Saved") ? "text-red-600 dark:text-red-400" : "text-red-600 dark:text-red-400"}`}>
                            {imageSaveResult}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Document type selector */}
                    <div className="mb-6">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">What type of document is this?</p>
                      <div className="flex gap-3 justify-center">
                        {(["RFP", "Proposal"] as const).map((t) => (
                          <button key={t} onClick={() => setDocType(t)} className={`px-6 py-3 rounded-xl text-sm font-medium border-2 transition-all duration-200 ${docType === t ? "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-[0_0_0_4px_rgba(255,59,48,0.1)]" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Criteria toggle */}
                    <div className="mb-6">
                      <button onClick={() => setShowCriteria(!showCriteria)} className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium flex items-center gap-1 mx-auto">
                        <Shield size={14} />
                        {showCriteria ? "Hide" : "Configure"} scan criteria
                        <ChevronRight size={14} className={`transition-transform ${showCriteria ? "rotate-90" : ""}`} />
                      </button>
                    </div>

                    {showCriteria && (
                      <div className="text-left mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Default criteria (always active)</p>
                        {criteria.defaults.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                            <Shield size={14} className="text-red-500 shrink-0" />
                            <span className="font-medium">{c.label}</span>
                            {c.description && <span className="text-xs text-slate-400 dark:text-slate-500 truncate">— {c.description}</span>}
                          </div>
                        ))}

                        {criteria.custom.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-4 mb-3">Your custom criteria</p>
                            {criteria.custom.map((c) => (
                              <div key={c.id} className="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 group">
                                <Plus size={14} className="text-blue-500 shrink-0" />
                                <span className="font-medium flex-1">{c.label}</span>
                                <button onClick={() => criteria.removeCriterion(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all">
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        <div className="flex gap-2 mt-4">
                          <input
                            type="text"
                            placeholder="Add something to look for..."
                            value={newCriterionLabel}
                            onChange={(e) => setNewCriterionLabel(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddCriterion()}
                            className="flex-1 h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                          />
                          <Button onClick={handleAddCriterion} disabled={!newCriterionLabel.trim()} size="sm" className="rounded-lg h-9 bg-red-500 hover:bg-red-600">
                            <Plus size={14} />
                          </Button>
                        </div>
                      </div>
                    )}

                    {scanner.error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{scanner.error}</div>
                    )}

                    <Button onClick={handleScan} disabled={scanner.isScanning} className="rounded-xl h-12 px-8 text-[15px]" style={{ background: "linear-gradient(135deg, #FF3B30 0%, #E0312B 50%, #C5221F 100%)", boxShadow: "0 4px 12px rgba(255,59,48,0.35)" }}>
                      {scanner.isScanning ? <Loader2 size={18} className="mr-2 animate-spin" /> : <ScanLine size={18} className="mr-2" />}
                      {scanner.isScanning ? "Scanning..." : "Scan Document"}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Scanning in progress (overlay) */}
              {scanner.isScanning && document && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 animate-pulse" style={{ background: "linear-gradient(135deg, rgba(255,59,48,0.15) 0%, rgba(224,49,43,0.1) 100%)" }}>
                    <ScanLine size={40} className="text-red-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Scanning {document.filename}...</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">AI is analyzing your {docType} for flags and issues</p>
                </div>
              )}

              {/* Split Panel: Document Viewer + Flags */}
              {document && hasScanResults && !scanner.isScanning && (
                <div className="flex gap-6">
                  {/* Left: Document Viewer */}
                  <div className="flex-[3] min-w-0">
                    <Card className="rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                      {/* Doc Header */}
                      <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-200/60 dark:border-slate-700 px-6 py-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-100 to-red-100/80 dark:from-red-900/30 dark:to-red-900/20 flex items-center justify-center">
                          <File size={20} className="text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate text-[15px]">{document.filename}</p>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">
                            {document.pageCount ? `${document.pageCount} pages · ` : ""}{document.text.split(/\s+/).length.toLocaleString()} words
                          </p>
                        </div>

                        {/* Doc Search */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              ref={searchInputRef} type="text" placeholder="Search document..."
                              value={docSearchQuery} onChange={(e) => handleDocSearch(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); navigateMatch(e.shiftKey ? "prev" : "next") } else if (e.key === "Escape") { setDocSearchQuery(""); setDocSearchMatches([]) } }}
                              className="w-48 h-9 pl-9 pr-3 text-[13px] border border-slate-200/80 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-400"
                            />
                            {docSearchQuery && (
                              <button onClick={() => { setDocSearchQuery(""); setDocSearchMatches([]); searchInputRef.current?.focus() }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-600 rounded">
                                <X size={12} className="text-slate-400" />
                              </button>
                            )}
                          </div>
                          {docSearchMatches.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-500 min-w-[60px] text-center">{currentMatchIndex + 1} of {docSearchMatches.length}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMatch("prev")}><ChevronUp size={14} /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMatch("next")}><ChevronDown size={14} /></Button>
                            </div>
                          )}
                          {docSearchQuery && docSearchMatches.length === 0 && <span className="text-xs text-slate-400">No matches</span>}
                        </div>

                        {imageCount > 0 && (
                          <button
                            onClick={() => setShowImagesPanel(!showImagesPanel)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${showImagesPanel ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-600" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20"}`}
                          >
                            <ImageIcon size={12} />
                            {imageCount}
                          </button>
                        )}

                        <Badge variant="outline" className="text-xs">
                          <FileText size={12} className="mr-1" />{docType}
                        </Badge>
                      </div>

                      {/* Extracted Images Panel (collapsible) */}
                      {showImagesPanel && imageCount > 0 && (
                        <div className="border-b border-slate-200/60 dark:border-slate-700 px-6 py-4 bg-red-50/30 dark:bg-red-900/10">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <ImageIcon size={14} className="text-red-600" />
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">Extracted Images ({imageCount})</span>
                            </div>
                            <button onClick={toggleAllImages} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 font-medium">
                              {selectedImageIds.size === imageCount ? "Deselect All" : "Select All"}
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {extractedImages.map((img) => (
                              <button
                                key={img.name}
                                onClick={() => toggleImageSelection(img.name)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${selectedImageIds.has(img.name) ? "border-red-400 shadow-[0_0_0_2px_rgba(255,59,48,0.2)]" : "border-slate-200 dark:border-slate-600 hover:border-slate-300"}`}
                              >
                                <img src={img.dataUrl} alt={img.name} className="w-full h-20 object-cover bg-white dark:bg-slate-800" />
                                <div className="absolute top-1 right-1">
                                  {selectedImageIds.has(img.name) ? (
                                    <CheckSquare size={16} className="text-red-500 drop-shadow" />
                                  ) : (
                                    <Square size={16} className="text-white/70 drop-shadow" />
                                  )}
                                </div>
                                <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 truncate">
                                  {img.width > 0 ? `${img.width}×${img.height}` : img.name}
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={imageSaveTopicId}
                              onChange={(e) => setImageSaveTopicId(e.target.value)}
                              className="flex-1 h-8 px-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            >
                              <option value="">Select topic...</option>
                              {topics.map((t) => (
                                <option key={t.id} value={t.id}>{t.displayName}</option>
                              ))}
                            </select>
                            <Button
                              onClick={handleSaveImages}
                              disabled={selectedImageIds.size === 0 || !imageSaveTopicId || isSavingImages}
                              size="sm"
                              className="rounded-lg h-8 text-xs bg-red-500 hover:bg-red-600 whitespace-nowrap"
                            >
                              {isSavingImages ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Download size={12} className="mr-1" />}
                              Save {selectedImageIds.size > 0 ? selectedImageIds.size : ""} to Library
                            </Button>
                          </div>
                          {imageSaveResult && (
                            <p className={`text-xs mt-2 ${imageSaveResult.startsWith("Saved") ? "text-red-600 dark:text-red-400" : "text-red-600 dark:text-red-400"}`}>
                              {imageSaveResult}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Doc Content */}
                      <div ref={documentViewerRef} className="relative p-6 max-h-[calc(100vh-280px)] overflow-y-auto">
                        <div className="prose prose-slate prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap font-sans text-[14px] text-slate-700 dark:text-slate-300 leading-[1.7]">
                            {renderHighlightedText()}
                          </pre>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Right: Flags Panel */}
                  <div className="flex-[2] min-w-[340px]">
                    <Card className="rounded-2xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.06)] sticky top-20">
                      {/* Flags Header */}
                      <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-200/60 dark:border-slate-700 px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-red-500" />
                            <h3 className="font-semibold text-slate-900 dark:text-white text-[15px]">Flags</h3>
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-xs">{activeFlags.length}</Badge>
                          </div>
                          <Button variant="ghost" size="sm" onClick={handleScan} className="h-8 text-xs rounded-lg" disabled={scanner.isScanning}>
                            <RefreshCw size={12} className={`mr-1.5 ${scanner.isScanning ? "animate-spin" : ""}`} /> Re-scan
                          </Button>
                        </div>
                        {scanner.scanResult?.summary && (
                          <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">{scanner.scanResult.summary}</p>
                        )}
                      </div>

                      {/* Flags List */}
                      <CardContent className="p-4 max-h-[calc(100vh-380px)] overflow-y-auto space-y-3">
                        {activeFlags.length === 0 && dismissedFlags.length === 0 && (
                          <div className="text-center py-8">
                            <Shield size={32} className="text-red-400 mx-auto mb-3" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No flags found</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This document looks clean based on current criteria.</p>
                          </div>
                        )}

                        {/* Active Flags */}
                        {activeFlags.map((flag) => {
                          const config = severityConfig[flag.severity]
                          const SeverityIcon = config.icon
                          return (
                            <div key={flag.id} className={`relative rounded-xl border ${config.border} ${config.bg} overflow-hidden transition-all duration-200 hover:shadow-md`}>
                              {/* Severity bar */}
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.bar}`} />
                              <div className="pl-4 pr-3 py-3">
                                <div className="flex items-start gap-2 mb-1.5">
                                  <SeverityIcon size={15} className={`${config.color} shrink-0 mt-0.5`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-snug">{flag.title}</p>
                                    <Badge className={`${config.badge} text-[10px] mt-1`}>{flag.severity}</Badge>
                                  </div>
                                </div>

                                {/* Excerpt */}
                                <button onClick={() => scrollToExcerpt(flag.excerpt)} className="text-left w-full mt-2 p-2 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-slate-200/40 dark:border-slate-600/40 hover:bg-white dark:hover:bg-slate-800 transition-colors group">
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-3 leading-relaxed group-hover:text-slate-700 dark:group-hover:text-slate-300">"{flag.excerpt}"</p>
                                </button>

                                {/* Note */}
                                {flag.note && editingNoteId !== flag.id && (
                                  <div className="mt-2 flex items-start gap-1.5">
                                    <MessageSquare size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{flag.note}</p>
                                  </div>
                                )}

                                {/* Note Editor */}
                                {editingNoteId === flag.id && (
                                  <div className="mt-2 flex gap-2">
                                    <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { scanner.addNote(flag.id, noteText, document?.savedId); setEditingNoteId(null) } }} autoFocus placeholder="Add a note..." className="flex-1 h-8 px-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                                    <Button size="sm" className="h-8 text-xs rounded-lg" onClick={() => { scanner.addNote(flag.id, noteText, document?.savedId); setEditingNoteId(null) }}>Save</Button>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 mt-2">
                                  <button onClick={() => scanner.dismissFlag(flag.id, document?.savedId)} className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1">
                                    <EyeOff size={12} /> Dismiss
                                  </button>
                                  {editingNoteId !== flag.id && (
                                    <button onClick={() => { setEditingNoteId(flag.id); setNoteText(flag.note || "") }} className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1">
                                      <MessageSquare size={12} /> {flag.note ? "Edit Note" : "Add Note"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* Dismissed Flags */}
                        {dismissedFlags.length > 0 && (
                          <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700">
                            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Dismissed ({dismissedFlags.length})</p>
                            {dismissedFlags.map((flag) => (
                              <div key={flag.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/50 opacity-60 hover:opacity-100 transition-opacity">
                                <span className="text-[12px] text-slate-500 dark:text-slate-400 flex-1 truncate">{flag.title}</span>
                                <button onClick={() => scanner.restoreFlag(flag.id, document?.savedId)} className="text-[11px] text-red-600 dark:text-red-400 hover:text-red-700 font-medium flex items-center gap-1">
                                  <Eye size={12} /> Restore
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add criterion inline */}
                        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700">
                          <div className="flex gap-2">
                            <input type="text" placeholder="Add something to look for..." value={newCriterionLabel} onChange={(e) => setNewCriterionLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddCriterion()} className="flex-1 h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400" />
                            <Button onClick={handleAddCriterion} disabled={!newCriterionLabel.trim()} size="sm" className="rounded-lg h-9 bg-red-500 hover:bg-red-600">
                              <Plus size={14} />
                            </Button>
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Add criteria, then re-scan to find new flags.</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── LIBRARY TAB ─── */}
          {activeTab === "library" && (
            <div>
              {/* Filters */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search documents..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} className="w-full h-10 pl-10 pr-4 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400" />
                </div>
                <div className="flex items-center gap-2">
                  {(["all", "RFP", "Proposal"] as const).map((type) => (
                    <button key={type} onClick={() => setLibraryTypeFilter(type)} className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${libraryTypeFilter === type ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                      {type === "all" ? "All" : type}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">{libraryTotal} documents</span>
              </div>

              {/* Loading */}
              {libraryLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 size={40} className="text-red-500 animate-spin mb-4" />
                  <p className="text-slate-500">Loading documents...</p>
                </div>
              ) : libraryDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6">
                    <FolderOpen size={40} className="text-slate-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No documents yet</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-6 text-center max-w-md">
                    {librarySearch || libraryTypeFilter !== "all" ? "No documents match your filters." : "Upload and scan RFPs or proposals to build your library."}
                  </p>
                  <Button onClick={() => setActiveTab("scan")} className="rounded-xl" style={{ background: "linear-gradient(135deg, #FF3B30 0%, #C5221F 100%)" }}>
                    <ScanLine size={16} className="mr-2" /> Scan a Document
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {libraryDocs.map((doc) => (
                    <Card key={doc.id} className="rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 hover:border-red-200 dark:hover:border-red-700 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleOpenDoc(doc)}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-red-50 dark:group-hover:bg-red-900/20 transition-colors">
                            <FileText size={24} className="text-slate-500 dark:text-slate-400 group-hover:text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-slate-900 dark:text-white truncate">{doc.name}</h3>
                              <Badge className={`text-xs ${doc.type === "RFP" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"}`}>{doc.type}</Badge>
                              {doc.scanResults && doc.scanResults.length > 0 && (
                                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-xs">
                                  {doc.scanResults.filter((f: ScanFlag) => !f.dismissed).length} flags
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1"><FileText size={12} /> {doc.originalFilename}</span>
                              {doc.pageCount && <span>{doc.pageCount} pages</span>}
                              {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                              <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(doc.createdAt)}</span>
                              {doc.uploaderName && <span className="text-slate-400 dark:text-slate-500">by {doc.uploaderName}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenDoc(doc) }}>
                              <Eye size={16} className="text-slate-500" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(doc.id) }} disabled={deletingId === doc.id}>
                                {deletingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
