/**
 * DynoMapper Content Matrix routes — restricted to eric.yerke@stamats.com.
 *
 * Reads already-crawled DynoMapper projects into a per-page content matrix and
 * generates optional AI-drafted remediation columns. The DynoMapper token lives
 * server-side only (DYNOMAPPER_TOKEN); the browser never sees it.
 */
import { Router, type Request, type Response, type NextFunction } from "express"
import multer from "multer"
import {
  isConfigured,
  listProjects,
  buildMatrix,
  enrichRows,
  DynoError,
  AI_FIELD_LABELS,
  MAX_ENRICH_ROWS,
  type AiField,
  type EnrichInputRow,
} from "../services/dynomapperService.js"
import {
  buildWorksheet,
  worksheetToXlsx,
  parseWorksheetXlsx,
  mergeWorksheets,
  buildRedirectMap,
  verifyRedirects,
  renderRedirects,
} from "../services/migrationWorksheet.js"

const router = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

function safeFilename(s: string): string {
  return (s || "content-matrix").replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80)
}

const ALLOWED_EMAIL = "eric.yerke@stamats.com"

/** Hard gate: this whole feature is restricted to a single account. */
function requireEric(req: Request, res: Response, next: NextFunction) {
  const email = (req.session?.userEmail ?? "").toLowerCase()
  if (email !== ALLOWED_EMAIL) {
    return res.status(403).json({ error: "Access denied" })
  }
  return next()
}

router.use(requireEric)

function handleError(res: Response, err: unknown) {
  if (err instanceof DynoError) {
    return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message })
  }
  const message = err instanceof Error ? err.message : "Unexpected error"
  console.error("[dynomapper] route error:", message)
  return res.status(500).json({ error: message })
}

/** GET /status — config + which AI fields exist (client renders toggles from this). */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    configured: isConfigured(),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    aiFields: AI_FIELD_LABELS,
    maxEnrichRows: MAX_ENRICH_ROWS,
  })
})

/** GET /projects — list crawled DynoMapper projects for the site picker. */
router.get("/projects", async (_req: Request, res: Response) => {
  try {
    res.json({ projects: await listProjects() })
  } catch (err) {
    handleError(res, err)
  }
})

/** GET /matrix?projectId=123 — the content matrix (native columns). */
router.get("/matrix", async (req: Request, res: Response) => {
  const projectId = Number(req.query.projectId)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "projectId is required" })
  }
  try {
    res.json(await buildMatrix(projectId))
  } catch (err) {
    handleError(res, err)
  }
})

/** POST /enrich — generate AI columns for a set of rows. */
router.post("/enrich", async (req: Request, res: Response) => {
  const body = req.body ?? {}
  const rows: EnrichInputRow[] = Array.isArray(body.rows) ? body.rows : []
  const fields: AiField[] = Array.isArray(body.fields)
    ? body.fields.filter((f: string): f is AiField => f in AI_FIELD_LABELS)
    : []
  if (rows.length === 0) return res.status(400).json({ error: "rows are required" })
  if (fields.length === 0) return res.status(400).json({ error: "at least one AI field is required" })

  const clean: EnrichInputRow[] = rows
    .filter((r) => r && typeof r.url === "string" && r.url.trim())
    .map((r) => ({
      url: r.url,
      title: typeof r.title === "string" ? r.title : "",
      type: typeof r.type === "string" ? r.type : "",
      issues: Array.isArray(r.issues) ? r.issues.map(String) : [],
    }))

  try {
    const enriched = await enrichRows(clean, fields, {
      domain: typeof body.domain === "string" ? body.domain : null,
      title: typeof body.projectTitle === "string" ? body.projectTitle : null,
    })
    res.json({ enriched, fields, count: Object.keys(enriched).length })
  } catch (err) {
    handleError(res, err)
  }
})

// ── Migration Worksheet ─────────────────────────────────────────
// Editable Excel export (Stamats migration-tracker format) + non-destructive sync.

/**
 * GET /worksheet.xlsx?projectId=123[&client=Washtenaw][&ai=0][&body=1][&drafts=25]
 * Editable worksheet. body=1 fetches page bodies for real audit/keywords/CTAs/assets;
 * drafts=N generates first-pass drafts (Drafts tab) for the top N Write-New/Revise pages.
 */
router.get("/worksheet.xlsx", async (req: Request, res: Response) => {
  const projectId = Number(req.query.projectId)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "projectId is required" })
  }
  const maxDrafts = Math.min(Math.max(0, Number(req.query.drafts) || 0), 100)
  try {
    const ws = await buildWorksheet(projectId, {
      clientName: typeof req.query.client === "string" ? req.query.client : null,
      withAI: req.query.ai !== "0",
      withBody: req.query.body === "1",
      maxDrafts,
    })
    const buf = worksheetToXlsx(ws)
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="migration-worksheet-${safeFilename(ws.project.domain || ws.project.title)}.xlsx"`)
    return res.send(buf)
  } catch (err) {
    handleError(res, err)
  }
})

/**
 * POST /worksheet/redirects  (multipart: file=<edited .xlsx>[, verify=1])
 * Extracts Old→New redirect pairs from the worksheet's New URL column, optionally verifies
 * each New URL resolves, and returns CSV / .htaccess / nginx renderings.
 */
router.post("/worksheet/redirects", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No .xlsx file uploaded" })
  try {
    const parsed = parseWorksheetXlsx(req.file.buffer)
    let entries = buildRedirectMap(parsed)
    if (entries.length === 0) {
      return res.status(422).json({ error: "No Old→New redirect pairs found (fill the 'New URL' column first)." })
    }
    if (req.body?.verify === "1" || req.body?.verify === "true") {
      entries = await verifyRedirects(entries)
    }
    const rendered = renderRedirects(entries)
    return res.json({
      count: entries.length,
      unresolved: entries.filter((e) => e.resolved === false).length,
      entries,
      ...rendered,
    })
  } catch (err) {
    handleError(res, err)
  }
})

/**
 * POST /worksheet/sync  (multipart: file=<edited .xlsx>, projectId)
 * Re-crawls, merges the uploaded edits (human columns preserved, machine columns refreshed,
 * dropped pages kept), and returns a change summary + the merged workbook (base64).
 */
router.post("/worksheet/sync", upload.single("file"), async (req: Request, res: Response) => {
  const projectId = Number(req.body?.projectId)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "projectId is required" })
  }
  if (!req.file) return res.status(400).json({ error: "No .xlsx file uploaded" })
  try {
    const existing = parseWorksheetXlsx(req.file.buffer)
    if (existing.size === 0) {
      return res.status(422).json({ error: "Could not find a migration worksheet in that file (no 'Old URL' rows found)." })
    }
    const fresh = await buildWorksheet(projectId, {
      clientName: typeof req.body?.client === "string" ? req.body.client : null,
      withAI: req.body?.ai !== "0",
    })
    const { rows, summary } = mergeWorksheets(fresh, existing)
    const buf = worksheetToXlsx({ ...fresh, rows })
    return res.json({
      summary,
      filename: `migration-worksheet-${safeFilename(fresh.project.domain || fresh.project.title)}.xlsx`,
      xlsxBase64: buf.toString("base64"),
    })
  } catch (err) {
    handleError(res, err)
  }
})

export default router
