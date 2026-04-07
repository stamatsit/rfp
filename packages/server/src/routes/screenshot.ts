/**
 * Webpage screenshot route — captures a full-page PNG of any public URL
 * via the Microlink API and streams it back to the client.
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
// POST / — body: { url } → streams image/png
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  const { url } = req.body ?? {}
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing 'url' in request body" })
  }
  if (!isPublicUrl(url)) {
    return res.status(400).json({ error: "URL must be a public http(s) address" })
  }

  try {
    // Step 1 — ask Microlink to capture a full-page screenshot
    const apiUrl = new URL("https://api.microlink.io/")
    apiUrl.searchParams.set("url", url)
    apiUrl.searchParams.set("screenshot", "true")
    apiUrl.searchParams.set("fullPage", "true")
    apiUrl.searchParams.set("type", "png")
    apiUrl.searchParams.set("waitUntil", "networkidle0")
    apiUrl.searchParams.set("meta", "false")

    const apiKey = process.env.MICROLINK_API_KEY
    const headers: Record<string, string> = {}
    if (apiKey) headers["x-api-key"] = apiKey

    const metaResp = await fetch(apiUrl.toString(), { headers })
    if (!metaResp.ok) {
      const text = await metaResp.text().catch(() => "")
      return res.status(502).json({
        error: "Screenshot service failed",
        detail: text.slice(0, 300) || metaResp.statusText,
      })
    }
    const meta = await metaResp.json() as {
      status: string
      data?: { screenshot?: { url?: string } }
      message?: string
    }
    const shotUrl = meta?.data?.screenshot?.url
    if (meta.status !== "success" || !shotUrl) {
      return res.status(502).json({
        error: "Screenshot service returned no image",
        detail: meta?.message ?? "unknown",
      })
    }

    // Step 2 — fetch the actual PNG and pipe it through
    const imgResp = await fetch(shotUrl)
    if (!imgResp.ok || !imgResp.body) {
      return res.status(502).json({ error: "Failed to download screenshot image" })
    }
    const buf = Buffer.from(await imgResp.arrayBuffer())
    res.setHeader("Content-Type", "image/png")
    res.setHeader("Content-Length", buf.length.toString())
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).send(buf)
  } catch (err: any) {
    return res.status(500).json({
      error: "Screenshot capture failed",
      detail: err?.message ?? "unknown error",
    })
  }
})

export default router
