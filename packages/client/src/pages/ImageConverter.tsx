import { useState, useCallback, useRef, useEffect } from "react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { saveAs } from "file-saver"
import JSZip from "jszip"
import {
  ImageDown,
  Upload,
  Download,
  ZoomIn,
  Crop,
  ArrowRightLeft,
  X,
  Info,
  Link2,
  Check,
  Undo2,
  Scissors,
  Plus,
  Trash2,
  GripVertical,
  Archive,
  Pencil,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

interface Preset {
  label: string
  width: number
  height: number
}

interface PresetGroup {
  label: string
  presets: Preset[]
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    label: "Common Ratios",
    presets: [
      { label: "Square — 1:1", width: 1080, height: 1080 },
      { label: "4:3", width: 1600, height: 1200 },
      { label: "3:2", width: 1500, height: 1000 },
      { label: "16:9", width: 1920, height: 1080 },
      { label: "9:16", width: 1080, height: 1920 },
      { label: "2:3", width: 1000, height: 1500 },
      { label: "3:4", width: 1200, height: 1600 },
    ],
  },
  {
    label: "Instagram",
    presets: [
      { label: "Square", width: 1080, height: 1080 },
      { label: "Portrait", width: 1080, height: 1350 },
      { label: "Story / Reel", width: 1080, height: 1920 },
      { label: "Landscape", width: 1080, height: 608 },
    ],
  },
  {
    label: "Facebook",
    presets: [
      { label: "Post", width: 1200, height: 630 },
      { label: "Cover", width: 1640, height: 856 },
      { label: "Story", width: 1080, height: 1920 },
      { label: "Profile", width: 170, height: 170 },
    ],
  },
  {
    label: "X / Twitter",
    presets: [
      { label: "Post", width: 1600, height: 900 },
      { label: "Header", width: 1500, height: 500 },
      { label: "Profile", width: 400, height: 400 },
    ],
  },
  {
    label: "LinkedIn",
    presets: [
      { label: "Post", width: 1200, height: 627 },
      { label: "Cover", width: 1584, height: 396 },
      { label: "Story", width: 1080, height: 1920 },
    ],
  },
  {
    label: "YouTube",
    presets: [
      { label: "Thumbnail", width: 1280, height: 720 },
      { label: "Banner", width: 2560, height: 1440 },
    ],
  },
  {
    label: "Web",
    presets: [
      { label: "OG Image", width: 1200, height: 630 },
      { label: "Favicon", width: 512, height: 512 },
      { label: "HD 1080p", width: 1920, height: 1080 },
      { label: "4K", width: 3840, height: 2160 },
    ],
  },
]

function buildPresetKey(group: string, label: string) {
  return `${group}::${label}`
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function cropToDataURL(
  imageSrc: string,
  pixelCrop: Area,
  outputWidth: number,
  outputHeight: number
): Promise<string> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputWidth, outputHeight
  )
  return canvas.toDataURL("image/png")
}

async function resizeImage(
  imageSrc: string,
  outputWidth: number,
  outputHeight: number,
  format: string
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(image, 0, 0, outputWidth, outputHeight)
  const mimeType = format === "JPEG" || format === "JPG" ? "image/jpeg"
    : format === "PNG" ? "image/png"
    : format === "GIF" ? "image/gif"
    : format === "BMP" ? "image/bmp"
    : "image/png"
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mimeType,
      0.92
    )
  })
}

async function convertToWebP(
  imageSrc: string,
  outputWidth: number,
  outputHeight: number,
  quality: number
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(image, 0, 0, outputWidth, outputHeight)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality / 100
    )
  })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getFileExtension(name: string) {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.substring(dot + 1).toUpperCase() : "UNKNOWN"
}

function stripExtension(name: string) {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.substring(0, dot) : name
}

let nextId = 0

const STORAGE_KEY = "image-converter-session"

function loadSession(): { images: ImageItem[]; selectedId: number | null; quality: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data.images) || data.images.length === 0) return null
    // Restore nextId to avoid collisions
    const maxId = Math.max(...data.images.map((img: ImageItem) => img.id))
    nextId = maxId + 1
    return data
  } catch {
    return null
  }
}

function saveSession(images: ImageItem[], selectedId: number | null, quality: number) {
  if (images.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ images, selectedId, quality }))
  } catch {
    // localStorage quota exceeded — silently fail
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageItem {
  id: number
  fileName: string
  originalFormat: string
  originalSize: number
  /** The source data URL (original upload) */
  originalSrc: string
  /** Current working src (may be cropped) */
  src: string
  naturalWidth: number
  naturalHeight: number
  outputWidth: number
  outputHeight: number
  cropApplied: boolean
  converted: boolean
  convertedSize?: number
}

type Mode = "convert" | "crop"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const _initialSession = loadSession()

export function ImageConverter() {
  const [images, setImages] = useState<ImageItem[]>(_initialSession?.images ?? [])
  const [selectedId, setSelectedId] = useState<number | null>(_initialSession?.selectedId ?? null)
  const [mode, setMode] = useState<Mode>("convert")
  const [quality, setQuality] = useState(_initialSession?.quality ?? 80)
  const [presetKey, setPresetKey] = useState("")

  // Crop state (for the currently selected image)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const [applyingCrop, setApplyingCrop] = useState(false)

  // UI state
  const [converting, setConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const [dragItemId, setDragItemId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const selected = images.find((img) => img.id === selectedId) ?? null

  // Auto-save session to localStorage
  useEffect(() => {
    saveSession(images, selectedId, quality)
  }, [images, selectedId, quality])

  // ---- Helpers to update a single image ----
  const updateImage = useCallback(
    (id: number, patch: Partial<ImageItem>) => {
      setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)))
    },
    []
  )

  // ---- File loading ----

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) => f.type.startsWith("image/"))
      if (!fileArr.length) return

      let firstNewId: number | null = null

      fileArr.forEach((file) => {
        const id = nextId++
        if (firstNewId === null) firstNewId = id

        const reader = new FileReader()
        reader.onload = () => {
          const src = reader.result as string
          const img = new Image()
          img.onload = () => {
            const item: ImageItem = {
              id,
              fileName: file.name,
              originalFormat: getFileExtension(file.name),
              originalSize: file.size,
              originalSrc: src,
              src,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              outputWidth: img.naturalWidth,
              outputHeight: img.naturalHeight,
              cropApplied: false,
              converted: false,
            }
            setImages((prev) => [...prev, item])
            // Auto-select the first new image
            if (id === firstNewId) {
              setSelectedId(id)
              setMode("convert")
              resetCropState()
            }
          }
          img.src = src
        }
        reader.readAsDataURL(file)
      })
    },
    []
  )

  const resetCropState = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setAspect(undefined)
    setPresetKey("")
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files)
      e.target.value = ""
    },
    [addFiles]
  )

  // ---- Select image ----

  const selectImage = (id: number) => {
    setSelectedId(id)
    setMode("convert")
    resetCropState()
  }

  // ---- Remove image ----

  const removeImage = (id: number) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
    if (selectedId === id) {
      setSelectedId((prev) => {
        const remaining = images.filter((img) => img.id !== id)
        return remaining.length > 0 ? remaining[0].id : null
      })
      resetCropState()
      setMode("convert")
    }
  }

  // ---- Crop callbacks ----

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleApplyCrop = async () => {
    if (!selected || !croppedAreaPixels) return
    setApplyingCrop(true)
    try {
      const preview = await cropToDataURL(
        selected.src,
        croppedAreaPixels,
        selected.outputWidth,
        selected.outputHeight
      )
      updateImage(selected.id, {
        src: preview,
        cropApplied: true,
        naturalWidth: selected.outputWidth,
        naturalHeight: selected.outputHeight,
      })
      setMode("convert")
      resetCropState()
    } catch (err) {
      console.error("Apply crop failed:", err)
    } finally {
      setApplyingCrop(false)
    }
  }

  const handleUndoCrop = () => {
    if (!selected) return
    const img = new Image()
    img.onload = () => {
      updateImage(selected.id, {
        src: selected.originalSrc,
        cropApplied: false,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        outputWidth: img.naturalWidth,
        outputHeight: img.naturalHeight,
        converted: false,
      })
      setMode("crop")
      resetCropState()
      // Re-apply preset aspect if one was set
      if (presetKey) {
        for (const group of PRESET_GROUPS) {
          for (const p of group.presets) {
            if (buildPresetKey(group.label, p.label) === presetKey) {
              updateImage(selected.id, {
                src: selected.originalSrc,
                cropApplied: false,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                outputWidth: p.width,
                outputHeight: p.height,
                converted: false,
              })
              setAspect(p.width / p.height)
              return
            }
          }
        }
      }
    }
    img.src = selected.originalSrc
  }

  // ---- Preset selection ----

  const handlePresetChange = (key: string) => {
    if (!selected) return
    setPresetKey(key)
    if (!key) {
      setAspect(undefined)
      updateImage(selected.id, {
        outputWidth: selected.naturalWidth,
        outputHeight: selected.naturalHeight,
      })
      return
    }
    for (const group of PRESET_GROUPS) {
      for (const p of group.presets) {
        if (buildPresetKey(group.label, p.label) === key) {
          updateImage(selected.id, {
            outputWidth: p.width,
            outputHeight: p.height,
          })
          setAspect(p.width / p.height)
          setMode("crop")
          // Undo crop if applied so we can re-crop from original
          if (selected.cropApplied) {
            updateImage(selected.id, {
              src: selected.originalSrc,
              cropApplied: false,
              outputWidth: p.width,
              outputHeight: p.height,
            })
            const img = new Image()
            img.onload = () => {
              updateImage(selected.id, {
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
              })
            }
            img.src = selected.originalSrc
          }
          setCrop({ x: 0, y: 0 })
          setZoom(1)
          return
        }
      }
    }
  }

  // ---- Manual dimension change ----

  const handleWidthChange = (val: string) => {
    if (!selected) return
    const w = parseInt(val) || 0
    setPresetKey("")
    if (mode === "convert") {
      const h = w > 0 && selected.naturalWidth > 0
        ? Math.round(w * (selected.naturalHeight / selected.naturalWidth))
        : selected.outputHeight
      updateImage(selected.id, { outputWidth: w, outputHeight: h })
    } else {
      updateImage(selected.id, { outputWidth: w })
      if (w > 0 && selected.outputHeight > 0) setAspect(w / selected.outputHeight)
    }
  }

  const handleHeightChange = (val: string) => {
    if (!selected) return
    const h = parseInt(val) || 0
    setPresetKey("")
    if (mode === "convert") {
      const w = h > 0 && selected.naturalHeight > 0
        ? Math.round(h * (selected.naturalWidth / selected.naturalHeight))
        : selected.outputWidth
      updateImage(selected.id, { outputHeight: h, outputWidth: w })
    } else {
      updateImage(selected.id, { outputHeight: h })
      if (selected.outputWidth > 0 && h > 0) setAspect(selected.outputWidth / h)
    }
  }

  // ---- Convert single ----

  const handleConvertSingle = async () => {
    if (!selected) return
    setConverting(true)
    try {
      const blob = await convertToWebP(selected.src, selected.outputWidth, selected.outputHeight, quality)
      saveAs(blob, `${stripExtension(selected.fileName)}.webp`)
      updateImage(selected.id, { converted: true, convertedSize: blob.size })
    } catch (err) {
      console.error("Conversion failed:", err)
    } finally {
      setConverting(false)
    }
  }

  // ---- Download resized (original format) ----

  const handleDownloadResized = async () => {
    if (!selected) return
    setConverting(true)
    try {
      const ext = selected.originalFormat.toLowerCase()
      const blob = await resizeImage(selected.src, selected.outputWidth, selected.outputHeight, selected.originalFormat)
      saveAs(blob, `${stripExtension(selected.fileName)}-${selected.outputWidth}x${selected.outputHeight}.${ext}`)
    } catch (err) {
      console.error("Resize failed:", err)
    } finally {
      setConverting(false)
    }
  }

  // ---- Convert all (ZIP) ----

  const handleConvertAll = async () => {
    setConverting(true)
    setConvertProgress(0)
    try {
      const zip = new JSZip()
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const blob = await convertToWebP(img.src, img.outputWidth, img.outputHeight, quality)
        zip.file(`${stripExtension(img.fileName)}.webp`, blob)
        updateImage(img.id, { converted: true, convertedSize: blob.size })
        setConvertProgress(i + 1)
      }
      const zipBlob = await zip.generateAsync({ type: "blob" })
      saveAs(zipBlob, "converted-images.zip")
    } catch (err) {
      console.error("Batch conversion failed:", err)
    } finally {
      setConverting(false)
      setConvertProgress(0)
    }
  }

  // ---- Clear all ----

  const handleClearAll = () => {
    setImages([])
    setSelectedId(null)
    setMode("convert")
    resetCropState()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ---- Filmstrip drag reorder ----

  const handleFilmDragStart = (id: number) => {
    setDragItemId(id)
  }

  const handleFilmDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (dragItemId === null || dragItemId === targetId) return
    setImages((prev) => {
      const fromIdx = prev.findIndex((img) => img.id === dragItemId)
      const toIdx = prev.findIndex((img) => img.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  const handleFilmDragEnd = () => {
    setDragItemId(null)
  }

  // ---- Rename ----

  const startRename = () => {
    if (!selected) return
    setNameInput(stripExtension(selected.fileName))
    setEditingName(true)
  }

  const commitRename = () => {
    if (!selected || !nameInput.trim()) {
      setEditingName(false)
      return
    }
    const ext = selected.fileName.substring(selected.fileName.lastIndexOf("."))
    updateImage(selected.id, { fileName: nameInput.trim() + ext })
    setEditingName(false)
  }

  const convertedCount = images.filter((img) => img.converted).length

  // ---- Render ----

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      <main className="flex-1 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ImageDown size={20} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Image Converter
              </h1>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                Convert images to WebP &mdash; crop & resize to exact dimensions
              </p>
            </div>
          </div>

          {images.length === 0 ? (
            /* ================= DROP ZONE ================= */
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center py-24 gap-4
                ${isDragging
                  ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-900/50"
                }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Upload size={28} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
                  Drop images here or click to browse
                </p>
                <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
                  PNG, JPEG, GIF, BMP, TIFF &rarr; WebP &mdash; select multiple
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <>
              {/* ================= EDITOR ================= */}
              {selected && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                  {/* LEFT — Preview / Cropper + Filmstrip */}
                  <div>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Preview toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                          {selected.fileName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">
                          {selected.originalFormat}
                        </span>
                        {selected.cropApplied && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Cropped
                          </span>
                        )}
                        {selected.converted && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Converted {selected.convertedSize ? formatBytes(selected.convertedSize) : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {selected.cropApplied && (
                          <button
                            onClick={handleUndoCrop}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                          >
                            <Undo2 size={13} />
                            Undo crop
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Image area — adapts to image aspect ratio */}
                    {mode === "crop" && !selected.cropApplied ? (
                      <div
                        className="relative bg-[#f0f0f0] dark:bg-slate-950"
                        style={{
                          aspectRatio: `${selected.naturalWidth} / ${selected.naturalHeight}`,
                          minHeight: 200,
                          maxHeight: 520,
                        }}
                      >
                        <Cropper
                          image={selected.src}
                          crop={crop}
                          zoom={zoom}
                          aspect={aspect}
                          cropShape="rect"
                          showGrid
                          onCropChange={setCrop}
                          onZoomChange={setZoom}
                          onCropComplete={onCropComplete}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center bg-[#f0f0f0] dark:bg-slate-950">
                        <img
                          src={selected.src}
                          alt="Preview"
                          className="max-w-full block"
                          style={{
                            maxHeight: 500,
                            ...(selected.cropApplied ? {
                              boxShadow: "inset 0 0 0 2px rgba(16, 185, 129, 0.3)",
                            } : {}),
                          }}
                        />
                      </div>
                    )}

                    {/* Bottom bar: zoom + apply crop */}
                    {mode === "crop" && !selected.cropApplied && (
                      <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                        <ZoomIn size={14} className="text-slate-400 flex-shrink-0" />
                        <input
                          type="range"
                          min={1} max={3} step={0.05}
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer
                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-400 font-mono w-8 text-right">
                          {zoom.toFixed(1)}x
                        </span>
                        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
                        <button
                          onClick={handleApplyCrop}
                          disabled={applyingCrop || !croppedAreaPixels}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium
                                     bg-emerald-500 text-white hover:bg-emerald-600
                                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {applyingCrop ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Scissors size={13} />
                          )}
                          Apply Crop
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filmstrip — inside left column so it hugs the image */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {images.map((img) => (
                        <div
                          key={img.id}
                          draggable
                          onDragStart={() => handleFilmDragStart(img.id)}
                          onDragOver={(e) => handleFilmDragOver(e, img.id)}
                          onDragEnd={handleFilmDragEnd}
                          onClick={() => selectImage(img.id)}
                          className={`relative flex-shrink-0 group rounded-xl overflow-hidden border-2 transition-all duration-150 cursor-pointer
                            ${dragItemId === img.id ? "opacity-40" : ""}
                            ${img.id === selectedId
                              ? "border-emerald-500 shadow-lg shadow-emerald-500/20"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                          style={{ width: 72, height: 72 }}
                        >
                          <img
                            src={img.src}
                            alt={img.fileName}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-70 transition-opacity">
                            <GripVertical size={10} className="text-white drop-shadow-md" />
                          </div>
                          {img.converted && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check size={10} className="text-white" strokeWidth={3} />
                            </div>
                          )}
                          {img.cropApplied && !img.converted && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <Crop size={9} className="text-white" strokeWidth={3} />
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                            className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={10} className="text-white" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                            <p className="text-[8px] text-white truncate font-medium">
                              {img.fileName}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Add more */}
                      <button
                        onClick={() => addInputRef.current?.click()}
                        className="flex-shrink-0 w-[72px] h-[72px] rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 flex flex-col items-center justify-center gap-0.5 transition-colors"
                      >
                        <Plus size={18} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Add</span>
                      </button>
                      <input
                        ref={addInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>

                    {/* Summary bar */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[12px] text-slate-400 dark:text-slate-500">
                        {images.length} image{images.length !== 1 ? "s" : ""}
                        {convertedCount > 0 && (
                          <span className="text-emerald-500 ml-1.5">
                            — {convertedCount} converted
                          </span>
                        )}
                      </span>
                      <button
                        onClick={handleClearAll}
                        className="text-[11px] text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={11} />
                        Clear all
                      </button>
                    </div>
                  </div>
                  </div>

                  {/* RIGHT — Controls */}
                  <div className="space-y-4">
                    {/* Mode toggle */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                        Mode
                      </Label>
                      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <button
                          onClick={() => {
                            if (selected.cropApplied) return
                            setMode("convert")
                            setAspect(undefined)
                            setPresetKey("")
                            updateImage(selected.id, {
                              outputWidth: selected.naturalWidth,
                              outputHeight: selected.naturalHeight,
                            })
                          }}
                          className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                            ${mode === "convert" || selected.cropApplied
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                          <ArrowRightLeft size={14} />
                          Convert
                        </button>
                        <button
                          onClick={() => {
                            if (selected.cropApplied) {
                              handleUndoCrop()
                              return
                            }
                            setMode("crop")
                            if (selected.outputWidth > 0 && selected.outputHeight > 0) {
                              setAspect(selected.outputWidth / selected.outputHeight)
                            }
                          }}
                          className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                            ${mode === "crop" && !selected.cropApplied
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                          <Crop size={14} />
                          {selected.cropApplied ? "Re-crop" : "Crop & Convert"}
                        </button>
                      </div>
                    </div>

                    {/* Crop applied indicator */}
                    {selected.cropApplied && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                        <Check size={14} className="text-emerald-500" />
                        <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                          Crop applied — {selected.outputWidth}×{selected.outputHeight}
                        </span>
                        <button
                          onClick={handleUndoCrop}
                          className="ml-auto text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Undo
                        </button>
                      </div>
                    )}

                    {/* Presets */}
                    {mode === "crop" && !selected.cropApplied && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                          Size Preset
                        </Label>
                        <Select value={presetKey} onValueChange={handlePresetChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a preset..." />
                          </SelectTrigger>
                          <SelectContent>
                            {PRESET_GROUPS.map((group) => (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {group.presets.map((p) => {
                                  const key = buildPresetKey(group.label, p.label)
                                  return (
                                    <SelectItem key={key} value={key}>
                                      {group.label !== "Common Ratios"
                                        ? `${p.label} — ${p.width}×${p.height}`
                                        : p.label}
                                    </SelectItem>
                                  )
                                })}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Dimensions */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Output Dimensions
                        </Label>
                        {(mode === "convert" || selected.cropApplied) && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">
                            <Link2 size={10} />
                            Aspect locked
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                        <div>
                          <Label className="text-[11px] text-slate-400 mb-1 block">Width (px)</Label>
                          <Input
                            type="number" min={1}
                            value={selected.outputWidth || ""}
                            onChange={(e) => handleWidthChange(e.target.value)}
                            className="text-[13px]"
                            disabled={selected.cropApplied}
                          />
                        </div>
                        <div className="pb-2">
                          <X size={12} className="text-slate-300 dark:text-slate-600" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-400 mb-1 block">Height (px)</Label>
                          <Input
                            type="number" min={1}
                            value={selected.outputHeight || ""}
                            onChange={(e) => handleHeightChange(e.target.value)}
                            className="text-[13px]"
                            disabled={selected.cropApplied}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quality */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Quality
                        </Label>
                        <span className="text-[13px] font-mono font-medium text-slate-700 dark:text-slate-300">
                          {quality}%
                        </span>
                      </div>
                      <input
                        type="range" min={1} max={100}
                        value={quality}
                        onChange={(e) => setQuality(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Smaller file</span>
                        <span>Higher quality</span>
                      </div>
                    </div>

                    {/* Info card */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                        <Info size={12} />
                        Details
                      </div>

                      {/* Editable file name */}
                      <div className="flex items-center gap-2 mb-2">
                        {editingName ? (
                          <input
                            autoFocus
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename()
                              if (e.key === "Escape") setEditingName(false)
                            }}
                            className="flex-1 text-[12px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        ) : (
                          <button
                            onClick={startRename}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors group"
                            title="Rename file"
                          >
                            <span className="truncate max-w-[200px]">{stripExtension(selected.fileName)}</span>
                            <Pencil size={10} className="text-slate-400 group-hover:text-emerald-500 flex-shrink-0" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
                        <span className="text-slate-400 dark:text-slate-500">Source</span>
                        <span className="text-slate-700 dark:text-slate-300 text-right font-mono">
                          {selected.originalFormat}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">Original size</span>
                        <span className="text-slate-700 dark:text-slate-300 text-right font-mono">
                          {formatBytes(selected.originalSize)}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">Original dims</span>
                        <span className="text-slate-700 dark:text-slate-300 text-right font-mono">
                          {selected.naturalWidth}×{selected.naturalHeight}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">Output dims</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-right font-mono font-medium">
                          {selected.outputWidth}×{selected.outputHeight}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">Output format</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-right font-mono font-medium">
                          WebP
                        </span>
                        {selected.converted && selected.convertedSize != null && (
                          <>
                            <span className="text-slate-400 dark:text-slate-500">WebP size</span>
                            <span className="text-emerald-600 dark:text-emerald-400 text-right font-mono font-medium">
                              {formatBytes(selected.convertedSize)}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500">Savings</span>
                            <span className="text-emerald-600 dark:text-emerald-400 text-right font-mono font-medium">
                              {Math.round((1 - selected.convertedSize / selected.originalSize) * 100)}% smaller
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2">
                      {/* Convert this image */}
                      <Button
                        onClick={handleConvertSingle}
                        disabled={converting || selected.outputWidth < 1 || selected.outputHeight < 1}
                        className="w-full h-10 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                      >
                        {converting && convertProgress === 0 ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Converting...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Download size={15} />
                            {selected.converted ? "Re-download WebP" : "Convert & Download"}
                          </span>
                        )}
                      </Button>

                      {/* Download resized (original format) */}
                      <Button
                        onClick={handleDownloadResized}
                        disabled={converting || selected.outputWidth < 1 || selected.outputHeight < 1}
                        variant="outline"
                        className="w-full h-10 rounded-xl font-medium"
                      >
                        <span className="flex items-center gap-2">
                          <Download size={15} />
                          Download as {selected.originalFormat}
                          {(selected.outputWidth !== selected.naturalWidth || selected.outputHeight !== selected.naturalHeight) && (
                            <span className="text-[11px] text-slate-400">
                              ({selected.outputWidth}×{selected.outputHeight})
                            </span>
                          )}
                        </span>
                      </Button>

                      {/* Convert all */}
                      {images.length > 1 && (
                        <Button
                          onClick={handleConvertAll}
                          disabled={converting}
                          variant="outline"
                          className="w-full h-10 rounded-xl font-medium"
                        >
                          {converting && convertProgress > 0 ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                              Converting {convertProgress}/{images.length}...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Archive size={15} />
                              Convert All as ZIP ({images.length})
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </main>
    </div>
  )
}
