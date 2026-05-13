import { describe, it, expect } from "vitest"
import { extractDomain, DOMAIN_RE } from "../lib/clientLookup.js"

describe("extractDomain", () => {
  it("returns lowercased domain for valid emails", () => {
    expect(extractDomain("Jane@Example.com")).toBe("example.com")
    expect(extractDomain("user@iu.edu")).toBe("iu.edu")
    expect(extractDomain("a@bryan-health.org")).toBe("bryan-health.org")
  })

  it("handles plus-addressing — domain unchanged", () => {
    expect(extractDomain("jane+work@x.example.org")).toBe("x.example.org")
  })

  it("trims whitespace inside the domain portion", () => {
    expect(extractDomain("a@ example.com ")).toBe("example.com")
  })

  it("returns null for missing @", () => {
    expect(extractDomain("not-an-email")).toBeNull()
  })

  it("returns null for trailing @", () => {
    expect(extractDomain("user@")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull()
  })

  it("returns null for leading dot in domain", () => {
    expect(extractDomain("u@.foo.com")).toBeNull()
  })

  it("returns null for consecutive dots", () => {
    expect(extractDomain("u@foo..com")).toBeNull()
  })

  it("returns null for leading hyphen in label", () => {
    expect(extractDomain("u@-foo.com")).toBeNull()
  })

  it("returns null for trailing hyphen in label", () => {
    expect(extractDomain("u@foo-.com")).toBeNull()
  })

  it("returns null for single-letter TLD", () => {
    expect(extractDomain("u@foo.x")).toBeNull()
  })
})

describe("DOMAIN_RE", () => {
  it("accepts standard valid domains", () => {
    expect(DOMAIN_RE.test("iu.edu")).toBe(true)
    expect(DOMAIN_RE.test("bryan-health.org")).toBe(true)
    expect(DOMAIN_RE.test("sub.example.com")).toBe(true)
    expect(DOMAIN_RE.test("a.bc")).toBe(true)
  })

  it("rejects malformed domains", () => {
    expect(DOMAIN_RE.test(".foo.com")).toBe(false)
    expect(DOMAIN_RE.test("-foo.com")).toBe(false)
    expect(DOMAIN_RE.test("foo-.com")).toBe(false)
    expect(DOMAIN_RE.test("foo..com")).toBe(false)
    expect(DOMAIN_RE.test("foo")).toBe(false)
    expect(DOMAIN_RE.test("foo.x")).toBe(false)
  })

  it("requires lowercase (caller must lowercase first)", () => {
    expect(DOMAIN_RE.test("Example.com")).toBe(false)
  })
})
