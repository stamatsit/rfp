/**
 * White border and drop shadow for the Image Toolkit.
 *
 * The effect is a per-image setting, never part of the image's `src`, so crop,
 * erase, enhance and background removal keep working on the clean picture and
 * turning a switch off is the undo. The preview and every export path draw
 * through `computeFrameLayout` and `drawFrame`, so the file matches the preview.
 */

export type BorderUnit = "percent" | "px"
export type FrameFit = "auto" | "grow" | "exact"
export type FrameBackground = "auto" | "transparent" | "white"
export type FrameOutputFormat = "webp" | "png" | "jpeg"

export interface FrameSettings {
  borderOn: boolean
  /** Percent of the short side, or pixels, depending on `borderUnit`. */
  borderSize: number
  borderUnit: BorderUnit
  shadowOn: boolean
  /** Percent of the short side. */
  shadowSoftness: number
  /** Percent of the short side. */
  shadowDistance: number
  /** 0 to 100. */
  shadowDarkness: number
  /** Degrees clockwise from straight up, so 180 falls straight down. */
  shadowDirection: number
  fit: FrameFit
  background: FrameBackground
}

export const BORDER_PRESETS = [
  { label: "Thin", size: 2 },
  { label: "Medium", size: 4 },
  { label: "Thick", size: 8 },
] as const

export const SHADOW_PRESETS = [
  { label: "Subtle", softness: 2, distance: 0.5, darkness: 22 },
  { label: "Soft", softness: 4, distance: 1.5, darkness: 32 },
  { label: "Lifted", softness: 8, distance: 3, darkness: 42 },
] as const

export const DEFAULT_FRAME: FrameSettings = {
  borderOn: false,
  borderSize: 4,
  borderUnit: "percent",
  shadowOn: false,
  shadowSoftness: 4,
  shadowDistance: 1.5,
  shadowDarkness: 32,
  shadowDirection: 180,
  fit: "auto",
  background: "auto",
}

/** A typed pixel border can be large, but not large enough to break a canvas. */
export const MAX_BORDER_PX = 2000

/** The tight layer under the main shadow is what makes it read as real depth. */
const CONTACT_BLUR = 0.25
const CONTACT_DISTANCE = 0.35
const CONTACT_ALPHA = 0.6

/**
 * Canvas blur is a Gaussian with sigma = blur / 2, so 1.5 x blur is three sigma.
 * Past that the shadow rounds to zero in 8-bit alpha, so it never gets cut off.
 */
const SHADOW_REACH = 1.5

/** At a fixed file size, border and shadow may take this much of each side. */
const MAX_EFFECT_SHARE = 0.4

const JPEG_QUALITY = 0.92

export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ShadowLayer {
  offsetX: number
  offsetY: number
  blur: number
  alpha: number
}

export interface FrameLayout {
  fit: "grow" | "exact"
  fileWidth: number
  fileHeight: number
  /** Outer edge of the border. Equals `image` when there is no border. */
  frame: FrameRect
  /** Where the picture lands in the file, always in whole pixels. */
  image: FrameRect
  /** The part of the source picture to draw, centered, never stretched. */
  source: FrameRect
  border: number
  margin: number
  background: "transparent" | "white"
  shadows: ShadowLayer[]
}

export interface FrameLayoutInput {
  sourceWidth: number
  sourceHeight: number
  /** Picture size when growing the canvas, file size when keeping an exact size. */
  outputWidth: number
  outputHeight: number
  settings: FrameSettings
  /** The image was sized by a preset, so "auto" keeps that exact size. */
  fixedSize?: boolean
  format?: FrameOutputFormat
  /** Multi-size export promises each named size, so it always keeps it exactly. */
  forceExact?: boolean
}

export function isFrameActive(settings: FrameSettings): boolean {
  return settings.borderOn || settings.shadowOn
}

/** Rebuilds settings from possibly old or partial saved data. */
export function normalizeFrame(saved?: Partial<FrameSettings> | null): FrameSettings {
  return { ...DEFAULT_FRAME, ...(saved ?? {}) }
}

/** Pixels the shadow needs on each side. Ignores floating point noise when rounding up. */
function shadowMargin(blur: number, distance: number): number {
  return Math.max(0, Math.ceil(blur * SHADOW_REACH + distance - 1e-9))
}

export function computeFrameLayout(input: FrameLayoutInput): FrameLayout {
  const { settings, format } = input
  const sourceWidth = Math.max(1, input.sourceWidth)
  const sourceHeight = Math.max(1, input.sourceHeight)
  const outputWidth = Math.max(1, Math.round(input.outputWidth))
  const outputHeight = Math.max(1, Math.round(input.outputHeight))
  const basis = Math.min(outputWidth, outputHeight)

  const fit: "grow" | "exact" = input.forceExact
    ? "exact"
    : settings.fit === "auto"
      ? input.fixedSize ? "exact" : "grow"
      : settings.fit

  let border = 0
  if (settings.borderOn) {
    const raw = settings.borderUnit === "px"
      ? Math.min(settings.borderSize, MAX_BORDER_PX)
      : (basis * settings.borderSize) / 100
    border = Math.max(1, Math.round(raw))
  }

  let blur = settings.shadowOn ? (basis * settings.shadowSoftness) / 100 : 0
  let distance = settings.shadowOn ? (basis * settings.shadowDistance) / 100 : 0
  let margin = shadowMargin(blur, distance)

  let fileWidth: number
  let fileHeight: number
  let imageWidth: number
  let imageHeight: number

  if (fit === "exact") {
    // The file size is the promise, so the effect has to fit inside it and
    // always leave a visible picture, however large the settings are.
    const budget = Math.floor(basis * MAX_EFFECT_SHARE)
    if (border + margin > budget) {
      const shrink = budget / (border + margin)
      border = settings.borderOn ? Math.min(budget, Math.max(1, Math.floor(border * shrink))) : 0
      blur *= shrink
      distance *= shrink
      margin = Math.min(budget - border, shadowMargin(blur, distance))
    }
    fileWidth = outputWidth
    fileHeight = outputHeight
    imageWidth = Math.max(1, outputWidth - 2 * (border + margin))
    imageHeight = Math.max(1, outputHeight - 2 * (border + margin))
  } else {
    imageWidth = outputWidth
    imageHeight = outputHeight
    fileWidth = outputWidth + 2 * (border + margin)
    fileHeight = outputHeight + 2 * (border + margin)
  }

  // Equal borders can change the shape of the space the picture sits in. Trim
  // the picture, centered, to fit rather than stretching it.
  const coverScale = Math.max(imageWidth / sourceWidth, imageHeight / sourceHeight)
  const sourceCropWidth = imageWidth / coverScale
  const sourceCropHeight = imageHeight / coverScale

  const background: "transparent" | "white" =
    format === "jpeg"
      ? "white"
      : settings.background === "auto"
        ? fit === "exact" ? "white" : "transparent"
        : settings.background

  const shadows: ShadowLayer[] = []
  if (settings.shadowOn && settings.shadowDarkness > 0) {
    const radians = (settings.shadowDirection * Math.PI) / 180
    const dirX = Math.sin(radians)
    const dirY = -Math.cos(radians)
    const alpha = Math.min(1, settings.shadowDarkness / 100)
    shadows.push(
      { offsetX: dirX * distance, offsetY: dirY * distance, blur, alpha },
      {
        offsetX: dirX * distance * CONTACT_DISTANCE,
        offsetY: dirY * distance * CONTACT_DISTANCE,
        blur: blur * CONTACT_BLUR,
        alpha: alpha * CONTACT_ALPHA,
      }
    )
  }

  return {
    fit,
    fileWidth,
    fileHeight,
    frame: {
      x: margin,
      y: margin,
      width: imageWidth + 2 * border,
      height: imageHeight + 2 * border,
    },
    image: { x: margin + border, y: margin + border, width: imageWidth, height: imageHeight },
    source: {
      x: (sourceWidth - sourceCropWidth) / 2,
      y: (sourceHeight - sourceCropHeight) / 2,
      width: sourceCropWidth,
      height: sourceCropHeight,
    },
    border,
    margin,
    background,
    shadows,
  }
}

/** The subset of the canvas API `drawFrame` needs. */
export type FrameContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "fillRect"
  | "drawImage"
  | "fillStyle"
  | "shadowColor"
  | "shadowBlur"
  | "shadowOffsetX"
  | "shadowOffsetY"
  | "imageSmoothingEnabled"
  | "imageSmoothingQuality"
>

export interface DrawFrameOptions {
  /** Pixels on the canvas per pixel in the file. The preview draws below 1. */
  scale?: number
  /** Draw only the picture in its final position, for hold to compare. */
  plain?: boolean
}

export function drawFrame(
  ctx: FrameContext,
  image: CanvasImageSource,
  layout: FrameLayout,
  options: DrawFrameOptions = {}
): void {
  const scale = options.scale ?? 1
  const { frame, image: imageRect, source } = layout
  const hasBorder = layout.border > 0

  const drawPicture = (shiftX = 0) => {
    ctx.drawImage(
      image,
      source.x, source.y, source.width, source.height,
      imageRect.x * scale - shiftX, imageRect.y * scale,
      imageRect.width * scale, imageRect.height * scale
    )
  }
  const fillFrame = (shiftX = 0) => {
    ctx.fillRect(
      frame.x * scale - shiftX, frame.y * scale,
      frame.width * scale, frame.height * scale
    )
  }

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  if (options.plain) {
    drawPicture()
    ctx.restore()
    return
  }

  if (layout.background === "white") {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, layout.fileWidth * scale, layout.fileHeight * scale)
  }

  // Cast each shadow from a shape parked off the canvas, so only the shadow
  // lands here. Drawing a cutout once per layer would harden its soft edges.
  // Canvas shadow values ignore transforms, so they are scaled by hand.
  const parkedAt = Math.ceil(layout.fileWidth * scale) + 16
  for (const shadow of layout.shadows) {
    ctx.save()
    ctx.shadowColor = `rgba(0, 0, 0, ${shadow.alpha})`
    ctx.shadowBlur = shadow.blur * scale
    ctx.shadowOffsetX = shadow.offsetX * scale + parkedAt
    ctx.shadowOffsetY = shadow.offsetY * scale
    if (hasBorder) {
      ctx.fillStyle = "#000000"
      fillFrame(parkedAt)
    } else {
      drawPicture(parkedAt)
    }
    ctx.restore()
  }

  if (hasBorder) {
    ctx.fillStyle = "#ffffff"
    fillFrame()
  }
  drawPicture()
  ctx.restore()
}

export function loadFrameImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Could not read the image"))
    image.src = src
  })
}

const FORMAT_MIME: Record<FrameOutputFormat, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
}

/**
 * Browsers cap canvas size, and iPhones cap it low. Past the cap many of them
 * stop drawing without raising any error, which would export a blank file, so
 * prove the far corner can be drawn before relying on the canvas.
 */
export function canvasCanDraw(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
  const x = canvas.width - 1
  const y = canvas.height - 1
  try {
    ctx.save()
    ctx.fillStyle = "#000000"
    ctx.fillRect(x, y, 1, 1)
    ctx.restore()
    const alpha = ctx.getImageData(x, y, 1, 1).data[3]
    ctx.clearRect(x, y, 1, 1)
    return alpha === 255
  } catch {
    return false
  }
}

function tooLargeMessage(width: number, height: number): string {
  return `This file would be ${width}×${height}, which is too large for this browser to create. Try smaller output dimensions, or a smaller border or shadow.`
}

export interface RenderFrameOptions {
  src: string
  outputWidth: number
  outputHeight: number
  settings: FrameSettings
  fixedSize?: boolean
  forceExact?: boolean
  format: FrameOutputFormat
  /** 1 to 100. Used for WebP. JPEG matches the unframed export at a fixed 92%. */
  quality: number
}

export async function renderFrameToBlob(options: RenderFrameOptions): Promise<Blob> {
  const image = await loadFrameImage(options.src)
  const layout = computeFrameLayout({
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight,
    settings: options.settings,
    fixedSize: options.fixedSize,
    forceExact: options.forceExact,
    format: options.format,
  })
  const canvas = document.createElement("canvas")
  canvas.width = layout.fileWidth
  canvas.height = layout.fileHeight
  const ctx = canvas.getContext("2d")
  if (!ctx || !canvasCanDraw(canvas, ctx)) {
    throw new Error(tooLargeMessage(layout.fileWidth, layout.fileHeight))
  }
  drawFrame(ctx, image, layout)
  const quality = options.format === "webp"
    ? options.quality / 100
    : options.format === "jpeg" ? JPEG_QUALITY : undefined
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(tooLargeMessage(layout.fileWidth, layout.fileHeight)))),
      FORMAT_MIME[options.format],
      quality
    )
  })
}

/** Brightness (0 to 255) above which a pixel reads as white next to a white border. */
const BRIGHT_PIXEL = 235
/** Share of the outer edge that has to be bright before the border gets lost. */
const BRIGHT_EDGE_SHARE = 0.6

/** True when enough of the picture's outer edge would blend into a white border. */
export function isEdgeBright(pixels: ArrayLike<number>, width: number, height: number): boolean {
  let edge = 0
  let bright = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue
      const i = (y * width + x) * 4
      edge++
      const luma = 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!
      if (pixels[i + 3]! > 200 && luma >= BRIGHT_PIXEL) bright++
    }
  }
  return edge > 0 && bright / edge >= BRIGHT_EDGE_SHARE
}

/** Samples a small copy of the picture, which is plenty for an edge check. */
export async function measureEdgeBright(src: string): Promise<boolean> {
  const image = await loadFrameImage(src)
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(image, 0, 0, size, size)
  return isEdgeBright(ctx.getImageData(0, 0, size, size).data, size, size)
}

const LAST_FRAME_KEY = "image-toolkit-last-frame"

/** The slider values a new image starts with. Its switches always start off. */
export function loadLastFrame(): FrameSettings {
  try {
    const saved = localStorage.getItem(LAST_FRAME_KEY)
    if (saved) {
      return {
        ...normalizeFrame(JSON.parse(saved) as Partial<FrameSettings>),
        borderOn: false,
        shadowOn: false,
        fit: "auto",
        background: "auto",
      }
    }
  } catch {
    // Blocked or malformed storage just means starting from the defaults.
  }
  return { ...DEFAULT_FRAME }
}

export function saveLastFrame(settings: FrameSettings): void {
  try {
    localStorage.setItem(LAST_FRAME_KEY, JSON.stringify(settings))
  } catch {
    // Remembering settings is a convenience, so failing to is not an error.
  }
}
