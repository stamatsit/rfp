/**
 * URL Scanner routes — SSE streaming scan endpoint with access control
 */
import { Router, type Request, type Response } from "express"
import OpenAI from "openai"
import { scanUrl } from "../services/scannerService.js"
import { streamCompletion, truncateHistory } from "../services/utils/streamHelper.js"
import type { ScanOptions, ScanReport, ScanIssue } from "../types/scanner.js"

const router = Router()

const ALLOWED_EMAILS = ["eric.yerke@stamats.com", "sandra.fancher@stamats.com"]

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
// Middleware: restrict access
// ---------------------------------------------------------------------------
function requireScannerAccess(req: Request, res: Response, next: Function) {
  const email = (req.session as any)?.userEmail
  if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: "URL Scanner is not available for your account" })
  }
  next()
}

router.use(requireScannerAccess)

// ---------------------------------------------------------------------------
// GET /check-access — client calls to decide whether to show the feature
// ---------------------------------------------------------------------------
router.get("/check-access", (_req: Request, res: Response) => {
  // If we get here the middleware already passed
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
    checkLinks: clientOpts.links === true || clientOpts.checkLinks === true,
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
// Shared: fetch and parse sitemap URLs from a site
// ---------------------------------------------------------------------------
async function discoverSitemapUrls(baseUrl: string, maxUrls = 500): Promise<string[]> {
  const parsedBase = new URL(baseUrl)
  const sitemapUrl = `${parsedBase.origin}/sitemap.xml`

  const fetchSitemapUrls = async (url: string): Promise<string[]> => {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)" },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return []
    const text = await resp.text()

    // Check if this is a sitemap index (contains <sitemap> tags)
    const isSitemapIndex = text.includes("<sitemapindex") || text.includes("<sitemap>")

    if (isSitemapIndex) {
      const childSitemaps: string[] = []
      const sitemapLocRegex = /<sitemap>\s*<loc>\s*(.*?)\s*<\/loc>/gi
      let match
      while ((match = sitemapLocRegex.exec(text)) !== null) {
        childSitemaps.push(match[1]!.trim())
      }
      // Fetch ALL child sitemaps to discover full site
      const pageUrls: string[] = []
      for (const childUrl of childSitemaps) {
        if (pageUrls.length >= maxUrls) break
        try {
          const childUrls = await fetchSitemapUrls(childUrl)
          pageUrls.push(...childUrls)
        } catch { /* skip failed child sitemaps */ }
      }
      return pageUrls
    }

    // Regular sitemap — extract <url><loc> page URLs
    const urls: string[] = []
    const locRegex = /<url>\s*<loc>\s*(.*?)\s*<\/loc>/gi
    let match
    while ((match = locRegex.exec(text)) !== null) {
      const u = match[1]!.trim()
      if (u.startsWith("http") && isPublicUrl(u)) {
        urls.push(u)
      }
    }
    // Fallback: if no <url><loc> matches, try plain <loc>
    if (urls.length === 0) {
      const plainLocRegex = /<loc>\s*(.*?)\s*<\/loc>/gi
      while ((match = plainLocRegex.exec(text)) !== null) {
        const u = match[1]!.trim()
        if (u.startsWith("http") && isPublicUrl(u) && !u.endsWith(".xml")) {
          urls.push(u)
        }
      }
    }
    return urls
  }

  const urls = await fetchSitemapUrls(sitemapUrl)
  return [...new Set(urls)].slice(0, maxUrls)
}

// ---------------------------------------------------------------------------
// POST /sitemap — Discover sitemap URLs (no scanning, just returns the list)
// ---------------------------------------------------------------------------
router.post("/sitemap", async (req: Request, res: Response) => {
  let baseUrl: string = (req.body?.url ?? "").trim()
  if (!baseUrl) return res.status(400).json({ error: "URL is required" })

  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`
  if (!isPublicUrl(baseUrl)) return res.status(400).json({ error: "URL must be a public HTTP/HTTPS address" })

  try {
    const urls = await discoverSitemapUrls(baseUrl)
    if (urls.length === 0) {
      return res.json({ urls: [baseUrl], source: "fallback" })
    }
    return res.json({ urls, source: "sitemap" })
  } catch (err: any) {
    console.error("[Scanner] Sitemap discovery failed:", err.message)
    return res.json({ urls: [baseUrl], source: "fallback" })
  }
})

// ---------------------------------------------------------------------------
// POST /crawl — Scan specific pages (SSE streaming)
// ---------------------------------------------------------------------------
router.post("/crawl", async (req: Request, res: Response) => {
  // Accept either a specific URL list or a base URL for sitemap discovery
  let urlsToScan: string[] = Array.isArray(req.body?.urls) ? req.body.urls.filter((u: any) => typeof u === "string" && isPublicUrl(u)) : []
  let baseUrl: string = (req.body?.url ?? "").trim()

  if (urlsToScan.length === 0 && !baseUrl) return res.status(400).json({ error: "URL or urls[] is required" })
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`
  if (baseUrl && !isPublicUrl(baseUrl)) return res.status(400).json({ error: "URL must be a public HTTP/HTTPS address" })

  const maxPages = Math.min(Math.max(req.body?.maxPages ?? 20, 1), 200)
  const clientOpts = req.body?.options ?? {}
  const options: ScanOptions = {
    checkLinks: false,
    wcagLevel: ["A", "AA", "AAA"].includes(clientOpts.wcagLevel) ? clientOpts.wcagLevel : "AA",
    timeout: 15000,
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  let aborted = false
  req.on("close", () => { aborted = true })

  try {
    // If no explicit URL list, discover from sitemap
    if (urlsToScan.length === 0) {
      sendEvent({ step: "sitemap", status: "running", message: "Fetching sitemap..." })
      try {
        urlsToScan = await discoverSitemapUrls(baseUrl, maxPages)
      } catch { /* fallback below */ }

      if (urlsToScan.length === 0) {
        urlsToScan = [baseUrl]
        sendEvent({ step: "sitemap", status: "done", message: "No sitemap found — scanning provided URL", urlCount: 1 })
      } else {
        urlsToScan = urlsToScan.slice(0, maxPages)
        sendEvent({ step: "sitemap", status: "done", message: `Found ${urlsToScan.length} URLs`, urlCount: urlsToScan.length })
      }
    } else {
      urlsToScan = urlsToScan.slice(0, maxPages)
      sendEvent({ step: "sitemap", status: "done", message: `Scanning ${urlsToScan.length} selected pages`, urlCount: urlsToScan.length })
    }

    if (aborted) return

    // Step 2: Scan each page
    const results: Array<{ url: string; overallScore: number; issues: number; errors: number; report?: ScanReport }> = []

    for (let i = 0; i < urlsToScan.length; i++) {
      if (aborted) return
      const pageUrl = urlsToScan[i]!
      sendEvent({ step: "scanning", index: i, total: urlsToScan.length, url: pageUrl, status: "running" })

      try {
        const report = await scanUrl(pageUrl, options)
        const errorCount = report.issues.filter((i) => i.severity === "error").length
        results.push({ url: pageUrl, overallScore: report.overallScore, issues: report.issues.length, errors: errorCount, report })
        sendEvent({ step: "scanning", index: i, total: urlsToScan.length, url: pageUrl, status: "done", score: report.overallScore, issues: report.issues.length, errors: errorCount })
      } catch (err: any) {
        results.push({ url: pageUrl, overallScore: 0, issues: 0, errors: 0 })
        sendEvent({ step: "scanning", index: i, total: urlsToScan.length, url: pageUrl, status: "error", message: err.message })
      }
    }

    if (aborted) return

    // Step 3: Build aggregate summary
    const totalPages = results.length
    const avgScore = totalPages > 0 ? Math.round(results.reduce((s, r) => s + r.overallScore, 0) / totalPages) : 0
    const totalIssues = results.reduce((s, r) => s + r.issues, 0)
    const totalErrors = results.reduce((s, r) => s + r.errors, 0)

    // Aggregate common issues across pages
    const issueCounts = new Map<string, { message: string; count: number; severity: string }>()
    for (const r of results) {
      if (!r.report) continue
      for (const issue of r.report.issues) {
        const key = issue.ruleId
        const existing = issueCounts.get(key)
        if (existing) {
          existing.count++
        } else {
          issueCounts.set(key, { message: issue.message, count: 1, severity: issue.severity })
        }
      }
    }
    const commonIssues = Array.from(issueCounts.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15)
      .map(([ruleId, data]) => ({ ruleId, ...data }))

    sendEvent({
      step: "complete",
      summary: {
        totalPages,
        avgScore,
        totalIssues,
        totalErrors,
        commonIssues,
        pages: results.map(({ url, overallScore, issues, errors }) => ({ url, score: overallScore, issues, errors })),
      },
    })
  } catch (err: any) {
    console.error("[Scanner] Crawl failed:", err)
    if (!aborted) sendEvent({ step: "error", message: err.message ?? "Crawl failed" })
  } finally {
    if (!aborted) res.end()
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
// AI helpers
// ---------------------------------------------------------------------------
function buildScanContext(report: ScanReport, focusedIssue?: ScanIssue): string {
  const lines: string[] = []

  // Basic info
  lines.push(`## Scanned URL: ${report.url}`)
  lines.push(`Scanned at: ${report.scannedAt}`)
  lines.push(`Overall score: ${report.overallScore}/100`)
  lines.push("")

  // Category scores
  lines.push("## Category Scores")
  for (const cs of report.categoryScores) {
    lines.push(`- ${cs.category}: ${cs.score}/100 (${cs.errors} errors, ${cs.warnings} warnings, ${cs.infos} info)`)
  }
  lines.push("")

  // Issues
  lines.push(`## Issues (${report.issues.length} total)`)
  for (const issue of report.issues) {
    let entry = `- [${issue.severity.toUpperCase()}] ${issue.ruleId}: ${issue.message}`
    if (issue.element) entry += `\n  Element: ${issue.element}`
    if (issue.suggestion) entry += `\n  Suggestion: ${issue.suggestion}`
    if (issue.wcagCriteria) entry += `\n  WCAG: ${issue.wcagCriteria} (Level ${issue.wcagLevel ?? "AA"})`
    lines.push(entry)
  }
  lines.push("")

  // Heading tree
  if (report.headingTree.length > 0) {
    lines.push("## Heading Structure")
    for (const h of report.headingTree) {
      const indent = "  ".repeat(h.level - 1)
      let entry = `${indent}H${h.level}: ${h.text}`
      if (h.issues.length > 0) entry += ` [Issues: ${h.issues.join(", ")}]`
      lines.push(entry)
    }
    lines.push("")
  }

  // Security headers
  lines.push(`## Security Headers — Grade: ${report.securityHeaders.grade}`)
  for (const [header, info] of Object.entries(report.securityHeaders.headers)) {
    lines.push(`- ${header}: ${info.present ? `present (${info.value ?? "set"})` : "MISSING"}`)
  }
  lines.push("")

  // Meta tags
  lines.push("## Meta Tags")
  if (report.meta.title) lines.push(`- Title: ${report.meta.title}`)
  if (report.meta.description) lines.push(`- Description: ${report.meta.description}`)
  if (report.meta.lang) lines.push(`- Language: ${report.meta.lang}`)
  if (report.meta.charset) lines.push(`- Charset: ${report.meta.charset}`)
  if (report.meta.viewport) lines.push(`- Viewport: ${report.meta.viewport}`)
  if (report.meta.canonical) lines.push(`- Canonical: ${report.meta.canonical}`)
  const ogKeys = Object.keys(report.meta.ogTags)
  if (ogKeys.length > 0) {
    lines.push(`- OG tags: ${ogKeys.map(k => `${k}="${report.meta.ogTags[k]}"`).join(", ")}`)
  }
  lines.push("")

  // Link summary
  if (report.linkSummary) {
    lines.push("## Link Check Summary")
    lines.push(`- Total: ${report.linkSummary.total}, Healthy: ${report.linkSummary.healthy}, Broken: ${report.linkSummary.broken}, Redirects: ${report.linkSummary.redirects}, Timeouts: ${report.linkSummary.timeouts}`)
    lines.push("")
  }

  // Schema / Structured Data
  if (report.schema) {
    lines.push("## Structured Data (Schema.org)")
    lines.push(`- Total entities found: ${report.schema.totalFound}`)
    lines.push(`- JSON-LD: ${report.schema.hasJsonLd ? "Yes" : "No"}, Microdata: ${report.schema.hasMicrodata ? "Yes" : "No"}, RDFa: ${report.schema.hasRdfa ? "Yes" : "No"}`)
    for (const entity of report.schema.entities.slice(0, 10)) {
      let entry = `- [${entity.source}] ${entity.type}`
      if (entity.issues.length > 0) entry += ` (Issues: ${entity.issues.join(", ")})`
      lines.push(entry)
    }
    if (report.schema.entities.length > 10) {
      lines.push(`- ... and ${report.schema.entities.length - 10} more entities`)
    }
    lines.push("")
  }

  // Site Structure
  if (report.siteStructure) {
    const s = report.siteStructure
    lines.push("## Site Structure")
    lines.push(`- Internal links: ${s.internalLinks.length}, External links: ${s.externalLinks.length}`)
    lines.push(`- Navigation links: ${s.navigation.length}`)
    const h = s.pageHierarchy
    lines.push(`- Semantic elements: nav=${h.hasNav}, main=${h.hasMain}, footer=${h.hasFooter}, aside=${h.hasAside}, breadcrumb=${h.hasBreadcrumb}`)
    lines.push(`- Heading count: ${h.headingCount}, Sections: ${h.sections.length}`)
    if (s.navigation.length > 0) {
      lines.push(`- Top nav links: ${s.navigation.slice(0, 8).map(n => `"${n.text}"`).join(", ")}`)
    }
    lines.push("")
  }

  // Focused issue
  if (focusedIssue) {
    lines.push("## THE USER IS CURRENTLY LOOKING AT THIS ISSUE:")
    lines.push(`Rule: ${focusedIssue.ruleId}`)
    lines.push(`Severity: ${focusedIssue.severity}`)
    lines.push(`Message: ${focusedIssue.message}`)
    if (focusedIssue.element) lines.push(`Element: ${focusedIssue.element}`)
    if (focusedIssue.selector) lines.push(`Selector: ${focusedIssue.selector}`)
    if (focusedIssue.suggestion) lines.push(`Suggestion: ${focusedIssue.suggestion}`)
    if (focusedIssue.wcagCriteria) lines.push(`WCAG: ${focusedIssue.wcagCriteria} (Level ${focusedIssue.wcagLevel ?? "AA"})`)
    lines.push("")
  }

  return lines.join("\n")
}

function parseFollowUpPrompts(response: string): { cleanResponse: string; prompts: string[] } {
  const prompts: string[] = []
  const clean = response
    .replace(/FOLLOW_UP:\s*(.+)/g, (_, p) => {
      prompts.push(p.trim())
      return ""
    })
    .trim()
  return { cleanResponse: clean, prompts }
}

const SCANNER_SYSTEM_PROMPT = `You are a web accessibility expert assistant. You help users understand their website scan results and fix accessibility, SEO, and security issues.

You have access to a detailed scan report for the user's website (provided below). Use it to answer their questions accurately.

Guidelines:
- Explain issues in plain, non-technical English when possible, then provide the technical details.
- Provide concrete HTML code fixes using markdown code blocks. When showing fixes, show a "Before" and "After" example so the user can see exactly what to change.
- Reference specific WCAG success criteria (e.g., WCAG 2.1 SC 1.1.1 Non-text Content) and briefly explain what the criterion requires and why it matters.
- Prioritize fixes by impact — critical accessibility barriers first, then warnings, then best-practice improvements.
- Be concise and actionable. Avoid lengthy preambles.
- If the user asks about a specific issue, focus your answer on that issue but mention related issues if relevant.
- When discussing security headers, explain both what the header does and the risk of not having it.

At the end of your response, suggest 2-3 natural follow-up questions the user might want to ask. Format each on its own line as:
FOLLOW_UP: <question text>
`

// ---------------------------------------------------------------------------
// POST /ai — AI chat about scan results (SSE streaming)
// ---------------------------------------------------------------------------
router.post("/ai", async (req: Request, res: Response) => {
  const openai = getOpenAI()
  if (!openai) {
    return res.status(503).json({ error: "AI service is not configured" })
  }

  const { query, scanReport, conversationHistory, focusedIssue } = req.body ?? {}

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required" })
  }
  if (!scanReport || typeof scanReport !== "object" || !scanReport.url) {
    return res.status(400).json({ error: "scanReport is required" })
  }

  // Build the system prompt with scan context
  const scanContext = buildScanContext(scanReport as ScanReport, focusedIssue as ScanIssue | undefined)
  const systemPrompt = `${SCANNER_SYSTEM_PROMPT}\n---\n\n# Scan Report Context\n${scanContext}`

  // Prepare conversation history
  const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(conversationHistory)
    ? conversationHistory
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content as string }))
    : []

  const trimmedHistory = truncateHistory(history)

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory,
    { role: "user", content: query.trim() },
  ]

  await streamCompletion({
    openai,
    messages,
    temperature: 0.4,
    maxTokens: 3000,
    metadata: { type: "scanner-ai" },
    parseFollowUpPrompts,
    res,
  })
})

export default router
