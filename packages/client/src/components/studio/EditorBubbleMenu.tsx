import { useState, useRef, useEffect } from "react"
import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/react"
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  ChevronDown, Sparkles, Type,
} from "lucide-react"
import { FONTS, FONT_SIZES, loadGoogleFont, type FontDef } from "./fonts"

interface EditorBubbleMenuProps {
  editor: Editor
  onTriggerAI?: () => void
}

type BlockType = "paragraph" | "h1" | "h2" | "h3"

const BLOCK_TYPES: { id: BlockType; label: string; shortLabel: string }[] = [
  { id: "paragraph", label: "Paragraph", shortLabel: "P" },
  { id: "h1", label: "Heading 1", shortLabel: "H1" },
  { id: "h2", label: "Heading 2", shortLabel: "H2" },
  { id: "h3", label: "Heading 3", shortLabel: "H3" },
]

function Separator() {
  return <div className="w-px h-4 bg-slate-200/70 dark:bg-slate-600/70 mx-0.5" />
}

function BubbleBtn({
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
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  )
}

// ── Dropdown wrapper ─────────────────────────────────────
function Dropdown({ open, onClose, children, anchor }: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  anchor: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  return (
    <div className="relative" ref={ref}>
      {anchor}
      {open && children}
    </div>
  )
}

export function EditorBubbleMenu({ editor, onTriggerAI }: EditorBubbleMenuProps) {
  const [openMenu, setOpenMenu] = useState<"block" | "font" | "size" | null>(null)

  const toggleMenu = (menu: "block" | "font" | "size") => {
    setOpenMenu((prev) => (prev === menu ? null : menu))
  }

  const closeMenu = () => setOpenMenu(null)

  // ── Block type ──
  const getCurrentBlockType = (): BlockType => {
    if (editor.isActive("heading", { level: 1 })) return "h1"
    if (editor.isActive("heading", { level: 2 })) return "h2"
    if (editor.isActive("heading", { level: 3 })) return "h3"
    return "paragraph"
  }

  const setBlockType = (type: BlockType) => {
    switch (type) {
      case "paragraph": editor.chain().focus().setParagraph().run(); break
      case "h1": editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case "h2": editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case "h3": editor.chain().focus().toggleHeading({ level: 3 }).run(); break
    }
    closeMenu()
  }

  // ── Current font ──
  const currentFontFamily = (() => {
    const attrs = editor.getAttributes("textStyle")
    return (attrs?.fontFamily as string) || ""
  })()
  const currentFontName = FONTS.find((f) => f.css.includes(currentFontFamily))?.name
    || FONTS.find((f) => f.value === currentFontFamily)?.name
    || (currentFontFamily ? currentFontFamily.replace(/'/g, "").split(",")[0] : "Font")

  const setFont = (fontDef: FontDef) => {
    loadGoogleFont(fontDef)
    editor.chain().focus().setFontFamily(fontDef.css).run()
    closeMenu()
  }

  // ── Current size ──
  const currentFontSize = (() => {
    const attrs = editor.getAttributes("textStyle")
    return (attrs?.fontSize as string) || ""
  })()
  const currentSizeLabel = FONT_SIZES.find((s) => s.value === currentFontSize)?.label || currentFontSize.replace("px", "") || "—"

  const setSize = (size: string) => {
    editor.chain().focus().setFontSize(size).run()
    closeMenu()
  }

  const currentBlock = BLOCK_TYPES.find((b) => b.id === getCurrentBlockType()) || BLOCK_TYPES[0]!

  return (
    <BubbleMenu editor={editor} updateDelay={100}>
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-white dark:bg-slate-800 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl">

        {/* Font family dropdown */}
        <Dropdown
          open={openMenu === "font"}
          onClose={closeMenu}
          anchor={
            <button
              onClick={() => toggleMenu("font")}
              className="flex items-center gap-1 px-1.5 h-7 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors max-w-[90px]"
              title="Font family"
            >
              <Type className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{currentFontName}</span>
              <ChevronDown className={`w-2.5 h-2.5 flex-shrink-0 transition-transform ${openMenu === "font" ? "rotate-180" : ""}`} />
            </button>
          }
        >
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1 w-56 max-h-72 overflow-y-auto z-50">
            {(["sans", "serif", "mono", "display"] as const).map((cat) => {
              const fontsInCat = FONTS.filter((f) => f.category === cat)
              if (fontsInCat.length === 0) return null
              return (
                <div key={cat}>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {cat}
                  </div>
                  {fontsInCat.map((font) => (
                    <button
                      key={font.value}
                      onClick={() => setFont(font)}
                      className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                        currentFontFamily && font.css.includes(currentFontFamily)
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                      style={{ fontFamily: font.css }}
                    >
                      {font.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </Dropdown>

        {/* Font size dropdown */}
        <Dropdown
          open={openMenu === "size"}
          onClose={closeMenu}
          anchor={
            <button
              onClick={() => toggleMenu("size")}
              className="flex items-center gap-0.5 px-1.5 h-7 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors min-w-[32px] justify-center tabular-nums"
              title="Font size"
            >
              {currentSizeLabel}
              <ChevronDown className={`w-2.5 h-2.5 flex-shrink-0 transition-transform ${openMenu === "size" ? "rotate-180" : ""}`} />
            </button>
          }
        >
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1 w-20 max-h-64 overflow-y-auto z-50">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => setSize(size.value)}
                className={`w-full text-center px-2 py-1.5 text-[12px] transition-colors ${
                  currentFontSize === size.value
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
        </Dropdown>

        <Separator />

        {/* Bold / Italic / Underline */}
        <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
          <Bold className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
          <Italic className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </BubbleBtn>

        <Separator />

        {/* Block type dropdown */}
        <Dropdown
          open={openMenu === "block"}
          onClose={closeMenu}
          anchor={
            <button
              onClick={() => toggleMenu("block")}
              className="flex items-center gap-0.5 px-1.5 h-7 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              {currentBlock.shortLabel}
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${openMenu === "block" ? "rotate-180" : ""}`} />
            </button>
          }
        >
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 min-w-[120px] z-50">
            {BLOCK_TYPES.map((block) => (
              <button
                key={block.id}
                onClick={() => setBlockType(block.id)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  getCurrentBlockType() === block.id
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {block.label}
              </button>
            ))}
          </div>
        </Dropdown>

        <Separator />

        {/* Alignment */}
        <BubbleBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
          <AlignLeft className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
          <AlignCenter className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
          <AlignRight className="w-3.5 h-3.5" />
        </BubbleBtn>

        {/* AI Edit button */}
        {onTriggerAI && (
          <>
            <Separator />
            <button
              onClick={onTriggerAI}
              className="flex items-center gap-1 px-2 h-7 text-[10px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-md shadow-sm transition-all"
              title="AI Edit"
            >
              <Sparkles className="w-3 h-3" />
              AI
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}
