import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Sparkles, ArrowRight, Copy, Check } from "lucide-react"
import { searchApi, type AnswerResponse } from "@/lib/api"

interface RelatedContentProps {
  currentAnswerId: string
  currentQuestion: string
  currentTopicId: string
  maxItems?: number
}

export function RelatedContent({
  currentAnswerId,
  currentQuestion,
  currentTopicId,
  maxItems = 3,
}: RelatedContentProps) {
  const [related, setRelated] = useState<AnswerResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const fetchRelated = async () => {
      setIsLoading(true)
      try {
        // Extract key words from the question for search
        const keywords = currentQuestion
          .toLowerCase()
          .replace(/[?.,!]/g, "")
          .split(" ")
          .filter((word) => word.length > 3)
          .slice(0, 3)
          .join(" ")

        // Search for related content in same topic first
        const results = await searchApi.searchAnswers({
          q: keywords,
          topicId: currentTopicId,
          status: "Approved",
          limit: maxItems + 1, // Get one extra in case current is included
        })

        // Filter out the current answer
        const filtered = results
          .filter((r) => r.id !== currentAnswerId)
          .slice(0, maxItems)

        // If we didn't get enough, search without topic filter
        if (filtered.length < maxItems) {
          const moreResults = await searchApi.searchAnswers({
            q: keywords,
            status: "Approved",
            limit: maxItems + 1,
          })

          const moreFiltered = moreResults
            .filter(
              (r) =>
                r.id !== currentAnswerId &&
                !filtered.some((f) => f.id === r.id)
            )
            .slice(0, maxItems - filtered.length)

          setRelated([...filtered, ...moreFiltered])
        } else {
          setRelated(filtered)
        }
      } catch (err) {
        console.error("Failed to fetch related content:", err)
        setRelated([])
      } finally {
        setIsLoading(false)
      }
    }

    if (currentQuestion) {
      fetchRelated()
    }
  }, [currentAnswerId, currentQuestion, currentTopicId, maxItems])

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (isLoading) {
    return (
      <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-violet-500" />
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Finding related content...
          </h3>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (related.length === 0) {
    return null
  }

  return (
    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-violet-500" />
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Related Content
        </h3>
      </div>

      <div className="space-y-2">
        {related.map((item) => (
          <div
            key={item.id}
            className="group p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                  {item.question}
                </p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                  {item.answer.slice(0, 120)}
                  {item.answer.length > 120 ? "..." : ""}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopy(item.answer, item.id)
                }}
                className={`flex-shrink-0 p-2 rounded-lg transition-all duration-200 ${
                  copiedId === item.id
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                    : "bg-white dark:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100"
                }`}
                title="Copy answer"
              >
                {copiedId === item.id ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Link
        to={`/search?q=${encodeURIComponent(currentQuestion.slice(0, 50))}`}
        className="inline-flex items-center gap-1 mt-3 text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors"
      >
        View more related
        <ArrowRight size={12} />
      </Link>
    </div>
  )
}
