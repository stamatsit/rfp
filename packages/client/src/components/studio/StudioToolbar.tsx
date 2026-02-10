import {
  Loader2, Check, Circle, AlertCircle, MessageSquareText,
  FileDown, Share2, PanelRight,
} from "lucide-react"
import type { StudioMode, SaveStatus } from "@/types/studio"

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
  hasDocumentId?: boolean
}

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
  hasDocumentId,
}: StudioToolbarProps) {
  const isReview = mode === "review"

  return (
    <div className="flex items-center h-11 px-4 gap-3 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex-shrink-0">
      {/* Document Title */}
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
        className="min-w-[140px] max-w-[400px] bg-transparent text-[15px] font-semibold text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 px-2 py-1 rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-slate-100/60 dark:focus:bg-slate-800/60 transition-colors tracking-[-0.01em]"
        placeholder="Untitled"
      />

      {/* Save status pill */}
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
        saveStatus === "saving" ? "text-slate-400 dark:text-slate-500" :
        saveStatus === "saved" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20" :
        saveStatus === "unsaved" ? "text-amber-600 dark:text-amber-400" :
        "text-red-600 dark:text-red-400"
      }`}>
        {saveStatus === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
        {saveStatus === "saved" && <Check className="w-3 h-3" />}
        {saveStatus === "unsaved" && <Circle className="w-1.5 h-1.5 fill-current" />}
        {saveStatus === "error" && <AlertCircle className="w-3 h-3" />}
        <span>{saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : saveStatus === "unsaved" ? "Edited" : "Error"}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side actions */}
      <div className="flex items-center gap-0.5">
        {/* Review toggle */}
        <button
          onClick={() => onModeChange(isReview ? "editor" : "review")}
          className={`flex items-center gap-1.5 px-3 h-7 text-[12px] font-medium rounded-lg transition-all duration-150 ${
            isReview
              ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-700/40"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          title="Review mode (⌘⇧R)"
        >
          <MessageSquareText className="w-3.5 h-3.5" />
          Review
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 h-7 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title="Export document"
        >
          <FileDown className="w-3.5 h-3.5" />
          Export
        </button>

        {/* Share */}
        {hasDocumentId && onShare && (
          <button
            onClick={onShare}
            className="w-7 h-7 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Share document"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200/60 dark:bg-slate-700/60 mx-1" />

        {/* Inspector toggle */}
        {onToggleInspector && (
          <button
            onClick={onToggleInspector}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 ${
              inspectorOpen
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-700/40"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title="Toggle inspector panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
