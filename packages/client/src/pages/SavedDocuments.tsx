import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useIsAdmin } from "@/contexts/AuthContext"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  ArrowLeft,
  FolderOpen,
  FileText,
  Loader2,
  Search,
  Trash2,
  FileSearch,
  Calendar,
  Tag,
  Eye,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button, Card, CardContent, Badge } from "@/components/ui"
import { rfpApi, type SavedDocument } from "@/lib/api"

type DocumentType = "RFP" | "Proposal" | "Other" | "all"

export function SavedDocuments() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<SavedDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<DocumentType>("all")
  const [total, setTotal] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Load documents
  useEffect(() => {
    loadDocuments()
  }, [typeFilter, searchQuery])

  const loadDocuments = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await rfpApi.listDocuments({
        type: typeFilter === "all" ? undefined : typeFilter,
        search: searchQuery || undefined,
        limit: 50,
      })
      setDocuments(result.documents)
      setTotal(result.total)
    } catch (err) {
      console.error("Failed to load documents:", err)
      setError(err instanceof Error ? err.message : "Failed to load documents")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await rfpApi.deleteDocument(id)
      setDocuments((prev) => prev.filter((d) => d.id !== id))
      setTotal((prev) => prev - 1)
    } catch (err) {
      console.error("Failed to delete document:", err)
      setError(err instanceof Error ? err.message : "Failed to delete document")
    } finally {
      setDeletingId(null)
    }
  }

  const handleOpenDocument = (doc: SavedDocument) => {
    // Navigate to analyzer with document loaded
    navigate(`/analyze?docId=${doc.id}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ""
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(1)} MB`
  }

  const typeColors = {
    RFP: "bg-amber-100 text-amber-700",
    Proposal: "bg-blue-100 text-blue-700",
    Other: "bg-slate-100 text-slate-700",
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />
      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete document"
        description="This document will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId) }}
      />

      <main className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link to="/analyze">
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)", boxShadow: "0 4px 14px rgba(99, 102, 241, 0.3), 0 1px 3px rgba(0,0,0,0.1)" }}>
                  <FolderOpen size={22} className="text-white" strokeWidth={2.25} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Saved Documents</h1>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {total} {total === 1 ? "document" : "documents"} saved
                  </p>
                </div>
              </div>
            </div>

            <Link to="/analyze">
              <Button className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500">
                <FileSearch size={16} className="mr-2" />
                Analyze New
              </Button>
            </Link>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 text-sm border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>

            <div className="flex items-center gap-2">
              {(["all", "RFP", "Proposal", "Other"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                    typeFilter === type
                      ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {type === "all" ? "All" : type}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={40} className="text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-500 dark:text-slate-400">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6">
                <FolderOpen size={40} className="text-slate-400 dark:text-slate-500" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No documents saved</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6 text-center max-w-md">
                {searchQuery || typeFilter !== "all"
                  ? "No documents match your filters. Try adjusting your search."
                  : "Upload and save RFPs or proposals to access them later."}
              </p>
              <Link to="/analyze">
                <Button className="rounded-xl">
                  <FileSearch size={16} className="mr-2" />
                  Analyze Document
                </Button>
              </Link>
            </div>
          ) : (
            /* Document List */
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card
                  key={doc.id}
                  className="rounded-xl border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => handleOpenDocument(doc)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
                        <FileText size={24} className="text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-slate-900 dark:text-white truncate">{doc.name}</h3>
                          <Badge className={`text-xs ${typeColors[doc.type]}`}>{doc.type}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <FileText size={12} />
                            {doc.originalFilename}
                          </span>
                          {doc.pageCount && (
                            <span>{doc.pageCount} pages</span>
                          )}
                          {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {formatDate(doc.createdAt)}
                          </span>
                        </div>
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <Tag size={12} className="text-slate-400" />
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded-md"
                              >
                                {tag}
                              </span>
                            ))}
                            {doc.tags.length > 3 && (
                              <span className="text-xs text-slate-400">
                                +{doc.tags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDocument(doc)
                          }}
                        >
                          <Eye size={16} className="text-slate-500" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDeleteId(doc.id)
                            }}
                            disabled={deletingId === doc.id}
                          >
                            {deletingId === doc.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
