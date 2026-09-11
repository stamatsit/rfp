/**
 * My Photos: the client's stored images. Scoped server-side to the client
 * in the session; nothing here can reach another organization's files.
 *
 * Images can be selected in bulk and sent to the toolkit together, which is
 * what makes batch rename and multi size export useful on stored work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckSquare, Download, ImageDown, Square, Trash2, Upload, X } from "lucide-react"
import { portalFetch, portalJson } from "@/contexts/PortalAuthContext"
import { usePortalOutlet } from "./PortalShell"
import { toast } from "@/hooks/useToast"

interface PortalImage {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: string
  mine: boolean
  url: string | null
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function PortalLibrary() {
  const { openInToolkit } = usePortalOutlet()
  const [images, setImages] = useState<PortalImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [opening, setOpening] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await portalJson<{ images: PortalImage[] }>("/images")
      setImages(data.images)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your photos")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Drop ids that no longer exist (deleted, or reloaded away)
  useEffect(() => {
    if (!images) return
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(images.map((i) => i.id))
      const next = new Set([...prev].filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [images])

  const selectedImages = useMemo(
    () => (images ?? []).filter((i) => selected.has(i.id)),
    [images, selected],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set((images ?? []).map((i) => i.id)))
  const clearSelection = () => setSelected(new Set())

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (!list.length) return
    setUploading(list.length)
    let ok = 0
    for (const f of list) {
      const form = new FormData()
      form.append("file", f, f.name)
      form.append("filename", f.name)
      const res = await portalFetch("/images", { method: "POST", body: form })
      if (res.ok) ok++
      else {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(`${f.name}: ${d.error || `upload failed (${res.status})`}`)
      }
      setUploading((n) => n - 1)
    }
    if (ok) toast.success(`Uploaded ${ok} image${ok === 1 ? "" : "s"}`)
    await load()
  }

  /** Fetch the stored files and hand them all to the toolkit in one go. */
  const openInToolkitMany = async (items: PortalImage[]) => {
    const usable = items.filter((i) => i.url)
    if (!usable.length) return
    setOpening(usable.length)
    try {
      const files = await Promise.all(
        usable.map(async (img) => {
          const res = await fetch(img.url as string)
          if (!res.ok) throw new Error(img.filename)
          return new File([await res.blob()], img.filename, { type: img.mimeType })
        }),
      )
      clearSelection()
      openInToolkit(files)
    } catch (err) {
      toast.error(err instanceof Error ? `Could not open ${err.message}` : "Could not open those photos")
    } finally {
      setOpening(0)
    }
  }

  const download = async (img: PortalImage) => {
    try {
      const data = await portalJson<{ url: string }>(`/images/${img.id}/download`)
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    }
  }

  const remove = async (img: PortalImage) => {
    if (!window.confirm(`Delete ${img.filename}? This cannot be undone.`)) return
    try {
      await portalJson(`/images/${img.id}`, { method: "DELETE" })
      setImages((cur) => (cur ?? []).filter((i) => i.id !== img.id))
      toast.success("Deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  const count = selected.size
  const allSelected = !!images && images.length > 0 && count === images.length

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My Photos</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Images saved for your organization. Only your team and Stamats can see them.</p>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors mb-6 ${dragOver ? "border-[#C41230] bg-[#C41230]/5" : "border-slate-300 dark:border-slate-700 hover:border-slate-400"}`}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = "" }} />
        <Upload size={22} className="mx-auto mb-2 text-slate-400" />
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {uploading > 0 ? `Uploading ${uploading}...` : "Drop images here or click to upload"}
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">JPEG, PNG, WebP or GIF, up to 25 MB each</p>
      </div>

      {error && <p className="text-[13px] text-red-600 mb-4">{error}</p>}
      {images === null && !error && <p className="text-[13px] text-slate-500">Loading...</p>}
      {images && images.length === 0 && (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Nothing saved yet. Use "Save to My Photos" in the toolkit, or upload files above.</p>
      )}

      {images && images.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <button
              type="button"
              onClick={() => (allSelected ? clearSelection() : selectAll())}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:text-[#C41230]"
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allSelected ? "Clear selection" : `Select all ${images.length}`}
            </button>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {count > 0 ? `${count} selected` : "Tap a photo to select it"}
            </p>
          </div>

          {count > 0 && (
            <div className="sticky top-16 z-30 mb-4 flex items-center gap-3 rounded-xl bg-slate-900 dark:bg-white px-4 py-2.5 shadow-lg">
              <span className="text-[13px] font-medium text-white dark:text-slate-900">
                {count} photo{count === 1 ? "" : "s"} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openInToolkitMany(selectedImages)}
                  disabled={opening > 0}
                  className="h-8 px-3 rounded-lg text-[12px] font-semibold bg-[#C41230] text-white hover:bg-[#a30f28] disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <ImageDown size={13} />
                  {opening > 0 ? `Opening ${opening}...` : `Open ${count} in toolkit`}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="Clear selection"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 dark:text-slate-500 hover:text-white dark:hover:text-slate-900"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => {
              const isSelected = selected.has(img.id)
              return (
                <div
                  key={img.id}
                  className={`group bg-white dark:bg-slate-900 rounded-xl border overflow-hidden shadow-sm transition-colors ${isSelected ? "border-[#C41230] ring-2 ring-[#C41230]/30" : "border-black/[0.06] dark:border-white/[0.08]"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(img.id)}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Deselect" : "Select"} ${img.filename}`}
                    className="relative block w-full aspect-square bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)] overflow-hidden"
                  >
                    {img.url
                      ? <img src={img.url} alt={img.filename} className="w-full h-full object-contain" loading="lazy" />
                      : <span className="text-[11px] text-slate-400">No preview</span>}
                    <span
                      className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center border transition-all ${isSelected ? "bg-[#C41230] border-[#C41230] text-white" : "bg-white/90 dark:bg-slate-900/90 border-black/10 dark:border-white/20 text-transparent group-hover:text-slate-400"}`}
                    >
                      <CheckSquare size={14} />
                    </span>
                  </button>
                  <div className="p-2.5">
                    <p className="text-[12px] font-medium text-slate-900 dark:text-white truncate" title={img.filename}>{img.filename}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {fmtBytes(img.sizeBytes)}{img.width && img.height ? ` · ${img.width}×${img.height}` : ""} · {new Date(img.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <button type="button" onClick={() => void openInToolkitMany([img])} disabled={opening > 0} className="flex-1 h-8 rounded-lg text-[11px] font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center gap-1 disabled:opacity-60"><ImageDown size={12} /> Open in toolkit</button>
                      <button type="button" onClick={() => download(img)} aria-label="Download" className="w-8 h-8 rounded-lg border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[#C41230]"><Download size={13} /></button>
                      <button type="button" onClick={() => remove(img)} aria-label="Delete" className="w-8 h-8 rounded-lg border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
