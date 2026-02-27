import { useState, useEffect, useCallback } from "react"
import { X, AlignLeft } from "lucide-react"
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
        <div className="flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            Outline
          </span>
          {headings.length > 0 && (
            <span className="text-[9px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 tabular-nums">
              {headings.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Heading list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center opacity-50">
              <AlignLeft className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Add headings to see the outline
            </p>
          </div>
        ) : (
          headings.map((h, i) => {
            const isActive = activePos === h.pos
            return (
              <button
                key={`${h.pos}-${i}`}
                onClick={() => handleClick(h.pos)}
                className={`group w-full text-left py-1 text-xs transition-all flex items-center gap-2 relative ${
                  isActive
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                style={{ paddingLeft: `${(h.level - 1) * 10 + 12}px`, paddingRight: "12px" }}
              >
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-0 top-0.5 bottom-0.5 w-0.5 bg-emerald-500 rounded-full" />
                )}
                {/* Level badge */}
                <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-[8px] font-bold ${
                  isActive
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors"
                }`}>
                  H{h.level}
                </span>
                <span className={`truncate text-[11px] leading-snug ${
                  h.level === 1 ? "font-semibold" : h.level === 2 ? "font-medium" : "opacity-80"
                }`}>
                  {h.text || "(empty heading)"}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
