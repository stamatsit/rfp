import { useState, useRef, useEffect } from "react"
import {
  Plus, Copy, Trash2, ChevronUp, ChevronDown, MessageSquare, Download, Loader2,
  Undo2, Redo2, Presentation,
} from "lucide-react"
import type { UseDeckStoreReturn } from "@/hooks/useDeckStore"

interface DeckToolbarProps {
  deck: UseDeckStoreReturn
  onAddSlide: () => void
  onExport: () => void
  exporting: boolean
}

export function DeckToolbar({ deck, onAddSlide, onExport, exporting }: DeckToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-3 h-11 border-b border-slate-200/60 dark:border-slate-700/50 bg-white dark:bg-slate-900">
      {/* Deck icon + title */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <Presentation className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
        </div>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={deck.deckTitle}
            onChange={(e) => deck.setDeckTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
            className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 bg-transparent border-b border-blue-400 outline-none w-48"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[200px]"
            title="Click to rename"
          >
            {deck.deckTitle}
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200/60 dark:bg-slate-700/50 mx-1" />

      {/* Undo / Redo */}
      <ToolbarButton icon={Undo2} title="Undo (Cmd+Z)" onClick={deck.undo} disabled={!deck.canUndo} />
      <ToolbarButton icon={Redo2} title="Redo (Cmd+Shift+Z)" onClick={deck.redo} disabled={!deck.canRedo} />

      <div className="w-px h-5 bg-slate-200/60 dark:bg-slate-700/50 mx-1" />

      {/* Slide operations */}
      <ToolbarButton icon={Plus} title="Add slide" onClick={onAddSlide} />
      <ToolbarButton icon={Copy} title="Duplicate slide (Cmd+D)" onClick={() => deck.duplicateSlide(deck.selectedIndex)} />
      <ToolbarButton icon={Trash2} title="Delete slide" onClick={() => deck.deleteSlide(deck.selectedIndex)} disabled={deck.slides.length <= 1} />

      <div className="w-px h-5 bg-slate-200/60 dark:bg-slate-700/50 mx-1" />

      {/* Move */}
      <ToolbarButton icon={ChevronUp} title="Move up (Cmd+Up)" onClick={() => deck.moveSlideUp(deck.selectedIndex)} disabled={deck.selectedIndex <= 0} />
      <ToolbarButton icon={ChevronDown} title="Move down (Cmd+Down)" onClick={() => deck.moveSlideDown(deck.selectedIndex)} disabled={deck.selectedIndex >= deck.slides.length - 1} />

      <div className="w-px h-5 bg-slate-200/60 dark:bg-slate-700/50 mx-1" />

      {/* Notes toggle */}
      <ToolbarButton
        icon={MessageSquare}
        title="Speaker notes"
        onClick={deck.toggleNotes}
        active={deck.showNotes}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Slide count */}
      <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-2 tabular-nums">
        {deck.selectedIndex + 1} / {deck.slides.length}
      </span>

      {/* Export */}
      <button
        onClick={onExport}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                   bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50
                   transition-colors shadow-sm shadow-blue-600/20"
      >
        {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
        {exporting ? "Exporting..." : "Export .pptx"}
      </button>
    </div>
  )
}

// ── Toolbar Button ───────────────────────────────────────────

function ToolbarButton({ icon: Icon, title, onClick, disabled, active }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150
        ${disabled
          ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
          : active
            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
