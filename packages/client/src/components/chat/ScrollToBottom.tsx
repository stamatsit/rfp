import { useState, useEffect, useCallback } from "react"
import { ArrowDown } from "lucide-react"

interface ScrollToBottomProps {
  containerRef: React.RefObject<HTMLElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

export function ScrollToBottom({ containerRef, messagesEndRef }: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false)

  const checkScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setVisible(distanceFromBottom > 150)
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("scroll", checkScroll, { passive: true })
    return () => el.removeEventListener("scroll", checkScroll)
  }, [containerRef, checkScroll])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  if (!visible) return null

  return (
    <button
      onClick={scrollToBottom}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10
                 w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                 shadow-lg flex items-center justify-center
                 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200
                 animate-fade-in-up"
    >
      <ArrowDown size={16} className="text-slate-600 dark:text-slate-300" />
    </button>
  )
}
