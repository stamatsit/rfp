/**
 * ClientDocumentsTab — Document list, drag-drop upload, AI summary polling.
 */

import { useState, useRef, useEffect, useCallback } from "react"
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Loader2,
  Image,
  Briefcase,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Mic,
} from "lucide-react"
import { useClientData, useClientSelection } from "./ClientPortfolioContext"
import { clientDocumentsApi } from "@/lib/api"
import { toast } from "@/hooks/useToast"

// ─── Constants ────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  "meeting-notes": "Meeting",
  transcript: "Transcript",
  "proposal-sent": "Proposal",
  rfp: "RFP",
  "brand-asset": "Brand",
  general: "File",
}

const DOC_TYPE_COLORS: Record<string, string> = {
  "meeting-notes": "bg-sky-50 text-sky-600 border-sky-200/70 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800/40",
  transcript: "bg-violet-50 text-violet-600 border-violet-200/70 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/40",
  "proposal-sent": "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40",
  rfp: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40",
  "brand-asset": "bg-rose-50 text-rose-600 border-rose-200/70 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40",
  general: "bg-slate-100 text-slate-500 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/40",
}

function getMimeIcon(mimeType: string | null, docType: string): React.ReactNode {
  if (mimeType?.startsWith("image/")) return <Image size={14} className="text-violet-400" />
  if (mimeType === "application/pdf") return <FileText size={14} className="text-red-400" />
  if (mimeType?.includes("wordprocessingml") || mimeType?.includes("msword")) return <FileText size={14} className="text-sky-400" />
  if (mimeType?.startsWith("text/")) return <FileText size={14} className="text-slate-400" />
  if (docType === "proposal-sent" || docType === "rfp") return <Briefcase size={14} className="text-emerald-400" />
  return <FileText size={14} className="text-slate-400" />
}

function formatDocDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch { return "" }
}

export function ClientDocumentsTab() {
  const { isAdmin } = useClientData()
  const { selectedClient, clientDocs, setClientDocs, docsLoading } = useClientSelection()

  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const selectedClientRef = useRef<string | null>(null)
  selectedClientRef.current = selectedClient

  // ── Poll for AI summary after upload
  const startSummaryPoll = useCallback((docId: string) => {
    let attempts = 0
    const maxAttempts = 10
    const timer = setInterval(async () => {
      attempts++
      if (attempts >= maxAttempts) {
        clearInterval(timer)
        pollTimersRef.current.delete(docId)
        return
      }
      try {
        const { summary, keyPoints } = await clientDocumentsApi.getSummary(docId)
        if (summary) {
          clearInterval(timer)
          pollTimersRef.current.delete(docId)
          setClientDocs(prev => prev.map(d => d.id === docId ? { ...d, summary, keyPoints } : d))
        }
      } catch { /* ignore poll errors */ }
    }, 3000)
    pollTimersRef.current.set(docId, timer)
  }, [setClientDocs])

  // Clear poll timers on unmount
  useEffect(() => {
    return () => { pollTimersRef.current.forEach(t => clearInterval(t)); pollTimersRef.current.clear() }
  }, [])

  // ── Upload helper
  const uploadFiles = useCallback(async (files: File[], client: string) => {
    const failed: string[] = []
    for (const file of files) {
      setUploadProgress(`Uploading ${file.name}…`)
      try {
        const title = file.name.replace(/\.[^.]+$/, "")
        const doc = await clientDocumentsApi.upload(client, file, title, "general")
        setClientDocs(prev => {
          if (selectedClientRef.current !== client) return prev
          return [doc, ...prev]
        })
        if (!doc.summary && doc.mimeType && !doc.mimeType.startsWith("image/")) {
          startSummaryPoll(doc.id)
        }
      } catch (err) {
        console.error("Upload failed:", err)
        failed.push(file.name)
      }
    }
    setUploadProgress(null)
    if (failed.length) toast.error(`Failed to upload: ${failed.join(", ")}`)
  }, [setClientDocs, startSummaryPoll])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient) return
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    await uploadFiles(files, selectedClient)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const client = selectedClientRef.current
    if (!client) return
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    uploadFiles(files, client)
  }, [uploadFiles])

  if (!selectedClient) return null

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Documents</span>
          {clientDocs.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{clientDocs.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {uploadProgress && (
            <span className="text-[10px] text-slate-400 animate-pulse">{uploadProgress}</span>
          )}
          <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.svg,.webp" onChange={handleDocUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Upload size={10} /> Upload
          </button>
        </div>
      </div>

      {/* Content */}
      {docsLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={14} className="animate-spin text-slate-400" />
          <span className="text-xs text-slate-400">Loading documents…</span>
        </div>
      ) : clientDocs.length === 0 ? (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${isDragOver ? "border-sky-400 bg-sky-50/50 dark:bg-sky-900/10" : "border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"}`}
        >
          <Upload size={22} className={`mb-3 ${isDragOver ? "text-sky-400" : "text-slate-300 dark:text-slate-600"}`} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Drop files here or <span className="text-sky-500 font-medium">browse</span></p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Upload meeting notes, proposals, RFPs, or brand assets</p>
          <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">PDF, DOCX, TXT, images</p>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border rounded-xl overflow-hidden transition-colors ${isDragOver ? "border-sky-400 ring-1 ring-sky-400/30" : "border-slate-200/60 dark:border-slate-700/40"}`}
        >
          {clientDocs.map((doc, i) => {
            const isImg = doc.mimeType?.startsWith("image/")
            const isExpanded = expandedDocId === doc.id
            const canExtract = !isImg && doc.mimeType?.match(/(pdf|wordprocessingml|text\/)/)
            return (
              <div key={doc.id} className={`px-4 py-3 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getMimeIcon(doc.mimeType, doc.docType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{doc.title}</p>
                      {isAdmin ? (
                        <select
                          value={doc.docType}
                          onChange={async e => {
                            const newType = e.target.value
                            try {
                              const updated = await clientDocumentsApi.patch(doc.id, { docType: newType })
                              setClientDocs(prev => prev.map(d => d.id === doc.id ? { ...d, docType: updated.docType } : d))
                            } catch { /* silent */ }
                          }}
                          className={`shrink-0 text-[9px] font-medium px-1 py-0.5 rounded border cursor-pointer bg-transparent appearance-none ${DOC_TYPE_COLORS[doc.docType] || DOC_TYPE_COLORS.general}`}
                          style={{ paddingRight: "4px" }}
                        >
                          {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border ${DOC_TYPE_COLORS[doc.docType] || DOC_TYPE_COLORS.general}`}>
                          {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {doc.fileSize ? <span className="text-[10px] text-slate-400">{doc.fileSize < 1024 * 1024 ? `${(doc.fileSize / 1024).toFixed(0)} KB` : `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB`}</span> : null}
                      <span className="text-[10px] text-slate-300 dark:text-slate-600">{formatDocDate(doc.createdAt)}</span>
                    </div>
                    {doc.summary ? (
                      <p className={`text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                        {doc.summary}
                      </p>
                    ) : !canExtract ? (
                      <p className="text-[11px] text-slate-400 italic mt-0.5">No preview</p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic mt-0.5 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> AI is summarizing…
                      </p>
                    )}
                    {isExpanded && doc.keyPoints && doc.keyPoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {doc.keyPoints.map((kp, ki) => (
                          <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40">{kp}</span>
                        ))}
                      </div>
                    )}
                    {/* Meeting-specific analysis fields */}
                    {isExpanded && (doc.docType === "meeting-notes") && (
                      <div className="mt-2 space-y-2">
                        {(doc as any).meetingActionItems?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <ListChecks size={10} className="text-blue-500" />
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Action Items</span>
                            </div>
                            {(doc as any).meetingActionItems.map((item: any, ai: number) => (
                              <div key={ai} className="text-[11px] text-slate-600 dark:text-slate-400 pl-3 py-0.5">
                                • {item.text}{item.assignee ? ` (${item.assignee})` : ""}{item.dueDate ? ` — ${item.dueDate}` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        {(doc as any).meetingDecisions?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <CheckCircle2 size={10} className="text-emerald-500" />
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Decisions</span>
                            </div>
                            {(doc as any).meetingDecisions.map((d: string, di: number) => (
                              <div key={di} className="text-[11px] text-slate-600 dark:text-slate-400 pl-3 py-0.5">• {d}</div>
                            ))}
                          </div>
                        )}
                        {(doc as any).meetingPainPoints?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <AlertTriangle size={10} className="text-amber-500" />
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pain Points</span>
                            </div>
                            {(doc as any).meetingPainPoints.map((p: string, pi: number) => (
                              <div key={pi} className="text-[11px] text-slate-600 dark:text-slate-400 pl-3 py-0.5">• {p}</div>
                            ))}
                          </div>
                        )}
                        {(doc as any).meetingOpportunities?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <Lightbulb size={10} className="text-cyan-500" />
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Opportunities</span>
                            </div>
                            {(doc as any).meetingOpportunities.map((o: string, oi: number) => (
                              <div key={oi} className="text-[11px] text-slate-600 dark:text-slate-400 pl-3 py-0.5">• {o}</div>
                            ))}
                          </div>
                        )}
                        {(doc as any).transcriptSource && (
                          <div className="flex items-center gap-1 pt-1">
                            <Mic size={9} className="text-slate-400" />
                            <span className="text-[10px] text-slate-400">Source: {(doc as any).transcriptSource}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {doc.summary && (
                      <button onClick={() => setExpandedDocId(isExpanded ? null : doc.id)} className="text-[10px] text-sky-500 hover:text-sky-600 mt-1 transition-colors">
                        {isExpanded ? "Collapse" : doc.docType === "meeting-notes" ? "Meeting details" : "Key points"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => clientDocumentsApi.download(doc.id, doc.originalFilename)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Download"
                    >
                      <Download size={13} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
                          try {
                            await clientDocumentsApi.delete(doc.id)
                            setClientDocs(prev => prev.filter(d => d.id !== doc.id))
                          } catch {
                            toast.error("Failed to delete document. Please try again.")
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center gap-1.5"
          >
            <Upload size={10} className="text-slate-300 dark:text-slate-600" />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Drop more files or click to upload</span>
          </div>
        </div>
      )}
    </div>
  )
}
