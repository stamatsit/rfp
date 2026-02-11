import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Upload,
  Image as ImageIcon,
  Download,
  X,
  Loader2,
  Save,
  Search,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Textarea,
} from "@/components/ui"
import { topicsApi, photosApi, type PhotoResponse } from "@/lib/api"
import type { Topic } from "@/types"

export function PhotoUpload() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [photos, setPhotos] = useState<PhotoResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoResponse | null>(null)
  const [editForm, setEditForm] = useState({
    displayTitle: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
    description: "",
  })
  const [isSaving, setIsSaving] = useState(false)

  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = photo.displayTitle.toLowerCase().includes(query)
        const matchesDescription = photo.description?.toLowerCase().includes(query)
        const matchesTags = photo.tags?.some(tag => tag.toLowerCase().includes(query))
        if (!matchesTitle && !matchesDescription && !matchesTags) return false
      }
      if (topicFilter !== "all" && photo.topicId !== topicFilter) return false
      if (statusFilter !== "all" && photo.status !== statusFilter) return false
      return true
    })
  }, [photos, searchQuery, topicFilter, statusFilter])

  const hasActiveFilters = topicFilter !== "all" || statusFilter !== "all"

  const loadPhotos = useCallback(async () => {
    try {
      const photosData = await photosApi.getAll()
      setPhotos(photosData)
    } catch (err) {
      console.error("Failed to refresh photos:", err)
    }
  }, [])

  // Load topics and photos on mount
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true)
        setError(null)
        const [topicsData, photosData] = await Promise.all([
          topicsApi.getAll(),
          photosApi.getAll(),
        ])
        setTopics(
          topicsData.map((t) => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            createdAt: new Date(t.createdAt).getTime(),
          }))
        )
        setPhotos(photosData)
      } catch (err) {
        console.error("Failed to load data:", err)
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // Listen for new-entry-saved to refresh photo list
  useEffect(() => {
    const handler = () => { loadPhotos() }
    window.addEventListener("new-entry-saved", handler)
    return () => window.removeEventListener("new-entry-saved", handler)
  }, [loadPhotos])

  const openUploadPanel = () => {
    window.dispatchEvent(new CustomEvent("open-new-entry", { detail: { type: "photo" } }))
  }

  const openLightbox = (photo: PhotoResponse) => {
    setLightboxPhoto(photo)
    setEditForm({
      displayTitle: photo.displayTitle,
      topicId: photo.topicId,
      status: photo.status,
      tags: photo.tags?.join(", ") || "",
      description: photo.description || "",
    })
    setLightboxOpen(true)
  }

  const saveLightboxChanges = async () => {
    if (!lightboxPhoto || !editForm.displayTitle.trim()) return
    setIsSaving(true)
    try {
      const updated = await photosApi.update(lightboxPhoto.id, {
        displayTitle: editForm.displayTitle.trim(),
        topicId: editForm.topicId,
        status: editForm.status,
        tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        description: editForm.description || undefined,
      })
      setPhotos(photos.map((p) => (p.id === updated.id ? updated : p)))
      setLightboxOpen(false)
      setLightboxPhoto(null)
    } catch (err) {
      console.error("Failed to save photo:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = (e: React.MouseEvent, photo: PhotoResponse) => {
    e.stopPropagation()
    window.open(photosApi.getDownloadUrl(photo.id), "_blank")
  }

  const clearFilters = () => {
    setSearchQuery("")
    setTopicFilter("all")
    setStatusFilter("all")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading photos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <AppHeader />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-3 text-sm">
              <X size={16} className="text-red-500 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Title + count */}
            <div className="flex items-center gap-2.5 mr-auto">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #F59E0B, #B45309)" }}>
                <ImageIcon size={16} className="text-white" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                Photos
              </h1>
              <span className="text-sm text-slate-400 dark:text-slate-500 tabular-nums">
                {filteredPhotos.length}
                {filteredPhotos.length !== photos.length && ` of ${photos.length}`}
              </span>
            </div>

            {/* Search */}
            <div className="relative w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Topic filter */}
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] text-sm rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-auto min-w-[110px] text-sm rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                Clear
              </button>
            )}

            {/* Upload button */}
            <Button
              onClick={openUploadPanel}
              className="h-9 px-4 text-sm font-medium rounded-lg text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
            >
              <Upload size={15} className="mr-1.5" />
              Upload
            </Button>
          </div>

          {/* Rule */}
          <div className="border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }} />

          {/* Content */}
          {photos.length === 0 ? (
            /* Empty state — no photos at all */
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(180,83,9,0.12))" }}>
                  <ImageIcon size={28} className="text-amber-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  No photos yet
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
                  Upload photos to build your library
                </p>
                <Button onClick={openUploadPanel}
                  className="mt-6 h-10 px-5 text-sm text-white rounded-lg"
                  style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
                  <Upload size={15} className="mr-2" />
                  Upload Photos
                </Button>
              </div>
            </div>
          ) : filteredPhotos.length === 0 ? (
            /* Empty state — filters match nothing */
            <div className="flex items-center justify-center min-h-[30vh]">
              <div className="text-center">
                <Search size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No photos match your filters</p>
                <button onClick={clearFilters}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:underline mt-2">
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            /* Photo grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredPhotos.map((photo) => {
                const topic = topics.find(t => t.id === photo.topicId)
                return (
                  <div
                    key={photo.id}
                    className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer"
                    onClick={() => openLightbox(photo)}
                  >
                    {/* Image */}
                    <img
                      src={photosApi.getFileUrl(photo.storageKey)}
                      alt={photo.displayTitle}
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                        const fallback = e.currentTarget.nextElementSibling
                        if (fallback) fallback.classList.remove("hidden")
                      }}
                    />
                    <div className="hidden absolute inset-0 flex items-center justify-center">
                      <ImageIcon size={24} className="text-slate-300 dark:text-slate-600" />
                    </div>

                    {/* Draft dot */}
                    {photo.status === "Draft" && (
                      <div className="absolute top-2 left-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Download button — top right on hover */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={(e) => handleDownload(e, photo)}
                        className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-sm text-white/90 flex items-center justify-center hover:bg-black/60 transition-colors"
                      >
                        <Download size={14} />
                      </button>
                    </div>

                    {/* Title + topic — bottom, slides up on hover */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 ease-out">
                      <p className="text-white text-sm font-medium truncate">{photo.displayTitle}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {topic && (
                          <span className="text-[11px] text-white/70">{topic.displayName}</span>
                        )}
                        {photo.status === "Draft" && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-300 font-medium">Draft</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox Detail Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-2xl p-0 rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo Details</DialogTitle>
            <DialogDescription>View and edit photo metadata</DialogDescription>
          </DialogHeader>

          {lightboxPhoto && (
            <div>
              {/* Photo area — dark background */}
              <div className="relative bg-slate-950 flex items-center justify-center overflow-hidden rounded-t-2xl" style={{ maxHeight: "60vh" }}>
                <img
                  src={photosApi.getFileUrl(lightboxPhoto.storageKey)}
                  alt={lightboxPhoto.displayTitle}
                  className="max-w-full max-h-[60vh] object-contain"
                />
                <button
                  onClick={(e) => handleDownload(e, lightboxPhoto)}
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white/90 text-xs font-medium hover:bg-black/70 transition-colors"
                >
                  <Download size={13} />
                  Download
                </button>
              </div>

              {/* Metadata area */}
              <div className="p-6 space-y-4">
                {/* Title — inline editable heading */}
                <Input
                  value={editForm.displayTitle}
                  onChange={(e) => setEditForm({ ...editForm, displayTitle: e.target.value })}
                  className="text-lg font-semibold border-0 border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-amber-400 dark:focus:border-amber-500 rounded-none px-0 h-auto py-1 bg-transparent text-slate-900 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Photo title"
                />

                {/* Topic + Status row */}
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium mb-1 block">
                      Topic
                    </label>
                    <Select value={editForm.topicId} onValueChange={(v) => setEditForm({ ...editForm, topicId: v })}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue placeholder="Select topic" />
                      </SelectTrigger>
                      <SelectContent side="top">
                        {topics.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[130px]">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium mb-1 block">
                      Status
                    </label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as "Approved" | "Draft" })}>
                      <SelectTrigger className="h-9 text-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Approved">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Approved
                          </div>
                        </SelectItem>
                        <SelectItem value="Draft">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Draft
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium mb-1 block">
                    Tags
                  </label>
                  <Input
                    value={editForm.tags}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                    placeholder="tag1, tag2, tag3"
                    className="h-9 text-sm rounded-lg"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium mb-1 block">
                    Description
                  </label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Optional description..."
                    className="text-sm rounded-lg min-h-[60px] resize-none"
                  />
                </div>

                {/* File metadata footer */}
                <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {lightboxPhoto.originalFilename && (
                    <span>{lightboxPhoto.originalFilename}</span>
                  )}
                  {lightboxPhoto.fileSize && (
                    <span>{lightboxPhoto.fileSize > 1024 * 1024
                      ? `${(lightboxPhoto.fileSize / 1024 / 1024).toFixed(1)} MB`
                      : `${Math.round(lightboxPhoto.fileSize / 1024)} KB`
                    }</span>
                  )}
                  {(lightboxPhoto.linkedAnswersCount ?? 0) > 0 && (
                    <span>{lightboxPhoto.linkedAnswersCount} linked answer{lightboxPhoto.linkedAnswersCount !== 1 ? "s" : ""}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setLightboxOpen(false)}
                    className="rounded-lg" disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveLightboxChanges}
                    className="rounded-lg text-white"
                    style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
                    disabled={isSaving || !editForm.displayTitle.trim()}>
                    {isSaving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
