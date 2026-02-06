import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  FileText,
  ImageIcon,
  Trophy,
  TrendingUp,
  Quote,
  Award,
  Plus,
  X,
  Loader2,
  Check,
  Upload,
} from "lucide-react"
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@/components/ui"
import {
  answersApi,
  photosApi,
  topicsApi,
  clientSuccessApi,
  type PhotoUploadMetadata,
} from "@/lib/api"
import { usePanelResize, ResizeHandles } from "@/hooks/usePanelResize"

// ─── Traffic Lights ───

function TrafficLights({ onClose, onRestore, onMaximize }: { onClose: () => void; onRestore: () => void; onMaximize: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div className="flex items-center gap-2" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button onClick={onClose} className="w-3 h-3 rounded-full relative transition-all duration-150"
        style={{ background: "linear-gradient(180deg, #FF5F57 0%, #E0443E 100%)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)" }}>
        {hovered && <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12"><path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="rgba(77,22,22,0.8)" strokeWidth="1.2" strokeLinecap="round"/></svg>}
      </button>
      <button onClick={onRestore} className="w-3 h-3 rounded-full relative transition-all duration-150"
        style={{ background: "linear-gradient(180deg, #FFBD2E 0%, #DEA123 100%)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)" }}>
        {hovered && <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12"><path d="M2.5 6H9.5" stroke="rgba(101,67,11,0.8)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
      </button>
      <button onClick={onMaximize} className="w-3 h-3 rounded-full relative transition-all duration-150"
        style={{ background: "linear-gradient(180deg, #28C840 0%, #1AAB29 100%)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)" }}>
        {hovered && <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12"><path d="M3 4.5L6 2L9 4.5M3 7.5L6 10L9 7.5" stroke="rgba(15,77,24,0.8)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
    </div>
  )
}

// ─── Types ───

type EntryType = "qa" | "photo" | "success" | "result" | "testimonial" | "award"

interface Topic {
  id: string
  name: string
  displayName: string
}

interface NewEntryPanelProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  defaultType?: EntryType
}

const DEFAULT_W = 700
const DEFAULT_H = 560
const MIN_W = 420
const MIN_H = 360
const MAX_W = 1080
const MAX_H = 820

const entryTypes: { id: EntryType; label: string; icon: typeof FileText; group: "library" | "success" }[] = [
  { id: "qa", label: "Q&A", icon: FileText, group: "library" },
  { id: "photo", label: "Photo", icon: ImageIcon, group: "library" },
  { id: "success", label: "Client Success", icon: Trophy, group: "success" },
  { id: "result", label: "Result", icon: TrendingUp, group: "success" },
  { id: "testimonial", label: "Testimonial", icon: Quote, group: "success" },
  { id: "award", label: "Award", icon: Award, group: "success" },
]

export function NewEntryPanel({ isOpen, onClose, onSaved, defaultType }: NewEntryPanelProps) {
  const [activeType, setActiveType] = useState<EntryType>(defaultType || "qa")
  useEffect(() => {
    if (defaultType) setActiveType(defaultType)
  }, [defaultType])
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: 0, y: 0 })

  // Resize hook
  const { sizeRef, startResize, restoreDefault, maximize, applySize } = usePanelResize(panelRef, positionRef, {
    defaultW: DEFAULT_W, defaultH: DEFAULT_H,
    minW: MIN_W, minH: MIN_H, maxW: MAX_W, maxH: MAX_H,
  })

  // ─── Q&A form ───
  const [qaQuestion, setQaQuestion] = useState("")
  const [qaAnswer, setQaAnswer] = useState("")
  const [qaTopicId, setQaTopicId] = useState("")
  const [qaStatus, setQaStatus] = useState<"Approved" | "Draft">("Draft")
  const [qaTags, setQaTags] = useState("")

  // ─── Photo form ───
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoTitle, setPhotoTitle] = useState("")
  const [photoTopicId, setPhotoTopicId] = useState("")
  const [photoStatus, setPhotoStatus] = useState<"Approved" | "Draft">("Draft")
  const [photoTags, setPhotoTags] = useState("")
  const [photoDescription, setPhotoDescription] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)

  // ─── Client Success form ───
  const [csClient, setCsClient] = useState("")
  const [csCategory, setCsCategory] = useState<"higher-ed" | "healthcare" | "other">("higher-ed")
  const [csFocus, setCsFocus] = useState("")
  const [csChallenge, setCsChallenge] = useState("")
  const [csSolution, setCsSolution] = useState("")
  const [csMetrics, setCsMetrics] = useState<{ label: string; value: string }[]>([])
  const [csTestimonialQuote, setCsTestimonialQuote] = useState("")
  const [csTestimonialAttribution, setCsTestimonialAttribution] = useState("")

  // ─── Result form ───
  const [resMetric, setResMetric] = useState("")
  const [resResult, setResResult] = useState("")
  const [resClient, setResClient] = useState("")
  const [resNumericValue, setResNumericValue] = useState("")
  const [resDirection, setResDirection] = useState<"increase" | "decrease">("increase")

  // ─── Testimonial form ───
  const [testQuote, setTestQuote] = useState("")
  const [testName, setTestName] = useState("")
  const [testTitle, setTestTitle] = useState("")
  const [testOrg, setTestOrg] = useState("")

  // ─── Award form ───
  const [awardName, setAwardName] = useState("")
  const [awardYear, setAwardYear] = useState("")
  const [awardClient, setAwardClient] = useState("")

  // Load topics for Q&A and Photo forms
  useEffect(() => {
    topicsApi.getAll().then(setTopics).catch(() => {})
  }, [])

  // Center panel on open + lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
      sizeRef.current = { w: DEFAULT_W, h: DEFAULT_H }
      const centerX = (window.innerWidth - DEFAULT_W) / 2
      const centerY = (window.innerHeight - DEFAULT_H) / 2
      positionRef.current = { x: Math.max(50, centerX), y: Math.max(50, centerY) }
      setIsVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applySize()
          setIsAnimatingIn(true)
        })
      })
    } else {
      document.body.style.overflow = ""
      setIsAnimatingIn(false)
      const timer = setTimeout(() => setIsVisible(false), 300)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen, applySize, sizeRef])

  // Dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-titlebar') && !(e.target as HTMLElement).closest('button')) {
      isDraggingRef.current = true
      dragOffsetRef.current = { x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && panelRef.current) {
        const newX = Math.max(0, Math.min(window.innerWidth - sizeRef.current.w, e.clientX - dragOffsetRef.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - sizeRef.current.h, e.clientY - dragOffsetRef.current.y))
        positionRef.current = { x: newX, y: newY }
        panelRef.current.style.left = `${newX}px`
        panelRef.current.style.top = `${newY}px`
      }
    }
    const handleMouseUp = () => { isDraggingRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp) }
  }, [sizeRef])

  // Reset form when switching type
  const resetForms = () => {
    setQaQuestion(""); setQaAnswer(""); setQaTopicId(""); setQaStatus("Draft"); setQaTags("")
    setPhotoFile(null); setPhotoPreview(null); setPhotoTitle(""); setPhotoTopicId(""); setPhotoStatus("Draft"); setPhotoTags(""); setPhotoDescription("")
    setCsClient(""); setCsCategory("higher-ed"); setCsFocus(""); setCsChallenge(""); setCsSolution(""); setCsMetrics([]); setCsTestimonialQuote(""); setCsTestimonialAttribution("")
    setResMetric(""); setResResult(""); setResClient(""); setResNumericValue(""); setResDirection("increase")
    setTestQuote(""); setTestName(""); setTestTitle(""); setTestOrg("")
    setAwardName(""); setAwardYear(""); setAwardClient("")
    setError(null); setSuccess(false)
  }

  // Photo drag-drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith("image/")) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
      if (!photoTitle) setPhotoTitle(file.name.replace(/\.[^.]+$/, ""))
    }
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
      if (!photoTitle) setPhotoTitle(file.name.replace(/\.[^.]+$/, ""))
    }
  }

  // ─── Save handler ───
  const handleSave = async () => {
    setError(null); setSaving(true)
    try {
      switch (activeType) {
        case "qa": {
          if (!qaQuestion.trim() || !qaAnswer.trim() || !qaTopicId) throw new Error("Question, answer, and topic are required")
          await answersApi.create({
            question: qaQuestion.trim(), answer: qaAnswer.trim(), topicId: qaTopicId,
            status: qaStatus, tags: qaTags ? qaTags.split(",").map(t => t.trim()).filter(Boolean) : [],
          })
          break
        }
        case "photo": {
          if (!photoFile || !photoTopicId) throw new Error("Photo file and topic are required")
          const metadata: PhotoUploadMetadata[] = [{
            title: photoTitle.trim() || photoFile.name, topicId: photoTopicId,
            status: photoStatus, tags: photoTags, description: photoDescription.trim(),
          }]
          await photosApi.upload([photoFile], metadata)
          break
        }
        case "success": {
          if (!csClient.trim() || !csFocus.trim()) throw new Error("Client and focus are required")
          await clientSuccessApi.createEntry({
            client: csClient.trim(), category: csCategory, focus: csFocus.trim(),
            challenge: csChallenge.trim() || undefined, solution: csSolution.trim() || undefined,
            metrics: csMetrics.filter(m => m.label.trim() && m.value.trim()),
            testimonialQuote: csTestimonialQuote.trim() || undefined,
            testimonialAttribution: csTestimonialAttribution.trim() || undefined,
          })
          break
        }
        case "result": {
          if (!resMetric.trim() || !resResult.trim() || !resClient.trim() || !resNumericValue) throw new Error("All fields are required")
          await clientSuccessApi.createResult({
            metric: resMetric.trim(), result: resResult.trim(), client: resClient.trim(),
            numericValue: Number(resNumericValue), direction: resDirection,
          })
          break
        }
        case "testimonial": {
          if (!testQuote.trim() || !testOrg.trim()) throw new Error("Quote and organization are required")
          await clientSuccessApi.createTestimonial({
            quote: testQuote.trim(), name: testName.trim() || undefined,
            title: testTitle.trim() || undefined, organization: testOrg.trim(),
          })
          break
        }
        case "award": {
          if (!awardName.trim() || !awardYear.trim() || !awardClient.trim()) throw new Error("All fields are required")
          await clientSuccessApi.createAward({ name: awardName.trim(), year: awardYear.trim(), clientOrProject: awardClient.trim() })
          break
        }
      }
      setSuccess(true)
      onSaved?.()
      setTimeout(() => { resetForms(); setSuccess(false) }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!isVisible) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[998]"
        style={{ backgroundColor: `rgba(0,0,0,${isAnimatingIn ? 0.4 : 0})`, transition: "background-color 0.3s ease-out" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        onMouseDown={handleMouseDown}
        className="fixed z-[999] flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-slate-900"
        style={{
          width: DEFAULT_W, height: DEFAULT_H,
          boxShadow: "0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.08)",
          transform: isAnimatingIn ? "scale(1) translateY(0)" : "scale(0.95) translateY(10px)",
          opacity: isAnimatingIn ? 1 : 0,
          transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
        }}
      >
        {/* Resize handles */}
        <ResizeHandles onResizeStart={startResize} />

        {/* Title bar */}
        <div className="panel-titlebar h-11 flex items-center px-4 cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <TrafficLights onClose={onClose} onRestore={restoreDefault} onMaximize={maximize} />
          <div className="flex-1 text-center">
            <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">New Entry</span>
          </div>
          <div className="w-14" />
        </div>

        <div className="flex flex-1 min-h-0 bg-white dark:bg-slate-900">
          {/* Type sidebar */}
          <div className="w-36 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 py-3 px-2 space-y-0.5 overflow-y-auto">
            <p className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Library</p>
            {entryTypes.filter(t => t.group === "library").map((t) => (
              <button key={t.id} onClick={() => { setActiveType(t.id); setError(null); setSuccess(false) }}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-all text-[12.5px] font-medium ${
                  activeType === t.id ? "bg-slate-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                }`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
            <div className="border-t border-slate-200 dark:border-slate-700 my-2" />
            <p className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Client Success</p>
            {entryTypes.filter(t => t.group === "success").map((t) => (
              <button key={t.id} onClick={() => { setActiveType(t.id); setError(null); setSuccess(false) }}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-all text-[12.5px] font-medium ${
                  activeType === t.id ? "bg-slate-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                }`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Form area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
            {/* Success / Error banners */}
            {success && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
                <Check size={15} /> Saved successfully
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                <X size={15} /> {error}
              </div>
            )}

            {/* ─── Q&A Form ─── */}
            {activeType === "qa" && (
              <>
                <div><Label className="text-xs text-slate-500">Question *</Label>
                  <Textarea value={qaQuestion} onChange={e => setQaQuestion(e.target.value)} placeholder="What question does this answer?" className="mt-1 min-h-[60px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Answer *</Label>
                  <Textarea value={qaAnswer} onChange={e => setQaAnswer(e.target.value)} placeholder="The answer content..." className="mt-1 min-h-[100px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div className="flex gap-3">
                  <div className="flex-1"><Label className="text-xs text-slate-500">Topic *</Label>
                    <Select value={qaTopicId} onValueChange={setQaTopicId}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue placeholder="Select topic" /></SelectTrigger>
                      <SelectContent>{topics.map(t => <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="w-28"><Label className="text-xs text-slate-500">Status</Label>
                    <Select value={qaStatus} onValueChange={v => setQaStatus(v as "Approved" | "Draft")}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Approved">Approved</SelectItem></SelectContent>
                    </Select></div>
                </div>
                <div><Label className="text-xs text-slate-500">Tags (comma-separated)</Label>
                  <Input value={qaTags} onChange={e => setQaTags(e.target.value)} placeholder="tag1, tag2, tag3" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
              </>
            )}

            {/* ─── Photo Form ─── */}
            {activeType === "photo" && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
                    isDragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" :
                    photoPreview ? "border-slate-200 dark:border-slate-700" :
                    "border-slate-300 dark:border-slate-600 hover:border-slate-400"
                  }`}
                  onClick={() => document.getElementById("photo-file-input")?.click()}
                >
                  {photoPreview ? (
                    <div className="flex items-center gap-3">
                      <img src={photoPreview} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{photoFile?.name}</p>
                        <p className="text-xs text-slate-400">{photoFile && (photoFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null) }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                      <p className="text-sm text-slate-500">Drop an image or click to browse</p>
                    </div>
                  )}
                  <input id="photo-file-input" type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </div>
                <div><Label className="text-xs text-slate-500">Title</Label>
                  <Input value={photoTitle} onChange={e => setPhotoTitle(e.target.value)} placeholder="Display title" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div className="flex gap-3">
                  <div className="flex-1"><Label className="text-xs text-slate-500">Topic *</Label>
                    <Select value={photoTopicId} onValueChange={setPhotoTopicId}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue placeholder="Select topic" /></SelectTrigger>
                      <SelectContent>{topics.map(t => <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="w-28"><Label className="text-xs text-slate-500">Status</Label>
                    <Select value={photoStatus} onValueChange={v => setPhotoStatus(v as "Approved" | "Draft")}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Approved">Approved</SelectItem></SelectContent>
                    </Select></div>
                </div>
                <div><Label className="text-xs text-slate-500">Tags (comma-separated)</Label>
                  <Input value={photoTags} onChange={e => setPhotoTags(e.target.value)} placeholder="tag1, tag2" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Description</Label>
                  <Textarea value={photoDescription} onChange={e => setPhotoDescription(e.target.value)} placeholder="Optional description..." className="mt-1 min-h-[50px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
              </>
            )}

            {/* ─── Client Success Form ─── */}
            {activeType === "success" && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1"><Label className="text-xs text-slate-500">Client *</Label>
                    <Input value={csClient} onChange={e => setCsClient(e.target.value)} placeholder="Client name" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                  <div className="w-36"><Label className="text-xs text-slate-500">Category *</Label>
                    <Select value={csCategory} onValueChange={v => setCsCategory(v as typeof csCategory)}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="higher-ed">Higher Ed</SelectItem><SelectItem value="healthcare">Healthcare</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                    </Select></div>
                </div>
                <div><Label className="text-xs text-slate-500">Focus *</Label>
                  <Input value={csFocus} onChange={e => setCsFocus(e.target.value)} placeholder="e.g. SEO & Analytics" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Challenge</Label>
                  <Textarea value={csChallenge} onChange={e => setCsChallenge(e.target.value)} placeholder="What challenge did the client face?" className="mt-1 min-h-[50px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Solution</Label>
                  <Textarea value={csSolution} onChange={e => setCsSolution(e.target.value)} placeholder="What solution was provided?" className="mt-1 min-h-[50px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-slate-500">Metrics</Label>
                    <button onClick={() => setCsMetrics([...csMetrics, { label: "", value: "" }])} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"><Plus size={12} /> Add</button>
                  </div>
                  {csMetrics.map((m, i) => (
                    <div key={i} className="flex gap-2 mb-1.5">
                      <Input value={m.label} onChange={e => { const n = [...csMetrics]; n[i] = { label: e.target.value, value: n[i]!.value }; setCsMetrics(n) }} placeholder="Label" className="flex-1 text-sm h-8 dark:bg-slate-800 dark:border-slate-700 rounded-lg" />
                      <Input value={m.value} onChange={e => { const n = [...csMetrics]; n[i] = { label: n[i]!.label, value: e.target.value }; setCsMetrics(n) }} placeholder="Value (e.g. +481%)" className="w-32 text-sm h-8 dark:bg-slate-800 dark:border-slate-700 rounded-lg" />
                      <button onClick={() => setCsMetrics(csMetrics.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <div><Label className="text-xs text-slate-500">Testimonial Quote</Label>
                  <Textarea value={csTestimonialQuote} onChange={e => setCsTestimonialQuote(e.target.value)} placeholder="Optional client quote" className="mt-1 min-h-[40px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Testimonial Attribution</Label>
                  <Input value={csTestimonialAttribution} onChange={e => setCsTestimonialAttribution(e.target.value)} placeholder="Name, Title" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
              </>
            )}

            {/* ─── Result Form ─── */}
            {activeType === "result" && (
              <>
                <div><Label className="text-xs text-slate-500">Metric *</Label>
                  <Input value={resMetric} onChange={e => setResMetric(e.target.value)} placeholder="e.g. Conversion growth on optimized pages" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div className="flex gap-3">
                  <div className="flex-1"><Label className="text-xs text-slate-500">Result *</Label>
                    <Input value={resResult} onChange={e => setResResult(e.target.value)} placeholder="e.g. +481%" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                  <div className="w-28"><Label className="text-xs text-slate-500">Value *</Label>
                    <Input type="number" value={resNumericValue} onChange={e => setResNumericValue(e.target.value)} placeholder="481" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                  <div className="w-32"><Label className="text-xs text-slate-500">Direction *</Label>
                    <Select value={resDirection} onValueChange={v => setResDirection(v as "increase" | "decrease")}>
                      <SelectTrigger className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="increase">Increase</SelectItem><SelectItem value="decrease">Decrease</SelectItem></SelectContent>
                    </Select></div>
                </div>
                <div><Label className="text-xs text-slate-500">Client *</Label>
                  <Input value={resClient} onChange={e => setResClient(e.target.value)} placeholder="Client name" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
              </>
            )}

            {/* ─── Testimonial Form ─── */}
            {activeType === "testimonial" && (
              <>
                <div><Label className="text-xs text-slate-500">Quote *</Label>
                  <Textarea value={testQuote} onChange={e => setTestQuote(e.target.value)} placeholder="The testimonial quote..." className="mt-1 min-h-[100px] text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Name</Label>
                  <Input value={testName} onChange={e => setTestName(e.target.value)} placeholder="Speaker name" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Title</Label>
                  <Input value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder="Job title" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div><Label className="text-xs text-slate-500">Organization *</Label>
                  <Input value={testOrg} onChange={e => setTestOrg(e.target.value)} placeholder="Organization name" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
              </>
            )}

            {/* ─── Award Form ─── */}
            {activeType === "award" && (
              <>
                <div><Label className="text-xs text-slate-500">Award Name *</Label>
                  <Input value={awardName} onChange={e => setAwardName(e.target.value)} placeholder="e.g. Gold Aster Award" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                <div className="flex gap-3">
                  <div className="w-24"><Label className="text-xs text-slate-500">Year *</Label>
                    <Input value={awardYear} onChange={e => setAwardYear(e.target.value)} placeholder="2025" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                  <div className="flex-1"><Label className="text-xs text-slate-500">Client / Project *</Label>
                    <Input value={awardClient} onChange={e => setAwardClient(e.target.value)} placeholder="Client or project name" className="mt-1 text-sm dark:bg-slate-800 dark:border-slate-700 rounded-lg" /></div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 flex items-center justify-end px-5 gap-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg text-xs h-8">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || success} className="rounded-lg text-xs h-8 bg-slate-700 hover:bg-slate-800 text-white">
            {saving ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Saving...</> :
             success ? <><Check size={13} className="mr-1.5" /> Saved</> :
             "Save"}
          </Button>
        </div>
      </div>
    </>,
    document.body
  )
}
