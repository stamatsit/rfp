/**
 * Parse GoToWebinar registration / attendance XLSX exports.
 *
 * Format observed in real exports:
 *  - Rows 0-12: metadata (Registration/Attendance Report header, Generated, General Information block)
 *  - Row 13 ish: column header row (contains "First Name", "Last Name", "Email", etc.)
 *  - Rows 14+: registrant data
 *  - Cells past the data row count may be empty
 *
 * We don't trust exact row indices — we scan for the header row.
 */
import xlsx from "xlsx"

export type UploadKind = "registration" | "attendance"

export interface ParsedRegistrant {
  firstName: string | null
  lastName: string | null
  email: string
  registrationDate: Date | null
  attendanceDate: Date | null
  attended: boolean | null
  notes: string | null
  organizationRaw: string | null
}

export interface ParsedWebinar {
  title: string | null
  webinarKey: string | null
  webinarDate: Date | null
  uploadKind: UploadKind
  rawRows: number
  registrants: ParsedRegistrant[]
}

const HEADER_KEYWORDS = ["first name", "last name", "email"]

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] ?? []
    const lowered = row.map((c: any) => String(c).toLowerCase().trim())
    const hits = HEADER_KEYWORDS.filter(k => lowered.includes(k)).length
    if (hits >= 2) return i
  }
  return -1
}

function colIndex(header: any[], ...candidates: string[]): number {
  const lowered = header.map((c: any) => String(c).toLowerCase().trim())
  for (const c of candidates) {
    const idx = lowered.indexOf(c.toLowerCase())
    if (idx >= 0) return idx
  }
  return -1
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function cellStr(v: any): string {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

function readMetadataValue(rows: any[][], label: string): string {
  // GoToWebinar's metadata block lays out label/value pairs in TWO COLUMNS:
  //   row N:    "Webinar Name" | "Webinar ID"     (labels)
  //   row N+1:  "<title>"      | "<key>"          (values)
  // So we look for the label in any column, then read the SAME column on the next row.
  const want = label.toLowerCase()
  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const row = rows[i] ?? []
    for (let col = 0; col < row.length; col++) {
      const label = cellStr(row[col]).toLowerCase()
      if (label === want) {
        const next = rows[i + 1] ?? []
        return cellStr(next[col])
      }
    }
  }
  return ""
}

function detectUploadKind(rows: any[][]): UploadKind {
  // Row 0 col 0 is usually "Registration Report" or "Attendance Report"
  const top = cellStr(rows[0]?.[0]).toLowerCase()
  if (top.includes("attendance")) return "attendance"
  // Also detect by looking for "Attended" column in header
  const headerIdx = findHeaderRow(rows)
  if (headerIdx >= 0) {
    const header = rows[headerIdx] ?? []
    if (colIndex(header, "attended", "attendance") >= 0) return "attendance"
  }
  return "registration"
}

export function parseWebinarXlsx(buffer: Buffer): ParsedWebinar {
  const wb = xlsx.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error("XLSX has no sheets")
  const sheet = wb.Sheets[sheetName]!
  const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false })

  const uploadKind = detectUploadKind(rows)
  const headerIdx = findHeaderRow(rows)
  if (headerIdx < 0) {
    throw new Error("Could not locate column header row (expected First Name / Last Name / Email).")
  }
  const header = rows[headerIdx] ?? []

  const cFirst = colIndex(header, "first name", "firstname")
  const cLast = colIndex(header, "last name", "lastname")
  const cEmail = colIndex(header, "email", "email address")
  const cRegDate = colIndex(header, "registration date", "registered date", "date registered")
  const cAttended = colIndex(header, "attended", "attendance status")
  const cJoinTime = colIndex(header, "join time", "time joined", "attended at", "attendance time")
  const cOrg = colIndex(header, "organization", "company", "company / organization")
  const cNotes = colIndex(header, "notes:", "notes", "comments")

  if (cEmail < 0) throw new Error("XLSX header row found but no Email column.")

  // Title + webinar key + date from metadata block
  const title = readMetadataValue(rows, "webinar name") || null
  const webinarKey = readMetadataValue(rows, "webinar id") || null
  const dateStr = readMetadataValue(rows, "scheduled start date")
  const webinarDate = parseDate(dateStr)

  const registrants: ParsedRegistrant[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const email = cellStr(row[cEmail]).toLowerCase()
    if (!email || !email.includes("@")) continue  // skip blank/garbage rows

    const attendedRaw = cAttended >= 0 ? cellStr(row[cAttended]).toLowerCase() : ""
    let attended: boolean | null = null
    if (uploadKind === "attendance") {
      // GoToWebinar uses values like "Attended", "Not Attended", "Yes", "No"
      if (attendedRaw.includes("attended") && !attendedRaw.includes("not")) attended = true
      else if (attendedRaw === "yes") attended = true
      else if (attendedRaw === "no" || attendedRaw.includes("not")) attended = false
      else if (attendedRaw) attended = true  // some reports just have a join-time = attended
    }

    registrants.push({
      firstName: cFirst >= 0 ? (cellStr(row[cFirst]) || null) : null,
      lastName: cLast >= 0 ? (cellStr(row[cLast]) || null) : null,
      email,
      registrationDate: cRegDate >= 0 ? parseDate(row[cRegDate]) : null,
      attendanceDate: cJoinTime >= 0 ? parseDate(row[cJoinTime]) : null,
      attended,
      notes: cNotes >= 0 ? (cellStr(row[cNotes]) || null) : null,
      organizationRaw: cOrg >= 0 ? (cellStr(row[cOrg]) || null) : null,
    })
  }

  return {
    title,
    webinarKey,
    webinarDate,
    uploadKind,
    rawRows: registrants.length,
    registrants,
  }
}
