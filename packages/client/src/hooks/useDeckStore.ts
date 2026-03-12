import { useState, useCallback, useRef } from "react"
import type { PitchDeckSlide, PitchDeckOutput } from "@/types/deck"

const MAX_UNDO = 30

interface Snapshot {
  deckTitle: string
  slides: PitchDeckSlide[]
  selectedIndex: number
}

const SLIDE_DEFAULTS: Record<PitchDeckSlide["type"], () => PitchDeckSlide> = {
  "title": () => ({ type: "title", title: "Title Slide", subtitle: "Subtitle goes here" }),
  "content": () => ({ type: "content", title: "Content Slide", bullets: ["Point 1", "Point 2", "Point 3"] }),
  "two-column": () => ({
    type: "two-column", title: "Two Columns",
    leftColumn: { title: "Left Column", bullets: ["Point 1", "Point 2"] },
    rightColumn: { title: "Right Column", bullets: ["Point 1", "Point 2"] },
  }),
  "image-text": () => ({ type: "image-text", title: "Image & Text", bullets: ["Point 1", "Point 2", "Point 3"] }),
  "chart": () => ({
    type: "chart", title: "Data Chart",
    chartData: { type: "bar", labels: ["A", "B", "C"], values: [30, 60, 45], seriesName: "Series 1" },
  }),
  "comparison": () => ({
    type: "comparison", title: "Comparison",
    comparisonRows: [
      { feature: "Feature 1", us: "Yes", them: "No" },
      { feature: "Feature 2", us: "Full", them: "Partial" },
      { feature: "Feature 3", us: "Included", them: "Extra cost" },
    ],
  }),
  "quote": () => ({
    type: "quote", title: "Testimonial",
    quote: { text: "Quote text goes here.", attribution: "Name, Title" },
  }),
  "section-divider": () => ({ type: "section-divider", title: "Section Title", subtitle: "Section subtitle" }),
  "closing": () => ({ type: "closing", title: "Thank You", subtitle: "Let's get started.", bullets: ["email@stamats.com", "stamats.com"] }),
}

export interface UseDeckStoreReturn {
  deckTitle: string
  slides: PitchDeckSlide[]
  selectedIndex: number
  isDirty: boolean
  showNotes: boolean

  selectSlide: (index: number) => void
  setDeckTitle: (title: string) => void

  addSlide: (type: PitchDeckSlide["type"], afterIndex?: number) => void
  deleteSlide: (index: number) => void
  duplicateSlide: (index: number) => void
  updateSlide: (index: number, partial: Partial<PitchDeckSlide>) => void

  reorderSlides: (fromIndex: number, toIndex: number) => void
  moveSlideUp: (index: number) => void
  moveSlideDown: (index: number) => void

  loadFromAI: (deckData: PitchDeckOutput) => void
  toggleNotes: () => void

  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  getDeckData: () => PitchDeckOutput
}

export function useDeckStore(): UseDeckStoreReturn {
  const [deckTitle, setDeckTitleState] = useState("Untitled Deck")
  const [slides, setSlidesState] = useState<PitchDeckSlide[]>([SLIDE_DEFAULTS["title"]()])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [undoRedoTrigger, setUndoRedoTrigger] = useState(0)

  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  // Force re-render for undo/redo button state
  void undoRedoTrigger

  // Snapshot before mutation
  const snapshot = useCallback((): Snapshot => ({
    deckTitle,
    slides: slides.map(s => ({ ...s })),
    selectedIndex,
  }), [deckTitle, slides, selectedIndex])

  const saveUndo = useCallback(() => {
    undoStack.current.push(snapshot())
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    redoStack.current = []
    setUndoRedoTrigger(t => t + 1)
    setIsDirty(true)
  }, [snapshot])

  const selectSlide = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  const setDeckTitle = useCallback((title: string) => {
    saveUndo()
    setDeckTitleState(title)
  }, [saveUndo])

  const addSlide = useCallback((type: PitchDeckSlide["type"], afterIndex?: number) => {
    saveUndo()
    const newSlide = SLIDE_DEFAULTS[type]()
    newSlide.speakerNotes = ""
    setSlidesState(prev => {
      const idx = afterIndex !== undefined ? afterIndex + 1 : prev.length
      const next = [...prev]
      next.splice(idx, 0, newSlide)
      return next
    })
    setSelectedIndex(afterIndex !== undefined ? afterIndex + 1 : slides.length)
  }, [saveUndo, slides.length])

  const deleteSlide = useCallback((index: number) => {
    setSlidesState(prev => {
      if (prev.length <= 1) return prev // Don't delete last slide
      saveUndo()
      const next = prev.filter((_, i) => i !== index)
      setSelectedIndex(Math.min(index, next.length - 1))
      return next
    })
  }, [saveUndo])

  const duplicateSlide = useCallback((index: number) => {
    saveUndo()
    setSlidesState(prev => {
      const clone = { ...prev[index]!, speakerNotes: prev[index]!.speakerNotes || "" }
      const next = [...prev]
      next.splice(index + 1, 0, clone)
      return next
    })
    setSelectedIndex(index + 1)
  }, [saveUndo])

  const updateSlide = useCallback((index: number, partial: Partial<PitchDeckSlide>) => {
    saveUndo()
    setSlidesState(prev => prev.map((s, i) => i === index ? { ...s, ...partial } : s))
  }, [saveUndo])

  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    saveUndo()
    setSlidesState(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved!)
      return next
    })
    setSelectedIndex(toIndex)
  }, [saveUndo])

  const moveSlideUp = useCallback((index: number) => {
    if (index <= 0) return
    reorderSlides(index, index - 1)
  }, [reorderSlides])

  const moveSlideDown = useCallback((index: number) => {
    setSlidesState(prev => {
      if (index >= prev.length - 1) return prev
      reorderSlides(index, index + 1)
      return prev
    })
  }, [reorderSlides])

  const loadFromAI = useCallback((deckData: PitchDeckOutput) => {
    // Don't push undo — this is a fresh load
    undoStack.current = []
    redoStack.current = []
    setDeckTitleState(deckData.deckTitle)
    setSlidesState(deckData.slides)
    setSelectedIndex(0)
    setIsDirty(true)
    setUndoRedoTrigger(t => t + 1)
  }, [])

  const toggleNotes = useCallback(() => {
    setShowNotes(prev => !prev)
  }, [])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const current: Snapshot = { deckTitle, slides, selectedIndex }
    redoStack.current.push(current)
    const prev = undoStack.current.pop()!
    setDeckTitleState(prev.deckTitle)
    setSlidesState(prev.slides)
    setSelectedIndex(prev.selectedIndex)
    setUndoRedoTrigger(t => t + 1)
  }, [deckTitle, slides, selectedIndex])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const current: Snapshot = { deckTitle, slides, selectedIndex }
    undoStack.current.push(current)
    const next = redoStack.current.pop()!
    setDeckTitleState(next.deckTitle)
    setSlidesState(next.slides)
    setSelectedIndex(next.selectedIndex)
    setUndoRedoTrigger(t => t + 1)
  }, [deckTitle, slides, selectedIndex])

  const getDeckData = useCallback((): PitchDeckOutput => ({
    deckTitle,
    slides,
  }), [deckTitle, slides])

  return {
    deckTitle,
    slides,
    selectedIndex,
    isDirty,
    showNotes,
    selectSlide,
    setDeckTitle,
    addSlide,
    deleteSlide,
    duplicateSlide,
    updateSlide,
    reorderSlides,
    moveSlideUp,
    moveSlideDown,
    loadFromAI,
    toggleNotes,
    undo,
    redo,
    canUndo,
    canRedo,
    getDeckData,
  }
}
