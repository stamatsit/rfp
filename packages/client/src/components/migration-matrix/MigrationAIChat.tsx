/**
 * Migration Matrix chat: floating panel, grounded in the latest snapshot,
 * scoped to the current dashboard view, renders inline charts via the app's
 * shared CHART_DATA pipeline (InlineChart).
 */
import { useEffect, useRef, useState } from "react"
import { Send, Sparkles, X } from "lucide-react"
import { fetchSSE } from "@/lib/api"
import { ChatMarkdown } from "@/components/client-portfolio/ChatMarkdown"
import { InlineChart } from "@/components/chat/InlineChart"
import { CHAT_THEMES, type ChartConfig } from "@/types/chat"

interface MmChatMessage {
  role: "user" | "assistant"
  content: string
  chartData?: ChartConfig | null
  followUps?: string[]
}

const STARTERS: Record<string, string[]> = {
  overview: ["Are we on track overall?", "Who did the most pages?", "Chart pages done by person"],
  team: ["Who is over capacity this week?", "Chart hours by person"],
  client: ["Is this project on track?", "Chart its weekly throughput", "Who is working on it?"],
  person: ["How productive are they?", "Chart their pages per week"],
}

export function MigrationAIChat({ context }: { context: string }) {
  const theme = CHAT_THEMES.crimson
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<MmChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, streamText])
  useEffect(() => () => abortRef.current?.abort(), [])

  const starterKey = context.startsWith("client:") ? "client" : context.startsWith("person:") ? "person" : context === "team" ? "team" : "overview"

  const send = async (q: string) => {
    const query = q.trim()
    if (!query || busy) return
    setInput("")
    setBusy(true)
    setStreamText("")
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, { role: "user", content: query }])
    abortRef.current = new AbortController()
    await fetchSSE("/migration/chat/stream", { query, conversationHistory: history, context }, {
      onToken: (t) => setStreamText((s) => s + t),
      onDone: (d) => {
        setMessages((m) => [...m, {
          role: "assistant",
          content: d.cleanResponse,
          chartData: (d.chartData as ChartConfig | undefined) ?? null,
          followUps: d.followUpPrompts,
        }])
        setStreamText(""); setBusy(false)
      },
      onError: (err) => {
        setMessages((m) => [...m, { role: "assistant", content: err }])
        setStreamText(""); setBusy(false)
      },
    }, abortRef.current.signal)
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask AI"
          className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white transition hover:scale-105"
          style={{ background: theme.botGradient, boxShadow: theme.botShadow }}>
          <Sparkles size={22} />
        </button>
      )}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-6rem)] flex flex-col bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 h-12 text-white shrink-0" style={{ background: theme.botGradient }}>
            <Sparkles size={16} />
            <span className="text-[13.5px] font-semibold">Migration Matrix AI</span>
            <span className="text-[11px] opacity-75 truncate">{context === "overview" ? "all projects" : context.replace(":", ": ")}</span>
            <button onClick={() => setOpen(false)} className="ml-auto opacity-80 hover:opacity-100" aria-label="Close chat"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="pt-2">
                <p className="text-[12.5px] text-slate-500 mb-2">Grounded in the live snapshot. Ask anything, and ask for charts.</p>
                <div className="flex flex-col items-start gap-1.5">
                  {(STARTERS[starterKey] ?? STARTERS.overview!).map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className={`text-[12.5px] px-3 py-1.5 rounded-full border ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText} ${theme.accentBorder} ${theme.accentBgDark} ${theme.accentBgHoverDark} ${theme.accentTextDark} ${theme.accentBorderDark}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className={`max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] border ${theme.userBubbleBg} ${theme.userBubbleBorder} ${theme.userBubbleShadow} text-slate-800`}>
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[95%] text-[13px] text-slate-700 dark:text-slate-200 space-y-2">
                    <ChatMarkdown text={m.content} />
                    {m.chartData && <InlineChart config={m.chartData} theme={theme} />}
                    {i === messages.length - 1 && (m.followUps?.length ?? 0) > 0 && !busy && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.followUps!.slice(0, 3).map((f) => (
                          <button key={f} onClick={() => send(f)}
                            className={`text-[11.5px] px-2.5 py-1 rounded-full border ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText} ${theme.accentBorder} ${theme.accentBgDark} ${theme.accentBgHoverDark} ${theme.accentTextDark} ${theme.accentBorderDark}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="text-[13px] text-slate-700 dark:text-slate-200">
                {streamText ? <ChatMarkdown text={streamText} /> : <span className="inline-flex gap-1"><span className={`w-1.5 h-1.5 rounded-full animate-bounce ${theme.dotColor}`} /><span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:120ms] ${theme.dotColor}`} /><span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:240ms] ${theme.dotColor}`} /></span>}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex items-center gap-2 p-3 border-t border-black/[0.06] dark:border-white/[0.08] shrink-0">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about projects, people, pace..."
              className="flex-1 h-9 px-3 text-[13px] rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-rose-300" />
            <button type="submit" disabled={busy || input.trim().length < 2} aria-label="Send"
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 ${theme.sendButtonGradient} ${theme.sendButtonHoverGradient} ${theme.sendButtonShadow}`}>
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
