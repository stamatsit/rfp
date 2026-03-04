import { ChevronDown } from "lucide-react"
import { AnswerRow } from "./AnswerRow"
import { getTopicColor, dotColorMap } from "./libraryUtils"
import type { AnswerResponse } from "@/lib/api"
import type { Topic } from "@/types"

interface AnswerTopicAccordionProps {
  topicId: string
  topicAnswers: AnswerResponse[]
  topics: Topic[]
  isExpanded: boolean
  onToggle: (topicId: string) => void
  limit: number
  onShowMore: (topicId: string) => void
  shouldHighlight: boolean
  debouncedQuery: string
  copiedId: string | null
  onSelectAnswer: (answer: AnswerResponse) => void
  onCopy: (text: string, id: string) => void
  selectionMode: boolean
  selectedAnswerIds: Set<string>
  onToggleSelection: (id: string) => void
  answerClientMap: Record<string, string[]>
  onClientClick: (clientName: string) => void
  getTopicIndex: (topicId: string) => number
}

export function AnswerTopicAccordion({
  topicId, topicAnswers, topics, isExpanded, onToggle, limit, onShowMore,
  shouldHighlight, debouncedQuery, copiedId, onSelectAnswer, onCopy,
  selectionMode, selectedAnswerIds, onToggleSelection, answerClientMap,
  onClientClick, getTopicIndex,
}: AnswerTopicAccordionProps) {
  if (topicAnswers.length === 0) return null

  const topic = topics.find(t => t.id === topicId)
  const topicColor = getTopicColor(topicId, getTopicIndex(topicId))
  const dotColor = dotColorMap[topicColor.bg] || "bg-slate-400"
  const visibleAnswers = topicAnswers.slice(0, limit)
  const hasMore = topicAnswers.length > limit
  const remaining = topicAnswers.length - limit

  return (
    <div className="mb-2">
      {/* Accordion Header — elevated surface */}
      <button
        onClick={() => onToggle(topicId)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all duration-200 ${
          isExpanded
            ? "bg-white dark:bg-slate-800/70 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]"
            : "bg-white/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/60 shadow-[0_0_0_1px_rgba(0,0,0,0.02)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03)] dark:hover:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]"
        }`}
      >
        <div className={`w-3 h-3 rounded-full ${dotColor} ring-2 ring-white dark:ring-slate-800 shadow-sm flex-shrink-0`} />
        <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 tracking-[-0.01em] flex-1">
          {topic?.displayName || "Unknown"}
        </span>
        <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500 tabular-nums bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
          {topicAnswers.length}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      {/* Animated Accordion Content */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pt-2 pb-1 pl-3 space-y-0.5">
            {visibleAnswers.map((answer) => (
              <AnswerRow
                key={answer.id}
                answer={answer}
                shouldHighlight={shouldHighlight}
                debouncedQuery={debouncedQuery}
                copiedId={copiedId}
                onSelect={onSelectAnswer}
                onCopy={onCopy}
                selectionMode={selectionMode}
                isSelected={selectedAnswerIds.has(answer.id)}
                onToggleSelection={onToggleSelection}
                clientNames={answerClientMap[answer.id] || []}
                onClientClick={onClientClick}
              />
            ))}

            {hasMore && (
              <div className="px-3 py-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onShowMore(topicId) }}
                  className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline font-medium transition-colors duration-150"
                >
                  Show {Math.min(5, remaining)} more
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
