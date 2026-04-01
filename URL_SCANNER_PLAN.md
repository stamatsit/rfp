# URL Scanner & Accessibility Auditor — Implementation Plan

## Overview

A new `/scanner` page that lets users enter any URL, fetches and analyzes the page, and returns a detailed report covering accessibility compliance, heading structure, SEO basics, performance hints, and link health. Results are displayed in a categorized, actionable dashboard with severity levels and export options.

---

## Table of Contents

1. [Architecture](#architecture)
2. [New Dependencies](#new-dependencies)
3. [Server Implementation](#server-implementation)
4. [Client Implementation](#client-implementation)
5. [Rule Engine — Full Rule Catalog](#rule-engine--full-rule-catalog)
6. [Scan Result Data Model](#scan-result-data-model)
7. [UI/UX Design](#uiux-design)
8. [Integration Points](#integration-points)
9. [Wiring It Up — Step by Step](#wiring-it-up--step-by-step)
10. [Future Enhancements](#future-enhancements)

---

## Architecture

```
┌──────────────┐        POST /api/scanner/scan         ┌──────────────────┐
│              │  ─────────────────────────────────►    │                  │
│   React UI   │        { url, options }                │   Express API    │
│  /scanner    │                                        │  /api/scanner    │
│              │  ◄─────────────────────────────────    │                  │
└──────────────┘        { ScanReport }                  └────────┬─────────┘
                                                                 │
                                                    ┌────────────┼────────────┐
                                                    ▼            ▼            ▼
                                              ┌──────────┐ ┌──────────┐ ┌──────────┐
                                              │  Cheerio  │ │ axe-core │ │  Custom  │
                                              │  Parser   │ │ + jsdom  │ │  Rules   │
                                              └──────────┘ └──────────┘ └──────────┘
```

**Flow:**
1. User enters a URL on the `/scanner` page
2. Client sends `POST /api/scanner/scan` with the URL and scan options
3. Server fetches the raw HTML from the URL
4. HTML is parsed with Cheerio (lightweight) for custom structural rules
5. HTML is loaded into jsdom + axe-core for full WCAG 2.1 accessibility auditing
6. All results are merged into a unified `ScanReport` and returned to the client
7. Client renders the report in categorized tabs with severity indicators

---

## New Dependencies

### Server (`packages/server`)

| Package | Purpose | Size |
|---------|---------|------|
| `cheerio` | Fast HTML parser for structural analysis (heading hierarchy, meta tags, links) | ~200KB |
| `axe-core` | Industry-standard accessibility rule engine (WCAG 2.0/2.1 AA/AAA) | ~1MB |
| `jsdom` | DOM environment for running axe-core server-side | ~500KB |

```bash
cd packages/server && npm install cheerio axe-core jsdom
cd packages/server && npm install -D @types/jsdom
```

### Client (`packages/client`)

No new dependencies required — uses existing UI components (Radix, Tailwind, Recharts for score visualization).

---

## Server Implementation

### File: `packages/server/src/routes/scanner.ts`

New Express router with these endpoints:

#### `POST /api/scanner/scan`

Main scan endpoint.

**Request body:**
```typescript
{
  url: string               // Required — the URL to scan
  options?: {
    checkLinks?: boolean    // Validate all links for 404s (slower)
    wcagLevel?: "A" | "AA" | "AAA"  // Default: "AA"
    timeout?: number        // Fetch timeout in ms, default 15000
  }
}
```

**Response:** `ScanReport` (see data model below)

**Implementation steps:**
1. Validate URL format (must be http/https)
2. Fetch the HTML with a configurable timeout and user-agent header
3. Run structural analysis via Cheerio
4. Run accessibility audit via jsdom + axe-core
5. Optionally run link checker (crawl all `<a href>` for status codes)
6. Merge and return results

#### `POST /api/scanner/batch`

_(Phase 2)_ Scan multiple URLs at once.

```typescript
{
  urls: string[]   // Max 10 URLs
  options?: { ... }
}
```

### File: `packages/server/src/services/scannerService.ts`

The core scanning logic, broken into composable analyzers:

```typescript
// Main orchestrator
export async function scanUrl(url: string, options: ScanOptions): Promise<ScanReport>

// Individual analyzers
export function analyzeHeadings(html: string): HeadingReport
export function analyzeImages(html: string): ImageReport
export function analyzeLinks(html: string, baseUrl: string): Promise<LinkReport>
export function analyzeMeta(html: string): MetaReport
export function analyzeLandmarks(html: string): LandmarkReport
export function analyzeContrast(html: string): ContrastReport
export async function runAxeAudit(html: string, url: string): Promise<AxeReport>
```

---

## Client Implementation

### File: `packages/client/src/pages/URLScanner.tsx`

New page component — lazy-loaded like all other pages.

**Sections:**
1. **URL Input Bar** — text input + "Scan" button + options dropdown
2. **Score Overview** — circular score gauges (Accessibility, Structure, SEO, Links)
3. **Issue List** — filterable/sortable table of all findings
4. **Heading Tree** — visual tree of the heading hierarchy
5. **Details Panel** — click any issue to see explanation, affected element, and fix suggestion

### File: `packages/client/src/App.tsx`

Add the lazy import and route:

```tsx
const URLScanner = lazy(() => import("./pages/URLScanner").then(m => ({ default: m.URLScanner })))

// Inside <Routes>:
<Route path="/scanner" element={<ProtectedRoute><URLScanner /></ProtectedRoute>} />
```

### Update: `packages/client/src/components/NavRail.tsx`

Add scanner icon to navigation rail.

### Update: `packages/client/src/components/CommandPalette.tsx`

Add "URL Scanner" to command palette search results.

---

## Rule Engine — Full Rule Catalog

### Category 1: Heading Structure

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `heading-hierarchy` | Heading levels must not skip (e.g., h1 → h3 without h2) | Error |
| `heading-single-h1` | Page should have exactly one `<h1>` | Warning |
| `heading-missing-h1` | Page has no `<h1>` element | Error |
| `heading-empty` | Heading tag exists but contains no text | Error |
| `heading-too-long` | Heading text exceeds 70 characters | Info |
| `heading-order-first` | First heading on page should be `<h1>` | Warning |

### Category 2: Images & Media

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `img-alt-missing` | `<img>` has no `alt` attribute | Error |
| `img-alt-empty` | `<img>` has `alt=""` on a non-decorative image | Warning |
| `img-alt-redundant` | Alt text is "image", "photo", "picture", or filename | Warning |
| `img-dimensions` | `<img>` missing `width`/`height` (causes layout shift) | Info |
| `svg-title-missing` | Inline `<svg>` has no `<title>` element | Warning |
| `video-captions` | `<video>` has no `<track kind="captions">` | Error |
| `audio-transcript` | `<audio>` element with no associated transcript link | Warning |

### Category 3: Landmarks & Semantics

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `landmark-main` | Page missing `<main>` landmark | Error |
| `landmark-nav` | Page missing `<nav>` landmark | Warning |
| `landmark-banner` | Page missing `<header>` / `role="banner"` | Warning |
| `landmark-contentinfo` | Page missing `<footer>` / `role="contentinfo"` | Info |
| `landmark-duplicate` | Multiple `<main>` elements without distinct labels | Error |
| `list-structure` | `<li>` used outside of `<ul>` or `<ol>` | Error |
| `table-header` | `<table>` has no `<th>` elements | Warning |
| `table-caption` | Data `<table>` has no `<caption>` | Info |

### Category 4: Forms & Interactive

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `form-label-missing` | Form input has no associated `<label>` | Error |
| `form-label-empty` | `<label>` element is empty or whitespace-only | Error |
| `form-fieldset` | Related radio/checkbox group not wrapped in `<fieldset>` | Warning |
| `button-name-empty` | `<button>` has no accessible name (text, aria-label, or title) | Error |
| `link-name-empty` | `<a>` has no accessible name | Error |
| `link-generic-text` | Link text is "click here", "read more", "learn more" without context | Warning |
| `tabindex-positive` | Element has `tabindex > 0` (disrupts tab order) | Warning |
| `autocomplete-missing` | Input for name/email/phone/address missing `autocomplete` attribute | Info |

### Category 5: Document & SEO

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `meta-title-missing` | No `<title>` tag | Error |
| `meta-title-length` | Title not between 30-60 characters | Warning |
| `meta-description-missing` | No meta description | Warning |
| `meta-description-length` | Meta description not between 120-160 characters | Info |
| `meta-viewport-missing` | No viewport meta tag | Error |
| `meta-charset-missing` | No charset declaration | Warning |
| `html-lang-missing` | `<html>` has no `lang` attribute | Error |
| `html-lang-invalid` | `lang` attribute value is not a valid BCP 47 tag | Warning |
| `og-tags-missing` | Missing Open Graph tags (og:title, og:description, og:image) | Info |
| `canonical-missing` | No canonical link tag | Info |

### Category 6: Links

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `link-broken` | Link returns 4xx or 5xx status | Error |
| `link-redirect` | Link returns 3xx redirect | Info |
| `link-timeout` | Link did not respond within timeout | Warning |
| `link-insecure` | HTTPS page links to HTTP resource | Warning |
| `link-new-window` | `target="_blank"` without `rel="noopener"` | Warning |

### Category 7: Performance Hints

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `perf-render-blocking` | CSS/JS in `<head>` without `async`/`defer`/`media` | Info |
| `perf-large-dom` | DOM has > 1500 elements | Info |
| `perf-inline-styles` | Excessive inline `style` attributes (> 20) | Info |
| `perf-no-lazy` | Images below the fold without `loading="lazy"` | Info |

### Category 8: Color Contrast (via axe-core)

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `color-contrast-aa` | Text does not meet WCAG AA contrast ratio (4.5:1 normal, 3:1 large) | Error |
| `color-contrast-aaa` | Text does not meet WCAG AAA contrast ratio (7:1 normal, 4.5:1 large) | Warning |
| `color-contrast-ui` | Non-text UI components don't meet 3:1 ratio | Warning |

---

## Scan Result Data Model

```typescript
// packages/server/src/types/scanner.ts

export type Severity = "error" | "warning" | "info"

export type Category =
  | "headings"
  | "images"
  | "landmarks"
  | "forms"
  | "document"
  | "links"
  | "performance"
  | "contrast"

export interface ScanIssue {
  ruleId: string
  category: Category
  severity: Severity
  message: string            // Human-readable description
  element?: string           // The HTML snippet of the offending element
  selector?: string          // CSS selector to locate the element
  line?: number              // Line number in source HTML
  suggestion?: string        // How to fix it
  wcagCriteria?: string      // e.g., "1.1.1", "2.4.6"
  wcagLevel?: "A" | "AA" | "AAA"
}

export interface HeadingNode {
  level: number              // 1-6
  text: string
  line?: number
  children: HeadingNode[]
  issues: string[]           // Rule IDs that flagged this heading
}

export interface CategoryScore {
  category: Category
  score: number              // 0-100
  errors: number
  warnings: number
  infos: number
}

export interface ScanReport {
  url: string
  scannedAt: string          // ISO timestamp
  fetchTimeMs: number        // How long the page took to load
  htmlSize: number           // Bytes
  domElements: number        // Total DOM node count

  // Overall
  overallScore: number       // 0-100 weighted average
  categoryScores: CategoryScore[]

  // Detailed
  issues: ScanIssue[]
  headingTree: HeadingNode[]

  // Metadata extracted
  meta: {
    title?: string
    description?: string
    lang?: string
    charset?: string
    viewport?: string
    ogTags: Record<string, string>
    canonical?: string
  }

  // Link check results (if enabled)
  linkSummary?: {
    total: number
    healthy: number
    broken: number
    redirects: number
    timeouts: number
  }
}
```

---

## UI/UX Design

Design principle: **minimal, breathable, progressive disclosure.** Each view does one thing well. Details revealed on click, not upfront.

Approved mockups: `mockups/01-scanner-home.html` through `mockups/05-export-compare.html`

### View 1 — Home (`/scanner`)

Centered, search-engine style. Nothing else on the page.

- Title + one-line subtitle
- Single URL input bar with Scan button (gradient blue)
- Inline option checkboxes: WCAG Audit, Headings, SEO, Links
- WCAG level dropdown (A / AA / AAA)
- Recent scans list below — each row: URL, time ago, error count, score badge

No feature cards, no stats grid, no hero section.

### View 2 — Results Dashboard

Single column, max-width 4xl. No sidebar.

- **Top:** Back arrow + URL + scan timestamp + Export / Rescan buttons
- **Score row:** SVG ring gauge (overall) + 4 small category cards (A11y, Structure, SEO, Security) with score + progress bar
- **Summary card:** A single card below the scores with a quick snapshot:
  - **Top priorities** (bulleted) — the 3 most impactful things to fix, pulled from errors sorted by WCAG level (A first) and instance count. e.g.:
    - "3 images have no alt text — screen readers can't describe them"
    - "Heading structure skips from H1 to H3 — add an H2"
    - "Newsletter input has no label — form is inaccessible"
  - **What's working** (bulleted) — 2-3 things that passed. e.g.:
    - "All security headers present (A grade)"
    - "Page has a valid lang attribute"
    - "All 61 links are healthy"
  - Generated server-side from the `ScanReport` — not AI, just rule-based logic picking the highest-severity issues and the cleanest passing categories
- **Tabs:** Issues | Headings | Links | History — simple underline tabs
- **Filter pills:** All / Errors / Warnings / Info — rounded pill buttons
- **Issue list:** Flat card list. Each card = colored dot (red/yellow/blue) + title + one-line description with WCAG ref and line number. Clicking navigates to detail view.

No grouped sections, no sidebar metadata, no split panels.

### View 3 — Heading Tree

Single column, max-width 3xl.

- Same tab bar as Results
- Summary line: "12 headings found — 2 errors, 1 warning"
- Tree inside one card:
  - Indented rows with `border-left` branch lines
  - Monospace H1-H6 badges, color-coded per level (primary, blue, cyan, teal, violet, pink)
  - Line numbers right-aligned
  - Errors: red background highlight + inline label ("Skipped H2")
  - Warnings: yellow background highlight + inline label ("Empty heading")

No sidebar summary, no legend panel, no checkboxes.

### View 4 — Issue Detail

Single column, max-width 3xl. Reached by clicking any issue.

- Back link to results
- **Header:** Severity badge (ERROR/WARNING/INFO) + rule ID + WCAG reference
- **Title + description** — 2-3 sentences max
- **Affected elements:** Stacked cards, each showing:
  - Line number + CSS selector (header bar)
  - Code snippet with red left-border (the problem)
  - Code snippet with green left-border (the fix)
- **How to Fix:** Numbered list, 3-5 steps
- **Learn More:** 2-3 links to W3C / WebAIM

No split-panel layout, no element counter ("1 of 3"), no related resources sidebar.

### View 5 — History & Export

Single column, max-width 4xl.

- Same tab bar, "History" active
- **Export:** 4 compact buttons in a row (PDF, JSON, CSV, Copy) — just label + subtitle
- **Comparison card:** Grid showing current vs previous scores (Overall, A11y, SEO, Errors) with green/red delta numbers + "8 fixed / 2 new" summary
- **History table:** Date, score badge, error count, change delta — 4 columns, clean rows

No side-by-side scan cards, no delta bar charts, no issue change breakdowns.

### Score Colors

- **90-100:** Green (`success`)
- **70-89:** Yellow/Orange (`warning`)
- **0-69:** Red (`danger`)

### Severity Indicators

- **Error:** Small red dot (2px circle) — no icon
- **Warning:** Small yellow dot
- **Info:** Small blue dot

### Typography & Spacing

- Heading badges: monospace, 11px, color-coded pill
- Body text: 14px
- Generous vertical spacing between sections (mb-8 to mb-12)
- Max content width: 3xl (768px) for focused views, 4xl (896px) for table views

---

## Integration Points

### CommandPalette.tsx

Add entry:
```typescript
{ label: "URL Scanner", description: "Scan websites for accessibility & structure issues", path: "/scanner", icon: "Search" }
```

### NavRail.tsx

Add icon:
```typescript
{ path: "/scanner", icon: Globe, label: "Scanner" }
```

### AppHeader.tsx

Add to navigation links if header nav is used.

### vercel.json

Add rewrite rule for the SPA route:
```json
{ "source": "/scanner", "destination": "/index.html" }
```

### CSP (Content Security Policy)

No changes needed — the server fetches external URLs, not the browser.

### Help Page

Add a "URL Scanner" section to `/help` explaining:
- What it checks (WCAG, headings, SEO, security headers, links)
- How scoring works
- What WCAG levels mean (A / AA / AAA)
- Limitations (static HTML only in Phase 1, no JS rendering)

### AI Companion

The floating AI Companion (`AICompanion.tsx`) should be context-aware on the `/scanner` route:
- Detects when scan results are loaded and offers to help interpret them
- Answers questions like *"What should I fix first?"*, *"Explain WCAG 1.1.1"*, *"Write the corrected HTML"*
- Can summarize results for an email or Slack message
- System prompt addition: inject the current `ScanReport` JSON as context when on `/scanner`

---

## Scanning UX — Loading & Status

The gap between clicking "Scan" and seeing results needs to feel fast and informative.

### Scanning Animation

Replace the home view with a centered status sequence:

```
Fetching page...          (0-2s)    Globe icon spinning
Analyzing structure...    (2-3s)    Heading icon
Checking accessibility... (3-5s)    Shield icon
Validating links...       (5-10s)   Link icon (only if enabled)
Building report...        (10-11s)  Chart icon
```

Each step shows a single line with an animated dot indicator. Previous steps show a green check. Simple, vertical, centered — matches the minimal design.

If the scan takes longer than 15 seconds, show: *"This is taking longer than usual. Large pages or slow servers can take up to 30 seconds."*

### Implementation

Use SSE (Server-Sent Events) from the scan endpoint to stream status updates:

```typescript
// Server sends progress events
res.write(`data: ${JSON.stringify({ step: "fetch", status: "running" })}\n\n`)
// ... after fetch completes
res.write(`data: ${JSON.stringify({ step: "fetch", status: "done" })}\n\n`)
res.write(`data: ${JSON.stringify({ step: "headings", status: "running" })}\n\n`)
// ... final result
res.write(`data: ${JSON.stringify({ step: "complete", report: scanReport })}\n\n`)
```

Client uses `EventSource` or `fetch` with readable stream to update the UI in real time.

---

## Error States & Edge Cases

### URL Validation Errors (before scan starts)

| Input | Response |
|-------|----------|
| Empty / whitespace | "Enter a URL to scan" (inline, below input) |
| Missing protocol | Auto-prepend `https://` and proceed |
| Non-HTTP protocol (`ftp://`, `file://`) | "Only http and https URLs are supported" |
| Private IP / localhost | "Cannot scan internal or private addresses" (SSRF guard) |
| Invalid URL format | "This doesn't look like a valid URL" |

### Fetch Errors (during scan)

| Scenario | What the user sees |
|----------|-------------------|
| DNS resolution failure | "Could not reach this URL. Check the address and try again." |
| Connection timeout (>15s) | "The server took too long to respond." |
| HTTP 4xx | "Page returned a [404/403/etc] error." + still show any headers we got |
| HTTP 5xx | "The server returned an error. Try again later." |
| SSL certificate error | "This site has an SSL certificate problem." |
| Non-HTML response (PDF, image, JSON) | "This URL returned [content-type], not HTML. Scanner requires an HTML page." |
| Very large page (>5MB HTML) | "Page HTML exceeds 5MB limit. Scanning the first 5MB." (truncate and proceed) |
| Bot-blocked (403 with challenge page) | "This site appears to block automated requests." |

### Content Edge Cases

| Scenario | Behavior |
|----------|----------|
| SPA with empty `<div id="root">` | Flag as info: "Page appears to be a JavaScript app. Content may not be fully rendered. Phase 2 will add JS rendering support." Show what we can from the raw HTML (meta tags, `<noscript>`, etc.) |
| Login wall / auth-gated content | Scan whatever the public response returns. Note: "This page may require authentication. Showing public content only." |
| Redirect chain | Follow redirects (max 5 hops). Show final URL + note: "Redirected from [original] to [final]" |
| Empty page (`<html><body></body></html>`) | Score 0 across the board. Flag: "Page has no visible content." |
| Non-English pages | Scan works the same. Readability scoring (Phase 3) should detect `lang` and adjust formulas. |

### Error State UI

Errors replace the scanning animation with a single card:

```
[Red icon]
Could not reach this URL
Check the address and try again.

[Try Again button]
```

Clean, centered, same minimal style. No stack traces, no technical details unless the user expands a "Details" disclosure.

---

## Caching Strategy

### When to Cache

- Cache scan results for the **same URL** within a **10-minute window**
- Keyed on: `normalizedUrl + userId` (each user gets their own cache)
- URL normalization: lowercase host, strip trailing slash, sort query params

### How It Works

1. Before scanning, check `url_scans` table for a completed scan of this URL within the last 10 minutes
2. If found: return cached result immediately with a note — *"Showing cached results from X minutes ago"* + a "Rescan" button
3. If not found or expired: run a fresh scan
4. The "Rescan" button always forces a fresh scan regardless of cache

### Why 10 Minutes

- Short enough that results stay relevant (pages don't change that fast)
- Long enough to prevent accidental duplicate scans (double-click, page refresh)
- Protects the server from being used to DDoS external sites

---

## Wiring It Up — Step by Step

This is the recommended implementation order. Each step is independently testable.

### Step 1: Server Foundation

1. Install dependencies: `cheerio`, `axe-core`, `jsdom`, `@types/jsdom`
2. Create `packages/server/src/types/scanner.ts` — all TypeScript types
3. Create `packages/server/src/services/scannerService.ts` — start with `analyzeHeadings()` only
4. Create `packages/server/src/routes/scanner.ts` — POST `/scan` endpoint
5. Register route in `packages/server/src/index.ts`: `app.use("/api/scanner", scannerRoutes)`
6. Test with curl: `curl -X POST localhost:3001/api/scanner/scan -H "Content-Type: application/json" -d '{"url":"https://example.com"}'`

### Step 2: Heading Analyzer (Core Feature)

Implement in `scannerService.ts`:
- Parse HTML with Cheerio
- Extract all heading elements in document order
- Build the heading tree (nested `HeadingNode[]`)
- Run heading rules: hierarchy skips, missing h1, multiple h1, empty headings
- Return heading tree + issues

### Step 3: Structural Analyzers

Add remaining Cheerio-based analyzers one at a time:
- `analyzeImages()` — alt text checks
- `analyzeLandmarks()` — semantic HTML checks
- `analyzeMeta()` — title, description, viewport, lang, OG tags
- `analyzeLinks()` — extract all links, check for `target="_blank"` issues

### Step 4: axe-core Integration

- Load HTML into jsdom
- Run axe-core with configured WCAG level
- Map axe results to `ScanIssue[]` format
- Merge with custom rule results (deduplicate)

### Step 5: Link Checker (Optional / Toggled)

- Extract all unique URLs from `<a href>`
- Send HEAD requests in parallel (limit concurrency to 5)
- Classify: healthy / broken / redirect / timeout
- Build `linkSummary`

### Step 6: Scoring Engine

- Calculate per-category scores: `100 - (errors * 15) - (warnings * 5) - (infos * 1)`, clamped to 0-100
- Calculate overall weighted average:
  - Accessibility: 35%
  - Structure (headings): 25%
  - Document/SEO: 20%
  - Links: 10%
  - Performance: 10%

### Step 7: Client Page

1. Create `packages/client/src/pages/URLScanner.tsx`
2. Add lazy import + route in `App.tsx`
3. Build URL input form with options
4. Build score gauge components
5. Build issue list with filtering/sorting
6. Build heading tree visualizer
7. Add export buttons (JSON, PDF via html2pdf which is already installed)

### Step 8: Integration

1. Add to `CommandPalette.tsx`
2. Add to `NavRail.tsx`
3. Add to `vercel.json` rewrites
4. Test end-to-end

---

## Future Enhancements

### Phase 2
- **Batch scanning** — scan multiple URLs at once (sitemap support)
- **Scan history** — store past scans in the database, show trends over time
- **Scheduled scans** — weekly automated scans with email alerts
- **Comparison view** — side-by-side diff of two scan results
- **PDF export** — branded accessibility audit report

### Phase 3
- **JavaScript rendering** — add Puppeteer for scanning SPAs that require JS
- **Custom rule builder** — let users define their own rules
- **CI/CD integration** — API endpoint for automated pipeline checks
- **WCAG compliance certificate** — generate a printable compliance summary
- **Competitor analysis** — scan and compare against competitor URLs
- **Lighthouse integration** — pull in performance and PWA scores via Chrome DevTools MCP

### Phase 4
- **AI-powered suggestions** — use the existing OpenAI integration to generate fix suggestions tailored to the specific codebase
- **Auto-fix generation** — for simple issues (missing alt text, lang attribute), generate the corrected HTML
- **Content readability analysis** — Flesch-Kincaid score, sentence complexity
- **Internationalization checks** — detect mixed-direction text, missing hreflang tags

---

## Open Source Projects & Code to Leverage

Research conducted March 2026. Use these as building blocks, references, and inspiration.

### Tier 1: Core Libraries (Use Directly)

| Project | Stars | License | What to Use |
|---------|-------|---------|-------------|
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | ~7K | MPL-2.0 | The accessibility rules engine. Feed it a DOM (jsdom), get WCAG violations with impact, selectors, and fix suggestions. This IS the industry standard. |
| [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse) | ~30K | Apache-2.0 | Use as npm module: `lighthouse(url, opts)` returns JSON with scores for Performance, A11y, SEO, Best Practices. Its a11y category uses axe-core under the hood. |
| [JustinBeckwith/linkinator](https://github.com/JustinBeckwith/linkinator) | ~1.2K | MIT | **TypeScript-native** broken link checker. Async iterable API, concurrency control, retry logic. Best fit for our stack. |
| [bbc/color-contrast-checker](https://github.com/bbc/color-contrast-checker) | ~105 | Apache-2.0 | BBC-backed WCAG contrast ratio validator. Pass fg/bg colors, get AA/AAA pass/fail. |

### Tier 2: Architecture & Pattern References

| Project | Stars | License | What to Learn |
|---------|-------|---------|---------------|
| [harlan-zw/unlighthouse](https://github.com/harlan-zw/unlighthouse) | ~4.5K | MIT | **Best dashboard UI reference.** Score gauges, per-route breakdowns, category tabs. Vue-based but the UX patterns transfer directly to React. Study its smart-sampling approach for large sites. |
| [pa11y/pa11y](https://github.com/pa11y/pa11y) | ~4.4K | LGPL-3.0 | Pluggable runner architecture (HTML_CodeSniffer + axe-core). Supports actions (click, wait, fill) to test pages behind logins. Programmatic API returns clean issue arrays. |
| [pa11y/pa11y-dashboard](https://github.com/pa11y/pa11y-dashboard) | ~1.1K | GPL-3.0 | Study for data model: tasks (URLs) → results (scan outputs) → trends over time. **Do not reuse code** (GPL). |
| [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) | ~6.9K | Apache-2.0 | Score thresholds/assertions pattern — "fail if accessibility drops below 90". Good for our scheduled scans feature. |
| [github/accessibility-scanner](https://github.com/github/accessibility-scanner) | ~250 | MIT | TypeScript. Auto-generates GitHub issues from violations. Pattern for turning scan results into actionable tasks. |

### Tier 3: Supplementary Tools

| Project | Stars | License | What to Use |
|---------|-------|---------|-------------|
| [dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) | ~700 | MPL-2.0 | `@axe-core/puppeteer` wraps Puppeteer + axe into one-liner: `new AxePuppeteer(page).analyze()`. Shortest path for JS-rendered pages. |
| [ttsukagoshi/axe-scan](https://github.com/ttsukagoshi/axe-scan) | ~34 | MIT | TypeScript batch scanner. Aggregates results by WCAG criterion across pages — good UX pattern for multi-URL scans. |
| [stevenvachon/broken-link-checker](https://github.com/stevenvachon/broken-link-checker) | ~2K | MIT | Event-driven API with `SiteChecker` class for recursive crawling. Alternative to linkinator if streaming results via SSE. |
| [h5o/h5o-js](https://github.com/h5o/h5o-js) | ~116 | MIT | HTML5 outline algorithm in JS. Feed it a DOM, get section/heading tree. Useful for the heading tree visualization. |
| [forsti0506/a11y-sitechecker](https://github.com/forsti0506/a11y-sitechecker) | ~61 | AGPL-3.0 | Screenshot-with-error-overlay feature is compelling. **Reference only** (AGPL). |

### Recommended Stack

```
axe-core + jsdom          → WCAG accessibility rules (server-side, no browser needed)
linkinator                → Broken link checking (TypeScript, async iterable)
cheerio                   → Fast HTML parsing for custom structural rules
bbc/color-contrast-checker → Contrast ratio validation beyond axe-core
lighthouse (optional)     → Full Performance/SEO/PWA scores (requires Chrome)
```

For Phase 1 (no browser dependency): `axe-core` + `jsdom` + `cheerio` + `linkinator`
For Phase 2+ (richer audits): Add `lighthouse` + `puppeteer` for JS-rendered pages

---

## Expanded Feature Set — Beyond the Basics

Based on research into WAVE, Siteimprove, Deque, Lighthouse, and other professional tools.

### Category 9: Security Headers

Check HTTP response headers for security best practices. Each URL gets a letter grade (A+ to F).

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `security-csp-missing` | No Content-Security-Policy header | Error | Must-have |
| `security-hsts-missing` | No Strict-Transport-Security header | Error | Must-have |
| `security-xframe-missing` | No X-Frame-Options header (clickjacking risk) | Warning | Must-have |
| `security-xcontent-missing` | No X-Content-Type-Options header | Warning | Must-have |
| `security-referrer-missing` | No Referrer-Policy header | Info | Nice-to-have |
| `security-permissions-missing` | No Permissions-Policy header | Info | Nice-to-have |
| `security-mixed-content` | HTTPS page loads HTTP resources | Error | Must-have |

**Implementation:** Single `fetch()` call — just read response headers. No parsing needed. Trivial to implement.

### Category 10: Structured Data / Schema.org

Validate JSON-LD, Microdata, and RDFa markup for rich search results.

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `schema-missing` | No structured data found on page | Info | Nice-to-have |
| `schema-json-invalid` | JSON-LD block has syntax errors | Error | Nice-to-have |
| `schema-type-unknown` | Schema type not recognized by schema.org | Warning | Nice-to-have |
| `schema-required-missing` | Required properties missing for the schema type | Warning | Nice-to-have |
| `schema-og-mismatch` | OG tags and schema data have conflicting information | Info | Advanced |

**Implementation:** Extract `<script type="application/ld+json">` blocks with Cheerio, parse as JSON, validate against schema.org types. Can use the `schema-dts` npm package for TypeScript types.

### Category 11: Readability & Content Quality

Analyze text content for reading level and cognitive accessibility.

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `readability-flesch-low` | Flesch Reading Ease below 60 (hard to read) | Warning | Nice-to-have |
| `readability-grade-high` | Flesch-Kincaid Grade Level above 8 | Warning | Nice-to-have |
| `readability-sentence-long` | Sentences averaging > 25 words | Info | Nice-to-have |
| `readability-paragraph-long` | Paragraphs exceeding 150 words | Info | Nice-to-have |
| `content-word-count` | Page has fewer than 300 words of content | Info | Nice-to-have |
| `content-keyword-stuffing` | Abnormally high keyword density (> 3%) | Warning | Advanced |

**Implementation:** Extract text content with Cheerio, calculate Flesch-Kincaid using syllable counting. The `text-readability` or `automated-readability-index` npm packages handle the formulas.

### Category 12: ARIA Validation (Deep)

Go beyond axe-core's ARIA checks with pattern-specific validation.

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `aria-role-invalid` | Role attribute has unrecognized value | Error | Must-have |
| `aria-attr-misspelled` | ARIA attribute name is misspelled (e.g., `aria-labeledby`) | Error | Must-have |
| `aria-reference-broken` | `aria-labelledby`/`aria-describedby` points to nonexistent ID | Error | Must-have |
| `aria-required-children` | Role missing required child roles | Error | Must-have |
| `aria-required-attrs` | Role missing required ARIA attributes | Error | Must-have |
| `aria-replaces-native` | ARIA role used where native HTML would suffice | Warning | Nice-to-have |
| `aria-hidden-focusable` | `aria-hidden="true"` on focusable element | Error | Must-have |
| `aria-label-visible-mismatch` | `aria-label` doesn't include visible text content | Warning | Nice-to-have |

**Implementation:** Most of these are already covered by axe-core. Supplement with custom Cheerio checks for the pattern-specific ones (misspelling detection, native HTML replacement hints).

### Category 13: Cognitive Accessibility

WCAG 2.2 includes new criteria for cognitive impairments. Professional tools like WAVE now have a dedicated cognitive panel.

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `cognitive-consistent-nav` | Navigation changes position between pages (multi-page scan) | Warning | Advanced |
| `cognitive-error-suggestion` | Form error messages don't suggest corrections | Warning | Nice-to-have |
| `cognitive-timeout-warning` | Page has timeouts without warning or extension option | Warning | Advanced |
| `cognitive-animation-control` | Animations lack pause/stop mechanism | Warning | Nice-to-have |
| `cognitive-focus-visible` | Focus indicator not visible on interactive elements | Error | Must-have |
| `cognitive-target-size` | Touch targets smaller than 24x24px (WCAG 2.2 SC 2.5.8) | Warning | Nice-to-have |

**Implementation:** Focus visibility and target size can be checked via computed styles (requires Puppeteer or jsdom with CSS). Animation detection via CSS `animation`/`transition` property scanning. Consistent navigation requires multi-page comparison.

### Category 14: Mobile Friendliness

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `mobile-viewport-missing` | No viewport meta tag | Error | Must-have |
| `mobile-viewport-scalable` | `user-scalable=no` or `maximum-scale=1` prevents pinch zoom | Error | Must-have |
| `mobile-tap-targets-small` | Interactive elements too close together (< 48px spacing) | Warning | Nice-to-have |
| `mobile-font-size-small` | Text smaller than 12px on mobile | Warning | Nice-to-have |
| `mobile-horizontal-scroll` | Content causes horizontal scrolling at 320px width | Warning | Advanced |
| `mobile-responsive-images` | Images without `srcset` or `sizes` attributes | Info | Nice-to-have |

**Implementation:** Viewport checks are simple HTML parsing. Tap target and font size checks require computed styles (Puppeteer). Horizontal scroll detection requires rendering at 320px viewport width.

### Category 15: Navigation Order & Keyboard

| Rule ID | Description | Severity | Priority |
|---------|-------------|----------|----------|
| `keyboard-skip-link` | No skip-to-content link | Warning | Must-have |
| `keyboard-tab-trap` | Keyboard focus gets trapped in an element | Error | Advanced |
| `keyboard-logical-order` | Tab order doesn't follow visual layout | Warning | Advanced |
| `keyboard-focus-style` | `:focus` styles are suppressed (`outline: none` without replacement) | Error | Must-have |
| `keyboard-interactive-role` | Non-interactive element has click handler but no keyboard equivalent | Error | Nice-to-have |

**Implementation:** Skip link detection via Cheerio (look for `a[href="#main"]` or similar). Focus style suppression detectable via CSS parsing. Tab trap detection requires Puppeteer automation.

### Implementation Priority Matrix

| Priority | Categories | Effort |
|----------|-----------|--------|
| **Phase 1 — MVP** | Headings, Images, Landmarks, Forms, Document/SEO, Security Headers | 1-2 weeks |
| **Phase 2 — Core A11y** | Full ARIA validation, Links, Keyboard/Navigation, Mobile viewport | 1 week |
| **Phase 3 — Advanced** | Readability, Structured Data, Cognitive, Color Contrast deep dive | 1 week |
| **Phase 4 — Pro** | Multi-page consistency, JS rendering (Puppeteer), Scan history, Scheduled scans | 2+ weeks |
