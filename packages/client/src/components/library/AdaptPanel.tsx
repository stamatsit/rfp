import { Wand2, Sparkles, Loader2, Copy, Check } from "lucide-react"
import { Button, Input, Textarea, Label } from "@/components/ui"
import type { AdaptationType, AIAdaptResponse } from "@/lib/api"

interface AdaptPanelProps {
  adaptationType: AdaptationType
  onAdaptationTypeChange: (type: AdaptationType) => void
  adaptOptions: {
    customInstruction: string
    targetWordCount: number
    clientName: string
    industry: string
  }
  onAdaptOptionsChange: (opts: AdaptPanelProps["adaptOptions"]) => void
  isAdapting: boolean
  adaptResult: AIAdaptResponse | null
  onAdapt: () => void
  onCopyAdapted: () => void
  copiedAdapted: boolean
}

export function AdaptPanel({
  adaptationType, onAdaptationTypeChange,
  adaptOptions, onAdaptOptionsChange,
  isAdapting, adaptResult,
  onAdapt, onCopyAdapted, copiedAdapted,
}: AdaptPanelProps) {
  return (
    <div className="p-5 bg-gradient-to-br from-blue-50/80 to-violet-50/60 dark:from-blue-950/20 dark:to-violet-950/20 rounded-2xl border border-blue-200/40 dark:border-blue-800/30 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 size={16} className="text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-slate-900 dark:text-white text-[14px]">Adapt Content</span>
      </div>

      {/* Adaptation Type Buttons */}
      <div className="flex flex-wrap gap-2">
        {([
          { type: "shorten" as const, label: "Shorten" },
          { type: "expand" as const, label: "Expand" },
          { type: "bullets" as const, label: "Bullets" },
          { type: "formal" as const, label: "Formal" },
          { type: "casual" as const, label: "Casual" },
          { type: "custom" as const, label: "Custom" },
        ]).map(({ type, label }) => (
          <Button
            key={type}
            variant={adaptationType === type ? "default" : "outline"}
            size="sm"
            onClick={() => onAdaptationTypeChange(type)}
            className={`rounded-lg transition-all duration-150 active:scale-[0.98] ${
              adaptationType === type
                ? "bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 border-0 text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
                : "bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Conditional Options */}
      {adaptationType === "shorten" && (
        <div className="space-y-2">
          <Label htmlFor="target-words" className="text-[12px]">Target Word Count</Label>
          <Input
            id="target-words"
            type="number"
            value={adaptOptions.targetWordCount}
            onChange={(e) => onAdaptOptionsChange({ ...adaptOptions, targetWordCount: parseInt(e.target.value) || 100 })}
            className="bg-white/80 dark:bg-slate-800/80 dark:border-slate-600 dark:text-white rounded-xl w-32 h-9 text-[13px]"
            min={25}
            max={500}
          />
        </div>
      )}

      {adaptationType === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="custom-instruction" className="text-[12px]">Custom Instruction</Label>
          <Textarea
            id="custom-instruction"
            value={adaptOptions.customInstruction}
            onChange={(e) => onAdaptOptionsChange({ ...adaptOptions, customInstruction: e.target.value })}
            placeholder="Describe how you want the content adapted..."
            className="bg-white/80 dark:bg-slate-800/80 dark:border-slate-600 dark:text-white rounded-xl min-h-[80px] text-[13px]"
          />
        </div>
      )}

      {/* Optional Context */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="client-name" className="text-[12px]">Client Name <span className="text-slate-400">(optional)</span></Label>
          <Input
            id="client-name"
            value={adaptOptions.clientName}
            onChange={(e) => onAdaptOptionsChange({ ...adaptOptions, clientName: e.target.value })}
            placeholder="e.g., Acme Corp"
            className="bg-white/80 dark:bg-slate-800/80 dark:border-slate-600 dark:text-white rounded-xl h-9 text-[13px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry" className="text-[12px]">Industry <span className="text-slate-400">(optional)</span></Label>
          <Input
            id="industry"
            value={adaptOptions.industry}
            onChange={(e) => onAdaptOptionsChange({ ...adaptOptions, industry: e.target.value })}
            placeholder="e.g., Healthcare"
            className="bg-white/80 dark:bg-slate-800/80 dark:border-slate-600 dark:text-white rounded-xl h-9 text-[13px]"
          />
        </div>
      </div>

      <Button
        onClick={onAdapt}
        disabled={isAdapting || (adaptationType === "custom" && !adaptOptions.customInstruction.trim())}
        className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 shadow-[0_2px_8px_rgba(59,130,246,0.3)] active:scale-[0.98] transition-all duration-150"
      >
        {isAdapting ? (
          <><Loader2 size={16} className="mr-2 animate-spin" />Adapting...</>
        ) : (
          <><Sparkles size={16} className="mr-2" />Adapt Content</>
        )}
      </Button>

      {/* Adapt Result */}
      {adaptResult && (
        <div className="space-y-3 animate-fade-in-up">
          {adaptResult.refused ? (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
              <p className="text-amber-800 dark:text-amber-200 text-sm">{adaptResult.refusalReason}</p>
            </div>
          ) : (
            <>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {adaptResult.adaptedContent}
                </p>
              </div>
              <Button
                onClick={onCopyAdapted}
                variant="success"
                className="w-full rounded-xl active:scale-[0.98] transition-all duration-150"
              >
                {copiedAdapted ? (
                  <><Check size={16} className="mr-2" />Copied Adapted Content</>
                ) : (
                  <><Copy size={16} className="mr-2" />Copy Adapted Content</>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
