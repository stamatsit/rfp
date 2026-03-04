import { FileText, Image as ImageIcon, ArrowUpDown, X, CheckSquare } from "lucide-react"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui"
import type { Topic, SearchItemType, ItemStatus } from "@/types"
import { getTopicColor, type SortOption } from "./libraryUtils"

interface LibraryFilterBarProps {
  showPhotos: boolean
  typeFilter: SearchItemType
  onTypeFilterChange: (v: SearchItemType) => void
  totalAnswers: number
  totalPhotos: number
  topicFilter: string
  onTopicFilterChange: (v: string) => void
  topics: Topic[]
  statusFilter: ItemStatus | "all"
  onStatusFilterChange: (v: ItemStatus | "all") => void
  sortBy: SortOption
  onSortChange: (v: SortOption) => void
  activeFilterCount: number
  onClearFilters: () => void
  selectionMode: boolean
  onToggleSelectionMode: () => void
}

export function LibraryFilterBar({
  showPhotos,
  typeFilter, onTypeFilterChange,
  totalAnswers, totalPhotos,
  topicFilter, onTopicFilterChange, topics,
  statusFilter, onStatusFilterChange,
  sortBy, onSortChange,
  activeFilterCount, onClearFilters,
  selectionMode, onToggleSelectionMode,
}: LibraryFilterBarProps) {
  return (
    <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
      {/* Answers / Photos segmented control */}
      {showPhotos && (
        <div className="inline-flex bg-slate-100/80 dark:bg-slate-800/80 rounded-lg p-0.5">
          <button
            onClick={() => onTypeFilterChange("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150 ${
              typeFilter !== "photos"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <FileText size={12} className={typeFilter !== "photos" ? "text-blue-500" : "text-slate-400"} />
            Answers
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeFilter !== "photos" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" : "bg-slate-200 dark:bg-slate-700 text-slate-500"}`}>
              {totalAnswers}
            </span>
          </button>
          <button
            onClick={() => onTypeFilterChange("photos")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150 ${
              typeFilter === "photos"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <ImageIcon size={12} className={typeFilter === "photos" ? "text-violet-500" : "text-slate-400"} />
            Photos
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeFilter === "photos" ? "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" : "bg-slate-200 dark:bg-slate-700 text-slate-500"}`}>
              {totalPhotos}
            </span>
          </button>
        </div>
      )}

      {/* Topic chip */}
      <Select value={topicFilter} onValueChange={onTopicFilterChange}>
        <SelectTrigger className={`w-auto h-8 px-3 text-[12px] font-medium rounded-lg border transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
          topicFilter !== "all"
            ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 shadow-[0_1px_2px_rgba(59,130,246,0.08)]"
            : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400"
        }`}>
          <SelectValue placeholder="Topic" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Topics</SelectItem>
          {topics.map((topic, i) => {
            const color = getTopicColor(topic.id, i)
            return (
              <SelectItem key={topic.id} value={topic.id}>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color.bg} border ${color.border}`} />
                  {topic.displayName}
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* Status chip */}
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as ItemStatus | "all")}>
        <SelectTrigger className={`w-auto h-8 px-3 text-[12px] font-medium rounded-lg border transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
          statusFilter !== "all"
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 shadow-[0_1px_2px_rgba(16,185,129,0.08)]"
            : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400"
        }`}>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="Approved">Approved</SelectItem>
          <SelectItem value="Draft">Draft</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort chip */}
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-auto h-8 px-3 text-[12px] font-medium rounded-lg border bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-150">
          <ArrowUpDown size={11} className="mr-1 text-slate-400" />
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="relevance">Relevance</SelectItem>
          <SelectItem value="most-used">Most Used</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
          <SelectItem value="alphabetical">A–Z</SelectItem>
        </SelectContent>
      </Select>

      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 h-7 px-2 text-[11px] text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
        >
          <X size={11} /> Clear
        </button>
      )}

      <div className="flex-1" />

      {/* Select mode */}
      <Button
        variant={selectionMode ? "default" : "outline"}
        size="sm"
        onClick={onToggleSelectionMode}
        className={`h-8 rounded-lg text-[12px] transition-all duration-150 active:scale-[0.98] ${
          selectionMode ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
        }`}
      >
        {selectionMode ? <><X size={12} className="mr-1" />Cancel</> : <><CheckSquare size={12} className="mr-1" />Select</>}
      </Button>
    </div>
  )
}
