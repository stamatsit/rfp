import { describe, it, expect } from "vitest"
import {
  DEFAULT_FRAME,
  MAX_BORDER_PX,
  computeFrameLayout,
  drawFrame,
  isEdgeBright,
  isFrameActive,
  normalizeFrame,
  type FrameContext,
  type FrameLayoutInput,
  type FrameSettings,
} from "./imageFrame"

const border = (size: number, extra: Partial<FrameSettings> = {}): FrameSettings => ({
  ...DEFAULT_FRAME,
  borderOn: true,
  borderSize: size,
  ...extra,
})

const shadow = (extra: Partial<FrameSettings> = {}): FrameSettings => ({
  ...DEFAULT_FRAME,
  shadowOn: true,
  ...extra,
})

function layoutOf(width: number, height: number, settings: FrameSettings, rest: Partial<FrameLayoutInput> = {}) {
  return computeFrameLayout({
    sourceWidth: width,
    sourceHeight: height,
    outputWidth: width,
    outputHeight: height,
    settings,
    ...rest,
  })
}

describe("isFrameActive", () => {
  it("is off by default, so an untouched image exports exactly as before", () => {
    expect(isFrameActive(DEFAULT_FRAME)).toBe(false)
  })

  it("is on with either switch", () => {
    expect(isFrameActive(border(4))).toBe(true)
    expect(isFrameActive(shadow())).toBe(true)
  })
})

describe("normalizeFrame", () => {
  it("fills in sessions saved before this feature existed", () => {
    expect(normalizeFrame(undefined)).toEqual(DEFAULT_FRAME)
    expect(normalizeFrame({ borderOn: true }).shadowDirection).toBe(DEFAULT_FRAME.shadowDirection)
  })
})

describe("growing the canvas", () => {
  it("adds the border outside the picture without cropping or resampling it", () => {
    const layout = layoutOf(1000, 800, border(5))
    expect(layout.fit).toBe("grow")
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1080, 880])
    expect(layout.image).toEqual({ x: 40, y: 40, width: 1000, height: 800 })
    expect(layout.source).toEqual({ x: 0, y: 0, width: 1000, height: 800 })
  })

  it("sizes percent borders from the short side, portrait or landscape", () => {
    expect(layoutOf(1000, 800, border(5)).border).toBe(40)
    expect(layoutOf(800, 1000, border(5)).border).toBe(40)
  })

  it("uses an exact pixel border when one is typed", () => {
    const layout = layoutOf(1000, 800, border(20, { borderUnit: "px" }))
    expect(layout.border).toBe(20)
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1040, 840])
  })

  it("caps a typed pixel border", () => {
    expect(layoutOf(1000, 800, border(999999, { borderUnit: "px" })).border).toBe(MAX_BORDER_PX)
  })

  it("never lets a border round away to nothing", () => {
    expect(layoutOf(20, 20, border(0.5)).border).toBe(1)
  })
})

describe("keeping an exact size", () => {
  it("is the default once a preset sized the image", () => {
    const layout = layoutOf(1080, 1080, border(4), { fixedSize: true })
    expect(layout.fit).toBe("exact")
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1080, 1080])
  })

  it("lets the person's choice override the default in both directions", () => {
    expect(layoutOf(1080, 1080, border(4, { fit: "grow" }), { fixedSize: true }).fit).toBe("grow")
    expect(layoutOf(1080, 1080, border(4, { fit: "exact" })).fit).toBe("exact")
  })

  it("trims the picture to keep the border even, and never stretches it", () => {
    const layout = layoutOf(1200, 628, border(20, { borderUnit: "px" }), { fixedSize: true })
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1200, 628])
    expect(layout.image).toEqual({ x: 20, y: 20, width: 1160, height: 588 })
    expect(layout.source.width / layout.source.height).toBeCloseTo(1160 / 588, 6)
    // About 3% of the picture's height comes off, split evenly top and bottom.
    expect(1 - layout.source.height / 628).toBeCloseTo(0.031, 2)
    expect(layout.source.y).toBeCloseTo((628 - layout.source.height) / 2, 6)
  })

  it("always leaves a visible picture, however extreme the settings", () => {
    const layout = layoutOf(1000, 1000, border(50, {
      shadowOn: true,
      shadowSoftness: 15,
      shadowDistance: 10,
    }), { fixedSize: true })
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1000, 1000])
    expect(layout.image.width).toBeGreaterThanOrEqual(200)
    expect(layout.image.height).toBeGreaterThanOrEqual(200)
  })

  it("is forced for multi-size export, even when the image is set to grow", () => {
    const layout = computeFrameLayout({
      sourceWidth: 1000,
      sourceHeight: 1000,
      outputWidth: 1200,
      outputHeight: 628,
      settings: border(4, { fit: "grow" }),
      forceExact: true,
    })
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1200, 628])
    expect(layout.source.width / layout.source.height).toBeCloseTo(layout.image.width / layout.image.height, 6)
  })
})

describe("drop shadow", () => {
  it("makes room for itself so it never gets cut off", () => {
    const layout = layoutOf(1000, 800, border(5, {
      shadowOn: true,
      shadowSoftness: 5, // blur 40
      shadowDistance: 1.5, // distance 12
    }))
    expect(layout.margin).toBe(72)
    expect([layout.fileWidth, layout.fileHeight]).toEqual([1224, 1024])
  })

  it("is not pushed up a pixel by floating point noise", () => {
    // 1080 at Soft computes to 81.00000000000001 before rounding up.
    expect(layoutOf(1080, 1080, shadow()).margin).toBe(81)
  })

  it("keeps the framed picture centered in the file", () => {
    const layout = layoutOf(1000, 800, border(5, { shadowOn: true }))
    expect(layout.frame.x).toBe(layout.fileWidth - layout.frame.x - layout.frame.width)
    expect(layout.frame.y).toBe(layout.fileHeight - layout.frame.y - layout.frame.height)
  })

  it("falls in the chosen direction", () => {
    const at = (shadowDirection: number) => layoutOf(1000, 1000, shadow({ shadowDirection })).shadows[0]!
    expect(at(180).offsetX).toBeCloseTo(0, 6)
    expect(at(180).offsetY).toBeCloseTo(15, 6)
    expect(at(90).offsetX).toBeCloseTo(15, 6)
    expect(at(90).offsetY).toBeCloseTo(0, 6)
    expect(at(0).offsetY).toBeCloseTo(-15, 6)
  })

  it("stacks a wide layer and a tight contact layer", () => {
    const [wide, contact] = layoutOf(1000, 1000, shadow()).shadows
    expect(contact!.blur).toBeLessThan(wide!.blur)
    expect(contact!.alpha).toBeLessThan(wide!.alpha)
  })

  it("casts nothing at zero darkness or when switched off", () => {
    expect(layoutOf(1000, 1000, shadow({ shadowDarkness: 0 })).shadows).toEqual([])
    expect(layoutOf(1000, 1000, border(4)).shadows).toEqual([])
    expect(layoutOf(1000, 1000, border(4)).margin).toBe(0)
  })
})

describe("file background", () => {
  it("defaults to transparent when growing and white at an exact size", () => {
    expect(layoutOf(1000, 800, shadow()).background).toBe("transparent")
    expect(layoutOf(1080, 1080, shadow(), { fixedSize: true }).background).toBe("white")
  })

  it("respects an explicit choice", () => {
    expect(layoutOf(1000, 800, shadow({ background: "white" })).background).toBe("white")
    expect(layoutOf(1080, 1080, shadow({ background: "transparent" }), { fixedSize: true }).background).toBe("transparent")
  })

  it("is always white for JPEG, which cannot be transparent", () => {
    expect(layoutOf(1000, 800, shadow({ background: "transparent" }), { format: "jpeg" }).background).toBe("white")
  })
})

describe("layout invariants", () => {
  it("holds across sizes, settings and fit modes", () => {
    const sizes = [[640, 480], [333, 777], [1200, 628], [4032, 3024], [100, 100], [1080, 1920], [37, 91]] as const
    const fits = ["grow", "exact"] as const
    for (const [width, height] of sizes) {
      for (const borderSize of [0.5, 2, 4, 8, 15]) {
        for (const shadowSoftness of [0, 2, 8, 15]) {
          for (const fit of fits) {
            const layout = layoutOf(width, height, {
              ...DEFAULT_FRAME,
              borderOn: true,
              borderSize,
              shadowOn: true,
              shadowSoftness,
              shadowDistance: 3,
              fit,
            }, { sourceWidth: width + 13, sourceHeight: height + 7 })
            const { frame, image, source, border: b } = layout

            // Whole pixels, so edges stay crisp.
            for (const value of [image.x, image.y, image.width, image.height, frame.x, frame.y, layout.fileWidth, layout.fileHeight]) {
              expect(Number.isInteger(value)).toBe(true)
            }
            // The border is even on all four sides and the picture is inside it.
            expect(image.x - frame.x).toBe(b)
            expect(image.y - frame.y).toBe(b)
            expect(frame.x + frame.width - image.x - image.width).toBe(b)
            expect(frame.y + frame.height - image.y - image.height).toBe(b)
            // Everything stays inside the file.
            expect(frame.x + frame.width).toBeLessThanOrEqual(layout.fileWidth)
            expect(frame.y + frame.height).toBeLessThanOrEqual(layout.fileHeight)
            // The picture is never stretched.
            expect(source.width / source.height).toBeCloseTo(image.width / image.height, 6)
            // The file is the promised size at an exact fit.
            if (fit === "exact") {
              expect([layout.fileWidth, layout.fileHeight]).toEqual([width, height])
            }
          }
        }
      }
    }
  })
})

describe("drawFrame", () => {
  type Call = { op: string; x: number; y: number; width: number; height: number; fill?: string; blur?: number; offsetX?: number; offsetY?: number }

  function fakeContext() {
    const calls: Call[] = []
    const state = { fillStyle: "", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: "" }
    const stack: Array<typeof state> = []
    const ctx = {
      ...state,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      save() { stack.push({ fillStyle: ctx.fillStyle, shadowBlur: ctx.shadowBlur, shadowOffsetX: ctx.shadowOffsetX, shadowOffsetY: ctx.shadowOffsetY, shadowColor: ctx.shadowColor }) },
      restore() { Object.assign(ctx, stack.pop()) },
      fillRect(x: number, y: number, width: number, height: number) {
        calls.push({ op: "rect", x, y, width, height, fill: ctx.fillStyle, blur: ctx.shadowBlur, offsetX: ctx.shadowOffsetX, offsetY: ctx.shadowOffsetY })
      },
      drawImage(_image: unknown, _sx: number, _sy: number, _sw: number, _sh: number, x: number, y: number, width: number, height: number) {
        calls.push({ op: "image", x, y, width, height, blur: ctx.shadowBlur, offsetX: ctx.shadowOffsetX, offsetY: ctx.shadowOffsetY })
      },
    }
    return { ctx: ctx as unknown as FrameContext, calls, smoothing: () => ctx.imageSmoothingQuality }
  }

  const image = {} as CanvasImageSource

  it("paints shadows first, then the white frame, then the picture on top", () => {
    const { ctx, calls } = fakeContext()
    drawFrame(ctx, image, layoutOf(1000, 800, border(5, { shadowOn: true })))
    expect(calls.map((c) => c.op)).toEqual(["rect", "rect", "rect", "image"])
    expect(calls[2]!.fill).toBe("#ffffff")
    expect(calls[2]!.blur).toBe(0)
    expect(calls[3]!.blur).toBe(0)
  })

  it("casts a shadow from the picture itself when there is no border, so cutouts keep their outline", () => {
    const { ctx, calls } = fakeContext()
    drawFrame(ctx, image, layoutOf(1000, 800, shadow()))
    expect(calls.map((c) => c.op)).toEqual(["image", "image", "image"])
    expect(calls[0]!.blur).toBeGreaterThan(0)
    expect(calls[2]!.blur).toBe(0)
  })

  it("keeps the shape that casts the shadow off the canvas, so only the shadow lands", () => {
    const { ctx, calls } = fakeContext()
    const layout = layoutOf(1000, 800, border(5, { shadowOn: true }))
    drawFrame(ctx, image, layout)
    for (const cast of calls.slice(0, 2)) {
      expect(cast.x + cast.width).toBeLessThanOrEqual(0)
      // The shadow itself lands back where the frame sits.
      expect(cast.x + cast.offsetX!).toBeCloseTo(layout.frame.x + layout.shadows[calls.indexOf(cast)]!.offsetX, 6)
    }
  })

  it("scales shadow values by hand, because canvas shadows ignore transforms", () => {
    const full = fakeContext()
    const half = fakeContext()
    const layout = layoutOf(1000, 800, border(5, { shadowOn: true }))
    drawFrame(full.ctx, image, layout)
    drawFrame(half.ctx, image, layout, { scale: 0.5 })
    expect(half.calls[0]!.blur).toBeCloseTo(full.calls[0]!.blur! / 2, 6)
    expect(half.calls[0]!.offsetY).toBeCloseTo(full.calls[0]!.offsetY! / 2, 6)
    expect(half.calls[3]!.width).toBeCloseTo(full.calls[3]!.width / 2, 6)
  })

  it("fills white behind everything only when the file background is white", () => {
    const white = fakeContext()
    const clear = fakeContext()
    drawFrame(white.ctx, image, layoutOf(1000, 800, shadow({ background: "white" })))
    drawFrame(clear.ctx, image, layoutOf(1000, 800, shadow({ background: "transparent" })))
    expect(white.calls[0]).toMatchObject({ op: "rect", fill: "#ffffff", x: 0, y: 0 })
    expect(clear.calls.some((c) => c.op === "rect")).toBe(false)
  })

  it("draws only the picture, in place, for hold to compare", () => {
    const { ctx, calls } = fakeContext()
    const layout = layoutOf(1000, 800, border(5, { shadowOn: true, background: "white" }))
    drawFrame(ctx, image, layout, { plain: true })
    expect(calls).toEqual([expect.objectContaining({ op: "image", x: layout.image.x, y: layout.image.y })])
  })

  it("uses high quality scaling", () => {
    const { ctx, smoothing } = fakeContext()
    drawFrame(ctx, image, layoutOf(1000, 800, border(5)))
    // save and restore in the fake leave smoothing as last set.
    expect(smoothing()).toBe("high")
  })
})

describe("isEdgeBright", () => {
  const solid = (r: number, g: number, b: number, a = 255, size = 8) => {
    const pixels = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
      pixels[i + 3] = a
    }
    return pixels
  }

  it("flags a picture whose edges would blend into a white border", () => {
    expect(isEdgeBright(solid(250, 250, 250), 8, 8)).toBe(true)
  })

  it("does not flag a darker picture", () => {
    expect(isEdgeBright(solid(90, 110, 130), 8, 8)).toBe(false)
  })

  it("does not count transparent pixels as bright", () => {
    expect(isEdgeBright(solid(255, 255, 255, 0), 8, 8)).toBe(false)
  })

  it("only looks at the outer edge", () => {
    const pixels = solid(20, 20, 20)
    // Paint the center white. The edge is still dark.
    for (let y = 1; y < 7; y++) {
      for (let x = 1; x < 7; x++) {
        const i = (y * 8 + x) * 4
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
      }
    }
    expect(isEdgeBright(pixels, 8, 8)).toBe(false)
  })
})
