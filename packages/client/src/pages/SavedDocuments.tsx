import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
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
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<SavedDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<DocumentType>("all")
  const [total, setTotal] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
    if (!confirm("Are you sure you want to delete this document?")) return

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
    RFP: "bg-rose-100 text-rose-700",
    Proposal: "bg-blue-100 text-blue-700",
    Other: "bg-slate-100 text-slate-700",
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <main className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link to="/analyze">
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100">
                  <ArrowLeft size={20} className="text-slate-600" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <FolderOpen size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Saved Documents</h1>
                  <p className="text-slate-500 text-sm">
                    {total} {total === 1 ? "document" : "documents"} saved
                  </p>
                </div>
              </div>
            </div>

            <Link to="/analyze">
              <Button className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500">
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
                className="w-full h-10 pl-10 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              {(["all", "RFP", "Proposal", "Other"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                    typeFilter === type
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {type === "all" ? "All" : type}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={40} className="text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-500">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
                <FolderOpen size={40} className="text-slate-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No documents saved</h2>
              <p className="text-slate-500 mb-6 text-center max-w-md">
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
                  className="rounded-xl border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => handleOpenDocument(doc)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 transition-colors">
                        <FileText size={24} className="text-slate-500 group-hover:text-indigo-600" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-slate-900 truncate">{doc.name}</h3>
                          <Badge className={`text-xs ${typeColors[doc.type]}`}>{doc.type}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
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
                                className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-md"
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(doc.id)
                          }}
                          disabled={deletingId === doc.id}
                        >
                          {deletingId === doc.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </Button>
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
