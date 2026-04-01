# Figma Design Audit Tool — Developer Specification

**Author:** Eric Yerke
**Date:** April 1, 2026
**Status:** Proposal
**Priority:** High — New product feature

---

## 1. Executive Summary

We are building an automated design QA tool that connects to Figma's REST API, pulls a complete file tree, runs 40+ design quality checks across 8 categories, and generates scored reports with actionable fix instructions — all within our existing app. The tool also exports dev-ready handoff documents (PDF spec sheets, XLSX token files, accessibility action item reports).

**Why this matters:**
- Agencies charge $5–15K for manual design audits. We automate it.
- Catches problems in the design phase before they reach dev or QA.
- Creates a new billable deliverable for client engagements.
- Nothing like this exists as an agency-facing tool today.

---

## 2. How It Fits Into the Existing App

This tool follows the exact same architecture as the **URL Scanner** (`/packages/server/src/routes/scanner.ts` + `/packages/server/src/services/scannerService.ts` + `/packages/client/src/pages/URLScanner.tsx`). The patterns to reuse:

| Pattern | Existing Reference | How We Reuse It |
|---|---|---|
| SSE streaming for progress | `scanner.ts` SSE stream | Same pattern — stream audit progress events to client |
| Modular analyzers | `scannerService.ts` (`analyzeHeadings`, `analyzeImages`, etc.) | Each design check category is its own analyzer function |
| ScanIssue data structure | `ScanIssue` type in scanner | Extend or create parallel `DesignIssue` type |
| Scoring system | Scanner's 0–100 category scoring | Same weighted scoring (error=30pts, warning=10pts, info=5pts) |
| Report UI | URLScanner.tsx category display | Same card-based category breakdown with expand/collapse |
| Export dialog | `ExportDialog.tsx` (PDF/DOCX/CSV) | Reuse directly for audit report exports |
| Auth + CSRF | `requireAuth` middleware + CSRF tokens | Applied to all new endpoints |
| API client pattern | `api.ts` `fetchWithCredentials` | New `figmaAuditApi` object following same pattern |
| Lazy loading | `React.lazy()` in `App.tsx` | New page is code-split like URLScanner |

---

## 3. Figma API Integration

### 3.1 Authentication

Figma supports two auth methods. We will support both:

**Personal Access Token (Phase 1):**
- User enters their Figma personal access token in app settings
- Stored encrypted in the `users` table (new column: `figmaAccessToken`)
- Sent as `X-Figma-Token` header on all Figma API requests
- Simpler to implement, good for internal team use

**OAuth2 (Phase 2 — if we open this to clients):**
- Register app at https://www.figma.com/developers/apps
- OAuth2 flow: redirect user to Figma, get authorization code, exchange for access token
- Store refresh token in DB, auto-refresh on expiry
- Better UX for external users

### 3.2 API Endpoints We Will Use

Base URL: `https://api.figma.com/v1`

| Endpoint | Method | Purpose |
|---|---|---|
| `/files/:file_key` | GET | Full file JSON tree — every node, property, style |
| `/files/:file_key/nodes?ids=x,y,z` | GET | Specific nodes only (for targeted re-checks) |
| `/images/:file_key?ids=x,y,z&format=png` | GET | Export frames as images for spec sheets |
| `/files/:file_key/styles` | GET | All published color/text/effect/grid styles |
| `/files/:file_key/components` | GET | All components and their metadata |
| `/files/:file_key/comments` | GET | Designer comments (for context in reports) |
| `/files/:file_key/versions` | GET | File version history |

### 3.3 Rate Limits

Figma rate limits: **30 requests/minute** per token. Our audit engine must:
- Batch node requests (use `ids` param to fetch multiple nodes in one call)
- Cache the full file JSON — avoid re-fetching for each analyzer
- Queue image export requests with delays if needed
- Display rate limit status in UI if throttled

### 3.4 Parsing the File Key

Users will paste a full Figma URL. We need to extract the file key:

```
https://www.figma.com/design/ABC123xyz/My-Design-File?node-id=0-1
                              ^^^^^^^^^^^
                              file_key = "ABC123xyz"
```

Regex: `/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/`

Also support direct file key input for power users.

---

## 4. Database Schema Additions

Add to `/packages/server/src/db/schema.ts`:

```typescript
// ============ FIGMA AUDIT ============

export const figmaAudits = pgTable("figma_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  
  // Figma file info
  fileKey: varchar("file_key", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 500 }),
  fileUrl: text("file_url"),
  fileThumbnailUrl: text("file_thumbnail_url"),
  fileLastModified: timestamp("file_last_modified"),
  
  // Audit results
  overallScore: integer("overall_score"), // 0-100
  categoryScores: jsonb("category_scores").$type<CategoryScore[]>(),
  issues: jsonb("issues").$type<DesignIssue[]>(),
  
  // Design token snapshots (for handoff docs)
  colorTokens: jsonb("color_tokens").$type<ColorToken[]>(),
  typographyTokens: jsonb("typography_tokens").$type<TypographyToken[]>(),
  spacingTokens: jsonb("spacing_tokens").$type<SpacingToken[]>(),
  componentInventory: jsonb("component_inventory").$type<ComponentInfo[]>(),
  
  // Metadata
  status: varchar("status", { length: 50 }).default("completed"), // pending | running | completed | failed
  auditDurationMs: integer("audit_duration_ms"),
  nodeCount: integer("node_count"),
  pageCount: integer("page_count"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Optional: link audits to clients for portfolio tracking
export const figmaAuditClientLinks = pgTable("figma_audit_client_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id").references(() => figmaAudits.id).notNull(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

Also add to `users` table:

```typescript
figmaAccessToken: text("figma_access_token"), // encrypted personal access token
```

---

## 5. Type Definitions

Create `/packages/server/src/types/figmaAudit.ts`:

```typescript
// ---- Issue Types ----

export type DesignIssueSeverity = "error" | "warning" | "info"

export type DesignIssueCategory =
  | "accessibility"
  | "spacing"
  | "typography"
  | "color"
  | "components"
  | "layout"
  | "assets"
  | "content"

export interface DesignIssue {
  id: string                        // unique issue ID
  ruleId: string                    // e.g., "a11y-contrast-aa"
  category: DesignIssueCategory
  severity: DesignIssueSeverity
  title: string                     // e.g., "Color contrast below WCAG AA"
  description: string               // human-readable explanation
  suggestion: string                // specific fix instruction
  nodeId: string                    // Figma node ID for deep linking
  nodeName: string                  // human-readable node name
  pageId: string                    // which page in the file
  pageName: string
  metadata?: Record<string, any>    // extra data (e.g., { contrastRatio: 2.8, required: 4.5 })
  wcagCriteria?: string             // e.g., "1.4.3 AA"
  figmaLink?: string                // deep link back to Figma node
}

// ---- Scoring ----

export interface CategoryScore {
  category: DesignIssueCategory
  score: number          // 0-100
  errorCount: number
  warningCount: number
  infoCount: number
  totalChecks: number
  passedChecks: number
}

// ---- Design Tokens (for handoff docs) ----

export interface ColorToken {
  name: string           // style name (e.g., "Primary/500")
  hex: string
  rgb: { r: number; g: number; b: number }
  opacity: number
  styleId?: string       // Figma style ID
  usageCount: number     // how many nodes use this color
  isFromStyle: boolean   // true = defined style, false = hard-coded
}

export interface TypographyToken {
  name: string           // style name (e.g., "Heading/H1")
  fontFamily: string
  fontWeight: number
  fontSize: number
  lineHeight: number | string  // px or "auto"
  letterSpacing: number
  textCase?: string      // "UPPER" | "LOWER" | "TITLE" | "ORIGINAL"
  styleId?: string
  usageCount: number
  isFromStyle: boolean
}

export interface SpacingToken {
  nodeId: string
  nodeName: string
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  itemSpacing: number    // gap between children in auto-layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE"
}

export interface ComponentInfo {
  id: string
  name: string
  description: string
  variantCount: number
  instanceCount: number  // how many times used in file
  detachedCount: number  // instances that were detached
  isFromLibrary: boolean
  containingPage: string
}

// ---- Audit Report ----

export interface FigmaAuditReport {
  fileKey: string
  fileName: string
  fileUrl: string
  fileThumbnailUrl: string
  fileLastModified: string
  
  overallScore: number
  categoryScores: CategoryScore[]
  issues: DesignIssue[]
  
  colorTokens: ColorToken[]
  typographyTokens: TypographyToken[]
  spacingTokens: SpacingToken[]
  componentInventory: ComponentInfo[]
  
  summary: {
    totalNodes: number
    totalPages: number
    totalErrors: number
    totalWarnings: number
    totalInfo: number
    auditDurationMs: number
  }
}

// ---- SSE Event Types ----

export interface AuditProgressEvent {
  type: "progress"
  step: string           // e.g., "Fetching file...", "Analyzing colors..."
  category?: DesignIssueCategory
  percent: number        // 0-100
}

export interface AuditCompleteEvent {
  type: "complete"
  report: FigmaAuditReport
}

export interface AuditErrorEvent {
  type: "error"
  message: string
}
```

Share these types between client and server. Consider creating a shared `packages/shared/` package or duplicating in both (as the app currently does with some types).

---

## 6. Server Implementation

### 6.1 Route: `/packages/server/src/routes/figmaAudit.ts`

```
POST /api/figma-audit/scan          — Start a new audit (SSE stream)
GET  /api/figma-audit/history       — List past audits for current user
GET  /api/figma-audit/:id           — Get a specific audit result
DELETE /api/figma-audit/:id         — Delete an audit
POST /api/figma-audit/:id/export    — Generate export document (PDF/XLSX/JSON)
POST /api/figma-audit/settings      — Save Figma access token
GET  /api/figma-audit/settings      — Get current Figma settings (token exists? y/n)
```

**SSE Scan Endpoint Pattern** (mirror `scanner.ts`):

```typescript
router.post("/scan", requireAuth, async (req: Request, res: Response) => {
  const { fileUrl, options } = req.body
  
  // Validate input
  const fileKey = extractFileKey(fileUrl)
  if (!fileKey) return res.status(400).json({ error: "Invalid Figma URL" })
  
  // Get user's Figma token
  const user = await getUserById(req.session.userId!)
  if (!user?.figmaAccessToken) {
    return res.status(400).json({ error: "Figma access token not configured" })
  }
  
  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  })
  
  const sendEvent = (data: AuditProgressEvent | AuditCompleteEvent | AuditErrorEvent) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  
  try {
    const report = await runFigmaAudit(fileKey, user.figmaAccessToken, options, sendEvent)
    
    // Save to database
    await saveFigmaAudit(req.session.userId!, report)
    
    sendEvent({ type: "complete", report })
  } catch (error) {
    sendEvent({ type: "error", message: error.message })
  } finally {
    res.end()
  }
})
```

Register in `/packages/server/src/index.ts`:

```typescript
import figmaAuditRouter from "./routes/figmaAudit.js"
app.use("/api/figma-audit", figmaAuditRouter)
```

### 6.2 Service: `/packages/server/src/services/figmaAuditService.ts`

This is the core engine. Structure it as a pipeline of modular analyzers (same pattern as `scannerService.ts`):

```typescript
export async function runFigmaAudit(
  fileKey: string,
  token: string,
  options: AuditOptions,
  onProgress: (event: AuditProgressEvent) => void
): Promise<FigmaAuditReport> {
  
  const startTime = Date.now()
  
  // Step 1: Fetch full file
  onProgress({ type: "progress", step: "Fetching Figma file...", percent: 5 })
  const file = await fetchFigmaFile(fileKey, token)
  const styles = await fetchFigmaStyles(fileKey, token)
  const components = await fetchFigmaComponents(fileKey, token)
  
  // Step 2: Build traversable node tree
  onProgress({ type: "progress", step: "Parsing design tree...", percent: 15 })
  const nodeTree = buildNodeTree(file.document)
  const allNodes = flattenNodes(nodeTree)
  
  // Step 3: Extract design tokens
  onProgress({ type: "progress", step: "Extracting design tokens...", percent: 25 })
  const colorTokens = extractColorTokens(allNodes, styles)
  const typographyTokens = extractTypographyTokens(allNodes, styles)
  const spacingTokens = extractSpacingTokens(allNodes)
  const componentInventory = buildComponentInventory(allNodes, components)
  
  // Step 4: Run analyzers (each one reports progress)
  const issues: DesignIssue[] = []
  
  onProgress({ type: "progress", step: "Checking accessibility...", category: "accessibility", percent: 35 })
  issues.push(...analyzeAccessibility(allNodes, colorTokens, typographyTokens))
  
  onProgress({ type: "progress", step: "Checking spacing consistency...", category: "spacing", percent: 45 })
  issues.push(...analyzeSpacing(allNodes, spacingTokens))
  
  onProgress({ type: "progress", step: "Checking typography...", category: "typography", percent: 55 })
  issues.push(...analyzeTypography(allNodes, typographyTokens, styles))
  
  onProgress({ type: "progress", step: "Checking color system...", category: "color", percent: 65 })
  issues.push(...analyzeColors(allNodes, colorTokens, styles))
  
  onProgress({ type: "progress", step: "Checking components...", category: "components", percent: 75 })
  issues.push(...analyzeComponents(allNodes, componentInventory))
  
  onProgress({ type: "progress", step: "Checking layout & structure...", category: "layout", percent: 82 })
  issues.push(...analyzeLayout(allNodes))
  
  onProgress({ type: "progress", step: "Checking assets...", category: "assets", percent: 88 })
  issues.push(...analyzeAssets(allNodes))
  
  onProgress({ type: "progress", step: "Checking content...", category: "content", percent: 94 })
  issues.push(...analyzeContent(allNodes))
  
  // Step 5: Calculate scores
  onProgress({ type: "progress", step: "Calculating scores...", percent: 98 })
  const categoryScores = calculateCategoryScores(issues)
  const overallScore = calculateOverallScore(categoryScores)
  
  return {
    fileKey,
    fileName: file.name,
    fileUrl: `https://www.figma.com/file/${fileKey}`,
    fileThumbnailUrl: file.thumbnailUrl,
    fileLastModified: file.lastModified,
    overallScore,
    categoryScores,
    issues,
    colorTokens,
    typographyTokens,
    spacingTokens,
    componentInventory,
    summary: {
      totalNodes: allNodes.length,
      totalPages: file.document.children.length,
      totalErrors: issues.filter(i => i.severity === "error").length,
      totalWarnings: issues.filter(i => i.severity === "warning").length,
      totalInfo: issues.filter(i => i.severity === "info").length,
      auditDurationMs: Date.now() - startTime,
    },
  }
}
```

### 6.3 Figma API Client: `/packages/server/src/services/figmaClient.ts`

```typescript
const FIGMA_BASE = "https://api.figma.com/v1"

async function figmaFetch(path: string, token: string) {
  const response = await fetch(`${FIGMA_BASE}${path}`, {
    headers: { "X-Figma-Token": token },
  })
  
  if (response.status === 403) throw new Error("Figma access denied. Check your token permissions.")
  if (response.status === 404) throw new Error("Figma file not found. Check the URL.")
  if (response.status === 429) throw new Error("Figma rate limit hit. Try again in a minute.")
  if (!response.ok) throw new Error(`Figma API error: ${response.status}`)
  
  return response.json()
}

export async function fetchFigmaFile(fileKey: string, token: string) {
  return figmaFetch(`/files/${fileKey}?geometry=paths`, token)
}

export async function fetchFigmaStyles(fileKey: string, token: string) {
  return figmaFetch(`/files/${fileKey}/styles`, token)
}

export async function fetchFigmaComponents(fileKey: string, token: string) {
  return figmaFetch(`/files/${fileKey}/components`, token)
}

export async function fetchFigmaImages(fileKey: string, nodeIds: string[], token: string, format = "png", scale = 2) {
  const ids = nodeIds.join(",")
  return figmaFetch(`/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`, token)
}
```

### 6.4 Analyzer Modules

Create each as a separate file under `/packages/server/src/services/figmaAnalyzers/`:

```
figmaAnalyzers/
  index.ts                  — re-exports all analyzers
  accessibilityAnalyzer.ts  — contrast, touch targets, font sizes, color-only meaning
  spacingAnalyzer.ts        — grid adherence, inconsistent padding, alignment
  typographyAnalyzer.ts     — font inventory, style coverage, drift, line length
  colorAnalyzer.ts          — palette compliance, near-duplicates, opacity abuse
  componentAnalyzer.ts      — detached instances, coverage, unused components
  layoutAnalyzer.ts         — auto-layout coverage, naming, nesting depth, responsive
  assetAnalyzer.ts          — image resolution, oversized images, SVG candidates
  contentAnalyzer.ts        — placeholder text, empty layers, truncation risk
  utils.ts                  — shared helpers (color math, node traversal, scoring)
```

**Example — Accessibility Analyzer:**

```typescript
// accessibilityAnalyzer.ts

import { DesignIssue } from "../../types/figmaAudit.js"
import { getContrastRatio, hexFromFigmaColor, getBackgroundColor } from "./utils.js"

export function analyzeAccessibility(allNodes: FigmaNode[], colorTokens: ColorToken[], typographyTokens: TypographyToken[]): DesignIssue[] {
  const issues: DesignIssue[] = []
  
  for (const node of allNodes) {
    // 1. Color contrast (WCAG AA)
    if (node.type === "TEXT" && node.fills?.length) {
      const textColor = hexFromFigmaColor(node.fills[0].color)
      const bgColor = getBackgroundColor(node) // walk up parent tree
      if (textColor && bgColor) {
        const ratio = getContrastRatio(textColor, bgColor)
        const fontSize = node.style?.fontSize || 16
        const required = fontSize >= 24 ? 3.0 : 4.5 // large text threshold
        
        if (ratio < required) {
          issues.push({
            id: `a11y-contrast-${node.id}`,
            ruleId: "a11y-contrast-aa",
            category: "accessibility",
            severity: "error",
            title: "Color contrast below WCAG AA",
            description: `Text "${node.characters?.substring(0, 50)}" has contrast ratio ${ratio.toFixed(1)}:1 (requires ${required}:1)`,
            suggestion: `Darken the text or lighten the background to achieve at least ${required}:1 contrast ratio`,
            nodeId: node.id,
            nodeName: node.name,
            pageId: node.pageId,
            pageName: node.pageName,
            metadata: { contrastRatio: ratio, required, textColor, bgColor, fontSize },
            wcagCriteria: "1.4.3 AA",
            figmaLink: `https://www.figma.com/file/${fileKey}?node-id=${node.id}`,
          })
        }
      }
    }
    
    // 2. Touch target size
    if (isInteractiveElement(node)) {
      const width = node.absoluteBoundingBox?.width || 0
      const height = node.absoluteBoundingBox?.height || 0
      if (width < 44 || height < 44) {
        issues.push({
          id: `a11y-target-${node.id}`,
          ruleId: "a11y-touch-target",
          category: "accessibility",
          severity: "error",
          title: "Touch target too small",
          description: `"${node.name}" is ${width}x${height}px (minimum 44x44px)`,
          suggestion: `Increase the tappable area to at least 44x44px. The visual element can be smaller if the hit area is padded.`,
          nodeId: node.id,
          nodeName: node.name,
          pageId: node.pageId,
          pageName: node.pageName,
          metadata: { width, height, required: 44 },
          wcagCriteria: "2.5.5 AAA / 2.5.8 AA",
        })
      }
    }
    
    // 3. Font size minimum
    if (node.type === "TEXT") {
      const fontSize = node.style?.fontSize || 16
      if (fontSize < 12) {
        issues.push({
          id: `a11y-fontsize-${node.id}`,
          ruleId: "a11y-font-minimum",
          category: "accessibility",
          severity: "error",
          title: "Font size below minimum",
          description: `"${node.name}" uses ${fontSize}px font (minimum 12px)`,
          suggestion: `Increase font size to at least 12px. For body text, 16px is recommended.`,
          nodeId: node.id,
          nodeName: node.name,
          pageId: node.pageId,
          pageName: node.pageName,
          metadata: { fontSize },
          wcagCriteria: "1.4.4",
        })
      }
    }
    
    // 4. Line height readability
    if (node.type === "TEXT" && node.style) {
      const fontSize = node.style.fontSize || 16
      const lineHeight = node.style.lineHeightPx || fontSize * 1.2
      const ratio = lineHeight / fontSize
      if (ratio < 1.4 && fontSize <= 20) { // body text
        issues.push({
          id: `a11y-lineheight-${node.id}`,
          ruleId: "a11y-line-height",
          category: "accessibility",
          severity: "warning",
          title: "Line height too tight for readability",
          description: `"${node.name}" has ${ratio.toFixed(2)}x line height (recommend >= 1.5x for body text)`,
          suggestion: `Set line height to at least ${Math.ceil(fontSize * 1.5)}px (1.5x the font size)`,
          nodeId: node.id,
          nodeName: node.name,
          pageId: node.pageId,
          pageName: node.pageName,
          metadata: { fontSize, lineHeight, ratio },
          wcagCriteria: "1.4.12",
        })
      }
    }
  }
  
  return issues
}
```

**Example — Spacing Analyzer:**

```typescript
// spacingAnalyzer.ts

const BASE_GRID = 8 // 8px grid system (configurable)

export function analyzeSpacing(allNodes: FigmaNode[], spacingTokens: SpacingToken[]): DesignIssue[] {
  const issues: DesignIssue[] = []
  
  for (const node of allNodes) {
    if (node.type !== "FRAME" || !node.layoutMode) continue // skip non-auto-layout
    
    // 1. Grid adherence — padding and gap should be multiples of BASE_GRID
    const values = [
      { name: "paddingTop", val: node.paddingTop },
      { name: "paddingRight", val: node.paddingRight },
      { name: "paddingBottom", val: node.paddingBottom },
      { name: "paddingLeft", val: node.paddingLeft },
      { name: "itemSpacing", val: node.itemSpacing },
    ]
    
    for (const { name, val } of values) {
      if (val != null && val > 0 && val % BASE_GRID !== 0) {
        issues.push({
          id: `spacing-grid-${node.id}-${name}`,
          ruleId: "spacing-grid-adherence",
          category: "spacing",
          severity: "warning",
          title: `${name} not on ${BASE_GRID}px grid`,
          description: `"${node.name}" has ${name}: ${val}px (nearest grid value: ${Math.round(val / BASE_GRID) * BASE_GRID}px)`,
          suggestion: `Change ${name} to ${Math.round(val / BASE_GRID) * BASE_GRID}px to align with the ${BASE_GRID}px spacing grid`,
          nodeId: node.id,
          nodeName: node.name,
          pageId: node.pageId,
          pageName: node.pageName,
          metadata: { property: name, value: val, nearestGrid: Math.round(val / BASE_GRID) * BASE_GRID, baseGrid: BASE_GRID },
        })
      }
    }
    
    // 2. Inconsistent padding — top/bottom or left/right should usually match
    if (node.paddingTop !== node.paddingBottom && Math.abs(node.paddingTop - node.paddingBottom) <= 4) {
      issues.push({
        id: `spacing-inconsistent-v-${node.id}`,
        ruleId: "spacing-inconsistent-padding",
        category: "spacing",
        severity: "warning",
        title: "Near-matching vertical padding",
        description: `"${node.name}" has paddingTop: ${node.paddingTop}px but paddingBottom: ${node.paddingBottom}px`,
        suggestion: `Likely unintentional — set both to ${Math.max(node.paddingTop, node.paddingBottom)}px`,
        nodeId: node.id,
        nodeName: node.name,
        pageId: node.pageId,
        pageName: node.pageName,
      })
    }
  }
  
  // 3. Same component type using different spacing
  // Group nodes by component name, compare padding values
  const componentGroups = groupByComponentName(allNodes)
  for (const [name, nodes] of Object.entries(componentGroups)) {
    const paddingVariants = new Set(nodes.map(n => `${n.paddingTop}-${n.paddingRight}-${n.paddingBottom}-${n.paddingLeft}`))
    if (paddingVariants.size > 1) {
      issues.push({
        id: `spacing-component-inconsistent-${name}`,
        ruleId: "spacing-component-mismatch",
        category: "spacing",
        severity: "error",
        title: `Inconsistent spacing across "${name}" instances`,
        description: `${paddingVariants.size} different padding configurations found across ${nodes.length} instances`,
        suggestion: `Standardize padding for all "${name}" instances. Consider converting to a component with fixed padding.`,
        nodeId: nodes[0].id,
        nodeName: name,
        pageId: nodes[0].pageId,
        pageName: nodes[0].pageName,
        metadata: { instanceCount: nodes.length, variantCount: paddingVariants.size },
      })
    }
  }
  
  return issues
}
```

---

## 7. Complete Audit Rules Reference

### 7.1 Accessibility (10 rules)

| Rule ID | Check | Severity | WCAG |
|---|---|---|---|
| `a11y-contrast-aa` | Text/background contrast >= 4.5:1 (3:1 large) | Error | 1.4.3 AA |
| `a11y-contrast-aaa` | Text/background contrast >= 7:1 (4.5:1 large) | Warning | 1.4.6 AAA |
| `a11y-touch-target` | Interactive elements >= 44x44px | Error | 2.5.5 |
| `a11y-font-minimum` | No text below 12px | Error | 1.4.4 |
| `a11y-font-body-minimum` | Body text >= 16px | Warning | 1.4.4 |
| `a11y-color-only` | States differ only by color (no icon/label) | Warning | 1.4.1 |
| `a11y-line-height` | Body text line-height >= 1.5x | Warning | 1.4.12 |
| `a11y-heading-hierarchy` | Text sizes follow logical H1 > H2 > H3 | Warning | 1.3.1 |
| `a11y-text-over-image` | Text on images without contrast overlay | Warning | 1.4.3 |
| `a11y-focus-order` | Layer order matches reading order | Info | 2.4.3 |

### 7.2 Spacing (7 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `spacing-grid-adherence` | Padding/gap are multiples of base grid (4/8px) | Warning |
| `spacing-inconsistent-padding` | Same element type using different padding | Error |
| `spacing-alignment` | Elements off by 1–3px (likely unintentional) | Warning |
| `spacing-uneven-gutters` | Column/row gaps that vary | Warning |
| `spacing-component-mismatch` | Same component, different padding across instances | Error |
| `spacing-orphaned-elements` | Layers floating outside any frame | Info |
| `spacing-overlap` | Unintentional node overlap | Warning |

### 7.3 Typography (7 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `type-font-inventory` | Flag fonts not in approved set | Error |
| `type-style-coverage` | % of text using defined styles | Warning |
| `type-style-drift` | Text nearly matching a style but with overrides | Warning |
| `type-weight-consistency` | Unusual weight combinations | Info |
| `type-line-length` | Text frames wider than ~75 characters | Warning |
| `type-orphan-styles` | Defined styles never used | Info |
| `type-missing-style` | Text layers with no style applied | Warning |

### 7.4 Color System (6 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `color-off-palette` | Colors not matching any defined style | Error |
| `color-style-coverage` | % of fills/strokes using a style | Warning |
| `color-near-duplicate` | Visually identical colors with different hex (deltaE < 3) | Warning |
| `color-opacity-abuse` | Using opacity to create color variants | Warning |
| `color-dark-mode` | Variables missing light/dark mode variants | Info |
| `color-inventory` | Full color listing (informational) | Info |

### 7.5 Components (5 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `comp-detached` | Components that were detached | Error |
| `comp-coverage` | % of UI built with components | Warning |
| `comp-unused` | Components defined but never instanced | Info |
| `comp-heavy-overrides` | Instances with excessive overrides | Warning |
| `comp-inconsistent-variants` | Same component, different variant props in similar context | Warning |

### 7.6 Layout & Structure (7 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `layout-autolayout-coverage` | % of frames using auto-layout | Warning |
| `layout-responsive` | Only one breakpoint (no mobile/tablet) | Warning |
| `layout-naming` | Unnamed frames ("Frame 437") | Info |
| `layout-nesting-depth` | Groups nested > 6 levels deep | Warning |
| `layout-hidden-layers` | Invisible layers (forgotten?) | Info |
| `layout-empty-frames` | Frames with no children | Info |
| `layout-page-organization` | Single page with 50+ top-level frames | Info |

### 7.7 Assets (4 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `asset-low-resolution` | Raster images blurry at 2x | Warning |
| `asset-oversized` | Images much larger than their frame | Info |
| `asset-missing-export` | Key frames without export settings | Info |
| `asset-svg-candidate` | Raster images that should be vectors | Info |

### 7.8 Content (4 rules)

| Rule ID | Check | Severity |
|---|---|---|
| `content-placeholder` | "Lorem ipsum", "TBD", "placeholder" text | Warning |
| `content-empty-text` | Text nodes with no content | Warning |
| `content-truncation-risk` | Text + clip content + long strings | Warning |
| `content-reading-level` | Flesch-Kincaid score on extracted copy | Info |

---

## 8. Scoring Algorithm

Same approach as the URL Scanner, weighted by severity:

```typescript
function calculateCategoryScores(issues: DesignIssue[]): CategoryScore[] {
  const categories: DesignIssueCategory[] = [
    "accessibility", "spacing", "typography", "color",
    "components", "layout", "assets", "content"
  ]
  
  return categories.map(category => {
    const categoryIssues = issues.filter(i => i.category === category)
    const errors = categoryIssues.filter(i => i.severity === "error").length
    const warnings = categoryIssues.filter(i => i.severity === "warning").length
    const infos = categoryIssues.filter(i => i.severity === "info").length
    
    // Deduct points: errors = 30pts, warnings = 10pts, info = 2pts
    const deductions = (errors * 30) + (warnings * 10) + (infos * 2)
    const score = Math.max(0, Math.min(100, 100 - deductions))
    
    return {
      category,
      score,
      errorCount: errors,
      warningCount: warnings,
      infoCount: infos,
      totalChecks: RULES_PER_CATEGORY[category],
      passedChecks: RULES_PER_CATEGORY[category] - errors - warnings,
    }
  })
}

function calculateOverallScore(categoryScores: CategoryScore[]): number {
  // Weighted average — accessibility counts more
  const weights: Record<DesignIssueCategory, number> = {
    accessibility: 2.0,
    spacing: 1.2,
    typography: 1.2,
    color: 1.2,
    components: 1.0,
    layout: 1.0,
    assets: 0.7,
    content: 0.7,
  }
  
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const weightedSum = categoryScores.reduce((sum, cs) => sum + cs.score * weights[cs.category], 0)
  
  return Math.round(weightedSum / totalWeight)
}
```

---

## 9. Document Export System

### 9.1 PDF Spec Sheet

Generate an HTML report (same pattern as `coe-gap-analysis-report.html` and `coe-majors-redesign-mockup.html`) and convert to PDF via `html2pdf.js` on the client or `puppeteer` on the server.

**PDF Contents:**
1. Cover page — file name, score, date, thumbnail
2. Score overview — category bars with pass/fail counts
3. Issue breakdown — grouped by category, sorted by severity
4. Each issue includes: description, suggestion, Figma deep link, WCAG reference
5. Design token appendix — all colors, fonts, spacing values
6. Component inventory table
7. Exported frame screenshots (via Figma image export API)

### 9.2 XLSX Dev Handoff

Use `exceljs` (add to server dependencies) for styled multi-sheet workbook:

```typescript
import ExcelJS from "exceljs"

async function generateDevHandoffXlsx(report: FigmaAuditReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  
  // Sheet 1: Colors
  const colorSheet = workbook.addWorksheet("Colors")
  colorSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Hex", key: "hex", width: 12 },
    { header: "R", key: "r", width: 6 },
    { header: "G", key: "g", width: 6 },
    { header: "B", key: "b", width: 6 },
    { header: "Opacity", key: "opacity", width: 10 },
    { header: "CSS Variable", key: "cssVar", width: 25 },
    { header: "Usage Count", key: "usageCount", width: 12 },
    { header: "From Style?", key: "isFromStyle", width: 12 },
  ]
  // Add color swatch as cell fill
  for (const token of report.colorTokens) {
    const row = colorSheet.addRow({
      name: token.name,
      hex: token.hex,
      r: token.rgb.r,
      g: token.rgb.g,
      b: token.rgb.b,
      opacity: token.opacity,
      cssVar: `--color-${token.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      usageCount: token.usageCount,
      isFromStyle: token.isFromStyle ? "Yes" : "No",
    })
    // Color the hex cell background
    row.getCell("hex").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${token.hex.replace("#", "")}` },
    }
  }
  
  // Sheet 2: Typography
  const typeSheet = workbook.addWorksheet("Typography")
  typeSheet.columns = [
    { header: "Style Name", key: "name", width: 25 },
    { header: "Font Family", key: "fontFamily", width: 20 },
    { header: "Weight", key: "fontWeight", width: 10 },
    { header: "Size (px)", key: "fontSize", width: 10 },
    { header: "Line Height", key: "lineHeight", width: 12 },
    { header: "Letter Spacing", key: "letterSpacing", width: 14 },
    { header: "Usage Count", key: "usageCount", width: 12 },
    { header: "From Style?", key: "isFromStyle", width: 12 },
  ]
  report.typographyTokens.forEach(t => typeSheet.addRow(t))
  
  // Sheet 3: Spacing
  const spacingSheet = workbook.addWorksheet("Spacing")
  spacingSheet.columns = [
    { header: "Element", key: "nodeName", width: 30 },
    { header: "Layout", key: "layoutMode", width: 12 },
    { header: "Pad Top", key: "paddingTop", width: 10 },
    { header: "Pad Right", key: "paddingRight", width: 10 },
    { header: "Pad Bottom", key: "paddingBottom", width: 10 },
    { header: "Pad Left", key: "paddingLeft", width: 10 },
    { header: "Gap", key: "itemSpacing", width: 8 },
  ]
  report.spacingTokens.forEach(s => spacingSheet.addRow(s))
  
  // Sheet 4: Components
  const compSheet = workbook.addWorksheet("Components")
  compSheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Variants", key: "variantCount", width: 10 },
    { header: "Instances", key: "instanceCount", width: 10 },
    { header: "Detached", key: "detachedCount", width: 10 },
    { header: "Library?", key: "isFromLibrary", width: 10 },
    { header: "Page", key: "containingPage", width: 20 },
  ]
  report.componentInventory.forEach(c => compSheet.addRow(c))
  
  // Sheet 5: Issues / Action Items
  const issueSheet = workbook.addWorksheet("Action Items")
  issueSheet.columns = [
    { header: "Priority", key: "severity", width: 10 },
    { header: "Category", key: "category", width: 14 },
    { header: "Issue", key: "title", width: 35 },
    { header: "Element", key: "nodeName", width: 25 },
    { header: "Page", key: "pageName", width: 20 },
    { header: "Fix", key: "suggestion", width: 50 },
    { header: "WCAG", key: "wcagCriteria", width: 12 },
    { header: "Figma Link", key: "figmaLink", width: 40 },
  ]
  // Sort: errors first, then warnings, then info
  const sorted = [...report.issues].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })
  sorted.forEach(issue => {
    const row = issueSheet.addRow(issue)
    // Color-code severity
    const color = issue.severity === "error" ? "FFFF0000" : issue.severity === "warning" ? "FFFFAA00" : "FF888888"
    row.getCell("severity").font = { color: { argb: color }, bold: issue.severity === "error" }
  })
  
  // Style all headers
  workbook.eachSheet(sheet => {
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } }
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + sheet.columnCount)}1` }
  })
  
  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}
```

### 9.3 JSON Export

Raw `FigmaAuditReport` object — useful for CI/CD integration or feeding into other tools.

---

## 10. Client Implementation

### 10.1 New Route

Add to `/packages/client/src/App.tsx`:

```typescript
const FigmaAudit = lazy(() => import("./pages/FigmaAudit"))

// In routes:
<Route path="/figma-audit" element={<ProtectedRoute><FigmaAudit /></ProtectedRoute>} />
```

### 10.2 Page Component: `/packages/client/src/pages/FigmaAudit.tsx`

Follow the URL Scanner pattern with these sections:

1. **Input panel** — Figma URL input + "Run Audit" button
2. **Progress panel** — SSE-driven progress bar with step labels (appears during scan)
3. **Score dashboard** — Overall score circle + 8 category bars
4. **Issue list** — Filterable by category and severity, each item expandable
5. **Token panels** — Tabs for Colors / Typography / Spacing / Components
6. **Export bar** — Buttons for PDF, XLSX, JSON downloads
7. **History sidebar** — Past audits (from database)

### 10.3 API Client

Add to `/packages/client/src/lib/api.ts`:

```typescript
export const figmaAuditApi = {
  async scan(fileUrl: string, options?: AuditOptions) {
    // Returns SSE stream — handled by page component
    return fetchWithCredentials(`${API_BASE}/figma-audit/scan`, {
      method: "POST",
      body: JSON.stringify({ fileUrl, options }),
    })
  },
  
  async getHistory() {
    const res = await fetchWithCredentials(`${API_BASE}/figma-audit/history`)
    return handleResponse<FigmaAuditSummary[]>(res)
  },
  
  async getAudit(id: string) {
    const res = await fetchWithCredentials(`${API_BASE}/figma-audit/${id}`)
    return handleResponse<FigmaAuditReport>(res)
  },
  
  async deleteAudit(id: string) {
    const res = await fetchWithCredentials(`${API_BASE}/figma-audit/${id}`, { method: "DELETE" })
    return handleResponse(res)
  },
  
  async exportAudit(id: string, format: "pdf" | "xlsx" | "json") {
    const res = await fetchWithCredentials(`${API_BASE}/figma-audit/${id}/export`, {
      method: "POST",
      body: JSON.stringify({ format }),
    })
    return res.blob()
  },
  
  async saveSettings(figmaToken: string) {
    const res = await fetchWithCredentials(`${API_BASE}/figma-audit/settings`, {
      method: "POST",
      body: JSON.stringify({ figmaToken }),
    })
    return handleResponse(res)
  },
}
```

---

## 11. New Dependencies

**Server** (`packages/server/package.json`):
```json
{
  "exceljs": "^4.4.0"       // XLSX generation with styling
}
```

No other new dependencies needed. The existing stack covers everything:
- `cheerio` — HTML parsing (already installed)
- `openai` — AI-powered suggestions if we add that later (already installed)
- Figma API is a standard REST API — use native `fetch`

**Client** (`packages/client/package.json`):
```
No new dependencies. Existing html2pdf.js, file-saver, and recharts cover all needs.
```

---

## 12. Migration

Run after adding schema:

```bash
cd packages/server
npx drizzle-kit generate
npx drizzle-kit push
```

This creates the `figma_audits` and `figma_audit_client_links` tables and adds the `figma_access_token` column to `users`.

---

## 13. Build Phases

### Phase 1 — Foundation + High-Impact Checks (Week 1–2)
- [ ] Figma API client (`figmaClient.ts`)
- [ ] File parser + node tree traversal
- [ ] Token extraction (colors, typography, spacing)
- [ ] Accessibility analyzer (contrast, font sizes, touch targets)
- [ ] Color analyzer (palette compliance, near-duplicates)
- [ ] Database schema + migrations
- [ ] API route with SSE streaming
- [ ] Basic client page (input, progress, score display)
- [ ] XLSX export (dev handoff sheets)

### Phase 2 — Full Audit Suite (Week 3)
- [ ] Spacing analyzer (grid adherence, inconsistency detection)
- [ ] Typography analyzer (style coverage, drift, line length)
- [ ] Component analyzer (detached, coverage, overrides)
- [ ] Layout analyzer (auto-layout, naming, nesting)
- [ ] Scoring algorithm with weighted categories
- [ ] Issue list UI with filtering and sorting
- [ ] PDF report generation
- [ ] Figma deep links for each issue

### Phase 3 — Polish + Advanced (Week 4)
- [ ] Asset analyzer (resolution, oversized images)
- [ ] Content analyzer (placeholder text, empty layers)
- [ ] Audit history (list past audits, compare over time)
- [ ] Client linking (tie audits to client portfolio)
- [ ] Settings page for Figma token management
- [ ] Frame screenshot exports via Figma image API
- [ ] JSON export for API consumers

### Phase 4 — Future (Backlog)
- [ ] OAuth2 flow for external client access
- [ ] Webhook integration (auto-audit when file changes)
- [ ] AI-powered suggestions ("Based on this design, consider...")
- [ ] Side-by-side audit comparison (before/after)
- [ ] Brand kit matching (compare design vs. client brand kit from client portfolio)
- [ ] CI/CD integration (run audit as GitHub Action before deploy)

---

## 14. File Tree Summary

```
packages/server/src/
  routes/
    figmaAudit.ts                    — API endpoints (scan, history, export, settings)
  services/
    figmaClient.ts                   — Figma REST API wrapper
    figmaAuditService.ts             — Main audit orchestrator
    figmaAnalyzers/
      index.ts                       — Re-exports
      accessibilityAnalyzer.ts       — Contrast, targets, fonts, color-only
      spacingAnalyzer.ts             — Grid, consistency, alignment, overlap
      typographyAnalyzer.ts          — Fonts, styles, drift, line length
      colorAnalyzer.ts               — Palette, duplicates, opacity
      componentAnalyzer.ts           — Detached, coverage, overrides
      layoutAnalyzer.ts              — Auto-layout, naming, nesting, responsive
      assetAnalyzer.ts               — Resolution, sizing, SVG candidates
      contentAnalyzer.ts             — Placeholder, empty, truncation
      utils.ts                       — Color math, node traversal, helpers
    figmaExportService.ts            — PDF + XLSX generation
  types/
    figmaAudit.ts                    — All TypeScript types
  db/
    schema.ts                        — Add figmaAudits table + user token column

packages/client/src/
  pages/
    FigmaAudit.tsx                   — Main audit page
  components/figma-audit/
    AuditScoreCard.tsx               — Overall + category score display
    AuditIssueList.tsx               — Filterable issue list
    AuditTokenPanel.tsx              — Color/type/spacing token tables
    AuditProgress.tsx                — SSE progress indicator
    AuditHistory.tsx                 — Past audits sidebar
    FigmaSettings.tsx                — Token configuration modal
  lib/
    api.ts                           — Add figmaAuditApi object
```

---

## 15. Environment Variables

Add to `.env`:

```
# No new server env vars required.
# Figma tokens are stored per-user in the database.
# If we add OAuth2 later:
# FIGMA_CLIENT_ID=your-figma-app-client-id
# FIGMA_CLIENT_SECRET=your-figma-app-client-secret
```

---

## 16. Security Considerations

1. **Figma tokens** — Encrypt at rest in the database (use `crypto.createCipheriv` with a key from `SESSION_SECRET`). Never return the raw token to the client — only a boolean "token configured: yes/no."
2. **File access** — The Figma API respects the token owner's permissions. If the user can't access a file in Figma, the API will return 403. No additional access control needed on our side.
3. **Rate limiting** — Apply existing rate limiter to scan endpoint. Also respect Figma's 30 req/min limit with internal queuing.
4. **Input validation** — Validate Figma URL format before making API calls. Reject non-Figma URLs.
5. **Data size** — Large Figma files can return 50MB+ JSON. Stream parsing may be needed for very large files. Set a node count limit (e.g., 10,000 nodes) with a warning.

---

## 17. Testing Plan

1. **Unit tests** — Each analyzer function tested with mock Figma node data
2. **Integration tests** — Full audit pipeline with a known test Figma file
3. **Edge cases** — Empty files, files with no styles, files with 10K+ nodes, files with only images
4. **Export tests** — Verify PDF renders correctly, XLSX opens in Excel with proper formatting
5. **Auth tests** — Invalid token, expired token, no-access file, rate limited

Create a test Figma file with known issues for regression testing.
