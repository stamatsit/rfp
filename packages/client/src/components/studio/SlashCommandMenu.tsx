import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import type { SlashCommandItem } from "./extensions/SlashCommands"

interface SlashCommandMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    // Scroll selected item into view
    useEffect(() => {
      const el = menuRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command(item)
      },
      [items, command]
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="w-60 bg-white dark:bg-slate-800 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden slash-command-menu">
          <div className="px-3 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">
            No matching commands
          </div>
        </div>
      )
    }

    // Group items by category
    const blocks = items.filter((i) => i.category === "blocks")
    const inserts = items.filter((i) => i.category === "insert")
    let globalIndex = 0

    const renderItem = (item: SlashCommandItem) => {
      const idx = globalIndex++
      return (
        <button
          key={item.id}
          data-index={idx}
          onClick={() => selectItem(idx)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors rounded-md mx-0.5 ${
            idx === selectedIndex
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          }`}
          style={{ width: "calc(100% - 4px)" }}
        >
          <span className="w-6 h-6 flex items-center justify-center text-[11px] rounded-md bg-slate-100 dark:bg-slate-700/80 flex-shrink-0">
            {item.icon}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[12px] font-medium block leading-tight">{item.label}</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">{item.description}</span>
          </div>
        </button>
      )
    }

    return (
      <div
        ref={menuRef}
        className="w-60 bg-white dark:bg-slate-800 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden max-h-72 overflow-y-auto slash-command-menu py-1"
      >
        {blocks.length > 0 && (
          <div>
            <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Blocks
            </div>
            {blocks.map(renderItem)}
          </div>
        )}
        {inserts.length > 0 && (
          <div>
            <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-t border-slate-100/80 dark:border-slate-700/60 mt-1">
              Insert
            </div>
            {inserts.map(renderItem)}
          </div>
        )}
      </div>
    )
  }
)

SlashCommandMenu.displayName = "SlashCommandMenu"
