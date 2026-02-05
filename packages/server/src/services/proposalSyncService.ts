/**
 * Proposal Sync Service
 *
 * COMPLETELY ISOLATED from the Q&A library system.
 * Handles Excel parsing and auto-sync for Proposal Summary data.
 * Supports ALL 5 SHEETS and captures EVERY CELL.
 */

import xlsx from "xlsx"
const { readFile, utils } = xlsx
import fs from "fs"
import crypto from "crypto"
import { eq, desc, sql } from "drizzle-orm"
import { db, proposals, proposalSyncLog, type Proposal, type NewProposal } from "../db/index.js"

// Configuration from environment
const PROPOSAL_FILE_PATH = process.env.PROPOSAL_SUMMARY_PATH || ""
const SYNC_INTERVAL_MS = parseInt(process.env.PROPOSAL_SYNC_INTERVAL || "300000") // 5 min default

// Column mapping for Proposal Summary.xlsx (common across all sheets)
const COLUMN_MAPPINGS = {
  date: ["date", "proposal date", "rfp date"],
  ce: ["ce", "account executive", "ae", "client executive"],
  client: ["client", "client name", "institution", "school"],
  projectType: ["project type", "type", "project"],
  rfpNumber: ["rfp #", "rfp number", "rfp no", "rfp"],
  won: ["won yes/no", "won", "win", "outcome", "status"],
  schoolType: ["school type", "institution type"],
  affiliation: ["affiliation", "religious affiliation", "sector"],
  presentationDate: ["presentation date", "presentation"],
  estimatedLaunchDate: ["estimated launch date", "estimated launch"],
  actualLaunchDate: ["actual launch date", "actual launch"],
  cmsType: ["actual cms", "cms", "cms type"],
  websiteLink: ["link to website", "website link", "website"],
}

// Link column patterns
const LINK_PATTERNS = ["link", "url", "proposal link", "cost proposal", "technical proposal", "additional links"]

// Category normalization for sheet names
function normalizeCategory(sheetName: string): string {
  const lower = sheetName.toLowerCase()
  if (lower.includes("research")) return "research"
  if (lower.includes("creative") || lower.includes("brand")) return "creative"
  if (lower.includes("digital") || lower.includes("marketing")) return "digital"
  if (lower.includes("website") || lower.includes("redesign")) return "website"
  if (lower.includes("pr")) return "pr"
  return "other"
}

interface ParsedProposal {
  row: number
  sheetName: string
  category: string
  date?: Date
  ce?: string
  client?: string  // Now optional - some rows may not have client names
  projectType?: string
  rfpNumber?: string
  won?: "Yes" | "No" | "Pending" | "Cancelled"
  schoolType?: string
  affiliation?: string
  servicesOffered: string[]
  documentLinks: Record<string, string>
  rawData: Record<string, string>  // ALL cells from the row
  presentationDate?: Date
  estimatedLaunchDate?: Date
  actualLaunchDate?: Date
  cmsType?: string
  websiteLink?: string
}

interface SyncIssue {
  row: number
  message: string
}

let syncIntervalId: ReturnType<typeof setInterval> | null = null
let lastKnownMtime: number | null = null

/**
 * Generate fingerprint for deduplication
 * Uses sheetName + row number + client + rfp number as unique key
 * This ensures uniqueness across all sheets
 */
function generateProposalFingerprint(proposal: ParsedProposal): string {
  const key = `${proposal.sheetName}|${proposal.row}|${proposal.client?.toLowerCase().trim() || ""}|${proposal.rfpNumber?.toLowerCase().trim() || ""}|${proposal.date?.toISOString().split("T")[0] || ""}`
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
 * Detect which columns are service checkboxes
 * Services are columns with X marks (not metadata columns)
 */
function detectServiceColumns(headers: string[], metadataColumns: Set<number>): Map<string, number> {
  const serviceColumns = new Map<string, number>()

  headers.forEach((header, idx) => {
    if (metadataColumns.has(idx)) return // Skip known metadata columns
    if (!header || header.trim() === "") return

    const normalized = header.toLowerCase().trim()

    // Skip link columns
    if (LINK_PATTERNS.some(p => normalized.includes(p))) return

    // Skip presentation date column
    if (normalized.includes("presentation")) return

    // This is likely a service column
    serviceColumns.set(header.trim(), idx)
  })

  return serviceColumns
}

/**
 * Detect link columns
 */
function detectLinkColumns(headers: string[]): Map<string, number> {
  const linkColumns = new Map<string, number>()

  headers.forEach((header, idx) => {
    if (!header) return
    const normalized = header.toLowerCase().trim()

    if (LINK_PATTERNS.some(p => normalized.includes(p))) {
      linkColumns.set(header.trim(), idx)
    }
  })

  return linkColumns
}

/**
 * Parse a date value from Excel (handles serial numbers and strings)
 */
function parseExcelDate(value: string | number | undefined): Date | undefined {
  if (!value) return undefined

  if (typeof value === "number") {
    // Excel date serial number
    return new Date((value - 25569) * 86400 * 1000)
  }

  const strValue = String(value).trim()
  if (!strValue) return undefined

  const parsed = new Date(strValue)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }
  return undefined
}

/**
 * Parse the Proposal Summary Excel file - ALL 5 SHEETS
 */
export function parseProposalSummary(filePath: string): {
  proposals: ParsedProposal[]
  issues: SyncIssue[]
} {
  const workbook = readFile(filePath)

  if (workbook.SheetNames.length === 0) {
    throw new Error("No sheets found in workbook")
  }

  const proposalsList: ParsedProposal[] = []
  const issues: SyncIssue[] = []

  // Process ALL sheets
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const category = normalizeCategory(sheetName)

    const data = utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false, // Get formatted strings
    })

    if (data.length < 2) {
      issues.push({ row: 0, message: `Sheet "${sheetName}" has no data rows` })
      continue
    }

    const headers = (data[0] || []).map((h) => String(h || ""))

    // Find metadata column indices
    const columnMap = new Map<string, number>()
    const metadataColumns = new Set<number>()

    for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      const idx = findColumnIndex(headers, aliases)
      if (idx !== -1) {
        columnMap.set(field, idx)
        metadataColumns.add(idx)
      }
    }

    // Mark link columns as metadata too
    const linkColumns = detectLinkColumns(headers)
    linkColumns.forEach((idx) => metadataColumns.add(idx))

    // Detect service columns (everything else with data)
    const serviceColumns = detectServiceColumns(headers, metadataColumns)

    // Process each row in this sheet
    for (let i = 1; i < data.length; i++) {
      const rowData = data[i]
      if (!rowData) continue

      // Skip completely empty rows
      const hasData = rowData.some((cell) => cell !== undefined && cell !== "")
      if (!hasData) continue

      const rowNumber = i + 1

      // Capture ALL cells into rawData (EVERY SINGLE CELL)
      const rawData: Record<string, string> = {}
      headers.forEach((header, idx) => {
        if (header && rowData[idx] !== undefined && rowData[idx] !== "") {
          const value = String(rowData[idx]).trim()
          if (value) {
            rawData[header] = value
          }
        }
      })

      // Extract client (now optional - don't skip rows without client)
      const clientIdx = columnMap.get("client")
      const client = clientIdx !== undefined ? String(rowData[clientIdx] || "").trim() || undefined : undefined

      // Extract date
      const dateIdx = columnMap.get("date")
      const date = dateIdx !== undefined ? parseExcelDate(rowData[dateIdx]) : undefined

      // Parse won field
      const wonIdx = columnMap.get("won")
      let won: "Yes" | "No" | "Pending" | "Cancelled" | undefined
      if (wonIdx !== undefined) {
        const wonValue = String(rowData[wonIdx] || "").trim().toLowerCase()
        if (wonValue === "yes" || wonValue === "y") {
          won = "Yes"
        } else if (wonValue === "no" || wonValue === "n" || wonValue.includes("not awarded") || wonValue.includes("presented")) {
          won = "No"
        } else if (wonValue.includes("cancel")) {
          won = "Cancelled"
        } else if (wonValue) {
          won = "Pending"
        }
      }

      // Extract services offered (where X is marked)
      const servicesOffered: string[] = []
      for (const [serviceName, colIdx] of serviceColumns) {
        const value = String(rowData[colIdx] || "").trim().toLowerCase()
        if (value === "x" || value === "yes" || value === "1" || value === "true") {
          servicesOffered.push(serviceName)
        }
      }

      // Extract document links
      const documentLinks: Record<string, string> = {}
      for (const [linkName, colIdx] of linkColumns) {
        const value = String(rowData[colIdx] || "").trim()
        if (value && value.length > 0) {
          // Include all links, not just URLs (could be file paths or doc names)
          documentLinks[linkName] = value
        }
      }

      // Get other standard fields
      const ceIdx = columnMap.get("ce")
      const projectTypeIdx = columnMap.get("projectType")
      const rfpNumberIdx = columnMap.get("rfpNumber")
      const schoolTypeIdx = columnMap.get("schoolType")
      const affiliationIdx = columnMap.get("affiliation")

      // Get sheet-specific fields
      const presentationDateIdx = columnMap.get("presentationDate")
      const estimatedLaunchDateIdx = columnMap.get("estimatedLaunchDate")
      const actualLaunchDateIdx = columnMap.get("actualLaunchDate")
      const cmsTypeIdx = columnMap.get("cmsType")
      const websiteLinkIdx = columnMap.get("websiteLink")

      proposalsList.push({
        row: rowNumber,
        sheetName,
        category,
        date,
        ce: ceIdx !== undefined ? String(rowData[ceIdx] || "").trim() || undefined : undefined,
        client,
        projectType: projectTypeIdx !== undefined ? String(rowData[projectTypeIdx] || "").trim() || undefined : undefined,
        rfpNumber: rfpNumberIdx !== undefined ? String(rowData[rfpNumberIdx] || "").trim() || undefined : undefined,
        won,
        schoolType: schoolTypeIdx !== undefined ? String(rowData[schoolTypeIdx] || "").trim() || undefined : undefined,
        affiliation: affiliationIdx !== undefined ? String(rowData[affiliationIdx] || "").trim() || undefined : undefined,
        servicesOffered,
        documentLinks,
        rawData,
        presentationDate: presentationDateIdx !== undefined ? parseExcelDate(rowData[presentationDateIdx]) : undefined,
        estimatedLaunchDate: estimatedLaunchDateIdx !== undefined ? parseExcelDate(rowData[estimatedLaunchDateIdx]) : undefined,
        actualLaunchDate: actualLaunchDateIdx !== undefined ? parseExcelDate(rowData[actualLaunchDateIdx]) : undefined,
        cmsType: cmsTypeIdx !== undefined ? String(rowData[cmsTypeIdx] || "").trim() || undefined : undefined,
        websiteLink: websiteLinkIdx !== undefined ? String(rowData[websiteLinkIdx] || "").trim() || undefined : undefined,
      })
    }

    console.log(`Parsed ${sheetName}: ${proposalsList.filter(p => p.sheetName === sheetName).length} proposals`)
  }

  return { proposals: proposalsList, issues }
}

/**
 * Upsert proposals to database - includes ALL data from ALL sheets
 */
export async function syncProposals(filePath: string): Promise<{
  success: boolean
  imported: number
  updated: number
  skipped: number
  issues: SyncIssue[]
}> {
  if (!db) throw new Error("Database not available")

  const { proposals: parsedProposals, issues } = parseProposalSummary(filePath)

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const proposal of parsedProposals) {
    const fingerprint = generateProposalFingerprint(proposal)

    try {
      // Check if exists
      const existing = await db
        .select()
        .from(proposals)
        .where(eq(proposals.fingerprint, fingerprint))
        .limit(1)

      const proposalData: NewProposal = {
        date: proposal.date,
        ce: proposal.ce,
        client: proposal.client,
        projectType: proposal.projectType,
        rfpNumber: proposal.rfpNumber,
        won: proposal.won,
        schoolType: proposal.schoolType,
        affiliation: proposal.affiliation,
        servicesOffered: proposal.servicesOffered,
        documentLinks: proposal.documentLinks,
        fingerprint,
        sourceRow: proposal.row,
        // NEW: Multi-sheet and full data fields
        sheetName: proposal.sheetName,
        category: proposal.category,
        rawData: proposal.rawData,
        presentationDate: proposal.presentationDate,
        estimatedLaunchDate: proposal.estimatedLaunchDate,
        actualLaunchDate: proposal.actualLaunchDate,
        cmsType: proposal.cmsType,
        websiteLink: proposal.websiteLink,
      }

      if (existing.length === 0) {
        // Insert new
        await db.insert(proposals).values(proposalData)
        imported++
      } else {
        // Update existing
        await db
          .update(proposals)
          .set({
            ...proposalData,
            updatedAt: new Date(),
          })
          .where(eq(proposals.fingerprint, fingerprint))
        updated++
      }
    } catch (error) {
      issues.push({ row: proposal.row, message: `Database error: ${error}` })
      skipped++
    }
  }

  // Log the sync
  try {
    const stat = fs.statSync(filePath)
    await db.insert(proposalSyncLog).values({
      filePath,
      fileMtime: stat.mtime,
      totalRows: parsedProposals.length,
      imported,
      updated,
      skipped,
      status: issues.length === 0 ? "success" : skipped === parsedProposals.length ? "failed" : "partial",
      errorMessage: issues.length > 0 ? JSON.stringify(issues.slice(0, 10)) : null,
    })
  } catch (logError) {
    console.error("Failed to log sync:", logError)
  }

  return { success: true, imported, updated, skipped, issues }
}

/**
 * Check if file has changed and sync if needed
 */
export async function checkAndSync(): Promise<boolean> {
  if (!PROPOSAL_FILE_PATH) {
    return false
  }

  try {
    // Check if file exists
    if (!fs.existsSync(PROPOSAL_FILE_PATH)) {
      console.log(`Proposal file not found: ${PROPOSAL_FILE_PATH}`)
      return false
    }

    const stat = fs.statSync(PROPOSAL_FILE_PATH)
    const currentMtime = stat.mtimeMs

    if (lastKnownMtime !== null && currentMtime === lastKnownMtime) {
      return false // No changes
    }

    console.log(`Proposal file changed, syncing from ${PROPOSAL_FILE_PATH}`)
    const result = await syncProposals(PROPOSAL_FILE_PATH)
    console.log(`Sync complete: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`)

    lastKnownMtime = currentMtime
    return true
  } catch (error) {
    console.error("Proposal sync failed:", error)
    return false
  }
}

/**
 * Start the polling interval
 */
export function startSyncPolling(): void {
  if (syncIntervalId) return // Already running

  if (!PROPOSAL_FILE_PATH) {
    console.log("PROPOSAL_SUMMARY_PATH not configured, proposal sync disabled")
    return
  }

  console.log(`Starting proposal sync polling (interval: ${SYNC_INTERVAL_MS}ms)`)

  // Initial sync
  checkAndSync()

  // Set up polling
  syncIntervalId = setInterval(checkAndSync, SYNC_INTERVAL_MS)
}

/**
 * Stop the polling interval
 */
export function stopSyncPolling(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  configured: boolean
  filePath: string | null
  fileExists: boolean
  lastSync: Date | null
  lastSyncStatus: string | null
  totalProposals: number
}> {
  if (!db) {
    return {
      configured: false,
      filePath: null,
      fileExists: false,
      lastSync: null,
      lastSyncStatus: null,
      totalProposals: 0,
    }
  }

  const configured = !!PROPOSAL_FILE_PATH
  const fileExists = configured && fs.existsSync(PROPOSAL_FILE_PATH)

  // Get last sync
  const lastSyncResult = await db
    .select()
    .from(proposalSyncLog)
    .orderBy(desc(proposalSyncLog.syncedAt))
    .limit(1)

  // Get proposal count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(proposals)

  return {
    configured,
    filePath: PROPOSAL_FILE_PATH || null,
    fileExists,
    lastSync: lastSyncResult[0]?.syncedAt || null,
    lastSyncStatus: lastSyncResult[0]?.status || null,
    totalProposals: Number(countResult[0]?.count || 0),
  }
}

/**
 * Get all proposals (for AI context building)
 */
export async function getAllProposals(): Promise<Proposal[]> {
  if (!db) return []

  return db.select().from(proposals).orderBy(desc(proposals.date))
}

/**
 * Manual trigger for sync
 */
export async function triggerSync(): Promise<{
  synced: boolean
  message: string
  result?: {
    imported: number
    updated: number
    skipped: number
  }
}> {
  if (!PROPOSAL_FILE_PATH) {
    return { synced: false, message: "PROPOSAL_SUMMARY_PATH not configured" }
  }

  if (!fs.existsSync(PROPOSAL_FILE_PATH)) {
    return { synced: false, message: `File not found: ${PROPOSAL_FILE_PATH}` }
  }

  try {
    const result = await syncProposals(PROPOSAL_FILE_PATH)
    lastKnownMtime = fs.statSync(PROPOSAL_FILE_PATH).mtimeMs

    return {
      synced: true,
      message: `Synced ${result.imported} new, ${result.updated} updated`,
      result: {
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      },
    }
  } catch (error) {
    return {
      synced: false,
      message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
