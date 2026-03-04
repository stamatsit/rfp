import { useEffect, useState } from "react"
import {
  X, History, Pencil, Trash2, Copy, Check, Wand2, ChevronDown,
  Image as ImageIcon, Link2, Unlink, Loader2, AlertTriangle, Save, Plus,
} from "lucide-react"
import { Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui"
import { RelatedContent } from "@/components/RelatedContent"
import { AnswerEditForm } from "./AnswerEditForm"
import { AnswerVersionHistory } from "./AnswerVersionHistory"
import { AdaptPanel } from "./AdaptPanel"
import { getTopicColor } from "./libraryUtils"
import {
  searchApi, answersApi, photosApi, aiApi,
  type AnswerResponse, type PhotoResponse, type AnswerVersion,
  type AdaptationType, type AIAdaptResponse,
} from "@/lib/api"
import type { Topic } from "@/types"

interface AnswerDetailPanelProps {
  answer: AnswerResponse | null
  onClose: () => void
  onAnswerUpdated: (answer: AnswerResponse) => void
  onAnswerDeleted: () => void
  topics: Topic[]
  isAdmin: boolean
  getTopicIndex: (topicId: string) => number
}

export function AnswerDetailPanel({
  answer, onClose, onAnswerUpdated, onAnswerDeleted,
  topics, isAdmin, getTopicIndex,
}: AnswerDetailPanelProps) {
  const isOpen = !!answer

  // Linked photos
  const [linkedPhotos, setLinkedPhotos] = useState<PhotoResponse[]>([])
  const [loadingLinked, setLoadingLinked] = useState(false)

  // Copy
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    if (id.startsWith("a") || id.length > 10) searchApi.logCopy(id).catch(() => {})
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Edit
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ question: "", answer: "", topicId: "", status: "Approved" as "Approved" | "Draft", tags: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Version history
  const [versions, setVersions] = useState<AnswerVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<AnswerVersion | null>(null)

  // Adapt
  const [showAdapt, setShowAdapt] = useState(false)
  const [adaptationType, setAdaptationType] = useState<AdaptationType>("shorten")
  const [adaptOptions, setAdaptOptions] = useState({ customInstruction: "", targetWordCount: 100, clientName: "", industry: "" })
  const [adaptResult, setAdaptResult] = useState<AIAdaptResponse | null>(null)
  const [isAdapting, setIsAdapting] = useState(false)

  // Link picker
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkPickerPhotos, setLinkPickerPhotos] = useState<PhotoResponse[]>([])
  const [linkPickerSearch, setLinkPickerSearch] = useState("")
  const [linkPickerLoading, setLinkPickerLoading] = useState(false)

  // Load linked photos when answer changes
  useEffect(() => {
    if (!answer) return
    setLoadingLinked(true)
    searchApi.getLinkedPhotos(answer.id)
      .then(setLinkedPhotos)
      .catch(() => {})
      .finally(() => setLoadingLinked(false))
  }, [answer?.id])

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false)
      setShowVersions(false)
      setShowDeleteConfirm(false)
      setShowSaveConfirm(false)
      setShowAdapt(false)
      setAdaptResult(null)
      setSelectedVersion(null)
    }
  }, [isOpen])

  const startEditing = () => {
    if (!answer) return
    setEditForm({
      question: answer.question,
      answer: answer.answer,
      topicId: answer.topicId,
      status: answer.status,
      tags: answer.tags?.join(", ") || "",
    })
    setIsEditing(true)
  }

  const hasChanges = () => {
    if (!answer) return false
    return editForm.question !== answer.question || editForm.answer !== answer.answer ||
      editForm.topicId !== answer.topicId || editForm.status !== answer.status ||
      editForm.tags !== (answer.tags?.join(", ") || "")
  }

  const confirmSave = () => { if (hasChanges()) setShowSaveConfirm(true) }

  const saveChanges = async () => {
    if (!answer) return
    setIsSaving(true)
    try {
      const updated = await answersApi.update(answer.id, {
        question: editForm.question, answer: editForm.answer,
        topicId: editForm.topicId, status: editForm.status,
        tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      })
      onAnswerUpdated(updated)
      setIsEditing(false)
      setShowSaveConfirm(false)
    } catch (err) { console.error("Failed to save:", err) }
    finally { setIsSaving(false) }
  }

  const saveAsNew = async () => {
    if (!answer) return
    setIsSaving(true)
    try {
      const newAnswer = await answersApi.fork(answer.id, {
        question: editForm.question, answer: editForm.answer,
        topicId: editForm.topicId, status: editForm.status,
        tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      })
      onAnswerUpdated(newAnswer)
      setIsEditing(false)
      setShowSaveConfirm(false)
    } catch (err) { console.error("Failed to fork:", err) }
    finally { setIsSaving(false) }
  }

  const deleteAnswer = async () => {
    if (!answer) return
    setIsDeleting(true)
    try {
      await answersApi.delete(answer.id)
      onAnswerDeleted()
    } catch (err) { console.error("Failed to delete:", err) }
    finally { setIsDeleting(false) }
  }

  const loadVersions = async () => {
    if (!answer) return
    setLoadingVersions(true)
    try {
      const v = await answersApi.getVersions(answer.id)
      setVersions(v)
      setShowVersions(true)
    } catch (err) { console.error("Failed to load versions:", err) }
    finally { setLoadingVersions(false) }
  }

  const restoreVersion = (version: AnswerVersion) => {
    setEditForm({ question: version.question, answer: version.answer, topicId: version.topicId, status: version.status, tags: version.tags?.join(", ") || "" })
    setIsEditing(true)
    setShowVersions(false)
    setSelectedVersion(null)
  }

  const handleOpenForked = async (forkedToId: string) => {
    try {
      const forked = await answersApi.getById(forkedToId)
      setShowVersions(false)
      setSelectedVersion(null)
      onAnswerUpdated(forked)
    } catch {}
  }

  const handleAdapt = async () => {
    if (!answer) return
    setIsAdapting(true)
    setAdaptResult(null)
    try {
      const result = await aiApi.adapt({
        content: answer.answer, adaptationType,
        customInstruction: adaptationType === "custom" ? adaptOptions.customInstruction : undefined,
        targetWordCount: adaptationType === "shorten" ? adaptOptions.targetWordCount : undefined,
        clientName: adaptOptions.clientName || undefined,
        industry: adaptOptions.industry || undefined,
      })
      setAdaptResult(result)
    } catch {
      setAdaptResult({ adaptedContent: "", originalContent: answer.answer, instruction: adaptationType, refused: true, refusalReason: "Failed to adapt content. Please try again." })
    } finally { setIsAdapting(false) }
  }

  const openLinkPicker = async () => {
    if (!answer) return
    setShowLinkPicker(true)
    setLinkPickerSearch("")
    setLinkPickerLoading(true)
    try {
      const result = await searchApi.searchPhotos({})
      setLinkPickerPhotos(result)
    } catch {} finally { setLinkPickerLoading(false) }
  }

  const handleLink = async (photoId: string) => {
    if (!answer) return
    try {
      await searchApi.link(answer.id, photoId)
      const photos = await searchApi.getLinkedPhotos(answer.id)
      setLinkedPhotos(photos)
      setShowLinkPicker(false)
    } catch (err) { console.error("Failed to link:", err) }
  }

  const handleUnlink = async (photoId: string) => {
    if (!answer) return
    try {
      await searchApi.unlink(answer.id, photoId)
      const photos = await searchApi.getLinkedPhotos(answer.id)
      setLinkedPhotos(photos)
    } catch (err) { console.error("Failed to unlink:", err) }
  }

  if (!answer) return null

  const topicColor = getTopicColor(answer.topicId, getTopicIndex(answer.topicId))

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/20 dark:bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[520px] max-w-[90vw] bg-white dark:bg-slate-900 border-l border-slate-200/50 dark:border-white/[0.06] shadow-[-8px_0_32px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_32px_rgba(0,0,0,0.3)] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/30">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-snug tracking-[-0.01em]">
                {isEditing ? "Edit Answer" : showVersions ? "Version History" : answer.question}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150"
            >
              <X size={18} />
            </button>
          </div>

          {/* Action buttons */}
          {!isEditing && !showVersions && !showDeleteConfirm && (
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={loadVersions} disabled={loadingVersions}
                className="rounded-lg text-[12px] h-7 active:scale-[0.98] transition-all duration-150">
                {loadingVersions ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <History size={12} className="mr-1.5" />}
                History
              </Button>
              {isAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={startEditing}
                    className="rounded-lg text-[12px] h-7 active:scale-[0.98] transition-all duration-150">
                    <Pencil size={12} className="mr-1.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-lg text-[12px] h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800 active:scale-[0.98] transition-all duration-150">
                    <Trash2 size={12} className="mr-1.5" /> Delete
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {showDeleteConfirm ? (
            /* Delete Confirmation */
            <div className="space-y-4">
              <div className="p-4 bg-red-50/80 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                    <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-red-900 dark:text-red-200">Delete this answer?</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">This action cannot be undone.</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{answer.question}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-xl active:scale-[0.98]" disabled={isDeleting}>Cancel</Button>
                <Button onClick={deleteAnswer} className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white active:scale-[0.98]" disabled={isDeleting}>
                  {isDeleting ? <><Loader2 size={16} className="mr-2 animate-spin" />Deleting...</> : <><Trash2 size={16} className="mr-2" />Delete</>}
                </Button>
              </div>
            </div>
          ) : showVersions ? (
            <AnswerVersionHistory
              versions={versions}
              selectedVersion={selectedVersion}
              onSelectVersion={setSelectedVersion}
              onClose={() => { setShowVersions(false); setSelectedVersion(null) }}
              onRestore={restoreVersion}
              onOpenForked={handleOpenForked}
            />
          ) : isEditing ? (
            <AnswerEditForm
              form={editForm}
              onChange={setEditForm}
              topics={topics}
              isSaving={isSaving}
              hasChanges={hasChanges()}
              onSave={confirmSave}
              onCancel={() => { setIsEditing(false); setShowSaveConfirm(false) }}
            />
          ) : (
            /* View Mode */
            <>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" className={`${topicColor.bg} ${topicColor.text}`}>
                  {topics.find(t => t.id === answer.topicId)?.displayName}
                </Badge>
                <Badge variant={answer.status === "Approved" ? "success" : "warning"}>
                  {answer.status}
                </Badge>
                {answer.tags.map((tag, i) => (
                  <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>{tag}</Badge>
                ))}
              </div>

              <div className="p-5 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed text-[14px]">
                  {answer.answer}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleCopy(answer.answer, answer.id + "-panel")}
                  variant="success"
                  className="flex-1 rounded-xl active:scale-[0.98] transition-all duration-150"
                >
                  {copiedId === answer.id + "-panel"
                    ? <><Check size={16} className="mr-2" />Copied</>
                    : <><Copy size={16} className="mr-2" />Copy Answer</>
                  }
                </Button>
                <Button
                  onClick={() => setShowAdapt(!showAdapt)}
                  variant={showAdapt ? "default" : "outline"}
                  className={`flex-1 rounded-xl active:scale-[0.98] transition-all duration-150 ${showAdapt ? "bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 border-0 shadow-[0_2px_8px_rgba(59,130,246,0.3)]" : ""}`}
                >
                  <Wand2 size={16} className="mr-2" />
                  Adapt for RFP
                  <ChevronDown size={14} className={`ml-2 transition-transform duration-200 ${showAdapt ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {showAdapt && (
                <AdaptPanel
                  adaptationType={adaptationType}
                  onAdaptationTypeChange={setAdaptationType}
                  adaptOptions={adaptOptions}
                  onAdaptOptionsChange={setAdaptOptions}
                  isAdapting={isAdapting}
                  adaptResult={adaptResult}
                  onAdapt={handleAdapt}
                  onCopyAdapted={() => handleCopy(adaptResult?.adaptedContent || "", "adapted-content")}
                  copiedAdapted={copiedId === "adapted-content"}
                />
              )}

              <RelatedContent
                currentAnswerId={answer.id}
                currentQuestion={answer.question}
                currentTopicId={answer.topicId}
              />

              {/* Linked Photos */}
              <div className="pt-4 border-t border-slate-200/50 dark:border-slate-700/30">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-[14px]">
                    <ImageIcon size={16} />
                    Linked Photos
                    <span className="text-slate-400 dark:text-slate-500 font-normal text-[13px]">({linkedPhotos.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={openLinkPicker} className="rounded-lg text-[12px] active:scale-[0.98]">
                      <Link2 size={14} className="mr-1.5" /> Link Photos
                    </Button>
                  )}
                </div>
                {linkedPhotos.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl">
                    No photos linked to this answer yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {linkedPhotos.map((photo) => (
                      <div key={photo.id} className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-xl relative group overflow-hidden">
                        <img
                          src={photo.fileUrl || photosApi.getFileUrl(photo.storageKey)}
                          alt={photo.displayTitle}
                          className="w-full h-full object-cover"
                        />
                        {isAdmin && (
                          <Button
                            variant="destructive" size="icon"
                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg rounded-lg"
                            onClick={() => handleUnlink(photo.id)}
                          >
                            <Unlink size={12} />
                          </Button>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs truncate font-medium">{photo.displayTitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      <Dialog open={showSaveConfirm} onOpenChange={(open) => { if (!open) setShowSaveConfirm(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" /> Save Changes
            </DialogTitle>
            <DialogDescription>Choose how to save your edits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editForm.question !== answer.question && (
              <div className="p-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Question</p>
                <p className="text-sm text-red-600 dark:text-red-400 line-through">{answer.question}</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{editForm.question}</p>
              </div>
            )}
            {editForm.answer !== answer.answer && (
              <div className="p-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Answer</p>
                <p className="text-sm text-red-600 dark:text-red-400 line-through line-clamp-3 whitespace-pre-wrap">{answer.answer}</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 line-clamp-3 whitespace-pre-wrap mt-1">{editForm.answer}</p>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <Button onClick={saveChanges} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]" disabled={isSaving}>
                {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                Update this entry
              </Button>
              <Button onClick={saveAsNew} variant="outline" className="w-full rounded-xl active:scale-[0.98]" disabled={isSaving}>
                {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Plus size={16} className="mr-2" />}
                Save as new entry
              </Button>
              <Button variant="ghost" onClick={() => setShowSaveConfirm(false)} className="w-full rounded-xl text-slate-500" disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Picker Dialog */}
      <Dialog open={showLinkPicker} onOpenChange={(open) => { setShowLinkPicker(open); if (!open) setLinkPickerSearch("") }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon size={20} className="text-violet-600" /> Link Photos
            </DialogTitle>
            <DialogDescription>Select photos to link to this answer</DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <input
              value={linkPickerSearch}
              onChange={(e) => setLinkPickerSearch(e.target.value)}
              placeholder="Search photos..."
              className="w-full pl-3 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 mt-3 min-h-[200px] max-h-[400px]">
            {linkPickerLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : (
              linkPickerPhotos
                .filter(p => !linkPickerSearch.trim() || p.displayTitle.toLowerCase().includes(linkPickerSearch.toLowerCase()) || p.tags?.some(t => t.toLowerCase().includes(linkPickerSearch.toLowerCase())))
                .filter(p => !linkedPhotos.some(lp => lp.id === p.id))
                .map(photo => (
                  <div
                    key={photo.id}
                    className="p-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-150 group"
                    onClick={() => handleLink(photo.id)}
                  >
                    <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                      <img src={photo.fileUrl || photosApi.getFileUrl(photo.storageKey)} alt={photo.displayTitle} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{photo.displayTitle}</p>
                      {photo.tags && photo.tags.length > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{photo.tags.slice(0, 3).join(", ")}</p>
                      )}
                    </div>
                    <Link2 size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
