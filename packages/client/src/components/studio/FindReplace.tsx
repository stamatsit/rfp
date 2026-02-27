import { useState, useMemo } from "react"
import { X, ChevronUp, ChevronDown, Replace, Regex } from "lucide-react"

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
  const [useRegex, setUseRegex] = useState(false)
  const [regexError, setRegexError] = useState(false)

  const matches = useMemo(() => {
    if (!searchTerm) { setRegexError(false); return [] }
    try {
      const pattern = useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const flags = caseSensitive ? "g" : "gi"
      const regex = new RegExp(pattern, flags)
      const results: number[] = []
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        results.push(match.index)
        if (match[0].length === 0) break // prevent infinite loop on zero-length matches
      }
      setRegexError(false)
      return results
    } catch {
      setRegexError(true)
      return []
    }
  }, [content, searchTerm, caseSensitive, useRegex])

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
    <div className="absolute top-2 right-4 z-20 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)] p-2.5 w-[310px] animate-fade-in-up">
      {/* Find row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`flex-1 flex items-center bg-slate-50 dark:bg-slate-900 border rounded-md overflow-hidden transition-colors ${
          regexError
            ? "border-red-300 dark:border-red-700"
            : "border-slate-200/80 dark:border-slate-700/60 focus-within:ring-1 focus-within:ring-emerald-500/30 focus-within:border-emerald-400/40"
        }`}>
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentIndex(0) }}
            placeholder="Find…"
            className="flex-1 h-7 px-2 text-[11px] bg-transparent text-slate-700 dark:text-slate-300 outline-none min-w-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") goNext()
              if (e.key === "Escape") onClose()
            }}
          />
          {/* Regex toggle */}
          <button
            onClick={() => { setUseRegex((v) => !v); setCurrentIndex(0) }}
            title={useRegex ? "Disable regex" : "Enable regex"}
            className={`flex items-center justify-center w-6 h-7 flex-shrink-0 transition-colors ${
              useRegex
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <Regex className="w-3 h-3" />
          </button>
        </div>

        {/* Match counter pill */}
        <span className={`text-[9px] min-w-[36px] text-center tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
          matchCount === 0
            ? "text-slate-400 bg-slate-100 dark:bg-slate-800"
            : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30"
        }`}>
          {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : regexError ? "err" : "0/0"}
        </span>

        <button onClick={goPrev} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="Previous (Shift+Enter)">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button onClick={goNext} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="Next (Enter)">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-1.5">
        <input
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          placeholder="Replace…"
          className="flex-1 h-7 px-2 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-md text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") replaceOne()
            if (e.key === "Escape") onClose()
          }}
        />
        <button
          onClick={replaceOne}
          disabled={matchCount === 0}
          className="flex items-center gap-1 px-2 h-7 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-emerald-700/40 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-30 transition-colors"
          title="Replace (Enter)"
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

      {/* Options row */}
      <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60">
        <label className="flex items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => { setCaseSensitive(e.target.checked); setCurrentIndex(0) }}
            className="w-3 h-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Aa case
        </label>
        <span className="ml-auto text-[8px] text-slate-300 dark:text-slate-600 flex items-center gap-2">
          <span><kbd className="font-mono">↵</kbd> next</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </span>
      </div>
    </div>
  )
}
