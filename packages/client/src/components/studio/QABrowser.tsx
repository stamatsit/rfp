import { useState, useEffect, useCallback } from "react"
import { X, Search, BookOpen, ChevronDown, ChevronRight, CornerDownLeft } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

interface AnswerItem {
  id: string
  question: string
  answer: string
  topicId: string | null
  status: string
}

interface QABrowserProps {
  onInsert: (content: string) => void
  onClose: () => void
}

export function QABrowser({ onInsert, onClose }: QABrowserProps) {
  const [answers, setAnswers] = useState<AnswerItem[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchAnswers = useCallback(async () => {
    setIsLoading(true)
    try {
      const url = search
        ? `${API_BASE}/answers/search?q=${encodeURIComponent(search)}&status=Approved`
        : `${API_BASE}/answers?status=Approved&limit=50`
      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setAnswers(data as AnswerItem[])
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    void fetchAnswers()
  }, [fetchAnswers])

  const handleInsert = (answer: AnswerItem) => {
    onInsert(`\n\n${answer.answer}\n\n`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-emerald-700/60 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">Q&A Library</h3>
              {!isLoading && answers.length > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{answers.length} approved answer{answers.length !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Q&A answers…"
              className="w-full h-8 pl-9 pr-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 dark:focus:border-emerald-600 transition-all"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1.5 animate-pulse">
                  <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-md" style={{ width: `${60 + i * 8}%` }} />
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-md w-4/5" />
                </div>
              ))}
            </div>
          ) : answers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-6">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {search ? "No matching answers" : "No approved answers"}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {search ? "Try a different search term" : "Answers must be approved before they appear here"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {answers.map((item) => (
                <div key={item.id} className={`px-4 py-2.5 transition-colors ${expandedId === item.id ? "bg-emerald-50/40 dark:bg-emerald-900/10" : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"}`}>
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="flex items-start gap-2 w-full text-left group"
                  >
                    <div className={`w-4 h-4 mt-0.5 flex-shrink-0 rounded transition-colors ${expandedId === item.id ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-500"}`}>
                      {expandedId === item.id
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      }
                    </div>
                    <span className={`text-xs font-medium transition-colors ${expandedId === item.id ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"}`}>
                      {item.question}
                    </span>
                  </button>

                  {expandedId === item.id && (
                    <div className="mt-2 ml-6">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-6 mb-2">
                        {item.answer}
                      </p>
                      <button
                        onClick={() => handleInsert(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                      >
                        <CornerDownLeft className="w-3 h-3" />
                        Insert into document
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
