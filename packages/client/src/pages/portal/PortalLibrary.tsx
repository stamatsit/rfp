/**
 * My Uploads: the client's stored images. Scoped server-side to the client
 * in the session; nothing here can reach another organization's files.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Download, ImageDown, Trash2, Upload } from "lucide-react"
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
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await portalJson<{ images: PortalImage[] }>("/images")
      setImages(data.images)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your uploads")
    }
  }, [])

  useEffect(() => { void load() }, [load])

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

  const open = async (img: PortalImage) => {
    if (!img.url) return
    try {
      const blob = await (await fetch(img.url)).blob()
      openInToolkit([new File([blob], img.filename, { type: img.mimeType })])
    } catch {
      toast.error("Could not open that image")
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

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My Uploads</h1>
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
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Nothing saved yet. Use "Save to My Uploads" in the toolkit, or upload files above.</p>
      )}
      {images && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="group bg-white dark:bg-slate-900 rounded-xl border border-black/[0.06] dark:border-white/[0.08] overflow-hidden shadow-sm">
              <div className="aspect-square bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)] flex items-center justify-center overflow-hidden">
                {img.url ? <img src={img.url} alt={img.filename} className="w-full h-full object-contain" loading="lazy" /> : <span className="text-[11px] text-slate-400">No preview</span>}
              </div>
              <div className="p-2.5">
                <p className="text-[12px] font-medium text-slate-900 dark:text-white truncate" title={img.filename}>{img.filename}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {fmtBytes(img.sizeBytes)}{img.width && img.height ? ` · ${img.width}×${img.height}` : ""} · {new Date(img.createdAt).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <button type="button" onClick={() => open(img)} className="flex-1 h-8 rounded-lg text-[11px] font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center gap-1"><ImageDown size={12} /> Open in toolkit</button>
                  <button type="button" onClick={() => download(img)} aria-label="Download" className="w-8 h-8 rounded-lg border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[#C41230]"><Download size={13} /></button>
                  <button type="button" onClick={() => remove(img)} aria-label="Delete" className="w-8 h-8 rounded-lg border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
