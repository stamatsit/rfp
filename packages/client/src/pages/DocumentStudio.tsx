import { useState, useCallback, useRef, useEffect } from "react"
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import type { Editor } from "@tiptap/react"
import { AppHeader } from "@/components/AppHeader"
import {
  StudioToolbar, StudioChatSidebar, BriefingView, DocumentEditor,
  FormatToolbar, FindReplace, ExportDialog, PhotoPicker, AssetPanel,
  VersionHistory, ShareDialog, QABrowser, DocumentOutline, ComplianceChecklist,
} from "@/components/studio"
import { useDocumentStore } from "@/hooks/useDocumentStore"
import { studioApi } from "@/lib/api"
import { markdownToHtml } from "@/lib/markdownToHtml"
import type { SharedUser } from "@/types/studio"

const MIN_LEFT_WIDTH = 320
const MAX_LEFT_WIDTH = 800
const DEFAULT_LEFT_FRACTION = 0.4

// Seed templates (markdown — converted to HTML on selection)
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
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [showAssetPanel, setShowAssetPanel] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showQABrowser, setShowQABrowser] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [rfpText, setRfpText] = useState<string | null>(null)
  const [sharedWith, setSharedWith] = useState<SharedUser[]>([])
  const [serverTemplates, setServerTemplates] = useState<Array<{ id: string; name: string; content: string; category: string }>>([])
  const [dragContent, setDragContent] = useState<string | null>(null)
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
      // Let TipTap handle Cmd+Z/Shift+Z when the editor is focused
      if (meta && e.key === "z") {
        if (editorRef.current?.isFocused) return // TipTap handles its own undo/redo
        e.preventDefault()
        if (e.shiftKey) {
          doc.redo()
        } else {
          doc.undo()
        }
      }
      if (meta && e.key === "f") {
        e.preventDefault()
        setShowFindReplace((prev) => !prev)
      }
      if (e.key === "Escape") {
        setShowFindReplace(false)
        setShowExport(false)
        setShowPhotoPicker(false)
        setShowAssetPanel(false)
        setShowTemplates(false)
        setShowVersionHistory(false)
        setShowShareDialog(false)
        setShowQABrowser(false)
        setShowOutline(false)
        setShowChecklist(false)
      }
      if (meta && e.key === "e" && !e.shiftKey) {
        e.preventDefault()
        doc.setMode("editor")
      }
      if (meta && e.key === "e" && e.shiftKey) {
        e.preventDefault()
        doc.setMode("review")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [doc])

  // Deploy briefing content to editor (briefing outputs markdown)
  const handleBriefingDeploy = useCallback((content: string) => {
    doc.insertContent(markdownToHtml(content))
    doc.setMode("editor")
  }, [doc])

  // Template selection (templates are markdown — convert to HTML)
  const handleTemplateSelect = (template: { name: string; content: string }) => {
    doc.newDocument()
    doc.setTitle(template.name)
    if (template.content) doc.replaceContent(markdownToHtml(template.content))
    doc.setMode("editor")
    setShowTemplates(false)
  }

  // Save current doc as template
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

  // Version restore
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

  // Import document (PDF/Word/TXT → extract text → insert into editor)
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await studioApi.extractDocument(file)
      const htmlContent = markdownToHtml(result.text)
      doc.replaceContent(htmlContent)
      // Set title from filename (strip extension)
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <AppHeader title="Document Studio" />
        <StudioToolbar
          mode={doc.mode}
          onModeChange={doc.setMode}
          title={doc.title}
          onTitleChange={doc.setTitle}
          saveStatus={doc.saveStatus}
          onExportPDF={() => setShowExport(true)}
          onExportWord={() => setShowExport(true)}
        />

        {/* Format toolbar in editor/review mode */}
        {doc.mode !== "briefing" && (
          <FormatToolbar format={doc.formatSettings} onUpdate={doc.updateFormat} editor={editorRef.current} />
        )}

        {/* Secondary action bar */}
        {doc.mode !== "briefing" && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              >
                Templates
              </button>
              {showTemplates && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-30 py-1">
                  {allTemplates.map((t, i) => (
                    <button
                      key={t.name + i}
                      onClick={() => handleTemplateSelect(t)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    >
                      {t.name}
                      <span className="text-[10px] text-slate-400 ml-2">{t.category}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                    <button
                      onClick={() => { void handleSaveAsTemplate(); setShowTemplates(false) }}
                      className="w-full text-left px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    >
                      Save current as template
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => importInputRef.current?.click()}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => setShowPhotoPicker(true)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Photos
            </button>
            <button
              onClick={() => setShowAssetPanel(true)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Assets
            </button>
            <button
              onClick={() => setShowQABrowser(true)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Q&A Library
            </button>
            <button
              onClick={() => setShowOutline(!showOutline)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                showOutline
                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Outline
            </button>
            {rfpText && (
              <button
                onClick={() => setShowChecklist(!showChecklist)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  showChecklist
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Checklist
              </button>
            )}

            <div className="flex-1" />

            {doc.documentId && (
              <>
                <button
                  onClick={() => setShowVersionHistory(true)}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                >
                  History
                </button>
                <button
                  onClick={() => setShowShareDialog(true)}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                >
                  Share
                </button>
              </>
            )}
          </div>
        )}

        {/* Split pane */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
          {/* Find & Replace overlay */}
          {showFindReplace && (
            <FindReplace
              content={doc.content}
              onContentChange={doc.setContent}
              onClose={() => setShowFindReplace(false)}
            />
          )}

          {/* Left: Chat sidebar */}
          <div style={{ width: `${leftFraction * 100}%` }} className="flex-shrink-0 border-r border-slate-200 dark:border-slate-700">
            <StudioChatSidebar documentStore={doc} onRFPDetected={setRfpText} />
          </div>

          {/* Resizable divider */}
          <div
            onMouseDown={handleMouseDown}
            className="w-1 flex-shrink-0 bg-slate-200 dark:bg-slate-700 hover:bg-emerald-400 dark:hover:bg-emerald-500 cursor-col-resize transition-colors"
          />

          {/* Right: Document area */}
          <div className="flex-1 flex min-w-0">
            {showOutline && doc.mode !== "briefing" && (
              <DocumentOutline
                editor={editorRef.current}
                isOpen={showOutline}
                onClose={() => setShowOutline(false)}
              />
            )}
            {showChecklist && rfpText && doc.mode !== "briefing" && (
              <ComplianceChecklist
                rfpText={rfpText}
                documentContent={doc.content}
                isOpen={showChecklist}
                onClose={() => setShowChecklist(false)}
              />
            )}
            <div className="flex-1 flex flex-col min-w-0">
              {doc.mode === "briefing" ? (
                <BriefingView onDeploy={handleBriefingDeploy} />
              ) : (
                <DocumentEditor
                  content={doc.content}
                  onContentChange={doc.setContent}
                  formatSettings={doc.formatSettings}
                  editorRef={editorRef}
                  annotations={doc.annotations}
                  onResolveAnnotation={doc.resolveAnnotation}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showExport && (
        <ExportDialog title={doc.title} onClose={() => setShowExport(false)} />
      )}
      {showPhotoPicker && (
        <PhotoPicker onInsert={(html) => doc.insertContent(html)} onClose={() => setShowPhotoPicker(false)} />
      )}
      {showAssetPanel && (
        <AssetPanel onInsert={(content) => doc.insertContent(content)} onClose={() => setShowAssetPanel(false)} />
      )}
      {showQABrowser && (
        <QABrowser onInsert={(content) => doc.insertContent(markdownToHtml(content))} onClose={() => setShowQABrowser(false)} />
      )}
      {showVersionHistory && doc.documentId && (
        <VersionHistory
          documentId={doc.documentId}
          currentContent={doc.content}
          onRestore={handleVersionRestore}
          onClose={() => setShowVersionHistory(false)}
        />
      )}
      {showShareDialog && doc.documentId && (
        <ShareDialog
          documentId={doc.documentId}
          currentSharedWith={sharedWith}
          onUpdate={setSharedWith}
          onClose={() => setShowShareDialog(false)}
        />
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
