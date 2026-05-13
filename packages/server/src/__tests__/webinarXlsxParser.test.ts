import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { parseWebinarXlsx } from "../lib/webinarXlsxParser.js"

const FIXTURE_DIR = path.resolve(__dirname, "../../../../Webinar Data")
const REGISTRATION_FILE = path.join(FIXTURE_DIR, "How to Unify Program Pages Across Credit & Noncredit Offerings - Registration Report.xlsx")

describe("parseWebinarXlsx — real GoToWebinar registration export", () => {
  it("extracts title, webinar key, and date from metadata block", () => {
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    expect(parsed.title).toBeTruthy()
    expect(parsed.title?.toLowerCase()).toContain("unify program pages")
    expect(parsed.webinarKey).toMatch(/^\d{3}-\d{3}-\d{3}$/)
    expect(parsed.webinarDate).toBeInstanceOf(Date)
  })

  it("identifies upload kind as registration", () => {
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    expect(parsed.uploadKind).toBe("registration")
  })

  it("parses all data rows from the fixture", () => {
    // File header claims 'Registered: 117' but the actual data section has 112 rows.
    // We parse what's in the data section, not the metadata count.
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    expect(parsed.rawRows).toBe(112)
    expect(parsed.registrants).toHaveLength(112)
  })

  it("lowercases all emails", () => {
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    for (const r of parsed.registrants) {
      expect(r.email).toBe(r.email.toLowerCase())
      expect(r.email).toContain("@")
    }
  })

  it("captures first/last name and registration date where available", () => {
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    const first = parsed.registrants[0]
    expect(first).toBeDefined()
    expect(first?.firstName).toBeTruthy()
    expect(first?.lastName).toBeTruthy()
    expect(first?.registrationDate).toBeInstanceOf(Date)
  })

  it("leaves attended as null for registration reports", () => {
    const buf = fs.readFileSync(REGISTRATION_FILE)
    const parsed = parseWebinarXlsx(buf)
    for (const r of parsed.registrants) {
      expect(r.attended).toBeNull()
    }
  })
})
