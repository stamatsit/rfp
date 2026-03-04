import { useState, useRef, useEffect, useCallback } from "react"
import {
  Loader2, Check, Circle, AlertCircle, MessageSquareText,
  FileDown, Share2, PanelRight, FolderOpen, Search, Plus, Trash2,
  FileText, Sparkles, MessageSquare, PenLine, Wand2,
} from "lucide-react"
import type { StudioMode, SaveStatus } from "@/types/studio"
import { studioApi } from "@/lib/api"

// ── Helpers ──────────────────────────────────────────────

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

const SOURCE_ICONS: Record<string, typeof FileText> = {
  manual: PenLine,
  "ai-generated": Sparkles,
  review: MessageSquare,
  briefing: FileText,
}

// ── Types ────────────────────────────────────────────────

interface StudioDocument {
  id: string
  title: string
  mode: string
  sourceType: string
  updatedAt: string
  createdAt: string
}

interface StudioToolbarProps {
  mode: StudioMode
  onModeChange: (mode: StudioMode) => void
  title: string
  onTitleChange: (title: string) => void
  saveStatus: SaveStatus
  onExport?: () => void
  onShare?: () => void
  onToggleInspector?: () => void
  inspectorOpen?: boolean
  onToggleHumanizer?: () => void
  humanizerOpen?: boolean
  hasDocumentId?: boolean
  onNewDocument?: () => void
  onOpenDocument?: (id: string) => void
  currentDocumentId?: string | null
  browserOpen?: boolean
  onToggleBrowser?: () => void
}

// ── Document Browser Popover ─────────────────────────────

function DocumentBrowserPopover({
  currentDocumentId,
  onOpenDocument,
  onNewDocument,
  onClose,
}: {
  currentDocumentId: string | null
  onOpenDocument: (id: string) => void
  onNewDocument: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [documents, setDocuments] = useState<StudioDocument[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Fetch documents
  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await studioApi.listDocuments(search ? { search } : undefined)
      setDocuments(data as StudioDocument[])
    } catch {
      // ignore
    }
    setLoading(false)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(fetchDocs, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchDocs, search])

  const handleDelete = async (id: string) => {
    try {
      await studioApi.deleteDocument(id)
      setDocuments((prev) => prev.filter((d) => d.id !== id))
      setConfirmDelete(null)
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 animate-fade-in-up"
    >
      <div className="w-[340px] bg-white dark:bg-slate-800 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden">
        {/* Search + New */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400"
                autoFocus
              />
            </div>
            <button
              onClick={() => { onNewDocument(); onClose() }}
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors whitespace-nowrap"
              title="New document"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>

        {/* Document list */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {search ? "No documents match your search" : "No saved documents yet"}
              </p>
            </div>
          ) : (
            <div className="p-1">
              {documents.map((doc) => {
                const isActive = doc.id === currentDocumentId
                const SourceIcon = SOURCE_ICONS[doc.sourceType] || FileText

                return (
                  <div
                    key={doc.id}
                    className={`group relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isActive
                        ? "bg-emerald-50 dark:bg-emerald-900/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => {
                      if (!isActive) {
                        onOpenDocument(doc.id)
                        onClose()
                      }
                    }}
                  >
                    {/* Source icon */}
                    <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${
                      isActive
                        ? "bg-emerald-100 dark:bg-emerald-800/40 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500"
                    }`}>
                      <SourceIcon className="w-2.5 h-2.5" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-medium truncate ${
                        isActive
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}>
                        {doc.title || "Untitled"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {timeAgo(doc.updatedAt)}
                        </span>
                        {doc.mode === "final" && (
                          <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                            Final
                          </span>
                        )}
                        {doc.mode === "draft" && (
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded-full">
                            Draft
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    {confirmDelete === doc.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => void handleDelete(doc.id)}
                          className="text-[9px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-1.5 py-0.5 rounded transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1 py-0.5 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(doc.id) }}
                        className="flex-shrink-0 p-1 rounded-md text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        title="Delete document"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {documents.length > 0 && (
          <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-700/60">
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center">
              {documents.length} document{documents.length !== 1 ? "s" : ""} · ⌘O to toggle
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Toolbar ─────────────────────────────────────────

export function StudioToolbar({
  mode,
  onModeChange,
  title,
  onTitleChange,
  saveStatus,
  onExport,
  onShare,
  onToggleInspector,
  inspectorOpen,
  onToggleHumanizer,
  humanizerOpen,
  hasDocumentId,
  onNewDocument,
  onOpenDocument,
  currentDocumentId,
  browserOpen,
  onToggleBrowser,
}: StudioToolbarProps) {
  const isReview = mode === "review"

  return (
    <div className={`relative z-50 flex items-center h-12 px-4 gap-2 flex-shrink-0 transition-colors duration-150 ${
      isReview
        ? "bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200/40 dark:border-amber-800/30"
        : "bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/40 dark:border-slate-800/50"
    } backdrop-blur-xl`}>
      {/* Documents browser button */}
      {onToggleBrowser && (
        <div className="relative">
          <button
            onClick={onToggleBrowser}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150 ${
              browserOpen
                ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            }`}
            title="Browse documents (⌘O)"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          {browserOpen && onOpenDocument && onNewDocument && (
            <DocumentBrowserPopover
              currentDocumentId={currentDocumentId ?? null}
              onOpenDocument={onOpenDocument}
              onNewDocument={onNewDocument}
              onClose={onToggleBrowser}
            />
          )}
        </div>
      )}

      {/* Divider */}
      {onToggleBrowser && (
        <div className="w-px h-5 bg-slate-200/40 dark:bg-slate-700/40" />
      )}

      {/* Document Title — Notion-style inline rename */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onBlur={(e) => {
          if (!e.target.value.trim()) onTitleChange("Untitled")
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        className={`min-w-[120px] max-w-[400px] bg-transparent text-[14px] font-medium border-none outline-none focus:ring-0 px-1.5 py-1 rounded-md transition-all duration-150 tracking-[-0.01em] border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-400/50 dark:focus:border-emerald-500/50 focus:font-semibold ${
          isReview
            ? "text-amber-800 dark:text-amber-200"
            : "text-slate-800 dark:text-slate-100"
        }`}
        placeholder="Untitled"
      />

      {/* Save status — icon only with tooltip */}
      <div className={`flex items-center gap-1 px-1 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 select-none ${
        saveStatus === "saving" ? "text-slate-400 dark:text-slate-500" :
        saveStatus === "saved" ? "text-emerald-500/60 dark:text-emerald-400/60" :
        saveStatus === "unsaved" ? "text-amber-500/70 dark:text-amber-400/70" :
        "text-red-500 dark:text-red-400"
      }`} title={
        saveStatus === "saving" ? "Saving… (⌘S)" :
        saveStatus === "saved" ? "All changes saved" :
        saveStatus === "unsaved" ? "Unsaved changes — ⌘S to save" :
        "Save error — try ⌘S"
      }>
        {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {saveStatus === "saved" && <Check className="w-3.5 h-3.5" />}
        {saveStatus === "unsaved" && <Circle className="w-2 h-2 fill-current" />}
        {saveStatus === "error" && <AlertCircle className="w-3.5 h-3.5" />}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side actions */}
      <div className="flex items-center gap-1">
        {/* Review toggle */}
        <button
          onClick={() => onModeChange(isReview ? "editor" : "review")}
          className={`flex items-center gap-1.5 px-3 h-8 text-[12px] font-medium rounded-lg transition-all duration-150 ${
            isReview
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-700/40"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
          title={isReview ? "Exit review mode" : "Enter review mode (⌘⇧R)"}
        >
          <MessageSquareText className="w-3.5 h-3.5" />
          {isReview ? "Reviewing" : "Review"}
        </button>

        <div className="w-px h-5 bg-slate-200/40 dark:bg-slate-700/40 mx-0.5" />

        {/* Export */}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 h-8 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-100 rounded-lg transition-all duration-150"
          title="Export document (⌘E)"
        >
          <FileDown className="w-3.5 h-3.5" />
          Export
        </button>

        {/* Share */}
        {hasDocumentId && onShare && (
          <button
            onClick={onShare}
            className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-150"
            title="Share document"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-5 bg-slate-200/40 dark:bg-slate-700/40 mx-0.5" />

        {/* Humanizer toggle */}
        {onToggleHumanizer && (
          <button
            onClick={onToggleHumanizer}
            className={`flex items-center gap-1.5 px-3 h-8 text-[12px] font-medium rounded-lg transition-all duration-150 ${
              humanizerOpen
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200/60 dark:ring-violet-700/40"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
            title="Humanize document — detect and reduce AI patterns"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Humanize
          </button>
        )}

        {/* Inspector toggle */}
        {onToggleInspector && (
          <button
            onClick={onToggleInspector}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150 ${
              inspectorOpen
                ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            }`}
            title="Inspector — format, outline, checklist"
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
