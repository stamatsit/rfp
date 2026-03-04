import { useState } from "react"
import {
  Wand2,
  Copy,
  Check,
  Loader2,
  Download,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Label,
  Textarea,
} from "@/components/ui"
import {
  aiApi,
  type AnswerResponse,
  type AdaptationType,
  type AIAdaptResponse,
} from "@/lib/api"

interface BulkAdaptPanelProps {
  open: boolean
  onClose: () => void
  selectedAnswers: AnswerResponse[]
  onExportAdapted?: (results: Array<AIAdaptResponse & { id: string }>) => void
}

type PanelView = "configure" | "processing" | "results"

const ADAPT_TYPES: { value: AdaptationType; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "shorten", label: "Shorten" },
  { value: "expand", label: "Expand" },
  { value: "bullets", label: "Bullets" },
  { value: "custom", label: "Custom" },
]

export function BulkAdaptPanel({ open, onClose, selectedAnswers, onExportAdapted }: BulkAdaptPanelProps) {
  const [view, setView] = useState<PanelView>("configure")
  const [adaptationType, setAdaptationType] = useState<AdaptationType>("formal")
  const [clientName, setClientName] = useState("")
  const [industry, setIndustry] = useState("")
  const [customInstruction, setCustomInstruction] = useState("")
  const [targetWordCount, setTargetWordCount] = useState(100)
  const [results, setResults] = useState<Array<AIAdaptResponse & { id: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null)

  const handleAdapt = async () => {
    setView("processing")
    setError(null)
    try {
      const resp = await aiApi.adaptBulk({
        items: selectedAnswers.map(a => ({ id: a.id, content: a.answer })),
        adaptationType,
        customInstruction: adaptationType === "custom" ? customInstruction : undefined,
        targetWordCount: adaptationType === "shorten" ? targetWordCount : undefined,
        clientName: clientName || undefined,
        industry: industry || undefined,
      })
      setResults(resp.results)
      setView("results")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adaptation failed")
      setView("configure")
    }
  }

  const handleCopyOne = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCopyAll = async () => {
    const successful = results.filter(r => !r.refused && r.adaptedContent)
    const text = successful.map(r => {
      const answer = selectedAnswers.find(a => a.id === r.id)
      return `Q: ${answer?.question || ""}\n\n${r.adaptedContent}`
    }).join("\n\n---\n\n")
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const handleClose = () => {
    setView("configure")
    setResults([])
    setError(null)
    onClose()
  }

  const successCount = results.filter(r => !r.refused).length

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Wand2 size={16} className="text-blue-500" />
            {view === "results" ? "Adapted Content" : `Adapt ${selectedAnswers.length} Answer${selectedAnswers.length > 1 ? "s" : ""}`}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            {view === "configure" && "Choose how to adapt the selected answers."}
            {view === "processing" && "Adapting content..."}
            {view === "results" && `${successCount} of ${results.length} adapted successfully`}
          </DialogDescription>
        </DialogHeader>

        {/* Configure View */}
        {view === "configure" && (
          <div className="space-y-4 py-2">
            {/* Adaptation type pills */}
            <div>
              <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-2 block">Adaptation Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {ADAPT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setAdaptationType(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      adaptationType === t.value
                        ? "bg-blue-500 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shorten word count */}
            {adaptationType === "shorten" && (
              <div>
                <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Target word count (per answer)</Label>
                <Input
                  type="number"
                  value={targetWordCount}
                  onChange={e => setTargetWordCount(parseInt(e.target.value) || 100)}
                  className="w-32 h-8 text-[13px]"
                  min={20}
                  max={500}
                />
              </div>
            )}

            {/* Custom instruction */}
            {adaptationType === "custom" && (
              <div>
                <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Custom instruction</Label>
                <Textarea
                  value={customInstruction}
                  onChange={e => setCustomInstruction(e.target.value)}
                  placeholder="e.g., Rewrite for a healthcare audience with emphasis on ROI..."
                  className="text-[13px] min-h-[80px] resize-none"
                />
              </div>
            )}

            {/* Context fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Client name (optional)</Label>
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g., Iowa State University"
                  className="h-8 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Industry (optional)</Label>
                <Input
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  placeholder="e.g., Higher Education"
                  className="h-8 text-[13px]"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[12px]">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Preview of what will be adapted */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">
                {selectedAnswers.length} answers to adapt:
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedAnswers.slice(0, 10).map(a => (
                  <p key={a.id} className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
                    {a.question}
                  </p>
                ))}
                {selectedAnswers.length > 10 && (
                  <p className="text-[11px] text-slate-400">+{selectedAnswers.length - 10} more</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="h-9 rounded-lg text-[13px]">
                Cancel
              </Button>
              <Button
                onClick={handleAdapt}
                className="h-9 rounded-lg text-[13px] bg-blue-500 hover:bg-blue-600 text-white"
                disabled={adaptationType === "custom" && !customInstruction.trim()}
              >
                <Wand2 size={14} className="mr-1.5" />
                Adapt {selectedAnswers.length} Answer{selectedAnswers.length > 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* Processing View */}
        {view === "processing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Adapting {selectedAnswers.length} answers...
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              This may take a moment
            </p>
          </div>
        )}

        {/* Results View */}
        {view === "results" && (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
              {results.map(result => {
                const answer = selectedAnswers.find(a => a.id === result.id)
                const isExpanded = expandedResultId === result.id

                if (result.refused) {
                  return (
                    <div key={result.id} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
                      <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400 line-clamp-1 mb-1">
                        {answer?.question || "Unknown"}
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1">
                        <AlertCircle size={11} />
                        {result.refusalReason || "Failed to adapt"}
                      </p>
                    </div>
                  )
                }

                return (
                  <div key={result.id} className="p-3 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <button
                        onClick={() => setExpandedResultId(isExpanded ? null : result.id)}
                        className="flex items-center gap-1 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left min-w-0"
                      >
                        {isExpanded ? <ChevronUp size={11} className="flex-shrink-0" /> : <ChevronDown size={11} className="flex-shrink-0" />}
                        <span className="line-clamp-1">{answer?.question || "Unknown"}</span>
                      </button>
                      <button
                        onClick={() => handleCopyOne(result.adaptedContent, result.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                      >
                        {copiedId === result.id
                          ? <><Check size={10} className="text-emerald-500" /> Copied</>
                          : <><Copy size={10} /> Copy</>
                        }
                      </button>
                    </div>
                    <p className={`text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                      {result.adaptedContent}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Bottom actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
              <Button
                onClick={handleCopyAll}
                variant="outline"
                className="h-9 rounded-lg text-[13px]"
              >
                {copiedAll
                  ? <><Check size={14} className="mr-1.5 text-emerald-500" /> Copied All</>
                  : <><Copy size={14} className="mr-1.5" /> Copy All ({successCount})</>
                }
              </Button>
              {onExportAdapted && (
                <Button
                  onClick={() => onExportAdapted(results.filter(r => !r.refused))}
                  variant="outline"
                  className="h-9 rounded-lg text-[13px]"
                >
                  <Download size={14} className="mr-1.5" /> Export These
                </Button>
              )}
              <div className="flex-1" />
              <Button onClick={handleClose} className="h-9 rounded-lg text-[13px]">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
