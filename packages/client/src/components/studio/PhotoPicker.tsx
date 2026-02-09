import { useState, useEffect, useCallback } from "react"
import { X, Search, Image } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

interface Photo {
  id: string
  displayTitle: string
  storageKey: string
  topicId: string
  mimeType: string | null
}

interface PhotoPickerProps {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function PhotoPicker({ onInsert, onClose }: PhotoPickerProps) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  const fetchPhotos = useCallback(async (query?: string) => {
    setIsLoading(true)
    try {
      const url = query
        ? `${API_BASE}/photos/search?q=${encodeURIComponent(query)}&status=Approved&limit=30`
        : `${API_BASE}/photos?status=Approved&limit=30`
      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setPhotos(data as Photo[])
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPhotos()
  }, [fetchPhotos])

  useEffect(() => {
    if (!search) return
    const timer = setTimeout(() => {
      void fetchPhotos(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, fetchPhotos])

  const handleSelect = (photo: Photo) => {
    const html = `<img src="${API_BASE}/photos/file/${photo.storageKey}" alt="${photo.displayTitle.replace(/"/g, "&quot;")}" />`
    onInsert(html)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Insert Photo</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search photos..."
              className="w-full h-8 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500/30"
              autoFocus
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">Loading...</div>
          ) : photos.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">No photos found</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => handleSelect(photo)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors"
                >
                  <img
                    src={`${API_BASE}/photos/file/${photo.storageKey}`}
                    alt={photo.displayTitle}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{photo.displayTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
