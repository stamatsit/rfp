import { Loader2, Check, Circle } from "lucide-react"
import type { StudioMode, SaveStatus } from "@/types/studio"

interface StudioToolbarProps {
  mode: StudioMode
  onModeChange: (mode: StudioMode) => void
  title: string
  onTitleChange: (title: string) => void
  saveStatus: SaveStatus
  onExportPDF?: () => void
  onExportWord?: () => void
}

const modes: { id: StudioMode; label: string }[] = [
  { id: "briefing", label: "Brief Me" },
  { id: "editor", label: "Editor" },
  { id: "review", label: "Review" },
]

export function StudioToolbar({
  mode,
  onModeChange,
  title,
  onTitleChange,
  saveStatus,
  onExportPDF,
  onExportWord,
}: StudioToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Mode Tabs */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === m.id
                ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

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
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 border-none outline-none focus:ring-0 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-slate-50 dark:focus:bg-slate-800 transition-colors"
        placeholder="Document title..."
      />

      {/* Save Status */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 min-w-[120px] justify-end">
        {saveStatus === "saving" && (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Saving...</span>
          </>
        )}
        {saveStatus === "saved" && (
          <>
            <Check className="w-3 h-3 text-emerald-500" />
            <span>All changes saved</span>
          </>
        )}
        {saveStatus === "unsaved" && (
          <>
            <Circle className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>Unsaved</span>
          </>
        )}
        {saveStatus === "error" && (
          <>
            <Circle className="w-3 h-3 fill-red-400 text-red-400" />
            <span>Save failed</span>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

      {/* Export Buttons */}
      <button
        onClick={onExportPDF}
        disabled={!onExportPDF}
        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        PDF
      </button>
      <button
        onClick={onExportWord}
        disabled={!onExportWord}
        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Word
      </button>
    </div>
  )
}
