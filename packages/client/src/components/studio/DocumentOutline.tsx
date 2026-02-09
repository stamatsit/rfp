import { useState, useEffect, useCallback } from "react"
import { X, ChevronRight } from "lucide-react"
import type { Editor } from "@tiptap/react"

interface HeadingItem {
  level: number
  text: string
  pos: number
}

interface DocumentOutlineProps {
  editor: Editor | null
  isOpen: boolean
  onClose: () => void
}

export function DocumentOutline({ editor, isOpen, onClose }: DocumentOutlineProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activePos, setActivePos] = useState<number | null>(null)

  const extractHeadings = useCallback(() => {
    if (!editor) return
    const items: HeadingItem[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        items.push({
          level: node.attrs.level as number,
          text: node.textContent,
          pos,
        })
      }
    })
    setHeadings(items)
  }, [editor])

  // Extract on mount and on editor updates
  useEffect(() => {
    if (!editor) return
    extractHeadings()
    editor.on("update", extractHeadings)
    return () => { editor.off("update", extractHeadings) }
  }, [editor, extractHeadings])

  const handleClick = (pos: number) => {
    if (!editor) return
    editor.commands.setTextSelection(pos + 1)
    editor.commands.scrollIntoView()
    editor.commands.focus()
    setActivePos(pos)
  }

  if (!isOpen) return null

  return (
    <div className="w-56 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          Outline
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Heading list */}
      <div className="flex-1 overflow-y-auto py-2">
        {headings.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">
            No headings yet. Add headings (H1, H2, H3) to see the document outline.
          </p>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.pos}-${i}`}
              onClick={() => handleClick(h.pos)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-1 ${
                activePos === h.pos
                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
            >
              <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />
              <span className={`truncate ${h.level === 1 ? "font-semibold" : h.level === 2 ? "font-medium" : ""}`}>
                {h.text || "(empty heading)"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
