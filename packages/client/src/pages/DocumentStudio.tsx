import { useState, useCallback, useRef, useEffect } from "react"
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import type { Editor } from "@tiptap/react"
import { X, FileText } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  StudioToolbar, StudioChatSidebar, DocumentEditor,
  FindReplace, ExportDialog, PhotoPicker, AssetPanel,
  VersionHistory, ShareDialog, QABrowser, InspectorPanel,
} from "@/components/studio"
import { useDocumentStore } from "@/hooks/useDocumentStore"
import { studioApi } from "@/lib/api"
import { markdownToHtml } from "@/lib/markdownToHtml"
import type { SharedUser } from "@/types/studio"

const MIN_LEFT_WIDTH = 280
const MAX_LEFT_WIDTH = 800
const DEFAULT_LEFT_FRACTION = 0.28
const COLLAPSED_WIDTH = 48

// ── Types ─────────────────────────────────────────────────
type ModalId = "find-replace" | "export" | "photos" | "assets" | "templates" | "version-history" | "share" | "qa-browser" | null
export type PanelTab = "format" | "outline" | "checklist" | null

// ── Seed templates ────────────────────────────────────────
const SEED_TEMPLATES = [
  { name: "Blank Document", content: "", category: "custom" as const },
  {
    name: "Proposal Response",
    content: "# Proposal Response\n\n## Executive Summary\n\n[Summarize your approach and key differentiators]\n\n## Understanding of the Project\n\n[Demonstrate understanding of the client's needs]\n\n## Proposed Solution\n\n[Detail your approach]\n\n## Team & Qualifications\n\n[Highlight relevant experience]\n\n## Timeline & Deliverables\n\n| Phase | Deliverable | Timeline |\n|-------|------------|----------|\n| Discovery | Research & Audit | Weeks 1-2 |\n| Strategy | Recommendations | Weeks 3-4 |\n| Implementation | Deliverables | Weeks 5-12 |\n\n## Investment\n\n[Fee structure]\n\n## Why Stamats\n\n[Key differentiators and proof points]",
    category: "proposal" as const,
  },
  {
    name: "Case Study",
    content: "# Case Study: [Client Name]\n\n## The Challenge\n\n[What problem did the client face?]\n\n## Our Approach\n\n[What strategy/solution did we propose?]\n\n## The Results\n\n- **[Metric]**: [Number/percentage improvement]\n- **[Metric]**: [Number/percentage improvement]\n- **[Metric]**: [Number/percentage improvement]\n\n## Client Testimonial\n\n> \"[Quote from client contact]\"\n>\n> — [Name], [Title], [Organization]",
    category: "case-study" as const,
  },
  {
    name: "Executive Summary",
    content: "# Executive Summary\n\n**Prepared for**: [Client Name]\n**Date**: " + new Date().toLocaleDateString() + "\n\n---\n\n## Overview\n\n[High-level summary of the engagement/findings]\n\n## Key Findings\n\n1. **[Finding 1]**: [Detail]\n2. **[Finding 2]**: [Detail]\n3. **[Finding 3]**: [Detail]\n\n## Recommendations\n\n| Priority | Action | Expected Impact |\n|----------|--------|----------------|\n| High | [Action] | [Impact] |\n| Medium | [Action] | [Impact] |\n| Low | [Action] | [Impact] |\n\n## Next Steps\n\n[Outline immediate next steps]",
    category: "report" as const,
  },
]

export function DocumentStudio() {
  const doc = useDocumentStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const [leftFraction, setLeftFraction] = useState(DEFAULT_LEFT_FRACTION)
  const isDraggingDivider = useRef(false)

  // Centralized modal & panel state
  const [activeModal, setActiveModal] = useState<ModalId>(null)
  const [inspectorTab, setInspectorTab] = useState<PanelTab>(null)

  const [rfpText, setRfpText] = useState<string | null>(null)
  const [sharedWith, setSharedWith] = useState<SharedUser[]>([])
  const [serverTemplates, setServerTemplates] = useState<Array<{ id: string; name: string; content: string; category: string }>>([])
  const [dragContent, setDragContent] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Load server templates
  useEffect(() => {
    studioApi.listTemplates().then((data) => {
      setServerTemplates(data as Array<{ id: string; name: string; content: string; category: string }>)
    }).catch(() => {})
  }, [])

  // Resizable divider
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === "s") {
        e.preventDefault()
        void doc.saveToServer()
      }
      if (meta && e.key === "z") {
        if (editorRef.current?.isFocused) return
        e.preventDefault()
        if (e.shiftKey) {
          doc.redo()
        } else {
          doc.undo()
        }
      }
      if (meta && e.key === "f") {
        e.preventDefault()
        setActiveModal((prev) => prev === "find-replace" ? null : "find-replace")
      }
      if (e.key === "Escape") {
        setActiveModal(null)
      }
      if (meta && e.shiftKey && e.key === "r") {
        e.preventDefault()
        doc.setMode(doc.mode === "review" ? "editor" : "review")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [doc])

  // Template selection
  const handleTemplateSelect = (template: { name: string; content: string }) => {
    doc.newDocument()
    doc.setTitle(template.name)
    if (template.content) doc.replaceContent(markdownToHtml(template.content))
    doc.setMode("editor")
    setActiveModal(null)
  }

  const handleSaveAsTemplate = async () => {
    try {
      await studioApi.createTemplate({
        name: doc.title,
        content: doc.content,
        formatSettings: doc.formatSettings,
        category: "custom",
      })
      const data = await studioApi.listTemplates()
      setServerTemplates(data as Array<{ id: string; name: string; content: string; category: string }>)
    } catch {
      // ignore
    }
  }

  const handleVersionRestore = (content: string, title: string) => {
    doc.replaceContent(content)
    doc.setTitle(title)
  }

  // Drag and drop
  const handleDragStart = (event: DragStartEvent) => {
    const content = event.active.data?.current?.content as string | undefined
    if (content) setDragContent(content)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDragContent(null)
    if (!event.over) return
    const content = event.active.data?.current?.content as string | undefined
    if (content && event.over.id === "document-drop-zone") {
      doc.insertContent(markdownToHtml(content))
    }
  }

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await studioApi.extractDocument(file)
      const htmlContent = markdownToHtml(result.text)
      doc.replaceContent(htmlContent)
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "")
      doc.setTitle(nameWithoutExt)
      doc.setMode("editor")
    } catch (err) {
      console.error("Import failed:", err)
    }
    e.target.value = ""
  }, [doc])

  const allTemplates = [...SEED_TEMPLATES, ...serverTemplates]

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <input
        ref={importInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        onChange={handleImportFile}
        className="hidden"
      />
      <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden">
        <AppHeader title="Document Studio" />
        <StudioToolbar
          mode={doc.mode}
          onModeChange={doc.setMode}
          title={doc.title}
          onTitleChange={doc.setTitle}
          saveStatus={doc.saveStatus}
          onExport={() => setActiveModal("export")}
          onShare={() => setActiveModal("share")}
          onToggleInspector={() => setInspectorTab(inspectorTab ? null : "format")}
          inspectorOpen={!!inspectorTab}
          hasDocumentId={!!doc.documentId}
        />

        {/* Split pane */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
          {/* Find & Replace overlay */}
          {activeModal === "find-replace" && (
            <FindReplace
              content={doc.content}
              onContentChange={doc.setContent}
              onClose={() => setActiveModal(null)}
            />
          )}

          {/* Left: Chat sidebar */}
          <div
            style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : `${leftFraction * 100}%` }}
            className="flex-shrink-0 h-full overflow-hidden border-r border-slate-200/60 dark:border-slate-700/60 transition-[width] duration-200"
          >
            <StudioChatSidebar
              documentStore={doc}
              onRFPDetected={setRfpText}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            />
          </div>

          {/* Resizable divider */}
          {!sidebarCollapsed && (
            <div
              onMouseDown={handleMouseDown}
              className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:w-2 transition-all"
            >
              <div className="w-px h-full bg-transparent group-hover:bg-emerald-400/60 dark:group-hover:bg-emerald-500/60 transition-colors duration-200" />
            </div>
          )}

          {/* Right: Document area + Inspector */}
          <div className="flex-1 flex min-w-0">
            <div className="flex-1 flex flex-col min-w-0">
              <DocumentEditor
                content={doc.content}
                onContentChange={doc.setContent}
                formatSettings={doc.formatSettings}
                editorRef={editorRef}
                annotations={doc.annotations}
                onResolveAnnotation={doc.resolveAnnotation}
                onOpenTemplates={() => setActiveModal("templates")}
                onImportFile={() => importInputRef.current?.click()}
                onFocusChat={() => {
                  if (sidebarCollapsed) setSidebarCollapsed(false)
                }}
                onOpenPhotos={() => setActiveModal("photos")}
                onOpenAssets={() => setActiveModal("assets")}
                onOpenQALibrary={() => setActiveModal("qa-browser")}
              />
            </div>

            {/* Inspector Panel (right sidebar) */}
            <InspectorPanel
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              format={doc.formatSettings}
              onUpdateFormat={doc.updateFormat}
              editor={editorRef.current}
              rfpText={rfpText}
              documentContent={doc.content}
              hasDocumentId={!!doc.documentId}
              onOpenHistory={() => setActiveModal("version-history")}
            />
          </div>
        </div>
      </div>

      {/* ── Modals (centralized) ─────────────────────────── */}
      {activeModal === "export" && (
        <ExportDialog title={doc.title} content={doc.content} formatSettings={doc.formatSettings} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "photos" && (
        <PhotoPicker onInsert={(html) => doc.insertContent(html)} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "assets" && (
        <AssetPanel onInsert={(content) => doc.insertContent(content)} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "qa-browser" && (
        <QABrowser onInsert={(content) => doc.insertContent(markdownToHtml(content))} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "version-history" && doc.documentId && (
        <VersionHistory
          documentId={doc.documentId}
          currentContent={doc.content}
          onRestore={handleVersionRestore}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "share" && doc.documentId && (
        <ShareDialog
          documentId={doc.documentId}
          currentSharedWith={sharedWith}
          onUpdate={setSharedWith}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Template picker — proper centered modal */}
      {activeModal === "templates" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveModal(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[400px] max-h-[70vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Templates</h2>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-120px)] p-2">
              {allTemplates.map((t, i) => (
                <button
                  key={t.name + i}
                  onClick={() => handleTemplateSelect(t)}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-2 group-hover:text-emerald-500">{t.category}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 p-3">
              <button
                onClick={() => { void handleSaveAsTemplate(); setActiveModal(null) }}
                className="w-full text-center px-4 py-2.5 rounded-xl text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              >
                Save current document as template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      <DragOverlay>
        {dragContent && (
          <div className="max-w-sm bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-emerald-200 dark:border-emerald-700 p-3 opacity-80">
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{dragContent}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
