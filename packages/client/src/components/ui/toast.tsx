import { useToasts, type Toast } from "@/hooks/useToast"
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "lucide-react"

const variantStyles: Record<Toast["variant"], { bg: string; border: string; icon: typeof CheckCircle; iconColor: string }> = {
  success: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle,
    iconColor: "text-emerald-500",
  },
  error: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-red-200 dark:border-red-800",
    icon: AlertCircle,
    iconColor: "text-red-500",
  },
  warning: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  info: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-blue-200 dark:border-blue-800",
    icon: Info,
    iconColor: "text-blue-500",
  },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = variantStyles[toast.variant]
  const Icon = style.icon

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg} ${style.border} shadow-lg shadow-black/10 dark:shadow-black/30 animate-slide-in-right`}
      style={{ minWidth: 280, maxWidth: 400 }}
    >
      <Icon size={18} className={`${style.iconColor} flex-shrink-0`} />
      <p className="flex-1 text-[13px] text-slate-700 dark:text-slate-200">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}
