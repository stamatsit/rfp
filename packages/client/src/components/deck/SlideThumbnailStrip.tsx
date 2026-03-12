import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Plus, GripVertical } from "lucide-react"
import { SlideRenderer } from "./slideRenderers"
import type { PitchDeckSlide } from "@/types/deck"

// ── Sortable Thumbnail ───────────────────────────────────────

function SortableThumbnail({ slide, index, isSelected, onSelect }: {
  slide: PitchDeckSlide
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `slide-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-start gap-1.5 cursor-pointer transition-all duration-150 ${isDragging ? "z-10" : ""}`}
      onClick={onSelect}
    >
      {/* Slide number + drag handle */}
      <div className="flex flex-col items-center pt-2 w-5 flex-shrink-0">
        <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">{index + 1}</span>
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-3 h-3 text-slate-300 dark:text-slate-600" />
        </div>
      </div>

      {/* Thumbnail preview */}
      <div
        className={`relative w-full rounded-md overflow-hidden border-2 transition-all duration-150 ${
          isSelected
            ? "border-blue-500 dark:border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.15)] dark:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
            : "border-slate-200/60 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600"
        }`}
        style={{ aspectRatio: "16 / 9" }}
      >
        {/* Scaled-down slide renderer — non-interactive */}
        <div className="w-[640px] h-[360px] origin-top-left" style={{ transform: "scale(0.22)", transformOrigin: "top left" }}>
          <div className="w-full h-full">
            <SlideRenderer slide={slide} onUpdate={() => {}} interactive={false} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Thumbnail Strip ──────────────────────────────────────────

interface SlideThumbnailStripProps {
  slides: PitchDeckSlide[]
  selectedIndex: number
  onSelect: (index: number) => void
  onAddSlide: () => void
}

export function SlideThumbnailStrip({ slides, selectedIndex, onSelect, onAddSlide }: SlideThumbnailStripProps) {
  return (
    <div className="w-44 flex-shrink-0 h-full overflow-y-auto border-r border-slate-200/50 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-900/40 px-2 py-3 space-y-2">
      <SortableContext
        items={slides.map((_, i) => `slide-${i}`)}
        strategy={verticalListSortingStrategy}
      >
        {slides.map((slide, i) => (
          <SortableThumbnail
            key={`slide-${i}`}
            slide={slide}
            index={i}
            isSelected={i === selectedIndex}
            onSelect={() => onSelect(i)}
          />
        ))}
      </SortableContext>

      {/* Add slide button */}
      <button
        onClick={onAddSlide}
        className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 rounded-lg border-2 border-dashed
                   border-slate-200/60 dark:border-slate-700/40 text-slate-400 dark:text-slate-500
                   hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 dark:hover:text-blue-400
                   hover:bg-blue-50/30 dark:hover:bg-blue-900/10
                   transition-all duration-150 text-[10px] font-medium"
      >
        <Plus className="w-3 h-3" />
        Add slide
      </button>
    </div>
  )
}
