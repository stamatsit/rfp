import xlsx from "xlsx"
const { read, readFile, utils } = xlsx
import { upsertTopics, getAllTopics } from "./topicService.js"
import { upsertAnswer } from "./answerService.js"
import { logImport } from "./auditService.js"
import { batchInferCategories } from "./aiService.js"
import { parseTagsString, normalizeTopicName } from "../lib/utils.js"
import type { ImportPreview, ImportResult, ImportIssue } from "../types/index.js"

// Expected column names (case-insensitive)
const COLUMN_MAPPINGS = {
  question: ["question", "q", "query"],
  answer: ["answer", "a", "response"],
  category: ["category", "topic", "cat"],
  subcategory: ["sub-category", "subcategory", "sub category", "subtopic"],
  tags: ["tags", "tag", "keywords"],
}

interface ParsedRow {
  row: number
  question: string
  answer: string
  category: string
  subcategory?: string
  tags?: string[]
}

interface ColumnMap {
  question: number
  answer: number
  category: number
  subcategory?: number
  tags?: number
}

/**
 * Find column index by trying multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map((h) => h?.toLowerCase().trim() ?? "")

  for (const name of possibleNames) {
    const index = normalizedHeaders.indexOf(name.toLowerCase())
    if (index !== -1) return index
  }

  return -1
}

/**
 * Auto-detect column mapping from headers
 */
function detectColumnMapping(headers: string[]): ColumnMap | null {
  const questionCol = findColumnIndex(headers, COLUMN_MAPPINGS.question)
  const answerCol = findColumnIndex(headers, COLUMN_MAPPINGS.answer)
  const categoryCol = findColumnIndex(headers, COLUMN_MAPPINGS.category)

  // Required columns
  if (questionCol === -1 || answerCol === -1 || categoryCol === -1) {
    return null
  }

  const subcategoryCol = findColumnIndex(headers, COLUMN_MAPPINGS.subcategory)
  const tagsCol = findColumnIndex(headers, COLUMN_MAPPINGS.tags)

  return {
    question: questionCol,
    answer: answerCol,
    category: categoryCol,
    subcategory: subcategoryCol !== -1 ? subcategoryCol : undefined,
    tags: tagsCol !== -1 ? tagsCol : undefined,
  }
}

/**
 * Parse a row into a structured object
 */
function parseRow(
  rowData: (string | number | boolean | undefined)[],
  columnMap: ColumnMap,
  rowNumber: number
): { parsed: ParsedRow | null; issue: ImportIssue | null } {
  const question = String(rowData[columnMap.question] ?? "").trim()
  const answer = String(rowData[columnMap.answer] ?? "").trim()
  const category = String(rowData[columnMap.category] ?? "").trim()

  // Validate required fields
  if (!question) {
    return {
      parsed: null,
      issue: {
        row: rowNumber,
        type: "missing_required",
        field: "question",
        message: "Missing required field: Question",
      },
    }
  }

  if (!answer) {
    return {
      parsed: null,
      issue: {
        row: rowNumber,
        type: "missing_required",
        field: "answer",
        message: "Missing required field: Answer",
      },
    }
  }

  if (!category) {
    return {
      parsed: null,
      issue: {
        row: rowNumber,
        type: "missing_required",
        field: "category",
        message: "Missing required field: Category",
      },
    }
  }

  // Parse optional fields
  const subcategory =
    columnMap.subcategory !== undefined
      ? String(rowData[columnMap.subcategory] ?? "").trim() || undefined
      : undefined

  const tagsString =
    columnMap.tags !== undefined ? String(rowData[columnMap.tags] ?? "").trim() : undefined

  const tags = parseTagsString(tagsString)

  return {
    parsed: {
      row: rowNumber,
      question,
      answer,
      category,
      subcategory,
      tags: tags.length > 0 ? tags : undefined,
    },
    issue: null,
  }
}

/**
 * Parse an Excel file and return structured data
 */
export function parseExcelFile(filePath: string): {
  rows: ParsedRow[]
  issues: ImportIssue[]
  totalRows: number
  sheetName: string
} {
  // Read workbook
  const workbook = readFile(filePath)

  // Find the right sheet (prefer "Library Entries", otherwise first sheet)
  let sheetName = workbook.SheetNames.find(
    (name) => name.toLowerCase().includes("library") || name.toLowerCase().includes("entries")
  )

  if (!sheetName) {
    sheetName = workbook.SheetNames[0]
  }

  if (!sheetName) {
    throw new Error("No sheets found in workbook")
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`)
  }

  // Convert to JSON array
  const data = utils.sheet_to_json<(string | number | boolean | undefined)[]>(sheet, {
    header: 1,
    defval: "",
  })

  if (data.length < 2) {
    throw new Error("File must have at least a header row and one data row")
  }

  // First row is headers
  const headers = (data[0] ?? []).map((h) => String(h))

  // Detect column mapping
  const columnMap = detectColumnMapping(headers)

  if (!columnMap) {
    throw new Error(
      "Could not detect required columns. Expected: Question, Answer, Category"
    )
  }

  const rows: ParsedRow[] = []
  const issues: ImportIssue[] = []

  // Track last valid category for inheritance (common spreadsheet pattern)
  let lastValidCategory = ""

  // Parse each data row (skip header)
  for (let i = 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData) continue

    // Skip completely empty rows
    const hasData = rowData.some((cell) => cell !== undefined && cell !== "")
    if (!hasData) continue

    // Apply category inheritance: if current row has no category, use the last valid one
    const currentCategory = String(rowData[columnMap.category] ?? "").trim()
    if (currentCategory) {
      lastValidCategory = currentCategory
    } else if (lastValidCategory) {
      // Mutate the row data to include inherited category
      rowData[columnMap.category] = lastValidCategory
    }

    const rowNumber = i + 1 // 1-indexed for user display
    const { parsed, issue } = parseRow(rowData, columnMap, rowNumber)

    if (parsed) {
      rows.push(parsed)
    }

    if (issue) {
      issues.push(issue)
    }
  }

  return {
    rows,
    issues,
    totalRows: data.length - 1, // Exclude header
    sheetName,
  }
}

/**
 * Parse Excel buffer (for uploaded files)
 */
export function parseExcelBuffer(buffer: Buffer): {
  rows: ParsedRow[]
  issues: ImportIssue[]
  totalRows: number
  sheetName: string
} {
  const workbook = read(buffer, { type: "buffer" })

  // Find the right sheet
  let sheetName = workbook.SheetNames.find(
    (name) => name.toLowerCase().includes("library") || name.toLowerCase().includes("entries")
  )

  if (!sheetName) {
    sheetName = workbook.SheetNames[0]
  }

  if (!sheetName) {
    throw new Error("No sheets found in workbook")
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`)
  }

  const data = utils.sheet_to_json<(string | number | boolean | undefined)[]>(sheet, {
    header: 1,
    defval: "",
  })

  if (data.length < 2) {
    throw new Error("File must have at least a header row and one data row")
  }

  const headers = (data[0] ?? []).map((h) => String(h))
  const columnMap = detectColumnMapping(headers)

  if (!columnMap) {
    throw new Error(
      "Could not detect required columns. Expected: Question, Answer, Category"
    )
  }

  const rows: ParsedRow[] = []
  const issues: ImportIssue[] = []

  // Track last valid category for inheritance (common spreadsheet pattern)
  let lastValidCategory = ""

  for (let i = 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData) continue

    const hasData = rowData.some((cell) => cell !== undefined && cell !== "")
    if (!hasData) continue

    // Apply category inheritance: if current row has no category, use the last valid one
    const currentCategory = String(rowData[columnMap.category] ?? "").trim()
    if (currentCategory) {
      lastValidCategory = currentCategory
    } else if (lastValidCategory) {
      rowData[columnMap.category] = lastValidCategory
    }

    const rowNumber = i + 1
    const { parsed, issue } = parseRow(rowData, columnMap, rowNumber)

    if (parsed) {
      rows.push(parsed)
    }

    if (issue) {
      issues.push(issue)
    }
  }

  return {
    rows,
    issues,
    totalRows: data.length - 1,
    sheetName,
  }
}

/**
 * Preview import without committing to database
 */
export async function previewImport(filePath: string): Promise<ImportPreview> {
  const { rows, issues, totalRows } = parseExcelFile(filePath)

  // For preview, show first 20 rows
  const previewRows = rows.slice(0, 20).map((r) => ({
    row: r.row,
    question: r.question,
    answer: r.answer.slice(0, 200) + (r.answer.length > 200 ? "..." : ""),
    category: r.category,
    subcategory: r.subcategory,
    tags: r.tags,
  }))

  // Estimate new vs update (simplified - full check requires DB queries)
  // For now, assume all are potentially new
  return {
    totalRows,
    previewRows,
    issues,
    newCount: rows.length, // Will be refined during actual import
    updateCount: 0,
  }
}

/**
 * Preview import from buffer
 */
export async function previewImportFromBuffer(buffer: Buffer): Promise<ImportPreview> {
  const { rows, issues, totalRows } = parseExcelBuffer(buffer)

  const previewRows = rows.slice(0, 20).map((r) => ({
    row: r.row,
    question: r.question,
    answer: r.answer.slice(0, 200) + (r.answer.length > 200 ? "..." : ""),
    category: r.category,
    subcategory: r.subcategory,
    tags: r.tags,
  }))

  return {
    totalRows,
    previewRows,
    issues,
    newCount: rows.length,
    updateCount: 0,
  }
}

/**
 * Parse Excel file with AI-based category inference for missing categories
 * Returns rows that would otherwise be skipped due to missing category
 */
export async function parseExcelFileWithAI(filePath: string): Promise<{
  rows: ParsedRow[]
  issues: ImportIssue[]
  totalRows: number
  sheetName: string
  aiInferredCount: number
}> {
  // Read workbook
  const workbook = readFile(filePath)

  // Find the right sheet
  let sheetName = workbook.SheetNames.find(
    (name) => name.toLowerCase().includes("library") || name.toLowerCase().includes("entries")
  )
  if (!sheetName) sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("No sheets found in workbook")

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`)

  const data = utils.sheet_to_json<(string | number | boolean | undefined)[]>(sheet, {
    header: 1,
    defval: "",
  })

  if (data.length < 2) {
    throw new Error("File must have at least a header row and one data row")
  }

  const headers = (data[0] ?? []).map((h) => String(h))
  const columnMap = detectColumnMapping(headers)

  if (!columnMap) {
    throw new Error("Could not detect required columns. Expected: Question, Answer, Category")
  }

  // Get all existing topics for AI inference
  const existingTopics = await getAllTopics()
  const availableCategories = existingTopics.map(t => t.displayName)

  // First pass: collect all rows and identify those needing category inference
  const rows: ParsedRow[] = []
  const issues: ImportIssue[] = []
  const rowsNeedingCategory: Array<{
    index: number
    rowNumber: number
    question: string
    answer: string
    subcategory?: string
    tags?: string[]
  }> = []

  for (let i = 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData) continue

    const hasData = rowData.some((cell) => cell !== undefined && cell !== "")
    if (!hasData) continue

    const rowNumber = i + 1
    const question = String(rowData[columnMap.question] ?? "").trim()
    const answer = String(rowData[columnMap.answer] ?? "").trim()
    const category = String(rowData[columnMap.category] ?? "").trim()

    // Skip rows missing question or answer
    if (!question) {
      issues.push({
        row: rowNumber,
        type: "missing_required",
        field: "question",
        message: "Missing required field: Question",
      })
      continue
    }

    if (!answer) {
      issues.push({
        row: rowNumber,
        type: "missing_required",
        field: "answer",
        message: "Missing required field: Answer",
      })
      continue
    }

    // Parse optional fields
    const subcategory = columnMap.subcategory !== undefined
      ? String(rowData[columnMap.subcategory] ?? "").trim() || undefined
      : undefined
    const tagsString = columnMap.tags !== undefined
      ? String(rowData[columnMap.tags] ?? "").trim()
      : undefined
    const tags = parseTagsString(tagsString)

    if (category) {
      // Row has all required fields
      rows.push({
        row: rowNumber,
        question,
        answer,
        category,
        subcategory,
        tags: tags.length > 0 ? tags : undefined,
      })
    } else {
      // Row needs category inference
      rowsNeedingCategory.push({
        index: rows.length, // Will insert at this position
        rowNumber,
        question,
        answer,
        subcategory,
        tags: tags.length > 0 ? tags : undefined,
      })
    }
  }

  // Use AI to infer categories for rows missing them
  let aiInferredCount = 0
  if (rowsNeedingCategory.length > 0 && availableCategories.length > 0) {
    console.log(`Inferring categories for ${rowsNeedingCategory.length} rows using AI...`)

    const entriesToInfer = rowsNeedingCategory.map((r, idx) => ({
      question: r.question,
      answer: r.answer,
      index: idx,
    }))

    const inferredCategories = await batchInferCategories(entriesToInfer, availableCategories)

    for (const rowData of rowsNeedingCategory) {
      const idx = rowsNeedingCategory.indexOf(rowData)
      const inferredCategory = inferredCategories.get(idx)

      if (inferredCategory) {
        rows.push({
          row: rowData.rowNumber,
          question: rowData.question,
          answer: rowData.answer,
          category: inferredCategory,
          subcategory: rowData.subcategory,
          tags: rowData.tags,
        })
        aiInferredCount++
        console.log(`  Row ${rowData.rowNumber}: "${rowData.question.slice(0, 40)}..." -> ${inferredCategory}`)
      } else {
        issues.push({
          row: rowData.rowNumber,
          type: "missing_required",
          field: "category",
          message: "Missing category and AI could not infer one",
        })
      }
    }
  } else if (rowsNeedingCategory.length > 0) {
    // No existing categories to use for inference
    for (const rowData of rowsNeedingCategory) {
      issues.push({
        row: rowData.rowNumber,
        type: "missing_required",
        field: "category",
        message: "Missing required field: Category (no existing categories for AI inference)",
      })
    }
  }

  // Sort rows by original row number
  rows.sort((a, b) => a.row - b.row)

  return {
    rows,
    issues,
    totalRows: data.length - 1,
    sheetName,
    aiInferredCount,
  }
}

/**
 * Execute the full import
 */
export async function executeImport(filePath: string): Promise<ImportResult> {
  const { rows, issues: parseIssues } = parseExcelFile(filePath)

  // Step 1: Extract and upsert all topics
  const categories = [...new Set(rows.map((r) => r.category))]
  const topicsMap = await upsertTopics(categories)

  // Step 2: Upsert each answer
  let imported = 0
  let updated = 0
  let skipped = 0
  const allIssues: ImportIssue[] = [...parseIssues]

  for (const row of rows) {
    const normalizedCategory = normalizeTopicName(row.category)
    const topic = topicsMap.get(normalizedCategory)

    if (!topic) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        field: "category",
        message: `Could not find or create topic for category: ${row.category}`,
      })
      skipped++
      continue
    }

    try {
      const result = await upsertAnswer(
        {
          question: row.question,
          answer: row.answer,
          topicId: topic.id,
          topicName: topic.displayName,
          subtopic: row.subcategory,
          tags: row.tags,
        },
        row.row
      )

      if (result.isNew) {
        imported++
      } else {
        updated++
      }

      // Collect collision issues
      if (result.issue) {
        allIssues.push(result.issue)
      }
    } catch (error) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        message: `Failed to import: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
      skipped++
    }
  }

  // Log the import
  await logImport({
    filename: filePath,
    totalRows: rows.length,
    imported,
    updated,
    skipped,
    issues: allIssues.length,
  })

  return {
    success: true,
    imported,
    updated,
    skipped,
    issues: allIssues,
  }
}

/**
 * Execute the full import with AI-based category inference
 */
export async function executeImportWithAI(filePath: string): Promise<ImportResult & { aiInferredCount: number }> {
  const { rows, issues: parseIssues, aiInferredCount } = await parseExcelFileWithAI(filePath)

  // Step 1: Extract and upsert all topics
  const categories = [...new Set(rows.map((r) => r.category))]
  const topicsMap = await upsertTopics(categories)

  // Step 2: Upsert each answer
  let imported = 0
  let updated = 0
  let skipped = 0
  const allIssues: ImportIssue[] = [...parseIssues]

  for (const row of rows) {
    const normalizedCategory = normalizeTopicName(row.category)
    const topic = topicsMap.get(normalizedCategory)

    if (!topic) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        field: "category",
        message: `Could not find or create topic for category: ${row.category}`,
      })
      skipped++
      continue
    }

    try {
      const result = await upsertAnswer(
        {
          question: row.question,
          answer: row.answer,
          topicId: topic.id,
          topicName: topic.displayName,
          subtopic: row.subcategory,
          tags: row.tags,
        },
        row.row
      )

      if (result.isNew) {
        imported++
      } else {
        updated++
      }

      if (result.issue) {
        allIssues.push(result.issue)
      }
    } catch (error) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        message: `Failed to import: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
      skipped++
    }
  }

  // Log the import
  await logImport({
    filename: filePath,
    totalRows: rows.length,
    imported,
    updated,
    skipped,
    issues: allIssues.length,
  })

  return {
    success: true,
    imported,
    updated,
    skipped,
    issues: allIssues,
    aiInferredCount,
  }
}

/**
 * Execute import from buffer
 */
export async function executeImportFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<ImportResult> {
  const { rows, issues: parseIssues } = parseExcelBuffer(buffer)

  const categories = [...new Set(rows.map((r) => r.category))]
  const topicsMap = await upsertTopics(categories)

  let imported = 0
  let updated = 0
  let skipped = 0
  const allIssues: ImportIssue[] = [...parseIssues]

  for (const row of rows) {
    const normalizedCategory = normalizeTopicName(row.category)
    const topic = topicsMap.get(normalizedCategory)

    if (!topic) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        field: "category",
        message: `Could not find or create topic for category: ${row.category}`,
      })
      skipped++
      continue
    }

    try {
      const result = await upsertAnswer(
        {
          question: row.question,
          answer: row.answer,
          topicId: topic.id,
          topicName: topic.displayName,
          subtopic: row.subcategory,
          tags: row.tags,
        },
        row.row
      )

      if (result.isNew) {
        imported++
      } else {
        updated++
      }

      if (result.issue) {
        allIssues.push(result.issue)
      }
    } catch (error) {
      allIssues.push({
        row: row.row,
        type: "invalid_format",
        message: `Failed to import: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
      skipped++
    }
  }

  await logImport({
    filename,
    totalRows: rows.length,
    imported,
    updated,
    skipped,
    issues: allIssues.length,
  })

  return {
    success: true,
    imported,
    updated,
    skipped,
    issues: allIssues,
  }
}
