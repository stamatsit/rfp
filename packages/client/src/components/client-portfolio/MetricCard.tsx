import { TrendingUp, TrendingDown } from "lucide-react"

export function MetricCard({ metric, result, direction }: { metric: string; result: string; direction: "increase" | "decrease" }) {
  const isIncrease = direction === "increase"
  const Icon = isIncrease ? TrendingUp : TrendingDown
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-200/60 dark:border-slate-700/40">
      <div className={`flex items-center gap-1 text-sm font-semibold mb-0.5 ${isIncrease ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
        <Icon size={13} strokeWidth={2.5} />
        {result}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{metric}</div>
    </div>
  )
}
