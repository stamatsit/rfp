/**
 * URL Scanner Service — accessibility, SEO, and security analysis engine
 */
import * as cheerio from "cheerio"
import { JSDOM } from "jsdom"
import axe from "axe-core"
import type {
  ScanOptions,
  ScanReport,
  ScanIssue,
  HeadingNode,
  CategoryScore,
  Category,
  ScanSummary,
  Severity,
  SchemaEntity,
  SiteStructure,
} from "../types/scanner.js"

// ---------------------------------------------------------------------------
// SSRF Guard
// ---------------------------------------------------------------------------
function isPublicUrl(urlString: string): boolean {
  let url: URL
  try { url = new URL(urlString) } catch { return false }
  if (!["http:", "https:"].includes(url.protocol)) return false
  const h = url.hostname
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.)/.test(h)) return false
  if (h === "::1" || h.startsWith("[::1]") || h.startsWith("[fe80")) return false
  return true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate HTML element string for readability */
function truncateElement(html: string, max = 200): string {
  if (!html) return ""
  const trimmed = html.replace(/\s+/g, " ").trim()
  return trimmed.length > max ? trimmed.slice(0, max) + "..." : trimmed
}

/** Estimate line number by counting newlines before a match in the raw HTML */
function estimateLine(rawHtml: string, snippet: string): number | undefined {
  const idx = rawHtml.indexOf(snippet)
  if (idx === -1) return undefined
  return rawHtml.slice(0, idx).split("\n").length
}

const GENERIC_LINK_TEXT = new Set([
  "click here", "here", "read more", "learn more", "more",
  "link", "this", "go", "continue", "details",
])

// ---------------------------------------------------------------------------
// Analyzers
// ---------------------------------------------------------------------------

export function analyzeHeadings($: cheerio.CheerioAPI, rawHtml?: string): { issues: ScanIssue[]; tree: HeadingNode[] } {
  const issues: ScanIssue[] = []
  const tree: HeadingNode[] = []

  const headings = $("h1, h2, h3, h4, h5, h6")
  let h1Count = 0
  let prevLevel = 0

  headings.each((_i, el) => {
    const tagName = (el as any).tagName?.toLowerCase() ?? ""
    const level = parseInt(tagName.replace("h", ""), 10)
    const text = $(el).text().trim()
    const outerHtml = $.html(el) ?? ""
    const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
    const nodeIssues: string[] = []

    if (level === 1) h1Count++

    // Empty heading
    if (!text) {
      const issue: ScanIssue = {
        ruleId: "heading-empty",
        category: "headings",
        severity: "error",
        message: `Empty ${tagName} heading found`,
        element: truncateElement(outerHtml),
        selector: tagName,
        line,
        suggestion: "Add meaningful text content to the heading or remove it",
      }
      issues.push(issue)
      nodeIssues.push("heading-empty")
    }

    // Skipped levels
    if (prevLevel > 0 && level > prevLevel + 1) {
      const issue: ScanIssue = {
        ruleId: "heading-hierarchy",
        category: "headings",
        severity: "warning",
        message: `Heading level skipped: ${tagName} appears after h${prevLevel} (expected h${prevLevel + 1} or lower)`,
        element: truncateElement(outerHtml),
        selector: tagName,
        line,
        suggestion: `Use h${prevLevel + 1} instead to maintain proper heading hierarchy`,
      }
      issues.push(issue)
      nodeIssues.push("heading-hierarchy")
    }

    prevLevel = level
    tree.push({ level, text, line, issues: nodeIssues })
  })

  // H1 checks
  if (h1Count === 0) {
    issues.push({
      ruleId: "heading-missing-h1",
      category: "headings",
      severity: "error",
      message: "Page is missing an h1 heading",
      suggestion: "Add a single h1 element that describes the main purpose of the page",
    })
  } else if (h1Count > 1) {
    issues.push({
      ruleId: "heading-single-h1",
      category: "headings",
      severity: "warning",
      message: `Page has ${h1Count} h1 headings — should have only one`,
      suggestion: "Use a single h1 for the page title; demote others to h2 or lower",
    })
  }

  return { issues, tree }
}

export function analyzeImages($: cheerio.CheerioAPI, rawHtml?: string): ScanIssue[] {
  const issues: ScanIssue[] = []
  const redundantPatterns = /^(image|photo|picture|graphic|icon|banner|img|logo)$/i
  const fileExtPattern = /\.(jpg|jpeg|png|gif|svg|webp|bmp|tiff|ico)(\?|$)/i

  $("img").each((_i, el) => {
    const alt = $(el).attr("alt")
    const outerHtml = $.html(el) ?? ""
    const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
    const selector = buildSelector($, el)

    if (alt === undefined) {
      issues.push({
        ruleId: "img-alt-missing",
        category: "images",
        severity: "error",
        message: "Image is missing alt attribute",
        element: truncateElement(outerHtml),
        selector,
        line,
        suggestion: "Add an alt attribute describing the image, or alt=\"\" if decorative",
        wcagCriteria: "1.1.1",
        wcagLevel: "A",
      })
    } else if (alt.trim()) {
      const altText = alt.trim().toLowerCase()
      if (redundantPatterns.test(altText) || fileExtPattern.test(altText)) {
        issues.push({
          ruleId: "img-alt-redundant",
          category: "images",
          severity: "warning",
          message: `Image has non-descriptive alt text: "${alt.trim()}"`,
          element: truncateElement(outerHtml),
          selector,
          line,
          suggestion: "Replace with a meaningful description of the image content",
          wcagCriteria: "1.1.1",
          wcagLevel: "A",
        })
      }
    }
  })

  // Inline SVG without title
  $("svg").each((_i, el) => {
    const hasTitle = $(el).find("title").length > 0
    const ariaLabel = $(el).attr("aria-label")
    const ariaLabelledBy = $(el).attr("aria-labelledby")
    const role = $(el).attr("role")

    // Skip decorative SVGs
    if (role === "presentation" || role === "none") return
    if ($(el).attr("aria-hidden") === "true") return

    if (!hasTitle && !ariaLabel && !ariaLabelledBy) {
      issues.push({
        ruleId: "svg-title-missing",
        category: "images",
        severity: "warning",
        message: "Inline SVG is missing a <title> element or aria-label",
        element: truncateElement($.html(el) ?? ""),
        selector: "svg",
        suggestion: "Add a <title> child element or aria-label attribute to describe the SVG",
        wcagCriteria: "1.1.1",
        wcagLevel: "A",
      })
    }
  })

  return issues
}

export function analyzeLandmarks($: cheerio.CheerioAPI): ScanIssue[] {
  const issues: ScanIssue[] = []

  const hasMain = $("main, [role='main']").length > 0
  const hasNav = $("nav, [role='navigation']").length > 0
  const hasBanner = $("header, [role='banner']").length > 0

  if (!hasMain) {
    issues.push({
      ruleId: "landmark-main",
      category: "landmarks",
      severity: "error",
      message: "Page is missing a <main> landmark region",
      suggestion: "Wrap the primary content area in a <main> element",
      wcagCriteria: "1.3.1",
      wcagLevel: "A",
    })
  }

  if (!hasNav) {
    issues.push({
      ruleId: "landmark-nav",
      category: "landmarks",
      severity: "warning",
      message: "Page is missing a <nav> landmark for navigation",
      suggestion: "Wrap navigation links in a <nav> element",
      wcagCriteria: "1.3.1",
      wcagLevel: "A",
    })
  }

  if (!hasBanner) {
    issues.push({
      ruleId: "landmark-banner",
      category: "landmarks",
      severity: "warning",
      message: "Page is missing a <header> (banner) landmark",
      suggestion: "Add a <header> element for the site/page banner area",
      wcagCriteria: "1.3.1",
      wcagLevel: "A",
    })
  }

  return issues
}

export function analyzeForms($: cheerio.CheerioAPI, rawHtml?: string): ScanIssue[] {
  const issues: ScanIssue[] = []

  // Inputs without labels
  $("input, select, textarea").each((_i, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase()
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) return

    const id = $(el).attr("id")
    const ariaLabel = $(el).attr("aria-label")
    const ariaLabelledBy = $(el).attr("aria-labelledby")
    const title = $(el).attr("title")

    // Check for wrapping label
    const wrappedInLabel = $(el).closest("label").length > 0
    // Check for label[for=id]
    const hasForLabel = id ? $(`label[for="${id}"]`).length > 0 : false

    if (!ariaLabel && !ariaLabelledBy && !title && !wrappedInLabel && !hasForLabel) {
      const outerHtml = $.html(el) ?? ""
      const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
      issues.push({
        ruleId: "form-label-missing",
        category: "forms",
        severity: "error",
        message: `Form ${(el as any).tagName?.toLowerCase() ?? "input"} is missing an associated label`,
        element: truncateElement(outerHtml),
        selector: buildSelector($, el),
        line,
        suggestion: "Associate a <label> via the 'for' attribute, wrap in a <label>, or add aria-label",
        wcagCriteria: "1.3.1",
        wcagLevel: "A",
      })
    }
  })

  // Buttons without accessible name
  $("button").each((_i, el) => {
    const text = $(el).text().trim()
    const ariaLabel = $(el).attr("aria-label")
    const ariaLabelledBy = $(el).attr("aria-labelledby")
    const title = $(el).attr("title")

    if (!text && !ariaLabel && !ariaLabelledBy && !title) {
      const outerHtml = $.html(el) ?? ""
      const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
      issues.push({
        ruleId: "button-name-empty",
        category: "forms",
        severity: "error",
        message: "Button has no accessible name",
        element: truncateElement(outerHtml),
        selector: buildSelector($, el),
        line,
        suggestion: "Add text content, aria-label, or title to the button",
        wcagCriteria: "4.1.2",
        wcagLevel: "A",
      })
    }
  })

  // Links without accessible name
  $("a").each((_i, el) => {
    const text = $(el).text().trim()
    const ariaLabel = $(el).attr("aria-label")
    const ariaLabelledBy = $(el).attr("aria-labelledby")
    const title = $(el).attr("title")
    const hasImg = $(el).find("img[alt]").length > 0

    if (!text && !ariaLabel && !ariaLabelledBy && !title && !hasImg) {
      const outerHtml = $.html(el) ?? ""
      const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
      issues.push({
        ruleId: "link-name-empty",
        category: "forms",
        severity: "error",
        message: "Link has no accessible name",
        element: truncateElement(outerHtml),
        selector: buildSelector($, el),
        line,
        suggestion: "Add text content, aria-label, or title to the link",
        wcagCriteria: "2.4.4",
        wcagLevel: "A",
      })
    } else if (text && GENERIC_LINK_TEXT.has(text.toLowerCase())) {
      const outerHtml = $.html(el) ?? ""
      const line = rawHtml ? estimateLine(rawHtml, outerHtml.slice(0, 60)) : undefined
      issues.push({
        ruleId: "link-generic-text",
        category: "forms",
        severity: "warning",
        message: `Link has generic text: "${text}"`,
        element: truncateElement(outerHtml),
        selector: buildSelector($, el),
        line,
        suggestion: "Use descriptive link text that indicates the destination or purpose",
        wcagCriteria: "2.4.4",
        wcagLevel: "A",
      })
    }
  })

  return issues
}

export function analyzeMeta($: cheerio.CheerioAPI): { issues: ScanIssue[]; meta: ScanReport["meta"] } {
  const issues: ScanIssue[] = []

  const title = $("title").first().text().trim() || undefined
  const description = $('meta[name="description"]').attr("content")?.trim() || undefined
  const lang = $("html").attr("lang")?.trim() || undefined
  const viewport = $('meta[name="viewport"]').attr("content")?.trim() || undefined
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || undefined

  // Charset: check meta charset or http-equiv
  const charsetAttr = $("meta[charset]").attr("charset")?.trim()
  const httpEquivCharset = $('meta[http-equiv="Content-Type"]').attr("content")?.trim()
  const charset = charsetAttr || httpEquivCharset || undefined

  // OG tags
  const ogTags: Record<string, string> = {}
  $('meta[property^="og:"]').each((_i, el) => {
    const prop = $(el).attr("property")
    const content = $(el).attr("content")
    if (prop && content) {
      ogTags[prop] = content
    }
  })

  const meta: ScanReport["meta"] = { title, description, lang, charset, viewport, ogTags, canonical }

  // Title
  if (!title) {
    issues.push({
      ruleId: "meta-title-missing",
      category: "document",
      severity: "error",
      message: "Page is missing a <title> element",
      suggestion: "Add a <title> element inside <head> with a descriptive page title",
    })
  } else if (title.length < 30 || title.length > 60) {
    issues.push({
      ruleId: "meta-title-length",
      category: "document",
      severity: "warning",
      message: `Title length is ${title.length} characters (recommended: 30-60)`,
      suggestion: title.length < 30
        ? "Expand the title to at least 30 characters for better SEO"
        : "Shorten the title to 60 characters or fewer to avoid truncation in search results",
    })
  }

  // Description
  if (!description) {
    issues.push({
      ruleId: "meta-description-missing",
      category: "document",
      severity: "error",
      message: "Page is missing a meta description",
      suggestion: 'Add <meta name="description" content="..."> with a 120-160 character summary',
    })
  } else if (description.length < 120 || description.length > 160) {
    issues.push({
      ruleId: "meta-description-length",
      category: "document",
      severity: "warning",
      message: `Meta description length is ${description.length} characters (recommended: 120-160)`,
      suggestion: description.length < 120
        ? "Expand the description to at least 120 characters"
        : "Shorten the description to 160 characters or fewer to avoid truncation",
    })
  }

  // Viewport
  if (!viewport) {
    issues.push({
      ruleId: "meta-viewport-missing",
      category: "document",
      severity: "error",
      message: "Page is missing a viewport meta tag",
      suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    })
  }

  // Lang
  if (!lang) {
    issues.push({
      ruleId: "html-lang-missing",
      category: "document",
      severity: "error",
      message: "HTML element is missing a lang attribute",
      suggestion: 'Add lang="en" (or appropriate language code) to the <html> element',
      wcagCriteria: "3.1.1",
      wcagLevel: "A",
    })
  }

  // OG tags
  const requiredOg = ["og:title", "og:description", "og:image"]
  const missingOg = requiredOg.filter((tag) => !ogTags[tag])
  if (missingOg.length > 0) {
    issues.push({
      ruleId: "og-tags-missing",
      category: "document",
      severity: "warning",
      message: `Missing Open Graph tags: ${missingOg.join(", ")}`,
      suggestion: "Add og:title, og:description, and og:image meta tags for better social sharing",
    })
  }

  return { issues, meta }
}

export function analyzeSecurityHeaders(headers: Record<string, string>): ScanReport["securityHeaders"] {
  const checked: Record<string, string> = {
    "content-security-policy": "content-security-policy",
    "strict-transport-security": "strict-transport-security",
    "x-frame-options": "x-frame-options",
    "x-content-type-options": "x-content-type-options",
    "referrer-policy": "referrer-policy",
    "permissions-policy": "permissions-policy",
  }

  const result: Record<string, { present: boolean; value?: string }> = {}
  let presentCount = 0

  for (const [key, headerName] of Object.entries(checked)) {
    const value = headers[headerName] || headers[key]
    if (value) {
      result[key] = { present: true, value }
      presentCount++
    } else {
      result[key] = { present: false }
    }
  }

  let grade: string
  if (presentCount >= 6) grade = "A+"
  else if (presentCount === 5) grade = "A"
  else if (presentCount === 4) grade = "B"
  else if (presentCount === 3) grade = "C"
  else if (presentCount === 2) grade = "D"
  else grade = "F"

  return { grade, headers: result }
}

// ---------------------------------------------------------------------------
// Schema.org / Structured Data Analyzer
// ---------------------------------------------------------------------------

const COMMON_SCHEMA_TYPES = new Set([
  "Organization", "WebPage", "Article", "BreadcrumbList", "FAQPage",
  "LocalBusiness", "Product", "Event", "Person", "HowTo", "Review",
  "AggregateRating", "VideoObject", "ImageObject", "WebSite", "SearchAction",
  "SiteNavigationElement", "ItemList", "ListItem", "PostalAddress",
  "ContactPoint", "Offer", "CreativeWork", "EducationalOrganization",
  "CollegeOrUniversity", "NewsArticle", "BlogPosting", "Course",
  "JobPosting", "Recipe", "MedicalOrganization",
])

const TYPES_NEEDING_NAME = new Set([
  "Organization", "LocalBusiness", "Product", "Event", "Person",
  "EducationalOrganization", "CollegeOrUniversity", "WebSite",
  "Course", "JobPosting", "Recipe", "MedicalOrganization",
])

const TYPES_NEEDING_URL = new Set([
  "Organization", "WebPage", "WebSite", "LocalBusiness",
  "EducationalOrganization", "CollegeOrUniversity",
])

const TYPES_NEEDING_IMAGE = new Set([
  "Article", "NewsArticle", "BlogPosting", "Product", "Organization",
  "Event", "Recipe",
])

const TYPES_NEEDING_DESCRIPTION = new Set([
  "WebPage", "Article", "NewsArticle", "BlogPosting", "Organization",
  "Product", "Event", "Course",
])

export function analyzeSchema($: cheerio.CheerioAPI): { entities: SchemaEntity[]; issues: ScanIssue[] } {
  const entities: SchemaEntity[] = []
  const issues: ScanIssue[] = []

  // ---- JSON-LD extraction ----
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).text().trim()
    if (!raw) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      issues.push({
        ruleId: "schema-json-invalid",
        category: "schema",
        severity: "error",
        message: "Invalid JSON in JSON-LD script tag — could not parse",
        element: truncateElement(raw),
        suggestion: "Fix the JSON syntax in the JSON-LD script block",
      })
      return
    }

    // Handle arrays: some sites wrap entities in []
    const items = Array.isArray(parsed) ? parsed : [parsed]

    for (const item of items) {
      if (typeof item !== "object" || item === null) continue
      const obj = item as Record<string, unknown>

      // Handle @graph arrays (common in WordPress/Yoast)
      const graphItems = Array.isArray(obj["@graph"]) ? obj["@graph"] : [obj]

      for (const graphItem of graphItems) {
        if (typeof graphItem !== "object" || graphItem === null) continue
        const entity = graphItem as Record<string, unknown>
        const rawType = entity["@type"]
        const types = Array.isArray(rawType) ? rawType : [rawType]
        const typeStr = types.filter(Boolean).join(", ") || "Unknown"
        const entityIssues: string[] = []

        // Build properties (exclude @context, @type)
        const properties: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(entity)) {
          if (key !== "@context" && key !== "@type") {
            properties[key] = value
          }
        }

        // Validate @type against common types
        for (const t of types) {
          if (typeof t === "string" && !COMMON_SCHEMA_TYPES.has(t)) {
            entityIssues.push("schema-type-unknown")
            issues.push({
              ruleId: "schema-type-unknown",
              category: "schema",
              severity: "info",
              message: `Schema type "${t}" is not in the common schema.org types list`,
              element: truncateElement(JSON.stringify(entity).slice(0, 200)),
              suggestion: "Verify the @type value is a valid schema.org type",
            })
          }
        }

        // Validate name/headline
        const primaryType = types.find((t) => typeof t === "string") as string | undefined
        if (primaryType && TYPES_NEEDING_NAME.has(primaryType)) {
          if (!entity["name"] && !entity["headline"]) {
            entityIssues.push("schema-name-missing")
            issues.push({
              ruleId: "schema-name-missing",
              category: "schema",
              severity: "warning",
              message: `${primaryType} schema is missing "name" or "headline" property`,
              element: truncateElement(JSON.stringify(entity).slice(0, 200)),
              suggestion: `Add a "name" property to the ${primaryType} structured data`,
            })
          }
        }

        // Articles need name or headline
        if (primaryType === "Article" || primaryType === "NewsArticle" || primaryType === "BlogPosting") {
          if (!entity["headline"] && !entity["name"]) {
            if (!entityIssues.includes("schema-name-missing")) {
              entityIssues.push("schema-name-missing")
              issues.push({
                ruleId: "schema-name-missing",
                category: "schema",
                severity: "warning",
                message: `${primaryType} schema is missing "headline" property`,
                element: truncateElement(JSON.stringify(entity).slice(0, 200)),
                suggestion: `Add a "headline" property to the ${primaryType} structured data`,
              })
            }
          }
        }

        // Validate url
        if (primaryType && TYPES_NEEDING_URL.has(primaryType)) {
          if (!entity["url"]) {
            entityIssues.push("schema-url-missing")
            issues.push({
              ruleId: "schema-url-missing",
              category: "schema",
              severity: "warning",
              message: `${primaryType} schema is missing "url" property`,
              element: truncateElement(JSON.stringify(entity).slice(0, 200)),
              suggestion: `Add a "url" property to the ${primaryType} structured data`,
            })
          }
        }

        // Validate image
        if (primaryType && TYPES_NEEDING_IMAGE.has(primaryType)) {
          if (!entity["image"]) {
            entityIssues.push("schema-image-missing")
            issues.push({
              ruleId: "schema-image-missing",
              category: "schema",
              severity: "warning",
              message: `${primaryType} schema is missing "image" property`,
              element: truncateElement(JSON.stringify(entity).slice(0, 200)),
              suggestion: `Add an "image" property to the ${primaryType} structured data`,
            })
          }
        }

        // Validate description
        if (primaryType && TYPES_NEEDING_DESCRIPTION.has(primaryType)) {
          if (!entity["description"]) {
            entityIssues.push("schema-description-missing")
            issues.push({
              ruleId: "schema-description-missing",
              category: "schema",
              severity: "info",
              message: `${primaryType} schema is missing "description" property`,
              element: truncateElement(JSON.stringify(entity).slice(0, 200)),
              suggestion: `Add a "description" property to the ${primaryType} structured data`,
            })
          }
        }

        entities.push({
          type: typeStr,
          source: "json-ld",
          properties,
          issues: entityIssues,
          raw: truncateElement(raw, 500),
        })
      }
    }
  })

  // ---- Microdata extraction ----
  $("[itemscope]").each((_i, el) => {
    const itemtype = $(el).attr("itemtype") ?? ""
    const typeName = (itemtype.split("/").pop() ?? itemtype) || "Unknown"
    const entityIssues: string[] = []
    const properties: Record<string, unknown> = {}

    $(el).find("[itemprop]").each((_j, propEl) => {
      const propName = $(propEl).attr("itemprop") ?? ""
      const content = $(propEl).attr("content") ?? $(propEl).text().trim()
      if (propName) {
        properties[propName] = content
      }
    })

    const outerHtml = $.html(el) ?? ""
    entities.push({
      type: typeName,
      source: "microdata",
      properties,
      issues: entityIssues,
      raw: truncateElement(outerHtml, 500),
    })
  })

  // Check for orphaned itemprop elements (outside any itemscope)
  $("[itemprop]").each((_i, el) => {
    if ($(el).closest("[itemscope]").length === 0) {
      issues.push({
        ruleId: "schema-itemprop-orphaned",
        category: "schema",
        severity: "warning",
        message: `itemprop="${$(el).attr("itemprop")}" found outside any itemscope`,
        element: truncateElement($.html(el) ?? ""),
        suggestion: "Wrap the element in a parent with itemscope and itemtype attributes",
      })
    }
  })

  // ---- RDFa extraction ----
  $("[typeof]").each((_i, el) => {
    const typeofAttr = $(el).attr("typeof") ?? "Unknown"
    const entityIssues: string[] = []
    const properties: Record<string, unknown> = {}

    $(el).find("[property]").each((_j, propEl) => {
      const propName = $(propEl).attr("property") ?? ""
      const content = $(propEl).attr("content") ?? $(propEl).text().trim()
      if (propName) {
        properties[propName] = content
      }
    })

    const outerHtml = $.html(el) ?? ""
    entities.push({
      type: typeofAttr,
      source: "rdfa",
      properties,
      issues: entityIssues,
      raw: truncateElement(outerHtml, 500),
    })
  })

  // ---- General issues ----

  // No structured data at all
  if (entities.length === 0) {
    issues.push({
      ruleId: "schema-missing",
      category: "schema",
      severity: "info",
      message: "No structured data (JSON-LD, Microdata, or RDFa) found on this page",
      suggestion: "Add structured data to improve search engine understanding; JSON-LD is the recommended format",
    })
  }

  // Check for duplicate types
  const typeCounts = new Map<string, number>()
  for (const entity of entities) {
    typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1)
  }
  for (const [type, count] of typeCounts) {
    if (count > 1 && type !== "ListItem" && type !== "Unknown") {
      issues.push({
        ruleId: "schema-duplicate-type",
        category: "schema",
        severity: "info",
        message: `Duplicate schema type "${type}" appears ${count} times`,
        suggestion: "Ensure multiple entities of the same type are intentional and differentiated",
      })
    }
  }

  return { entities, issues }
}

// ---------------------------------------------------------------------------
// Site Structure Analyzer
// ---------------------------------------------------------------------------

export function analyzeSiteStructure($: cheerio.CheerioAPI, baseUrl: string): SiteStructure {
  let parsedBase: URL
  try {
    parsedBase = new URL(baseUrl)
  } catch {
    parsedBase = new URL("http://localhost")
  }

  // ---- Internal vs External links ----
  const internalMap = new Map<string, { text: string; count: number }>()
  const externalMap = new Map<string, { text: string; count: number }>()

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href")?.trim()
    if (!href) return
    // Skip anchors, mailto, tel, javascript
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return

    let resolved: URL
    try {
      resolved = new URL(href, baseUrl)
    } catch {
      return
    }

    const text = $(el).text().trim().slice(0, 100) || "[no text]"
    const normalizedHref = resolved.href

    const isInternal = resolved.hostname === parsedBase.hostname
    const map = isInternal ? internalMap : externalMap

    const existing = map.get(normalizedHref)
    if (existing) {
      existing.count++
    } else {
      map.set(normalizedHref, { text, count: 1 })
    }
  })

  const internalLinks = Array.from(internalMap.entries())
    .map(([href, data]) => ({ href, text: data.text, count: data.count }))
    .sort((a, b) => b.count - a.count)

  const externalLinks = Array.from(externalMap.entries())
    .map(([href, data]) => ({ href, text: data.text, count: data.count }))
    .sort((a, b) => b.count - a.count)

  // ---- Navigation extraction ----
  const navigation: Array<{ href: string; text: string }> = []
  $("nav a[href]").each((_i, el) => {
    const href = $(el).attr("href")?.trim()
    const text = $(el).text().trim()
    if (href && text) {
      let resolvedHref: string
      try {
        resolvedHref = new URL(href, baseUrl).href
      } catch {
        resolvedHref = href
      }
      navigation.push({ href: resolvedHref, text })
    }
  })

  // ---- Page hierarchy ----
  const title = $("title").first().text().trim() || undefined
  const headingCount = $("h1, h2, h3, h4, h5, h6").length
  const hasHeader = $("header, [role='banner']").length > 0
  const hasNav = $("nav, [role='navigation']").length > 0
  const hasMain = $("main, [role='main']").length > 0
  const hasFooter = $("footer, [role='contentinfo']").length > 0
  const hasAside = $("aside, [role='complementary']").length > 0
  const navLinkCount = navigation.length

  // Breadcrumb detection: aria-label, class, or Schema BreadcrumbList
  const hasBreadcrumb =
    $('nav[aria-label*="breadcrumb" i]').length > 0 ||
    $('nav[aria-label*="Breadcrumb"]').length > 0 ||
    $('ol.breadcrumb, ul.breadcrumb, [class*="breadcrumb"]').length > 0 ||
    $('script[type="application/ld+json"]').toArray().some((el) => {
      const text = $(el).text()
      return text.includes("BreadcrumbList")
    })

  // Sectioning elements
  const sections: Array<{ tag: string; id?: string; ariaLabel?: string }> = []
  $("section, article, aside").each((_i, el) => {
    const tag = (el as any).tagName?.toLowerCase() ?? ""
    const id = $(el).attr("id") || undefined
    const ariaLabel = $(el).attr("aria-label") || undefined
    sections.push({ tag, id, ariaLabel })
  })

  return {
    internalLinks,
    externalLinks,
    navigation,
    pageHierarchy: {
      title,
      headingCount,
      hasHeader,
      hasNav,
      hasMain,
      hasFooter,
      hasAside,
      hasBreadcrumb,
      navLinkCount,
      sections,
    },
  }
}

// ---------------------------------------------------------------------------
// Axe-core Audit
// ---------------------------------------------------------------------------

export async function runAxeAudit(
  html: string,
  url: string,
  wcagLevel: "A" | "AA" | "AAA" = "AA",
): Promise<ScanIssue[]> {
  console.log("[Scanner] Running axe-core audit...")

  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  })

  try {
    // Inject axe-core source into the jsdom window
    const axeSource = axe.source
    dom.window.eval(axeSource)

    // Determine which tags to run
    const tags: string[] = ["wcag2a", "best-practice"]
    if (wcagLevel === "AA" || wcagLevel === "AAA") tags.push("wcag2aa")
    if (wcagLevel === "AAA") tags.push("wcag2aaa")

    // Run axe in the jsdom context
    const results = await (dom.window as any).axe.run(dom.window.document, {
      runOnly: { type: "tag", values: tags },
    })

    const issues: ScanIssue[] = []

    for (const violation of results.violations) {
      const severity = mapAxeSeverity(violation.impact)

      for (const node of violation.nodes) {
        issues.push({
          ruleId: `axe-${violation.id}`,
          category: mapAxeCategory(violation.tags),
          severity,
          message: violation.help,
          element: truncateElement(node.html),
          selector: node.target?.[0] ?? undefined,
          suggestion: violation.helpUrl ? `See: ${violation.helpUrl}` : undefined,
          wcagCriteria: extractWcagCriteria(violation.tags),
          wcagLevel: extractWcagLevel(violation.tags),
        })
      }
    }

    console.log(`[Scanner] axe-core found ${issues.length} issues from ${results.violations.length} rules`)
    return issues
  } finally {
    dom.window.close()
  }
}

function mapAxeSeverity(impact: string | undefined): Severity {
  if (impact === "critical" || impact === "serious") return "error"
  if (impact === "moderate") return "warning"
  return "info"
}

function mapAxeCategory(tags: string[]): Category {
  if (tags.some((t) => t.includes("heading"))) return "headings"
  if (tags.some((t) => t.includes("image") || t.includes("alt"))) return "images"
  if (tags.some((t) => t.includes("landmark") || t.includes("region"))) return "landmarks"
  if (tags.some((t) => t.includes("form") || t.includes("label") || t.includes("button") || t.includes("link"))) return "forms"
  if (tags.some((t) => t.includes("color") || t.includes("contrast"))) return "contrast"
  if (tags.some((t) => t.includes("document") || t.includes("language") || t.includes("title"))) return "document"
  return "forms" // default catch-all for accessibility
}

function extractWcagCriteria(tags: string[]): string | undefined {
  const criteria = tags.find((t) => /^wcag\d{3,4}$/.test(t))
  if (!criteria) return undefined
  // Convert e.g. wcag111 to 1.1.1
  const nums = criteria.replace("wcag", "")
  if (nums.length === 3) return `${nums[0]}.${nums[1]}.${nums[2]}`
  if (nums.length === 4) return `${nums[0]}.${nums[1]}.${nums.slice(2)}`
  return criteria
}

function extractWcagLevel(tags: string[]): "A" | "AA" | "AAA" | undefined {
  if (tags.includes("wcag2aaa")) return "AAA"
  if (tags.includes("wcag2aa")) return "AA"
  if (tags.includes("wcag2a")) return "A"
  return undefined
}

export async function checkLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): Promise<{ issues: ScanIssue[]; summary: ScanReport["linkSummary"] }> {
  console.log("[Scanner] Checking links...")
  const issues: ScanIssue[] = []
  const hrefs = new Map<string, any[]>()

  // Collect unique hrefs
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href")?.trim()
    if (!href) return

    // Skip anchors, mailto, tel, javascript
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return

    // Resolve relative URLs
    let resolved: string
    try {
      resolved = new URL(href, baseUrl).href
    } catch {
      return
    }

    if (!hrefs.has(resolved)) {
      hrefs.set(resolved, [])
    }
    hrefs.get(resolved)!.push(el)
  })

  // Check for target="_blank" without rel="noopener"
  $("a[target='_blank']").each((_i, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase()
    if (!rel.includes("noopener") && !rel.includes("noreferrer")) {
      issues.push({
        ruleId: "link-new-window",
        category: "links",
        severity: "warning",
        message: "Link opens in new window without rel=\"noopener\"",
        element: truncateElement($.html(el) ?? ""),
        selector: buildSelector($, el),
        suggestion: 'Add rel="noopener noreferrer" to links with target="_blank"',
      })
    }
  })

  let healthy = 0
  let broken = 0
  let redirects = 0
  let timeouts = 0

  // Check links with concurrency limit of 5
  const urls = Array.from(hrefs.keys()).filter((u) => isPublicUrl(u))
  const total = urls.length

  // Process in batches of 5
  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5)

    const results = await Promise.allSettled(
      batch.map(async (linkUrl) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)

        try {
          const resp = await fetch(linkUrl, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "manual",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)" },
          })
          clearTimeout(timer)
          return { url: linkUrl, status: resp.status }
        } catch (err: any) {
          clearTimeout(timer)
          if (err.name === "AbortError") {
            return { url: linkUrl, status: -1 } // timeout
          }
          return { url: linkUrl, status: -2 } // network error
        }
      }),
    )

    for (const result of results) {
      if (result.status === "rejected") {
        timeouts++
        continue
      }

      const { url: linkUrl, status } = result.value
      if (status >= 200 && status < 300) {
        healthy++
      } else if (status >= 300 && status < 400) {
        redirects++
      } else if (status === -1) {
        timeouts++
        issues.push({
          ruleId: "link-timeout",
          category: "links",
          severity: "warning",
          message: `Link timed out: ${linkUrl}`,
          suggestion: "Verify the link is accessible; it may be slow or blocking HEAD requests",
        })
      } else {
        broken++
        issues.push({
          ruleId: "link-broken",
          category: "links",
          severity: "error",
          message: `Broken link (HTTP ${status}): ${linkUrl}`,
          suggestion: "Remove or update this link",
        })
      }
    }
  }

  console.log(`[Scanner] Link check complete: ${total} links — ${healthy} healthy, ${broken} broken, ${redirects} redirects, ${timeouts} timeouts`)

  return {
    issues,
    summary: { total, healthy, broken, redirects, timeouts },
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function calculateScores(issues: ScanIssue[]): { categoryScores: CategoryScore[]; overallScore: number } {
  const allCategories: Category[] = [
    "headings", "images", "landmarks", "forms", "document", "links", "performance", "contrast", "security", "schema", "structure",
  ]

  const categoryScores: CategoryScore[] = allCategories.map((category) => {
    const catIssues = issues.filter((i) => i.category === category)
    const errors = catIssues.filter((i) => i.severity === "error").length
    const warnings = catIssues.filter((i) => i.severity === "warning").length
    const infos = catIssues.filter((i) => i.severity === "info").length
    const score = Math.max(0, Math.min(100, 100 - errors * 15 - warnings * 5 - infos * 1))

    return { category, score, errors, warnings, infos }
  })

  // Weighted overall score
  // Accessibility (images + contrast): 30%
  // Structure (headings + landmarks + forms + structure): 20%
  // SEO / document + schema: 25%
  // Security: 10%
  // Links: 10%
  // Performance: 5%
  const getScore = (cat: Category) => categoryScores.find((c) => c.category === cat)?.score ?? 100

  const accessibilityScore = (getScore("images") + getScore("contrast")) / 2
  const structureScore = (getScore("headings") + getScore("landmarks") + getScore("forms") + getScore("structure")) / 4
  const seoScore = (getScore("document") * 2 + getScore("schema")) / 3
  const securityScore = getScore("security")
  const linksScore = getScore("links")

  const overallScore = Math.round(
    accessibilityScore * 0.30 +
    structureScore * 0.20 +
    seoScore * 0.25 +
    securityScore * 0.10 +
    linksScore * 0.10 +
    getScore("performance") * 0.05,
  )

  return { categoryScores, overallScore: Math.max(0, Math.min(100, overallScore)) }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function generateSummary(
  issues: ScanIssue[],
  categoryScores: CategoryScore[],
  securityHeaders: ScanReport["securityHeaders"],
  linkSummary: ScanReport["linkSummary"] | undefined,
  meta: ScanReport["meta"],
  schemaData?: ScanReport["schema"],
): ScanSummary {
  // Top priorities: worst errors first, then by count
  const errorCounts = new Map<string, { count: number; severity: Severity; message: string }>()
  for (const issue of issues) {
    const key = issue.ruleId
    const existing = errorCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      errorCounts.set(key, { count: 1, severity: issue.severity, message: issue.message })
    }
  }

  const sorted = Array.from(errorCounts.entries()).sort(([, a], [, b]) => {
    const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
    const sComp = severityOrder[a.severity] - severityOrder[b.severity]
    if (sComp !== 0) return sComp
    return b.count - a.count
  })

  const topPriorities: string[] = sorted.slice(0, 3).map(([_ruleId, info]) => {
    const countStr = info.count > 1 ? ` (${info.count} instances)` : ""
    return `${info.message}${countStr}`
  })

  // What's working
  const whatsWorking: string[] = []

  if (securityHeaders.grade === "A+" || securityHeaders.grade === "A") {
    whatsWorking.push(`Security headers grade: ${securityHeaders.grade}`)
  }

  if (meta.lang) {
    whatsWorking.push("Page has a language attribute set")
  }

  if (linkSummary && linkSummary.total > 0) {
    const healthPct = Math.round((linkSummary.healthy / linkSummary.total) * 100)
    if (healthPct >= 90) {
      whatsWorking.push(`${healthPct}% of links are healthy (${linkSummary.healthy}/${linkSummary.total})`)
    }
  }

  const headingScore = categoryScores.find((c) => c.category === "headings")?.score ?? 0
  if (headingScore > 90) {
    whatsWorking.push("Heading structure is well-organized")
  }

  const imageScore = categoryScores.find((c) => c.category === "images")?.score ?? 0
  if (imageScore > 90) {
    whatsWorking.push("Images have proper alt text")
  }

  if (meta.title) {
    whatsWorking.push("Page has a title element")
  }

  if (meta.viewport) {
    whatsWorking.push("Viewport meta tag is configured")
  }

  // Schema findings
  if (schemaData && schemaData.totalFound > 0) {
    const jsonLdEntities = schemaData.entities.filter((e) => e.source === "json-ld")
    const typeNames = [...new Set(jsonLdEntities.map((e) => e.type))].slice(0, 3)
    if (schemaData.hasJsonLd && typeNames.length > 0) {
      whatsWorking.push(`Valid ${typeNames.join(", ")} schema with JSON-LD`)
    }
    const hasBreadcrumb = schemaData.entities.some((e) => e.type.includes("BreadcrumbList"))
    if (hasBreadcrumb) {
      whatsWorking.push("BreadcrumbList structured data present")
    }
  }

  // Keep 2-3 positives
  return {
    topPriorities: topPriorities.length > 0 ? topPriorities : ["No critical issues found"],
    whatsWorking: whatsWorking.slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// Helper: build a CSS selector for an element
// ---------------------------------------------------------------------------

function buildSelector($: cheerio.CheerioAPI, el: any): string {
  const tagName = (el as any).tagName?.toLowerCase() ?? ""
  const id = $(el).attr("id")
  if (id) return `${tagName}#${id}`
  const className = ($(el).attr("class") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".")
  return className ? `${tagName}.${className}` : tagName
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

export type ProgressCallback = (step: string, status: "running" | "done") => void

export async function scanUrl(
  url: string,
  options: ScanOptions = {},
  onProgress?: ProgressCallback,
): Promise<ScanReport> {
  const timeout = options.timeout ?? 15000
  const wcagLevel = options.wcagLevel ?? "AA"
  const progress = onProgress ?? (() => {})

  // Step 1: Fetch
  progress("fetch", "running")
  console.log(`[Scanner] Fetching: ${url}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const fetchStart = Date.now()
  let response: Response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === "AbortError") {
      throw new Error(`Fetch timed out after ${timeout}ms`)
    }
    throw new Error(`Failed to fetch URL: ${err.message}`)
  }
  clearTimeout(timer)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()
  const fetchTimeMs = Date.now() - fetchStart
  const htmlSize = Buffer.byteLength(html, "utf-8")
  progress("fetch", "done")

  console.log(`[Scanner] Fetched ${htmlSize} bytes in ${fetchTimeMs}ms`)

  // Parse with cheerio
  const $ = cheerio.load(html)
  const domElements = $("*").length

  // Extract response headers for security check
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value
  })

  // Step 2: Structure + SEO analysis
  progress("structure", "running")
  console.log("[Scanner] Running analyzers...")
  const [headingResult, imageIssues, landmarkIssues, formIssues, metaResult, securityHeaders, schemaResult, siteStructure] = await Promise.all([
    Promise.resolve(analyzeHeadings($, html)),
    Promise.resolve(analyzeImages($, html)),
    Promise.resolve(analyzeLandmarks($)),
    Promise.resolve(analyzeForms($, html)),
    Promise.resolve(analyzeMeta($)),
    Promise.resolve(analyzeSecurityHeaders(responseHeaders)),
    Promise.resolve(analyzeSchema($)),
    Promise.resolve(analyzeSiteStructure($, url)),
  ])
  progress("structure", "done")

  // Step 3: Accessibility (axe-core)
  progress("accessibility", "running")
  let axeIssues: ScanIssue[] = []
  try {
    axeIssues = await runAxeAudit(html, url, wcagLevel)
  } catch (err: any) {
    console.error("[Scanner] axe-core audit failed:", err.message)
    // Continue without axe results
  }
  progress("accessibility", "done")

  // Deduplicate: if both a custom rule and axe flagged the same element+category, keep the axe version
  const axeSelectors = new Set(axeIssues.filter((i) => i.selector).map((i) => `${i.category}::${i.selector}`))
  const customIssues = [
    ...headingResult.issues,
    ...imageIssues,
    ...landmarkIssues,
    ...formIssues,
    ...metaResult.issues,
    ...schemaResult.issues,
  ].filter((issue) => {
    if (!issue.selector) return true
    return !axeSelectors.has(`${issue.category}::${issue.selector}`)
  })

  let allIssues = [...customIssues, ...axeIssues]

  // Security issues — generate per-header issues for each missing header
  const missingHeaders = Object.entries(securityHeaders.headers).filter(([, v]) => !v.present)
  for (const [headerName] of missingHeaders) {
    const severity: Severity = (headerName === "content-security-policy" || headerName === "strict-transport-security") ? "error" : "warning"
    allIssues.push({
      ruleId: `security-header-${headerName}`,
      category: "security",
      severity,
      message: `Missing security header: ${headerName}`,
      suggestion: securityHeaderSuggestion(headerName),
    })
  }

  // Step 4: Link checking (optional)
  let linkSummary: ScanReport["linkSummary"] | undefined
  if (options.checkLinks) {
    progress("links", "running")
    try {
      const linkResult = await checkLinks($, url)
      allIssues = [...allIssues, ...linkResult.issues]
      linkSummary = linkResult.summary
    } catch (err: any) {
      console.error("[Scanner] Link checking failed:", err.message)
    }
    progress("links", "done")
  }

  // Step 5: Scoring
  progress("scoring", "running")
  const { categoryScores, overallScore } = calculateScores(allIssues)

  // Build the schema report block
  const schemaReport: ScanReport["schema"] = {
    entities: schemaResult.entities,
    totalFound: schemaResult.entities.length,
    hasJsonLd: schemaResult.entities.some((e) => e.source === "json-ld"),
    hasMicrodata: schemaResult.entities.some((e) => e.source === "microdata"),
    hasRdfa: schemaResult.entities.some((e) => e.source === "rdfa"),
    issues: schemaResult.issues,
  }

  // Generate summary
  const summary = generateSummary(allIssues, categoryScores, securityHeaders, linkSummary, metaResult.meta, schemaReport)
  progress("scoring", "done")

  console.log(`[Scanner] Scan complete — score: ${overallScore}/100, ${allIssues.length} issues`)

  return {
    url,
    scannedAt: new Date().toISOString(),
    fetchTimeMs,
    htmlSize,
    domElements,
    overallScore,
    categoryScores,
    summary,
    issues: allIssues,
    headingTree: headingResult.tree,
    meta: metaResult.meta,
    linkSummary,
    securityHeaders,
    schema: schemaReport,
    siteStructure,
  }
}

function securityHeaderSuggestion(header: string): string {
  const suggestions: Record<string, string> = {
    "content-security-policy": "Add a Content-Security-Policy header to prevent XSS and data injection attacks",
    "strict-transport-security": "Add Strict-Transport-Security to enforce HTTPS connections (e.g., max-age=31536000; includeSubDomains)",
    "x-frame-options": "Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking",
    "x-content-type-options": "Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing",
    "referrer-policy": "Add Referrer-Policy: strict-origin-when-cross-origin to control referrer information",
    "permissions-policy": "Add Permissions-Policy to restrict browser features (camera, microphone, geolocation, etc.)",
  }
  return suggestions[header] ?? "Configure your web server to send this security header"
}
