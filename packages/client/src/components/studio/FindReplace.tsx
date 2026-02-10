import { useState, useMemo } from "react"
import { X, ChevronUp, ChevronDown, Replace } from "lucide-react"

interface FindReplaceProps {
  content: string
  onContentChange: (content: string) => void
  onClose: () => void
}

export function FindReplace({ content, onContentChange, onClose }: FindReplaceProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [replaceTerm, setReplaceTerm] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)

  const matches = useMemo(() => {
    if (!searchTerm) return []
    const flags = caseSensitive ? "g" : "gi"
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags)
    const results: number[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      results.push(match.index)
    }
    return results
  }, [content, searchTerm, caseSensitive])

  const matchCount = matches.length

  const goNext = () => {
    if (matchCount > 0) setCurrentIndex((prev) => (prev + 1) % matchCount)
  }

  const goPrev = () => {
    if (matchCount > 0) setCurrentIndex((prev) => (prev - 1 + matchCount) % matchCount)
  }

  const replaceOne = () => {
    if (matchCount === 0) return
    const idx = matches[currentIndex]!
    const before = content.slice(0, idx)
    const after = content.slice(idx + searchTerm.length)
    onContentChange(before + replaceTerm + after)
  }

  const replaceAll = () => {
    if (matchCount === 0) return
    const flags = caseSensitive ? "g" : "gi"
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags)
    onContentChange(content.replace(regex, replaceTerm))
  }

  return (
    <div className="absolute top-2 right-4 z-20 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)] p-2.5 w-[300px] animate-fade-in-up">
      <div className="flex items-center gap-1.5 mb-2">
        <input
          autoFocus
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentIndex(0) }}
          placeholder="Find..."
          className="flex-1 h-7 px-2 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-md text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") goNext()
            if (e.key === "Escape") onClose()
          }}
        />
        <span className="text-[9px] text-slate-400 min-w-[34px] text-right tabular-nums font-medium">
          {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : "0/0"}
        </span>
        <button onClick={goPrev} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button onClick={goNext} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          placeholder="Replace..."
          className="flex-1 h-7 px-2 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-md text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") replaceOne()
            if (e.key === "Escape") onClose()
          }}
        />
        <button
          onClick={replaceOne}
          disabled={matchCount === 0}
          className="px-2 h-7 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-emerald-700/40 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-30 transition-colors"
          title="Replace"
        >
          <Replace className="w-3 h-3" />
        </button>
        <button
          onClick={replaceAll}
          disabled={matchCount === 0}
          className="px-2 h-7 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-emerald-700/40 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-30 transition-colors"
          title="Replace all"
        >
          All
        </button>
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <label className="flex items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="w-3 h-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Case sensitive
        </label>
      </div>
    </div>
  )
}
