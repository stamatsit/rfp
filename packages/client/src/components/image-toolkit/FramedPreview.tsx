import { useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, SplitSquareHorizontal } from "lucide-react"
import {
  canvasCanDraw,
  computeFrameLayout,
  drawFrame,
  loadFrameImage,
  type FrameOutputFormat,
  type FrameSettings,
} from "@/lib/imageFrame"

export type PreviewBackdrop = "white" | "gray" | "dark"

/** Preview only. What sits behind a transparent file on screen, never in the file. */
export const BACKDROP_COLORS: Record<PreviewBackdrop, string> = {
  white: "#ffffff",
  gray: "#9aa3af",
  dark: "#1e293b",
}

const BACKDROP_LABELS: Record<PreviewBackdrop, string> = {
  white: "White",
  gray: "Gray",
  dark: "Dark",
}

const PREVIEW_MAX_HEIGHT = 500
const PREVIEW_PADDING = 16
/** Very large photos draw from a smaller copy so sliders stay smooth. */
const PROXY_MAX_SIDE = 1600

interface PreviewSource {
  full: HTMLImageElement
  proxy: CanvasImageSource
  proxyWidth: number
  proxyHeight: number
}

function buildPreviewSource(full: HTMLImageElement): PreviewSource {
  const { naturalWidth: width, naturalHeight: height } = full
  const longSide = Math.max(width, height)
  if (longSide <= PROXY_MAX_SIDE) {
    return { full, proxy: full, proxyWidth: width, proxyHeight: height }
  }
  const ratio = PROXY_MAX_SIDE / longSide
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext("2d")
  if (!ctx) return { full, proxy: full, proxyWidth: width, proxyHeight: height }
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height)
  return { full, proxy: canvas, proxyWidth: canvas.width, proxyHeight: canvas.height }
}

interface FramedPreviewProps {
  src: string
  alt: string
  outputWidth: number
  outputHeight: number
  settings: FrameSettings
  fixedSize: boolean
  format: FrameOutputFormat
  actualSize: boolean
  comparing: boolean
  /** The 100% view needs a full-size canvas, which a browser can refuse. */
  onActualSizeUnavailable: () => void
}

/**
 * Draws with the same code as the export, so what people dial in is what they
 * get. Everything scales together, so a border at 40% zoom matches the file.
 */
export function FramedPreview({
  src,
  alt,
  outputWidth,
  outputHeight,
  settings,
  fixedSize,
  format,
  actualSize,
  comparing,
  onActualSizeUnavailable,
}: FramedPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [source, setSource] = useState<PreviewSource | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)

  useEffect(() => {
    let alive = true
    setSource(null)
    loadFrameImage(src)
      .then((image) => { if (alive) setSource(buildPreviewSource(image)) })
      .catch((err) => console.error("Preview failed to load:", err))
    return () => { alive = false }
  }, [src])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(entry.contentRect.width)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    if (!source) return null
    return computeFrameLayout({
      sourceWidth: actualSize ? source.full.naturalWidth : source.proxyWidth,
      sourceHeight: actualSize ? source.full.naturalHeight : source.proxyHeight,
      outputWidth,
      outputHeight,
      settings,
      fixedSize,
      format,
    })
  }, [source, actualSize, outputWidth, outputHeight, settings, fixedSize, format])

  const displayScale = !layout
    ? 1
    : actualSize
      ? 1
      : Math.min(
          1,
          Math.max(1, availableWidth) / layout.fileWidth,
          (PREVIEW_MAX_HEIGHT - PREVIEW_PADDING * 2) / layout.fileHeight
        )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source || !layout || availableWidth === 0) return
    const frameId = requestAnimationFrame(() => {
      const ratio = actualSize ? 1 : window.devicePixelRatio || 1
      // Never draw more pixels than the file has. It would only waste time.
      const drawScale = Math.min(1, displayScale * ratio)
      const width = Math.max(1, Math.round(layout.fileWidth * drawScale))
      const height = Math.max(1, Math.round(layout.fileHeight * drawScale))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      if (actualSize && !canvasCanDraw(canvas, ctx)) {
        onActualSizeUnavailable()
        return
      }
      ctx.clearRect(0, 0, width, height)
      drawFrame(ctx, actualSize ? source.full : source.proxy, layout, {
        scale: drawScale,
        plain: comparing,
      })
    })
    return () => cancelAnimationFrame(frameId)
  }, [source, layout, actualSize, displayScale, availableWidth, comparing, onActualSizeUnavailable])

  return (
    <div
      ref={rootRef}
      className={`w-full min-w-0 flex ${actualSize ? "overflow-auto" : "justify-center"}`}
      style={{ maxHeight: PREVIEW_MAX_HEIGHT, padding: PREVIEW_PADDING }}
      tabIndex={actualSize ? 0 : undefined}
      data-testid="framed-preview"
    >
      {layout ? (
        <canvas
          // A canvas that was refused a full-size buffer can stay broken, so each view gets its own.
          key={actualSize ? "actual" : "fit"}
          ref={canvasRef}
          role="img"
          aria-label={comparing ? `${alt}, without border or shadow` : `${alt}, with border and shadow`}
          className="block m-auto flex-shrink-0"
          style={{
            width: layout.fileWidth * displayScale,
            height: layout.fileHeight * displayScale,
          }}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          className="block m-auto max-w-full"
          style={{ maxHeight: PREVIEW_MAX_HEIGHT - PREVIEW_PADDING * 2 }}
        />
      )}
    </div>
  )
}

interface PreviewControlsProps {
  backdrop: PreviewBackdrop
  onBackdropChange: (backdrop: PreviewBackdrop) => void
  actualSize: boolean
  onActualSizeChange: (actualSize: boolean) => void
  comparing: boolean
  onComparingChange: (comparing: boolean) => void
}

export function PreviewControls({
  backdrop,
  onBackdropChange,
  actualSize,
  onActualSizeChange,
  comparing,
  onComparingChange,
}: PreviewControlsProps) {
  const smallButton =
    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
  const idle =
    "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
  const active = "bg-emerald-500 text-white"

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span id="preview-backdrop-label" className="text-[11px] text-slate-400 dark:text-slate-500">
          Preview on
        </span>
        <div role="radiogroup" aria-labelledby="preview-backdrop-label" className="flex items-center gap-1.5">
          {(Object.keys(BACKDROP_COLORS) as PreviewBackdrop[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={backdrop === key}
              aria-label={BACKDROP_LABELS[key]}
              title={BACKDROP_LABELS[key]}
              onClick={() => onBackdropChange(key)}
              className={`w-6 h-6 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                backdrop === key
                  ? "border-emerald-500 ring-2 ring-emerald-500/40"
                  : "border-slate-300 dark:border-slate-600"
              }`}
              style={{ backgroundColor: BACKDROP_COLORS[key] }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          aria-pressed={comparing}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            onComparingChange(true)
          }}
          onPointerUp={() => onComparingChange(false)}
          onPointerCancel={() => onComparingChange(false)}
          onLostPointerCapture={() => onComparingChange(false)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault()
              onComparingChange(true)
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") onComparingChange(false)
          }}
          onBlur={() => onComparingChange(false)}
          onContextMenu={(e) => e.preventDefault()}
          className={`${smallButton} touch-none select-none ${comparing ? active : idle}`}
        >
          <SplitSquareHorizontal size={13} />
          Hold to compare
        </button>
        <button
          type="button"
          aria-pressed={actualSize}
          onClick={() => onActualSizeChange(!actualSize)}
          className={`${smallButton} ${actualSize ? active : idle}`}
        >
          <Maximize2 size={13} />
          100%
        </button>
      </div>
    </div>
  )
}
