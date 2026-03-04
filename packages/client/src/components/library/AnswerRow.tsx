import React from "react"
import { Copy, Check, CheckSquare, Square, Image as ImageIcon, Building2 } from "lucide-react"
import { Button, Badge } from "@/components/ui"
import { highlightText } from "./libraryUtils"
import type { AnswerResponse } from "@/lib/api"

interface AnswerRowProps {
  answer: AnswerResponse
  shouldHighlight: boolean
  debouncedQuery: string
  copiedId: string | null
  onSelect: (answer: AnswerResponse) => void
  onCopy: (text: string, id: string) => void
  selectionMode: boolean
  isSelected: boolean
  onToggleSelection: (id: string) => void
  clientNames: string[]
  onClientClick: (clientName: string) => void
}

export const AnswerRow = React.memo(function AnswerRow({
  answer, shouldHighlight, debouncedQuery, copiedId,
  onSelect, onCopy, selectionMode, isSelected, onToggleSelection,
  clientNames, onClientClick,
}: AnswerRowProps) {
  return (
    <div
      onClick={() => selectionMode ? onToggleSelection(answer.id) : onSelect(answer)}
      className={`group flex items-start gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
        selectionMode && isSelected
          ? "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
          : "bg-white/50 dark:bg-slate-900/30 border-transparent hover:bg-white dark:hover:bg-slate-800/60 hover:border-slate-200/60 dark:hover:border-slate-700/40 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
      }`}
    >
      {selectionMode && (
        <div className="flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onToggleSelection(answer.id)}
            className="text-slate-400 hover:text-blue-500 transition-colors duration-150"
          >
            {isSelected
              ? <CheckSquare size={16} className="text-blue-500" />
              : <Square size={16} />
            }
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150 leading-snug tracking-[-0.005em]">
          {shouldHighlight && debouncedQuery ? highlightText(answer.question, debouncedQuery) : answer.question}
        </p>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
          {shouldHighlight && debouncedQuery ? highlightText(answer.answer, debouncedQuery) : answer.answer}
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {answer.status === "Draft" && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 rounded-md">Draft</Badge>
          )}
          {answer.tags.slice(0, 3).map((tag, i) => (
            <Badge key={tag} variant={i === 0 ? "purple" : i === 1 ? "teal" : "secondary"} className="text-[10px] px-1.5 py-0.5 rounded-md">{tag}</Badge>
          ))}
          {answer.tags.length > 3 && (
            <span className="text-[10px] text-slate-400 font-medium">+{answer.tags.length - 3}</span>
          )}
          {clientNames.map(clientName => (
            <button
              key={clientName}
              onClick={e => { e.stopPropagation(); onClientClick(clientName) }}
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
            >
              <Building2 size={9} />
              {clientName}
            </button>
          ))}
          {answer.linkedPhotosCount != null && answer.linkedPhotosCount > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              <ImageIcon size={10} />{answer.linkedPhotosCount}
            </span>
          )}
          {(answer.usageCount || 0) > 0 && !(answer.linkedPhotosCount && answer.linkedPhotosCount > 0) && (
            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 font-medium">Used {answer.usageCount}×</span>
          )}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 mt-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCopy(answer.answer, answer.id)}
          className="h-7 w-7 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {copiedId === answer.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="text-slate-400" />}
        </Button>
      </div>
    </div>
  )
})
