import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, Table2, Quote, Minus,
  Image, FileInput, LayoutTemplate, BookOpen,
  Sparkles, Wand2, FileText,
  Command,
} from "lucide-react"
import type { SlashCommandItem } from "./extensions/SlashCommands"

interface SlashCommandMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

// Map slash command IDs to Lucide icons + colors
const ICON_MAP: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  "heading1":      { icon: Heading1,       color: "#6366f1", bg: "#eef2ff" },
  "heading2":      { icon: Heading2,       color: "#6366f1", bg: "#eef2ff" },
  "heading3":      { icon: Heading3,       color: "#6366f1", bg: "#eef2ff" },
  "bullet-list":   { icon: List,           color: "#0d9488", bg: "#f0fdfa" },
  "ordered-list":  { icon: ListOrdered,    color: "#0d9488", bg: "#f0fdfa" },
  "table":         { icon: Table2,         color: "#2563eb", bg: "#eff6ff" },
  "blockquote":    { icon: Quote,          color: "#d97706", bg: "#fffbeb" },
  "divider":       { icon: Minus,          color: "#94a3b8", bg: "#f8fafc" },
  "image":         { icon: Image,          color: "#7c3aed", bg: "#f5f3ff" },
  "import":        { icon: FileInput,      color: "#059669", bg: "#ecfdf5" },
  "template":      { icon: LayoutTemplate, color: "#ea580c", bg: "#fff7ed" },
  "qa-library":    { icon: BookOpen,       color: "#0284c7", bg: "#f0f9ff" },
  "ai-generate":   { icon: Sparkles,       color: "#10b981", bg: "#ecfdf5" },
  "ai-summarize":  { icon: FileText,       color: "#10b981", bg: "#ecfdf5" },
  "ai-rewrite":    { icon: Wand2,          color: "#10b981", bg: "#ecfdf5" },
}

function SlashIcon({ id, fallback }: { id: string; fallback: string }) {
  const mapping = ICON_MAP[id]
  if (mapping) {
    const Icon = mapping.icon
    return (
      <span
        className="w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0"
        style={{ background: mapping.bg, color: mapping.color }}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
    )
  }
  // Fallback to text badge
  return (
    <span className="w-6 h-6 flex items-center justify-center text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 flex-shrink-0">
      {fallback.slice(0, 2)}
    </span>
  )
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
        <div className="w-64 bg-white dark:bg-slate-800 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden slash-command-menu animate-fade-in-up">
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
              <Command className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">No matching commands</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Try a different keyword</p>
          </div>
        </div>
      )
    }

    // Group items by category
    const blocks = items.filter((i) => i.category === "blocks")
    const inserts = items.filter((i) => i.category === "insert")
    const aiItems = items.filter((i) => i.category === "ai")
    let globalIndex = 0

    const renderItem = (item: SlashCommandItem) => {
      const idx = globalIndex++
      const isSelected = idx === selectedIndex
      return (
        <button
          key={item.id}
          data-index={idx}
          onClick={() => selectItem(idx)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`relative w-full flex items-center gap-2.5 px-2 py-1.5 text-left transition-all rounded-lg mx-0.5 ${
            isSelected
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 shadow-sm"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          }`}
          style={{ width: "calc(100% - 4px)" }}
        >
          {/* Left accent on selection */}
          {isSelected && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-emerald-500 rounded-full" />
          )}
          <SlashIcon id={item.id} fallback={item.icon} />
          <div className="flex-1 min-w-0">
            <span className="text-[12px] font-medium block leading-tight">{item.label}</span>
            <span className={`text-[10px] leading-tight ${isSelected ? "text-emerald-500/70 dark:text-emerald-400/60" : "text-slate-400 dark:text-slate-500"}`}>{item.description}</span>
          </div>
          {isSelected && (
            <kbd className="text-[9px] text-emerald-400/70 flex-shrink-0 font-mono bg-emerald-100/60 dark:bg-emerald-900/40 rounded px-1">↵</kbd>
          )}
        </button>
      )
    }

    const SectionHeader = ({ label }: { label: string }) => (
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
        <span className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
      </div>
    )

    return (
      <div
        ref={menuRef}
        className="w-64 bg-white dark:bg-slate-800 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden max-h-80 overflow-y-auto slash-command-menu py-1 animate-fade-in-up"
      >
        {blocks.length > 0 && (
          <div>
            <SectionHeader label="Blocks" />
            {blocks.map(renderItem)}
          </div>
        )}
        {inserts.length > 0 && (
          <div className={blocks.length > 0 ? "mt-1 border-t border-slate-100/80 dark:border-slate-700/60" : ""}>
            <SectionHeader label="Insert" />
            {inserts.map(renderItem)}
          </div>
        )}
        {aiItems.length > 0 && (
          <div className={(blocks.length > 0 || inserts.length > 0) ? "mt-1 border-t border-slate-100/80 dark:border-slate-700/60" : ""}>
            <SectionHeader label="AI" />
            {aiItems.map(renderItem)}
          </div>
        )}
        {/* Keyboard hint footer */}
        <div className="flex items-center gap-3 px-3 py-2 mt-0.5 border-t border-slate-100/80 dark:border-slate-700/60">
          <span className="text-[9px] text-slate-300 dark:text-slate-600 flex items-center gap-1">
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span className="text-[9px] text-slate-300 dark:text-slate-600 flex items-center gap-1">
            <kbd className="font-mono">↵</kbd> select
          </span>
          <span className="text-[9px] text-slate-300 dark:text-slate-600 flex items-center gap-1">
            <kbd className="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    )
  }
)

SlashCommandMenu.displayName = "SlashCommandMenu"
