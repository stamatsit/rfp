import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"

export function KeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K — open command palette (fires even from inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("open-command-palette"))
        return
      }

      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      // Press "?" to go to help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        if (location.pathname !== "/help") {
          navigate("/help")
        }
      }

      // Press "/" to go to search (common pattern)
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        if (location.pathname !== "/search") {
          navigate("/search")
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navigate, location.pathname])

  return null
}
