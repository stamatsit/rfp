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

  const typeLabels: Record<string, string> = {
    "": "All",
    "image": "Images",
    "svg": "SVG",
    "chart-snapshot": "Charts",
    "document-snippet": "Snippets",
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200/60 dark:border-sky-700/60 flex items-center justify-center">
              <FolderOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">Asset Library</h3>
              {!isLoading && assets.length > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{assets.length} asset{assets.length !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full h-8 pl-9 pr-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 dark:focus:border-emerald-600 transition-all"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["", "image", "svg", "chart-snapshot", "document-snippet"].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                  typeFilter === type
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/60 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                }`}
              >
                {typeLabels[type] ?? type}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-md" style={{ width: `${50 + i * 12}%` }} />
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-md w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-6">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No assets yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Save SVGs, images, and snippets from the AI sidebar</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {assets.map((asset) => {
                const Icon = typeIcons[asset.type] || FileText
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer group transition-colors"
                    onClick={() => handleInsert(asset)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 transition-colors">
                      <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">{asset.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 capitalize">{typeLabels[asset.type] ?? asset.type} &middot; {new Date(asset.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(asset.id) }}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
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
