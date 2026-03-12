import { X, Type, List, Columns2, ImageIcon, BarChart3, GitCompareArrows, Quote, SeparatorHorizontal, Flag } from "lucide-react"
import type { PitchDeckSlide } from "@/types/deck"

const SLIDE_TYPES: Array<{ type: PitchDeckSlide["type"]; label: string; icon: React.ComponentType<{ className?: string }> ; description: string }> = [
  { type: "title", label: "Title", icon: Type, description: "Bold title with subtitle" },
  { type: "content", label: "Content", icon: List, description: "Title with bullet points" },
  { type: "two-column", label: "Two Column", icon: Columns2, description: "Side-by-side comparison" },
  { type: "image-text", label: "Image + Text", icon: ImageIcon, description: "Image placeholder with text" },
  { type: "chart", label: "Chart", icon: BarChart3, description: "Data visualization" },
  { type: "comparison", label: "Comparison", icon: GitCompareArrows, description: "Feature comparison table" },
  { type: "quote", label: "Quote", icon: Quote, description: "Client testimonial" },
  { type: "section-divider", label: "Section", icon: SeparatorHorizontal, description: "Section divider" },
  { type: "closing", label: "Closing", icon: Flag, description: "Call to action" },
]

interface SlideTypePickerDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (type: PitchDeckSlide["type"]) => void
}

export function SlideTypePickerDialog({ open, onClose, onSelect }: SlideTypePickerDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_16px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)] w-[380px] overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100/80 dark:border-slate-700/50">
          <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Add Slide</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
        <div className="p-2 grid grid-cols-3 gap-1.5">
          {SLIDE_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => { onSelect(type); onClose() }}
              className="group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-transparent
                         hover:border-blue-200/60 dark:hover:border-blue-700/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20
                         transition-all duration-150"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700/60 flex items-center justify-center group-hover:bg-blue-100/80 dark:group-hover:bg-blue-800/40 transition-colors">
                <Icon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
