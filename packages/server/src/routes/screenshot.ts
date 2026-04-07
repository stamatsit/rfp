/**
 * Webpage screenshot route — captures a full-page PNG of any public URL.
 *
 * Provider selection:
 *  - If SCREENSHOTONE_ACCESS_KEY is set → use ScreenshotOne (residential
 *    IPs, Vimeo/YouTube embeds render properly).
 *  - Otherwise fall back to Microlink free tier (no key, but Vimeo and
 *    other bot-detecting embeds may show a "couldn't verify" placeholder).
 */
import { Router, type Request, type Response } from "express"

const router = Router()

// ---------------------------------------------------------------------------
// SSRF Guard — block private/internal hosts
// ---------------------------------------------------------------------------
function isPublicUrl(urlString: string): boolean {
  let url: URL
  try { url = new URL(urlString) } catch { return false }
  if (!["http:", "https:"].includes(url.protocol)) return false
  const h = url.hostname
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.)/.test(h)) return false
  if (h === "::1" || h.startsWith("[::1]") || h.startsWith("[fe80")) return false
  return true
}

// ---------------------------------------------------------------------------
// Vimeo iframe enrichment
//
// Vimeo's player refuses to render in headless browsers — especially for
// unlisted/private videos (URLs with ?h=...). We work around this by:
//   1. Fetching the target page HTML ourselves
//   2. Finding all player.vimeo.com iframes
//   3. Calling Vimeo's oEmbed API (which honors the privacy hash) to get
//      the real poster image URL for each video
//   4. Returning a JS snippet that replaces those iframes with <img> tags
//      pointing at the posters — injected into the page via ScreenshotOne's
//      `scripts` parameter before the screenshot is taken.
// ---------------------------------------------------------------------------
async function buildVimeoReplacementScript(targetUrl: string): Promise<string | null> {
  try {
    const htmlResp = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!htmlResp.ok) return null
    const html = await htmlResp.text()

    // Match player.vimeo.com/video/{id}[?h={hash}]
    const re = /player\.vimeo\.com\/video\/(\d+)(?:\?h=([a-f0-9]+))?/g
    const seen = new Set<string>()
    const videos: { id: string; hash: string | null }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const id = m[1]!
      const hash = m[2] ?? null
      const key = `${id}:${hash ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      videos.push({ id, hash })
    }
    if (videos.length === 0) return null

    // Fetch oEmbed thumbnail for each video (in parallel)
    const thumbs = await Promise.all(
      videos.map(async (v) => {
        try {
          const vimeoPageUrl = v.hash
            ? `https://vimeo.com/${v.id}/${v.hash}`
            : `https://vimeo.com/${v.id}`
          const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(vimeoPageUrl)}`
          const resp = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
          if (!resp.ok) return null
          const data = (await resp.json()) as { thumbnail_url?: string }
          if (!data.thumbnail_url) return null
          // Request a larger version — Vimeo serves the thumbnail at a tiny
          // default size; bumping the suffix gives us a sharper poster.
          const big = data.thumbnail_url.replace(/_\d+x\d+(\?|$)/, "_1280x720$1")
          return { id: v.id, url: big }
        } catch {
          return null
        }
      })
    )
    const map = thumbs.filter((t): t is { id: string; url: string } => !!t)
    if (map.length === 0) return null

    // Build JS that replaces matching iframes with <img> posters.
    // JSON.stringify keeps quoting/escaping safe.
    const mapLiteral = JSON.stringify(
      Object.fromEntries(map.map((t) => [t.id, t.url]))
    )
    return `(function(){var thumbs=${mapLiteral};document.querySelectorAll('iframe').forEach(function(f){var s=f.src||'';var m=s.match(/player\\.vimeo\\.com\\/video\\/(\\d+)/);if(!m||!thumbs[m[1]])return;var img=document.createElement('img');img.src=thumbs[m[1]];img.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;border:0';if(f.parentNode)f.parentNode.replaceChild(img,f)});})();`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Viewport presets — desktop vs mobile
// ---------------------------------------------------------------------------
type Viewport = "desktop" | "mobile"

const VIEWPORTS: Record<Viewport, { width: number; height: number; dpr: number; isMobile: boolean }> = {
  desktop: { width: 1280, height: 800, dpr: 2, isMobile: false },
  mobile: { width: 390, height: 844, dpr: 3, isMobile: true }, // iPhone 14
}

// ---------------------------------------------------------------------------
// ScreenshotOne provider — preferred when an access key is configured
// ---------------------------------------------------------------------------
async function captureWithScreenshotOne(
  url: string,
  accessKey: string,
  viewport: Viewport,
): Promise<Buffer> {
  // Pre-flight: scan the page for Vimeo embeds and prepare a replacement script
  const vimeoScript = await buildVimeoReplacementScript(url)
  const vp = VIEWPORTS[viewport]

  const api = new URL("https://api.screenshotone.com/take")
  api.searchParams.set("access_key", accessKey)
  api.searchParams.set("url", url)
  api.searchParams.set("full_page", "true")
  api.searchParams.set("format", "png")
  api.searchParams.set("viewport_width", String(vp.width))
  api.searchParams.set("viewport_height", String(vp.height))
  api.searchParams.set("device_scale_factor", String(vp.dpr))
  if (vp.isMobile) api.searchParams.set("viewport_mobile", "true")
  api.searchParams.set("block_ads", "true")
  api.searchParams.set("block_cookie_banners", "true")
  api.searchParams.set("block_chats", "true")
  api.searchParams.set("block_trackers", "true")
  api.searchParams.set("wait_until", "networkidle2")
  api.searchParams.set("delay", "3")
  api.searchParams.set("cache", "false")

  // Inline JS that swaps Vimeo iframes with their poster images.
  // Also handles YouTube embeds inline (their thumbnail URL is predictable
  // from the video ID, no API lookup needed).
  const youtubeScript = `document.querySelectorAll('iframe').forEach(function(f){var s=f.src||'';var m=s.match(/(?:youtube\\.com\\/embed|youtube-nocookie\\.com\\/embed)\\/([^?&\\/]+)/);if(!m)return;var img=document.createElement('img');img.src='https://img.youtube.com/vi/'+m[1]+'/hqdefault.jpg';img.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;border:0';if(f.parentNode)f.parentNode.replaceChild(img,f)});`
  const fullScript = (vimeoScript ?? "") + youtubeScript
  if (fullScript) api.searchParams.set("scripts", fullScript)

  const resp = await fetch(api.toString())
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(`ScreenshotOne ${resp.status}: ${text.slice(0, 300) || resp.statusText}`)
  }
  return Buffer.from(await resp.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Microlink provider — free tier fallback
// ---------------------------------------------------------------------------
async function captureWithMicrolink(url: string, viewport: Viewport): Promise<Buffer> {
  const vp = VIEWPORTS[viewport]
  const apiUrl = new URL("https://api.microlink.io/")
  apiUrl.searchParams.set("url", url)
  apiUrl.searchParams.set("screenshot", "true")
  apiUrl.searchParams.set("fullPage", "true")
  apiUrl.searchParams.set("type", "png")
  apiUrl.searchParams.set("waitUntil", "networkidle0")
  apiUrl.searchParams.set("meta", "false")
  apiUrl.searchParams.set("viewport.width", String(vp.width))
  apiUrl.searchParams.set("viewport.height", String(vp.height))
  apiUrl.searchParams.set("viewport.deviceScaleFactor", String(vp.dpr))
  if (vp.isMobile) apiUrl.searchParams.set("viewport.isMobile", "true")
  apiUrl.searchParams.set(
    "userAgent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  )
  apiUrl.searchParams.set("adblock", "true")
  apiUrl.searchParams.set(
    "hide",
    [
      'iframe[src*="cloudflarestream.com"]',
      'iframe[src*="videodelivery.net"]',
      'iframe[src*="mediadelivery.net"]',
      'iframe[src*="vdocipher"]',
      'iframe[src*="jwplatform"]',
      'iframe[src*="brightcove"]',
    ].join(",")
  )

  const headers: Record<string, string> = {}
  if (process.env.MICROLINK_API_KEY) headers["x-api-key"] = process.env.MICROLINK_API_KEY

  const metaResp = await fetch(apiUrl.toString(), { headers })
  if (!metaResp.ok) {
    const text = await metaResp.text().catch(() => "")
    throw new Error(`Microlink ${metaResp.status}: ${text.slice(0, 300) || metaResp.statusText}`)
  }
  const meta = await metaResp.json() as {
    status: string
    data?: { screenshot?: { url?: string } }
    message?: string
  }
  const shotUrl = meta?.data?.screenshot?.url
  if (meta.status !== "success" || !shotUrl) {
    throw new Error(`Microlink returned no image: ${meta?.message ?? "unknown"}`)
  }
  const imgResp = await fetch(shotUrl)
  if (!imgResp.ok) {
    throw new Error(`Failed to download Microlink screenshot: ${imgResp.status}`)
  }
  return Buffer.from(await imgResp.arrayBuffer())
}

// ---------------------------------------------------------------------------
// POST / — body: { url } → streams image/png
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  const { url, viewport: vpRaw } = req.body ?? {}
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing 'url' in request body" })
  }
  if (!isPublicUrl(url)) {
    return res.status(400).json({ error: "URL must be a public http(s) address" })
  }
  const viewport: Viewport = vpRaw === "mobile" ? "mobile" : "desktop"

  try {
    const screenshotOneKey = process.env.SCREENSHOTONE_ACCESS_KEY
    console.log(`[Screenshot] Provider: ${screenshotOneKey ? "ScreenshotOne" : "Microlink (no key)"} | viewport: ${viewport} | URL: ${url}`)
    const buf = screenshotOneKey
      ? await captureWithScreenshotOne(url, screenshotOneKey, viewport)
      : await captureWithMicrolink(url, viewport)
    console.log(`[Screenshot] Success: ${buf.length} bytes`)

    res.setHeader("Content-Type", "image/png")
    res.setHeader("Content-Length", buf.length.toString())
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).send(buf)
  } catch (err: any) {
    console.error("[Screenshot] Capture failed:", err?.message || err)
    return res.status(502).json({
      error: "Screenshot capture failed",
      detail: err?.message ?? "unknown error",
    })
  }
})

export default router
