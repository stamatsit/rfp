/**
 * Pitch Deck Designer — Split-pane visual editor with AI chat sidebar.
 *
 * Left: AI chat generates/refines structured deck JSON.
 * Right: Slide thumbnails + large preview canvas with inline editing.
 * Restricted to eric.yerke@stamats.com (server-side guarded).
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { AppHeader } from "@/components/AppHeader"
import {
  SlidePreview, SlideThumbnailStrip, DeckToolbar, DeckChatSidebar,
  SpeakerNotesPanel, SlideTypePickerDialog,
} from "@/components/deck"
import { useDeckStore } from "@/hooks/useDeckStore"
import { toast } from "@/hooks/useToast"
import { addCsrfHeader } from "@/lib/csrfToken"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

const MIN_LEFT_WIDTH = 260
const MAX_LEFT_WIDTH = 600
const DEFAULT_LEFT_FRACTION = 0.26
const COLLAPSED_WIDTH = 48

export function PitchDeckDesigner() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const deck = useDeckStore()

  // Split-pane state
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftFraction, setLeftFraction] = useState(DEFAULT_LEFT_FRACTION)
  const isDraggingDivider = useRef(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [slidePickerOpen, setSlidePickerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Deep-link conversation loading
  useEffect(() => {
    const convId = searchParams.get("conv")
    if (convId) {
      navigate("/pitch-deck", { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resizable divider ──────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingDivider.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingDivider.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const width = rect.width
      const clamped = Math.max(MIN_LEFT_WIDTH / width, Math.min(MAX_LEFT_WIDTH / width, x / width))
      setLeftFraction(clamped)
    }
    const handleMouseUp = () => {
      if (isDraggingDivider.current) {
        isDraggingDivider.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === "z") {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "TEXTAREA" || tag === "INPUT") return
        const ce = (e.target as HTMLElement)?.contentEditable
        if (ce === "true") return
        e.preventDefault()
        if (e.shiftKey) deck.redo()
        else deck.undo()
      }
      if (meta && e.key === "d") {
        e.preventDefault()
        deck.duplicateSlide(deck.selectedIndex)
      }
      if (meta && e.key === "e") {
        e.preventDefault()
        handleExport()
      }
      if ((e.key === "Delete" || e.key === "Backspace") && meta) {
        e.preventDefault()
        deck.deleteSlide(deck.selectedIndex)
      }
      if (meta && e.key === "ArrowUp") {
        e.preventDefault()
        deck.moveSlideUp(deck.selectedIndex)
      }
      if (meta && e.key === "ArrowDown") {
        e.preventDefault()
        deck.moveSlideDown(deck.selectedIndex)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [deck])

  // ── Drag-and-drop reorder ──────────────────────────────────

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = parseInt(String(active.id).split("-")[1]!)
    const toIndex = parseInt(String(over.id).split("-")[1]!)
    deck.reorderSlides(fromIndex, toIndex)
  }, [deck])

  // ── Export to .pptx ────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const deckData = deck.getDeckData()
      const headers = await addCsrfHeader({ "Content-Type": "application/json" })
      const renderRes = await fetch(`${API_BASE}/pitch-deck/render`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ deckData }),
      })
      if (!renderRes.ok) throw new Error("Render failed")
      const { downloadId } = await renderRes.json()

      const downloadRes = await fetch(`${API_BASE}/pitch-deck/download/${downloadId}`, {
        credentials: "include",
      })
      if (!downloadRes.ok) throw new Error("Download failed")

      const blob = await downloadRes.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${deckData.deckTitle.replace(/[^a-zA-Z0-9 -]/g, "").trim() || "Pitch Deck"}.pptx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Deck exported!")
    } catch (err) {
      console.error("Export failed:", err)
      toast.error("Export failed. Try again.")
    } finally {
      setExporting(false)
    }
  }, [deck])

  // ── Current slide ──────────────────────────────────────────

  const currentSlide = deck.slides[deck.selectedIndex]

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SlideTypePickerDialog
        open={slidePickerOpen}
        onClose={() => setSlidePickerOpen(false)}
        onSelect={(type) => deck.addSlide(type, deck.selectedIndex)}
      />

      <div className="h-screen bg-slate-50/80 dark:bg-[#070c16] flex flex-col overflow-hidden">
        <AppHeader title="Pitch Deck Designer" />
        <DeckToolbar
          deck={deck}
          onAddSlide={() => setSlidePickerOpen(true)}
          onExport={handleExport}
          exporting={exporting}
        />

        {/* Split pane */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
          {/* Left: Chat sidebar */}
          <div
            style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : `${leftFraction * 100}%` }}
            className="flex-shrink-0 h-full overflow-hidden border-r border-slate-200/50 dark:border-slate-800/60 transition-[width] duration-200 ease-out"
          >
            <DeckChatSidebar
              deckStore={deck}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            />
          </div>

          {/* Resizable divider */}
          {!sidebarCollapsed && (
            <div
              onMouseDown={handleMouseDown}
              className="w-1 flex-shrink-0 cursor-col-resize group relative"
            >
              <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-10" />
              <div className="w-px h-full mx-auto transition-all duration-200 bg-slate-200/40 dark:bg-slate-700/30 group-hover:bg-blue-400/50 dark:group-hover:bg-blue-500/40 group-hover:w-[2px]" />
            </div>
          )}

          {/* Right: Canvas area */}
          <div className="flex-1 flex min-w-0">
            {/* Thumbnail strip */}
            <SlideThumbnailStrip
              slides={deck.slides}
              selectedIndex={deck.selectedIndex}
              onSelect={deck.selectSlide}
              onAddSlide={() => setSlidePickerOpen(true)}
            />

            {/* Slide preview + notes */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-100/60 dark:bg-slate-950/40">
              {currentSlide ? (
                <SlidePreview
                  slide={currentSlide}
                  onUpdate={(partial) => deck.updateSlide(deck.selectedIndex, partial)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-400">No slide selected</p>
                </div>
              )}

              {/* Speaker notes */}
              {deck.showNotes && currentSlide && (
                <SpeakerNotesPanel
                  notes={currentSlide.speakerNotes || ""}
                  onChange={(notes) => deck.updateSlide(deck.selectedIndex, { speakerNotes: notes })}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  )
}
