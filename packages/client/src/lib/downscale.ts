/**
 * Clean downscaling for the Image Toolkit.
 *
 * A canvas draw reads only a few source pixels for each output pixel. Past a 2x
 * reduction it skips the rest, so noise and fine texture that should average
 * away get sampled instead and come out as grain. Halving in steps keeps every
 * draw at 2x or less, which is what resizing by hand in two passes was doing.
 */

export interface Size {
  width: number
  height: number
}

export interface SourceRect {
  x: number
  y: number
  width: number
  height: number
}

/** The subset of the canvas API the downscaler needs. */
export type DownscaleContext = Pick<
  CanvasRenderingContext2D,
  "drawImage" | "imageSmoothingEnabled" | "imageSmoothingQuality"
>

/** A working canvas for one step. */
export interface StepCanvas {
  source: CanvasImageSource
  ctx: DownscaleContext
  /** Gives the canvas memory back. Browsers are slow to do it on their own. */
  release(): void
}

/** Makes a working canvas, or returns null when the browser cannot hold one that size. */
export type StepCanvasFactory = (width: number, height: number) => StepCanvas | null

/** What to draw from for the final draw: the picture, or a smaller copy of it. */
export interface ShrunkSource extends SourceRect {
  image: CanvasImageSource
  /** Frees the working canvas. Does nothing when the picture was not shrunk. */
  release(): void
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

const usable = (n: number) => Number.isFinite(n) && n > 0

/**
 * The sizes to pass through so that no single draw, the final one included,
 * shrinks either side by more than 2x. Empty when one draw is already enough.
 */
export function downscaleSteps(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Size[] {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(usable)) return []
  const steps: Size[] = []
  let width = sourceWidth
  let height = sourceHeight
  for (;;) {
    const nextWidth = width > targetWidth * 2 ? Math.ceil(width / 2) : width
    const nextHeight = height > targetHeight * 2 ? Math.ceil(height / 2) : height
    if (nextWidth === width && nextHeight === height) return steps
    width = nextWidth
    height = nextHeight
    steps.push({ width, height })
  }
}

function createStepCanvas(width: number, height: number): StepCanvas | null {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const release = () => {
    canvas.width = 0
    canvas.height = 0
  }
  const ctx = canvas.getContext("2d")
  if (!ctx || !canvasCanDraw(canvas, ctx)) {
    release()
    return null
  }
  return { source: canvas, ctx, release }
}

/**
 * Shrinks the part of the picture inside `source` until it is within 2x of the
 * target, ready for one final draw. A step the browser cannot hold is skipped,
 * so the worst case is the single draw this replaces, never a blank file.
 */
export function shrinkSource(
  image: CanvasImageSource,
  source: SourceRect,
  targetWidth: number,
  targetHeight: number,
  createCanvas: StepCanvasFactory = createStepCanvas
): ShrunkSource {
  let current: ShrunkSource = { image, x: source.x, y: source.y, width: source.width, height: source.height, release: () => {} }
  for (const step of downscaleSteps(source.width, source.height, targetWidth, targetHeight)) {
    const canvas = createCanvas(step.width, step.height)
    if (!canvas) continue
    canvas.ctx.imageSmoothingEnabled = true
    canvas.ctx.imageSmoothingQuality = "high"
    canvas.ctx.drawImage(
      current.image,
      current.x, current.y, current.width, current.height,
      0, 0, step.width, step.height
    )
    current.release()
    current = { image: canvas.source, x: 0, y: 0, width: step.width, height: step.height, release: canvas.release }
  }
  return current
}

/** Draws the part of the picture inside `source` into `dest`, stepping down first when the reduction is large. */
export function drawDownscaled(
  ctx: DownscaleContext,
  image: CanvasImageSource,
  source: SourceRect,
  dest: SourceRect,
  createCanvas?: StepCanvasFactory
): void {
  const shrunk = shrinkSource(image, source, dest.width, dest.height, createCanvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(
    shrunk.image,
    shrunk.x, shrunk.y, shrunk.width, shrunk.height,
    dest.x, dest.y, dest.width, dest.height
  )
  shrunk.release()
}
