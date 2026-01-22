import { useState, useEffect, useMemo } from "react"
import {
  Upload,
  Image as ImageIcon,
  Download,
  Pencil,
  X,
  Check,
  Loader2,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
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
  Label,
} from "@/components/ui"
import { topicsApi, photosApi, type PhotoResponse } from "@/lib/api"
import type { Topic } from "@/types"

interface PendingUpload {
  file: File
  preview: string
  title: string
  topicId: string
  status: "Approved" | "Draft"
  tags: string
  description: string
}

// Topic color mapping
function getTopicColor(index: number) {
  const colors = [
    { bg: "bg-blue-50", text: "text-blue-700" },
    { bg: "bg-purple-50", text: "text-purple-700" },
    { bg: "bg-teal-50", text: "text-teal-700" },
    { bg: "bg-orange-50", text: "text-orange-700" },
    { bg: "bg-pink-50", text: "text-pink-700" },
    { bg: "bg-emerald-50", text: "text-emerald-700" },
  ]
  return colors[index % colors.length]!
}

export function PhotoUpload() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [photos, setPhotos] = useState<PhotoResponse[]>([])
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editPhotoData, setEditPhotoData] = useState<PhotoResponse | null>(null)
  const [editForm, setEditForm] = useState({
    displayTitle: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
    description: "",
  })
  const [isSaving, setIsSaving] = useState(false)

  // Filter photos based on search and filters
  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = photo.displayTitle.toLowerCase().includes(query)
        const matchesDescription = photo.description?.toLowerCase().includes(query)
        const matchesTags = photo.tags?.some(tag => tag.toLowerCase().includes(query))
        if (!matchesTitle && !matchesDescription && !matchesTags) {
          return false
        }
      }

      // Topic filter
      if (topicFilter !== "all" && photo.topicId !== topicFilter) {
        return false
      }

      // Status filter
      if (statusFilter !== "all" && photo.status !== statusFilter) {
        return false
      }

      return true
    })
  }, [photos, searchQuery, topicFilter, statusFilter])

  // Count active filters
  const activeFilterCount = [
    topicFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length

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

  const handleFilesSelected = (files: FileList) => {
    const newUploads: PendingUpload[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      title: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      topicId: "",
      status: "Approved" as const,
      tags: "",
      description: "",
    }))
    setPendingUploads([...pendingUploads, ...newUploads])
  }

  const updatePendingUpload = (index: number, updates: Partial<PendingUpload>) => {
    const updated = [...pendingUploads]
    const item = updated[index]
    if (item) {
      updated[index] = { ...item, ...updates }
      setPendingUploads(updated)
    }
  }

  const removePendingUpload = (index: number) => {
    const upload = pendingUploads[index]
    if (upload) {
      URL.revokeObjectURL(upload.preview)
    }
    setPendingUploads(pendingUploads.filter((_, i) => i !== index))
  }

  const handleUploadAll = async () => {
    const invalidUploads = pendingUploads.filter((u) => !u.topicId)
    if (invalidUploads.length > 0) {
      alert("Please select a topic for all photos")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const files = pendingUploads.map((u) => u.file)
      const metadata = pendingUploads.map((u) => ({
        title: u.title,
        topicId: u.topicId,
        status: u.status,
        tags: u.tags,
        description: u.description,
      }))

      const result = await photosApi.upload(files, metadata)

      setPhotos([...result.photos, ...photos])
      pendingUploads.forEach((u) => URL.revokeObjectURL(u.preview))
      setPendingUploads([])
    } catch (err) {
      console.error("Failed to upload photos:", err)
      setError(err instanceof Error ? err.message : "Failed to upload photos")
    } finally {
      setIsUploading(false)
    }
  }

  const handleEdit = (photo: PhotoResponse) => {
    setEditPhotoData(photo)
    setEditForm({
      displayTitle: photo.displayTitle,
      topicId: photo.topicId,
      status: photo.status,
      tags: photo.tags?.join(", ") || "",
      description: photo.description || "",
    })
    setEditDialogOpen(true)
  }

  const savePhotoChanges = async () => {
    if (!editPhotoData || !editForm.displayTitle.trim()) return

    setIsSaving(true)
    try {
      const updated = await photosApi.update(editPhotoData.id, {
        displayTitle: editForm.displayTitle.trim(),
        topicId: editForm.topicId,
        status: editForm.status,
        tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        description: editForm.description || undefined,
      })
      setPhotos(photos.map((p) => (p.id === updated.id ? updated : p)))
      setEditDialogOpen(false)
      setEditPhotoData(null)
    } catch (err) {
      console.error("Failed to save photo:", err)
      alert(err instanceof Error ? err.message : "Failed to save photo")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = (photo: PhotoResponse) => {
    window.open(photosApi.getDownloadUrl(photo.id), "_blank")
  }

  const getTopicIndex = (topicId: string) => {
    return topics.findIndex((t) => t.id === topicId)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading photos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <X size={16} className="text-red-600" />
              </div>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Upload zone */}
          <Card className="overflow-hidden dark:bg-slate-800 dark:border-slate-700">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Upload size={20} className="text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg dark:text-white">Add New Photos</CardTitle>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Drag and drop or click to browse</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Drop zone */}
              <div
                className={`
                  border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
                  ${isDragging
                    ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20 ring-4 ring-purple-500/20"
                    : "border-slate-300 dark:border-slate-600 bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/30 dark:hover:bg-purple-900/10"
                  }
                `}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  handleFilesSelected(e.dataTransfer.files)
                }}
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = "image/*"
                  input.multiple = true
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files
                    if (files) handleFilesSelected(files)
                  }
                  input.click()
                }}
              >
                <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                  <ImageIcon size={28} className="text-purple-600" />
                </div>
                <p className="text-lg font-medium text-slate-900">
                  {isDragging ? "Drop photos here" : "Drop photos here or click to browse"}
                </p>
                <p className="text-slate-500 mt-2 text-sm">PNG, JPG, GIF up to 10MB each</p>
              </div>

              {/* Pending uploads */}
              {pendingUploads.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">
                      Ready to upload
                      <span className="text-slate-500 font-normal ml-2">({pendingUploads.length})</span>
                    </h3>
                    <Button
                      size="lg"
                      onClick={handleUploadAll}
                      disabled={isUploading}
                      className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-2 animate-spin" size={18} />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2" size={18} />
                          Upload All
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {pendingUploads.map((upload, index) => (
                      <div
                        key={index}
                        className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 items-start"
                      >
                        <div className="w-20 h-20 rounded-xl bg-slate-200 overflow-hidden flex-shrink-0">
                          <img
                            src={upload.preview}
                            alt={upload.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">
                              Title
                            </label>
                            <Input
                              value={upload.title}
                              onChange={(e) =>
                                updatePendingUpload(index, { title: e.target.value })
                              }
                              placeholder="Photo title"
                              className="h-9"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">
                              Topic <span className="text-red-500">*</span>
                            </label>
                            <Select
                              value={upload.topicId}
                              onValueChange={(value) =>
                                updatePendingUpload(index, { topicId: value })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select topic" />
                              </SelectTrigger>
                              <SelectContent>
                                {topics.map((topic) => (
                                  <SelectItem key={topic.id} value={topic.id}>
                                    {topic.displayName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">
                              Tags
                            </label>
                            <Input
                              value={upload.tags}
                              onChange={(e) =>
                                updatePendingUpload(index, { tags: e.target.value })
                              }
                              placeholder="tag1, tag2, tag3"
                              className="h-9"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">
                              Status
                            </label>
                            <Select
                              value={upload.status}
                              onValueChange={(value: "Approved" | "Draft") =>
                                updatePendingUpload(index, { status: value })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Approved">Approved</SelectItem>
                                <SelectItem value="Draft">Draft</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePendingUpload(index)}
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Existing photos */}
          <div>
            <div className="space-y-4 mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Library Photos
                  <span className="text-slate-500 font-normal ml-2">
                    ({filteredPhotos.length}{filteredPhotos.length !== photos.length ? ` of ${photos.length}` : ""})
                  </span>
                </h2>
              </div>

              {/* Search and filter bar */}
              <div className="flex gap-3 items-center">
                <div className="flex-1 relative">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    type="text"
                    placeholder="Search photos by title, description, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-11 h-11 bg-white border-slate-300 rounded-xl text-base shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <Button
                  variant={showFilters ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`h-11 px-4 rounded-xl ${showFilters ? "bg-purple-500 hover:bg-purple-600" : "border-slate-300"}`}
                >
                  <Filter size={16} className="mr-2" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${showFilters ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>

              {/* Filter options */}
              {showFilters && (
                <div className="flex flex-wrap gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex-1 min-w-[150px]">
                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">Topic</label>
                    <Select value={topicFilter} onValueChange={setTopicFilter}>
                      <SelectTrigger className="h-10 rounded-xl bg-white">
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
                  </div>

                  <div className="flex-1 min-w-[150px]">
                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 rounded-xl bg-white">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Approved">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            Approved
                          </div>
                        </SelectItem>
                        <SelectItem value="Draft">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-amber-500" />
                            Draft
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(topicFilter !== "all" || statusFilter !== "all") && (
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTopicFilter("all")
                          setStatusFilter("all")
                        }}
                        className="h-10 text-slate-500 hover:text-slate-700"
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {photos.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <ImageIcon size={28} className="text-slate-400" />
                  </div>
                  <p className="text-lg font-medium text-slate-900">No photos yet</p>
                  <p className="text-slate-500 mt-1">Upload some photos to get started</p>
                </CardContent>
              </Card>
            ) : filteredPhotos.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Search size={28} className="text-slate-400" />
                  </div>
                  <p className="text-lg font-medium text-slate-900">No photos found</p>
                  <p className="text-slate-500 mt-1">Try adjusting your search or filters</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("")
                      setTopicFilter("all")
                      setStatusFilter("all")
                    }}
                    className="mt-4 rounded-xl"
                  >
                    Clear all filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredPhotos.map((photo) => {
                  const topicColor = getTopicColor(getTopicIndex(photo.topicId))
                  return (
                    <Card
                      key={photo.id}
                      className="overflow-hidden group hover:shadow-lg transition-all duration-300"
                    >
                      <div className="aspect-square bg-slate-100 relative overflow-hidden">
                        <img
                          src={photosApi.getFileUrl(photo.storageKey)}
                          alt={photo.displayTitle}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                            e.currentTarget.nextElementSibling?.classList.remove("hidden")
                          }}
                        />
                        <div className="hidden absolute inset-0 flex items-center justify-center">
                          <ImageIcon size={32} className="text-slate-300" />
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        {/* Hover actions */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform">
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 h-8 bg-white/90 hover:bg-white text-xs"
                              onClick={() => handleEdit(photo)}
                            >
                              <Pencil size={12} className="mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 h-8 bg-white/90 hover:bg-white text-xs"
                              onClick={() => handleDownload(photo)}
                            >
                              <Download size={12} className="mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="p-3">
                        <p className="font-medium text-sm text-slate-900 truncate" title={photo.displayTitle}>
                          {photo.displayTitle}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            className={`text-xs ${topicColor.bg} ${topicColor.text}`}
                          >
                            {topics.find((t) => t.id === photo.topicId)?.displayName || "Unknown"}
                          </Badge>
                          {photo.status === "Approved" ? (
                            <Badge variant="success" className="text-xs">Approved</Badge>
                          ) : (
                            <Badge variant="warning" className="text-xs">Draft</Badge>
                          )}
                          {photo.tags?.slice(0, 2).map((tag, i) => (
                            <Badge key={tag} variant={i === 0 ? "purple" : "teal"} className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {photo.tags && photo.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{photo.tags.length - 2}</Badge>
                          )}
                          {photo.linkedAnswersCount && photo.linkedAnswersCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {photo.linkedAnswersCount} linked
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Photo Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Photo</DialogTitle>
            <DialogDescription className="sr-only">
              Edit photo metadata
            </DialogDescription>
          </DialogHeader>

          {editPhotoData && (
            <div className="space-y-5">
              {/* Photo preview */}
              <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden">
                <img
                  src={photosApi.getFileUrl(editPhotoData.storageKey)}
                  alt={editPhotoData.displayTitle}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Edit form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editForm.displayTitle}
                    onChange={(e) => setEditForm({ ...editForm, displayTitle: e.target.value })}
                    placeholder="Photo title"
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-topic">Topic</Label>
                    <Select
                      value={editForm.topicId}
                      onValueChange={(v) => setEditForm({ ...editForm, topicId: v })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {topics.map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            {topic.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select
                      value={editForm.status}
                      onValueChange={(v) => setEditForm({ ...editForm, status: v as "Approved" | "Draft" })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Approved">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            Approved
                          </div>
                        </SelectItem>
                        <SelectItem value="Draft">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-amber-500" />
                            Draft
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                  <Input
                    id="edit-tags"
                    value={editForm.tags}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                    placeholder="tag1, tag2, tag3"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Optional description..."
                    className="rounded-xl min-h-[80px]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    className="flex-1 rounded-xl"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={savePhotoChanges}
                    className="flex-1 rounded-xl"
                    disabled={isSaving || !editForm.displayTitle.trim()}
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    Save Changes
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
