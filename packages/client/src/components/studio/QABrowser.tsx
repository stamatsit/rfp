import { useState, useEffect, useCallback } from "react"
import { X, Search, BookOpen, ChevronDown, ChevronRight } from "lucide-react"

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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Q&A Library</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Q&A answers..."
              className="w-full h-8 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">Loading...</div>
          ) : answers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              {search ? "No matching answers" : "No approved answers found"}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {answers.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="flex items-start gap-2 w-full text-left group"
                  >
                    {expandedId === item.id
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    }
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {item.question}
                    </span>
                  </button>

                  {expandedId === item.id && (
                    <div className="ml-5.5 mt-2 pl-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {item.answer}
                      </p>
                      <button
                        onClick={() => handleInsert(item)}
                        className="mt-2 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded border border-emerald-200 dark:border-emerald-700 transition-colors"
                      >
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
