/**
 * URL Scanner routes — SSE streaming scan endpoint with access control
 */
import { Router, type Request, type Response } from "express"
import OpenAI from "openai"
import * as cheerio from "cheerio"
import { scanUrl } from "../services/scannerService.js"
import type { ScanOptions } from "../types/scanner.js"

const router = Router()

// ---------------------------------------------------------------------------
// SSRF Guard
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
// GET /check-access — client calls to decide whether to show the feature
// ---------------------------------------------------------------------------
router.get("/check-access", (_req: Request, res: Response) => {
  res.json({ hasAccess: true })
})

// ---------------------------------------------------------------------------
// POST /scan — SSE streaming scan
// ---------------------------------------------------------------------------
router.post("/scan", async (req: Request, res: Response) => {
  // --- Validate URL -------------------------------------------------------
  let targetUrl: string = (req.body?.url ?? "").trim()
  if (!targetUrl) {
    return res.status(400).json({ error: "URL is required" })
  }

  // Auto-prepend https:// if no protocol
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`
  }

  if (!isPublicUrl(targetUrl)) {
    return res.status(400).json({ error: "URL must be a public HTTP/HTTPS address" })
  }

  // --- Parse options ------------------------------------------------------
  // Client sends { url, options: { links, wcagLevel, ... } } — read from nested options object
  const clientOpts = req.body?.options ?? req.body ?? {}
  const options: ScanOptions = {
    wcagLevel: ["A", "AA", "AAA"].includes(clientOpts.wcagLevel) ? clientOpts.wcagLevel : "AA",
    timeout: typeof clientOpts.timeout === "number" ? Math.min(Math.max(clientOpts.timeout, 5000), 30000) : 15000,
  }

  // --- SSE setup ----------------------------------------------------------
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no") // nginx
  res.flushHeaders()

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Handle client disconnect
  let aborted = false
  req.on("close", () => {
    aborted = true
  })

  try {
    // Run the scan with real progress callbacks
    const report = await scanUrl(targetUrl, options, (step, status) => {
      if (!aborted) {
        sendEvent({ step, status })
      }
    })

    if (aborted) return

    sendEvent({ step: "complete", report })
  } catch (err: any) {
    console.error("[Scanner] Scan failed:", err)
    if (!aborted) {
      sendEvent({ step: "error", message: err.message ?? "Scan failed" })
    }
  } finally {
    if (!aborted) {
      res.end()
    }
  }
})


// ---------------------------------------------------------------------------
// POST /headings — lightweight heading-structure checker
// ---------------------------------------------------------------------------
router.post("/headings", async (req: Request, res: Response) => {
  let targetUrl: string = (req.body?.url ?? "").trim()
  if (!targetUrl) {
    return res.status(400).json({ error: "URL is required" })
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`
  }

  if (!isPublicUrl(targetUrl)) {
    return res.status(400).json({ error: "URL must be a public HTTP/HTTPS address" })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BlueprintScanner/1.0; +https://blueprint-ai.co)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch page (HTTP ${response.status})` })
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract headings in document order
    const headings: { level: number; text: string }[] = []
    $("h1, h2, h3, h4, h5, h6").each((_i, el) => {
      const tagName = $(el).prop("tagName")?.toLowerCase() ?? ""
      const level = parseInt(tagName.replace("h", ""), 10)
      if (level >= 1 && level <= 6) {
        const text = $(el).text().trim().slice(0, 200)
        headings.push({ level, text })
      }
    })

    // Analyze
    const violations: { index: number; type: "skip" | "missing-h1" | "no-headings"; message: string }[] = []

    if (headings.length === 0) {
      violations.push({
        index: -1,
        type: "no-headings",
        message: "No heading elements found on this page. Every page should have at least one heading to describe its content.",
      })
      return res.json({ url: targetUrl, headings, violations, hasH1: false, passed: false })
    }

    // Skip violations
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1]!
      const curr = headings[i]!
      const delta = curr.level - prev.level
      if (delta > 1) {
        const missing =
          delta > 2
            ? `h${prev.level + 1} through h${curr.level - 1} missing in between`
            : `h${prev.level + 1} missing in between`
        violations.push({
          index: i,
          type: "skip",
          message: `Heading skipped from h${prev.level} to h${curr.level} (${missing})`,
        })
      }
    }

    // Missing h1 check
    const hasH1 = headings.some((h) => h.level === 1)
    if (!hasH1) {
      violations.push({
        index: -1,
        type: "missing-h1",
        message: "Page is missing an h1 element entirely. Every page should have exactly one top-level heading.",
      })
    }

    const skipViolations = violations.filter((v) => v.type === "skip")
    const passed = headings.length > 0 && hasH1 && skipViolations.length === 0

    return res.json({ url: targetUrl, headings, violations, hasH1, passed })
  } catch (err: any) {
    if (err.name === "AbortError") {
      return res.status(400).json({ error: "Request timed out after 15 seconds" })
    }
    return res.status(400).json({ error: err.message ?? "Failed to fetch page" })
  }
})

// ---------------------------------------------------------------------------
// OpenAI client (lazy-init)
// ---------------------------------------------------------------------------
let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

// ---------------------------------------------------------------------------
// POST /ai/fix-issue — AI-generated fix for a single issue
// ---------------------------------------------------------------------------
router.post("/ai/fix-issue", async (req: Request, res: Response) => {
  const openai = getOpenAI()
  if (!openai) {
    return res.status(503).json({ error: "AI service is not configured" })
  }

  const { url, issue, pageContext } = req.body ?? {}
  if (!issue || typeof issue !== "object" || !issue.ruleId) {
    return res.status(400).json({ error: "issue is required" })
  }

  const systemPrompt = `You are an accessibility expert. Given an accessibility issue found on a web page, return a JSON object with exactly these fields:
- "explanation": A 2-sentence plain-English explanation of why this matters and which users are affected.
- "beforeCode": The problematic HTML code (the element as-is). If no element HTML is provided, write a realistic example that would trigger this issue.
- "afterCode": The corrected HTML code showing the fix applied.
- "watchFor": One related thing to watch for on the same page (1 sentence).

Output ONLY valid JSON. No markdown, no code fences, no extra text.`

  const userContent = [
    `Page URL: ${url || "unknown"}`,
    `Rule ID: ${issue.ruleId}`,
    `Category: ${issue.category || "unknown"}`,
    `Severity: ${issue.severity || "unknown"}`,
    `Message: ${issue.message || ""}`,
    issue.element ? `Element HTML: ${issue.element}` : "",
    issue.selector ? `Selector: ${issue.selector}` : "",
    issue.suggestion ? `Existing suggestion: ${issue.suggestion}` : "",
    issue.wcagCriteria ? `WCAG Criteria: ${issue.wcagCriteria}${issue.wcagLevel ? ` (Level ${issue.wcagLevel})` : ""}` : "",
    pageContext?.title ? `Page title: ${pageContext.title}` : "",
    pageContext?.lang ? `Page language: ${pageContext.lang}` : "",
  ].filter(Boolean).join("\n")

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    })

    const raw = completion.choices[0]?.message?.content ?? ""
    // Strip code fences if the model wrapped its output
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim()

    let parsed: { explanation: string; beforeCode: string; afterCode: string; watchFor: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(502).json({ error: "AI returned invalid JSON", raw: cleaned })
    }

    return res.json(parsed)
  } catch (err: any) {
    console.error("[Scanner AI] fix-issue error:", err?.message || err)
    return res.status(502).json({ error: err?.message ?? "AI request failed" })
  }
})

// ---------------------------------------------------------------------------
// POST /ai/alt-text — AI-generated alt text using vision (gpt-4o)
// ---------------------------------------------------------------------------
router.post("/ai/alt-text", async (req: Request, res: Response) => {
  const openai = getOpenAI()
  if (!openai) {
    return res.status(503).json({ error: "AI service is not configured" })
  }

  const { pageUrl, imageUrl, surroundingText } = req.body ?? {}
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ error: "imageUrl is required" })
  }

  // Resolve relative URLs
  let resolvedUrl = imageUrl
  try {
    if (pageUrl && !/^https?:\/\//i.test(imageUrl)) {
      resolvedUrl = new URL(imageUrl, pageUrl).href
    }
  } catch {
    // Keep as-is if resolution fails
  }

  if (!isPublicUrl(resolvedUrl)) {
    return res.status(400).json({ error: "Image URL must be a public HTTP/HTTPS address" })
  }

  const userContent: OpenAI.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Write concise, descriptive alt text for this image (max 120 characters, no "image of..." prefix, focus on meaningful content). If the image is purely decorative (e.g., a spacer, border, or abstract pattern with no informational value), return an empty string.${surroundingText ? `\n\nSurrounding page text for context: "${surroundingText}"` : ""}

Output ONLY valid JSON: { "altText": "...", "isDecorative": false }`,
    },
    {
      type: "image_url",
      image_url: { url: resolvedUrl, detail: "low" },
    },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 200,
    })

    const raw = completion.choices[0]?.message?.content ?? ""
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim()

    let parsed: { altText: string; isDecorative: boolean }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback: use raw text as alt text
      parsed = { altText: raw.slice(0, 120), isDecorative: false }
    }

    // Cap alt text length
    if (parsed.altText && parsed.altText.length > 200) {
      parsed.altText = parsed.altText.slice(0, 197) + "..."
    }

    return res.json(parsed)
  } catch (err: any) {
    console.error("[Scanner AI] alt-text error:", err?.message || err)
    return res.status(502).json({ error: err?.message ?? "AI request failed" })
  }
})

export default router
