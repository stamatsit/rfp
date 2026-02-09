import { X, Check, AlertTriangle, Lightbulb, AlertCircle } from "lucide-react"
import type { ReviewAnnotation } from "@/types/chat"

interface CommentPopoverProps {
  annotation: ReviewAnnotation
  position: { top: number; left: number }
  onResolve: (id: string) => void
  onApplyFix: (id: string) => void
  onClose: () => void
}

const severityConfig = {
  suggestion: {
    icon: Lightbulb,
    label: "Suggestion",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-700",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/30",
    border: "border-orange-200 dark:border-orange-700",
  },
  issue: {
    icon: AlertCircle,
    label: "Issue",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-700",
  },
}

export function CommentPopover({ annotation, position, onResolve, onApplyFix, onClose }: CommentPopoverProps) {
  const config = severityConfig[annotation.severity] || severityConfig.suggestion
  const Icon = config.icon

  return (
    <div
      className="fixed z-50 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 animate-fade-in-up"
      style={{ top: position.top + 8, left: Math.min(position.left, window.innerWidth - 300) }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${config.bg} border-b ${config.border}`}>
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
          <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
        </div>
        <button onClick={onClose} className="p-0.5 hover:bg-black/5 dark:hover:bg-white/5 rounded">
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Comment */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {annotation.comment}
        </p>

        {annotation.suggestedFix && (
          <div className="mt-2 px-2.5 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-md">
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Suggested fix:</p>
            <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
              {annotation.suggestedFix}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={() => onResolve(annotation.id)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
        >
          <Check className="w-3 h-3" />
          Resolve
        </button>
        {annotation.suggestedFix && (
          <button
            onClick={() => onApplyFix(annotation.id)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md border border-emerald-200 dark:border-emerald-700 transition-colors"
          >
            Apply Fix
          </button>
        )}
      </div>
    </div>
  )
}
