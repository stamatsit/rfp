import { useEffect, useState } from "react"
import {
  X, Pencil, Download, Save, Loader2, FileText, Link2,
  CheckCircle2, AlertCircle,
} from "lucide-react"
import { Button, Badge, Input, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui"
import { getTopicColor } from "./libraryUtils"
import { searchApi, photosApi, type AnswerResponse, type PhotoResponse } from "@/lib/api"
import type { Topic } from "@/types"

interface PhotoDetailPanelProps {
  photo: PhotoResponse | null
  onClose: () => void
  onPhotoUpdated: (photo: PhotoResponse) => void
  topics: Topic[]
  isAdmin: boolean
  getTopicIndex: (topicId: string) => number
}

export function PhotoDetailPanel({
  photo, onClose, onPhotoUpdated, topics, isAdmin, getTopicIndex,
}: PhotoDetailPanelProps) {
  const isOpen = !!photo

  const [linkedAnswers, setLinkedAnswers] = useState<AnswerResponse[]>([])
  const [loadingLinked, setLoadingLinked] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ displayTitle: "", topicId: "", status: "Approved" as "Approved" | "Draft", tags: "", description: "" })
  const [isSaving, setIsSaving] = useState(false)

  // Link picker
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkPickerAnswers, setLinkPickerAnswers] = useState<AnswerResponse[]>([])
  const [linkPickerSearch, setLinkPickerSearch] = useState("")
  const [linkPickerLoading, setLinkPickerLoading] = useState(false)

  useEffect(() => {
    if (!photo) return
    setLoadingLinked(true)
    searchApi.getLinkedAnswers(photo.id)
      .then(setLinkedAnswers)
      .catch(() => {})
      .finally(() => setLoadingLinked(false))
  }, [photo?.id])

  useEffect(() => {
    if (!isOpen) { setIsEditing(false) }
  }, [isOpen])

  const startEditing = () => {
    if (!photo) return
    setEditForm({ displayTitle: photo.displayTitle, topicId: photo.topicId, status: photo.status, tags: photo.tags?.join(", ") || "", description: photo.description || "" })
    setIsEditing(true)
  }

  const saveChanges = async () => {
    if (!photo) return
    setIsSaving(true)
    try {
      const updated = await photosApi.update(photo.id, {
        displayTitle: editForm.displayTitle, topicId: editForm.topicId, status: editForm.status,
        tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        description: editForm.description || undefined,
      })
      onPhotoUpdated(updated)
      setIsEditing(false)
    } catch (err) { console.error("Failed to save photo:", err) }
    finally { setIsSaving(false) }
  }

  const handleDownload = () => {
    if (!photo) return
    window.open(photosApi.getDownloadUrl(photo.id), "_blank")
  }

  const openLinkPicker = async () => {
    if (!photo) return
    setShowLinkPicker(true)
    setLinkPickerSearch("")
    setLinkPickerLoading(true)
    try {
      const result = await searchApi.searchAnswers({})
      setLinkPickerAnswers(result)
    } catch {} finally { setLinkPickerLoading(false) }
  }

  const handleLink = async (answerId: string) => {
    if (!photo) return
    try {
      await searchApi.link(answerId, photo.id)
      const answers = await searchApi.getLinkedAnswers(photo.id)
      setLinkedAnswers(answers)
      setShowLinkPicker(false)
    } catch {}
  }

  const handleUnlink = async (answerId: string) => {
    if (!photo) return
    try {
      await searchApi.unlink(answerId, photo.id)
      const answers = await searchApi.getLinkedAnswers(photo.id)
      setLinkedAnswers(answers)
    } catch {}
  }

  if (!photo) return null

  const topicColor = getTopicColor(photo.topicId, getTopicIndex(photo.topicId))

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/20 dark:bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[520px] max-w-[90vw] bg-white dark:bg-slate-900 border-l border-slate-200/50 dark:border-white/[0.06] shadow-[-8px_0_32px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_32px_rgba(0,0,0,0.3)] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/30">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-snug tracking-[-0.01em] flex-1 min-w-0 pr-4">
              {isEditing ? "Edit Photo" : photo.displayTitle}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150">
              <X size={18} />
            </button>
          </div>
          {!isEditing && isAdmin && (
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={startEditing} className="rounded-lg text-[12px] h-7 active:scale-[0.98]">
                <Pencil size={12} className="mr-1.5" /> Edit
              </Button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="aspect-video bg-slate-100 dark:bg-slate-700 rounded-2xl overflow-hidden">
            <img src={photo.fileUrl || photosApi.getFileUrl(photo.storageKey)} alt={photo.displayTitle} className="w-full h-full object-contain" />
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[12px] font-medium">Title</Label>
                <Input value={editForm.displayTitle} onChange={(e) => setEditForm({ ...editForm, displayTitle: e.target.value })} className="rounded-xl text-[13px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium">Topic</Label>
                  <Select value={editForm.topicId} onValueChange={(v) => setEditForm({ ...editForm, topicId: v })}>
                    <SelectTrigger className="rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{topics.map(t => <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium">Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as "Approved" | "Draft" })}>
                    <SelectTrigger className="rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Approved"><div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />Approved</div></SelectItem>
                      <SelectItem value="Draft"><div className="flex items-center gap-2"><AlertCircle size={14} className="text-amber-500" />Draft</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[12px] font-medium">Tags <span className="text-slate-400">(comma-separated)</span></Label>
                <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} className="rounded-xl text-[13px]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[12px] font-medium">Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="rounded-xl min-h-[80px] text-[13px]" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1 rounded-xl active:scale-[0.98]" disabled={isSaving}>Cancel</Button>
                <Button onClick={saveChanges} className="flex-1 rounded-xl active:scale-[0.98]" disabled={isSaving || !editForm.displayTitle.trim()}>
                  {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" className={`${topicColor.bg} ${topicColor.text}`}>
                  {topics.find(t => t.id === photo.topicId)?.displayName}
                </Badge>
                <Badge variant={photo.status === "Approved" ? "success" : "warning"}>{photo.status}</Badge>
                {photo.tags?.map((tag, i) => <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>{tag}</Badge>)}
              </div>
              {photo.description && <p className="text-slate-600 dark:text-slate-400 text-[14px]">{photo.description}</p>}
              <Button onClick={handleDownload} className="w-full rounded-xl active:scale-[0.98]">
                <Download size={16} className="mr-2" /> Download Photo
              </Button>
              {(photo.usageCount || 0) > 0 && (
                <p className="text-xs text-slate-400 text-center">Downloaded {photo.usageCount}x</p>
              )}

              {/* Linked Answers */}
              <div className="pt-4 border-t border-slate-200/50 dark:border-slate-700/30">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-[14px]">
                    <FileText size={16} /> Linked Answers
                    <span className="text-slate-400 font-normal text-[13px]">({linkedAnswers.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={openLinkPicker} className="rounded-lg text-[12px] active:scale-[0.98]">
                      <Link2 size={14} className="mr-1.5" /> Link Answers
                    </Button>
                  )}
                </div>
                {linkedAnswers.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl">No answers linked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedAnswers.map(a => (
                      <div key={a.id} className="p-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl flex items-start gap-3 group hover:bg-slate-100/60 dark:hover:bg-slate-700/40 transition-colors duration-150">
                        <FileText size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{a.question}</p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-1 mt-0.5">{a.answer}</p>
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={() => handleUnlink(a.id)}>
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Link Picker */}
      <Dialog open={showLinkPicker} onOpenChange={(open) => { setShowLinkPicker(open); if (!open) setLinkPickerSearch("") }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText size={20} className="text-blue-600" /> Link Answers</DialogTitle>
            <DialogDescription>Select answers to link to this photo</DialogDescription>
          </DialogHeader>
          <input value={linkPickerSearch} onChange={(e) => setLinkPickerSearch(e.target.value)} placeholder="Search answers..."
            className="w-full mt-2 pl-3 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <div className="flex-1 overflow-y-auto space-y-2 mt-3 min-h-[200px] max-h-[400px]">
            {linkPickerLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : (
              linkPickerAnswers
                .filter(a => !linkPickerSearch.trim() || a.question.toLowerCase().includes(linkPickerSearch.toLowerCase()) || a.answer.toLowerCase().includes(linkPickerSearch.toLowerCase()))
                .filter(a => !linkedAnswers.some(la => la.id === a.id))
                .map(a => (
                  <div key={a.id} className="p-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-150 group"
                    onClick={() => handleLink(a.id)}>
                    <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-white line-clamp-1">{a.question}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{a.answer}</p>
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
