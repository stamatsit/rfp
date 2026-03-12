/**
 * Meeting Intake — Multi-step wizard for processing meeting recordings and transcripts.
 * Color theme: Emerald (#10B981 → #059669 → #047857)
 *
 * Steps:
 * 1. Choose input mode (Record / Upload Audio / Paste Transcript)
 * 2. Meeting details (client, title, date) + input
 * 3. Processing status
 * 4. Results view (side-by-side transcript + analysis)
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Mic,
  Upload,
  FileText,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Clock,
  ArrowRight,
  Trash2,
  Save,
  RefreshCw,
  FileEdit,
  Search,
  ListChecks,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { AudioRecorder } from "@/components/meetings/AudioRecorder"
import { MeetingAnalysisView } from "@/components/meetings/MeetingAnalysisView"
import { meetingsApi, clientsApi, studioApi, type MeetingRecord, type ClientResponse } from "@/lib/api"
import { toast } from "@/hooks/useToast"
import { useIsAdmin } from "@/contexts/AuthContext"

type InputMode = "record" | "upload" | "paste"
type WizardStep = "input" | "details" | "processing" | "results"

const INPUT_MODES: Array<{ id: InputMode; label: string; description: string; icon: typeof Mic }> = [
  { id: "record", label: "Record Audio", description: "Record live from your microphone", icon: Mic },
  { id: "upload", label: "Upload Audio", description: "Upload an MP3, WAV, M4A, or WebM file", icon: Upload },
  { id: "paste", label: "Paste Transcript", description: "Paste or upload meeting transcript text", icon: FileText },
]

export function MeetingIntake() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>("input")
  const [inputMode, setInputMode] = useState<InputMode | null>(null)

  // Meeting details
  const [clientName, setClientName] = useState("")
  const [title, setTitle] = useState("")
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split("T")[0])
  const [clients, setClients] = useState<ClientResponse[]>([])

  // Input data
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcriptText, setTranscriptText] = useState("")
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null)

  // Processing state
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)

  // Results
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null)
  const [isPublished, setIsPublished] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  // Past meetings
  const [pastMeetings, setPastMeetings] = useState<MeetingRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const [historyClient, setHistoryClient] = useState("")

  // Drag-and-drop
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const transcriptFileRef = useRef<HTMLInputElement>(null)

  // Load clients
  useEffect(() => {
    clientsApi.list().then(setClients).catch(() => {})
  }, [])

  // Load past meetings
  useEffect(() => {
    meetingsApi.list().then(setPastMeetings).catch(() => {})
  }, [])

  // Poll processing status
  useEffect(() => {
    if (!processingId || processingStatus === "complete" || processingStatus === "error") return
    const interval = setInterval(async () => {
      try {
        const status = await meetingsApi.getStatus(processingId)
        setProcessingStatus(status.processingStatus)
        if (status.processingError) setProcessingError(status.processingError)
        if (status.processingStatus === "complete") {
          const full = await meetingsApi.getMeeting(processingId)
          setMeeting(full)
          setStep("results")
          setIsPublished(false)
          setIsReanalyzing(false)
          toast.success("Meeting notes are ready!")
          // Refresh past meetings
          meetingsApi.list().then(setPastMeetings).catch(() => {})
        } else if (status.processingStatus === "error") {
          setProcessingError(status.processingError || "Processing failed")
        }
      } catch {
        // Polling error — will retry
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [processingId, processingStatus])

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processAudioFile(file)
  }

  const processAudioFile = (file: File) => {
    setAudioFile(file)
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener("loadedmetadata", () => {
      setAudioDuration(Math.round(audio.duration))
      URL.revokeObjectURL(url)
    })
  }

  const handleTranscriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setTranscriptFile(file)
      if (file.type.startsWith("text/") || file.name.endsWith(".txt")) {
        const reader = new FileReader()
        reader.onload = () => setTranscriptText(reader.result as string)
        reader.readAsText(file)
      }
    }
  }

  // Drag-and-drop handlers for upload mode
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|m4a|webm|ogg|mp4)$/i))) {
      processAudioFile(file)
    } else if (file) {
      toast.error("Please drop an audio file (MP3, WAV, M4A, WebM)")
    }
  }

  const canProceed = useCallback(() => {
    if (step === "input") return inputMode !== null
    if (step === "details") {
      if (!clientName.trim()) return false
      if (inputMode === "record") return audioBlob !== null
      if (inputMode === "upload") return audioFile !== null
      if (inputMode === "paste") return transcriptText.trim().length > 0 || transcriptFile !== null
      return false
    }
    return false
  }, [step, inputMode, clientName, audioBlob, audioFile, transcriptText, transcriptFile])

  const handleSubmit = async () => {
    try {
      setProcessingError(null)
      setStep("processing")

      let result: { id: string; processingStatus: string }

      if (inputMode === "record" && audioBlob) {
        result = await meetingsApi.processAudio(audioBlob, {
          clientName: clientName.trim(),
          title: title.trim() || undefined,
          meetingDate,
          durationSecs: audioDuration,
        })
      } else if (inputMode === "upload" && audioFile) {
        result = await meetingsApi.processAudio(audioFile, {
          clientName: clientName.trim(),
          title: title.trim() || undefined,
          meetingDate,
          durationSecs: audioDuration,
        })
      } else if (inputMode === "paste") {
        result = await meetingsApi.analyzeText(
          {
            text: transcriptText.trim() || undefined,
            clientName: clientName.trim(),
            title: title.trim() || undefined,
            meetingDate,
          },
          transcriptFile || undefined,
        )
      } else {
        throw new Error("No input provided")
      }

      setProcessingId(result.id)
      setProcessingStatus(result.processingStatus)
    } catch (err: any) {
      setProcessingError(err.message || "Failed to process meeting")
      setProcessingStatus("error")
    }
  }

  const handleLoadMeeting = async (id: string) => {
    try {
      const full = await meetingsApi.getMeeting(id)
      setMeeting(full)
      setStep("results")
      setShowHistory(false)
      setIsPublished(false)
    } catch {
      toast.error("Failed to load meeting")
    }
  }

  const resetWizard = () => {
    setStep("input")
    setInputMode(null)
    setClientName("")
    setTitle("")
    setMeetingDate(new Date().toISOString().split("T")[0])
    setAudioBlob(null)
    setAudioDuration(0)
    setAudioFile(null)
    setTranscriptText("")
    setTranscriptFile(null)
    setProcessingId(null)
    setProcessingStatus(null)
    setProcessingError(null)
    setMeeting(null)
    setIsPublished(false)
    setIsReanalyzing(false)
  }

  const handlePublish = async () => {
    if (!meeting) return
    try {
      await meetingsApi.publish(meeting.id)
      setIsPublished(true)
      toast.success("Saved to Client Portfolio!")
    } catch {
      toast.error("Failed to publish meeting")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this meeting? This cannot be undone.")) return
    try {
      await meetingsApi.delete(id)
      setPastMeetings(prev => prev.filter(m => m.id !== id))
      if (meeting?.id === id) resetWizard()
      toast.success("Meeting deleted")
    } catch {
      toast.error("Failed to delete meeting")
    }
  }

  const handleReanalyze = async () => {
    if (!meeting) return
    try {
      setIsReanalyzing(true)
      const result = await meetingsApi.reanalyze(meeting.id)
      setProcessingId(result.id)
      setProcessingStatus(result.processingStatus)
      setStep("processing")
    } catch {
      toast.error("Failed to re-analyze meeting")
      setIsReanalyzing(false)
    }
  }

  const handleOpenInStudio = async () => {
    if (!meeting) return
    try {
      // Escape HTML entities to prevent XSS
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

      const actionItemsHtml = (meeting.meetingActionItems || [])
        .map(item => {
          let line = `<li>${esc(item.text)}`
          if (item.assignee) line += ` <em>(${esc(item.assignee)})</em>`
          if (item.dueDate) line += ` — due ${esc(item.dueDate)}`
          return line + "</li>"
        })
        .join("\n")

      const keyPointsHtml = (meeting.keyPoints || []).map(p => `<li>${esc(p)}</li>`).join("\n")
      const decisionsHtml = (meeting.meetingDecisions || []).map(d => `<li>${esc(d)}</li>`).join("\n")
      const painPointsHtml = (meeting.meetingPainPoints || []).map(p => `<li>${esc(p)}</li>`).join("\n")
      const opportunitiesHtml = (meeting.meetingOpportunities || []).map(o => `<li>${esc(o)}</li>`).join("\n")

      let html = `<h1>${esc(meeting.title || "Meeting Notes")}</h1>`
      html += `<p><strong>Client:</strong> ${esc(meeting.clientName)}`
      if (meeting.meetingDate) html += ` | <strong>Date:</strong> ${esc(new Date(meeting.meetingDate).toLocaleDateString())}`
      html += `</p>`

      if (meeting.summary) html += `<h2>Summary</h2><p>${esc(meeting.summary)}</p>`
      if (actionItemsHtml) html += `<h2>Action Items</h2><ul>${actionItemsHtml}</ul>`
      if (keyPointsHtml) html += `<h2>Key Discussion Points</h2><ul>${keyPointsHtml}</ul>`
      if (decisionsHtml) html += `<h2>Decisions</h2><ul>${decisionsHtml}</ul>`
      if (painPointsHtml) html += `<h2>Pain Points</h2><ul>${painPointsHtml}</ul>`
      if (opportunitiesHtml) html += `<h2>Opportunities</h2><ul>${opportunitiesHtml}</ul>`

      const doc = await studioApi.createDocument({
        title: `${meeting.title || "Meeting Notes"} — ${meeting.clientName}`,
        content: `<div>${html}</div>`,
        sourceType: "meeting-notes",
        tags: [meeting.clientName.toLowerCase(), "meeting-notes"],
        metadata: { meetingId: meeting.id, clientName: meeting.clientName },
      }) as { id: string }

      navigate(`/studio?doc=${doc.id}`)
    } catch {
      toast.error("Failed to create Studio document")
    }
  }

  // Filter past meetings
  const filteredMeetings = pastMeetings.filter(m => {
    if (historyClient && m.clientName !== historyClient.toLowerCase()) return false
    if (historySearch) {
      const q = historySearch.toLowerCase()
      return (m.title?.toLowerCase().includes(q) || m.summary?.toLowerCase().includes(q) || m.clientName?.toLowerCase().includes(q))
    }
    return true
  })

  // Unique client names from past meetings for filter
  const meetingClients = [...new Set(pastMeetings.map(m => m.clientName))].sort()

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <AppHeader title="Meeting Intake" />

      <div className={`mx-auto px-4 py-8 ${step === "results" ? "max-w-6xl" : "max-w-3xl"}`}>
        {/* Step indicator */}
        {step !== "results" && (
          <div className="flex items-center gap-2 mb-8">
            {(["input", "details", "processing"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    step === s
                      ? "bg-emerald-500 text-white"
                      : (["input", "details", "processing"].indexOf(step) > i)
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {i + 1}
                </div>
                {i < 2 && <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />}
              </div>
            ))}
          </div>
        )}

        {/* Past meetings toggle */}
        {step === "input" && pastMeetings.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {showHistory ? "Hide" : "View"} past meetings ({pastMeetings.length})
            </button>
            {showHistory && (
              <div className="mt-3 space-y-3">
                {/* Search + Filter */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      placeholder="Search meetings..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  {meetingClients.length > 1 && (
                    <select
                      value={historyClient}
                      onChange={e => setHistoryClient(e.target.value)}
                      className="px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                    >
                      <option value="">All clients</option>
                      {meetingClients.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Meeting list */}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredMeetings.length === 0 && (
                    <p className="text-xs text-zinc-400 text-center py-4">No meetings match your search</p>
                  )}
                  {filteredMeetings.map(m => {
                    const actionCount = (m.meetingActionItems || []).length
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <button
                          onClick={() => handleLoadMeeting(m.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.title}</span>
                            <span className="text-xs text-zinc-500 capitalize">{m.clientName}</span>
                          </div>
                          {m.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">{m.summary}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                            {m.meetingDate && <span>{new Date(m.meetingDate).toLocaleDateString()}</span>}
                            {m.transcriptSource && <span>{m.transcriptSource}</span>}
                            {actionCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-blue-500">
                                <ListChecks className="w-3 h-3" />
                                {actionCount}
                              </span>
                            )}
                            <span className={`${m.processingStatus === "complete" ? "text-emerald-500" : m.processingStatus === "error" ? "text-red-500" : "text-amber-500"}`}>
                              {m.processingStatus}
                            </span>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id) }}
                          className="flex-shrink-0 p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete meeting"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Step 1: Choose Input Mode ─── */}
        {step === "input" && (
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              How would you like to add your meeting?
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Choose how to provide the meeting content for AI analysis.
            </p>

            <div className="grid gap-3">
              {INPUT_MODES.map(mode => {
                const Icon = mode.icon
                const selected = inputMode === mode.id
                return (
                  <button
                    key={mode.id}
                    onClick={() => setInputMode(mode.id)}
                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selected
                          ? "bg-emerald-500 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${selected ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-800 dark:text-zinc-200"}`}>
                        {mode.label}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{mode.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep("details")}
                disabled={!canProceed()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Details + Input ─── */}
        {step === "details" && inputMode && (
          <div>
            <button
              onClick={() => setStep("input")}
              className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
              Meeting Details
            </h2>

            {/* Form fields */}
            <div className="space-y-4 mb-6">
              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Client *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    list="client-list"
                    placeholder="Type or select a client..."
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                  <datalist id="client-list">
                    {clients.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Q1 Enrollment Strategy Call"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Meeting Date
                </label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={e => setMeetingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Input area based on mode */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                {inputMode === "record" ? "Recording" : inputMode === "upload" ? "Audio File" : "Transcript"}
              </h3>

              {inputMode === "record" && (
                <AudioRecorder
                  onRecordingComplete={(blob, duration) => {
                    setAudioBlob(blob)
                    setAudioDuration(duration)
                  }}
                />
              )}

              {inputMode === "upload" && (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 dark:hover:border-emerald-600"
                    }`}
                  >
                    <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? "text-emerald-500" : "text-zinc-400"}`} />
                    {audioFile ? (
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{audioFile.name}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                          {audioDuration > 0 && ` — ${Math.floor(audioDuration / 60)}m ${audioDuration % 60}s`}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {isDragging ? "Drop audio file here" : "Click or drag & drop audio file"}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">MP3, WAV, M4A, WebM (max 25MB)</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
                    onChange={handleAudioFileChange}
                    className="hidden"
                  />
                </div>
              )}

              {inputMode === "paste" && (
                <div className="space-y-3">
                  <textarea
                    value={transcriptText}
                    onChange={e => setTranscriptText(e.target.value)}
                    placeholder="Paste your meeting transcript here..."
                    rows={10}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-y font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">or</span>
                    <button
                      onClick={() => transcriptFileRef.current?.click()}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      upload a file ({transcriptFile ? transcriptFile.name : "TXT, DOCX"})
                    </button>
                    <input
                      ref={transcriptFileRef}
                      type="file"
                      accept=".txt,.docx,.doc,text/plain"
                      onChange={handleTranscriptFileChange}
                      className="hidden"
                    />
                  </div>
                  {transcriptText && (
                    <p className="text-xs text-zinc-400">{transcriptText.length.toLocaleString()} characters</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!canProceed()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Process Meeting
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Processing ─── */}
        {step === "processing" && (
          <div className="text-center py-16">
            {processingStatus === "error" ? (
              <>
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Processing Failed</h2>
                <p className="text-sm text-red-500 mb-6">{processingError}</p>
                <button
                  onClick={resetWizard}
                  className="px-5 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                >
                  Try Again
                </button>
              </>
            ) : (
              <>
                <Loader2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-spin" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  {processingStatus === "transcribing" ? "Transcribing Audio..." : "Analyzing Meeting..."}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {processingStatus === "transcribing"
                    ? "Converting audio to text using AI speech recognition"
                    : "Breaking down the transcript into organized meeting notes"}
                </p>

                {/* Status steps */}
                <div className="mt-8 max-w-xs mx-auto space-y-3">
                  {(inputMode === "record" || inputMode === "upload") && (
                    <StatusStep
                      label="Transcribing audio"
                      active={processingStatus === "transcribing" || processingStatus === "uploading"}
                      done={processingStatus === "analyzing" || processingStatus === "complete"}
                    />
                  )}
                  <StatusStep
                    label="Analyzing transcript"
                    active={processingStatus === "analyzing"}
                    done={processingStatus === "complete"}
                  />
                  <StatusStep
                    label="Generating meeting notes"
                    active={false}
                    done={processingStatus === "complete"}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Step 4: Results ─── */}
        {step === "results" && meeting && (
          <div>
            <div className="flex items-start justify-between mb-6 gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{meeting.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500 flex-wrap">
                  <span className="capitalize">{meeting.clientName}</span>
                  {meeting.meetingDate && (
                    <>
                      <span>•</span>
                      <span>{new Date(meeting.meetingDate).toLocaleDateString()}</span>
                    </>
                  )}
                  {meeting.transcriptSource && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {meeting.transcriptSource === "whisper" ? <Mic className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {meeting.transcriptSource}
                      </span>
                    </>
                  )}
                  {meeting.audioDurationSecs && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.floor(meeting.audioDurationSecs / 60)}m {meeting.audioDurationSecs % 60}s
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {isAdmin && (
                  <button
                    onClick={handlePublish}
                    disabled={isPublished}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isPublished
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    title={isPublished ? "Already saved to Client Portfolio" : "Save to Client Portfolio"}
                  >
                    {isPublished ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save to Portfolio
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleOpenInStudio}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium transition-colors"
                  title="Open in Document Studio"
                >
                  <FileEdit className="w-4 h-4" />
                  Open in Studio
                </button>
                <button
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium transition-colors disabled:opacity-40"
                  title="Re-analyze with AI"
                >
                  <RefreshCw className={`w-4 h-4 ${isReanalyzing ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => handleDelete(meeting.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-medium transition-colors"
                  title="Delete meeting"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={resetWizard}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                >
                  New Meeting
                </button>
              </div>
            </div>

            <MeetingAnalysisView meeting={meeting} onUpdate={setMeeting} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatusStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      ) : active ? (
        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />
      )}
      <span className={`text-sm ${done ? "text-emerald-600 dark:text-emerald-400" : active ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-400 dark:text-zinc-500"}`}>
        {label}
      </span>
    </div>
  )
}
