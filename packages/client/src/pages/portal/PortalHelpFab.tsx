/**
 * Floating help assistant for portal users. Server-side it only knows the
 * toolkit reference text and refuses everything else.
 */
import { useEffect, useRef, useState } from "react"
import { MessageCircleQuestion, Send, X } from "lucide-react"
import { portalJson } from "@/contexts/PortalAuthContext"

interface Msg { role: "user" | "assistant"; content: string }

const STARTERS = [
  "How do I remove a background?",
  "How do I crop to a square?",
  "What does AI Enhance do?",
  "How do I save an image to My Uploads?",
]

export function PortalHelpFab() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, open])

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...messages, { role: "user", content: q }]
    setMessages(next)
    setInput("")
    setBusy(true)
    try {
      const data = await portalJson<{ reply: string }>("/ai/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-8) }),
      })
      setMessages([...next, { role: "assistant", content: data.reply }])
    } catch (err) {
      setMessages([...next, { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong. Try again." }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close help" : "Toolkit help"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[900] w-12 h-12 rounded-full bg-[#C41230] text-white shadow-lg shadow-[#C41230]/30 flex items-center justify-center hover:scale-105 transition-transform"
      >
        {open ? <X size={20} /> : <MessageCircleQuestion size={22} />}
      </button>
      {open && (
        <div className="fixed bottom-20 right-6 z-[900] w-[340px] max-w-[calc(100vw-3rem)] h-[440px] bg-white dark:bg-slate-900 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Toolkit help</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Answers questions about using the Image Toolkit only.</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="space-y-1.5">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="block w-full text-left text-[12px] px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-[13px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2 ${m.role === "user" ? "bg-[#C41230] text-white ml-8" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 mr-8"}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="text-[12px] text-slate-400 px-1">Thinking...</div>}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void ask(input) }}
            className="p-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the toolkit"
              className="flex-1 h-9 px-3 rounded-lg text-[13px] bg-slate-50 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] outline-none focus:border-[#C41230]/50 dark:text-white"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-40">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
