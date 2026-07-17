/**
 * Migration Worksheet — Stamats content-migration tracker, generated from a DynoMapper
 * crawl and round-tripped with an external Excel/SharePoint spreadsheet.
 *
 * Two hard requirements drive the design:
 *   1. EDITABLE — the export is a real .xlsx (no protection); the team edits it in Excel/SharePoint.
 *   2. SYNCABLE — re-importing the edited sheet MERGES: machine columns refresh from the crawl,
 *      human columns are never clobbered, and pages dropped from the crawl are KEPT (redirects
 *      depend on the Old URL never disappearing).
 *
 * Column ownership is the whole game:
 *   - machine       → regenerated from crawl + AI every sync (but never overwrites a non-blank
 *                     human value with a blank machine value).
 *   - default       → seeded once; a human edit wins on later syncs.
 *   - disposition   → machine-suggested, but if the human set any of the 7 marks we keep theirs.
 *   - human         → never touched by sync.
 *
 * Row identity = normalized Old URL (see keyOf).
 */
import xlsx from "xlsx"
import {
  buildMatrix,
  fetchProjectItems,
  generateMigrationFields,
  generateAuditFields,
  generateDraft,
  keyOf,
  type DynoItem,
  type EnrichInputRow,
} from "./dynomapperService.js"
import { fetchContentMany, fetchPageContent, type PageContent } from "./pageContent.js"

type Owner = "machine" | "default" | "human" | "disposition"

interface ColumnDef {
  key: string
  group: string
  header: string
  owner: Owner
}

// Exact column order + headers from the Stamats template (one tab of the master workbook).
export const WORKSHEET_COLUMNS: ColumnDef[] = [
  { key: "oldUrl", group: "", header: "Old URL (Do Not Delete any URLS from this column - info needed for redirects)", owner: "machine" },
  { key: "assignedTo", group: "", header: "Assigned To", owner: "default" },
  // SITE TREE
  { key: "pageId", group: "SITE TREE", header: "Page ID", owner: "machine" },
  { key: "navTitle", group: "SITE TREE", header: "Navigation Title", owner: "machine" },
  { key: "newUrl", group: "SITE TREE", header: "New URL", owner: "human" },
  // STATUS (disposition)
  { key: "disp_delete", group: "STATUS", header: "Delete", owner: "disposition" },
  { key: "disp_reuse", group: "STATUS", header: "Reuse", owner: "disposition" },
  { key: "disp_writeNew", group: "STATUS", header: "Write New", owner: "disposition" },
  { key: "disp_revise", group: "STATUS", header: "Revise", owner: "disposition" },
  { key: "disp_optimize", group: "STATUS", header: "Optimize", owner: "disposition" },
  { key: "disp_asIs", group: "STATUS", header: "As Is", owner: "disposition" },
  { key: "disp_import", group: "STATUS", header: "Import", owner: "disposition" },
  // AUDIT (Slice B fills from page body — blank for now)
  { key: "audit_tone", group: "AUDIT", header: "Tone", owner: "machine" },
  { key: "audit_conversion", group: "AUDIT", header: "Conversion", owner: "machine" },
  { key: "audit_readability", group: "AUDIT", header: "Readability\n/SEO", owner: "machine" },
  { key: "audit_scannability", group: "AUDIT", header: "Scannability", owner: "machine" },
  // STRATEGY
  { key: "strat_keywords", group: "STRATEGY", header: "Keywords", owner: "machine" },
  { key: "strat_priorities", group: "STRATEGY", header: "Page Priorities", owner: "machine" },
  { key: "strat_crossLinks", group: "STRATEGY", header: "Cross-Links", owner: "machine" },
  { key: "strat_ctas", group: "STRATEGY", header: "CTAs", owner: "machine" },
  { key: "strat_notes", group: "STRATEGY", header: "Notes", owner: "machine" },
  // WRITING
  { key: "assignedWriter", group: "WRITING", header: "Assigned Writer", owner: "default" },
  { key: "batchNumber", group: "WRITING", header: "Batch Number", owner: "human" },
  { key: "contentTemplate", group: "WRITING", header: "Content Template", owner: "machine" },
  { key: "externalAssets", group: "WRITING", header: "External Assets (PDFs, Images)", owner: "machine" },
  { key: "linkToDraft", group: "WRITING", header: "Link to Draft", owner: "human" },
  { key: "draftProvided", group: "WRITING", header: "Draft Provided by Stamats", owner: "machine" },
  { key: "assignedReviewer", group: "WRITING", header: "Assigned Reviewer", owner: "default" },
  { key: "review_round1", group: "WRITING", header: "Round 1 Review Complete", owner: "human" },
  { key: "review_final", group: "WRITING", header: "Final Review Complete (SMEs after migration)", owner: "human" },
  { key: "categories", group: "WRITING", header: "Categories", owner: "machine" },
  // MIGRATION (human PM)
  { key: "mig_htmlTemplate", group: "MIGRATION", header: "HTML Template", owner: "human" },
  { key: "mig_useCase", group: "MIGRATION", header: "Use Case Layout", owner: "human" },
  { key: "mig_type", group: "MIGRATION", header: "Migration Type (New or As-is)", owner: "human" },
  { key: "mig_notes", group: "MIGRATION", header: "Notes for Migrators", owner: "human" },
  { key: "mig_readyDate", group: "MIGRATION", header: "Ready for Content Placement (Date)", owner: "human" },
  { key: "mig_initials", group: "MIGRATION", header: "Migrator Initials", owner: "human" },
  { key: "mig_completion", group: "MIGRATION", header: "Completion (Date)", owner: "human" },
  { key: "mig_migratorNotes", group: "MIGRATION", header: "Migrator Notes", owner: "human" },
  { key: "mig_qaInitials", group: "MIGRATION", header: "QA Initials", owner: "human" },
  { key: "mig_complete", group: "MIGRATION", header: "Complete (Date)", owner: "human" },
  { key: "mig_finalComments", group: "MIGRATION", header: "Final Comments (For Review)", owner: "human" },
  // REVIEW
  { key: "rev_ready", group: "REVIEW", header: "Ready for Reviewer", owner: "human" },
  { key: "rev_complete", group: "REVIEW", header: "Review Complete", owner: "human" },
  // GOVERNANCE
  { key: "gov_owner", group: "GOVERNANCE", header: "Content Owner", owner: "human" },
  { key: "gov_version", group: "GOVERNANCE", header: "Latest Version", owner: "human" },
  { key: "gov_cycle", group: "GOVERNANCE", header: "Review Cycle", owner: "human" },
  { key: "gov_nextReview", group: "GOVERNANCE", header: "Next Review Date", owner: "human" },
]

const DISPOSITION_KEY: Record<string, string> = {
  Delete: "disp_delete",
  Reuse: "disp_reuse",
  "Write New": "disp_writeNew",
  Revise: "disp_revise",
  Optimize: "disp_optimize",
  "As Is": "disp_asIs",
  Import: "disp_import",
}
const DISPOSITION_KEYS = Object.values(DISPOSITION_KEY)

export type WorksheetRecord = Record<string, string>

export interface WorksheetDraft {
  pageId: string
  url: string
  title: string
  draft: string
}

export interface WorksheetResult {
  project: { id: number; title: string; domain: string | null }
  rows: WorksheetRecord[]
  drafts?: WorksheetDraft[]
  generatedAt: string
  /** which enrichment layers actually ran, for the UI/report */
  layers: { ai: boolean; body: boolean; drafts: number }
}

// ───────────────────────── Page ID generation from the crawl tree ─────────────────────────

/**
 * Assign hierarchical Page IDs (`2.1` = section 2, item 1) from the DynoMapper tree.
 * Top-level nav sections are numbered by crawl order; URL-bearing descendants get `.n`.
 */
function generatePageIds(items: DynoItem[]): Map<string, string> {
  const byId = new Map<number, DynoItem>()
  for (const it of items) byId.set(it.id, it)
  const childrenOf = new Map<number, DynoItem[]>()
  for (const it of items) {
    const arr = childrenOf.get(it.parent) ?? []
    arr.push(it)
    childrenOf.set(it.parent, arr)
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.ordering - b.ordering)

  // Roots = items whose parent isn't itself an item (depth 0 / orphaned parent).
  const roots = items.filter((it) => !byId.has(it.parent)).sort((a, b) => a.ordering - b.ordering)

  const pageId = new Map<string, string>()
  let sectionNum = 0
  const walkSection = (section: DynoItem) => {
    sectionNum++
    let local = 0
    const stack: DynoItem[] = [section]
    const seen = new Set<number>()
    while (stack.length) {
      const node = stack.shift()!
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (node.url) {
        local++
        pageId.set(keyOf(node.url), `${sectionNum}.${local}`)
      }
      const kids = childrenOf.get(node.id) ?? []
      // breadth-first within a section keeps sibling pages numbered together
      stack.push(...kids)
    }
  }

  for (const root of roots) {
    const topSections = childrenOf.get(root.id) ?? []
    if (root.url) {
      // A root that is itself a page (rare) becomes its own section.
      sectionNum++
      pageId.set(keyOf(root.url), `${sectionNum}.1`)
    }
    for (const section of topSections) walkSection(section)
  }
  return pageId
}

function priorityFromIssues(n: number): string {
  if (n >= 3) return "High"
  if (n >= 1) return "Medium"
  return "Low"
}

// ───────────────────────── Build the worksheet from a crawl ─────────────────────────

export interface BuildOptions {
  clientName?: string | null
  /** STATUS/template/notes via AI (default on) */
  withAI?: boolean
  /** Slice B: fetch page bodies → real AUDIT + keywords/CTAs/cross-links + external assets */
  withBody?: boolean
  /** Slice C: generate first-pass drafts for Write-New/Revise rows (this many, most-issues-first) */
  maxDrafts?: number
  /** cap how many pages get body-fetched (prod safety) */
  maxBody?: number
}

export async function buildWorksheet(projectId: number, opts?: BuildOptions): Promise<WorksheetResult> {
  const withAI = opts?.withAI !== false
  const withBody = opts?.withBody === true
  const maxDrafts = Math.max(0, opts?.maxDrafts ?? 0)
  const maxBody = opts?.maxBody ?? 120

  const [matrix, items] = await Promise.all([buildMatrix(projectId), fetchProjectItems(projectId)])
  const pageIds = generatePageIds(items)
  const ctx = { domain: matrix.project.domain, title: matrix.project.title }

  let migration: Record<string, { disposition: string; contentTemplate: string; notes: string }> = {}
  if (withAI) {
    const enrichInput: EnrichInputRow[] = matrix.rows.map((r) => ({ url: r.url, title: r.title, type: r.type, issues: r.issues }))
    try {
      migration = await generateMigrationFields(enrichInput, ctx)
    } catch (err: any) {
      console.warn("[worksheet] AI migration fields failed:", err?.message)
    }
  }

  // Slice B — fetch real page bodies for the highest-priority pages, then audit them.
  const content = new Map<string, PageContent>()
  let audit: Record<string, Awaited<ReturnType<typeof generateAuditFields>>[string]> = {}
  if (withBody || maxDrafts > 0) {
    // matrix.rows are already sorted worst-first; fetch the most valuable ones.
    const fetchUrls = matrix.rows
      .filter((r) => /^https?:\/\//i.test(r.url))
      .slice(0, maxBody)
      .map((r) => r.url)
    const fetched = await fetchContentMany(fetchUrls, { concurrency: 8, timeoutMs: 12000, cap: maxBody })
    for (const [u, c] of fetched) content.set(keyOf(u), c)

    if (withBody) {
      const auditInput = matrix.rows
        .map((r) => ({ r, c: content.get(keyOf(r.url)) }))
        .filter((x) => x.c && x.c.ok && x.c.wordCount > 30)
        .map((x) => ({ url: x.r.url, title: x.r.title, headings: x.c!.headings, text: x.c!.text }))
      if (auditInput.length) {
        try {
          audit = await generateAuditFields(auditInput, ctx)
        } catch (err: any) {
          console.warn("[worksheet] audit failed:", err?.message)
        }
      }
    }
  }

  const reviewer = opts?.clientName ?? ""
  const rows: WorksheetRecord[] = matrix.rows.map((r) => {
    const rec: WorksheetRecord = {}
    for (const c of WORKSHEET_COLUMNS) rec[c.key] = ""
    rec.oldUrl = r.url
    rec.assignedTo = "Stamats"
    rec.pageId = pageIds.get(keyOf(r.url)) ?? ""
    rec.navTitle = r.title
    rec.strat_priorities = priorityFromIssues(r.issueCount)
    rec.assignedWriter = "Stamats"
    rec.assignedReviewer = reviewer

    const m = migration[r.url]
    if (m) {
      if (m.disposition && DISPOSITION_KEY[m.disposition]) rec[DISPOSITION_KEY[m.disposition]!] = "x"
      rec.contentTemplate = m.contentTemplate
      const noteBits = [m.notes, r.issues.length ? `Issues: ${r.issues.join(", ")}` : ""].filter(Boolean)
      rec.strat_notes = noteBits.join(" — ")
    } else if (r.issues.length) {
      rec.strat_notes = `Issues: ${r.issues.join(", ")}`
    }

    // Slice B fills
    const a = audit[r.url]
    if (a) {
      rec.audit_tone = a.tone
      rec.audit_conversion = a.conversion
      rec.audit_readability = a.readability
      rec.audit_scannability = a.scannability
      rec.strat_keywords = a.keywords
      rec.strat_ctas = a.ctas
      rec.strat_crossLinks = a.crossLinks
    }
    const c = content.get(keyOf(r.url))
    if (c && c.ok) {
      const assetBits: string[] = []
      if (c.pdfs.length) assetBits.push(`${c.pdfs.length} PDF${c.pdfs.length > 1 ? "s" : ""}`)
      if (c.images) assetBits.push(`${c.images} image${c.images > 1 ? "s" : ""}`)
      rec.externalAssets = assetBits.join(", ")
    }
    return rec
  })

  // Slice C — draft the top Write-New/Revise pages (most-issues-first order preserved).
  const drafts: WorksheetDraft[] = []
  if (maxDrafts > 0) {
    const draftTargets = matrix.rows
      .filter((r) => {
        const m = migration[r.url]
        const disp = m?.disposition || ""
        return disp === "" || disp === "Write New" || disp === "Revise" || disp === "Optimize"
      })
      .map((r) => ({ r, c: content.get(keyOf(r.url)) }))
      .filter((x) => x.c && x.c.ok && x.c.wordCount > 30)
      .slice(0, maxDrafts)

    for (const { r, c } of draftTargets) {
      try {
        const draft = await generateDraft(
          {
            url: r.url,
            title: r.title,
            template: migration[r.url]?.contentTemplate || "",
            headings: c!.headings,
            text: c!.text,
          },
          ctx
        )
        if (draft) {
          drafts.push({ pageId: pageIds.get(keyOf(r.url)) ?? "", url: r.url, title: r.title, draft })
        }
      } catch (err: any) {
        console.warn(`[worksheet] draft failed for ${r.url}:`, err?.message)
      }
    }
    // mark rows that got a draft
    const draftedKeys = new Set(drafts.map((d) => keyOf(d.url)))
    for (const rec of rows) {
      if (draftedKeys.has(keyOf(rec.oldUrl!))) rec.draftProvided = "Yes — see Drafts tab"
    }
  }

  return {
    project: { id: matrix.project.id, title: matrix.project.title, domain: matrix.project.domain },
    rows,
    drafts: drafts.length ? drafts : undefined,
    generatedAt: new Date().toISOString(),
    layers: { ai: withAI, body: withBody, drafts: drafts.length },
  }
}

// ───────────────────────── .xlsx write (editable, grouped headers, rollup) ─────────────────────────

function colLetter(index: number): string {
  let s = ""
  let n = index
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

const DATA_START = 4 // 0-indexed first data row (row 0 group, 1 headers, 2 rollup, 3 blank)

export function worksheetToXlsx(ws: WorksheetResult): Buffer {
  const cols = WORKSHEET_COLUMNS
  const aoa: any[][] = []
  aoa[0] = cols.map((c) => c.group) // group header row
  aoa[1] = cols.map((c) => c.header) // column names
  aoa[2] = cols.map(() => "") // rollup row (formulas injected below)
  aoa[3] = cols.map(() => "") // spacer
  for (const rec of ws.rows) aoa.push(cols.map((c) => rec[c.key] ?? ""))

  const sheet = xlsx.utils.aoa_to_sheet(aoa)

  // Rollup formulas: total page count + a COUNTIF per disposition column.
  const firstData = DATA_START + 1 // 1-indexed
  const lastData = DATA_START + ws.rows.length // 1-indexed
  if (ws.rows.length > 0) {
    const oldUrlL = colLetter(0)
    sheet[`${oldUrlL}3`] = { t: "n", f: `COUNTA(${oldUrlL}${firstData}:${oldUrlL}${lastData})` }
    cols.forEach((c, i) => {
      if (c.owner === "disposition") {
        const L = colLetter(i)
        sheet[`${L}3`] = { t: "n", f: `COUNTIF(${L}${firstData}:${L}${lastData},"x")` }
      }
    })
  }

  // Merge each contiguous group label across its columns (visual grouping).
  const merges: xlsx.Range[] = []
  let start = 0
  for (let i = 1; i <= cols.length; i++) {
    if (i === cols.length || cols[i]!.group !== cols[start]!.group) {
      if (cols[start]!.group && i - 1 > start) {
        merges.push({ s: { r: 0, c: start }, e: { r: 0, c: i - 1 } })
      }
      start = i
    }
  }
  sheet["!merges"] = merges
  sheet["!cols"] = cols.map((c) => ({ wch: c.key === "oldUrl" ? 48 : c.header.length > 18 ? 22 : 14 }))

  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, sheet, "Content Matrix")

  // Slice C — a Drafts tab (one row per generated draft).
  if (ws.drafts && ws.drafts.length) {
    const draftAoa: any[][] = [["Page ID", "Old URL", "Title", "Draft (first pass — review before use)"]]
    for (const d of ws.drafts) draftAoa.push([d.pageId, d.url, d.title, d.draft])
    const draftSheet = xlsx.utils.aoa_to_sheet(draftAoa)
    draftSheet["!cols"] = [{ wch: 10 }, { wch: 48 }, { wch: 30 }, { wch: 120 }]
    xlsx.utils.book_append_sheet(wb, draftSheet, "Drafts")
  }

  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

// ───────────────────────── Slice E: redirect map + verification ─────────────────────────

export interface RedirectEntry {
  oldUrl: string
  newUrl: string
  pageId: string
  /** set after verification */
  status?: number | null
  resolved?: boolean
}

/** Extract Old→New redirect pairs from a parsed/edited worksheet (rows where New URL is filled). */
export function buildRedirectMap(existing: Map<string, WorksheetRecord>): RedirectEntry[] {
  const out: RedirectEntry[] = []
  for (const rec of existing.values()) {
    const oldUrl = (rec.oldUrl ?? "").trim()
    const newUrl = (rec.newUrl ?? "").trim()
    if (oldUrl && newUrl && oldUrl !== newUrl) {
      out.push({ oldUrl, newUrl, pageId: rec.pageId ?? "" })
    }
  }
  out.sort((a, b) => (a.pageId || "~").localeCompare(b.pageId || "~", undefined, { numeric: true }))
  return out
}

/** Verify each New URL actually resolves (2xx/3xx). Mutates entries with status/resolved. */
export async function verifyRedirects(entries: RedirectEntry[], concurrency = 8): Promise<RedirectEntry[]> {
  let idx = 0
  async function worker() {
    while (idx < entries.length) {
      const e = entries[idx++]!
      const c = await fetchPageContent(e.newUrl, 10000)
      e.status = c.status
      e.resolved = c.status != null && c.status >= 200 && c.status < 400
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()))
  return entries
}

function csvCell(v: unknown): string {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Render redirect entries as CSV, Apache .htaccess, and nginx configs. */
export function renderRedirects(entries: RedirectEntry[]): { csv: string; htaccess: string; nginx: string } {
  const csv = [
    "Page ID,Old URL,New URL,New URL Status,Resolves",
    ...entries.map((e) => [e.pageId, e.oldUrl, e.newUrl, e.status ?? "", e.resolved ? "yes" : e.resolved === false ? "NO" : ""].map(csvCell).join(",")),
  ].join("\r\n")

  const pathOf = (u: string) => {
    try {
      const url = new URL(u)
      return url.pathname + (url.search || "")
    } catch {
      return u
    }
  }
  const htaccess = entries.map((e) => `Redirect 301 ${pathOf(e.oldUrl)} ${e.newUrl}`).join("\n")
  const nginx = entries.map((e) => `rewrite ^${pathOf(e.oldUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$ ${e.newUrl} permanent;`).join("\n")
  return { csv, htaccess, nginx }
}

// ───────────────────────── .xlsx read (parse an edited sheet) ─────────────────────────

function normHeader(s: string): string {
  return String(s).replace(/\s+/g, " ").trim().toLowerCase()
}

/** Parse an uploaded (edited) worksheet back into records keyed by normalized Old URL. */
export function parseWorksheetXlsx(buffer: Buffer): Map<string, WorksheetRecord> {
  const wb = xlsx.read(buffer, { type: "buffer" })
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("content")) ?? wb.SheetNames[0]
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined
  const out = new Map<string, WorksheetRecord>()
  if (!sheet) return out

  const aoa = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: "" })
  // Locate the header row: the row containing our "Page ID" and "Navigation Title" headers.
  const wantPageId = normHeader("Page ID")
  const wantNav = normHeader("Navigation Title")
  let headerRow = -1
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const cells = (aoa[r] ?? []).map((c) => normHeader(c))
    if (cells.includes(wantPageId) && cells.includes(wantNav)) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) return out

  // Map each known column's key → the column index where its header appears (tolerates reordering).
  const headerCells = (aoa[headerRow] ?? []).map((c) => normHeader(c))
  const idxByKey = new Map<string, number>()
  for (const col of WORKSHEET_COLUMNS) {
    const idx = headerCells.indexOf(normHeader(col.header))
    if (idx >= 0) idxByKey.set(col.key, idx)
  }
  const oldUrlIdx = idxByKey.get("oldUrl")
  if (oldUrlIdx === undefined) return out

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? []
    const rawUrl = String(row[oldUrlIdx] ?? "").trim()
    if (!/^https?:\/\//i.test(rawUrl)) continue // skip rollup/blank/section rows
    const rec: WorksheetRecord = {}
    for (const col of WORKSHEET_COLUMNS) {
      const idx = idxByKey.get(col.key)
      rec[col.key] = idx === undefined ? "" : String(row[idx] ?? "").trim()
    }
    out.set(keyOf(rawUrl), rec)
  }
  return out
}

// ───────────────────────── Merge (the sync engine) ─────────────────────────

export interface SyncSummary {
  total: number
  added: number // pages new since the existing sheet
  removed: number // pages in the sheet no longer in the crawl (kept for redirects)
  humanColumnsPreserved: number
  dispositionsPreserved: number
}

/**
 * Merge a freshly-built worksheet with an existing (edited) one. Machine columns refresh,
 * human columns are preserved, dropped pages are kept (flagged), new pages are added.
 */
export function mergeWorksheets(
  fresh: WorksheetResult,
  existing: Map<string, WorksheetRecord>
): { rows: WorksheetRecord[]; summary: SyncSummary } {
  const byKey = new Map(fresh.rows.map((r) => [keyOf(r.oldUrl!), r]))
  const summary: SyncSummary = {
    total: 0,
    added: 0,
    removed: 0,
    humanColumnsPreserved: 0,
    dispositionsPreserved: 0,
  }
  const merged: WorksheetRecord[] = []

  for (const [key, freshRec] of byKey) {
    const prev = existing.get(key)
    if (!prev) {
      summary.added++
      merged.push(freshRec)
      continue
    }
    const rec: WorksheetRecord = { ...freshRec }
    const prevHasDisposition = DISPOSITION_KEYS.some((k) => (prev[k] ?? "").trim())
    if (prevHasDisposition) {
      for (const k of DISPOSITION_KEYS) rec[k] = prev[k] ?? ""
      summary.dispositionsPreserved++
    }
    for (const col of WORKSHEET_COLUMNS) {
      const prevVal = (prev[col.key] ?? "").trim()
      if (col.owner === "human") {
        rec[col.key] = prev[col.key] ?? ""
        if (prevVal) summary.humanColumnsPreserved++
      } else if (col.owner === "default") {
        if (prevVal) rec[col.key] = prev[col.key]!
      } else if (col.owner === "machine") {
        // Never wipe a human-entered value with a blank machine value (Slice B/C not filled yet).
        if (!(rec[col.key] ?? "").trim() && prevVal) rec[col.key] = prev[col.key]!
      }
    }
    merged.push(rec)
  }

  // Pages in the sheet but no longer crawled — keep them (Old URL must never vanish → redirects).
  for (const [key, prev] of existing) {
    if (byKey.has(key)) continue
    summary.removed++
    const rec: WorksheetRecord = { ...prev }
    const flag = "[Not in latest crawl] "
    if (!(rec.strat_notes ?? "").startsWith(flag)) rec.strat_notes = flag + (rec.strat_notes ?? "")
    merged.push(rec)
  }

  summary.total = merged.length
  // Keep a stable, useful order: by Page ID when present, else by URL.
  merged.sort((a, b) => (a.pageId || "~").localeCompare(b.pageId || "~", undefined, { numeric: true }) || (a.oldUrl || "").localeCompare(b.oldUrl || ""))
  return { rows: merged, summary }
}
