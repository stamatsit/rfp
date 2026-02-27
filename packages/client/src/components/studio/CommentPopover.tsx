import { useState, useEffect, useRef } from "react"
import { X, Check, AlertTriangle, Lightbulb, AlertCircle, ChevronLeft, ChevronRight, Pencil, CornerDownLeft } from "lucide-react"
import type { ReviewAnnotation } from "@/types/chat"

interface CommentPopoverProps {
  annotation: ReviewAnnotation
  position: { top: number; left: number }
  // Navigation: if passed, enables prev/next between annotations
  totalCount?: number
  currentIndex?: number
  onNavigate?: (direction: "prev" | "next") => void
  onResolve: (id: string) => void
  onApplyFix: (id: string, customFix?: string) => void
  onClose: () => void
}

const severityConfig = {
  suggestion: {
    icon: Lightbulb,
    label: "Suggestion",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-700",
    dot: "bg-amber-400",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/30",
    border: "border-orange-200 dark:border-orange-700",
    dot: "bg-orange-400",
  },
  issue: {
    icon: AlertCircle,
    label: "Issue",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-700",
    dot: "bg-red-400",
  },
}

export function CommentPopover({
  annotation,
  position,
  totalCount,
  currentIndex,
  onNavigate,
  onResolve,
  onApplyFix,
  onClose,
}: CommentPopoverProps) {
  const config = severityConfig[annotation.severity] || severityConfig.suggestion
  const Icon = config.icon
  const [editingFix, setEditingFix] = useState(false)
  const [editedFix, setEditedFix] = useState(annotation.suggestedFix || "")
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Sync editedFix if annotation changes
  useEffect(() => {
    setEditedFix(annotation.suggestedFix || "")
    setEditingFix(false)
  }, [annotation.id, annotation.suggestedFix])

  // Focus edit area
  useEffect(() => {
    if (editingFix) setTimeout(() => editRef.current?.focus(), 40)
  }, [editingFix])

  // Clamp position to viewport
  const POPOVER_WIDTH = 296
  const POPOVER_APPROX_HEIGHT = 200
  const clampedLeft = Math.max(8, Math.min(position.left, window.innerWidth - POPOVER_WIDTH - 8))
  const clampedTop = Math.max(8, Math.min(position.top + 8, window.innerHeight - POPOVER_APPROX_HEIGHT - 8))

  const showNav = onNavigate && totalCount !== undefined && totalCount > 1

  return (
    <div
      className="fixed z-50 bg-white dark:bg-slate-800 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] animate-fade-in-up overflow-hidden"
      style={{ top: clampedTop, left: clampedLeft, width: POPOVER_WIDTH }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${config.bg} border-b ${config.border}`}>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${config.dot} flex-shrink-0 animate-pulse`} />
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
          <span className={`text-[11px] font-semibold ${config.color}`}>{config.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Prev/Next navigation */}
          {showNav && (
            <>
              <span className="text-[9px] text-slate-400 mr-0.5 tabular-nums">
                {(currentIndex ?? 0) + 1}/{totalCount}
              </span>
              <button
                onClick={() => onNavigate("prev")}
                className="w-5 h-5 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="Previous"
              >
                <ChevronLeft className="w-3 h-3 text-slate-400" />
              </button>
              <button
                onClick={() => onNavigate("next")}
                className="w-5 h-5 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="Next"
              >
                <ChevronRight className="w-3 h-3 text-slate-400" />
              </button>
            </>
          )}
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Comment body — constrained height */}
      <div className="px-3 py-2.5 max-h-40 overflow-y-auto">
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {annotation.comment}
        </p>

        {annotation.suggestedFix && (
          <div className="mt-2 px-2.5 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/80 dark:border-emerald-700/60 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Suggested fix</p>
              {!editingFix && (
                <button
                  onClick={() => setEditingFix(true)}
                  className="text-[9px] text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-0.5 transition-colors"
                >
                  <Pencil className="w-2.5 h-2.5" />
                  Edit
                </button>
              )}
            </div>
            {editingFix ? (
              <div className="relative">
                <textarea
                  ref={editRef}
                  value={editedFix}
                  onChange={(e) => setEditedFix(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingFix(false)
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      setEditingFix(false)
                    }
                  }}
                  className="w-full text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed bg-transparent border border-emerald-300 dark:border-emerald-600 rounded-md px-2 py-1 resize-none outline-none focus:ring-1 focus:ring-emerald-400"
                  rows={3}
                />
                <button
                  onClick={() => setEditingFix(false)}
                  className="absolute bottom-1.5 right-1.5 text-emerald-500 hover:text-emerald-700 transition-colors"
                  title="Done (⌘↵)"
                >
                  <CornerDownLeft className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
                {editedFix}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={() => onResolve(annotation.id)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
        >
          <Check className="w-3 h-3" />
          Resolve
        </button>
        {annotation.suggestedFix && (
          <button
            onClick={() => onApplyFix(annotation.id, editingFix ? undefined : editedFix)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-lg shadow-sm transition-all"
          >
            <Check className="w-3 h-3" />
            Apply Fix
          </button>
        )}
      </div>
    </div>
  )
}
