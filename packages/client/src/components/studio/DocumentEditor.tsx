import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { LayoutTemplate, Upload, Sparkles, ZoomIn, ZoomOut } from "lucide-react"
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react"
import type { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Placeholder from "@tiptap/extension-placeholder"
import { TextStyle } from "@tiptap/extension-text-style"
import { FontFamily } from "@tiptap/extension-font-family"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import tippy, { type Instance as TippyInstance } from "tippy.js"
import { ResizableImage } from "./extensions/ResizableImage"
import { FontSize } from "./extensions/FontSize"
import { ReviewCommentsExtension, reviewCommentsPluginKey } from "./extensions/ReviewComments"
import { CommentPopover } from "./CommentPopover"
import { InlineAIToolbar } from "./InlineAIToolbar"
import { EditorBubbleMenu } from "./EditorBubbleMenu"
import { SlashCommands, createSlashCommandItems } from "./extensions/SlashCommands"
import { SlashCommandMenu, type SlashCommandMenuRef } from "./SlashCommandMenu"
import type { SlashCommandItem } from "./extensions/SlashCommands"
import type { ReviewAnnotation } from "@/types/chat"
import type { FormatSettings, LetterheadConfig } from "@/types/studio"
import { getFontDef, legacyFontToValue, legacySizeToValue, loadAllGoogleFonts } from "./fonts"
import "./tiptap-editor.css"

interface DocumentEditorProps {
  content: string
  onContentChange: (content: string) => void
  formatSettings: FormatSettings
  editorRef?: React.MutableRefObject<Editor | null>
  annotations?: ReviewAnnotation[]
  onResolveAnnotation?: (id: string) => void
  onApplyAnnotationFix?: (id: string) => void
  onOpenTemplates?: () => void
  onImportFile?: () => void
  onFocusChat?: () => void
  onOpenPhotos?: () => void
  onOpenAssets?: () => void
  onOpenQALibrary?: () => void
}

// 8.5 x 11 inches at 96 DPI
const PAGE_WIDTH = 816
const PAGE_HEIGHT = 1056

// ── Pagination types ──────────────────────────────────────
interface PageBlock {
  html: string
  height: number
  tagName: string
  isHeading: boolean
}

interface PaginatedPage {
  blocks: PageBlock[]
  totalContentHeight: number
}

// ── Format helpers ────────────────────────────────────────
function formatToCSS(f: FormatSettings): React.CSSProperties {
  const lineHeightMap: Record<string, string> = { tight: "1.4", normal: "1.6", relaxed: "1.8" }

  // Resolve font — handle both legacy ("sans"/"serif"/"mono") and new ("Inter"/"Georgia") values
  const fontValue = legacyFontToValue(f.fontFamily)
  const fontDef = getFontDef(fontValue)
  const fontSize = legacySizeToValue(f.fontSize)

  const base: React.CSSProperties = {
    fontFamily: fontDef.css,
    fontSize,
    lineHeight: lineHeightMap[f.lineHeight] || "1.6",
    textAlign: f.textAlign,
  }

  if (f.columnLayout === "two-column") {
    base.columnCount = 2
    base.columnGap = "32px"
  }

  return base
}

function getPageMarginPx(f: FormatSettings): number {
  // narrow = 0.5" (48px), normal = 1" (96px, MS Word default), wide = 1.25" (120px)
  const map = { narrow: 48, normal: 96, wide: 120 }
  return map[f.pageMargins]
}

function getHeaderHeight(f: FormatSettings): number {
  const lh = f.letterheadHeader
  if (lh?.mode === "full-image" && lh.fullImageData) return lh.fullImageHeight + 16
  if (lh?.mode === "logo-text" && (lh.logoData || lh.textFields?.companyName)) return 80
  if (f.headerStyle === "none") return 0
  return 40
}

function getFooterHeight(f: FormatSettings): number {
  const lf = f.letterheadFooter
  const baseH = (f.showPageNumbers || f.showFooter) ? 36 : 0
  if (lf?.mode === "full-image" && lf.fullImageData) return lf.fullImageHeight + 16 + baseH
  if (lf?.mode === "logo-text" && (lf.logoData || lf.textFields?.companyName)) return 60 + baseH
  return baseH
}

function getContentHeight(f: FormatSettings): number {
  const margin = getPageMarginPx(f)
  return PAGE_HEIGHT - getHeaderHeight(f) - getFooterHeight(f) - margin * 2
}

// ── Pagination engine ─────────────────────────────────────

function measureBlocks(
  html: string,
  formatSettings: FormatSettings,
  container: HTMLDivElement
): PageBlock[] {
  const marginPx = getPageMarginPx(formatSettings)
  const contentWidth = PAGE_WIDTH - marginPx * 2
  const css = formatToCSS(formatSettings)

  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: ${contentWidth}px;
    visibility: hidden;
    pointer-events: none;
    font-family: ${css.fontFamily};
    font-size: ${css.fontSize};
    line-height: ${css.lineHeight};
    text-align: ${css.textAlign};
  `
  if (formatSettings.columnLayout === "two-column") {
    container.style.columnCount = "2"
    container.style.columnGap = "32px"
  } else {
    container.style.columnCount = ""
  }

  container.className = "tiptap-editor"
  container.innerHTML = `<div class="ProseMirror">${html}</div>`

  const proseMirrorDiv = container.firstElementChild as HTMLElement
  if (!proseMirrorDiv) return []

  const children = Array.from(proseMirrorDiv.children) as HTMLElement[]

  return children.map((child) => {
    const rect = child.getBoundingClientRect()
    const computed = window.getComputedStyle(child)
    const mt = parseFloat(computed.marginTop) || 0
    const mb = parseFloat(computed.marginBottom) || 0

    return {
      html: child.outerHTML,
      height: rect.height + mt + mb,
      tagName: child.tagName,
      isHeading: /^H[1-3]$/i.test(child.tagName),
    }
  })
}

function paginateBlocks(
  blocks: PageBlock[],
  availableHeight: number
): PaginatedPage[] {
  const pages: PaginatedPage[] = []
  let currentBlocks: PageBlock[] = []
  let currentHeight = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const nextBlock: PageBlock | undefined = blocks[i + 1]

    if (block.height > availableHeight && currentBlocks.length === 0) {
      pages.push({ blocks: [block], totalContentHeight: block.height })
      continue
    }

    if (currentHeight + block.height <= availableHeight) {
      if (block.isHeading && nextBlock) {
        const remaining = availableHeight - currentHeight - block.height
        if (remaining < Math.min(nextBlock.height, 60)) {
          if (currentBlocks.length > 0) {
            pages.push({ blocks: currentBlocks, totalContentHeight: currentHeight })
          }
          currentBlocks = [block]
          currentHeight = block.height
          continue
        }
      }

      currentBlocks.push(block)
      currentHeight += block.height
    } else {
      if (currentBlocks.length > 0) {
        pages.push({ blocks: currentBlocks, totalContentHeight: currentHeight })
      }
      currentBlocks = [block]
      currentHeight = block.height
    }
  }

  if (currentBlocks.length > 0) {
    pages.push({ blocks: currentBlocks, totalContentHeight: currentHeight })
  }

  return pages.length > 0 ? pages : [{ blocks: [], totalContentHeight: 0 }]
}

// ── Page chrome components ────────────────────────────────

function LetterheadBlock({ config, colorAccent, position }: { config: LetterheadConfig; colorAccent: string; position: "header" | "footer" }) {
  const dividerColor = config.dividerColor || colorAccent
  const justify = config.alignment === "center" ? "center" : config.alignment === "right" ? "flex-end" : "flex-start"

  if (config.mode === "full-image" && config.fullImageData) {
    return (
      <div style={{ height: config.fullImageHeight + 16, padding: 8 }}>
        <img
          src={config.fullImageData}
          alt="Letterhead"
          style={{
            width: "100%",
            height: config.fullImageHeight,
            objectFit: "contain",
            objectPosition: config.alignment,
          }}
        />
        {config.showDivider && (
          <div style={{
            [position === "header" ? "borderBottom" : "borderTop"]: `2px solid ${dividerColor}`,
            marginTop: position === "header" ? 4 : 0,
            marginBottom: position === "footer" ? 4 : 0,
          }} />
        )}
      </div>
    )
  }

  if (config.mode === "logo-text") {
    const t = config.textFields
    const hasContent = config.logoData || t.companyName
    if (!hasContent) return null

    const infoLine = [t.address, t.phone, t.email, t.website].filter(Boolean).join("  ·  ")

    return (
      <div>
        <div
          className="px-8"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: justify,
            gap: 12,
            paddingTop: position === "header" ? 12 : 8,
            paddingBottom: position === "header" ? 8 : 12,
          }}
        >
          {config.logoData && (
            <img src={config.logoData} alt="Logo" style={{ width: config.logoWidth, height: "auto", flexShrink: 0 }} />
          )}
          <div style={{ textAlign: config.alignment }}>
            {t.companyName && <div className="text-[12px] font-bold text-slate-800 dark:text-white leading-tight">{t.companyName}</div>}
            {t.tagline && <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{t.tagline}</div>}
            {infoLine && (
              <div className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{infoLine}</div>
            )}
          </div>
        </div>
        {config.showDivider && (
          <div className="mx-8" style={{
            [position === "header" ? "borderBottom" : "borderTop"]: `2px solid ${dividerColor}`,
          }} />
        )}
      </div>
    )
  }

  return null
}

function PageHeader({ format, title }: { format: FormatSettings; title: string }) {
  // Letterhead header overrides old headerStyle
  const lh = format.letterheadHeader
  if (lh?.mode && lh.mode !== "none") {
    return <LetterheadBlock config={lh} colorAccent={format.colorAccent} position="header" />
  }

  // Legacy header styles
  if (format.headerStyle === "none") return null

  if (format.headerStyle === "minimal") {
    return (
      <div className="flex items-center justify-between px-8 pt-4 pb-2 text-[10px] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
        <span>{title}</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-8 pt-4 pb-2 border-b-2" style={{ borderColor: format.colorAccent }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded" style={{ background: format.colorAccent }} />
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: format.colorAccent }}>STAMATS</span>
      </div>
      <span className="text-[10px] text-slate-400 dark:text-slate-500">{title} &middot; {new Date().toLocaleDateString()}</span>
    </div>
  )
}

function PageFooter({ format, pageNum, totalPages }: { format: FormatSettings; pageNum: number; totalPages: number }) {
  const lf = format.letterheadFooter
  const hasLetterhead = lf?.mode && lf.mode !== "none"
  const hasPageInfo = format.showPageNumbers || format.showFooter

  if (!hasLetterhead && !hasPageInfo) return null

  return (
    <div className="absolute bottom-0 left-0 right-0">
      {hasLetterhead && (
        <LetterheadBlock config={lf} colorAccent={format.colorAccent} position="footer" />
      )}
      {hasPageInfo && (
        <div className="flex items-center justify-between px-8 py-3 text-[10px] text-slate-400 dark:text-slate-500">
          {format.showFooter ? <span>Confidential</span> : <span />}
          {format.showPageNumbers && <span>Page {pageNum} of {totalPages}</span>}
        </div>
      )}
    </div>
  )
}

// ── Rendered page of paginated blocks ─────────────────────

function PaginatedPageView({
  page,
  pageNum,
  totalPages,
  formatSettings,
  contentHeight,
  marginPx,
  pageStyle,
}: {
  page: PaginatedPage
  pageNum: number
  totalPages: number
  formatSettings: FormatSettings
  contentHeight: number
  marginPx: number
  pageStyle: React.CSSProperties
}) {
  return (
    <div
      id={`studio-page-${pageNum - 1}`}
      className="relative bg-white dark:bg-slate-900 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
      style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, overflow: "hidden" }}
    >
      <PageHeader format={formatSettings} title="Document" />
      <div
        style={{
          height: contentHeight,
          padding: `${marginPx}px ${marginPx}px`,
          overflow: "hidden",
        }}
      >
        <div className="tiptap-editor" style={pageStyle}>
          <div
            className="ProseMirror"
            dangerouslySetInnerHTML={{
              __html: page.blocks.map((b) => b.html).join(""),
            }}
          />
        </div>
      </div>
      <PageFooter format={formatSettings} pageNum={pageNum} totalPages={totalPages} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────

export function DocumentEditor({
  content,
  onContentChange,
  formatSettings,
  editorRef,
  annotations,
  onResolveAnnotation,
  onApplyAnnotationFix: _onApplyAnnotationFix,
  onOpenTemplates,
  onImportFile,
  onFocusChat,
  onOpenPhotos,
  onOpenAssets: _onOpenAssets,
  onOpenQALibrary,
}: DocumentEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const hiddenMeasureRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [paginatedPages, setPaginatedPages] = useState<PaginatedPage[]>([])
  const lastEmittedContent = useRef(content)
  const [activeAnnotation, setActiveAnnotation] = useState<{ annotation: ReviewAnnotation; position: { top: number; left: number } } | null>(null)
  const [inlineAI, setInlineAI] = useState<{ selectedText: string; position: { top: number; left: number }; from: number; to: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2]
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const next = ZOOM_STEPS.find((s) => s > z + 0.001)
      return next ?? z
    })
  }, [])
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const prev = [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001)
      return prev ?? z
    })
  }, [])
  const zoomReset = useCallback(() => setZoom(1), [])

  // Ctrl/Cmd+scroll to zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.05 : 0.05
        return Math.max(0.5, Math.min(2, Math.round((z + delta) * 100) / 100))
      })
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  const contentHeight = getContentHeight(formatSettings)
  const marginPx = getPageMarginPx(formatSettings)
  const pageStyle = formatToCSS(formatSettings)
  const availableHeight = contentHeight

  // Slash command items with modal callbacks
  const slashItems = useMemo(
    () =>
      createSlashCommandItems({
        onOpenPhotos,
        onOpenTemplates,
        onOpenQALibrary,
        onImportFile,
      }),
    [onOpenPhotos, onOpenTemplates, onOpenQALibrary, onImportFile]
  )

  // Load Google Fonts once on mount
  useEffect(() => { loadAllGoogleFonts() }, [])

  // TipTap editor — always editable
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Start writing, or type / for commands...",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ResizableImage,
      ReviewCommentsExtension,
      SlashCommands.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            return slashItems.filter((item) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            )
          },
          render: () => {
            let component: ReactRenderer<SlashCommandMenuRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
              onStart: (props: { editor: Editor; clientRect: (() => DOMRect | null) | null; items: SlashCommandItem[]; command: (item: SlashCommandItem) => void }) => {
                component = new ReactRenderer(SlashCommandMenu, {
                  props: { items: props.items, command: props.command },
                  editor: props.editor,
                })

                const getReferenceClientRect = props.clientRect

                popup = tippy("body", {
                  getReferenceClientRect: getReferenceClientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                  offset: [0, 4],
                })
              },

              onUpdate(props: { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void; clientRect: (() => DOMRect | null) | null }) {
                component?.updateProps({ items: props.items, command: props.command })
                if (popup?.[0]) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                  })
                }
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide()
                  return true
                }
                return component?.ref?.onKeyDown(props.event) ?? false
              },

              onExit() {
                popup?.[0]?.destroy()
                component?.destroy()
              },
            }
          },
        },
      }),
    ],
    content: content || "<p></p>",
    editable: true,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      lastEmittedContent.current = html
      onContentChange(html)
    },
  })

  // Expose editor to parent via ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor
    }
    return () => {
      if (editorRef) editorRef.current = null
    }
  }, [editor, editorRef])

  // Sync annotations to ProseMirror plugin
  useEffect(() => {
    if (!editor) return
    const tr = editor.state.tr.setMeta(reviewCommentsPluginKey, annotations || [])
    editor.view.dispatch(tr)
  }, [editor, annotations])

  // Handle click on review highlight to show popover
  const handleEditorClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    const highlightEl = target.closest(".review-highlight")
    if (!highlightEl || !annotations?.length) {
      setActiveAnnotation(null)
      return
    }
    const id = highlightEl.getAttribute("data-annotation-id")
    const ann = annotations.find((a) => a.id === id)
    if (ann) {
      const rect = highlightEl.getBoundingClientRect()
      setActiveAnnotation({ annotation: ann, position: { top: rect.bottom, left: rect.left } })
    }
  }, [annotations])

  useEffect(() => {
    if (!editor?.view?.dom) return
    const dom = editor.view.dom
    dom.addEventListener("click", handleEditorClick)
    return () => dom.removeEventListener("click", handleEditorClick)
  }, [editor, handleEditorClick])

  // Helper: get reliable position for the end of a selection, even for multi-block selections
  const getSelectionPosition = useCallback((ed: Editor, from: number, to: number): { top: number; left: number } | null => {
    // Try getBoundingClientRect from the DOM selection first
    const domSel = window.getSelection()
    if (domSel && domSel.rangeCount > 0) {
      const range = domSel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      // Check if the rect is valid (not zero-size, not off-screen)
      if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
        return { top: rect.bottom + 8, left: rect.left }
      }
    }

    // Fallback: use TipTap's coordsAtPos for the end of the selection
    try {
      const endCoords = ed.view.coordsAtPos(to)
      return { top: endCoords.bottom + 8, left: endCoords.left }
    } catch {
      // Last fallback: use the start of the selection
      try {
        const startCoords = ed.view.coordsAtPos(from)
        return { top: startCoords.bottom + 8, left: startCoords.left }
      } catch {
        return null
      }
    }
  }, [])

  // Detect text selection for inline AI toolbar
  useEffect(() => {
    if (!editor?.view?.dom) return
    const dom = editor.view.dom

    const handleMouseUp = () => {
      setTimeout(() => {
        if (!editor) return
        const { from, to } = editor.state.selection
        if (to - from < 3) {
          if (inlineAI) setInlineAI(null)
          return
        }

        const selectedText = editor.state.doc.textBetween(from, to, " ")
        if (selectedText.trim().length < 3) {
          if (inlineAI) setInlineAI(null)
          return
        }

        const position = getSelectionPosition(editor, from, to)
        if (!position) return

        setInlineAI({
          selectedText: selectedText.trim(),
          position,
          from,
          to,
        })
      }, 10)
    }

    dom.addEventListener("mouseup", handleMouseUp)
    return () => dom.removeEventListener("mouseup", handleMouseUp)
  }, [editor, inlineAI, getSelectionPosition])

  // Handle inline AI apply — replace selected text
  const handleInlineAIApply = useCallback((newText: string) => {
    if (!editor || !inlineAI) return
    const { from, to } = inlineAI
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, newText).run()
    setInlineAI(null)
  }, [editor, inlineAI])

  // Sync external content changes (undo/redo, insertContent, replaceContent) to editor
  useEffect(() => {
    if (!editor) return
    if (content !== lastEmittedContent.current) {
      const { from, to } = editor.state.selection
      editor.commands.setContent(content || "<p></p>", { emitUpdate: false })
      try {
        const maxPos = editor.state.doc.content.size
        editor.commands.setTextSelection({
          from: Math.min(from, maxPos),
          to: Math.min(to, maxPos),
        })
      } catch {
        // Position out of range
      }
      lastEmittedContent.current = content
    }
  }, [content, editor])

  // ── Smart pagination measurement ───────────────────────
  useEffect(() => {
    if (!hiddenMeasureRef.current) return

    const html = editor?.getHTML() || content
    if (!html || html === "<p></p>") {
      setPaginatedPages([{ blocks: [], totalContentHeight: 0 }])
      setPageCount(1)
      return
    }

    const raf = requestAnimationFrame(() => {
      if (!hiddenMeasureRef.current) return
      const blocks = measureBlocks(html, formatSettings, hiddenMeasureRef.current)
      const pages = paginateBlocks(blocks, availableHeight)
      setPaginatedPages(pages)
      setPageCount(pages.length)
    })

    return () => cancelAnimationFrame(raf)
  }, [content, formatSettings, availableHeight, editor])

  // Re-paginate on resize
  useEffect(() => {
    const handleResize = () => {
      if (!hiddenMeasureRef.current) return
      const html = editor?.getHTML() || content
      if (!html || html === "<p></p>") return
      const blocks = measureBlocks(html, formatSettings, hiddenMeasureRef.current)
      const pages = paginateBlocks(blocks, availableHeight)
      setPaginatedPages(pages)
      setPageCount(pages.length)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [availableHeight, formatSettings, content, editor])

  // Track current page via scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const page = Math.floor(scrollRef.current.scrollTop / (PAGE_HEIGHT + 48)) + 1  // space-y-12 = 48px
    setCurrentPage(Math.min(page, pageCount))
  }, [pageCount])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  const scrollToPage = (pageNum: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({ top: (pageNum - 1) * (PAGE_HEIGHT + 48), behavior: "smooth" })
  }

  const totalPages = paginatedPages.length || 1

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0c1222]">
      {/* Hidden measurement div */}
      <div
        ref={hiddenMeasureRef}
        aria-hidden
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: PAGE_WIDTH - marginPx * 2,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      />

      {/* Document canvas */}
      <div ref={scrollRef} className="flex-1 overflow-auto py-8">
        <div
          id="document-preview"
          className="mx-auto space-y-12"
          style={{
            width: `${PAGE_WIDTH}px`,
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            marginBottom: zoom !== 1 ? `${(PAGE_HEIGHT + 48) * (zoom - 1)}px` : undefined,
          }}
        >

          {/* Page 0: Live TipTap editor */}
          <div
            id="studio-page-0"
            className="relative bg-white dark:bg-slate-900 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
            style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, overflow: "hidden" }}
          >
            <PageHeader format={formatSettings} title="Document" />
            <div
              className="overflow-hidden"
              style={{ height: contentHeight, padding: `0 ${marginPx}px` }}
            >
              <div
                ref={measureRef}
                className="tiptap-editor"
                style={{ ...pageStyle, paddingTop: marginPx, paddingBottom: marginPx }}
              >
                {editor ? (
                  <>
                    <EditorContent editor={editor} />
                    {/* BubbleMenu for formatting on text selection */}
                    <EditorBubbleMenu
                      editor={editor}
                      onTriggerAI={() => {
                        const { from, to } = editor.state.selection
                        if (to - from < 3) return
                        const selectedText = editor.state.doc.textBetween(from, to, " ")
                        if (selectedText.trim().length < 3) return
                        const position = getSelectionPosition(editor, from, to)
                        if (!position) return
                        setInlineAI({
                          selectedText: selectedText.trim(),
                          position,
                          from,
                          to,
                        })
                      }}
                    />
                    {/* Empty state overlay */}
                    {(!content || content === "<p></p>") && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: marginPx + getHeaderHeight(formatSettings) }}>
                        <div className="text-center pointer-events-auto">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
                            <Sparkles className="w-7 h-7 text-white" />
                          </div>
                          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">Start a new document</p>
                          <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">Choose how you'd like to begin</p>
                          <div className="flex gap-4 justify-center">
                            {onOpenTemplates && (
                              <button
                                onClick={onOpenTemplates}
                                className="flex flex-col items-center gap-2.5 w-36 py-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                              >
                                <LayoutTemplate className="w-6 h-6 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                                <div>
                                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 block">Template</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Use a template</span>
                                </div>
                              </button>
                            )}
                            {onImportFile && (
                              <button
                                onClick={onImportFile}
                                className="flex flex-col items-center gap-2.5 w-36 py-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                              >
                                <Upload className="w-6 h-6 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                                <div>
                                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 block">Import</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Upload a file</span>
                                </div>
                              </button>
                            )}
                            {onFocusChat && (
                              <button
                                onClick={onFocusChat}
                                className="flex flex-col items-center gap-2.5 w-36 py-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                              >
                                <Sparkles className="w-6 h-6 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                                <div>
                                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 block">Ask AI</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Let AI write it</span>
                                </div>
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-6">
                            or start typing &mdash; press <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-mono">/</kbd> for commands
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[600px] text-slate-300 dark:text-slate-600">
                    <p className="text-sm">Loading editor...</p>
                  </div>
                )}
              </div>
            </div>
            <PageFooter format={formatSettings} pageNum={1} totalPages={totalPages} />
          </div>

          {/* Pages 1+: Paginated overflow blocks */}
          {paginatedPages.slice(1).map((page, i) => (
            <PaginatedPageView
              key={i + 1}
              page={page}
              pageNum={i + 2}
              totalPages={totalPages}
              formatSettings={formatSettings}
              contentHeight={contentHeight}
              marginPx={marginPx}
              pageStyle={pageStyle}
            />
          ))}

        </div>
      </div>

      {/* Bottom bar — page nav + zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {/* Page navigator */}
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5 px-2 py-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-full shadow-lg shadow-black/[0.08] dark:shadow-black/30 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tabular-nums px-1.5">
              {currentPage}/{totalPages}
            </span>
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => scrollToPage(i + 1)}
                className={`w-6 h-5 text-[10px] rounded-full transition-all tabular-nums ${
                  currentPage === i + 1
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-full shadow-lg shadow-black/[0.08] dark:shadow-black/30 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="w-6 h-5 flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={zoomReset}
            className={`min-w-[40px] h-5 text-[10px] font-medium tabular-nums rounded-full transition-colors ${
              zoom === 1
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 2}
            className="w-6 h-5 flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom in"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Comment popover */}
      {activeAnnotation && (
        <CommentPopover
          annotation={activeAnnotation.annotation}
          position={activeAnnotation.position}
          onResolve={(id) => {
            onResolveAnnotation?.(id)
            setActiveAnnotation(null)
          }}
          onApplyFix={(id) => {
            const ann = annotations?.find((a) => a.id === id)
            if (ann?.suggestedFix && editor) {
              const text = editor.state.doc.textContent
              const idx = text.indexOf(ann.quote)
              if (idx !== -1) {
                const from = idx + 1
                const to = from + ann.quote.length
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, ann.suggestedFix).run()
              }
            }
            onResolveAnnotation?.(id)
            setActiveAnnotation(null)
          }}
          onClose={() => setActiveAnnotation(null)}
        />
      )}

      {/* Inline AI toolbar on text selection */}
      {inlineAI && (
        <InlineAIToolbar
          selectedText={inlineAI.selectedText}
          position={inlineAI.position}
          documentContext={content}
          onApply={handleInlineAIApply}
          onClose={() => setInlineAI(null)}
        />
      )}
    </div>
  )
}
