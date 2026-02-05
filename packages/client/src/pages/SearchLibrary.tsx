import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Search,
  Copy,
  Download,
  Image as ImageIcon,
  FileText,
  Link2,
  Sparkles,
  Check,
  Loader2,
  X,
  Unlink,
  ChevronRight,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  Calendar,
  SortAsc,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Save,
  Wand2,
  ChevronDown,
  History,
  RotateCcw,
  AlertTriangle,
  Trash2,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { RelatedContent } from "@/components/RelatedContent"
import { ContextualHelp, searchPageHelp } from "@/components/ContextualHelp"
import {
  Button,
  Card,
  CardContent,
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
import {
  topicsApi,
  searchApi,
  photosApi,
  aiApi,
  answersApi,
  type AnswerResponse,
  type PhotoResponse,
  type AdaptationType,
  type AIAdaptResponse,
  type AnswerVersion,
} from "@/lib/api"
import type { Topic, SearchItemType, ItemStatus } from "@/types"

// Topic color mapping for consistent color coding
const topicColors: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
}

function getTopicColor(topicId: string, index: number): { bg: string; text: string; border: string } {
  const cached = topicColors[topicId]
  if (cached) return cached

  const colors = [
    { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  ]

  const idx = Math.abs(index) % colors.length
  return colors[idx] ?? topicColors.default!
}

type SortOption = "relevance" | "newest" | "oldest" | "alphabetical"
type ViewMode = "list" | "grid"

export function SearchLibrary() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<SearchItemType>("all")
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all")
  const [sortBy, setSortBy] = useState<SortOption>("relevance")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [answers, setAnswers] = useState<AnswerResponse[]>([])
  const [photos, setPhotos] = useState<PhotoResponse[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Pagination state
  const PAGE_SIZE = 50
  const [totalAnswers, setTotalAnswers] = useState(0)
  const [totalPhotos, setTotalPhotos] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Detail view state
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerResponse | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoResponse | null>(null)
  const [linkedPhotos, setLinkedPhotos] = useState<PhotoResponse[]>([])
  const [linkedAnswers, setLinkedAnswers] = useState<AnswerResponse[]>([])
  const [loadingLinked, setLoadingLinked] = useState(false)

  // Link picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkPickerType, setLinkPickerType] = useState<"photo" | "answer">("photo")
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null)
  const [availableForLink, setAvailableForLink] = useState<(AnswerResponse | PhotoResponse)[]>([])
  const [linkPickerSearch, setLinkPickerSearch] = useState("")
  const [linkPickerLoading, setLinkPickerLoading] = useState(false)


  // Accordion state for topic grouping
  const [expandedAnswerTopics, setExpandedAnswerTopics] = useState<Set<string>>(new Set())
  const [expandedPhotoTopics, setExpandedPhotoTopics] = useState<Set<string>>(new Set())
  const [answerLimits, setAnswerLimits] = useState<Record<string, number>>({})
  const [photoLimits, setPhotoLimits] = useState<Record<string, number>>({})
  const ITEMS_PER_PAGE = 5

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Photo edit state
  const [isEditingPhoto, setIsEditingPhoto] = useState(false)
  const [editPhotoForm, setEditPhotoForm] = useState({
    displayTitle: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
    description: "",
  })
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)

  // Answer edit state
  const [isEditingAnswer, setIsEditingAnswer] = useState(false)
  const [editAnswerForm, setEditAnswerForm] = useState({
    question: "",
    answer: "",
    topicId: "",
    status: "Approved" as "Approved" | "Draft",
    tags: "",
  })
  const [isSavingAnswer, setIsSavingAnswer] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  // Version history state
  const [answerVersions, setAnswerVersions] = useState<AnswerVersion[]>([])
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<AnswerVersion | null>(null)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeletingAnswer, setIsDeletingAnswer] = useState(false)

  // Adapt content state
  const [showAdaptPanel, setShowAdaptPanel] = useState(false)
  const [adaptationType, setAdaptationType] = useState<AdaptationType>("shorten")
  const [adaptOptions, setAdaptOptions] = useState({
    customInstruction: "",
    targetWordCount: 100,
    clientName: "",
    industry: "",
  })
  const [adaptResult, setAdaptResult] = useState<AIAdaptResponse | null>(null)
  const [isAdapting, setIsAdapting] = useState(false)

  // Count active filters
  const activeFilterCount = [
    typeFilter !== "all",
    topicFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length

  // Load topics on mount
  useEffect(() => {
    async function loadTopics() {
      try {
        const topicsData = await topicsApi.getAll()
        setTopics(
          topicsData.map((t) => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            createdAt: new Date(t.createdAt).getTime(),
          }))
        )
      } catch (err) {
        console.error("Failed to load topics:", err)
      }
    }
    loadTopics()
  }, [])

  // Search function - resets pagination
  const performSearch = useCallback(async () => {
    setIsSearching(true)
    try {
      const result = await searchApi.search({
        q: searchQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        topicId: topicFilter === "all" ? undefined : topicFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset: 0,
      })
      setAnswers(result.answers)
      setPhotos(result.photos)
      setTotalAnswers(result.totalAnswers)
      setTotalPhotos(result.totalPhotos)
    } catch (err) {
      console.error("Search failed:", err)
    } finally {
      setIsSearching(false)
      setIsLoading(false)
    }
  }, [searchQuery, typeFilter, topicFilter, statusFilter])

  // Load more function - appends to existing results
  const loadMore = useCallback(async () => {
    setIsLoadingMore(true)
    try {
      const result = await searchApi.search({
        q: searchQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        topicId: topicFilter === "all" ? undefined : topicFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset: answers.length, // Use current answers length as offset
      })
      setAnswers(prev => [...prev, ...result.answers])
      setPhotos(prev => [...prev, ...result.photos])
    } catch (err) {
      console.error("Load more failed:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [searchQuery, typeFilter, topicFilter, statusFilter, answers.length])

  // Initial load and search on filter changes
  useEffect(() => {
    performSearch()
  }, [performSearch])

  // Sort answers
  const sortedAnswers = [...answers].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case "alphabetical":
        return a.question.localeCompare(b.question)
      default:
        return 0
    }
  })

  // Sort photos
  const sortedPhotos = [...photos].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case "alphabetical":
        return a.displayTitle.localeCompare(b.displayTitle)
      default:
        return 0
    }
  })

  // Group answers by topic
  const answersByTopic = useMemo(() => {
    const grouped: Record<string, AnswerResponse[]> = {}
    for (const answer of sortedAnswers) {
      const topicId = answer.topicId
      if (!grouped[topicId]) grouped[topicId] = []
      grouped[topicId].push(answer)
    }
    return grouped
  }, [sortedAnswers])

  // Group photos by topic
  const photosByTopic = useMemo(() => {
    const grouped: Record<string, PhotoResponse[]> = {}
    for (const photo of sortedPhotos) {
      const topicId = photo.topicId
      if (!grouped[topicId]) grouped[topicId] = []
      grouped[topicId].push(photo)
    }
    return grouped
  }, [sortedPhotos])

  // Sort topic IDs by count (most results first)
  const sortedAnswerTopicIds = useMemo(() => {
    return Object.keys(answersByTopic).sort((a, b) => (answersByTopic[b]?.length || 0) - (answersByTopic[a]?.length || 0))
  }, [answersByTopic])

  const sortedPhotoTopicIds = useMemo(() => {
    return Object.keys(photosByTopic).sort((a, b) => (photosByTopic[b]?.length || 0) - (photosByTopic[a]?.length || 0))
  }, [photosByTopic])

  // Toggle accordion expansion
  const toggleAnswerTopic = (topicId: string) => {
    setExpandedAnswerTopics(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  const togglePhotoTopic = (topicId: string) => {
    setExpandedPhotoTopics(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  // Show more items within a topic
  const showMoreAnswers = (topicId: string) => {
    setAnswerLimits(prev => ({
      ...prev,
      [topicId]: (prev[topicId] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE
    }))
  }

  const showMorePhotos = (topicId: string) => {
    setPhotoLimits(prev => ({
      ...prev,
      [topicId]: (prev[topicId] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE
    }))
  }

  // Load linked items when detail view opens
  useEffect(() => {
    async function loadLinkedItems() {
      if (selectedAnswer) {
        setLoadingLinked(true)
        try {
          const photos = await searchApi.getLinkedPhotos(selectedAnswer.id)
          setLinkedPhotos(photos)
        } catch (err) {
          console.error("Failed to load linked photos:", err)
        } finally {
          setLoadingLinked(false)
        }
      } else if (selectedPhoto) {
        setLoadingLinked(true)
        try {
          const answers = await searchApi.getLinkedAnswers(selectedPhoto.id)
          setLinkedAnswers(answers)
        } catch (err) {
          console.error("Failed to load linked answers:", err)
        } finally {
          setLoadingLinked(false)
        }
      }
    }
    loadLinkedItems()
  }, [selectedAnswer, selectedPhoto])

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    if (id.startsWith("a")) {
      searchApi.logCopy(id).catch(() => {})
    }
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDownload = (photo: PhotoResponse) => {
    window.open(photosApi.getDownloadUrl(photo.id), "_blank")
  }

  const openLinkPicker = async (type: "photo" | "answer", forId: string) => {
    setLinkPickerType(type)
    setLinkPickerFor(forId)
    setShowLinkPicker(true)
    setLinkPickerSearch("")
    setLinkPickerLoading(true)

    try {
      if (type === "photo") {
        const result = await searchApi.searchPhotos({})
        setAvailableForLink(result)
      } else {
        const result = await searchApi.searchAnswers({})
        setAvailableForLink(result)
      }
    } catch (err) {
      console.error("Failed to load items for linking:", err)
    } finally {
      setLinkPickerLoading(false)
    }
  }

  const handleLink = async (itemId: string) => {
    if (!linkPickerFor) return

    try {
      if (linkPickerType === "photo") {
        await searchApi.link(linkPickerFor, itemId)
        const photos = await searchApi.getLinkedPhotos(linkPickerFor)
        setLinkedPhotos(photos)
      } else {
        await searchApi.link(itemId, linkPickerFor)
        const answers = await searchApi.getLinkedAnswers(linkPickerFor)
        setLinkedAnswers(answers)
      }
      setShowLinkPicker(false)
      performSearch()
    } catch (err) {
      console.error("Failed to create link:", err)
    }
  }

  const handleUnlink = async (answerId: string, photoId: string) => {
    try {
      await searchApi.unlink(answerId, photoId)
      if (selectedAnswer) {
        const photos = await searchApi.getLinkedPhotos(selectedAnswer.id)
        setLinkedPhotos(photos)
      } else if (selectedPhoto) {
        const answers = await searchApi.getLinkedAnswers(selectedPhoto.id)
        setLinkedAnswers(answers)
      }
      performSearch()
    } catch (err) {
      console.error("Failed to unlink:", err)
    }
  }

  const clearAllFilters = () => {
    setSearchQuery("")
    setTypeFilter("all")
    setTopicFilter("all")
    setStatusFilter("all")
    setSortBy("relevance")
  }

  const startEditingPhoto = (photo: PhotoResponse) => {
    setEditPhotoForm({
      displayTitle: photo.displayTitle,
      topicId: photo.topicId,
      status: photo.status,
      tags: photo.tags?.join(", ") || "",
      description: photo.description || "",
    })
    setIsEditingPhoto(true)
  }

  const cancelEditingPhoto = () => {
    setIsEditingPhoto(false)
  }

  const savePhotoChanges = async () => {
    if (!selectedPhoto) return

    setIsSavingPhoto(true)
    try {
      const updatedPhoto = await photosApi.update(selectedPhoto.id, {
        displayTitle: editPhotoForm.displayTitle,
        topicId: editPhotoForm.topicId,
        status: editPhotoForm.status,
        tags: editPhotoForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        description: editPhotoForm.description || undefined,
      })
      setSelectedPhoto(updatedPhoto)
      setIsEditingPhoto(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to save photo:", err)
    } finally {
      setIsSavingPhoto(false)
    }
  }

  // Answer editing functions
  const startEditingAnswer = (answer: AnswerResponse) => {
    setEditAnswerForm({
      question: answer.question,
      answer: answer.answer,
      topicId: answer.topicId,
      status: answer.status,
      tags: answer.tags?.join(", ") || "",
    })
    setIsEditingAnswer(true)
  }

  const cancelEditingAnswer = () => {
    setIsEditingAnswer(false)
    setShowSaveConfirm(false)
  }

  const hasAnswerChanges = () => {
    if (!selectedAnswer) return false
    return (
      editAnswerForm.question !== selectedAnswer.question ||
      editAnswerForm.answer !== selectedAnswer.answer ||
      editAnswerForm.topicId !== selectedAnswer.topicId ||
      editAnswerForm.status !== selectedAnswer.status ||
      editAnswerForm.tags !== (selectedAnswer.tags?.join(", ") || "")
    )
  }

  const confirmSaveAnswer = () => {
    if (hasAnswerChanges()) {
      setShowSaveConfirm(true)
    }
  }

  const saveAnswerChanges = async () => {
    if (!selectedAnswer) return

    setIsSavingAnswer(true)
    try {
      const updatedAnswer = await answersApi.update(selectedAnswer.id, {
        question: editAnswerForm.question,
        answer: editAnswerForm.answer,
        topicId: editAnswerForm.topicId,
        status: editAnswerForm.status,
        tags: editAnswerForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      })
      setSelectedAnswer(updatedAnswer)
      setIsEditingAnswer(false)
      setShowSaveConfirm(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to save answer:", err)
    } finally {
      setIsSavingAnswer(false)
    }
  }

  const deleteAnswer = async () => {
    if (!selectedAnswer) return

    setIsDeletingAnswer(true)
    try {
      await answersApi.delete(selectedAnswer.id)
      setSelectedAnswer(null)
      setShowDeleteConfirm(false)
      performSearch() // Refresh the list
    } catch (err) {
      console.error("Failed to delete answer:", err)
    } finally {
      setIsDeletingAnswer(false)
    }
  }

  // Version history functions
  const loadVersionHistory = async (answerId: string) => {
    setLoadingVersions(true)
    try {
      const versions = await answersApi.getVersions(answerId)
      setAnswerVersions(versions)
      setShowVersionHistory(true)
    } catch (err) {
      console.error("Failed to load version history:", err)
    } finally {
      setLoadingVersions(false)
    }
  }

  const restoreVersion = (version: AnswerVersion) => {
    setEditAnswerForm({
      question: version.question,
      answer: version.answer,
      topicId: version.topicId,
      status: version.status,
      tags: version.tags?.join(", ") || "",
    })
    setIsEditingAnswer(true)
    setShowVersionHistory(false)
    setSelectedVersion(null)
  }

  const getTopicIndex = (topicId: string): number => {
    const idx = topics.findIndex((t) => t.id === topicId)
    return idx >= 0 ? idx : 0
  }

  const handleAdaptContent = async (content: string) => {
    setIsAdapting(true)
    setAdaptResult(null)

    try {
      const result = await aiApi.adapt({
        content,
        adaptationType,
        customInstruction: adaptationType === "custom" ? adaptOptions.customInstruction : undefined,
        targetWordCount: adaptationType === "shorten" ? adaptOptions.targetWordCount : undefined,
        clientName: adaptOptions.clientName || undefined,
        industry: adaptOptions.industry || undefined,
      })
      setAdaptResult(result)
    } catch (err) {
      console.error("Adaptation failed:", err)
      setAdaptResult({
        adaptedContent: "",
        originalContent: content,
        instruction: adaptationType,
        refused: true,
        refusalReason: "Failed to adapt content. Please try again.",
      })
    } finally {
      setIsAdapting(false)
    }
  }

  const resetAdaptPanel = () => {
    setShowAdaptPanel(false)
    setAdaptResult(null)
    setAdaptationType("shorten")
    setAdaptOptions({
      customInstruction: "",
      targetWordCount: 100,
      clientName: "",
      industry: "",
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-[0_4px_12px_rgba(20,184,166,0.35)] animate-pulse">
            <Loader2 className="w-7 h-7 animate-spin text-white" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] font-medium">Loading library...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
          {/* Search bar */}
          <div className="flex gap-3 items-center">
            <div className="flex-1 relative group">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search answers and photos..."
                className="pl-11 h-12 text-[15px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                onKeyDown={(e) => e.key === "Enter" && performSearch()}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <ContextualHelp {...searchPageHelp} />
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-10 px-4 rounded-xl transition-all duration-200 ${
                showFilters
                  ? "bg-slate-900 dark:bg-slate-100 dark:text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.25)]"
                  : "border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <Filter size={16} className="mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className={`ml-2 w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center transition-colors ${
                  showFilters ? "bg-white text-slate-900" : "bg-blue-500 text-white"
                }`}>
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all duration-150 ${
                  viewMode === "list"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all duration-150 ${
                  viewMode === "grid"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <LayoutGrid size={18} />
              </button>
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-44 h-10 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white rounded-xl border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <ArrowUpDown size={14} className="mr-2 text-slate-400" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">
                  <div className="flex items-center gap-2">
                    <SortAsc size={14} />
                    Relevance
                  </div>
                </SelectItem>
                <SelectItem value="newest">
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    Newest First
                  </div>
                </SelectItem>
                <SelectItem value="oldest">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    Oldest First
                  </div>
                </SelectItem>
                <SelectItem value="alphabetical">
                  <div className="flex items-center gap-2">
                    <SortAsc size={14} />
                    A-Z
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            {isSearching && (
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
            )}

            <p className="text-slate-500 dark:text-slate-400 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalAnswers}</span> answers,{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalPhotos}</span> photos
            </p>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <Card className="border-slate-200/60 dark:border-slate-700 dark:bg-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl overflow-hidden animate-fade-in-up">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-[15px]">Filters</h3>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-slate-500 hover:text-slate-700 h-8 rounded-lg"
                    >
                      <X size={14} className="mr-1" />
                      Clear all
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                    <Select
                      value={typeFilter}
                      onValueChange={(v) => setTypeFilter(v as SearchItemType)}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="answers">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-blue-500" />
                            Answers Only
                          </div>
                        </SelectItem>
                        <SelectItem value="photos">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-purple-500" />
                            Photos Only
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Topic</label>
                    <Select value={topicFilter} onValueChange={setTopicFilter}>
                      <SelectTrigger className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl">
                        <SelectValue placeholder="All Topics" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Topics</SelectItem>
                        {topics.map((topic, i) => {
                          const color = getTopicColor(topic.id, i)
                          return (
                            <SelectItem key={topic.id} value={topic.id}>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${color.bg} border ${color.border}`} />
                                {topic.displayName}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as ItemStatus | "all")}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
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

                {/* Active filter chips */}
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    {typeFilter !== "all" && (
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                        onClick={() => setTypeFilter("all")}
                      >
                        {typeFilter === "answers" ? "Answers" : "Photos"}
                        <X size={12} className="ml-1" />
                      </Badge>
                    )}
                    {topicFilter !== "all" && (
                      <Badge
                        variant="secondary"
                        className={`${getTopicColor(topicFilter, getTopicIndex(topicFilter)).bg} ${getTopicColor(topicFilter, getTopicIndex(topicFilter)).text} cursor-pointer hover:opacity-80`}
                        onClick={() => setTopicFilter("all")}
                      >
                        {topics.find((t) => t.id === topicFilter)?.displayName}
                        <X size={12} className="ml-1" />
                      </Badge>
                    )}
                    {statusFilter !== "all" && (
                      <Badge
                        variant={statusFilter === "Approved" ? "success" : "warning"}
                        className="cursor-pointer hover:opacity-80"
                        onClick={() => setStatusFilter("all")}
                      >
                        {statusFilter}
                        <X size={12} className="ml-1" />
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Results - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Answers Column - Takes up 3 columns */}
            <div className="lg:col-span-3 space-y-3">
              {/* Answers Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText size={18} className="text-blue-600" />
                  Answers
                  <span className="text-slate-500 dark:text-slate-400 font-normal text-sm">
                    ({sortedAnswers.length}{totalAnswers > sortedAnswers.length ? ` of ${totalAnswers}` : ""})
                  </span>
                </h2>
              </div>

              {/* Answers - Grouped by Topic Accordions */}
              {sortedAnswers.length > 0 && sortedAnswerTopicIds.map((topicId) => {
                const topicAnswers = answersByTopic[topicId] || []
                if (topicAnswers.length === 0) return null
                const topic = topics.find(t => t.id === topicId)
                const topicColor = getTopicColor(topicId, getTopicIndex(topicId))
                const isExpanded = expandedAnswerTopics.has(topicId)
                const limit = answerLimits[topicId] || ITEMS_PER_PAGE
                const visibleAnswers = topicAnswers.slice(0, limit)
                const hasMore = topicAnswers.length > limit
                const remaining = topicAnswers.length - limit

                return (
                  <div key={topicId} className="rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                    {/* Accordion Header */}
                    <button
                      onClick={() => toggleAnswerTopic(topicId)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <ChevronRight
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <Badge
                        variant="secondary"
                        className={`${topicColor.bg} ${topicColor.text} border ${topicColor.border}`}
                      >
                        {topic?.displayName || "Unknown"}
                      </Badge>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">
                        ({topicAnswers.length} {topicAnswers.length === 1 ? 'answer' : 'answers'})
                      </span>
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/60 dark:border-slate-700">
                        <div className="p-3 space-y-3">
                          {visibleAnswers.map((answer) => (
                            <Card
                              key={answer.id}
                              className="hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer group rounded-xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-900 transition-all duration-200 ease-out"
                              onClick={() => setSelectedAnswer(answer)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/80 flex items-center justify-center flex-shrink-0 group-hover:from-blue-100 group-hover:to-blue-200 transition-all duration-200">
                                    <FileText size={16} className="text-blue-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug text-sm">
                                      {answer.question}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm line-clamp-2 leading-relaxed">
                                      {answer.answer}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                      {answer.status === "Approved" ? (
                                        <Badge variant="success" className="text-xs">Approved</Badge>
                                      ) : (
                                        <Badge variant="warning" className="text-xs">Draft</Badge>
                                      )}
                                      {answer.tags.slice(0, 2).map((tag, i) => (
                                        <Badge key={tag} variant={i === 0 ? "purple" : "teal"} className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                      {answer.tags.length > 2 && (
                                        <Badge variant="outline" className="text-xs">+{answer.tags.length - 2}</Badge>
                                      )}
                                      {answer.linkedPhotosCount != null && answer.linkedPhotosCount > 0 && (
                                        <Badge variant="outline" className="text-xs ml-auto">
                                          <ImageIcon size={10} className="mr-1" />
                                          {answer.linkedPhotosCount}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCopy(answer.answer, answer.id)}
                                      className="h-8 w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                      {copiedId === answer.id ? (
                                        <Check size={14} className="text-emerald-500" />
                                      ) : (
                                        <Copy size={14} className="text-slate-400" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        {/* Show More Button */}
                        {hasMore && (
                          <div className="px-3 pb-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showMoreAnswers(topicId)}
                              className="w-full h-9 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              Show {Math.min(ITEMS_PER_PAGE, remaining)} more
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {sortedAnswers.length === 0 && (
                <div className="text-center py-14 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px]">No answers found</p>
                </div>
              )}
            </div>

            {/* Photos Column - Takes up 2 columns */}
            <div className="lg:col-span-2 space-y-3">
              {/* Photos Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon size={18} className="text-purple-600" />
                  Photos
                  <span className="text-slate-500 dark:text-slate-400 font-normal text-sm">
                    ({sortedPhotos.length}{totalPhotos > sortedPhotos.length ? ` of ${totalPhotos}` : ""})
                  </span>
                </h2>
              </div>

              {/* Photos - Grouped by Topic Accordions */}
              {sortedPhotos.length > 0 && sortedPhotoTopicIds.map((topicId) => {
                const topicPhotos = photosByTopic[topicId] || []
                if (topicPhotos.length === 0) return null
                const topic = topics.find(t => t.id === topicId)
                const topicColor = getTopicColor(topicId, getTopicIndex(topicId))
                const isExpanded = expandedPhotoTopics.has(topicId)
                const limit = photoLimits[topicId] || ITEMS_PER_PAGE
                const visiblePhotos = topicPhotos.slice(0, limit)
                const hasMore = topicPhotos.length > limit
                const remaining = topicPhotos.length - limit

                return (
                  <div key={topicId} className="rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                    {/* Accordion Header */}
                    <button
                      onClick={() => togglePhotoTopic(topicId)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <ChevronRight
                        size={16}
                        className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <Badge
                        variant="secondary"
                        className={`text-xs ${topicColor.bg} ${topicColor.text} border ${topicColor.border}`}
                      >
                        {topic?.displayName || "Unknown"}
                      </Badge>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">
                        ({topicPhotos.length})
                      </span>
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/60 dark:border-slate-700">
                        <div className="p-3">
                          <div className="grid grid-cols-2 gap-2">
                            {visiblePhotos.map((photo) => (
                              <Card
                                key={photo.id}
                                className="overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] cursor-pointer group rounded-xl border-slate-200/60 dark:border-slate-700 dark:bg-slate-900 transition-all duration-300 ease-out hover:-translate-y-0.5"
                                onClick={() => setSelectedPhoto(photo)}
                              >
                                <div className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
                                  <img
                                    src={photosApi.getFileUrl(photo.storageKey)}
                                    alt={photo.displayTitle}
                                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none"
                                      e.currentTarget.nextElementSibling?.classList.remove("hidden")
                                    }}
                                  />
                                  <div className="hidden absolute inset-0 flex items-center justify-center">
                                    <ImageIcon size={24} className="text-slate-300 dark:text-slate-500" />
                                  </div>
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="w-full h-7 bg-white/95 backdrop-blur-sm hover:bg-white text-[10px] rounded-lg shadow-lg"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDownload(photo)
                                      }}
                                    >
                                      <Download size={10} className="mr-1" />
                                      Download
                                    </Button>
                                  </div>
                                </div>
                                <div className="p-2">
                                  <p className="font-medium text-xs text-slate-900 dark:text-white truncate">
                                    {photo.displayTitle}
                                  </p>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {photo.status === "Approved" ? (
                                      <Badge variant="success" className="text-[9px] px-1 py-0">Approved</Badge>
                                    ) : (
                                      <Badge variant="warning" className="text-[9px] px-1 py-0">Draft</Badge>
                                    )}
                                    {photo.linkedAnswersCount != null && photo.linkedAnswersCount > 0 && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                        <Link2 size={7} className="mr-0.5" />
                                        {photo.linkedAnswersCount}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>

                        {/* Show More Button */}
                        {hasMore && (
                          <div className="px-3 pb-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showMorePhotos(topicId)}
                              className="w-full h-8 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs"
                            >
                              Show {Math.min(ITEMS_PER_PAGE, remaining)} more
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {sortedPhotos.length === 0 && (
                <div className="text-center py-14 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                    <ImageIcon size={24} className="text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px]">No photos found</p>
                </div>
              )}
            </div>
          </div>

          {/* Load More Button */}
          {(answers.length < totalAnswers || photos.length < totalPhotos) && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="h-12 px-8 rounded-xl border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Load More
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      ({answers.length} of {totalAnswers} answers, {photos.length} of {totalPhotos} photos)
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Empty state when both are empty */}
          {answers.length === 0 && photos.length === 0 && (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200/80 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mx-auto mb-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <Search size={32} className="text-slate-400" />
              </div>
              <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">No results found</p>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto text-[15px] leading-relaxed">
                Try adjusting your search query or filters to find what you're looking for.
              </p>
              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  className="mt-5 rounded-xl h-11"
                >
                  <X size={16} className="mr-2" />
                  Clear all filters
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Answer Detail Dialog */}
      <Dialog open={!!selectedAnswer} onOpenChange={(open) => {
        if (!open) {
          setSelectedAnswer(null)
          resetAdaptPanel()
          setIsEditingAnswer(false)
          setShowVersionHistory(false)
          setShowSaveConfirm(false)
          setShowDeleteConfirm(false)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between pr-8">
              <DialogTitle className="text-xl leading-tight">
                {isEditingAnswer ? "Edit Answer" : selectedAnswer?.question}
              </DialogTitle>
              {selectedAnswer && !isEditingAnswer && !showVersionHistory && !showDeleteConfirm && (
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadVersionHistory(selectedAnswer.id)}
                    className="rounded-lg"
                    disabled={loadingVersions}
                  >
                    {loadingVersions ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <History size={14} className="mr-1.5" />
                    )}
                    History
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEditingAnswer(selectedAnswer)}
                    className="rounded-lg"
                  >
                    <Pencil size={14} className="mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
            <DialogDescription className="sr-only">
              Answer details and linked photos
            </DialogDescription>
          </DialogHeader>
          {selectedAnswer && showDeleteConfirm ? (
            /* Delete Confirmation View */
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                    <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-red-900 dark:text-red-200">Delete this answer?</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      This action cannot be undone. The answer and all its version history will be permanently deleted.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">Answer to delete:</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{selectedAnswer.question}</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-xl"
                  disabled={isDeletingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={deleteAnswer}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeletingAnswer}
                >
                  {isDeletingAnswer ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} className="mr-2" />
                      Delete Answer
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : selectedAnswer && showVersionHistory ? (
            /* Version History View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <History size={18} className="text-blue-600" />
                  Version History
                  <span className="text-slate-500 font-normal">({answerVersions.length} versions)</span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowVersionHistory(false)
                    setSelectedVersion(null)
                  }}
                  className="rounded-lg"
                >
                  <X size={14} className="mr-1.5" />
                  Close
                </Button>
              </div>

              {answerVersions.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  No version history available yet.
                </p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {answerVersions.slice().reverse().map((version) => (
                    <div
                      key={version.id}
                      className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                        selectedVersion?.id === version.id
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            v{version.versionNumber}
                          </Badge>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(version.createdAt).toLocaleDateString()} at{" "}
                            {new Date(version.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {version.versionNumber === answerVersions.length && (
                          <Badge variant="success" className="text-xs">Current</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{version.question}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">{version.answer}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedVersion && selectedVersion.versionNumber !== answerVersions.length && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-900 dark:text-amber-200">Restore this version?</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        This will open the editor with v{selectedVersion.versionNumber}'s content.
                        You can review and save it as a new version.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3 rounded-lg"
                        onClick={() => restoreVersion(selectedVersion)}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        Restore Version
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : selectedAnswer && isEditingAnswer ? (
            /* Edit Mode */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="answer-question">Question</Label>
                <Textarea
                  id="answer-question"
                  value={editAnswerForm.question}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, question: e.target.value })}
                  placeholder="Enter the question..."
                  className="rounded-xl min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer-content">Answer</Label>
                <Textarea
                  id="answer-content"
                  value={editAnswerForm.answer}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, answer: e.target.value })}
                  placeholder="Enter the answer..."
                  className="rounded-xl min-h-[150px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="answer-topic">Topic</Label>
                  <Select
                    value={editAnswerForm.topicId}
                    onValueChange={(v) => setEditAnswerForm({ ...editAnswerForm, topicId: v })}
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
                  <Label htmlFor="answer-status">Status</Label>
                  <Select
                    value={editAnswerForm.status}
                    onValueChange={(v) => setEditAnswerForm({ ...editAnswerForm, status: v as "Approved" | "Draft" })}
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
                <Label htmlFor="answer-tags">Tags (comma-separated)</Label>
                <Input
                  id="answer-tags"
                  value={editAnswerForm.tags}
                  onChange={(e) => setEditAnswerForm({ ...editAnswerForm, tags: e.target.value })}
                  placeholder="tag1, tag2, tag3"
                  className="rounded-xl"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={cancelEditingAnswer}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmSaveAnswer}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer || !editAnswerForm.question.trim() || !editAnswerForm.answer.trim() || !hasAnswerChanges()}
                >
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : selectedAnswer && (
            /* View Mode */
            <div className="space-y-5">
              <div className="flex gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={`${getTopicColor(selectedAnswer.topicId, getTopicIndex(selectedAnswer.topicId)).bg} ${getTopicColor(selectedAnswer.topicId, getTopicIndex(selectedAnswer.topicId)).text}`}
                >
                  {topics.find((t) => t.id === selectedAnswer.topicId)?.displayName}
                </Badge>
                {selectedAnswer.status === "Approved" ? (
                  <Badge variant="success">Approved</Badge>
                ) : (
                  <Badge variant="warning">Draft</Badge>
                )}
                {selectedAnswer.tags.map((tag, i) => (
                  <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedAnswer.answer}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleCopy(selectedAnswer.answer, selectedAnswer.id + "-modal")}
                  className="flex-1 rounded-xl"
                  variant="success"
                >
                  {copiedId === selectedAnswer.id + "-modal" ? (
                    <>
                      <Check size={16} className="mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} className="mr-2" />
                      Copy Answer
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowAdaptPanel(!showAdaptPanel)}
                  className={`flex-1 rounded-xl ${showAdaptPanel ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  variant={showAdaptPanel ? "default" : "outline"}
                >
                  <Wand2 size={16} className="mr-2" />
                  Adapt for RFP
                  <ChevronDown size={14} className={`ml-2 transition-transform ${showAdaptPanel ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {/* Adapt Panel */}
              {showAdaptPanel && (
                <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-xl border border-purple-200 dark:border-purple-800 space-y-4 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-2">
                    <Wand2 size={16} className="text-purple-600" />
                    <span className="font-medium text-slate-900 dark:text-white">Adapt Content</span>
                  </div>

                  {/* Adaptation Type Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { type: "shorten", label: "Shorten" },
                      { type: "expand", label: "Expand" },
                      { type: "bullets", label: "Bullets" },
                      { type: "formal", label: "Formal" },
                      { type: "casual", label: "Casual" },
                      { type: "custom", label: "Custom" },
                    ] as const).map(({ type, label }) => (
                      <Button
                        key={type}
                        variant={adaptationType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAdaptationType(type)}
                        className={`rounded-lg ${adaptationType === type ? "bg-purple-600 hover:bg-purple-700" : "bg-white dark:bg-slate-800"}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {/* Conditional Options */}
                  {adaptationType === "shorten" && (
                    <div className="space-y-2">
                      <Label htmlFor="target-words">Target Word Count</Label>
                      <Input
                        id="target-words"
                        type="number"
                        value={adaptOptions.targetWordCount}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, targetWordCount: parseInt(e.target.value) || 100 })}
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl w-32"
                        min={25}
                        max={500}
                      />
                    </div>
                  )}

                  {adaptationType === "custom" && (
                    <div className="space-y-2">
                      <Label htmlFor="custom-instruction">Custom Instruction</Label>
                      <Textarea
                        id="custom-instruction"
                        value={adaptOptions.customInstruction}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, customInstruction: e.target.value })}
                        placeholder="Describe how you want the content adapted..."
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl min-h-[80px]"
                      />
                    </div>
                  )}

                  {/* Optional Context */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="client-name">Client Name (optional)</Label>
                      <Input
                        id="client-name"
                        value={adaptOptions.clientName}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, clientName: e.target.value })}
                        placeholder="e.g., Acme Corp"
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry (optional)</Label>
                      <Input
                        id="industry"
                        value={adaptOptions.industry}
                        onChange={(e) => setAdaptOptions({ ...adaptOptions, industry: e.target.value })}
                        placeholder="e.g., Healthcare"
                        className="bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white rounded-xl"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => handleAdaptContent(selectedAnswer.answer)}
                    disabled={isAdapting || (adaptationType === "custom" && !adaptOptions.customInstruction.trim())}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    {isAdapting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Adapting...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="mr-2" />
                        Adapt Content
                      </>
                    )}
                  </Button>

                  {/* Adapt Result */}
                  {adaptResult && (
                    <div className="space-y-3 animate-fade-in-up">
                      {adaptResult.refused ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                          <p className="text-amber-800 dark:text-amber-200 text-sm">{adaptResult.refusalReason}</p>
                        </div>
                      ) : (
                        <>
                          <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                              {adaptResult.adaptedContent}
                            </p>
                          </div>
                          <Button
                            onClick={() => handleCopy(adaptResult.adaptedContent, "adapted-content")}
                            variant="success"
                            className="w-full rounded-xl"
                          >
                            {copiedId === "adapted-content" ? (
                              <>
                                <Check size={16} className="mr-2" />
                                Copied Adapted Content
                              </>
                            ) : (
                              <>
                                <Copy size={16} className="mr-2" />
                                Copy Adapted Content
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Related Content */}
              <RelatedContent
                currentAnswerId={selectedAnswer.id}
                currentQuestion={selectedAnswer.question}
                currentTopicId={selectedAnswer.topicId}
              />

              {/* Linked Photos section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ImageIcon size={16} />
                    Linked Photos
                    <span className="text-slate-500 dark:text-slate-400 font-normal">({linkedPhotos.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLinkPicker("photo", selectedAnswer.id)}
                    className="rounded-lg"
                  >
                    <Link2 size={14} className="mr-1.5" />
                    Link Photos
                  </Button>
                </div>
                {linkedPhotos.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    No photos linked to this answer yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {linkedPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-xl relative group overflow-hidden"
                      >
                        <img
                          src={photosApi.getFileUrl(photo.storageKey)}
                          alt={photo.displayTitle}
                          className="w-full h-full object-cover"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg rounded-lg"
                          onClick={() => handleUnlink(selectedAnswer.id, photo.id)}
                        >
                          <Unlink size={12} />
                        </Button>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs truncate font-medium">
                            {photo.displayTitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Detail Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={(open) => {
        if (!open) {
          setSelectedPhoto(null)
          setIsEditingPhoto(false)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between pr-8">
              <DialogTitle className="text-xl">
                {isEditingPhoto ? "Edit Photo" : selectedPhoto?.displayTitle}
              </DialogTitle>
              {selectedPhoto && !isEditingPhoto && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditingPhoto(selectedPhoto)}
                  className="rounded-lg ml-4"
                >
                  <Pencil size={14} className="mr-1.5" />
                  Edit
                </Button>
              )}
            </div>
            <DialogDescription className="sr-only">
              Photo details and linked answers
            </DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-5">
              <div className="aspect-video bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                <img
                  src={photosApi.getFileUrl(selectedPhoto.storageKey)}
                  alt={selectedPhoto.displayTitle}
                  className="w-full h-full object-contain"
                />
              </div>

              {isEditingPhoto ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="photo-title">Title</Label>
                    <Input
                      id="photo-title"
                      value={editPhotoForm.displayTitle}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, displayTitle: e.target.value })}
                      placeholder="Photo title"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="photo-topic">Topic</Label>
                      <Select
                        value={editPhotoForm.topicId}
                        onValueChange={(v) => setEditPhotoForm({ ...editPhotoForm, topicId: v })}
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
                      <Label htmlFor="photo-status">Status</Label>
                      <Select
                        value={editPhotoForm.status}
                        onValueChange={(v) => setEditPhotoForm({ ...editPhotoForm, status: v as "Approved" | "Draft" })}
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
                    <Label htmlFor="photo-tags">Tags (comma-separated)</Label>
                    <Input
                      id="photo-tags"
                      value={editPhotoForm.tags}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, tags: e.target.value })}
                      placeholder="tag1, tag2, tag3"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="photo-description">Description</Label>
                    <Textarea
                      id="photo-description"
                      value={editPhotoForm.description}
                      onChange={(e) => setEditPhotoForm({ ...editPhotoForm, description: e.target.value })}
                      placeholder="Optional description..."
                      className="rounded-xl min-h-[80px]"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={cancelEditingPhoto}
                      className="flex-1 rounded-xl"
                      disabled={isSavingPhoto}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={savePhotoChanges}
                      className="flex-1 rounded-xl"
                      disabled={isSavingPhoto || !editPhotoForm.displayTitle.trim()}
                    >
                      {isSavingPhoto ? (
                        <Loader2 size={16} className="mr-2 animate-spin" />
                      ) : (
                        <Save size={16} className="mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div className="flex gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={`${getTopicColor(selectedPhoto.topicId, getTopicIndex(selectedPhoto.topicId)).bg} ${getTopicColor(selectedPhoto.topicId, getTopicIndex(selectedPhoto.topicId)).text}`}
                    >
                      {topics.find((t) => t.id === selectedPhoto.topicId)?.displayName}
                    </Badge>
                    {selectedPhoto.status === "Approved" ? (
                      <Badge variant="success">Approved</Badge>
                    ) : (
                      <Badge variant="warning">Draft</Badge>
                    )}
                    {selectedPhoto.tags?.map((tag, i) => (
                      <Badge key={tag} variant={i % 2 === 0 ? "purple" : "teal"}>
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {selectedPhoto.description && (
                    <p className="text-slate-600 dark:text-slate-400">{selectedPhoto.description}</p>
                  )}

                  <Button onClick={() => handleDownload(selectedPhoto)} className="w-full rounded-xl">
                    <Download size={16} className="mr-2" />
                    Download Photo
                  </Button>
                </>
              )}

              {/* Linked Answers section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText size={16} />
                    Linked Answers
                    <span className="text-slate-500 dark:text-slate-400 font-normal">({linkedAnswers.length})</span>
                    {loadingLinked && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLinkPicker("answer", selectedPhoto.id)}
                    className="rounded-lg"
                  >
                    <Link2 size={14} className="mr-1.5" />
                    Link Answers
                  </Button>
                </div>
                {linkedAnswers.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    No answers linked to this photo yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedAnswers.map((answer) => (
                      <div
                        key={answer.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-start gap-3 group hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <FileText size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                            {answer.question}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-1 mt-0.5">
                            {answer.answer}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleUnlink(answer.id, selectedPhoto.id)}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Picker Dialog */}
      <Dialog open={showLinkPicker} onOpenChange={(open) => {
        setShowLinkPicker(open)
        if (!open) {
          setLinkPickerSearch("")
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {linkPickerType === "photo" ? (
                <ImageIcon size={20} className="text-purple-600" />
              ) : (
                <FileText size={20} className="text-blue-600" />
              )}
              Link {linkPickerType === "photo" ? "Photos" : "Answers"}
            </DialogTitle>
            <DialogDescription>
              Select {linkPickerType === "photo" ? "photos" : "answers"} to link to this {linkPickerType === "photo" ? "answer" : "photo"}
            </DialogDescription>
          </DialogHeader>

          {/* Search Input */}
          <div className="relative mt-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={linkPickerSearch}
              onChange={(e) => setLinkPickerSearch(e.target.value)}
              placeholder={`Search ${linkPickerType === "photo" ? "photos" : "answers"}...`}
              className="pl-9 rounded-xl"
            />
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto space-y-2 mt-3 min-h-[200px] max-h-[400px]">
            {linkPickerLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {availableForLink
                  .filter((item) => {
                    if (!linkPickerSearch.trim()) return true
                    const searchLower = linkPickerSearch.toLowerCase()
                    if (linkPickerType === "photo") {
                      const photo = item as PhotoResponse
                      return photo.displayTitle.toLowerCase().includes(searchLower) ||
                        photo.tags?.some(tag => tag.toLowerCase().includes(searchLower))
                    } else {
                      const answer = item as AnswerResponse
                      return answer.question.toLowerCase().includes(searchLower) ||
                        answer.answer.toLowerCase().includes(searchLower)
                    }
                  })
                  .filter((item) => {
                    // Filter out already linked items
                    if (linkPickerType === "photo") {
                      return !linkedPhotos.some(p => p.id === item.id)
                    } else {
                      return !linkedAnswers.some(a => a.id === item.id)
                    }
                  })
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 border border-transparent transition-all group"
                      onClick={() => handleLink(item.id)}
                    >
                      {linkPickerType === "photo" ? (
                        <>
                          <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={photosApi.getFileUrl((item as PhotoResponse).storageKey)}
                              alt={(item as PhotoResponse).displayTitle}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                              {(item as PhotoResponse).displayTitle}
                            </p>
                            {(item as PhotoResponse).tags && (item as PhotoResponse).tags.length > 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {(item as PhotoResponse).tags.slice(0, 3).join(", ")}
                              </p>
                            )}
                          </div>
                          <Link2 size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <FileText size={18} className="text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-white line-clamp-1">
                              {(item as AnswerResponse).question}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {(item as AnswerResponse).answer}
                            </p>
                          </div>
                          <Link2 size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </>
                      )}
                    </div>
                  ))}
                {availableForLink.filter((item) => {
                  if (!linkPickerSearch.trim()) return true
                  const searchLower = linkPickerSearch.toLowerCase()
                  if (linkPickerType === "photo") {
                    const photo = item as PhotoResponse
                    return photo.displayTitle.toLowerCase().includes(searchLower) ||
                      photo.tags?.some(tag => tag.toLowerCase().includes(searchLower))
                  } else {
                    const answer = item as AnswerResponse
                    return answer.question.toLowerCase().includes(searchLower) ||
                      answer.answer.toLowerCase().includes(searchLower)
                  }
                }).filter((item) => {
                  if (linkPickerType === "photo") {
                    return !linkedPhotos.some(p => p.id === item.id)
                  } else {
                    return !linkedAnswers.some(a => a.id === item.id)
                  }
                }).length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      {linkPickerType === "photo" ? (
                        <ImageIcon size={20} className="text-slate-400" />
                      ) : (
                        <FileText size={20} className="text-slate-400" />
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      {linkPickerSearch ? "No matching items found" : `No ${linkPickerType === "photo" ? "photos" : "answers"} available to link`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              Confirm Changes
            </DialogTitle>
            <DialogDescription>
              Review your changes before saving. A new version will be created.
            </DialogDescription>
          </DialogHeader>
          {selectedAnswer && (
            <div className="space-y-4">
              {/* Changes Summary */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {editAnswerForm.question !== selectedAnswer.question && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Question</p>
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-700 dark:text-red-300 line-through">{selectedAnswer.question}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">{editAnswerForm.question}</p>
                      </div>
                    </div>
                  </div>
                )}

                {editAnswerForm.answer !== selectedAnswer.answer && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Answer</p>
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800 max-h-[100px] overflow-y-auto">
                        <p className="text-sm text-red-700 dark:text-red-300 line-through whitespace-pre-wrap">{selectedAnswer.answer}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800 max-h-[100px] overflow-y-auto">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap">{editAnswerForm.answer}</p>
                      </div>
                    </div>
                  </div>
                )}

                {editAnswerForm.topicId !== selectedAnswer.topicId && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Topic</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="line-through text-red-600 dark:text-red-400">
                        {topics.find(t => t.id === selectedAnswer.topicId)?.displayName}
                      </Badge>
                      <span className="text-slate-400">→</span>
                      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
                        {topics.find(t => t.id === editAnswerForm.topicId)?.displayName}
                      </Badge>
                    </div>
                  </div>
                )}

                {editAnswerForm.status !== selectedAnswer.status && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Status</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedAnswer.status === "Approved" ? "success" : "warning"} className="line-through opacity-60">
                        {selectedAnswer.status}
                      </Badge>
                      <span className="text-slate-400">→</span>
                      <Badge variant={editAnswerForm.status === "Approved" ? "success" : "warning"}>
                        {editAnswerForm.status}
                      </Badge>
                    </div>
                  </div>
                )}

                {editAnswerForm.tags !== (selectedAnswer.tags?.join(", ") || "") && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 line-through">{selectedAnswer.tags?.join(", ") || "(none)"}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">{editAnswerForm.tags || "(none)"}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Note:</strong> The original content will be preserved in version history. You can always restore it later.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveConfirm(false)}
                  className="flex-1 rounded-xl"
                  disabled={isSavingAnswer}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveAnswerChanges}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  disabled={isSavingAnswer}
                >
                  {isSavingAnswer ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-2" />
                      Confirm & Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
