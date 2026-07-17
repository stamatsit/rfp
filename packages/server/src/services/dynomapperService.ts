/**
 * DynoMapper Content Matrix service
 * ----------------------------------
 * Reads already-crawled DynoMapper projects and flattens them into a per-page
 * "content matrix" for CSV export + optional AI-drafted remediation columns.
 *
 * Restricted feature — routes are gated to eric.yerke@stamats.com. This service
 * only ever runs server-side; the DynoMapper Personal Access Token
 * (DYNOMAPPER_TOKEN) is never exposed to the browser.
 *
 * ── API quirks this file works around (verified against the live API) ──
 *   • GET /v1/project/{id}/item  — flat page list, but the `page` param is
 *     IGNORED and it truncates large sites (returns ~311 of 536). It's still the
 *     best backbone; we request a high limit and note truncation.
 *   • GET /v1/inventory/{id}     — effectively broken for bulk reads (returns 0
 *     at limit>=50, page 2 is always empty). We DO NOT use it.
 *   • GET /v1/audit/{id}/{kind}  — the reliable, correctly-paginated source. All
 *     per-page issue flags come from here, so every flagged page is included even
 *     when the /item backbone truncates.
 */

import OpenAI from "openai"

const DYNO_BASE = "https://api.dynomapper.com"

export class DynoError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "DynoError"
  }
}

function token(): string {
  return (process.env.DYNOMAPPER_TOKEN ?? "").trim()
}

export function isConfigured(): boolean {
  return token().length > 0
}

async function dyno<T>(path: string): Promise<T> {
  if (!isConfigured()) {
    throw new DynoError(503, "DynoMapper is not configured (missing DYNOMAPPER_TOKEN)")
  }
  const res = await fetch(`${DYNO_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new DynoError(res.status, `DynoMapper ${res.status} on ${path}${body ? `: ${body.slice(0, 200)}` : ""}`)
  }
  return res.json() as Promise<T>
}

// ───────────────────────────── Projects ─────────────────────────────

export interface DynoProject {
  id: number
  alphaId: string | null
  title: string
  domain: string | null
  pages: number
  crawlDate: string | null
  sitemapUrl: string | null
}

export async function listProjects(): Promise<DynoProject[]> {
  const data = await dyno<{ items?: any[] }>("/v1/project?limit=100&page=1")
  const items = data.items ?? []
  return items
    .map((p): DynoProject => ({
      id: p.id,
      alphaId: p.alphaId ?? null,
      title: p.title ?? p.domain ?? `Project ${p.id}`,
      domain: p.domain ?? null,
      pages: typeof p.items === "number" ? p.items : 0,
      crawlDate: p.crawlDate ?? p.createdAt ?? null,
      sitemapUrl: p.sitemapUrl ?? null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

// ───────────────────────────── Matrix ─────────────────────────────

export interface MatrixRow {
  url: string
  title: string
  /** page type from the /item backbone ("" when the row only came from an audit list) */
  type: string
  depth: number | null
  /** HTTP link status if the crawler recorded one */
  status: number | null
  issues: string[]
  issueCount: number
  /** whether the row was present in the (possibly truncated) /item page list */
  inPageList: boolean
  /** AI-generated columns, filled in by enrichRows() */
  ai?: Record<string, string>
}

export interface MatrixResult {
  project: { id: number; title: string; domain: string | null; crawlDate: string | null }
  rows: MatrixRow[]
  /** total pages DynoMapper reports for the crawl (may exceed what /item returns) */
  pageListTotal: number
  /** how many real pages the /item backbone actually returned */
  pageListReturned: number
  /** true when the backbone truncated — flagged pages are still complete via audit */
  truncated: boolean
  issueSummary: { label: string; count: number }[]
  generatedAt: string
}

/** Normalize a URL for joining across endpoints (protocol/host-insensitive, no trailing slash). */
export function keyOf(url: string): string {
  if (!url) return ""
  let u = url.trim()
  u = u.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase()
  return u
}

/** Audit issue lists → human label. Each returns page-level rows keyed by `url` (dup lists use `urls[]`). */
const AUDIT_KINDS: { kind: string; label: string; grouped?: boolean }[] = [
  { kind: "missing-title", label: "Missing title" },
  { kind: "long-title", label: "Long title" },
  { kind: "duplicate-title", label: "Duplicate title", grouped: true },
  { kind: "missing-description", label: "Missing meta description" },
  { kind: "long-description", label: "Long meta description" },
  { kind: "duplicate-description", label: "Duplicate meta description", grouped: true },
  { kind: "orphan-pages", label: "Orphan page" },
  { kind: "non-crawlable", label: "Non-crawlable" },
  { kind: "non-indexable", label: "Non-indexable" },
  { kind: "client-error", label: "Client error (4xx)" },
]

/** Page a properly-paginating audit list to completion. Defensive against a page param being ignored. */
async function fetchAllAudit(projectId: number, kind: string): Promise<any[]> {
  const out: any[] = []
  const seen = new Set<string>()
  const PAGE = 100
  for (let page = 1; page <= 40; page++) {
    let data: { items?: any[] }
    try {
      data = await dyno<{ items?: any[] }>(`/v1/audit/${projectId}/${kind}?limit=${PAGE}&page=${page}`)
    } catch {
      break // tolerate a missing/failing audit family — matrix still builds from the rest
    }
    const items = data.items ?? []
    if (items.length === 0) break
    let added = 0
    for (const it of items) {
      const k = String(it.id ?? JSON.stringify(it))
      if (!seen.has(k)) {
        seen.add(k)
        out.push(it)
        added++
      }
    }
    if (added === 0) break // page didn't advance (param ignored) — stop to avoid a loop
    if (items.length < PAGE) break // last page
  }
  return out
}

export async function buildMatrix(projectId: number): Promise<MatrixResult> {
  // 1. Backbone: the flat page list (high limit; `page` is ignored server-side).
  const itemData = await dyno<{ total?: number; items?: any[] }>(
    `/v1/project/${projectId}/item?limit=5000&page=1`
  )
  const rawItems = itemData.items ?? []
  const pageListTotal = typeof itemData.total === "number" ? itemData.total : rawItems.length

  const rowByKey = new Map<string, MatrixRow>()
  let realPages = 0
  for (const it of rawItems) {
    const url = (it.url ?? "").trim()
    if (!url) continue // skip containers/nav folders — they have no URL
    const k = keyOf(url)
    if (rowByKey.has(k)) continue
    realPages++
    rowByKey.set(k, {
      url,
      title: (it.title ?? "").trim(),
      type: it.type ?? "",
      depth: typeof it.depth === "number" ? it.depth : null,
      status: typeof it.linkStatus === "number" ? it.linkStatus : null,
      issues: [],
      issueCount: 0,
      inPageList: true,
    })
  }

  // 2. Issue overlays from the reliable audit lists (run in parallel).
  const auditResults = await Promise.all(
    AUDIT_KINDS.map(async (a) => ({ ...a, items: await fetchAllAudit(projectId, a.kind) }))
  )

  const issueSummary: { label: string; count: number }[] = []
  for (const a of auditResults) {
    let count = 0
    for (const it of a.items) {
      // Grouped lists (duplicate-*) carry a `urls[]` array; flat lists carry a single `url`.
      const urls: string[] = a.grouped && Array.isArray(it.urls)
        ? it.urls
        : it.url
          ? [it.url]
          : []
      for (const rawUrl of urls) {
        const url = String(rawUrl).trim()
        if (!url) continue
        const k = keyOf(url)
        let row = rowByKey.get(k)
        if (!row) {
          // Flagged page missing from the (truncated) backbone — add it so remediation is complete.
          row = {
            url,
            title: (it.title ?? "").trim(),
            type: "",
            depth: null,
            status: typeof it.status === "number" ? it.status : null,
            issues: [],
            issueCount: 0,
            inPageList: false,
          }
          rowByKey.set(k, row)
        }
        if (!row.title && it.title) row.title = String(it.title).trim()
        if (!row.issues.includes(a.label)) {
          row.issues.push(a.label)
          count++
        }
      }
    }
    if (count > 0) issueSummary.push({ label: a.label, count })
  }

  const rows = Array.from(rowByKey.values())
  for (const r of rows) r.issueCount = r.issues.length

  // Sort: most issues first (the worklist self-prioritizes), then by URL.
  rows.sort((a, b) => b.issueCount - a.issueCount || a.url.localeCompare(b.url))
  issueSummary.sort((a, b) => b.count - a.count)

  const project = await getProjectMeta(projectId)

  return {
    project,
    rows,
    pageListTotal,
    pageListReturned: realPages,
    truncated: realPages < pageListTotal,
    issueSummary,
    generatedAt: new Date().toISOString(),
  }
}

async function getProjectMeta(
  projectId: number
): Promise<MatrixResult["project"]> {
  try {
    const data = await dyno<any>(`/v1/project/${projectId}`)
    return {
      id: projectId,
      title: data.title ?? data.domain ?? `Project ${projectId}`,
      domain: data.domain ?? null,
      crawlDate: data.crawlDate ?? data.createdAt ?? null,
    }
  } catch {
    return { id: projectId, title: `Project ${projectId}`, domain: null, crawlDate: null }
  }
}

// ───────────────────────────── AI enrichment ─────────────────────────────

export type AiField =
  | "summary"
  | "contentType"
  | "audience"
  | "funnelStage"
  | "rot"
  | "draftTitle"
  | "draftMeta"

export const AI_FIELD_LABELS: Record<AiField, string> = {
  summary: "Summary",
  contentType: "Content type",
  audience: "Audience",
  funnelStage: "Funnel stage",
  rot: "ROT verdict",
  draftTitle: "Drafted title",
  draftMeta: "Drafted meta description",
}

const FIELD_INSTRUCTIONS: Record<AiField, string> = {
  summary: `"summary": one plain sentence describing what the page is about (infer from URL + title).`,
  contentType: `"contentType": one of Program, Admissions, Academics, Faculty/Staff, News, Event, Student Life, Athletics, Financial Aid, Form/Application, Landing, About, Other.`,
  audience: `"audience": primary audience — one of Prospective student, Current student, Parent/Family, Alumni/Donor, Faculty/Staff, General.`,
  funnelStage: `"funnelStage": one of Awareness, Consideration, Decision.`,
  rot: `"rot": a content-audit verdict — one of Keep, Update, Merge, Kill — followed by " — " and a 6-word-max reason. Weight the page's issue flags heavily.`,
  draftTitle: `"draftTitle": a rewritten <title> tag, max 60 characters, specific and keyword-aware. Only meaningful when the page has a title issue, but always provide one.`,
  draftMeta: `"draftMeta": a compelling meta description, 150-160 characters, no quotes. Only meaningful when the page has a meta issue, but always provide one.`,
}

export const MAX_ENRICH_ROWS = 400
const BATCH_SIZE = 20

let _openai: OpenAI | null = null
function openai(): OpenAI | null {
  if (!_openai && process.env.OPENAI_API_KEY) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

export interface EnrichInputRow {
  url: string
  title: string
  type: string
  issues: string[]
}

/**
 * Generate the requested AI columns for a set of rows. Returns a map from URL to
 * { field: value }. Drafts are inferred from URL + title + issue flags (DynoMapper's
 * inventory endpoint can't reliably serve page body text), so they are suggestions
 * to review, not final copy.
 */
export async function enrichRows(
  rows: EnrichInputRow[],
  fields: AiField[],
  context?: { domain?: string | null; title?: string | null }
): Promise<Record<string, Record<string, string>>> {
  const client = openai()
  if (!client) throw new DynoError(503, "AI enrichment is not configured (missing OPENAI_API_KEY)")
  const wanted = fields.filter((f) => f in AI_FIELD_LABELS)
  if (wanted.length === 0) return {}

  const capped = rows.slice(0, MAX_ENRICH_ROWS)
  const result: Record<string, Record<string, string>> = {}
  const fieldSpec = wanted.map((f) => `  - ${FIELD_INSTRUCTIONS[f]}`).join("\n")
  const site = context?.domain ? ` The site is ${context.domain} (${context.title ?? "higher-education institution"}).` : ""

  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    const batch = capped.slice(i, i + BATCH_SIZE)
    const pages = batch.map((r, idx) => ({
      i: idx,
      url: r.url,
      title: r.title || "(no title)",
      type: r.type || "",
      issues: r.issues,
    }))

    const prompt = `You are a higher-education website content strategist.${site}
For each page below, return the requested fields. Infer from the URL, current title, and the listed issue flags — you do not have the page body, so keep inferences reasonable and never invent specific facts (numbers, dates, names).

Return STRICT JSON: {"pages":[{"i":<index>, ${wanted.map((f) => `"${f}":"..."`).join(", ")}}]}. One object per input page, same "i".

Fields:
${fieldSpec}

Pages:
${JSON.stringify(pages)}`

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      })
      const raw = completion.choices[0]?.message?.content ?? "{}"
      const parsed = JSON.parse(raw)
      const outPages: any[] = Array.isArray(parsed.pages) ? parsed.pages : []
      for (const p of outPages) {
        const idx = typeof p.i === "number" ? p.i : -1
        const row = batch[idx]
        if (!row) continue
        const cell: Record<string, string> = {}
        for (const f of wanted) {
          if (typeof p[f] === "string") cell[f] = p[f].trim()
        }
        result[row.url] = cell
      }
    } catch (err: any) {
      // Batch failed — leave those rows un-enriched rather than aborting the whole run.
      console.warn(`[dynomapper] enrich batch ${i / BATCH_SIZE} failed:`, err?.message)
    }
  }

  return result
}

// ───────────────────────── Migration worksheet support ─────────────────────────

/** Raw page-list items (with tree fields: parent, ordering, depth) for Page-ID generation. */
export interface DynoItem {
  id: number
  url: string
  title: string
  type: string
  parent: number
  ordering: number
  depth: number
}

export async function fetchProjectItems(projectId: number): Promise<DynoItem[]> {
  const data = await dyno<{ items?: any[] }>(`/v1/project/${projectId}/item?limit=5000&page=1`)
  return (data.items ?? []).map((it): DynoItem => ({
    id: Number(it.id),
    url: (it.url ?? "").trim(),
    title: (it.title ?? "").trim(),
    type: it.type ?? "",
    parent: Number(it.parent ?? 0),
    ordering: Number(it.ordering ?? 0),
    depth: Number(it.depth ?? 0),
  }))
}

/** Stamats migration worksheet disposition taxonomy (STATUS phase). */
export const MIGRATION_DISPOSITIONS = [
  "Delete",
  "Reuse",
  "Write New",
  "Revise",
  "Optimize",
  "As Is",
  "Import",
] as const
export type MigrationDisposition = (typeof MIGRATION_DISPOSITIONS)[number]

export interface MigrationFields {
  /** one of MIGRATION_DISPOSITIONS */
  disposition: string
  /** e.g. Program, Landing, Article/News, Bio, Form, Hub/Index, Resource, Event, Other */
  contentTemplate: string
  /** short "what to do" note for the strategist */
  notes: string
}

/**
 * Generate the machine-suggested STATUS + WRITING fields (disposition, content template,
 * strategy note) in Stamats' migration taxonomy. Inferred from URL + title + issue flags
 * (no page body yet — Slice B will fetch bodies for higher fidelity).
 */
export async function generateMigrationFields(
  rows: EnrichInputRow[],
  context?: { domain?: string | null; title?: string | null }
): Promise<Record<string, MigrationFields>> {
  const client = openai()
  if (!client) throw new DynoError(503, "AI is not configured (missing OPENAI_API_KEY)")
  const capped = rows.slice(0, MAX_ENRICH_ROWS)
  const result: Record<string, MigrationFields> = {}
  const site = context?.domain ? ` Site: ${context.domain} (${context.title ?? "higher-ed institution"}).` : ""

  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    const batch = capped.slice(i, i + BATCH_SIZE)
    const pages = batch.map((r, idx) => ({ i: idx, url: r.url, title: r.title || "(no title)", issues: r.issues }))
    const prompt = `You are a higher-education content-migration strategist.${site}
For each page, decide how it should be handled in a website migration. Infer from URL, title, and issue flags; never invent specific facts.

Return STRICT JSON: {"pages":[{"i":<index>,"disposition":"...","contentTemplate":"...","notes":"..."}]}, one per input page, same "i".
- "disposition": EXACTLY one of ${MIGRATION_DISPOSITIONS.map((d) => `"${d}"`).join(", ")}. Use "Delete" for error/dead pages, "As Is" for clean utility pages, "Revise"/"Optimize" for pages with issues, "Write New" for thin/outdated primary content.
- "contentTemplate": one of "Program","Landing","Article/News","Bio","Form","Hub/Index","Resource","Event","Other".
- "notes": <=15 words, the concrete action for this page.

Pages:
${JSON.stringify(pages)}`
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}")
      const outPages: any[] = Array.isArray(parsed.pages) ? parsed.pages : []
      for (const p of outPages) {
        const row = batch[typeof p.i === "number" ? p.i : -1]
        if (!row) continue
        const disp = MIGRATION_DISPOSITIONS.includes(p.disposition) ? p.disposition : ""
        result[row.url] = {
          disposition: disp,
          contentTemplate: typeof p.contentTemplate === "string" ? p.contentTemplate.trim() : "",
          notes: typeof p.notes === "string" ? p.notes.trim() : "",
        }
      }
    } catch (err: any) {
      console.warn(`[dynomapper] migration batch ${i / BATCH_SIZE} failed:`, err?.message)
    }
  }
  return result
}

// ── Slice B: body-based audit + strategy ──

export interface AuditInput {
  url: string
  title: string
  headings: string[]
  text: string
}

export interface AuditFields {
  tone: string
  conversion: string
  readability: string
  scannability: string
  keywords: string
  ctas: string
  crossLinks: string
}

const AUDIT_BATCH = 6

/** Score AUDIT + STRATEGY columns from real page body content (fetched separately). */
export async function generateAuditFields(
  pages: AuditInput[],
  context?: { domain?: string | null; title?: string | null }
): Promise<Record<string, AuditFields>> {
  const client = openai()
  if (!client) throw new DynoError(503, "AI is not configured (missing OPENAI_API_KEY)")
  const result: Record<string, AuditFields> = {}
  const site = context?.domain ? ` Site: ${context.domain} (${context.title ?? "higher-ed institution"}).` : ""

  for (let i = 0; i < pages.length; i += AUDIT_BATCH) {
    const batch = pages.slice(i, i + AUDIT_BATCH)
    const payload = batch.map((p, idx) => ({
      i: idx,
      url: p.url,
      title: p.title || "(no title)",
      headings: p.headings.slice(0, 12),
      excerpt: (p.text || "").slice(0, 1400),
    }))
    const prompt = `You are a higher-education content auditor.${site}
Audit each page from its actual content below. Be concise and concrete.

Return STRICT JSON: {"pages":[{"i":<index>,"tone":"...","conversion":"...","readability":"...","scannability":"...","keywords":"...","ctas":"...","crossLinks":"..."}]}, one per input page, same "i".
- "tone": 2-4 words describing voice (e.g. "Formal, institutional").
- "conversion": <=10 words on conversion strength (CTAs, next steps).
- "readability": <=10 words (reading level, sentence density) e.g. "Grade 13, dense".
- "scannability": <=10 words (headings, lists, chunking).
- "keywords": 3-5 comma-separated target keywords/phrases.
- "ctas": the primary call-to-action this page should have.
- "crossLinks": 2-3 comma-separated internal topics this page should link to.

Pages:
${JSON.stringify(payload)}`
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}")
      const outPages: any[] = Array.isArray(parsed.pages) ? parsed.pages : []
      for (const p of outPages) {
        const row = batch[typeof p.i === "number" ? p.i : -1]
        if (!row) continue
        const s = (v: any) => (typeof v === "string" ? v.trim() : "")
        result[row.url] = {
          tone: s(p.tone),
          conversion: s(p.conversion),
          readability: s(p.readability),
          scannability: s(p.scannability),
          keywords: s(p.keywords),
          ctas: s(p.ctas),
          crossLinks: s(p.crossLinks),
        }
      }
    } catch (err: any) {
      console.warn(`[dynomapper] audit batch ${i / AUDIT_BATCH} failed:`, err?.message)
    }
  }
  return result
}

// ── Slice C: AI drafting ──

export interface DraftInput {
  url: string
  title: string
  template: string
  audience?: string
  headings: string[]
  text: string
}

/** Generate a first-pass page draft (markdown) from the current content. One call per page. */
export async function generateDraft(page: DraftInput, context?: { domain?: string | null; title?: string | null }): Promise<string> {
  const client = openai()
  if (!client) throw new DynoError(503, "AI is not configured (missing OPENAI_API_KEY)")
  const site = context?.domain ? ` for ${context.domain} (${context.title ?? "a higher-ed institution"})` : ""
  const prompt = `You are a senior higher-education content writer${site}. Write a clean first-pass DRAFT for the page below, using its current content as source material. Improve clarity, scannability, and conversion; keep it accurate — do NOT invent specific facts (tuition numbers, dates, names, credits) that aren't in the source; where a specific fact is needed but missing, insert a bracketed placeholder like [confirm credit hours].

Page: ${page.title || page.url}
Template: ${page.template || "generic"}${page.audience ? `\nPrimary audience: ${page.audience}` : ""}
Current headings: ${page.headings.slice(0, 15).join(" | ") || "(none)"}

Current content (source):
${(page.text || "").slice(0, 4000)}

Return the draft in Markdown: an H1, a short intro, well-structured H2/H3 sections with concise scannable copy, and a clear call-to-action at the end. No preamble, output only the draft.`
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages: [{ role: "user", content: prompt }],
  })
  return (completion.choices[0]?.message?.content ?? "").trim()
}
