import { describe, it, expect } from "vitest"
import {
  downscaleSteps,
  drawDownscaled,
  shrinkSource,
  type DownscaleContext,
  type StepCanvas,
} from "./downscale"

interface Draw {
  from: unknown
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
  quality: string
  smoothing: boolean
}

/** A context that records each draw along with the smoothing in force at the time. */
function fakeContext(draws: Draw[]) {
  const ctx = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    drawImage(from: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
      draws.push({ from, sx, sy, sw, sh, dx, dy, dw, dh, quality: ctx.imageSmoothingQuality, smoothing: ctx.imageSmoothingEnabled })
    },
  }
  return ctx as unknown as DownscaleContext
}

/** Stands in for the browser: hands out working canvases and remembers them. */
function fakeCanvases(options: { refuseAbove?: number } = {}) {
  const draws: Draw[] = []
  const made: Array<{ name: string; width: number; height: number; released: boolean }> = []
  const refused: Array<{ width: number; height: number }> = []
  const create = (width: number, height: number): StepCanvas | null => {
    if (options.refuseAbove !== undefined && width * height > options.refuseAbove) {
      refused.push({ width, height })
      return null
    }
    const record = { name: `step${made.length + 1}`, width, height, released: false }
    made.push(record)
    return {
      source: record.name as unknown as CanvasImageSource,
      ctx: fakeContext(draws),
      release: () => {
        record.released = true
      },
    }
  }
  return { create, draws, made, refused }
}

const photo = "photo" as unknown as CanvasImageSource

/** The largest reduction any single draw makes on the way from source to target. */
function biggestJump(sw: number, sh: number, tw: number, th: number): number {
  const sizes = [{ width: sw, height: sh }, ...downscaleSteps(sw, sh, tw, th), { width: tw, height: th }]
  let worst = 0
  for (let i = 1; i < sizes.length; i++) {
    worst = Math.max(worst, sizes[i - 1]!.width / sizes[i]!.width, sizes[i - 1]!.height / sizes[i]!.height)
  }
  return worst
}

describe("downscaleSteps", () => {
  it("halves an 8192 wide crop twice on the way to 1920", () => {
    expect(downscaleSteps(8192, 3507, 1920, 822)).toEqual([
      { width: 4096, height: 1754 },
      { width: 2048, height: 877 },
    ])
  })

  it("never asks a single draw to shrink more than 2x", () => {
    const cases: Array<[number, number, number, number]> = [
      [8192, 3507, 1920, 822],
      [8192, 4603, 655, 368],
      [11000, 4709, 1920, 822],
      [6001, 3371, 655, 368],
      [9999, 7777, 170, 170],
    ]
    for (const [sw, sh, tw, th] of cases) {
      expect(biggestJump(sw, sh, tw, th)).toBeLessThanOrEqual(2)
    }
  })

  it("adds no steps when the reduction is already 2x or less", () => {
    expect(downscaleSteps(3840, 2160, 1920, 1080)).toEqual([])
    expect(downscaleSteps(2500, 1400, 1920, 1075)).toEqual([])
  })

  it("adds no steps for the same size or an enlargement", () => {
    expect(downscaleSteps(1920, 822, 1920, 822)).toEqual([])
    expect(downscaleSteps(800, 600, 1600, 1200)).toEqual([])
  })

  it("halves only the side that needs it when the shape changes", () => {
    expect(downscaleSteps(8000, 1000, 1000, 1000)).toEqual([
      { width: 4000, height: 1000 },
      { width: 2000, height: 1000 },
    ])
  })

  it("adds no steps for a size that cannot be drawn", () => {
    expect(downscaleSteps(8192, 5464, 0, 0)).toEqual([])
    expect(downscaleSteps(8192, 5464, Number.NaN, 368)).toEqual([])
    expect(downscaleSteps(0, 0, 1920, 822)).toEqual([])
  })
})

describe("shrinkSource", () => {
  const crop = { x: 0, y: 978, width: 8192, height: 3507 }

  it("reads the crop from the photo first, then each step from the one before", () => {
    const { create, draws } = fakeCanvases()
    shrinkSource(photo, crop, 1920, 822, create)
    expect(draws).toHaveLength(2)
    expect(draws[0]).toMatchObject({ from: "photo", sx: 0, sy: 978, sw: 8192, sh: 3507, dx: 0, dy: 0, dw: 4096, dh: 1754 })
    expect(draws[1]).toMatchObject({ from: "step1", sx: 0, sy: 0, sw: 4096, sh: 1754, dx: 0, dy: 0, dw: 2048, dh: 877 })
  })

  it("smooths every step at the browser's best setting", () => {
    const { create, draws } = fakeCanvases()
    shrinkSource(photo, { x: 0, y: 430, width: 8192, height: 4603 }, 655, 368, create)
    expect(draws).toHaveLength(3)
    for (const draw of draws) {
      expect(draw.smoothing).toBe(true)
      expect(draw.quality).toBe("high")
    }
  })

  it("hands back the last step, within 2x of the target", () => {
    const { create } = fakeCanvases()
    const shrunk = shrinkSource(photo, crop, 1920, 822, create)
    expect(shrunk.image).toBe("step2")
    expect(shrunk).toMatchObject({ x: 0, y: 0, width: 2048, height: 877 })
  })

  it("frees each working canvas once the next one has been drawn from it", () => {
    const { create, made } = fakeCanvases()
    const shrunk = shrinkSource(photo, crop, 1920, 822, create)
    expect(made.map((c) => c.released)).toEqual([true, false])
    shrunk.release()
    expect(made.map((c) => c.released)).toEqual([true, true])
  })

  it("leaves the photo alone when no step is needed", () => {
    const { create, made, draws } = fakeCanvases()
    const small = { x: 10, y: 20, width: 2400, height: 1028 }
    const shrunk = shrinkSource(photo, small, 1920, 822, create)
    expect(shrunk.image).toBe(photo)
    expect(shrunk).toMatchObject(small)
    expect(made).toHaveLength(0)
    expect(draws).toHaveLength(0)
    expect(() => shrunk.release()).not.toThrow()
  })

  it("skips a step the browser cannot hold instead of exporting a blank", () => {
    // 4096x1754 is refused, as an iPhone refuses a canvas past its cap.
    const { create, draws, refused } = fakeCanvases({ refuseAbove: 5_000_000 })
    const shrunk = shrinkSource(photo, crop, 1920, 822, create)
    expect(refused).toEqual([{ width: 4096, height: 1754 }])
    expect(draws).toHaveLength(1)
    expect(draws[0]).toMatchObject({ from: "photo", sy: 978, sw: 8192, sh: 3507, dw: 2048, dh: 877, quality: "high" })
    expect(shrunk.image).toBe("step1")
    expect(shrunk).toMatchObject({ width: 2048, height: 877 })
  })

  it("falls back to the photo itself when no working canvas can be made", () => {
    const { create, draws } = fakeCanvases({ refuseAbove: 0 })
    const shrunk = shrinkSource(photo, crop, 1920, 822, create)
    expect(draws).toHaveLength(0)
    expect(shrunk.image).toBe(photo)
    expect(shrunk).toMatchObject(crop)
  })
})

describe("drawDownscaled", () => {
  it("finishes with one smoothed draw into the requested place", () => {
    const { create, draws: stepDraws } = fakeCanvases()
    const finalDraws: Draw[] = []
    const ctx = fakeContext(finalDraws)
    drawDownscaled(ctx, photo, { x: 0, y: 978, width: 8192, height: 3507 }, { x: 0, y: 0, width: 1920, height: 822 }, create)
    expect(stepDraws).toHaveLength(2)
    expect(finalDraws).toEqual([
      { from: "step2", sx: 0, sy: 0, sw: 2048, sh: 877, dx: 0, dy: 0, dw: 1920, dh: 822, quality: "high", smoothing: true },
    ])
  })

  it("is a single plain draw when the photo is already near the target", () => {
    const { create, made } = fakeCanvases()
    const finalDraws: Draw[] = []
    drawDownscaled(fakeContext(finalDraws), photo, { x: 0, y: 0, width: 1920, height: 822 }, { x: 0, y: 0, width: 1920, height: 822 }, create)
    expect(made).toHaveLength(0)
    expect(finalDraws).toHaveLength(1)
    expect(finalDraws[0]).toMatchObject({ from: "photo", sw: 1920, sh: 822, dw: 1920, dh: 822 })
  })

  it("frees every working canvas when it is done", () => {
    const { create, made } = fakeCanvases()
    drawDownscaled(fakeContext([]), photo, { x: 0, y: 430, width: 8192, height: 4603 }, { x: 0, y: 0, width: 655, height: 368 }, create)
    expect(made).toHaveLength(3)
    expect(made.every((c) => c.released)).toBe(true)
  })
})
