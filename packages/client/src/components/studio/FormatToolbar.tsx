import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Columns2, Columns3, Minus, Plus, Type, List, ListOrdered, Heading2, Heading3, Pilcrow } from "lucide-react"
import type { Editor } from "@tiptap/react"
import type { FormatSettings, ColumnLayout, HeaderStyle } from "@/types/studio"

interface FormatToolbarProps {
  format: FormatSettings
  onUpdate: (partial: Partial<FormatSettings>) => void
  editor: Editor | null
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  )
}

function ToolbarSelect<T extends string>({
  value,
  options,
  onChange,
  title,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  title?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      title={title}
      className="h-7 px-1.5 text-xs bg-transparent border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
}

export function FormatToolbar({ format, onUpdate, editor }: FormatToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
      {/* Font Family */}
      <ToolbarSelect
        value={format.fontFamily}
        options={[
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
          { value: "mono", label: "Mono" },
        ]}
        onChange={(v) => onUpdate({ fontFamily: v })}
        title="Font family"
      />

      <Divider />

      {/* Font Size */}
      <ToolbarButton
        onClick={() => {
          const sizes: FormatSettings["fontSize"][] = ["small", "normal", "large", "xl"]
          const idx = sizes.indexOf(format.fontSize)
          if (idx > 0) onUpdate({ fontSize: sizes[idx - 1] })
        }}
        title="Decrease font size"
      >
        <Minus className="w-3.5 h-3.5" />
      </ToolbarButton>
      <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[28px] text-center">
        <Type className="w-3.5 h-3.5 inline" />
      </span>
      <ToolbarButton
        onClick={() => {
          const sizes: FormatSettings["fontSize"][] = ["small", "normal", "large", "xl"]
          const idx = sizes.indexOf(format.fontSize)
          if (idx < sizes.length - 1) onUpdate({ fontSize: sizes[idx + 1] })
        }}
        title="Increase font size"
      >
        <Plus className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Text Formatting — wired to TipTap */}
      <ToolbarButton
        active={editor?.isActive("bold") ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("italic") ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("underline") ?? false}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        title="Underline (Cmd+U)"
      >
        <Underline className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Block type — headings & paragraph */}
      <ToolbarButton
        active={editor?.isActive("paragraph") && !editor?.isActive("heading") ? true : false}
        onClick={() => editor?.chain().focus().setParagraph().run()}
        title="Paragraph"
      >
        <Pilcrow className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("heading", { level: 3 }) ?? false}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        active={editor?.isActive("bulletList") ?? false}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive("orderedList") ?? false}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Alignment — per-paragraph via TipTap */}
      <ToolbarButton
        active={editor?.isActive({ textAlign: "left" }) ?? false}
        onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        title="Align left"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive({ textAlign: "center" }) ?? false}
        onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        title="Align center"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive({ textAlign: "right" }) ?? false}
        onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        title="Align right"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Columns — document-level */}
      <ToolbarButton active={format.columnLayout === "single"} onClick={() => onUpdate({ columnLayout: "single" as ColumnLayout })} title="Single column">
        <div className="w-3.5 h-3.5 border border-current rounded-sm" />
      </ToolbarButton>
      <ToolbarButton active={format.columnLayout === "two-column"} onClick={() => onUpdate({ columnLayout: "two-column" as ColumnLayout })} title="Two columns">
        <Columns2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton active={format.columnLayout === "sidebar"} onClick={() => onUpdate({ columnLayout: "sidebar" as ColumnLayout })} title="Sidebar layout">
        <Columns3 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Line Height */}
      <ToolbarSelect
        value={format.lineHeight}
        options={[
          { value: "tight", label: "Tight" },
          { value: "normal", label: "Normal" },
          { value: "relaxed", label: "Relaxed" },
        ]}
        onChange={(v) => onUpdate({ lineHeight: v })}
        title="Line height"
      />

      {/* Margins */}
      <ToolbarSelect
        value={format.pageMargins}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "normal", label: "Normal" },
          { value: "wide", label: "Wide" },
        ]}
        onChange={(v) => onUpdate({ pageMargins: v })}
        title="Page margins"
      />

      <Divider />

      {/* Header style */}
      <ToolbarSelect
        value={format.headerStyle}
        options={[
          { value: "none", label: "No header" },
          { value: "minimal", label: "Minimal" },
          { value: "branded", label: "Branded" },
        ]}
        onChange={(v) => onUpdate({ headerStyle: v as HeaderStyle })}
        title="Header style"
      />

      {/* Page numbers toggle */}
      <ToolbarButton
        active={format.showPageNumbers}
        onClick={() => onUpdate({ showPageNumbers: !format.showPageNumbers })}
        title="Page numbers"
      >
        <span className="text-[10px] font-medium">#</span>
      </ToolbarButton>

      {/* Color accent */}
      <input
        type="color"
        value={format.colorAccent}
        onChange={(e) => onUpdate({ colorAccent: e.target.value })}
        title="Accent color"
        className="w-6 h-6 rounded cursor-pointer border border-slate-200 dark:border-slate-700"
      />
    </div>
  )
}
