import type React from "react"

export function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-slate-400 dark:text-slate-500" />
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{title}</h3>
      <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{count}</span>
    </div>
  )
}
