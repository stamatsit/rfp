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
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
            RFP Checklist
          </span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Progress bar */}
      {items.length > 0 && totalChecked > 0 && (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            <span>{metCount} met / {partialCount} partial / {items.length - metCount - partialCount} missing</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
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
          <p className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">
            Click "Generate" to extract requirements from the uploaded RFP.
          </p>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            <span className="ml-2 text-xs text-slate-500">Analyzing RFP...</span>
          </div>
        )}

        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category} className="mb-3">
            <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {category}
            </div>
            {categoryItems.map((item) => {
              const result = results.get(item.id)
              return (
                <div
                  key={item.id}
                  className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {result ? statusIcons[result.status] : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.requirement}
                      </p>
                      <span className={`inline-block mt-1 px-1.5 py-0.5 text-[9px] font-semibold rounded ${priorityColors[item.priority]}`}>
                        {item.priority}
                      </span>
                      {result?.note && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {result.note}
                        </p>
                      )}
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
