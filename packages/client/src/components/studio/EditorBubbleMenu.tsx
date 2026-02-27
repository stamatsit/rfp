import { useState, useRef, useEffect, useCallback } from "react"
import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/react"
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  ChevronDown, Sparkles, Type, Link2, Link2Off,
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

// Color palette for text/highlight
const TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Slate", value: "#475569" },
  { label: "Gray", value: "#6b7280" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Amber", value: "#d97706" },
  { label: "Emerald", value: "#059669" },
  { label: "Teal", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
]

const HIGHLIGHT_COLORS = [
  { label: "None", value: "" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Violet", value: "#ddd6fe" },
  { label: "Red", value: "#fecaca" },
  { label: "Orange", value: "#fed7aa" },
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
  const [openMenu, setOpenMenu] = useState<"block" | "font" | "size" | "color" | "link" | null>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const linkInputRef = useRef<HTMLInputElement>(null)

  const toggleMenu = (menu: "block" | "font" | "size" | "color" | "link") => {
    setOpenMenu((prev) => (prev === menu ? null : menu))
  }

  const closeMenu = () => setOpenMenu(null)

  // Pre-fill link URL when opening link popover
  useEffect(() => {
    if (openMenu === "link") {
      const existingHref = editor.getAttributes("link").href || ""
      setLinkUrl(existingHref)
      setTimeout(() => linkInputRef.current?.focus(), 50)
    }
  }, [openMenu, editor])

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

  // ── Text color ──
  const currentColor = (editor.getAttributes("textStyle")?.color as string) || ""

  const setTextColor = useCallback((color: string) => {
    if (color) {
      editor.chain().focus().setColor(color).run()
    } else {
      editor.chain().focus().unsetColor().run()
    }
    closeMenu()
  }, [editor])

  const setHighlight = useCallback((color: string) => {
    if (color) {
      editor.chain().focus().setHighlight({ color }).run()
    } else {
      editor.chain().focus().unsetHighlight().run()
    }
    closeMenu()
  }, [editor])

  // ── Link ──
  const applyLink = useCallback(() => {
    const url = linkUrl.trim()
    if (url) {
      const href = url.startsWith("http") ? url : `https://${url}`
      editor.chain().focus().setLink({ href }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    closeMenu()
  }, [editor, linkUrl])

  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run()
    closeMenu()
  }, [editor])

  const currentBlock = BLOCK_TYPES.find((b) => b.id === getCurrentBlockType()) || BLOCK_TYPES[0]!

  // Detect if current selection has explicit left-align or is default (no alignment set)
  const isLeftAlign = editor.isActive({ textAlign: "left" })
  const isCenter = editor.isActive({ textAlign: "center" })
  const isRight = editor.isActive({ textAlign: "right" })

  return (
    <BubbleMenu editor={editor} updateDelay={100}>
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-white/97 dark:bg-slate-800/97 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.07)] backdrop-blur-xl animate-fade-in-up">

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
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {cat}
                  </div>
                  {fontsInCat.map((font) => {
                    const isActive = currentFontFamily && font.css.includes(currentFontFamily)
                    return (
                      <button
                        key={font.value}
                        onClick={() => setFont(font)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors flex items-center justify-between ${
                          isActive
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                        style={{ fontFamily: font.css }}
                      >
                        <span>{font.name}</span>
                        {isActive && <span className="text-emerald-500 text-[10px]">✓</span>}
                      </button>
                    )
                  })}
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

        {/* Bold / Italic / Underline / Strikethrough */}
        <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
          <Bold className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
          <Italic className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </BubbleBtn>

        <Separator />

        {/* Text color / highlight picker */}
        <Dropdown
          open={openMenu === "color"}
          onClose={closeMenu}
          anchor={
            <button
              onClick={() => toggleMenu("color")}
              className="flex items-center gap-0.5 px-1.5 h-7 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
              title="Text color & highlight"
            >
              <span
                className="w-3.5 h-3.5 rounded-sm border border-slate-300 dark:border-slate-600 flex-shrink-0"
                style={{ background: currentColor || "#1e293b" }}
              />
              <ChevronDown className={`w-2 h-2 flex-shrink-0 transition-transform ${openMenu === "color" ? "rotate-180" : ""}`} />
            </button>
          }
        >
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 px-3 z-50 w-48">
            {/* Text color */}
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Text color</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value || "default"}
                  onClick={() => setTextColor(c.value)}
                  title={c.label}
                  className={`w-5 h-5 rounded-md border transition-all hover:scale-110 ${
                    currentColor === c.value
                      ? "ring-2 ring-emerald-500 ring-offset-1"
                      : "border-slate-200 dark:border-slate-600"
                  }`}
                  style={{ background: c.value || "#1e293b" }}
                />
              ))}
            </div>
            {/* Highlight */}
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Highlight</p>
            <div className="flex flex-wrap gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value || "none"}
                  onClick={() => setHighlight(c.value)}
                  title={c.label}
                  className={`w-5 h-5 rounded-md border transition-all hover:scale-110 ${
                    c.value === ""
                      ? "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700"
                      : "border-slate-200 dark:border-slate-600"
                  }`}
                  style={{ background: c.value || undefined }}
                >
                  {c.value === "" && (
                    <span className="text-slate-400 text-[9px] flex items-center justify-center h-full">✕</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Dropdown>

        {/* Link button */}
        <Dropdown
          open={openMenu === "link"}
          onClose={closeMenu}
          anchor={
            <BubbleBtn
              active={editor.isActive("link")}
              onClick={() => toggleMenu("link")}
              title="Insert link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </BubbleBtn>
          }
        >
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-2.5 z-50 w-64">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Link URL</p>
            <div className="flex gap-1.5">
              <input
                ref={linkInputRef}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); applyLink() }
                  if (e.key === "Escape") closeMenu()
                }}
                placeholder="https://..."
                className="flex-1 h-7 px-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
              <button
                onClick={applyLink}
                className="h-7 px-2 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-md transition-colors"
              >
                Apply
              </button>
            </div>
            {editor.isActive("link") && (
              <button
                onClick={removeLink}
                className="mt-1.5 flex items-center gap-1 text-[10px] text-red-400 hover:text-red-500 transition-colors"
              >
                <Link2Off className="w-3 h-3" />
                Remove link
              </button>
            )}
          </div>
        </Dropdown>

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

        {/* Alignment — only show active if explicitly set */}
        <BubbleBtn active={isLeftAlign} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
          <AlignLeft className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={isCenter} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
          <AlignCenter className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn active={isRight} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
          <AlignRight className="w-3.5 h-3.5" />
        </BubbleBtn>

        {/* AI Edit button */}
        {onTriggerAI && (
          <>
            <Separator />
            <button
              onClick={onTriggerAI}
              className="relative flex items-center gap-1 px-2.5 h-7 text-[10px] font-bold text-white rounded-lg overflow-hidden transition-all hover:scale-[1.03] active:scale-95 shadow-sm shadow-emerald-500/20"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #0d9488 100%)" }}
              title="AI Edit — rewrite, improve, expand selection"
            >
              <Sparkles className="w-3 h-3" />
              AI Edit
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}
