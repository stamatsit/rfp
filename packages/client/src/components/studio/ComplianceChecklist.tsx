import { useState, useCallback } from "react"
import { X, CheckCircle2, AlertTriangle, XCircle, Loader2, ClipboardCheck, RefreshCw } from "lucide-react"
import { studioApi } from "@/lib/api"

interface ChecklistItem {
  id: string
  category: string
  requirement: string
  priority: "high" | "medium" | "low"
}

interface ComplianceResult {
  id: string
  status: "met" | "partial" | "missing"
  note: string
}

interface ComplianceChecklistProps {
  rfpText: string
  documentContent: string
  isOpen: boolean
  onClose: () => void
}

const priorityColors = {
  high: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  low: "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800",
}

const statusIcons = {
  met: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  partial: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  missing: <XCircle className="w-4 h-4 text-red-500" />,
}

export function ComplianceChecklist({ rfpText, documentContent, isOpen, onClose }: ComplianceChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [results, setResults] = useState<Map<string, ComplianceResult>>(new Map())
  const [isGenerating, setIsGenerating] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setResults(new Map())
    try {
      const response = await studioApi.generateChecklist(rfpText)
      setItems(response.items)
    } catch (err) {
      console.error("Checklist generation failed:", err)
    } finally {
      setIsGenerating(false)
    }
  }, [rfpText])

  const handleCheck = useCallback(async () => {
    if (items.length === 0) return
    setIsChecking(true)
    try {
      const response = await studioApi.checkCompliance(documentContent, items)
      const map = new Map<string, ComplianceResult>()
      for (const r of response.results) {
        map.set(r.id, r)
      }
      setResults(map)
    } catch (err) {
      console.error("Compliance check failed:", err)
    } finally {
      setIsChecking(false)
    }
  }, [documentContent, items])

  if (!isOpen) return null

  // Group items by category
  const grouped = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category]!.push(item)
    return acc
  }, {})

  // Progress stats
  const metCount = Array.from(results.values()).filter((r) => r.status === "met").length
  const partialCount = Array.from(results.values()).filter((r) => r.status === "partial").length
  const totalChecked = results.size
  const progressPct = items.length > 0 ? Math.round((metCount / items.length) * 100) : 0

  return (
    <div className="w-72 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            RFP Checklist
          </span>
          {items.length > 0 && (
            <span className="text-[9px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 tabular-nums">
              {items.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Progress bar — segmented */}
      {items.length > 0 && totalChecked > 0 && (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-[9px] mb-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />{metCount} met</span>
              <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />{partialCount} partial</span>
              <span className="flex items-center gap-1 text-red-500 dark:text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />{items.length - metCount - partialCount} missing</span>
            </div>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(metCount / items.length) * 100}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${(partialCount / items.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md border border-emerald-200 dark:border-emerald-700 transition-colors disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
          {items.length > 0 ? "Regenerate" : "Generate"}
        </button>
        {items.length > 0 && (
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
          >
            {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Check
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto py-2">
        {items.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-[170px]">
              Click "Generate" to extract RFP requirements automatically
            </p>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Analyzing RFP…</span>
          </div>
        )}

        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category} className="mb-1">
            <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
              <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{category}</span>
              <span className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>
            {categoryItems.map((item) => {
              const result = results.get(item.id)
              return (
                <div
                  key={item.id}
                  className={`px-3 py-2 transition-colors ${result?.status === "met" ? "hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {result ? statusIcons[result.status] : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] leading-relaxed ${result?.status === "met" ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}`}>
                        {item.requirement}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded ${priorityColors[item.priority]}`}>
                          {item.priority}
                        </span>
                        {result?.note && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed truncate">
                            {result.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
