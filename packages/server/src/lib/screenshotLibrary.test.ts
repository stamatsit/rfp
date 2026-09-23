import { describe, it, expect } from "vitest"
import {
  SCREENSHOT_BUCKET,
  normalizeUrlKey,
  domainOf,
  buildStorageKey,
  readPngDimensions,
} from "./screenshotLibrary.js"

function fakePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(16)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write("IHDR", 4, "ascii")
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  return Buffer.concat([sig, ihdr, Buffer.alloc(5)])
}

describe("normalizeUrlKey / domainOf (server copy of the client rules)", () => {
  it("matches the client normalization", () => {
    expect(normalizeUrlKey("HTTPS://WWW.Example.com/About/#x")).toBe("https://example.com/About")
    expect(normalizeUrlKey("https://example.com/")).toBe("https://example.com")
    expect(normalizeUrlKey("nope")).toBe("")
    expect(domainOf("https://www.Coe.edu/a")).toBe("coe.edu")
  })
})

describe("buildStorageKey", () => {
  const png = fakePng(10, 10)
  const at = new Date("2026-09-23T14:05:09Z")

  it("puts the file under domain/yyyy-mm with a readable slug, viewport, time and content hash", () => {
    const key = buildStorageKey("https://www.coe.edu/why-coe/discover-coe/marketing", "desktop", at, png)
    expect(key.startsWith("coe.edu/2026-09/why-coe-discover-coe-marketing-desktop-20260923T140509")).toBe(true)
    expect(key.endsWith(".png")).toBe(true)
    expect(key).toMatch(/-[0-9a-f]{8}\.png$/)
  })
  it("uses 'index' for the root page and caps the slug length", () => {
    expect(buildStorageKey("https://coe.edu/", "mobile", at, png)).toContain("/index-mobile-")
    const long = "https://coe.edu/" + "segment/".repeat(30)
    const slug = buildStorageKey(long, "desktop", at, png).split("/")[2]!.split("-desktop-")[0]!
    expect(slug.length).toBeLessThanOrEqual(60)
  })
  it("is deterministic for the same inputs and differs for different bytes", () => {
    const a = buildStorageKey("https://coe.edu/a", "desktop", at, png)
    const b = buildStorageKey("https://coe.edu/a", "desktop", at, png)
    const c = buildStorageKey("https://coe.edu/a", "desktop", at, fakePng(11, 11))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
  it("names the bucket", () => {
    expect(SCREENSHOT_BUCKET).toBe("screenshots")
  })
})

describe("readPngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(readPngDimensions(fakePng(2560, 9120))).toEqual({ width: 2560, height: 9120 })
  })
  it("returns null for something that is not a png", () => {
    expect(readPngDimensions(Buffer.from("<html></html>"))).toBeNull()
    expect(readPngDimensions(Buffer.alloc(3))).toBeNull()
  })
})
