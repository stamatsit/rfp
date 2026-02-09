import { useState, useRef, useCallback } from "react"
import { Sparkles, ArrowRight, Square } from "lucide-react"
import { fetchSSE } from "@/lib/api"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { InlineChart } from "@/components/chat/InlineChart"
import { CHAT_THEMES, type ChartConfig } from "@/types/chat"

interface BriefingViewProps {
  onDeploy: (content: string) => void
}

type BriefingState = "empty" | "streaming" | "complete" | "error"

const theme = CHAT_THEMES.emerald

export function BriefingView({ onDeploy }: BriefingViewProps) {
  const [state, setState] = useState<BriefingState>("empty")
  const [content, setContent] = useState("")
  const [chartData, setChartData] = useState<ChartConfig | null>(null)
  const [error, setError] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  const handleGenerate = useCallback(async () => {
    setState("streaming")
    setContent("")
    setChartData(null)
    setError("")

    const abort = new AbortController()
    abortRef.current = abort

    try {
      await fetchSSE(
        "/studio/briefing/stream",
        {},
        {
          onToken: (token) => {
            setContent((prev) => prev + token)
          },
          onDone: (data) => {
            setContent(data.cleanResponse)
            if (data.chartData) {
              setChartData(data.chartData as unknown as ChartConfig)
            }
            setState("complete")
          },
          onError: (err) => {
            setError(err)
            setState("error")
          },
        },
        abort.signal
      )
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Failed to generate briefing")
        setState("error")
      }
    }
  }, [])

  const handleAbort = useCallback(() => {
    abortRef.current?.abort()
    setState("complete")
  }, [])

  if (state === "empty") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{ background: theme.botGradient, boxShadow: theme.botShadow }}>
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
            Executive Briefing
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">
            Generate a comprehensive briefing using all your proposal data, pipeline metrics, client success stories, and strategic recommendations.
          </p>
          <button
            onClick={handleGenerate}
            className="px-6 py-3 rounded-xl text-white font-medium text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5"
          >
            <Sparkles className="w-4 h-4 inline mr-2" />
            Generate Today's Briefing
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <MarkdownRenderer content={content} />

          {chartData && (
            <div className="mt-4">
              <InlineChart config={chartData} theme={theme} />
            </div>
          )}

          {state === "streaming" && (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex gap-1">
                <div className={`w-2 h-2 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "0ms" }} />
                <div className={`w-2 h-2 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "150ms" }} />
                <div className={`w-2 h-2 rounded-full ${theme.dotColor} animate-bounce`} style={{ animationDelay: "300ms" }} />
              </div>
              <button
                onClick={handleAbort}
                className="ml-2 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 rounded-md hover:border-red-300 transition-colors"
              >
                <Square className="w-3 h-3 inline mr-1" />
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {state === "complete" && content && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Briefing ready — deploy to editor to customize
            </span>
            <button
              onClick={() => onDeploy(content)}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md transition-all hover:shadow-lg"
            >
              Deploy to Editor
              <ArrowRight className="w-4 h-4 inline ml-1.5" />
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
            <button onClick={handleGenerate} className="text-xs text-red-600 dark:text-red-400 underline">
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
