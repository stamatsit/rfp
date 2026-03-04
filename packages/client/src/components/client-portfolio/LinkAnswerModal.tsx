import { useState, useEffect, useRef } from "react"
import {
  Search,
  Link2,
  BookOpen,
  Plus,
  X,
  Loader2,
} from "lucide-react"
import { searchApi, clientQaApi, type AnswerResponse } from "@/lib/api"

interface LinkAnswerModalProps {
  clientName: string
  alreadyLinked: string[]
  onClose: () => void
  onLinked: () => void
}

export function LinkAnswerModal({ clientName, alreadyLinked, onClose, onLinked }: LinkAnswerModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AnswerResponse[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchApi.searchAnswers({ q: query.trim() || undefined, status: "Approved", limit: 20 })
        setResults(data.filter(r => !alreadyLinked.includes(r.id)))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, alreadyLinked])

  const handleLink = async (answer: AnswerResponse) => {
    setLinking(answer.id)
    try {
      await clientQaApi.link(clientName, answer.id)
      onLinked()
    } catch {
      setLinking(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg mx-4 border border-slate-200/60 dark:border-slate-700/60 flex flex-col max-h-[80vh]"
        style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.03), 0 8px 32px rgb(0 0 0 / 0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}>
              <Link2 size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Link Q&amp;A Answer</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search approved answers…"
              className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
            />
            {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5 min-h-0">
          {results.length === 0 && !searching ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen size={20} className="text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-400">No approved answers found</p>
            </div>
          ) : (
            results.map(answer => (
              <div
                key={answer.id}
                className="group px-3.5 py-3 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-sky-200 dark:hover:border-sky-800/60 hover:bg-sky-50/40 dark:hover:bg-sky-900/10 transition-all cursor-pointer"
                onClick={() => handleLink(answer)}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                      {answer.question}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {answer.answer}
                    </p>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {linking === answer.id ? (
                      <Loader2 size={14} className="animate-spin text-sky-500" />
                    ) : (
                      <Plus size={14} className="text-slate-300 group-hover:text-sky-500 transition-colors" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
