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
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 border border-violet-200/60 dark:border-violet-700/60 flex items-center justify-center">
              <Image className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">Insert Photo</h3>
              {!isLoading && photos.length > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{photos.length} photo{photos.length !== 1 ? "s" : ""} available</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search photos…"
              className="w-full h-8 pl-9 pr-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center">
                <Image className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No photos found</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{search ? "Try a different search term" : "No approved photos in the library"}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => handleSelect(photo)}
                  className="group relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-400 dark:hover:border-violet-500 transition-all hover:shadow-[0_4px_12px_rgba(139,92,246,0.25)] hover:scale-[1.02]"
                >
                  <img
                    src={`${API_BASE}/photos/file/${photo.storageKey}`}
                    alt={photo.displayTitle}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
                    <p className="text-[10px] text-white font-medium truncate drop-shadow">{photo.displayTitle}</p>
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
