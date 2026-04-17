/**
 * Reports routes — generate, store, list, and serve polished gap-analysis reports.
 *
 * Storage: filesystem under packages/server/data/reports. Each report is two files:
 *  - {slug}.html  — the rendered deliverable
 *  - {slug}.json  — metadata (slug, clientName, url, score, generatedAt)
 */
import { Router, type Request, type Response } from "express"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join as pathJoin, resolve } from "node:path"
import { generateReport } from "../reports/generator.js"
import { renderReport } from "../reports/renderer.js"
import type { ClientInfo, ConsultingFirm } from "../reports/types.js"
import { requireWriteAccess } from "../middleware/auth.js"

const router = Router()

// Client Reports are admin-only.
router.use(requireWriteAccess)

// ---------------------------------------------------------------------------
// Storage helpers.
// ---------------------------------------------------------------------------
const DATA_DIR = resolve(process.cwd(), "data", "reports")
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

interface ReportMetadata {
  id: string
  slug: string
  clientName: string
  clientUrl: string
  score: number
  totalIssues: number
  critical: number
  high: number
  generatedAt: string
  generatedBy: string
  firmName: string
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function saveReport(slug: string, html: string, meta: ReportMetadata) {
  ensureDataDir()
  writeFileSync(pathJoin(DATA_DIR, `${slug}.html`), html)
  writeFileSync(pathJoin(DATA_DIR, `${slug}.json`), JSON.stringify(meta, null, 2))
}

function loadMetadata(slug: string): ReportMetadata | null {
  try {
    return JSON.parse(readFileSync(pathJoin(DATA_DIR, `${slug}.json`), "utf8"))
  } catch {
    return null
  }
}

function listReports(): ReportMetadata[] {
  ensureDataDir()
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"))
  const reports: ReportMetadata[] = []
  for (const f of files) {
    try {
      reports.push(JSON.parse(readFileSync(pathJoin(DATA_DIR, f), "utf8")))
    } catch { /* skip */ }
  }
  return reports.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1))
}

// ---------------------------------------------------------------------------
// GET / — list all reports (JSON)
// ---------------------------------------------------------------------------
router.get("/", (_req: Request, res: Response) => {
  res.json({ reports: listReports() })
})

// ---------------------------------------------------------------------------
// GET /:slug — serve the rendered HTML inline
// ---------------------------------------------------------------------------
router.get("/:slug/html", (req: Request, res: Response) => {
  const slug = req.params.slug
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).send("Invalid slug")
  const file = pathJoin(DATA_DIR, `${slug}.html`)
  if (!existsSync(file)) return res.status(404).send("Report not found")
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(readFileSync(file))
})

router.get("/:slug", (req: Request, res: Response) => {
  const slug = req.params.slug
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "Invalid slug" })
  const meta = loadMetadata(slug)
  if (!meta) return res.status(404).json({ error: "Report not found" })
  res.json(meta)
})

// ---------------------------------------------------------------------------
// POST /generate — SSE-streamed report generation
// Body: { url, clientName, clientUrl?, competitorUrls?, screenshots?: { desktop, mobile? } }
// ---------------------------------------------------------------------------
router.post("/generate", async (req: Request, res: Response) => {
  const { url, clientName, clientShortName, competitorUrls, screenshots, firmName, firmLogoUrl } = req.body ?? {}

  if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" })
  if (!clientName || typeof clientName !== "string") return res.status(400).json({ error: "clientName required" })

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()

  let aborted = false
  req.on("close", () => { aborted = true })
  const sendEvent = (data: Record<string, any>) => {
    if (!aborted) res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const client: ClientInfo = {
      name: clientName,
      auditedUrl: url,
      auditedUrlDisplay: url.replace(/^https?:\/\//, ""),
      shortName: clientShortName ?? clientName.split(" ")[0],
    }
    const firm: ConsultingFirm = {
      name: firmName ?? "Stamats",
      logoUrl: firmLogoUrl ?? "screenshots/stamats-logo.png",
    }

    const reportData = await generateReport({
      url,
      client,
      firm,
      competitorUrls: Array.isArray(competitorUrls) ? competitorUrls : [],
      screenshots: screenshots && typeof screenshots === "object" && screenshots.desktop
        ? { desktop: screenshots.desktop, mobile: screenshots.mobile }
        : undefined,
      onProgress: (stage, status, detail) => {
        sendEvent({ step: stage, status, detail })
      },
    })

    if (aborted) return

    const html = renderReport(reportData)
    const id = randomUUID()
    const dateSlug = new Date().toISOString().slice(0, 10)
    const slug = `${slugify(clientName)}-${dateSlug}-${id.slice(0, 6)}`

    const meta: ReportMetadata = {
      id,
      slug,
      clientName,
      clientUrl: url,
      score: reportData.healthScore.score,
      totalIssues:
        reportData.severity.counts.critical + reportData.severity.counts.high +
        reportData.severity.counts.medium + reportData.severity.counts.low,
      critical: reportData.severity.counts.critical,
      high: reportData.severity.counts.high,
      generatedAt: new Date().toISOString(),
      generatedBy: (req.session as any)?.userEmail ?? "unknown",
      firmName: firm.name,
    }

    saveReport(slug, html, meta)

    sendEvent({ step: "complete", slug, meta })
  } catch (err: any) {
    console.error("[Reports] Generation failed:", err)
    sendEvent({ step: "error", message: err.message ?? "Generation failed" })
  } finally {
    if (!aborted) res.end()
  }
})

export default router
