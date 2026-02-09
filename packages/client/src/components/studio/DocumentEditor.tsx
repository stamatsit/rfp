import { useState, useRef, useEffect, useCallback } from "react"
import { Eye, Code2, Pencil } from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import type { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Placeholder from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { ResizableImage } from "./extensions/ResizableImage"
import { ReviewCommentsExtension, reviewCommentsPluginKey } from "./extensions/ReviewComments"
import { CommentPopover } from "./CommentPopover"
import type { ReviewAnnotation } from "@/types/chat"
import type { FormatSettings } from "@/types/studio"
import "./tiptap-editor.css"

interface DocumentEditorProps {
  content: string
  onContentChange: (content: string) => void
  formatSettings: FormatSettings
  editorRef?: React.MutableRefObject<Editor | null>
  annotations?: ReviewAnnotation[]
  onResolveAnnotation?: (id: string) => void
  onApplyAnnotationFix?: (id: string) => void
}

// 8.5 x 11 inches at 96 DPI
const PAGE_WIDTH = 816
const PAGE_HEIGHT = 1056
const HEADER_HEIGHT = 40
const FOOTER_HEIGHT = 36

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
  const fontMap = { sans: "'Inter', sans-serif", serif: "'Georgia', serif", mono: "'JetBrains Mono', monospace" }
  const sizeMap = { small: "13px", normal: "15px", large: "17px", xl: "20px" }
  const lineHeightMap = { tight: "1.4", normal: "1.6", relaxed: "1.8" }

  const base: React.CSSProperties = {
    fontFamily: fontMap[f.fontFamily],
    fontSize: sizeMap[f.fontSize],
    lineHeight: lineHeightMap[f.lineHeight],
    textAlign: f.textAlign,
  }

  if (f.columnLayout === "two-column") {
    base.columnCount = 2
    base.columnGap = "32px"
  }

  return base
}

function getPageMarginPx(f: FormatSettings): number {
  const map = { narrow: 48, normal: 72, wide: 96 }
  return map[f.pageMargins]
}

function getContentHeight(f: FormatSettings): number {
  const margin = getPageMarginPx(f)
  const headerH = f.headerStyle === "none" ? 0 : HEADER_HEIGHT
  const footerH = (f.showPageNumbers || f.showFooter) ? FOOTER_HEIGHT : 0
  return PAGE_HEIGHT - headerH - footerH - margin * 2
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

  // Configure hidden measurement container to match page layout
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

    // Oversized block — give it its own page
    if (block.height > availableHeight && currentBlocks.length === 0) {
      pages.push({ blocks: [block], totalContentHeight: block.height })
      continue
    }

    // Would this block fit?
    if (currentHeight + block.height <= availableHeight) {
      // Heading orphan rule: don't leave a heading stranded at the bottom
      if (block.isHeading && nextBlock) {
        const remaining = availableHeight - currentHeight - block.height
        // If there's less than 60px (roughly 2-3 lines) for the next block, push heading to next page
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
      // Doesn't fit — start a new page
      if (currentBlocks.length > 0) {
        pages.push({ blocks: currentBlocks, totalContentHeight: currentHeight })
      }
      currentBlocks = [block]
      currentHeight = block.height
    }
  }

  // Flush remaining
  if (currentBlocks.length > 0) {
    pages.push({ blocks: currentBlocks, totalContentHeight: currentHeight })
  }

  return pages.length > 0 ? pages : [{ blocks: [], totalContentHeight: 0 }]
}

// ── Page chrome components ────────────────────────────────

function PageHeader({ format, title }: { format: FormatSettings; title: string }) {
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
  if (!format.showPageNumbers && !format.showFooter) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-3 text-[10px] text-slate-400 dark:text-slate-500">
      {format.showFooter ? <span>Confidential</span> : <span />}
      {format.showPageNumbers && <span>Page {pageNum} of {totalPages}</span>}
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
      className="relative bg-white dark:bg-slate-900 rounded shadow-lg shadow-slate-300/50 dark:shadow-slate-900/50"
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

export function DocumentEditor({ content, onContentChange, formatSettings, editorRef, annotations, onResolveAnnotation, onApplyAnnotationFix }: DocumentEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "source">("edit")
  const scrollRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const hiddenMeasureRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [paginatedPages, setPaginatedPages] = useState<PaginatedPage[]>([])
  const lastEmittedContent = useRef(content)
  const [activeAnnotation, setActiveAnnotation] = useState<{ annotation: ReviewAnnotation; position: { top: number; left: number } } | null>(null)

  const contentHeight = getContentHeight(formatSettings)
  const marginPx = getPageMarginPx(formatSettings)
  const pageStyle = formatToCSS(formatSettings)
  const availableHeight = contentHeight

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Click here to start writing, or deploy AI content from the chat",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ResizableImage,
      ReviewCommentsExtension,
    ],
    content: content || "<p></p>",
    editable: viewMode === "edit",
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

  // Toggle editable when view mode changes
  useEffect(() => {
    if (!editor) return
    editor.setEditable(viewMode === "edit")
  }, [viewMode, editor])

  // ── Smart pagination measurement ───────────────────────
  useEffect(() => {
    if (viewMode === "source") return
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
  }, [content, formatSettings, viewMode, availableHeight, editor])

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
    const page = Math.floor(scrollRef.current.scrollTop / (PAGE_HEIGHT + 48)) + 1
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

  // Source mode: direct HTML editing
  const [sourceValue, setSourceValue] = useState("")
  useEffect(() => {
    if (viewMode === "source") {
      setSourceValue(content)
    }
  }, [viewMode, content])

  const handleSourceBlur = () => {
    onContentChange(sourceValue)
    lastEmittedContent.current = sourceValue
    if (editor) {
      editor.commands.setContent(sourceValue || "<p></p>", { emitUpdate: false })
    }
  }

  const totalPages = paginatedPages.length || 1

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* Hidden measurement div for block height calculation */}
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

      {/* View toggle */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setViewMode("edit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            viewMode === "edit"
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => setViewMode("preview")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            viewMode === "preview"
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>
        <button
          onClick={() => setViewMode("source")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            viewMode === "source"
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          Source
        </button>

        {viewMode !== "source" && (
          <div className="ml-auto flex items-center gap-3">
            {annotations && annotations.length > 0 && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {annotations.length} {annotations.length === 1 ? "comment" : "comments"}
              </span>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {totalPages} {totalPages === 1 ? "page" : "pages"}
            </span>
          </div>
        )}
      </div>

      {viewMode === "source" ? (
        <div className="flex-1 overflow-y-auto py-8">
          <div className="mx-auto" style={{ width: `${PAGE_WIDTH}px` }}>
            <textarea
              value={sourceValue}
              onChange={(e) => setSourceValue(e.target.value)}
              onBlur={handleSourceBlur}
              className="w-full bg-white dark:bg-slate-900 rounded shadow-lg shadow-slate-300/50 dark:shadow-slate-900/50 min-h-[1056px] p-[72px] text-sm font-mono text-slate-700 dark:text-slate-300 border-none outline-none resize-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Write or paste HTML here..."
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        /* Paginated 8.5x11 view */
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-8">
            <div id="document-preview" className="mx-auto space-y-12" style={{ width: `${PAGE_WIDTH}px` }}>

              {viewMode === "edit" ? (
                <>
                  {/* Page 0: Live TipTap editor */}
                  <div
                    id="studio-page-0"
                    className="relative bg-white dark:bg-slate-900 rounded shadow-lg shadow-slate-300/50 dark:shadow-slate-900/50"
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
                          <EditorContent editor={editor} />
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
                </>
              ) : (
                /* Preview mode: all pages from paginated blocks */
                paginatedPages.map((page, i) => (
                  <PaginatedPageView
                    key={i}
                    page={page}
                    pageNum={i + 1}
                    totalPages={totalPages}
                    formatSettings={formatSettings}
                    contentHeight={contentHeight}
                    marginPx={marginPx}
                    pageStyle={pageStyle}
                  />
                ))
              )}

            </div>
          </div>

          {/* Page navigator */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => scrollToPage(i + 1)}
                  className={`w-8 h-6 text-[10px] rounded transition-colors ${
                    currentPage === i + 1
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium"
                      : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

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
              // Find and replace the quoted text
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
    </div>
  )
}
