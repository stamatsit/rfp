import { useState, useEffect, useCallback } from "react"
import { X, Search, FolderOpen, Trash2, Image, Code2, FileText, BarChart3 } from "lucide-react"
import { studioApi } from "@/lib/api"
import { markdownToHtml } from "@/lib/markdownToHtml"

interface Asset {
  id: string
  name: string
  type: string
  data: string
  thumbnail: string | null
  tags: string[]
  createdAt: string
}

interface AssetPanelProps {
  onInsert: (content: string) => void
  onClose: () => void
}

const typeIcons: Record<string, typeof Image> = {
  image: Image,
  svg: Code2,
  "chart-snapshot": BarChart3,
  "document-snippet": FileText,
  logo: Image,
  icon: Image,
}

export function AssetPanel({ onInsert, onClose }: AssetPanelProps) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  const fetchAssets = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: { type?: string; search?: string } = {}
      if (typeFilter) params.type = typeFilter
      if (search) params.search = search
      const data = await studioApi.listAssets(params) as Asset[]
      setAssets(data)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [typeFilter, search])

  useEffect(() => {
    void fetchAssets()
  }, [fetchAssets])

  const handleDelete = async (id: string) => {
    try {
      await studioApi.deleteAsset(id)
      setAssets((prev) => prev.filter((a) => a.id !== id))
    } catch {
      // ignore
    }
  }

  const handleInsert = (asset: Asset) => {
    if (asset.type === "svg") {
      onInsert(asset.data)
    } else if (asset.type === "image") {
      onInsert(`<img src="${asset.data}" alt="${asset.name.replace(/"/g, "&quot;")}" />`)
    } else {
      onInsert(markdownToHtml(asset.data))
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Asset Library</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full h-8 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex gap-1">
            {["", "image", "svg", "chart-snapshot", "document-snippet"].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  typeFilter === type
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {type || "All"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">Loading...</div>
          ) : assets.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              No assets saved yet
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {assets.map((asset) => {
                const Icon = typeIcons[asset.type] || FileText
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer group"
                    onClick={() => handleInsert(asset)}
                  >
                    <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{asset.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{asset.type} &middot; {new Date(asset.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(asset.id) }}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
