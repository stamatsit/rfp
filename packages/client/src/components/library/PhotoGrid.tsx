import { Image as ImageIcon, Download } from "lucide-react"
import { getTopicColor } from "./libraryUtils"
import { photosApi, type PhotoResponse } from "@/lib/api"
import type { Topic } from "@/types"

interface PhotoGridProps {
  photos: PhotoResponse[]
  topics: Topic[]
  onSelectPhoto: (photo: PhotoResponse) => void
  onDownload: (photo: PhotoResponse) => void
  getTopicIndex: (topicId: string) => number
}

export function PhotoGrid({ photos, topics, onSelectPhoto, onDownload, getTopicIndex }: PhotoGridProps) {
  if (photos.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {photos.map((photo) => {
        const topicColor = getTopicColor(photo.topicId, getTopicIndex(photo.topicId))
        return (
          <div
            key={photo.id}
            onClick={() => onSelectPhoto(photo)}
            className="group relative rounded-2xl overflow-hidden cursor-pointer bg-slate-100 dark:bg-slate-800 border border-slate-200/40 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="aspect-square overflow-hidden">
              <img
                src={photo.fileUrl || photosApi.getFileUrl(photo.storageKey)}
                alt={photo.displayTitle}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                  const el = e.currentTarget.nextElementSibling as HTMLElement | null
                  if (el) el.style.display = "flex"
                }}
              />
              <div className="hidden w-full h-full items-center justify-center">
                <ImageIcon size={24} className="text-slate-300 dark:text-slate-600" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
              <p className="text-[11px] font-medium text-white truncate leading-tight">{photo.displayTitle}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${topicColor.bg} ${topicColor.text}`}>
                  {topics.find((t) => t.id === photo.topicId)?.displayName || "?"}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDownload(photo) }}
                  className="ml-auto p-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors duration-150"
                >
                  <Download size={10} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
