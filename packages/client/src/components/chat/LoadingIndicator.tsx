import { useState, useEffect } from "react"
import { Loader2, Bot } from "lucide-react"
import { Card, CardContent } from "@/components/ui"
import type { ChatTheme } from "@/types/chat"

interface LoadingIndicatorProps {
  theme: ChatTheme
}

const PHASES = [
  { after: 0, label: "Preparing context", detail: "Loading your data..." },
  { after: 2000, label: "Analyzing", detail: "Processing your request..." },
  { after: 5000, label: "Generating insights", detail: "Building your response..." },
  { after: 10000, label: "Almost there", detail: "Finishing up..." },
]

export function LoadingIndicator({ theme }: LoadingIndicatorProps) {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    for (let i = 1; i < PHASES.length; i++) {
      const phase = PHASES[i]
      if (phase) timers.push(setTimeout(() => setPhaseIndex(i), phase.after))
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  const phase = PHASES[phaseIndex]

  return (
    <div className="flex gap-4 justify-start animate-fade-in-up">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: theme.botGradient, boxShadow: theme.botShadow }}
      >
        <Bot size={18} className="text-white" />
      </div>
      <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 rounded-2xl rounded-tl-md overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className={`animate-spin text-${theme.primary}-500`} />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 dark:text-slate-300 text-[14px] font-medium">
                {phase?.label}
              </span>
              <span className="flex gap-1">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className={`w-1.5 h-1.5 ${theme.dotColor} rounded-full animate-bounce`}
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">{phase?.detail}</p>
        </CardContent>
      </Card>
    </div>
  )
}
