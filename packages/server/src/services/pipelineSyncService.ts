/**
 * Pipeline Sync Service
 *
 * COMPLETELY ISOLATED from the Q&A library system.
 * Handles Excel parsing and auto-sync for Proposal Planning Meeting Activity data.
 * This tracks RFP INTAKE decisions (Processed/Pass), not outcomes (Won/Lost).
 */

import xlsx from "xlsx"
const { readFile, utils } = xlsx
import fs from "fs"
import crypto from "crypto"
import { eq, desc, sql } from "drizzle-orm"
import { db, proposalPipeline, type NewProposalPipelineEntry } from "../db/index.js"

// Configuration from environment
const PIPELINE_FILE_PATH = process.env.PROPOSAL_PIPELINE_PATH || ""
const SYNC_INTERVAL_MS = parseInt(process.env.PIPELINE_SYNC_INTERVAL || "300000") // 5 min default

// Column mapping for Proposal Planning Meeting Activity.xlsx
const COLUMN_MAPPINGS = {
  dateReceived: ["date received", "date", "plans board date"],
  ce: ["ce", "account executive", "ae"],
  client: ["school/institution", "school", "institution", "client"],
  description: ["brief description of products/services", "brief description", "description", "products/services"],
  dueDate: ["due date", "deadline"],
  decision: ["processed or pass", "processed", "status"],
  extraInfo: ["extra info", "won/lost to…(if known)", "won/lost to", "notes"],
  followUp: ["follow up", "follow-up", "followup"],
}

interface ParsedPipelineEntry {
  row: number
  year: number
  dateReceived?: Date
  ce?: string
  client?: string
  description?: string
  dueDate?: Date
  decision?: string // "Processed" | "Passing" | "Cancelled" | "Reviewing" | etc.
  extraInfo?: string
  followUp?: string
}

let syncIntervalId: ReturnType<typeof setInterval> | null = null
let lastKnownMtime: number | null = null

/**
 * Generate fingerprint for deduplication
 */
function generatePipelineFingerprint(entry: ParsedPipelineEntry): string {
  const key = `${entry.year}|${entry.row}|${entry.client?.toLowerCase().trim() || ""}|${entry.dateReceived?.toISOString().split("T")[0] || ""}`
  return crypto.createHash("md5").update(key).digest("hex")
}

/**
 * Find column index by trying multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map((h) => h?.toLowerCase().trim() ?? "")

  for (const name of possibleNames) {
    const index = normalizedHeaders.findIndex(h => h.includes(name.toLowerCase()))
    if (index !== -1) return index
  }
  return -1
}

/**
 * Parse Excel serial date to JavaScript Date
 */
function parseExcelDate(value: unknown): Date | undefined {
  if (!value) return undefined

  // If it's already a Date
  if (value instanceof Date) return value

  // If it's a number (Excel serial date)
  if (typeof value === "number") {
    // Excel serial date: days since 1900-01-01
    const date = new Date((value - 25569) * 86400 * 1000)
    if (!isNaN(date.getTime())) return date
  }

  // If it's a string, try to parse
  if (typeof value === "string") {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  }

  return undefined
}

/**
 * Extract year from sheet name like "2024 Activity" or "2013"
 */
function extractYearFromSheetName(sheetName: string): number | null {
  const match = sheetName.match(/(\d{4})/)
  if (match) {
    const year = parseInt(match[1])
    if (year >= 2000 && year <= 2100) return year
  }
  return null
}

/**
 * Parse a single row from the Pipeline Activity spreadsheet
 */
function parseRow(
  row: unknown[],
  rowIndex: number,
  headers: string[],
  year: number,
  columnIndices: Record<string, number>
): ParsedPipelineEntry | null {
  // Skip completely empty rows
  if (!row || row.every((cell) => cell === null || cell === undefined || cell === "")) {
    return null
  }

  const getCell = (colName: keyof typeof COLUMN_MAPPINGS): unknown => {
    const idx = columnIndices[colName]
    return idx >= 0 ? row[idx] : undefined
  }

  const getCellString = (colName: keyof typeof COLUMN_MAPPINGS): string | undefined => {
    const val = getCell(colName)
    if (val === null || val === undefined) return undefined
    const str = String(val).trim()
    return str === "" ? undefined : str
  }

  const client = getCellString("client")
  const description = getCellString("description")
  const decision = getCellString("decision")

  // Skip rows that have no meaningful data
  if (!client && !description && !decision) {
    return null
  }

  return {
    row: rowIndex,
    year,
    dateReceived: parseExcelDate(getCell("dateReceived")),
    ce: getCellString("ce"),
    client,
    description,
    dueDate: parseExcelDate(getCell("dueDate")),
    decision,
    extraInfo: getCellString("extraInfo"),
    followUp: getCellString("followUp"),
  }
}

/**
 * Parse the entire Pipeline Activity workbook
 */
export function parsePipelineActivity(filePath: string): {
  entries: ParsedPipelineEntry[]
  errors: string[]
} {
  const entries: ParsedPipelineEntry[] = []
  const errors: string[] = []

  if (!fs.existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`)
    return { entries, errors }
  }

  try {
    const workbook = readFile(filePath)
    console.log(`[Pipeline] Found ${workbook.SheetNames.length} sheets:`, workbook.SheetNames)

    for (const sheetName of workbook.SheetNames) {
      const year = extractYearFromSheetName(sheetName)
      if (!year) {
        console.log(`[Pipeline] Skipping sheet "${sheetName}" - no year detected`)
        continue
      }

      const sheet = workbook.Sheets[sheetName]
      const data = utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

      if (data.length < 2) {
        console.log(`[Pipeline] Skipping sheet "${sheetName}" - no data rows`)
        continue
      }

      // First row is headers
      const headers = (data[0] as unknown[]).map((h) => String(h || "").toLowerCase().trim())

      // Build column index map
      const columnIndices: Record<string, number> = {}
      for (const [key, names] of Object.entries(COLUMN_MAPPINGS)) {
        columnIndices[key] = findColumnIndex(headers, names)
      }

      let sheetEntryCount = 0
      // Process data rows (skip header)
      for (let i = 1; i < data.length; i++) {
        try {
          const parsed = parseRow(data[i] as unknown[], i + 1, headers, year, columnIndices)
          if (parsed) {
            entries.push(parsed)
            sheetEntryCount++
          }
        } catch (err) {
          errors.push(`Row ${i + 1} in "${sheetName}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      console.log(`[Pipeline] Parsed ${sheetEntryCount} entries from "${sheetName}" (${year})`)
    }
  } catch (err) {
    errors.push(`Failed to read workbook: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { entries, errors }
}

/**
 * Sync pipeline data to database
 */
export async function syncPipeline(filePath?: string): Promise<{
  imported: number
  updated: number
  skipped: number
  errors: string[]
}> {
  const targetPath = filePath || PIPELINE_FILE_PATH

  if (!targetPath) {
    return { imported: 0, updated: 0, skipped: 0, errors: ["PROPOSAL_PIPELINE_PATH not configured"] }
  }

  const { entries, errors } = parsePipelineActivity(targetPath)

  if (entries.length === 0) {
    return { imported: 0, updated: 0, skipped: 0, errors: errors.length ? errors : ["No entries found"] }
  }

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    const fingerprint = generatePipelineFingerprint(entry)

    try {
      // Check if entry already exists
      const existing = await db
        .select()
        .from(proposalPipeline)
        .where(eq(proposalPipeline.fingerprint, fingerprint))
        .limit(1)

      const dbEntry: NewProposalPipelineEntry = {
        dateReceived: entry.dateReceived,
        ce: entry.ce,
        client: entry.client,
        description: entry.description,
        dueDate: entry.dueDate,
        decision: entry.decision,
        extraInfo: entry.extraInfo,
        followUp: entry.followUp,
        year: entry.year,
        fingerprint,
      }

      if (existing.length === 0) {
        await db.insert(proposalPipeline).values(dbEntry)
        imported++
      } else {
        // Update if data changed
        await db
          .update(proposalPipeline)
          .set(dbEntry)
          .where(eq(proposalPipeline.fingerprint, fingerprint))
        updated++
      }
    } catch (err) {
      errors.push(`Failed to sync row ${entry.row} (${entry.year}): ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  console.log(`[Pipeline] Sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`)
  if (errors.length > 0) {
    console.log(`[Pipeline] Errors:`, errors.slice(0, 5))
  }

  return { imported, updated, skipped, errors }
}

/**
 * Get all pipeline entries from database
 */
export async function getAllPipelineEntries() {
  return db.select().from(proposalPipeline).orderBy(desc(proposalPipeline.dateReceived))
}

/**
 * Get pipeline statistics for AI context
 */
export async function getPipelineStats() {
  const entries = await getAllPipelineEntries()

  // Calculate overall stats
  const total = entries.length
  const processed = entries.filter(e => e.decision?.toLowerCase().includes("processed")).length
  const passing = entries.filter(e => e.decision?.toLowerCase().includes("pass")).length
  const cancelled = entries.filter(e => e.decision?.toLowerCase().includes("cancel")).length
  const reviewing = entries.filter(e => e.decision?.toLowerCase().includes("review")).length
  const other = total - processed - passing - cancelled - reviewing

  // Pass reasons analysis (from extraInfo field)
  const passReasons: Record<string, number> = {}
  entries
    .filter(e => e.decision?.toLowerCase().includes("pass") && e.extraInfo)
    .forEach(e => {
      const info = e.extraInfo!.toLowerCase()
      if (info.includes("budget") || info.includes("low budget") || info.includes("pricing")) {
        passReasons["Budget concerns"] = (passReasons["Budget concerns"] || 0) + 1
      } else if (info.includes("not a good fit") || info.includes("not good fit")) {
        passReasons["Not a good fit"] = (passReasons["Not a good fit"] || 0) + 1
      } else if (info.includes("incumbent")) {
        passReasons["Incumbent advantage"] = (passReasons["Incumbent advantage"] || 0) + 1
      } else if (info.includes("hub") || info.includes("local") || info.includes("texas") || info.includes("in-state")) {
        passReasons["HUB/Local preference"] = (passReasons["HUB/Local preference"] || 0) + 1
      } else if (info.includes("timeline") || info.includes("time frame") || info.includes("short")) {
        passReasons["Timeline too short"] = (passReasons["Timeline too short"] || 0) + 1
      } else if (info.includes("diversity") || info.includes("mwbe") || info.includes("subcontract")) {
        passReasons["Diversity/subcontracting requirements"] = (passReasons["Diversity/subcontracting requirements"] || 0) + 1
      } else {
        passReasons["Other"] = (passReasons["Other"] || 0) + 1
      }
    })

  // By year
  const byYear: Record<number, { total: number; processed: number; passing: number }> = {}
  entries.forEach(e => {
    if (!e.year) return
    if (!byYear[e.year]) byYear[e.year] = { total: 0, processed: 0, passing: 0 }
    byYear[e.year].total++
    if (e.decision?.toLowerCase().includes("processed")) byYear[e.year].processed++
    if (e.decision?.toLowerCase().includes("pass")) byYear[e.year].passing++
  })

  // By CE
  const byCE: Record<string, { total: number; processed: number; passing: number }> = {}
  entries.forEach(e => {
    if (!e.ce) return
    // Normalize CE name (first name only for brevity)
    const ceName = e.ce.split("/")[0].split(" ")[0].trim()
    if (!byCE[ceName]) byCE[ceName] = { total: 0, processed: 0, passing: 0 }
    byCE[ceName].total++
    if (e.decision?.toLowerCase().includes("processed")) byCE[ceName].processed++
    if (e.decision?.toLowerCase().includes("pass")) byCE[ceName].passing++
  })

  // Recent entries (last 20)
  const recentEntries = entries.slice(0, 20)

  return {
    total,
    processed,
    passing,
    cancelled,
    reviewing,
    other,
    pursuitRate: total > 0 ? processed / total : 0,
    passReasons,
    byYear,
    byCE,
    recentEntries,
  }
}

/**
 * Get sync status
 */
export function getPipelineSyncStatus(): {
  configured: boolean
  filePath: string
  lastSync: Date | null
  nextSyncIn: number | null
} {
  return {
    configured: !!PIPELINE_FILE_PATH,
    filePath: PIPELINE_FILE_PATH,
    lastSync: lastKnownMtime ? new Date(lastKnownMtime) : null,
    nextSyncIn: syncIntervalId ? SYNC_INTERVAL_MS : null,
  }
}

/**
 * Check file and sync if modified
 */
async function checkAndSync(): Promise<void> {
  if (!PIPELINE_FILE_PATH) return

  try {
    const stats = fs.statSync(PIPELINE_FILE_PATH)
    const currentMtime = stats.mtimeMs

    if (lastKnownMtime === null || currentMtime !== lastKnownMtime) {
      console.log("[Pipeline] File changed, syncing...")
      await syncPipeline()
      lastKnownMtime = currentMtime
    }
  } catch (err) {
    console.error("[Pipeline] Check failed:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Start automatic sync polling
 */
export function startPipelineSyncPolling(): void {
  if (!PIPELINE_FILE_PATH) {
    console.log("[Pipeline] PROPOSAL_PIPELINE_PATH not set, sync disabled")
    return
  }

  console.log(`[Pipeline] Starting sync polling (every ${SYNC_INTERVAL_MS / 1000}s)`)
  console.log(`[Pipeline] File: ${PIPELINE_FILE_PATH}`)

  // Initial sync
  checkAndSync()

  // Set up interval
  syncIntervalId = setInterval(checkAndSync, SYNC_INTERVAL_MS)
}

/**
 * Stop sync polling
 */
export function stopPipelineSyncPolling(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
    console.log("[Pipeline] Sync polling stopped")
  }
}
