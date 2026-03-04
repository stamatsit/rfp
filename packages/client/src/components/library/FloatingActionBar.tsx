import { X, Wand2, Download } from "lucide-react"
import { Button } from "@/components/ui"

interface FloatingActionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onAdapt: () => void
  onExport: () => void
  onClear: () => void
}

export function FloatingActionBar({
  selectedCount, totalCount,
  onSelectAll, onAdapt, onExport, onClear,
}: FloatingActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900/90 dark:bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)] border border-white/10 dark:border-slate-200/20">
      <span className="text-sm font-medium text-white dark:text-slate-900">
        {selectedCount} selected
      </span>
      <div className="w-px h-5 bg-slate-600 dark:bg-slate-300" />
      <button
        onClick={onSelectAll}
        className="text-slate-300 dark:text-slate-600 hover:text-white dark:hover:text-slate-900 text-[12px] font-medium transition-colors duration-150"
      >
        Select all ({totalCount})
      </button>
      <Button
        size="sm"
        onClick={onAdapt}
        className="h-8 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12px] active:scale-[0.98] transition-all duration-150"
        disabled={selectedCount > 20}
        title={selectedCount > 20 ? "Select up to 20 for bulk adapt" : undefined}
      >
        <Wand2 size={13} className="mr-1.5" /> Adapt
      </Button>
      <Button
        size="sm"
        onClick={onExport}
        className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] active:scale-[0.98] transition-all duration-150"
      >
        <Download size={13} className="mr-1.5" /> Export
      </Button>
      <button onClick={onClear} className="ml-1 text-slate-400 hover:text-white dark:hover:text-slate-700 transition-colors duration-150">
        <X size={16} />
      </button>
    </div>
  )
}
