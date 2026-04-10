import { useState, useCallback, useRef, useEffect } from "react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { saveAs } from "file-saver"
import JSZip from "jszip"
import { removeBackground } from "@imgly/background-removal"
import { useInpainting } from "@/hooks/useInpainting"
import { useUpscaler, ENHANCE_OPS } from "@/hooks/useUpscaler"
import localforage from "localforage"
import {
  ImageDown,
  Eraser,
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
  Zap,
  Minus,
  Layers,
  Maximize2,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Globe,
  FileImage,
  MonitorSmartphone,
  TextCursorInput,
  Hash,
  RotateCcw,
  Eye,
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  ChevronDown,
  Copy,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { addCsrfHeader } from "@/lib/csrfToken"
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

const sessionStore = localforage.createInstance({ name: "image-toolkit", storeName: "session" })

async function loadSessionAsync(): Promise<{ images: ImageItem[]; selectedId: number | null; quality: number } | null> {
  try {
    const data = await sessionStore.getItem<{ images: ImageItem[]; selectedId: number | null; quality: number }>(STORAGE_KEY)
    if (!data || !Array.isArray(data.images) || data.images.length === 0) return null
    // Restore nextId to avoid collisions
    const maxId = Math.max(...data.images.map((img: ImageItem) => img.id))
    nextId = maxId + 1
    // Backfill new fields for sessions saved before these existed
    data.images = data.images.map((img: ImageItem) => ({
      bgRemoved: false,
      preBgSrc: null,
      enhanced: false,
      preEnhanceSrc: null,
      altText: "",
      ...img,
    }))
    return data
  } catch {
    return null
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null

function saveSession(images: ImageItem[], selectedId: number | null, quality: number) {
  // Debounce writes — IndexedDB is async so we batch rapid state changes
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    if (images.length === 0) {
      sessionStore.removeItem(STORAGE_KEY).catch(() => {})
      return
    }
    // Strip undo snapshots — they can be huge and aren't critical to restore
    const slim = images.map(({ preBgSrc, preEnhanceSrc, ...rest }) => rest)
    sessionStore.setItem(STORAGE_KEY, { images: slim, selectedId, quality }).catch(() => {})
  }, 500)
}

// Migrate any old localStorage session into IndexedDB (one-time)
try {
  const legacy = localStorage.getItem(STORAGE_KEY)
  if (legacy) {
    const data = JSON.parse(legacy)
    sessionStore.setItem(STORAGE_KEY, data).catch(() => {})
    localStorage.removeItem(STORAGE_KEY)
  }
} catch { /* ignore */ }

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
  bgRemoved: boolean
  /** Snapshot of src before BG removal, for undo */
  preBgSrc: string | null
  enhanced: boolean
  /** Snapshot of src before enhancement, for undo */
  preEnhanceSrc: string | null
  /** Label describing what enhancement was applied */
  enhanceLabel?: string
  altText: string
  altTextGenerating?: boolean
}

type Mode = "convert" | "crop" | "erase"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageConverter() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>("convert")
  const [quality, setQuality] = useState(80)
  const [outputFormat, setOutputFormat] = useState<"webp" | "png" | "jpeg">("webp")
  const [presetKey, setPresetKey] = useState("")
  const [sessionLoaded, setSessionLoaded] = useState(false)

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

  // Webpage screenshot capture (batch via modal)
  const [captureModalOpen, setCaptureModalOpen] = useState(false)
  const [captureUrlsText, setCaptureUrlsText] = useState("")
  const [captureViewport, setCaptureViewport] = useState<"desktop" | "mobile">("desktop")
  const [captureRunning, setCaptureRunning] = useState(false)
  type CaptureRowStatus = "queued" | "capturing" | "done" | "error"
  interface CaptureRow { id: number; url: string; status: CaptureRowStatus; error?: string }
  const [captureRows, setCaptureRows] = useState<CaptureRow[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const selected = images.find((img) => img.id === selectedId) ?? null

  // Restore session from IndexedDB on mount
  useEffect(() => {
    loadSessionAsync().then((data) => {
      if (data) {
        setImages(data.images)
        setSelectedId(data.selectedId)
        setQuality(data.quality)
      }
      setSessionLoaded(true)
    })
  }, [])

  // Auto-save session to IndexedDB (only after initial load to avoid clobbering)
  useEffect(() => {
    if (!sessionLoaded) return
    saveSession(images, selectedId, quality)
  }, [images, selectedId, quality, sessionLoaded])

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
              bgRemoved: false,
              preBgSrc: null,
              enhanced: false,
              preEnhanceSrc: null,
              altText: "",
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

  const captureBatch = useCallback(async () => {
    // Parse URLs (one per line, trim, drop empties, dedupe, normalize)
    const lines = captureUrlsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const l of lines) {
      const u = /^https?:\/\//i.test(l) ? l : `https://${l}`
      if (seen.has(u)) continue
      seen.add(u)
      normalized.push(u)
    }
    if (normalized.length === 0) return

    // Initial row state
    let nextRowId = (captureRows.at(-1)?.id ?? 0) + 1
    const newRows: CaptureRow[] = normalized.map((u) => ({
      id: nextRowId++,
      url: u,
      status: "queued" as const,
    }))
    setCaptureRows((prev) => [...prev, ...newRows])
    setCaptureRunning(true)

    const updateRow = (id: number, patch: Partial<CaptureRow>) => {
      setCaptureRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    }

    // Concurrency-limited worker pool (3 in flight)
    const CONCURRENCY = 3
    const queue = [...newRows]
    const viewport = captureViewport

    const runOne = async (row: CaptureRow) => {
      updateRow(row.id, { status: "capturing" })

      // Retry helper — first request often fails on Vercel cold start
      // (function boot + screenshot pipeline exceeds gateway timeout).
      const MAX_RETRIES = 2
      let lastError: any = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const headers = await addCsrfHeader({ "Content-Type": "application/json" })
          const resp = await fetch("/api/screenshot", {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ url: row.url, viewport }),
          })
          if (!resp.ok) {
            let msg = `Capture failed (${resp.status})`
            try { const j = await resp.json(); if (j?.error) msg = j.error } catch {}
            throw new Error(msg)
          }
          const blob = await resp.blob()
          const host = (() => {
            try { return new URL(row.url).hostname.replace(/^www\./, "") } catch { return "page" }
          })()
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
          const suffix = viewport === "mobile" ? "-mobile" : ""
          const file = new File([blob], `${host}${suffix}-${ts}.png`, { type: "image/png" })
          addFiles([file])
          updateRow(row.id, { status: "done" })
          return // success — exit retry loop
        } catch (err: any) {
          lastError = err
          // Only retry on network-level failures (cold start timeout),
          // not on server error responses (those won't magically fix themselves)
          const isNetworkError = err instanceof TypeError && /fetch/i.test(err.message)
          const isGatewayTimeout = err?.message?.includes("504")
          if ((isNetworkError || isGatewayTimeout) && attempt < MAX_RETRIES - 1) {
            // Brief pause before retry to let the function warm up
            await new Promise((r) => setTimeout(r, 1500))
            continue
          }
          break
        }
      }
      updateRow(row.id, { status: "error", error: lastError?.message ?? "Capture failed" })
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push((async function worker() {
        while (queue.length > 0) {
          const row = queue.shift()
          if (!row) return
          await runOne(row)
        }
      })())
    }
    await Promise.all(workers)
    setCaptureRunning(false)
    setCaptureUrlsText("")
  }, [captureUrlsText, captureViewport, captureRows, addFiles])

  const clearCaptureHistory = useCallback(() => {
    setCaptureRows([])
  }, [])

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

  // ---- Export helper (supports all formats) ----

  const exportImage = async (
    src: string,
    width: number,
    height: number,
    format: "webp" | "png" | "jpeg",
    q: number
  ): Promise<Blob> => {
    if (format === "webp") return convertToWebP(src, width, height, q)
    const mimeMap = { png: "PNG", jpeg: "JPEG" } as const
    return resizeImage(src, width, height, mimeMap[format])
  }

  const formatExt = { webp: "webp", png: "png", jpeg: "jpg" } as const

  // ---- Download single ----

  const handleDownloadSingle = async () => {
    if (!selected) return
    setConverting(true)
    try {
      const blob = await exportImage(selected.src, selected.outputWidth, selected.outputHeight, outputFormat, quality)
      saveAs(blob, `${stripExtension(selected.fileName)}.${formatExt[outputFormat]}`)
      updateImage(selected.id, { converted: true, convertedSize: blob.size })
    } catch (err) {
      console.error("Conversion failed:", err)
    } finally {
      setConverting(false)
    }
  }

  // ---- Download all (ZIP) ----

  const handleDownloadAll = async () => {
    setConverting(true)
    setConvertProgress(0)
    try {
      const zip = new JSZip()
      for (let i = 0; i < images.length; i++) {
        const img = images[i]!
        const blob = await exportImage(img.src, img.outputWidth, img.outputHeight, outputFormat, quality)
        zip.file(`${stripExtension(img.fileName)}.${formatExt[outputFormat]}`, blob)
        updateImage(img.id, { converted: true, convertedSize: blob.size })
        setConvertProgress(i + 1)
      }
      // Add metadata CSV if any images have alt text
      const hasAnyAlt = images.some((img) => img.altText.trim())
      if (hasAnyAlt) {
        const csvRows = ["Filename,Alt Text,Width,Height,Format"]
        for (const img of images) {
          const fn = `${stripExtension(img.fileName)}.${formatExt[outputFormat]}`
          const escaped = img.altText.replace(/"/g, '""')
          csvRows.push(`"${fn}","${escaped}",${img.outputWidth},${img.outputHeight},${outputFormat.toUpperCase()}`)
        }
        zip.file("metadata.csv", csvRows.join("\n"))
      }
      const zipBlob = await zip.generateAsync({ type: "blob" })
      saveAs(zipBlob, `converted-images-${outputFormat}.zip`)
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

  // ---- Batch rename ----

  const [batchRenameOpen, setBatchRenameOpen] = useState(false)
  const [renamePrefix, setRenamePrefix] = useState("")
  const [renameSeparator, setRenameSeparator] = useState<"-" | "_" | " ">("-")
  const [renameStartNum, setRenameStartNum] = useState(1)
  const [renameZeroPad, setRenameZeroPad] = useState(true)

  const batchRenamePreview = images.map((img, i) => {
    const num = renameStartNum + i
    const digits = renameZeroPad ? String(num).padStart(String(renameStartNum + images.length - 1).length, "0") : String(num)
    const ext = img.fileName.substring(img.fileName.lastIndexOf("."))
    const prefix = renamePrefix.trim()
    if (!prefix) return img.fileName
    return `${prefix}${renameSeparator}${digits}${ext}`
  })

  const handleBatchRenameApply = () => {
    if (!renamePrefix.trim()) return
    const previews = [...batchRenamePreview]
    setImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        fileName: previews[i] ?? img.fileName,
      }))
    )
    setBatchRenameOpen(false)
  }

  const handleBatchRenameReset = () => {
    setRenamePrefix("")
    setRenameStartNum(1)
    setRenameSeparator("-")
    setRenameZeroPad(true)
  }

  // ---- Background removal ----

  const [bgRemoving, setBgRemoving] = useState(false)
  const [bgProgress, setBgProgress] = useState("")
  const [bgError, setBgError] = useState<string | null>(null)

  const handleRemoveBg = async () => {
    if (!selected || bgRemoving) return
    setBgRemoving(true)
    setBgError(null)
    setBgProgress("Loading model...")
    try {
      // Convert data URL to blob without fetch (avoids CSP connect-src restrictions)
      const dataUrl = selected.src
      const [header, base64] = dataUrl.split(",")
      const mimeMatch = header.match(/:(.*?);/)
      const mime = mimeMatch ? mimeMatch[1] : "image/png"
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const inputBlob = new Blob([bytes], { type: mime })

      const resultBlob = await removeBackground(inputBlob, {
        progress: (key: string, current: number, total: number) => {
          if (key === "compute:inference") {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0
            setBgProgress(pct > 0 ? `Removing background... ${pct}%` : "Removing background...")
          } else if (key === "fetch:model") {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0
            setBgProgress(pct > 0 ? `Downloading model... ${pct}%` : "Downloading model...")
          }
        },
      })

      // Convert result blob to data URL
      const reader = new FileReader()
      const resultDataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(resultBlob)
      })

      updateImage(selected.id, {
        preBgSrc: selected.src,
        src: resultDataUrl,
        bgRemoved: true,
        converted: false, // reset converted state since image changed
      })
      // Auto-switch to PNG for transparency
      if (outputFormat === "jpeg") setOutputFormat("png")
    } catch (err: any) {
      console.error("Background removal failed:", err)
      setBgError(err?.message || "Background removal failed")
    } finally {
      setBgRemoving(false)
      setBgProgress("")
    }
  }

  const handleUndoBgRemoval = () => {
    if (!selected || !selected.preBgSrc) return
    const restoredSrc = selected.preBgSrc
    updateImage(selected.id, {
      src: restoredSrc,
      bgRemoved: false,
      preBgSrc: null,
      converted: false,
    })
  }

  // If BG is removed, output must support alpha (PNG or WebP, not JPEG)
  const bgNeedsAlphaWarning = selected?.bgRemoved && selected.originalFormat === "JPG" || selected?.bgRemoved && selected?.originalFormat === "JPEG"

  // ---- AI Enhance / Upscale ----

  const {
    enhance: runEnhance,
    isProcessing: enhancing,
    progress: enhanceProgress,
    status: enhanceStatus,
    error: enhanceError,
  } = useUpscaler()

  const [enhanceOp, setEnhanceOp] = useState("")

  const handleEnhance = async () => {
    if (!selected || enhancing || !enhanceOp) return
    const op = ENHANCE_OPS.find((o) => o.id === enhanceOp)
    if (!op) return

    const result = await runEnhance(selected.src, enhanceOp)
    if (!result) return

    // Measure output dimensions
    const resultImg = new Image()
    await new Promise<void>((resolve) => {
      resultImg.onload = () => resolve()
      resultImg.src = result
    })

    updateImage(selected.id, {
      preEnhanceSrc: selected.src,
      src: result,
      enhanced: true,
      enhanceLabel: op.label,
      naturalWidth: resultImg.naturalWidth,
      naturalHeight: resultImg.naturalHeight,
      outputWidth: resultImg.naturalWidth,
      outputHeight: resultImg.naturalHeight,
      converted: false,
    })
  }

  const handleUndoEnhance = () => {
    if (!selected || !selected.preEnhanceSrc) return
    const prev = selected.preEnhanceSrc
    const img = new Image()
    img.onload = () => {
      updateImage(selected.id, {
        src: prev,
        enhanced: false,
        preEnhanceSrc: null,
        enhanceLabel: undefined,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        outputWidth: img.naturalWidth,
        outputHeight: img.naturalHeight,
        converted: false,
      })
    }
    img.src = prev
  }

  // ---- Inline Magic Eraser ----

  const {
    inpaint,
    inpaintWithTelea,
    isModelReady: eraserModelReady,
    isModelLoading: eraserModelLoading,
    modelProgress: eraserModelProgress,
    preloadModel: eraserPreloadModel,
  } = useInpainting()

  const [eraserBrush, setEraserBrush] = useState(40)
  const [eraserProcessing, setEraserProcessing] = useState(false)
  const [eraserStatus, setEraserStatus] = useState("")
  const [eraserHasStrokes, setEraserHasStrokes] = useState(false)

  const eraserDisplayRef = useRef<HTMLCanvasElement>(null)
  const eraserCursorRef = useRef<HTMLCanvasElement>(null)
  const eraserMaskRef = useRef<HTMLCanvasElement | null>(null)
  const eraserSourceRef = useRef<HTMLCanvasElement | null>(null)
  const eraserNatRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const eraserLastPosRef = useRef<{ x: number; y: number } | null>(null)
  const eraserUndoRef = useRef<string[]>([])
  const eraserDrawingRef = useRef(false)
  const eraserBrushRef = useRef(eraserBrush)
  eraserBrushRef.current = eraserBrush

  // Init eraser canvases when entering erase mode
  useEffect(() => {
    if (mode !== "erase" || !selected) return
    eraserPreloadModel()

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const natW = img.naturalWidth || img.width
      const natH = img.naturalHeight || img.height
      eraserNatRef.current = { w: natW, h: natH }

      const srcCanvas = document.createElement("canvas")
      srcCanvas.width = natW
      srcCanvas.height = natH
      const srcCtx = srcCanvas.getContext("2d")
      if (srcCtx) srcCtx.drawImage(img, 0, 0, natW, natH)
      eraserSourceRef.current = srcCanvas

      const mask = document.createElement("canvas")
      mask.width = natW
      mask.height = natH
      const mCtx = mask.getContext("2d")
      if (mCtx) { mCtx.fillStyle = "#000000"; mCtx.fillRect(0, 0, natW, natH) }
      eraserMaskRef.current = mask

      eraserUndoRef.current = []
      setEraserHasStrokes(false)
      requestAnimationFrame(() => eraserRedraw())
    }
    img.src = selected.src
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected?.id])

  const eraserRedraw = useCallback(() => {
    const canvas = eraserDisplayRef.current
    const src = eraserSourceRef.current
    if (!canvas || !src) return
    const w = canvas.width
    const h = canvas.height
    if (w === 0 || h === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(src, 0, 0, w, h)

    const mask = eraserMaskRef.current
    if (mask) {
      const tmp = document.createElement("canvas")
      tmp.width = w; tmp.height = h
      const tCtx = tmp.getContext("2d")
      if (!tCtx) return
      tCtx.drawImage(mask, 0, 0, w, h)
      const px = tCtx.getImageData(0, 0, w, h)
      for (let i = 0; i < px.data.length; i += 4) {
        if (px.data[i] > 128) {
          px.data[i] = 255; px.data[i + 1] = 56; px.data[i + 2] = 100; px.data[i + 3] = 115
        } else {
          px.data[i + 3] = 0
        }
      }
      tCtx.putImageData(px, 0, 0)
      ctx.drawImage(tmp, 0, 0)
    }

    const cur = eraserCursorRef.current
    if (cur && (cur.width !== w || cur.height !== h)) { cur.width = w; cur.height = h }
  }, [])

  const eraserToMask = useCallback((clientX: number, clientY: number) => {
    const canvas = eraserDisplayRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const nat = eraserNatRef.current
    return { x: ((clientX - rect.left) / rect.width) * nat.w, y: ((clientY - rect.top) / rect.height) * nat.h }
  }, [])

  const eraserDrawOnMask = useCallback((x: number, y: number) => {
    const mask = eraserMaskRef.current
    const canvas = eraserDisplayRef.current
    if (!mask || !canvas) return
    const ctx = mask.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const scaleFactor = eraserNatRef.current.w / rect.width
    const r = (eraserBrushRef.current * scaleFactor) / 2
    ctx.fillStyle = "#ffffff"
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }, [])

  const eraserInterpolate = useCallback((fx: number, fy: number, tx: number, ty: number) => {
    const dx = tx - fx, dy = ty - fy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const canvas = eraserDisplayRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleFactor = eraserNatRef.current.w / rect.width
    const step = Math.max((eraserBrushRef.current * scaleFactor) / 4, 1)
    const steps = Math.ceil(dist / step)
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      eraserDrawOnMask(fx + dx * t, fy + dy * t)
    }
  }, [eraserDrawOnMask])

  const eraserDrawCursor = useCallback((clientX: number, clientY: number) => {
    const canvas = eraserCursorRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Scale from CSS pixels to canvas (natural) pixels
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY
    const bs = eraserBrushRef.current * scaleX
    const lw = 1.5 * scaleX
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = lw
    ctx.beginPath(); ctx.arc(x, y, bs / 2, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = lw * 1.5
    ctx.beginPath(); ctx.arc(x, y, bs / 2 + lw, 0, Math.PI * 2); ctx.stroke()
    const cs = 4 * scaleX
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x - cs, y); ctx.lineTo(x + cs, y); ctx.moveTo(x, y - cs); ctx.lineTo(x, y + cs); ctx.stroke()
  }, [])

  // Dilate + feather mask for smoother inpainting edges
  const prepareMask = useCallback((mask: HTMLCanvasElement): HTMLCanvasElement => {
    const w = mask.width, h = mask.height
    const srcCtx = mask.getContext("2d", { willReadFrequently: true })
    if (!srcCtx) return mask
    const srcData = srcCtx.getImageData(0, 0, w, h).data

    // Step 1: Dilate by 3px — expand mask edges so fill covers boundary artifacts
    const dilateR = 3
    const dilated = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (srcData[(y * w + x) * 4] > 128) {
          for (let dy = -dilateR; dy <= dilateR; dy++) {
            for (let dx = -dilateR; dx <= dilateR; dx++) {
              if (dx * dx + dy * dy <= dilateR * dilateR) {
                const nx = x + dx, ny = y + dy
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) dilated[ny * w + nx] = 255
              }
            }
          }
        }
      }
    }

    // Step 2: Box blur the dilated mask for soft feathered edges (2 passes)
    const blurR = 4
    const temp = new Uint8Array(w * h)
    const blurred = new Uint8Array(w * h)
    // Horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0
        for (let dx = -blurR; dx <= blurR; dx++) {
          const nx = x + dx
          if (nx >= 0 && nx < w) { sum += dilated[y * w + nx]; count++ }
        }
        temp[y * w + x] = sum / count
      }
    }
    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0
        for (let dy = -blurR; dy <= blurR; dy++) {
          const ny = y + dy
          if (ny >= 0 && ny < h) { sum += temp[ny * w + x]; count++ }
        }
        blurred[y * w + x] = sum / count
      }
    }

    // Write back to a new canvas
    const out = document.createElement("canvas")
    out.width = w; out.height = h
    const outCtx = out.getContext("2d")!
    const outData = outCtx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      const v = blurred[i]
      outData.data[i * 4] = v
      outData.data[i * 4 + 1] = v
      outData.data[i * 4 + 2] = v
      outData.data[i * 4 + 3] = 255
    }
    outCtx.putImageData(outData, 0, 0)
    return out
  }, [])

  const eraserApply = useCallback(async () => {
    const src = eraserSourceRef.current
    const mask = eraserMaskRef.current
    if (!src || !mask) return
    const maskCtx = mask.getContext("2d", { willReadFrequently: true })
    if (!maskCtx) return
    const mp = maskCtx.getImageData(0, 0, mask.width, mask.height)
    let hasWhite = false
    for (let i = 0; i < mp.data.length; i += 4) { if (mp.data[i] > 128) { hasWhite = true; break } }
    if (!hasWhite) return

    setEraserProcessing(true)
    eraserUndoRef.current.push(src.toDataURL("image/png"))
    if (eraserUndoRef.current.length > 20) eraserUndoRef.current.shift()

    // Prepare mask with dilation + feathering for smoother results
    const processedMask = prepareMask(mask)

    try {
      let result: string | null = null
      if (eraserModelReady) {
        setEraserStatus("AI erasing...")
        result = await inpaint(src, processedMask)
      } else {
        setEraserStatus(eraserModelLoading ? "Erasing (AI loading...)" : "Erasing...")
        result = inpaintWithTelea(src, processedMask)
      }

      if (result) {
        const newImg = new Image()
        newImg.crossOrigin = "anonymous"
        await new Promise<void>((resolve) => {
          newImg.onload = () => {
            const nat = eraserNatRef.current
            const newSrc = document.createElement("canvas")
            newSrc.width = nat.w; newSrc.height = nat.h
            const ctx = newSrc.getContext("2d")
            if (ctx) ctx.drawImage(newImg, 0, 0, nat.w, nat.h)
            eraserSourceRef.current = newSrc
            const mCtx = mask.getContext("2d")
            if (mCtx) { mCtx.fillStyle = "#000000"; mCtx.fillRect(0, 0, mask.width, mask.height) }
            setEraserHasStrokes(false)
            eraserRedraw()
            resolve()
          }
          newImg.src = result!
        })
        setEraserStatus(eraserModelReady ? "AI erase done" : "Erase done")
        setTimeout(() => setEraserStatus(""), 1200)
      } else {
        setEraserStatus("Failed — try again")
        eraserUndoRef.current.pop()
        setTimeout(() => setEraserStatus(""), 2000)
      }
    } catch {
      setEraserStatus("Error — try again")
      eraserUndoRef.current.pop()
      setTimeout(() => setEraserStatus(""), 3000)
    } finally {
      setEraserProcessing(false)
    }
  }, [eraserModelReady, eraserModelLoading, inpaint, inpaintWithTelea, eraserRedraw])

  const eraserPointerDown = useCallback((e: React.PointerEvent) => {
    if (eraserProcessing) return
    e.preventDefault(); e.stopPropagation()
    eraserDrawingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const pos = eraserToMask(e.clientX, e.clientY)
    eraserDrawOnMask(pos.x, pos.y)
    eraserLastPosRef.current = pos
    setEraserHasStrokes(true)
    eraserRedraw()
  }, [eraserProcessing, eraserToMask, eraserDrawOnMask, eraserRedraw])

  const eraserPointerMove = useCallback((e: React.PointerEvent) => {
    eraserDrawCursor(e.clientX, e.clientY)
    if (!eraserDrawingRef.current) return
    e.preventDefault()
    const pos = eraserToMask(e.clientX, e.clientY)
    if (eraserLastPosRef.current) {
      eraserInterpolate(eraserLastPosRef.current.x, eraserLastPosRef.current.y, pos.x, pos.y)
    } else {
      eraserDrawOnMask(pos.x, pos.y)
    }
    eraserLastPosRef.current = pos
    eraserRedraw()
  }, [eraserToMask, eraserDrawOnMask, eraserInterpolate, eraserRedraw, eraserDrawCursor])

  const eraserPointerUp = useCallback(() => {
    if (!eraserDrawingRef.current) return
    eraserDrawingRef.current = false
    eraserLastPosRef.current = null
    eraserApply()
  }, [eraserApply])

  const eraserUndo = useCallback(async () => {
    if (eraserUndoRef.current.length === 0) return
    const prev = eraserUndoRef.current.pop()!
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve) => {
      img.onload = () => {
        const nat = eraserNatRef.current
        const c = document.createElement("canvas"); c.width = nat.w; c.height = nat.h
        const ctx = c.getContext("2d")
        if (ctx) ctx.drawImage(img, 0, 0, nat.w, nat.h)
        eraserSourceRef.current = c
        if (eraserMaskRef.current) {
          const mCtx = eraserMaskRef.current.getContext("2d")
          if (mCtx) { mCtx.fillStyle = "#000000"; mCtx.fillRect(0, 0, eraserMaskRef.current.width, eraserMaskRef.current.height) }
        }
        setEraserHasStrokes(false)
        eraserRedraw()
        resolve()
      }
      img.src = prev
    })
  }, [eraserRedraw])

  const eraserDone = useCallback(() => {
    if (eraserProcessing || !selected) return
    const src = eraserSourceRef.current
    if (src && eraserUndoRef.current.length > 0) {
      updateImage(selected.id, { src: src.toDataURL("image/png"), converted: false })
    }
    setMode("convert")
  }, [eraserProcessing, selected, updateImage])

  // Eraser keyboard shortcuts
  useEffect(() => {
    if (mode !== "erase") return
    const handler = (e: KeyboardEvent) => {
      if (eraserProcessing) return
      if (e.key === "[") setEraserBrush(s => Math.max(5, s - 8))
      if (e.key === "]") setEraserBrush(s => Math.min(200, s + 8))
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); eraserUndo() }
      if (e.key === "Escape") { e.preventDefault(); eraserDone() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode, eraserProcessing, eraserUndo, eraserDone])

  // ---- Alt text ----

  const generateAltText = useCallback(async (imageId: number) => {
    const img = images.find((i) => i.id === imageId)
    if (!img) return
    updateImage(imageId, { altTextGenerating: true })
    try {
      // Resize to max 512px for faster API call
      const imgEl = new Image()
      imgEl.crossOrigin = "anonymous"
      await new Promise<void>((resolve) => { imgEl.onload = () => resolve(); imgEl.src = img.src })
      const maxDim = 512
      const scale = Math.min(maxDim / imgEl.naturalWidth, maxDim / imgEl.naturalHeight, 1)
      const w = Math.round(imgEl.naturalWidth * scale)
      const h = Math.round(imgEl.naturalHeight * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(imgEl, 0, 0, w, h)
      const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1]

      const res = await fetch("/api/ai/alt-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/csrf-token=([^;]+)/)?.[1] || "" },
        body: JSON.stringify({ image: base64 }),
      })
      if (!res.ok) throw new Error("Failed to generate alt text")
      const data = await res.json()
      updateImage(imageId, { altText: data.altText || "", altTextGenerating: false })
    } catch (err) {
      console.error("Alt text generation failed:", err)
      updateImage(imageId, { altTextGenerating: false })
    }
  }, [images, updateImage])

  const convertedCount = images.filter((img) => img.converted).length

  // ---- Multi-size export ----

  interface ExportSize {
    id: number
    w: number
    h: number
    label: string
  }

  const [multiSizeOpen, setMultiSizeOpen] = useState(false)
  const [exportSizes, setExportSizes] = useState<ExportSize[]>([])
  const exportSizeNextId = useRef(0)

  const addExportSize = (w: number, h: number, label: string) => {
    setExportSizes((prev) => [...prev, { id: exportSizeNextId.current++, w, h, label }])
  }

  const removeExportSize = (id: number) => {
    setExportSizes((prev) => prev.filter((s) => s.id !== id))
  }

  const addExportSizeFromPreset = (key: string) => {
    if (!key) return
    for (const group of PRESET_GROUPS) {
      for (const p of group.presets) {
        if (buildPresetKey(group.label, p.label) === key) {
          addExportSize(p.width, p.height, `${group.label} ${p.label}`)
          return
        }
      }
    }
  }

  const handleDownloadMultiSize = async () => {
    if (!selected || exportSizes.length === 0) return
    setConverting(true)
    setConvertProgress(0)
    try {
      const zip = new JSZip()
      const baseName = stripExtension(selected.fileName)
      const ext = formatExt[outputFormat]

      // First: include the current output size
      const mainBlob = await exportImage(selected.src, selected.outputWidth, selected.outputHeight, outputFormat, quality)
      zip.file(`${baseName}-${selected.outputWidth}x${selected.outputHeight}.${ext}`, mainBlob)
      setConvertProgress(1)

      // Then: each additional size
      for (let i = 0; i < exportSizes.length; i++) {
        const s = exportSizes[i]
        const blob = await exportImage(selected.src, s.w, s.h, outputFormat, quality)
        zip.file(`${baseName}-${s.w}x${s.h}.${ext}`, blob)
        setConvertProgress(i + 2)
      }

      const zipBlob = await zip.generateAsync({ type: "blob" })
      saveAs(zipBlob, `${baseName}-multi-size.zip`)
      updateImage(selected.id, { converted: true })
    } catch (err) {
      console.error("Multi-size export failed:", err)
    } finally {
      setConverting(false)
      setConvertProgress(0)
    }
  }

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
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Image Toolkit
              </h1>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                Convert, crop, enhance, erase &amp; remove backgrounds
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setCaptureModalOpen(true)}
              className="h-9 px-3.5 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
            >
              <Globe size={14} className="mr-1.5" />
              Capture from URL
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            {/* LEFT — Preview / Drop zone + Filmstrip */}
            <div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {selected ? (
                  <>
                    {/* Preview toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                          {selected.fileName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">
                          {selected.originalFormat}
                        </span>
                        {selected.bgRemoved && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                            BG Removed
                          </span>
                        )}
                        {selected.enhanced && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                            {selected.enhanceLabel || "Enhanced"}
                          </span>
                        )}
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
                        {selected.enhanced && (
                          <button
                            onClick={handleUndoEnhance}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            <Undo2 size={13} />
                            Undo Enhance
                          </button>
                        )}
                        {selected.bgRemoved && (
                          <button
                            onClick={handleUndoBgRemoval}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                          >
                            <Undo2 size={13} />
                            Restore BG
                          </button>
                        )}
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
                    ) : mode === "erase" ? (
                      <div
                        className="relative flex items-center justify-center bg-[#f0f0f0] dark:bg-slate-950"
                        style={{ maxHeight: 520 }}
                      >
                        <div
                          className="relative"
                          style={{
                            aspectRatio: `${selected.naturalWidth} / ${selected.naturalHeight}`,
                            maxHeight: 500,
                            maxWidth: "100%",
                            boxShadow: "0 0 0 2px rgba(236, 72, 153, 0.4)",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <canvas
                            ref={eraserDisplayRef}
                            width={selected.naturalWidth}
                            height={selected.naturalHeight}
                            className="w-full h-full block pointer-events-none"
                          />
                          <canvas
                            ref={eraserCursorRef}
                            width={selected.naturalWidth}
                            height={selected.naturalHeight}
                            onPointerDown={eraserPointerDown}
                            onPointerMove={eraserPointerMove}
                            onPointerUp={eraserPointerUp}
                            onPointerLeave={() => {
                              const c = eraserCursorRef.current
                              if (c) { const ctx = c.getContext("2d"); if (ctx) ctx.clearRect(0, 0, c.width, c.height) }
                            }}
                            className="absolute inset-0 w-full h-full touch-none"
                            style={{ cursor: eraserProcessing ? "wait" : "none", pointerEvents: eraserProcessing ? "none" : "auto" }}
                          />
                          {/* Eraser processing overlay */}
                          {eraserProcessing && (
                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 pointer-events-none">
                              <Loader2 size={20} className="text-pink-500 animate-spin" />
                              <span className="text-[11px] font-medium text-white">{eraserStatus}</span>
                            </div>
                          )}
                          {/* No overlays — hints moved to right panel */}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="relative flex items-center justify-center"
                        style={selected.bgRemoved ? {
                          backgroundImage: "repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%)",
                          backgroundSize: "16px 16px",
                        } : {
                          backgroundColor: "#f0f0f0",
                        }}
                      >
                        <img
                          src={selected.src}
                          alt="Preview"
                          className="max-w-full block relative z-[1]"
                          style={{
                            maxHeight: 500,
                            ...(selected.cropApplied ? {
                              boxShadow: "inset 0 0 0 2px rgba(16, 185, 129, 0.3)",
                            } : {}),
                          }}
                        />
                        {/* Enhance processing overlay */}
                        {enhancing && (
                          <div className="absolute inset-0 z-[2] overflow-hidden rounded-lg" style={{ isolation: "isolate" }}>
                            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" style={{ willChange: "auto" }} />
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                willChange: "transform",
                                top: 0, bottom: 0, left: "-50%", width: "50%",
                                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)",
                                animation: "shimmer-sweep 1.8s ease-in-out infinite",
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-[2px] pointer-events-none"
                              style={{
                                willChange: "transform", transform: "translateZ(0)",
                                background: "linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.6) 30%, rgba(59,130,246,0.9) 50%, rgba(59,130,246,0.6) 70%, transparent 100%)",
                                boxShadow: "0 0 12px 4px rgba(59,130,246,0.3)",
                                animation: "scan-line 2.2s ease-in-out infinite",
                              }}
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none" style={{ willChange: "transform", transform: "translateZ(0)" }}>
                              <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20" style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}>
                                <Wand2 size={16} className="text-white" />
                              </div>
                              <span className="text-[13px] font-medium text-white drop-shadow-lg">
                                {enhanceStatus || "Enhancing..."}
                              </span>
                              {enhanceProgress > 0 && enhanceProgress < 100 && (
                                <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-white/80 rounded-full transition-all duration-300"
                                    style={{ width: `${enhanceProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* BG removal processing overlay — GPU-composited shimmer */}
                        {bgRemoving && (
                          <div className="absolute inset-0 z-[2] overflow-hidden rounded-lg" style={{ isolation: "isolate" }}>
                            {/* Frosted base — separate layer */}
                            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" style={{ willChange: "auto" }} />
                            {/* Shimmer sweep — GPU layer, uses transform not background-position */}
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                willChange: "transform",
                                top: 0,
                                bottom: 0,
                                left: "-50%",
                                width: "50%",
                                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)",
                                animation: "shimmer-sweep 1.8s ease-in-out infinite",
                              }}
                            />
                            {/* Scanning line — GPU layer */}
                            <div
                              className="absolute top-0 bottom-0 w-[2px] pointer-events-none"
                              style={{
                                willChange: "transform",
                                transform: "translateZ(0)",
                                background: "linear-gradient(180deg, transparent 0%, rgba(168,85,247,0.6) 30%, rgba(168,85,247,0.9) 50%, rgba(168,85,247,0.6) 70%, transparent 100%)",
                                boxShadow: "0 0 12px 4px rgba(168,85,247,0.3)",
                                animation: "scan-line 2.2s ease-in-out infinite",
                              }}
                            />
                            {/* Status — separate compositing layer */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none" style={{ willChange: "transform", transform: "translateZ(0)" }}>
                              <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20" style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}>
                                <Sparkles size={16} className="text-white" />
                              </div>
                              <span className="text-[13px] font-medium text-white drop-shadow-lg">
                                {bgProgress || "Removing background..."}
                              </span>
                            </div>
                          </div>
                        )}
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
                  </>
                ) : (
                  /* Drop zone when no image selected */
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center py-20 gap-4 rounded-xl
                      ${isDragging
                        ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700"
                      }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center">
                      <Upload size={24} className="text-emerald-500 dark:text-emerald-400" strokeWidth={1.5} />
                    </div>
                    <div className="text-center">
                      <p className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
                        Drop images here or click to browse
                      </p>
                      <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
                        PNG, JPEG, GIF, BMP, TIFF &mdash; select multiple
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
                )}

                  {/* Filmstrip — inside left column so it hugs the image */}
                  {images.length > 0 && (
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
                          {img.enhanced && !img.converted && !img.cropApplied && !img.bgRemoved && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <Wand2 size={9} className="text-white" strokeWidth={3} />
                            </div>
                          )}
                          {img.bgRemoved && !img.converted && !img.cropApplied && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                              <Sparkles size={9} className="text-white" strokeWidth={3} />
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
                      <div className="flex items-center gap-3">
                        {images.length > 1 && (
                          <button
                            onClick={() => { setBatchRenameOpen(!batchRenameOpen); handleBatchRenameReset() }}
                            className={`text-[11px] font-medium transition-colors flex items-center gap-1 ${
                              batchRenameOpen
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400"
                            }`}
                          >
                            <TextCursorInput size={11} />
                            Batch Rename
                          </button>
                        )}
                        <button
                          onClick={handleClearAll}
                          className="text-[11px] text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={11} />
                          Clear all
                        </button>
                      </div>
                    </div>

                    {/* Batch Rename Panel */}
                    {batchRenameOpen && images.length > 1 && (
                      <div className="mt-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <TextCursorInput size={14} className="text-emerald-500" />
                            <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                              Batch Rename
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {images.length} files
                            </span>
                          </div>
                          <button
                            onClick={() => setBatchRenameOpen(false)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="p-4 space-y-4">
                          {/* Pattern builder */}
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
                            <div>
                              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                                Name
                              </label>
                              <input
                                type="text"
                                value={renamePrefix}
                                onChange={(e) => setRenamePrefix(e.target.value)}
                                placeholder="e.g. campus-tour"
                                autoFocus
                                className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                                Sep
                              </label>
                              <div className="flex h-9 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                {(["-", "_", " "] as const).map((sep) => (
                                  <button
                                    key={sep}
                                    onClick={() => setRenameSeparator(sep)}
                                    className={`w-9 h-full text-[13px] font-mono transition-colors ${
                                      renameSeparator === sep
                                        ? "bg-emerald-500 text-white"
                                        : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                                    }`}
                                  >
                                    {sep === " " ? "␣" : sep}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                                Start
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={renameStartNum}
                                onChange={(e) => setRenameStartNum(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-16 h-9 px-2 text-[13px] text-center font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                              />
                            </div>
                          </div>

                          {/* Options row */}
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={renameZeroPad}
                                onChange={(e) => setRenameZeroPad(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500/30"
                              />
                              <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Hash size={11} />
                                Zero-pad numbers
                              </span>
                            </label>
                          </div>

                          {/* Live preview */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Eye size={11} className="text-slate-400" />
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Preview
                              </span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50 max-h-[140px] overflow-y-auto">
                              {images.map((img, i) => (
                                <div
                                  key={img.id}
                                  className={`flex items-center gap-3 px-3 py-1.5 text-[12px] ${
                                    i !== images.length - 1 ? "border-b border-slate-100 dark:border-slate-700/30" : ""
                                  }`}
                                >
                                  <img src={img.src} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                                  <span className="text-slate-400 dark:text-slate-500 truncate flex-1 font-mono">
                                    {img.fileName}
                                  </span>
                                  <ArrowRightLeft size={10} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                                  <span className={`truncate flex-1 font-mono font-medium text-right ${
                                    renamePrefix.trim()
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-slate-300 dark:text-slate-600"
                                  }`}>
                                    {batchRenamePreview[i]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleBatchRenameApply}
                              disabled={!renamePrefix.trim()}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                              <Check size={14} />
                              Rename {images.length} Files
                            </button>
                            <button
                              onClick={handleBatchRenameReset}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                              <RotateCcw size={12} />
                              Reset
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
              </div>
            </div>

              {/* RIGHT — Controls or Features */}
              {selected ? (
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
                          {selected.cropApplied ? "Re-crop" : "Crop"}
                        </button>
                        <button
                          onClick={() => setMode("erase")}
                          className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                            ${mode === "erase"
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                          <Eraser size={14} />
                          Erase
                        </button>
                      </div>
                    </div>

                    {/* Background Removal */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles size={12} />
                          Background
                        </Label>
                        {selected.bgRemoved && (
                          <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400 flex items-center gap-1">
                            <Check size={10} />
                            Removed
                          </span>
                        )}
                      </div>
                      {selected.bgRemoved ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50">
                            <Check size={13} className="text-purple-500 flex-shrink-0" />
                            <span className="text-[12px] font-medium text-purple-700 dark:text-purple-300">
                              Background removed
                            </span>
                            <button
                              onClick={handleUndoBgRemoval}
                              className="ml-auto text-[11px] font-medium text-purple-500 dark:text-purple-400 hover:underline"
                            >
                              Restore
                            </button>
                          </div>
                          {bgNeedsAlphaWarning && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                              <AlertCircle size={11} />
                              Use WebP or PNG to preserve transparency
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={handleRemoveBg}
                            disabled={bgRemoving}
                            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[13px] font-medium bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white shadow-sm shadow-purple-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                          >
                            {bgRemoving ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                {bgProgress || "Processing..."}
                              </>
                            ) : (
                              <>
                                <Sparkles size={14} />
                                Remove Background
                              </>
                            )}
                          </button>
                          {bgError && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1.5">
                              <AlertCircle size={11} />
                              {bgError}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                            Runs locally — no upload, no API cost
                          </p>
                        </div>
                      )}
                    </div>

                    {/* AI Enhance / Upscale */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Wand2 size={12} />
                          AI Enhance
                        </Label>
                        {selected.enhanced && (
                          <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400 flex items-center gap-1">
                            <Check size={10} />
                            {selected.enhanceLabel || "Enhanced"}
                          </span>
                        )}
                      </div>

                      {selected.enhanced ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                            <Check size={13} className="text-blue-500 flex-shrink-0" />
                            <span className="text-[12px] font-medium text-blue-700 dark:text-blue-300">
                              {selected.enhanceLabel || "Enhanced"}
                            </span>
                            <button
                              onClick={handleUndoEnhance}
                              className="ml-auto text-[11px] font-medium text-blue-500 dark:text-blue-400 hover:underline"
                            >
                              Undo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Select value={enhanceOp} onValueChange={setEnhanceOp}>
                            <SelectTrigger className="w-full text-[13px]">
                              <SelectValue placeholder="Choose enhancement..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Upscale</SelectLabel>
                                {ENHANCE_OPS.filter((o) => o.category === "upscale").map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {o.label} — {o.desc}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>Quality Fix</SelectLabel>
                                {ENHANCE_OPS.filter((o) => o.category === "enhance").map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {o.label} — {o.desc}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>

                          <button
                            onClick={handleEnhance}
                            disabled={!enhanceOp || enhancing}
                            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[13px] font-medium
                                       bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600
                                       text-white shadow-sm shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                          >
                            {enhancing ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                {enhanceStatus || `Enhancing... ${enhanceProgress}%`}
                              </>
                            ) : (
                              <>
                                <Wand2 size={14} />
                                {enhanceOp
                                  ? ENHANCE_OPS.find((o) => o.id === enhanceOp)?.label || "Enhance"
                                  : "Select & Enhance"}
                              </>
                            )}
                          </button>

                          {enhancing && enhanceProgress > 0 && (
                            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${enhanceProgress}%` }}
                              />
                            </div>
                          )}

                          {enhanceError && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1.5">
                              <AlertCircle size={11} />
                              {enhanceError}
                            </p>
                          )}

                          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                            Runs locally — no upload, no API cost
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Eraser controls (shown in erase mode) */}
                    {mode === "erase" && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-pink-200 dark:border-pink-800/50 shadow-sm p-4 space-y-3">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Eraser size={12} />
                          Brush Size
                        </Label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEraserBrush(s => Math.max(5, s - 8))} className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            <Minus size={13} />
                          </button>
                          <input
                            type="range" min={5} max={200} value={eraserBrush}
                            onChange={(e) => setEraserBrush(parseInt(e.target.value, 10))}
                            className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:cursor-pointer"
                          />
                          <span className="text-[12px] font-mono text-slate-500 w-8 text-right">{eraserBrush}</span>
                          <button onClick={() => setEraserBrush(s => Math.min(200, s + 8))} className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            <Plus size={13} />
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={eraserUndo}
                            disabled={eraserUndoRef.current.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 disabled:opacity-40 transition-colors"
                          >
                            <Undo2 size={13} />
                            Undo
                          </button>
                          <button
                            onClick={eraserDone}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-pink-500 text-white hover:bg-pink-600 transition-colors"
                          >
                            <Check size={13} />
                            Done Erasing
                          </button>
                        </div>

                        {/* AI status */}
                        {eraserModelLoading && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <Loader2 size={12} className="text-pink-500 animate-spin" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Downloading AI model... {eraserModelProgress}%</span>
                          </div>
                        )}
                        {eraserModelReady && !eraserModelLoading && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50">
                            <Zap size={12} className="text-green-500" />
                            <span className="text-[11px] font-medium text-green-700 dark:text-green-400">AI Ready</span>
                          </div>
                        )}

                        {/* Status toast */}
                        {eraserStatus && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-50 dark:bg-pink-950/30">
                            <span className="text-[11px] text-pink-600 dark:text-pink-400">{eraserStatus}</span>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
                          Paint on image to erase &middot; <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px]">[</kbd> <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px]">]</kbd> brush size &middot; <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px]">Esc</kbd> done
                        </p>
                      </div>
                    )}

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

                    {/* Output Format */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                        Output Format
                      </Label>
                      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        {(["png", "webp", "jpeg"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => setOutputFormat(fmt)}
                            className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-all ${
                              outputFormat === fmt
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                          >
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      {selected.bgRemoved && outputFormat === "jpeg" && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-2">
                          <AlertCircle size={11} />
                          JPEG doesn't support transparency
                        </p>
                      )}
                    </div>

                    {/* Quality (only for lossy formats) */}
                    {outputFormat !== "png" && (
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
                    )}

                    {/* Alt Text */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileImage size={12} />
                          Alt Text
                        </Label>
                        <button
                          onClick={() => generateAltText(selected.id)}
                          disabled={selected.altTextGenerating}
                          className="text-[11px] font-medium text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
                        >
                          {selected.altTextGenerating ? (
                            <><Loader2 size={10} className="animate-spin" /> Generating...</>
                          ) : (
                            <><Sparkles size={10} /> AI Generate</>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={selected.altText}
                        onChange={(e) => updateImage(selected.id, { altText: e.target.value })}
                        placeholder="Describe this image for accessibility..."
                        rows={2}
                        className="w-full text-[12px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all"
                      />
                      {selected.altText && (
                        <p className="text-[10px] text-slate-400 mt-1">{selected.altText.length} characters</p>
                      )}
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
                          {outputFormat.toUpperCase()}
                        </span>
                        {selected.converted && selected.convertedSize != null && (
                          <>
                            <span className="text-slate-400 dark:text-slate-500">Output size</span>
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

                    {/* Download */}
                    <div className="space-y-2">
                      <Button
                        onClick={handleDownloadSingle}
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
                            Download as {outputFormat.toUpperCase()}
                          </span>
                        )}
                      </Button>

                      {/* Multi-size export */}
                      <button
                        onClick={() => setMultiSizeOpen(!multiSizeOpen)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                      >
                        <Copy size={11} />
                        Export multiple sizes{exportSizes.length > 0 && ` (${exportSizes.length})`}
                        <ChevronDown
                          size={11}
                          className={`transition-transform duration-200 ${multiSizeOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {multiSizeOpen && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          {/* Size list */}
                          {exportSizes.length > 0 && (
                            <div className="space-y-1.5">
                              {exportSizes.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-mono font-medium text-slate-700 dark:text-slate-300">
                                      {s.w}×{s.h}
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                      {s.label}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => removeExportSize(s.id)}
                                    className="text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add from preset */}
                          <Select value="" onValueChange={addExportSizeFromPreset}>
                            <SelectTrigger className="w-full text-[12px] h-8">
                              <SelectValue placeholder="Add size from preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {PRESET_GROUPS.map((group) => (
                                <SelectGroup key={group.label}>
                                  <SelectLabel>{group.label}</SelectLabel>
                                  {group.presets.map((p) => {
                                    const key = buildPresetKey(group.label, p.label)
                                    return (
                                      <SelectItem key={key} value={key}>
                                        {p.label} — {p.width}×{p.height}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Manual size input */}
                          <div className="flex gap-1.5 items-end">
                            <div className="flex-1">
                              <Input
                                id="ms-w"
                                type="number"
                                min={1}
                                placeholder="W"
                                className="text-[12px] h-8"
                              />
                            </div>
                            <span className="pb-1.5 text-slate-300 dark:text-slate-600 text-[11px]">×</span>
                            <div className="flex-1">
                              <Input
                                id="ms-h"
                                type="number"
                                min={1}
                                placeholder="H"
                                className="text-[12px] h-8"
                              />
                            </div>
                            <button
                              onClick={() => {
                                const wEl = document.getElementById("ms-w") as HTMLInputElement
                                const hEl = document.getElementById("ms-h") as HTMLInputElement
                                const w = parseInt(wEl?.value) || 0
                                const h = parseInt(hEl?.value) || 0
                                if (w > 0 && h > 0) {
                                  addExportSize(w, h, "Custom")
                                  wEl.value = ""
                                  hEl.value = ""
                                }
                              }}
                              className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          {/* Download multi-size ZIP */}
                          {exportSizes.length > 0 && (
                            <Button
                              onClick={handleDownloadMultiSize}
                              disabled={converting}
                              className="w-full h-9 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-sm transition-all text-[13px]"
                            >
                              {converting && convertProgress > 0 ? (
                                <span className="flex items-center gap-2">
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Exporting {convertProgress}/{exportSizes.length + 1}...
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <Archive size={14} />
                                  Download {exportSizes.length + 1} sizes as ZIP
                                </span>
                              )}
                            </Button>
                          )}
                        </div>
                      )}

                      {images.length > 1 && (
                        <Button
                          onClick={handleDownloadAll}
                          disabled={converting}
                          variant="outline"
                          className="w-full h-10 rounded-xl font-medium"
                        >
                          {converting && convertProgress > 0 && !multiSizeOpen ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                              Converting {convertProgress}/{images.length}...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Archive size={15} />
                              Download All as ZIP ({images.length})
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
              ) : (
                /* Right panel — empty state features */
                <div className="space-y-3">
                  {[
                    { icon: <Zap size={16} />, color: "text-amber-500", title: "Convert", desc: "PNG, JPEG, WebP output with quality control" },
                    { icon: <Crop size={16} />, color: "text-violet-500", title: "Crop & Resize", desc: "Visual cropper + social media presets" },
                    { icon: <Wand2 size={16} />, color: "text-blue-500", title: "AI Enhance", desc: "Upscale, denoise, deblur & retouch — all local" },
                    { icon: <Eraser size={16} />, color: "text-pink-500", title: "Magic Eraser", desc: "AI-powered object removal — paint to erase" },
                    { icon: <Sparkles size={16} />, color: "text-purple-500", title: "Remove Background", desc: "One-click, runs locally — no API cost" },
                    { icon: <Layers size={16} />, color: "text-emerald-500", title: "Batch Export", desc: "Convert all images at once as ZIP" },
                    { icon: <TextCursorInput size={16} />, color: "text-sky-500", title: "Batch Rename", desc: "Pattern-based naming with live preview" },
                  ].map((f) => (
                    <div key={f.title} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 flex items-start gap-3">
                      <span className={`mt-0.5 ${f.color}`}>{f.icon}</span>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{f.title}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </main>

      {/* Capture-from-URL modal */}
      {captureModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !captureRunning) setCaptureModalOpen(false)
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm shadow-blue-500/20">
                  <Globe size={16} className="text-white" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Capture webpages
                  </h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Paste a list of URLs — we'll grab a full-page screenshot of each
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (!captureRunning) setCaptureModalOpen(false) }}
                disabled={captureRunning}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Viewport toggle */}
              <div>
                <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  Viewport
                </Label>
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCaptureViewport("desktop")}
                    disabled={captureRunning}
                    className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                      ${captureViewport === "desktop"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                  >
                    <MonitorSmartphone size={14} />
                    Desktop
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">1280×800</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureViewport("mobile")}
                    disabled={captureRunning}
                    className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                      ${captureViewport === "mobile"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                  >
                    <MonitorSmartphone size={14} className="rotate-90" />
                    Mobile
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">390×844</span>
                  </button>
                </div>
              </div>

              {/* URL textarea */}
              <div>
                <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  URLs <span className="lowercase">(one per line)</span>
                </Label>
                <textarea
                  value={captureUrlsText}
                  onChange={(e) => setCaptureUrlsText(e.target.value)}
                  disabled={captureRunning}
                  rows={6}
                  placeholder={"https://example.com\nhttps://stamats.com\nhttps://coe.edu/admission"}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-[13px] font-mono text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y disabled:opacity-50"
                />
              </div>

              {/* Status list */}
              {captureRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Captures
                    </Label>
                    {!captureRunning && (
                      <button
                        type="button"
                        onClick={clearCaptureHistory}
                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        Clear history
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {captureRows.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="w-4 h-4 flex-shrink-0">
                          {row.status === "queued" && (
                            <div className="w-2 h-2 mt-1 ml-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                          )}
                          {row.status === "capturing" && (
                            <Loader2 size={14} className="text-blue-500 animate-spin" />
                          )}
                          {row.status === "done" && (
                            <Check size={14} className="text-emerald-500" strokeWidth={3} />
                          )}
                          {row.status === "error" && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-mono text-slate-600 dark:text-slate-300 truncate">
                            {row.url}
                          </p>
                          {row.status === "error" && row.error && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 truncate">
                              {row.error}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider font-medium flex-shrink-0
                          ${row.status === "done" ? "text-emerald-500" :
                            row.status === "error" ? "text-red-500" :
                            row.status === "capturing" ? "text-blue-500" :
                            "text-slate-400"}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Up to 3 captures run in parallel · images stream into the toolkit as they finish
              </p>
              <Button
                type="button"
                onClick={captureBatch}
                disabled={captureRunning || !captureUrlsText.trim()}
                className="h-9 px-4 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
              >
                {captureRunning ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" />
                    Capturing
                  </>
                ) : (
                  <>
                    <ImageDown size={13} className="mr-1.5" />
                    Capture all
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shimmer animation keyframes */}
      <style>{`
        @keyframes shimmer-sweep {
          0% { transform: translateX(-100%) translateZ(0); }
          100% { transform: translateX(400%) translateZ(0); }
        }
        @keyframes scan-line {
          0% { transform: translateX(-50vw) translateZ(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(100vw) translateZ(0); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
