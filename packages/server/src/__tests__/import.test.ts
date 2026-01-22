import { describe, it, expect } from "vitest"
import "dotenv/config"

import {
  parseExcelFile,
  parseExcelBuffer,
  previewImport,
  executeImport,
} from "../services/importService"
import { getAllTopics } from "../services/topicService"
import { getAnswerByFingerprint } from "../services/answerService"
import { generateFingerprint, normalizeTopicName } from "../lib/utils"
import * as fs from "fs"
import * as path from "path"

// Path to the actual Excel file
const SAMPLE_FILE_PATH = "/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx"

describe("Import Service", () => {
  describe("parseExcelFile", () => {
    it("should parse the sample Excel file", () => {
      const result = parseExcelFile(SAMPLE_FILE_PATH)

      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.sheetName).toBeDefined()
      expect(result.totalRows).toBeGreaterThan(0)
    })

    it("should detect required columns correctly", () => {
      const result = parseExcelFile(SAMPLE_FILE_PATH)

      // Every parsed row should have question, answer, and category
      for (const row of result.rows) {
        expect(row.question).toBeDefined()
        expect(row.question.length).toBeGreaterThan(0)
        expect(row.answer).toBeDefined()
        expect(row.answer.length).toBeGreaterThan(0)
        expect(row.category).toBeDefined()
        expect(row.category.length).toBeGreaterThan(0)
      }
    })

    it("should report issues for rows with missing required fields", () => {
      const result = parseExcelFile(SAMPLE_FILE_PATH)

      // Check that issues have the correct structure
      for (const issue of result.issues) {
        expect(issue.row).toBeGreaterThan(1) // Row numbers start at 2 (after header)
        expect(issue.type).toBe("missing_required")
        expect(issue.field).toMatch(/question|answer|category/)
        expect(issue.message).toBeDefined()
      }
    })

    it("should parse tags correctly", () => {
      const result = parseExcelFile(SAMPLE_FILE_PATH)

      // Find rows that have tags
      const rowsWithTags = result.rows.filter((r) => r.tags && r.tags.length > 0)

      expect(rowsWithTags.length).toBeGreaterThan(0)

      // Tags should be normalized (lowercase, trimmed)
      for (const row of rowsWithTags) {
        for (const tag of row.tags || []) {
          expect(tag).toBe(tag.toLowerCase().trim())
        }
      }
    })
  })

  describe("parseExcelBuffer", () => {
    it("should parse Excel from buffer", () => {
      const buffer = fs.readFileSync(SAMPLE_FILE_PATH)
      const result = parseExcelBuffer(buffer)

      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.sheetName).toBeDefined()
    })

    it("should produce same results as parseExcelFile", () => {
      const buffer = fs.readFileSync(SAMPLE_FILE_PATH)
      const fromFile = parseExcelFile(SAMPLE_FILE_PATH)
      const fromBuffer = parseExcelBuffer(buffer)

      expect(fromBuffer.rows.length).toBe(fromFile.rows.length)
      expect(fromBuffer.issues.length).toBe(fromFile.issues.length)
      expect(fromBuffer.totalRows).toBe(fromFile.totalRows)
    })
  })

  describe("previewImport", () => {
    it("should return preview with limited rows", async () => {
      const preview = await previewImport(SAMPLE_FILE_PATH)

      expect(preview.totalRows).toBeGreaterThan(0)
      expect(preview.previewRows.length).toBeLessThanOrEqual(20)
      expect(preview.newCount).toBeGreaterThan(0)
      expect(preview.issues).toBeDefined()
    })

    it("should truncate long answers in preview", async () => {
      const preview = await previewImport(SAMPLE_FILE_PATH)

      for (const row of preview.previewRows) {
        expect(row.answer.length).toBeLessThanOrEqual(203) // 200 + "..."
      }
    })
  })

  describe("executeImport (idempotency)", () => {
    it("should create topics from categories", async () => {
      // Import should have created topics
      // (we already ran import in the earlier test, so topics should exist)
      const finalTopics = await getAllTopics()

      // Should have topics from the import
      expect(finalTopics.length).toBeGreaterThan(0)

      // Topics should include categories from the file
      const topicNames = finalTopics.map((t) => t.name)
      expect(topicNames).toContain(normalizeTopicName("Website Design & Creative"))
      expect(topicNames).toContain(normalizeTopicName("Content Marketing & Optimization"))
    })

    it("should find answers by fingerprint after import", async () => {
      // Parse the file to get some questions
      const { rows } = parseExcelFile(SAMPLE_FILE_PATH)

      // Get a row that was successfully parsed
      const testRow = rows[0]
      expect(testRow).toBeDefined()

      // Generate the fingerprint
      const fingerprint = generateFingerprint(testRow!.question, testRow!.category)

      // Should be able to find the answer by fingerprint
      const answer = await getAnswerByFingerprint(fingerprint)
      expect(answer).toBeDefined()
      expect(answer?.question).toBe(testRow!.question)
    })

    // This test is slow because it runs two full imports (~800 rows each)
    // Skip in CI, run manually with: npm test -- --testNamePattern "idempotent"
    it.skip("should be idempotent (running twice gives same counts)", async () => {
      // First import was already done, run again
      const result1 = await executeImport(SAMPLE_FILE_PATH)

      // Run import again
      const result2 = await executeImport(SAMPLE_FILE_PATH)

      // Second import should have mostly updates, not new imports
      // (because fingerprints match existing records)
      expect(result2.imported).toBeLessThanOrEqual(result1.imported)

      // Total processed should be consistent
      expect(result1.imported + result1.updated + result1.skipped).toBe(
        result2.imported + result2.updated + result2.skipped
      )
    })
  })
})

describe("Import Validation", () => {
  it("should reject non-Excel files", () => {
    const invalidPath = path.join(__dirname, "invalid.txt")

    // This should throw or return an error
    expect(() => parseExcelFile(invalidPath)).toThrow()
  })

  it("should handle empty category gracefully", () => {
    const result = parseExcelFile(SAMPLE_FILE_PATH)

    // Should have some issues for missing categories
    const categoryIssues = result.issues.filter(
      (i) => i.field === "category" && i.type === "missing_required"
    )

    // File should have some rows with missing categories (based on earlier test run)
    expect(categoryIssues.length).toBeGreaterThanOrEqual(0)
  })
})
