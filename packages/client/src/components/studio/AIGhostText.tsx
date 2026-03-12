import { useState, useCallback, useRef, useEffect } from "react"
import type { Editor } from "@tiptap/react"
import { fetchSSE } from "@/lib/api"

interface AIGhostTextProps {
  editor: Editor | null
  enabled?: boolean
}

/**
 * AI Ghost Text — Novel-inspired inline autocomplete for TipTap.
 *
 * Triggers: User pauses typing for 1.5s at end of a line/paragraph.
 * Shows: Translucent ghost text after cursor.
 * Accept: Tab key inserts the completion.
 * Dismiss: Any other keystroke or click clears it.
 */
export function useAIGhostText({ editor, enabled = true }: AIGhostTextProps) {
  const [ghostText, setGhostText] = useState("")
  const [ghostPos, setGhostPos] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ghostElRef = useRef<HTMLSpanElement | null>(null)

  // Clear ghost text
  const clearGhost = useCallback(() => {
    setGhostText("")
    setGhostPos(null)
    abortRef.current?.abort()
    abortRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Remove ghost element from DOM
    if (ghostElRef.current) {
      ghostElRef.current.remove()
      ghostElRef.current = null
    }
  }, [])

  // Accept ghost text — insert it into the editor
  const acceptGhost = useCallback(() => {
    if (!editor || !ghostText || ghostPos === null) return
    editor.chain().focus().insertContentAt(ghostPos, ghostText).run()
    clearGhost()
  }, [editor, ghostText, ghostPos, clearGhost])

  // Fetch autocomplete from server
  const fetchCompletion = useCallback(async () => {
    if (!editor || !enabled) return

    const { from } = editor.state.selection
    const doc = editor.state.doc

    // Get text before cursor
    const textBefore = doc.textBetween(0, from, "\n")
    if (textBefore.trim().length < 15) return // Need enough context

    // Get text after cursor
    const textAfter = doc.textBetween(from, doc.content.size, "\n")

    // Only trigger at end of paragraph or after a sentence ending
    const lastChars = textBefore.slice(-3)
    const atEndOfSentence = /[.!?]\s*$/.test(lastChars)
    const atEndOfParagraph = textAfter.trim().length === 0 || textAfter.startsWith("\n")
    if (!atEndOfSentence && !atEndOfParagraph) return

    setIsLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    let accumulated = ""

    try {
      await fetchSSE(
        "/studio/autocomplete",
        { textBefore: textBefore.slice(-1500), textAfter: textAfter.slice(0, 500) },
        {
          onToken: (token: string) => {
            accumulated += token
            setGhostText(accumulated)
            setGhostPos(from)
          },
          onDone: (data: Record<string, unknown>) => {
            if (data.result && typeof data.result === "string") {
              setGhostText(data.result as string)
            }
            setIsLoading(false)
          },
          onError: () => {
            clearGhost()
            setIsLoading(false)
          },
        },
        controller.signal
      )
    } catch {
      clearGhost()
      setIsLoading(false)
    }
  }, [editor, enabled, clearGhost])

  // Listen for typing pauses
  useEffect(() => {
    if (!editor || !enabled) return

    const handleUpdate = () => {
      // Clear any existing ghost text on edit
      clearGhost()

      // Restart debounce timer
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        fetchCompletion()
      }, 1800) // 1.8s pause triggers autocomplete
    }

    const handleSelectionUpdate = () => {
      // If user moves cursor, clear ghost
      if (ghostText && ghostPos !== null) {
        const { from } = editor.state.selection
        if (from !== ghostPos) {
          clearGhost()
        }
      }
    }

    editor.on("update", handleUpdate)
    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("update", handleUpdate)
      editor.off("selectionUpdate", handleSelectionUpdate)
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [editor, enabled, ghostText, ghostPos, clearGhost, fetchCompletion])

  // Keyboard handler — Tab to accept, anything else to dismiss
  useEffect(() => {
    if (!editor || !ghostText) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && ghostText) {
        e.preventDefault()
        e.stopPropagation()
        acceptGhost()
        return
      }
      if (e.key === "Escape" && ghostText) {
        e.preventDefault()
        clearGhost()
        return
      }
    }

    // Use capture to intercept before TipTap
    const dom = editor.view.dom
    dom.addEventListener("keydown", handleKeyDown, true)
    return () => dom.removeEventListener("keydown", handleKeyDown, true)
  }, [editor, ghostText, acceptGhost, clearGhost])

  // Render ghost text as a DOM element after the cursor
  useEffect(() => {
    if (!editor || !ghostText || ghostPos === null) return

    // Remove previous ghost element
    if (ghostElRef.current) {
      ghostElRef.current.remove()
      ghostElRef.current = null
    }

    try {
      const coords = editor.view.coordsAtPos(ghostPos)
      const editorDom = editor.view.dom.closest(".tiptap-editor") as HTMLElement | null
      if (!editorDom) return

      const editorRect = editorDom.getBoundingClientRect()

      const span = document.createElement("span")
      span.className = "ai-ghost-text"
      span.textContent = ghostText
      span.style.cssText = `
        position: absolute;
        top: ${coords.top - editorRect.top}px;
        left: ${coords.left - editorRect.left}px;
        color: rgba(16, 185, 129, 0.45);
        pointer-events: none;
        font-style: italic;
        white-space: pre-wrap;
        max-width: 500px;
        z-index: 5;
        font-size: inherit;
        line-height: inherit;
        font-family: inherit;
      `

      editorDom.style.position = "relative"
      editorDom.appendChild(span)
      ghostElRef.current = span
    } catch {
      // Position calculation failed — ignore
    }

    return () => {
      if (ghostElRef.current) {
        ghostElRef.current.remove()
        ghostElRef.current = null
      }
    }
  }, [editor, ghostText, ghostPos])

  return {
    ghostText,
    isLoading,
    hasGhost: ghostText.length > 0,
    acceptGhost,
    clearGhost,
  }
}
