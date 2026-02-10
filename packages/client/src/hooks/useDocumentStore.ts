import { useState, useCallback, useRef, useEffect } from "react"
import type { ReviewAnnotation } from "@/types/chat"
import type { FormatSettings, StudioMode, SaveStatus } from "@/types/studio"
import { DEFAULT_FORMAT_SETTINGS, DEFAULT_LETTERHEAD_HEADER, DEFAULT_LETTERHEAD_FOOTER } from "@/types/studio"
import { studioApi } from "@/lib/api"
import { isMarkdown, markdownToHtml } from "@/lib/markdownToHtml"

/** Merge stored format settings with defaults so new fields are never undefined */
function mergeFormatDefaults(stored: Partial<FormatSettings>): FormatSettings {
  return {
    ...DEFAULT_FORMAT_SETTINGS,
    ...stored,
    letterheadHeader: stored.letterheadHeader ?? { ...DEFAULT_LETTERHEAD_HEADER },
    letterheadFooter: stored.letterheadFooter ?? { ...DEFAULT_LETTERHEAD_FOOTER },
  }
}

const LOCALSTORAGE_KEY = "stamats-studio-draft"
const MAX_UNDO_STACK = 50
const SERVER_SAVE_DEBOUNCE = 3000

interface DraftState {
  content: string
  title: string
  formatSettings: FormatSettings
  mode: StudioMode
  documentId: string | null
  timestamp: number
}

export interface UseDocumentStoreReturn {
  // State
  content: string
  title: string
  formatSettings: FormatSettings
  mode: StudioMode
  isDirty: boolean
  saveStatus: SaveStatus
  documentId: string | null

  // Content operations
  setContent: (content: string) => void
  insertContent: (text: string) => void
  replaceContent: (text: string) => void
  setTitle: (title: string) => void

  // Mode
  setMode: (mode: StudioMode) => void

  // Formatting
  updateFormat: (partial: Partial<FormatSettings>) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Annotations (review comments)
  annotations: ReviewAnnotation[]
  setAnnotations: (annotations: ReviewAnnotation[]) => void
  resolveAnnotation: (id: string) => void
  clearAnnotations: () => void

  // Persistence
  saveToServer: () => Promise<void>
  loadDocument: (id: string) => Promise<void>
  newDocument: () => void
}

export function useDocumentStore(): UseDocumentStoreReturn {
  // Try crash recovery from localStorage
  const recovered = useRef<DraftState | null>(null)
  if (recovered.current === null) {
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as DraftState
      parsed.formatSettings = mergeFormatDefaults(parsed.formatSettings)
      recovered.current = parsed
      }
    } catch {
      // ignore
    }
    if (!recovered.current) {
      recovered.current = {
        content: "",
        title: "Untitled",
        formatSettings: DEFAULT_FORMAT_SETTINGS,
        mode: "editor",
        documentId: null,
        timestamp: Date.now(),
      }
    }
    // Migrate legacy "briefing" mode from old localStorage
    if ((recovered.current.mode as string) === "briefing") {
      recovered.current.mode = "editor"
    }
  }

  // Auto-convert legacy markdown content from crash recovery
  if (recovered.current.content && isMarkdown(recovered.current.content)) {
    recovered.current.content = markdownToHtml(recovered.current.content)
  }

  const [content, setContentState] = useState(recovered.current.content)
  const [title, setTitle] = useState(recovered.current.title)
  const [formatSettings, setFormatSettings] = useState<FormatSettings>(recovered.current.formatSettings)
  const [mode, setMode] = useState<StudioMode>(recovered.current.mode)
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [documentId, setDocumentId] = useState<string | null>(recovered.current.documentId)
  const [annotations, setAnnotationsState] = useState<ReviewAnnotation[]>([])

  // Track last saved content to avoid redundant server saves
  const lastSavedContent = useRef(recovered.current.content)

  // Undo/redo stacks
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const [undoRedoTrigger, setUndoRedoTrigger] = useState(0)

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  // Push to undo stack
  const pushUndo = useCallback((prevContent: string) => {
    undoStack.current.push(prevContent)
    if (undoStack.current.length > MAX_UNDO_STACK) {
      undoStack.current.shift()
    }
    redoStack.current = [] // Clear redo on new edit
    setUndoRedoTrigger((t) => t + 1)
  }, [])

  const setContent = useCallback((newContent: string) => {
    setContentState((prev) => {
      if (prev !== newContent) {
        pushUndo(prev)
      }
      return newContent
    })
    setIsDirty(true)
    setSaveStatus("unsaved")
  }, [pushUndo])

  const insertContent = useCallback((text: string) => {
    setContentState((prev) => {
      pushUndo(prev)
      return prev + text
    })
    setIsDirty(true)
    setSaveStatus("unsaved")
  }, [pushUndo])

  const replaceContent = useCallback((text: string) => {
    setContentState((prev) => {
      pushUndo(prev)
      return text
    })
    setIsDirty(true)
    setSaveStatus("unsaved")
  }, [pushUndo])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current.pop()!
    setContentState((current) => {
      redoStack.current.push(current)
      return prev
    })
    setUndoRedoTrigger((t) => t + 1)
    setIsDirty(true)
  }, [])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current.pop()!
    setContentState((current) => {
      undoStack.current.push(current)
      return next
    })
    setUndoRedoTrigger((t) => t + 1)
    setIsDirty(true)
  }, [])

  const updateFormat = useCallback((partial: Partial<FormatSettings>) => {
    setFormatSettings((prev) => ({ ...prev, ...partial }))
    setIsDirty(true)
    setSaveStatus("unsaved")
  }, [])

  // Annotation management
  const setAnnotations = useCallback((newAnnotations: ReviewAnnotation[]) => {
    setAnnotationsState(newAnnotations)
  }, [])

  const resolveAnnotation = useCallback((id: string) => {
    setAnnotationsState((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const clearAnnotations = useCallback(() => {
    setAnnotationsState([])
  }, [])

  // Save to server
  const saveToServer = useCallback(async () => {
    // Don't save empty documents
    if (!content.trim() && title === "Untitled") return

    setSaveStatus("saving")
    try {
      if (documentId) {
        // Update existing
        await studioApi.updateDocument(documentId, {
          title,
          content,
          formatSettings,
        })
      } else {
        // Create new
        const result = await studioApi.createDocument({
          title,
          content,
          formatSettings,
          sourceType: "manual",
        }) as { id: string }
        setDocumentId(result.id)
      }
      lastSavedContent.current = content
      setSaveStatus("saved")
      setIsDirty(false)
    } catch {
      setSaveStatus("error")
    }
  }, [content, title, formatSettings, documentId])

  // Load a document from server
  const loadDocument = useCallback(async (id: string) => {
    try {
      const doc = await studioApi.getDocument(id) as {
        id: string
        title: string
        content: string
        formatSettings: FormatSettings
      }
      setDocumentId(doc.id)
      const loadedContent = doc.content || ""
      const htmlContent = isMarkdown(loadedContent) ? markdownToHtml(loadedContent) : loadedContent
      setContentState(htmlContent)
      setTitle(doc.title || "Untitled")
      if (doc.formatSettings) setFormatSettings(mergeFormatDefaults(doc.formatSettings))
      lastSavedContent.current = htmlContent
      undoStack.current = []
      redoStack.current = []
      setIsDirty(false)
      setSaveStatus("saved")
      setMode("editor")
    } catch {
      // Failed to load
    }
  }, [])

  // New blank document
  const newDocument = useCallback(() => {
    setDocumentId(null)
    setContentState("")
    setTitle("Untitled")
    setFormatSettings(DEFAULT_FORMAT_SETTINGS)
    lastSavedContent.current = ""
    undoStack.current = []
    redoStack.current = []
    setIsDirty(false)
    setSaveStatus("saved")
  }, [])

  // Auto-save to localStorage (debounced 1s)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const draft: DraftState = { content, title, formatSettings, mode, documentId, timestamp: Date.now() }
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(draft))
      } catch {
        // Storage full or unavailable
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [content, title, formatSettings, mode, documentId])

  // Auto-save to server (debounced 3s, only when content actually changed)
  useEffect(() => {
    if (!isDirty || !documentId) return
    if (content === lastSavedContent.current) return

    const timer = setTimeout(() => {
      void saveToServer()
    }, SERVER_SAVE_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [content, isDirty, documentId, saveToServer])

  // Force re-render for undo/redo button state
  void undoRedoTrigger

  return {
    content,
    title,
    formatSettings,
    mode,
    isDirty,
    saveStatus,
    documentId,
    setContent,
    insertContent,
    replaceContent,
    setTitle,
    setMode,
    updateFormat,
    undo,
    redo,
    canUndo,
    canRedo,
    annotations,
    setAnnotations,
    resolveAnnotation,
    clearAnnotations,
    saveToServer,
    loadDocument,
    newDocument,
  }
}
