# Document Studio — Complete Implementation Specification

> **Hidden feature** — route `/studio`, not on dashboard, not in settings, not pushed to GitHub/Vercel.
> **Status**: Specification complete. Audited against live codebase. Ready to build.
> **Last updated**: February 6, 2026
> **Audit**: 9 corrections applied — import paths, function exports, auth middleware, component names, file counts verified against codebase

---

## Table of Contents
1. [Overview](#1-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [Database Schema](#3-database-schema)
4. [Server: AI Services](#4-server-ai-services)
5. [Server: API Routes](#5-server-api-routes)
6. [Client: Types & Theme](#6-client-types--theme)
7. [Client: Hooks](#7-client-hooks)
8. [Client: Components](#8-client-components)
9. [Client: Main Page](#9-client-main-page)
10. [Drag & Drop System](#10-drag--drop-system)
11. [Export System (PDF + Word)](#11-export-system-pdf--word)
12. [AI Prompt Engineering](#12-ai-prompt-engineering)
13. [SVG Generation](#13-svg-generation)
14. [Formatting System](#14-formatting-system)
15. [Page Rendering (8.5x11)](#15-page-rendering-85x11)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Dependencies](#17-dependencies)
18. [File Manifest](#18-file-manifest)
19. [Existing Patterns to Reuse](#19-existing-patterns-to-reuse)
20. [Verification Checklist](#20-verification-checklist)
21. [Future Upgrades](#21-future-upgrades)

---

## 1. Overview

### What This Is
A split-pane document creation workspace with an AI chat sidebar that generates content, diagrams, and charts — all deployable into a live-previewed 8.5x11 document with formatting controls and PDF/Word export.

### Three Modes
| Mode | Left Pane (Chat) | Right Pane (Document) |
|------|------------------|----------------------|
| **Brief Me** | Follow-up questions about briefing | Streaming AI briefing with charts (read-only) |
| **Editor** | AI writing assistant + content generation | Markdown editor with live 8.5x11 page preview |
| **Review** | AI critique + suggestions | Uploaded/pasted content (read-only) |

### Core Capabilities
- One-click streaming executive briefing with inline charts
- AI-powered document writing with full Stamats data context
- AI document review/critique of existing copy
- AI-generated SVG diagrams, infographics, timelines
- Drag-and-drop content from AI chat → document
- Live 8.5x11 page preview with page navigation
- Full formatting: fonts, sizes, spacing, margins, columns, colors
- Photo library integration (138 existing assets)
- Per-user asset bucket (save SVGs, snippets, images)
- Undo/redo, find & replace, auto-save
- Export as PDF and Word
- Conversation + document persistence
- Template system

### Layout
```
┌──────────────────────────────────────────────────────────────────┐
│  AppHeader                                                        │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ StudioToolbar ─────────────────────────────────────────────┐ │
│  │ [●Brief Me] [Editor] [Review]   "Q1 Strategy"   [⬇PDF][⬇Word] │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ FormatToolbar ─────────────────────────────────────────────┐ │
│  │ [B][I][U] [H1▾] [•][1.] [≡L][≡C][≡R] [Sans▾][15px▾]       │ │
│  │ [Margins▾] [Columns▾] [Spacing▾] [Color▾] [Insert▾]       │ │
│  └─────────────────────────────────────────────────────────────┘ │
├──────────────────────┬───────────────────────────────────────────┤
│                      │                                           │
│  AI Chat (40%)       │   Document (60%)                         │
│                      │   ┌─────────────────────────────────┐    │
│  ┌────────────────┐  │   │  ┌───────────────────────────┐  │    │
│  │ Chat History   │  │   │  │                           │  │    │
│  ├────────────────┤  │   │  │    8.5" x 11" Page 1      │  │    │
│  │                │  │   │  │    (white card, shadow)    │  │    │
│  │ AI Messages    │  │   │  │                           │  │    │
│  │  • Content     │  │   │  │    Rendered content        │  │    │
│  │  • Charts      │  │   │  │    with charts + SVGs     │  │    │
│  │  • SVGs        │  │   │  │    + photos               │  │    │
│  │  • [→ Deploy]  │  │   │  │                    [p.1]  │  │    │
│  │  • ⠿ drag      │  │   │  └───────────────────────────┘  │    │
│  │                │  │   │                                  │    │
│  │                │  │   │  ┌───────────────────────────┐  │    │
│  │                │  │   │  │    Page 2              [p.2]│ │    │
│  ├────────────────┤  │   │  └───────────────────────────┘  │    │
│  │ 💬 Input       │  │   └─────────────────────────────────┘    │
│  └────────────────┘  │   ┌─ Page Nav ───────────────────────┐   │
│                      │   │ [▪][▪][▪]  Page 1 of 3           │   │
│                      │   └──────────────────────────────────┘   │
├──────────────────────┴───────────────────────────────────────────┤
```

---

## 2. Architecture & Data Flow

### Briefing Flow
```
User clicks "Brief Me"
  → Client calls POST /api/studio/briefing/stream
  → Server briefingAIService.streamBriefing():
      → Loads ALL data in parallel:
         • getAllProposals() from proposalSyncService
         • getPipelineStats() from pipelineSyncService
         • clientSuccessData (hardcoded 40 case studies, 37 results, etc.)
         • Answer count from DB
      → Calculates analytics (win rates, trends, momentum, pending scores)
      → Builds massive context string
      → Calls streamCompletion() with BRIEFING_SYSTEM_PROMPT
      → SSE: metadata → tokens → done (with CHART_DATA + cleanResponse)
  → Client BriefingView renders streaming markdown + InlineCharts
  → User clicks "Deploy to Editor" → content copied to document editor
```

### Document Chat Flow
```
User types in chat sidebar
  → useChat.handleSubmit()
  → fetchSSE() to POST /api/studio/chat/stream
  → Server documentAIService.streamDocumentChat():
      → Loads Stamats data context
      → If reviewMode: adds user's document content as context
      → If SVG request detected: includes SVG generation instructions
      → Calls streamCompletion()
      → SSE: metadata → tokens → done (with CHART_DATA, SVG_DATA, followUpPrompts)
  → Client renders response in chat sidebar
  → User clicks "Deploy →" or drags content → inserted into document
```

### Export Flow
```
User clicks Export PDF/Word
  → ExportDialog opens with filename input
  → PDF: html2pdf.js captures rendered preview DOM → downloads .pdf
  → Word: docx library builds Document from parsed markdown → downloads .docx
```

### Data Sources Available to All Studio AI Services
| Source | Location | What It Contains |
|--------|----------|-----------------|
| Proposals | `proposalSyncService.getAllProposals()` | ~300+ proposals: client, services, won/lost, dates, CEs, school types |
| Pipeline | `pipelineSyncService.getPipelineStats()` | RFP intake, pursuit rate, pass reasons, by-year/CE |
| Client Success | `data/clientSuccessData.ts` | 40 case studies, 37 results, 20 testimonials, 17 awards |
| Q&A Library | DB `answerItems` table | 1000+ approved answers across topics |
| Photo Assets | DB `photoAssets` table | 138 photos linked to answers |
| Analytics | `proposalAIService` functions | Win rates, trends, momentum, pending scores, recommendations |

---

## 3. Database Schema

### Conversations Table — Expanded Page Enum
**File**: `packages/server/src/db/schema.ts`

Current enum: `"ask-ai" | "case-studies" | "proposal-insights" | "unified-ai"`

New enum (expansive, future-proof):
```typescript
page: text("page", {
  enum: [
    "ask-ai",
    "case-studies",
    "proposal-insights",
    "unified-ai",
    "studio",           // studio document chat
    "studio-briefing",  // briefing follow-up chat
    "studio-review",    // review mode chat
    "general"           // catch-all for future pages
  ]
}).notNull()
```

### New Table: `studio_documents`
```sql
CREATE TABLE studio_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  format_settings JSONB NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'draft',  -- draft | final | template | archived
  tags JSONB NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'manual',  -- briefing | manual | review | ai-generated
  conversation_id UUID REFERENCES conversations(id),
  user_id TEXT NOT NULL,
  shared_with JSONB NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  parent_id UUID REFERENCES studio_documents(id),
  export_history JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### New Table: `studio_templates`
```sql
CREATE TABLE studio_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  format_settings JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'custom',  -- proposal | case-study | report | presentation | custom
  is_system BOOLEAN NOT NULL DEFAULT false,
  user_id TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### New Table: `studio_assets` (Per-User Asset Bucket)
```sql
CREATE TABLE studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- image | svg | chart-snapshot | document-snippet | logo | icon
  data TEXT NOT NULL,  -- base64 (images), raw SVG code, markdown (snippets)
  thumbnail TEXT,      -- small base64 preview
  mime_type TEXT,
  file_size INTEGER,
  tags JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Drizzle Schema Additions
```typescript
// In packages/server/src/db/schema.ts

export const studioDocuments = pgTable("studio_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  formatSettings: jsonb("format_settings").$type<Record<string, unknown>>().notNull().default({}),
  mode: text("mode", { enum: ["draft", "final", "template", "archived"] }).notNull().default("draft"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  sourceType: text("source_type", { enum: ["briefing", "manual", "review", "ai-generated"] }).notNull().default("manual"),
  conversationId: uuid("conversation_id"),
  userId: text("user_id").notNull(),
  sharedWith: jsonb("shared_with").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  parentId: uuid("parent_id"),
  exportHistory: jsonb("export_history").$type<Array<{ format: string; timestamp: string; filename: string }>>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const studioTemplates = pgTable("studio_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  formatSettings: jsonb("format_settings").$type<Record<string, unknown>>().notNull().default({}),
  category: text("category", { enum: ["proposal", "case-study", "report", "presentation", "custom"] }).notNull().default("custom"),
  isSystem: boolean("is_system").notNull().default(false),
  userId: text("user_id"),
  usageCount: integer("usage_count").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const studioAssets = pgTable("studio_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["image", "svg", "chart-snapshot", "document-snippet", "logo", "icon"] }).notNull(),
  data: text("data").notNull(),
  thumbnail: text("thumbnail"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

---

## 4. Server: AI Services

### 4a. `packages/server/src/services/briefingAIService.ts`

**Pattern**: Follow `packages/server/src/services/unifiedAIService.ts` exactly.

**Exports**:
```typescript
export async function streamBriefing(res: Response): Promise<void>
```

**Implementation**:
1. Define a local `getOpenAI()` function (same ~10-line lazy-init pattern used in every AI service — NOT imported, each service has its own copy)
2. Import `getAllProposals()` from `proposalSyncService.ts`
3. Import `getPipelineStats()` from `pipelineSyncService.ts`
4. Import `clientSuccessData` from `../data/clientSuccessData.ts`
5. Import `streamCompletion`, `CHART_PROMPT`, `parseChartData` from `./utils/streamHelper.ts`
6. Import analytics functions from `proposalAIService.ts`: `calculateWinRates`, `scorePendingProposals`, `generateRecommendations` (**NOTE: these 3 functions are currently private — add `export` keyword to each in proposalAIService.ts**)
7. Load ALL data in parallel via `Promise.all()`
8. Build context string (see Section 12 for full prompt)
9. Call `streamCompletion({ openai, messages, temperature, maxTokens, metadata, parseFollowUpPrompts, res })` — must pass the local `openai` instance as a parameter

**Key difference from other services**: No user query. The function auto-generates a pre-structured briefing. The user message is internally constructed: `"Generate today's executive briefing for ${new Date().toLocaleDateString()}."`

### 4b. `packages/server/src/services/documentAIService.ts`

**Pattern**: Follow `packages/server/src/services/caseStudyAIService.ts` for streaming.

**Exports**:
```typescript
export async function streamDocumentChat(
  query: string,
  res: Response,
  options?: {
    documentContent?: string    // current document for context
    reviewMode?: boolean        // true = reviewing uploaded content
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  }
): Promise<void>

export async function queryDocumentChat(
  query: string,
  options?: {
    documentContent?: string
    reviewMode?: boolean
  }
): Promise<DocumentChatResponse>
```

**Implementation**:
1. Define a local `getOpenAI()` function (same lazy-init pattern as other services — NOT imported)
2. Load Stamats data context (proposals summary, client success highlights, library topic list)
3. Build system prompt based on mode (generation vs review vs SVG — see Section 12)
4. If `documentContent` provided, include as context: "The user's current document:\n---\n{content}\n---"
5. If `reviewMode`, use REVIEW_SYSTEM_PROMPT
6. Detect SVG requests in query (keywords: "diagram", "draw", "infographic", "timeline", "flowchart", "org chart", "illustration")
7. If SVG detected, append SVG_PROMPT to system message
8. Call `streamCompletion({ openai, messages, temperature, maxTokens, metadata, parseFollowUpPrompts, res })` — pass local openai instance

**SVG_DATA parsing** (add to `streamHelper.ts`):
```typescript
export function parseSVGData(response: string): { cleanText: string; svgData: { svg: string; title: string } | null } {
  const svgMatch = response.match(/SVG_DATA:\s*(<svg[\s\S]*?<\/svg>)\s*$/m)
  if (svgMatch?.[1]) {
    const titleMatch = svgMatch[1].match(/<!--\s*title:\s*(.*?)\s*-->/)
    const cleanText = response.replace(/SVG_DATA:\s*<svg[\s\S]*?<\/svg>\s*$/m, "").trim()
    return { cleanText, svgData: { svg: svgMatch[1], title: titleMatch?.[1] || "Diagram" } }
  }
  return { cleanText: response, svgData: null }
}
```

**IMPORTANT — streamCompletion chain modification**: Currently `streamCompletion()` in `streamHelper.ts` chains parsing at lines 70-80:
```
parseFollowUpPrompts(fullResponse) → parseChartData(cleanResponse) → done event
```
Must add `parseSVGData` to this chain:
```
parseFollowUpPrompts(fullResponse) → parseChartData(cleanResponse) → parseSVGData(finalResponse) → done event (include svgData)
```
The `done` event payload must be updated to include `svgData` alongside `cleanResponse`, `followUpPrompts`, and `chartData`. The client's `FetchSSECallbacks.onDone` type in `api.ts` must also be extended to include `svgData`.

---

## 5. Server: API Routes

### `packages/server/src/routes/studio.ts`

```typescript
import { Router } from "express"
import { streamBriefing } from "../services/briefingAIService.js"
import { streamDocumentChat, queryDocumentChat } from "../services/documentAIService.js"
import { getCurrentUserId } from "../middleware/getCurrentUser.js"
import { db } from "../db/index.js"
import { studioDocuments, studioTemplates, studioAssets } from "../db/schema.js"
import { eq, and, desc, ilike } from "drizzle-orm"

const router = Router()

// ─── AI Endpoints ───

// POST /api/studio/briefing/stream
router.post("/briefing/stream", async (req, res) => {
  await streamBriefing(res)
})

// POST /api/studio/chat/stream
router.post("/chat/stream", async (req, res) => {
  const { query, documentContent, reviewMode, conversationHistory } = req.body
  // validation: query required, 2-5000 chars
  await streamDocumentChat(query.trim(), res, { documentContent, reviewMode, conversationHistory })
})

// POST /api/studio/chat/query (non-streaming fallback)
router.post("/chat/query", async (req, res) => {
  const { query, documentContent, reviewMode } = req.body
  const result = await queryDocumentChat(query.trim(), { documentContent, reviewMode })
  res.json(result)
})

// ─── Document CRUD ───

// GET /api/studio/documents
router.get("/documents", async (req, res) => {
  const userId = getCurrentUserId(req)
  // filter by ?mode=draft&search=keyword&sourceType=briefing
  const rows = await db.select().from(studioDocuments)
    .where(and(eq(studioDocuments.userId, userId), /* filters */))
    .orderBy(desc(studioDocuments.updatedAt))
    .limit(50)
  res.json(rows)
})

// GET /api/studio/documents/:id
// POST /api/studio/documents
// PATCH /api/studio/documents/:id
// DELETE /api/studio/documents/:id (set mode to 'archived')

// ─── Template CRUD ───

// GET /api/studio/templates
// POST /api/studio/templates
// DELETE /api/studio/templates/:id

// ─── Asset Bucket ───

// GET /api/studio/assets
// GET /api/studio/assets/:id
// POST /api/studio/assets
// PATCH /api/studio/assets/:id
// DELETE /api/studio/assets/:id

export default router
```

### Register in `packages/server/src/routes/index.ts`
```typescript
import studioRouter from "./studio.js"
router.use("/studio", studioRouter)
// NOTE: requireAuth is already applied globally in index.ts (app.use("/api", requireAuth))
// No per-route auth needed — matches pattern of all other routes in this file
```

---

## 6. Client: Types & Theme

### `packages/client/src/types/studio.ts`

```typescript
import type { ChartConfig } from "./chat"

// ─── Core Modes ───
export type StudioMode = "briefing" | "editor" | "review"
export type DocumentStatus = "draft" | "final" | "template" | "archived"
export type DocumentSource = "briefing" | "manual" | "review" | "ai-generated"
export type TemplateCategory = "proposal" | "case-study" | "report" | "presentation" | "custom"
export type AssetType = "image" | "svg" | "chart-snapshot" | "document-snippet" | "logo" | "icon"
export type SaveStatus = "saving" | "saved" | "unsaved" | "error"
export type ColumnLayout = "single" | "two-column" | "sidebar"

// ─── Format Settings ───
export interface FormatSettings {
  fontFamily: "sans" | "serif" | "mono"
  fontSize: "small" | "normal" | "large" | "xl"
  layout: "standard" | "wide" | "compact" | "presentation"
  lineHeight: "tight" | "normal" | "relaxed"
  paragraphSpacing: "compact" | "normal" | "generous"
  sectionSpacing: "tight" | "normal" | "breathable"
  pageMargins: "narrow" | "normal" | "wide"
  columnLayout: ColumnLayout
  textAlign: "left" | "center" | "right"
  headerStyle: "minimal" | "branded" | "none"
  showPageNumbers: boolean
  colorAccent: string  // hex color for headings/accents
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  fontFamily: "sans",
  fontSize: "normal",
  layout: "standard",
  lineHeight: "normal",
  paragraphSpacing: "normal",
  sectionSpacing: "normal",
  pageMargins: "normal",
  columnLayout: "single",
  textAlign: "left",
  headerStyle: "minimal",
  showPageNumbers: true,
  colorAccent: "#10B981", // emerald
}

// ─── Documents ───
export interface StudioDocument {
  id: string
  title: string
  content: string
  formatSettings: FormatSettings
  mode: DocumentStatus
  sourceType: DocumentSource
  conversationId: string | null
  userId: string
  tags: string[]
  version: number
  parentId: string | null
  sharedWith: string[]
  exportHistory: ExportRecord[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ExportRecord {
  format: "pdf" | "docx" | "svg" | "markdown" | "html"
  timestamp: string
  filename: string
}

// ─── Templates ───
export interface StudioTemplate {
  id: string
  name: string
  description: string | null
  content: string
  formatSettings: FormatSettings
  category: TemplateCategory
  isSystem: boolean
  userId: string | null
  usageCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── Assets ───
export interface StudioAsset {
  id: string
  userId: string
  name: string
  type: AssetType
  data: string
  thumbnail: string | null
  mimeType: string | null
  fileSize: number | null
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── SVG from AI ───
export interface SVGData {
  svg: string
  title: string
  description?: string
}

// ─── Content Blocks ───
export interface DocumentBlock {
  id: string
  content: string
  source: "user" | "ai-generated" | "briefing" | "template"
  timestamp: Date
  chartData?: ChartConfig
  svgData?: SVGData
}

// ─── Briefing Sections ───
export interface BriefingSection {
  id: string
  title: string
  content: string
  chartData?: ChartConfig
  svgData?: SVGData
}
```

### Emerald Theme — Add to `packages/client/src/types/chat.ts`

```typescript
emerald: {
  name: "Document Studio",
  primary: "emerald",
  botGradient: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
  botShadow: "0 4px 12px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
  userBubbleBg: "bg-gradient-to-br from-emerald-50 to-teal-100/80",
  userBubbleBorder: "border-emerald-200/60",
  userBubbleShadow: "shadow-[0_1px_3px_rgba(16,185,129,0.1)]",
  accentBg: "bg-emerald-50",
  accentBgHover: "hover:bg-emerald-100",
  accentText: "text-emerald-700",
  accentBorder: "border-emerald-200",
  accentBgDark: "dark:bg-emerald-900/30",
  accentBgHoverDark: "dark:hover:bg-emerald-900/50",
  accentTextDark: "dark:text-emerald-300",
  accentBorderDark: "dark:border-emerald-700",
  sendButtonGradient: "bg-gradient-to-r from-emerald-500 to-teal-500",
  sendButtonHoverGradient: "hover:from-emerald-600 hover:to-teal-600",
  sendButtonShadow: "shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
  dotColor: "bg-emerald-400",
}
```

### Emerald Chart Colors — Add to `packages/client/src/components/chat/InlineChart.tsx`
```typescript
emerald: ["#10B981", "#06B6D4", "#F59E0B", "#6366F1", "#8B5CF6"],
```

---

## 7. Client: Hooks

### `packages/client/src/hooks/useDocumentStore.ts`

```typescript
interface UseDocumentStoreReturn {
  // State
  document: StudioDocument | null
  content: string
  title: string
  formatSettings: FormatSettings
  mode: StudioMode
  isDirty: boolean
  saveStatus: SaveStatus

  // Content operations
  setContent: (content: string) => void
  insertContent: (text: string, position?: number) => void
  replaceContent: (text: string) => void
  setTitle: (title: string) => void

  // Mode
  setMode: (mode: StudioMode) => void

  // Formatting
  updateFormat: (partial: Partial<FormatSettings>) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Find & Replace
  findResults: { count: number; current: number }
  findInDocument: (query: string) => void
  findNext: () => void
  findPrevious: () => void
  replaceOne: (replacement: string) => void
  replaceAll: (query: string, replacement: string) => void
  clearFind: () => void

  // Persistence
  save: () => Promise<void>
  load: (id: string) => Promise<void>
  createNew: () => void
  listDocuments: () => Promise<StudioDocument[]>

  // Export
  recordExport: (format: string, filename: string) => void
}
```

**Undo/Redo**: Array of up to 50 content snapshots. Each `setContent`/`insertContent`/`replaceContent` pushes a snapshot. `undo()` pops back, `redo()` moves forward.

**Auto-save**:
- localStorage: debounced 1s, key: `stamats-studio-draft`
- Server: debounced 3s, only when document.id exists
- On mount: check localStorage for crash recovery

---

## 8. Client: Components

All in `packages/client/src/components/studio/`

### StudioToolbar.tsx
- Mode tabs: segmented control `[Brief Me] [Editor] [Review]` with emerald active underline
- Document title: inline-editable `<input>` that blurs on Enter
- Save status: "Saving..." (spinner) | "All changes saved" (check) | "Unsaved" (dot)
- Export buttons: `[⬇ PDF] [⬇ Word]` — outlined, small
- Right-aligned: `[Assets] [Templates]` panel toggle buttons

### FormatToolbar.tsx
See Section 14 for full formatting system details.

### DocumentEditor.tsx
- Contains: FormatToolbar (top), editor area (middle), page navigator (bottom)
- Editor area: rendered 8.5x11 pages (see Section 15)
- Toggle between edit mode (contentEditable) and source mode (markdown textarea)
- Drop zone wrapping (see Section 10)

### BriefingView.tsx
- Empty state: centered `<button>` "Generate Today's Briefing" with emerald gradient, Sparkles icon
- While streaming: full-width MarkdownRenderer with InlineChart components rendering as CHART_DATA arrives
- Streaming uses a special variant of useChat that auto-submits on mount
- After complete: "Deploy to Editor →" button at bottom
- Abort button during streaming

### StudioChatSidebar.tsx
- Uses `useChat` hook with:
  ```typescript
  useChat({
    endpoint: "/studio/chat/query",
    streamEndpoint: "/studio/chat/stream",
    page: "studio",
    parseResult: /* standard parser */,
    buildBody: (query) => ({
      query,
      documentContent: documentStore.content, // passes current doc as context
      reviewMode: documentStore.mode === "review",
    }),
  })
  ```
- Each assistant message renders with:
  - Standard chat message (MarkdownRenderer)
  - InlineChart if chartData present
  - Inline SVG render if svgData present
  - "Deploy →" button (click to append to document)
  - Drag handle (grip icon, uses @dnd-kit)
  - "Save to Assets" button (saves SVG/content to asset bucket)
- ChatHistorySidebar for conversation history
- Review mode: "Paste content for review" action button

### PhotoPicker.tsx
- Grid of photo thumbnails from existing library (`/api/photos`)
- Search bar + topic filter dropdown
- Click to insert at cursor position in document
- Drag to insert at specific position
- Photos inserted as markdown: `![Photo title](/api/photos/file/{storageKey})`

### AssetPanel.tsx
- Grid view of user's saved assets
- Filter by type (SVG, image, snippet, etc.)
- Search by name/tags
- Click to insert into document
- Drag to insert at position
- "Save" button on AI-generated SVGs and content blocks

### ExportDialog.tsx
- Modal dialog (uses existing Dialog component)
- Filename input (auto-generated from document title)
- Format selection: PDF | Word
- PDF: calls `html2pdf.js` on rendered preview (see Section 11)
- Word: calls `docx` builder (see Section 11)
- Download triggers immediately
- Records export in document's exportHistory

### FindReplace.tsx
- Floating bar that appears below FormatToolbar on Cmd+F
- Search input + Replace input
- Match count: "3 of 12 matches"
- Buttons: Previous, Next, Replace, Replace All, Close
- Highlights matches in the document preview with yellow background

### index.ts
Barrel export of all studio components.

---

## 9. Client: Main Page

### `packages/client/src/pages/DocumentStudio.tsx`

```typescript
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { StudioToolbar, FormatToolbar, DocumentEditor, BriefingView, StudioChatSidebar } from "@/components/studio"
import { useDocumentStore } from "@/hooks/useDocumentStore"
import { CHAT_THEMES } from "@/types/chat"
import { AppHeader } from "@/components/AppHeader"

const theme = CHAT_THEMES.emerald

export function DocumentStudio() {
  const doc = useDocumentStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [splitPercent, setSplitPercent] = useState(40) // 40% chat, 60% document

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      <AppHeader />
      <StudioToolbar mode={doc.mode} onModeChange={doc.setMode} ... />
      {doc.mode === "editor" && <FormatToolbar settings={doc.formatSettings} onChange={doc.updateFormat} />}

      <DndContext onDragStart={...} onDragEnd={...}>
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: AI Chat (40%) */}
          <div style={{ width: `${splitPercent}%` }}>
            <StudioChatSidebar theme={theme} documentStore={doc} />
          </div>

          {/* Resizable divider */}
          <div className="w-1 bg-slate-200 dark:bg-slate-700 cursor-col-resize hover:bg-emerald-400" />

          {/* RIGHT: Document (60%) */}
          <div style={{ width: `${100 - splitPercent}%` }}>
            {doc.mode === "briefing" ? (
              <BriefingView onDeploy={(content) => { doc.replaceContent(content); doc.setMode("editor") }} />
            ) : (
              <DocumentEditor
                content={doc.content}
                onChange={doc.setContent}
                formatSettings={doc.formatSettings}
                mode={doc.mode}
              />
            )}
          </div>
        </div>

        <DragOverlay>{activeId ? <ContentBlockPreview /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}
```

### Route Registration — `packages/client/src/App.tsx`
```typescript
<Route path="/studio" element={<ProtectedRoute><DocumentStudio /></ProtectedRoute>} />
```

### Page Export — `packages/client/src/pages/index.ts`
```typescript
export { DocumentStudio } from "./DocumentStudio"
```

**NO changes to**: AppHeader breadcrumbs, SettingsPanel tiles, or dashboard.

---

## 10. Drag & Drop System

### Dependencies
```
@dnd-kit/core
@dnd-kit/sortable
```

### Drag Sources (Chat Sidebar)
Each AI message gets a drag handle:
```typescript
import { useDraggable } from "@dnd-kit/core"

function DraggableMessage({ message }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: message.id,
    data: { content: message.content, chartData: message.chartData, svgData: message.svgData },
  })
  // Render with grip handle + message content
}
```

### Drop Target (Document Editor)
```typescript
import { useDroppable } from "@dnd-kit/core"

function DocumentDropZone({ onDrop, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: "document-editor" })
  // Show insertion indicator when dragging over
}
```

### Drop Handler
```typescript
function handleDragEnd(event) {
  const content = event.active.data.current?.content
  if (content && event.over?.id === "document-editor") {
    doc.insertContent("\n\n" + content)
  }
}
```

### Click-to-Deploy (Primary Method)
Every AI message also has a "Deploy →" button:
```typescript
<button onClick={() => doc.insertContent("\n\n" + message.content)}>
  <ArrowRight size={14} /> Deploy
</button>
```

---

## 11. Export System (PDF + Word)

### PDF Export — `html2pdf.js`

```typescript
import html2pdf from "html2pdf.js"

async function exportAsPDF(title: string) {
  const preview = document.getElementById("document-preview")
  if (!preview) return

  // Force light mode for export
  preview.classList.remove("dark")
  preview.classList.add("export-mode")

  const options = {
    margin: 0, // margins are already in the page rendering
    filename: `${slugify(title)}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  }

  await html2pdf().set(options).from(preview).save()

  // Restore dark mode if needed
  preview.classList.remove("export-mode")
}
```

### Word Export — `docx` Package

```typescript
import { Document, Paragraph, HeadingLevel, TextRun, ImageRun, Table, TableRow, TableCell, Packer, AlignmentType } from "docx"

async function exportAsWord(title: string, content: string, formatSettings: FormatSettings) {
  const blocks = parseMarkdownToBlocks(content)
  const children = []

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        children.push(new Paragraph({
          text: block.text,
          heading: block.level === 1 ? HeadingLevel.HEADING_1 :
                   block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { after: 200 },
        }))
        break
      case "paragraph":
        children.push(new Paragraph({
          children: parseInlineFormatting(block.text),
          spacing: { after: 200 },
          alignment: formatSettings.textAlign === "center" ? AlignmentType.CENTER :
                     formatSettings.textAlign === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        }))
        break
      case "list":
        block.items.forEach(item => children.push(new Paragraph({
          text: item,
          bullet: { level: 0 },
          spacing: { after: 100 },
        })))
        break
      case "image":
        // Convert photo URL or SVG to PNG, embed as ImageRun
        break
      case "table":
        children.push(buildDocxTable(block.rows))
        break
    }
  }

  const fontMap = { sans: "Calibri", serif: "Georgia", mono: "Consolas" }
  const doc = new Document({
    styles: { default: { document: { run: { font: fontMap[formatSettings.fontFamily] || "Calibri" } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.download = `${slugify(title)}.docx`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## 12. AI Prompt Engineering

### Briefing System Prompt

```
You are an executive briefing generator for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing.

Generate a comprehensive morning briefing covering ALL data sources. Today's date: {DATE}.

STRUCTURE YOUR BRIEFING IN EXACTLY THESE SECTIONS:

## Pipeline Status
Current RFP pipeline: total under review, pursuit rate trends, notable incoming opportunities.
Include a chart showing pipeline activity by quarter.

## Win Rate Trends
Current overall win rate vs. historical. Momentum (accelerating/steady/decelerating).
Rolling 6-month and 12-month comparisons. Year-over-year change.
Include a line chart of quarterly win rates for the last 2 years.

## Key Opportunities
Top 5-10 pending proposals ranked by win probability score.
For each: client name, service category, probability score (%), and key factor.
Include a bar chart of pending proposals by probability tier.

## Team Performance
Account executive performance snapshot. Who has the highest recent win rate.
Notable specializations. Any concerning trends.

## Strategic Recommendations
Top 3-5 actionable recommendations based on ALL data.
Each with: the insight, suggested action, expected impact, and supporting data point.

## Client Success Highlights
Recent wins worth turning into case studies or testimonials.
Existing proof points that could strengthen pending proposals.

RULES:
1. Use ONLY real data from the provided context. Never fabricate numbers.
2. Be direct and concise — this is for busy executives, not a report.
3. Use **bold** for key numbers, percentages, and client names.
4. Include CHART_DATA where specified above.
5. Every claim must be backed by a specific number from the data.

{CHART_PROMPT}

Do NOT include FOLLOW_UP_PROMPTS for the briefing.
```

### Document Chat System Prompt

```
You are an AI writing assistant for Stamats, a marketing agency with 100+ years of experience in higher education and healthcare marketing.

You help create professional documents: proposals, RFP responses, case studies, executive summaries, strategy reports, and marketing copy.

You have access to Stamats' complete data:
- Proposal history with win/loss records and analytics
- Client success stories, testimonials, and awards
- Q&A library with approved answers on all service areas

INSTRUCTIONS:
1. When asked to write content, produce polished, professional markdown.
2. Use real Stamats data (client names, statistics, testimonials) when relevant.
3. Format with clear headings (##), bullet points, bold key terms.
4. Keep conversational responses brief. Save length for actual document content.
5. When asked for diagrams, timelines, or visual elements, generate SVG code.

{CHART_PROMPT}

{SVG_PROMPT}

After each response, include 3 contextual follow-up suggestions:
FOLLOW_UP_PROMPTS: ["suggestion 1", "suggestion 2", "suggestion 3"]
```

### Review System Prompt

```
You are a senior editor and marketing strategist reviewing copy for Stamats.

The user has provided existing content for your review. Analyze it critically:

1. **Clarity & Impact**: Is the message clear? Does it grab attention?
2. **Accuracy**: Cross-reference claims against our actual data. Flag unsupported claims.
3. **Completeness**: Are we missing proof points we actually have? (Check case studies, testimonials, awards)
4. **Tone**: Professional but not stuffy? Confident but not arrogant?
5. **Structure**: Logical flow? Smooth transitions?
6. **Specificity**: Replace vague claims with specific data from our records.

For each issue, provide:
- **Issue**: What's wrong
- **Impact**: Why it matters
- **Fix**: Specific suggested replacement text

Be constructive but honest. This is internal review.

FOLLOW_UP_PROMPTS: ["Rewrite the opening paragraph", "Add supporting data throughout", "Strengthen the call to action"]
```

### SVG Generation Prompt (appended when SVG request detected)

```
When the user asks for a diagram, timeline, infographic, flowchart, org chart, or any visual element, generate clean SVG code.

SVG GUIDELINES:
- Use viewBox for responsive sizing (e.g., viewBox="0 0 800 600")
- Use Stamats brand colors: #10B981 (emerald), #06B6D4 (cyan), #3B82F6 (blue), #8B5CF6 (violet), #F59E0B (amber), #1E293B (dark text), #64748B (light text)
- Clean, professional style — no gradients unless specifically aesthetic
- Include text labels with font-family="Inter, system-ui, sans-serif"
- Add a title comment: <!-- title: My Diagram Title -->
- Keep SVGs under 5KB when possible
- Use rounded rectangles (rx="8") for modern look

Wrap the SVG in this marker at the end of your response:
SVG_DATA: <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">...</svg>
```

---

## 13. SVG Generation

### Server-Side Parsing
Add `parseSVGData()` to `packages/server/src/services/utils/streamHelper.ts` alongside existing `parseChartData()`.

### Client-Side Rendering
In chat messages and document preview, render SVG inline:
```tsx
{message.svgData && (
  <div className="my-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{message.svgData.title}</span>
      <div className="flex gap-1">
        <button onClick={() => downloadSVG(message.svgData)}>Download SVG</button>
        <button onClick={() => saveToAssets(message.svgData)}>Save to Assets</button>
      </div>
    </div>
    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.svgData.svg) }} />
  </div>
)}
```

### SVG in Document
SVGs inserted as raw HTML in markdown: `<div class="studio-svg">{svg code}</div>`
Rendered in preview via the MarkdownRenderer. **IMPORTANT**: The MarkdownRenderer's DOMPurify config (`packages/client/src/components/chat/MarkdownRenderer.tsx`) currently only allows basic HTML tags: `strong, em, br, ul, ol, li, p, div, h2, h3, pre, code, table, thead, tbody, tr, th, td, hr`. Must add SVG tags to `ALLOWED_TAGS`: `svg, circle, rect, path, text, tspan, line, polyline, polygon, g, defs, use, clipPath, mask, filter, linearGradient, radialGradient, stop, foreignObject, marker, pattern, symbol, title, desc`. Also add to `ALLOWED_ATTR`: `viewBox, xmlns, d, cx, cy, r, rx, ry, x, y, x1, y1, x2, y2, width, height, fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, stroke-dasharray, stroke-dashoffset, opacity, transform, font-family, font-size, font-weight, text-anchor, dominant-baseline, points, offset, stop-color, stop-opacity, gradientUnits, id, href, xlink:href, preserveAspectRatio, clip-path, mask, filter`.

### SVG Export
- **PDF**: html2canvas captures rendered SVG natively
- **Word**: Convert SVG to PNG via canvas, embed as ImageRun

---

## 14. Formatting System

### FormatSettings → CSS Custom Properties

Applied to the document preview container:
```typescript
const formatToCSS = (settings: FormatSettings): React.CSSProperties => ({
  "--studio-font": settings.fontFamily === "sans" ? "'Inter', system-ui, sans-serif" :
                    settings.fontFamily === "serif" ? "'Georgia', serif" :
                    "'JetBrains Mono', monospace",
  "--studio-font-size": { small: "13px", normal: "15px", large: "17px", xl: "20px" }[settings.fontSize],
  "--studio-line-height": { tight: "1.3", normal: "1.6", relaxed: "1.8" }[settings.lineHeight],
  "--studio-paragraph-spacing": { compact: "0.5em", normal: "1em", generous: "1.5em" }[settings.paragraphSpacing],
  "--studio-section-spacing": { tight: "1em", normal: "2em", breathable: "3em" }[settings.sectionSpacing],
  "--studio-page-margin": { narrow: "0.5in", normal: "0.75in", wide: "1.25in" }[settings.pageMargins],
  "--studio-accent": settings.colorAccent,
  "--studio-columns": { single: "1", "two-column": "2", sidebar: "2" }[settings.columnLayout],
  "--studio-column-gap": settings.columnLayout === "single" ? "0" : "2em",
  "--studio-text-align": settings.textAlign,
} as React.CSSProperties)
```

### CSS for Document Pages
```css
.studio-page {
  font-family: var(--studio-font);
  font-size: var(--studio-font-size);
  line-height: var(--studio-line-height);
  text-align: var(--studio-text-align);
  column-count: var(--studio-columns);
  column-gap: var(--studio-column-gap);
}
.studio-page p { margin-bottom: var(--studio-paragraph-spacing); }
.studio-page h2, .studio-page h3 { margin-top: var(--studio-section-spacing); color: var(--studio-accent); }
```

### Column Layout
- **Single**: `column-count: 1` (default)
- **Two column**: `column-count: 2; column-gap: 2em`
- **Sidebar**: Uses CSS grid instead: `grid-template-columns: 65% 35%` with `:::sidebar:::` markdown marker

### Toolbar Controls

| Control | Options | Default |
|---------|---------|---------|
| Font Family | Sans / Serif / Mono | Sans |
| Font Size | Small(13) / Normal(15) / Large(17) / XL(20) | Normal |
| Line Height | Tight(1.3) / Normal(1.6) / Relaxed(1.8) | Normal |
| Paragraph Spacing | Compact / Normal / Generous | Normal |
| Section Spacing | Tight / Normal / Breathable | Normal |
| Margins | Narrow(0.5") / Normal(0.75") / Wide(1.25") | Normal |
| Columns | Single / Two Column / Sidebar | Single |
| Text Align | Left / Center / Right | Left |
| Color Accent | Preset picker (emerald, blue, red, slate, custom) | Emerald |
| Page Numbers | On / Off | On |
| Text Format | Bold / Italic / Underline / Strikethrough | — |
| Headings | H1 / H2 / H3 | — |
| Lists | Bullet / Numbered | — |
| Insert | Table / Quote / Code / HR / Image / SVG | — |
| Indent | Increase / Decrease | — |

---

## 15. Page Rendering (8.5x11)

### Page Dimensions
- 8.5" × 11" at 96 DPI = **816px × 1056px**
- Content area = page - margins (e.g., 0.75" margins → 672px × 912px)

### Rendering Approach
```tsx
function PageView({ content, formatSettings, pageNumber }) {
  const marginPx = { narrow: 48, normal: 72, wide: 120 }[formatSettings.pageMargins]

  return (
    <div
      className="bg-white shadow-lg mx-auto mb-8 relative"
      style={{
        width: 816,
        minHeight: 1056,
        padding: marginPx,
        ...formatToCSS(formatSettings),
      }}
    >
      <div className="studio-page">
        <MarkdownRenderer content={content} />
      </div>
      {formatSettings.showPageNumbers && (
        <div className="absolute bottom-4 right-6 text-xs text-slate-400">
          {pageNumber}
        </div>
      )}
    </div>
  )
}
```

### Page Breaks
Content naturally flows. For forced page breaks, use `:::page-break:::` in markdown, rendered as:
```css
.page-break { break-after: page; height: 0; }
```

### Page Navigator
Fixed bar at bottom of document pane:
```tsx
function PageNavigator({ pageCount, currentPage, onJump }) {
  return (
    <div className="sticky bottom-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t px-4 py-2 flex items-center gap-2">
      {Array.from({ length: pageCount }).map((_, i) => (
        <button
          key={i}
          onClick={() => onJump(i)}
          className={`w-6 h-8 rounded border text-[9px] ${
            i === currentPage ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
          }`}
        >
          {i + 1}
        </button>
      ))}
      <span className="ml-auto text-xs text-slate-500">
        Page {currentPage + 1} of {pageCount}
      </span>
    </div>
  )
}
```

### Scroll-to-Page
Use `IntersectionObserver` to detect which page is currently visible. `onJump` scrolls to the target page element.

---

## 16. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+S | Save document |
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Cmd+F | Find & Replace |
| Cmd+B | Bold |
| Cmd+I | Italic |
| Cmd+U | Underline |
| Cmd+Enter | Send chat message |
| Escape | Cancel streaming / Close find bar |
| Cmd+E | Toggle edit/preview mode |
| Cmd+Shift+E | Open export dialog |

Register via `useEffect` with `keydown` listener in DocumentStudio.tsx.

---

## 17. Dependencies

### Client (`packages/client/package.json`) — Add:
```json
{
  "html2pdf.js": "^0.10.2",
  "docx": "^9.0.0",
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0"
}
```

### Server
No new dependencies. Everything reuses existing packages.

---

## 18. File Manifest

### New Files (16)
| # | File | Purpose |
|---|------|---------|
| 1 | `packages/server/src/services/briefingAIService.ts` | Brief Me AI service — streaming executive briefing |
| 2 | `packages/server/src/services/documentAIService.ts` | Document chat + review + SVG generation AI service |
| 3 | `packages/server/src/routes/studio.ts` | All Studio API routes (AI + CRUD + assets) |
| 4 | `packages/client/src/pages/DocumentStudio.tsx` | Main page — split pane, DndContext, mode switching |
| 5 | `packages/client/src/components/studio/StudioToolbar.tsx` | Mode tabs, title, save status, export buttons |
| 6 | `packages/client/src/components/studio/FormatToolbar.tsx` | Full formatting controls (font, size, spacing, columns) |
| 7 | `packages/client/src/components/studio/DocumentEditor.tsx` | Rich editor + 8.5x11 page preview + page navigator |
| 8 | `packages/client/src/components/studio/BriefingView.tsx` | One-click streaming briefing with charts |
| 9 | `packages/client/src/components/studio/StudioChatSidebar.tsx` | AI chat sidebar with deploy + drag |
| 10 | `packages/client/src/components/studio/PhotoPicker.tsx` | Insert photos from existing library |
| 11 | `packages/client/src/components/studio/AssetPanel.tsx` | Per-user asset bucket browser |
| 12 | `packages/client/src/components/studio/ExportDialog.tsx` | PDF + Word export with options |
| 13 | `packages/client/src/components/studio/FindReplace.tsx` | Cmd+F inline search/replace |
| 14 | `packages/client/src/components/studio/index.ts` | Barrel export |
| 15 | `packages/client/src/hooks/useDocumentStore.ts` | Document state, undo/redo, auto-save, find/replace |
| 16 | `packages/client/src/types/studio.ts` | All studio TypeScript types |

### Modified Files (10)
| # | File | Change |
|---|------|--------|
| 1 | `packages/server/src/db/schema.ts` | Add 3 new tables + expand conversations enum |
| 2 | `packages/server/src/routes/index.ts` | Register `/studio` route |
| 3 | `packages/server/src/services/utils/streamHelper.ts` | Add `parseSVGData()` function + modify `streamCompletion()` chain to parse SVG + include `svgData` in done event |
| 4 | `packages/client/src/App.tsx` | Add `/studio` route |
| 5 | `packages/client/src/pages/index.ts` | Export DocumentStudio |
| 6 | `packages/client/src/types/chat.ts` | Add emerald theme to CHAT_THEMES |
| 7 | `packages/client/src/components/chat/InlineChart.tsx` | Add emerald to CHART_COLORS |
| 8 | `packages/client/src/lib/api.ts` | Add studioApi + update ConversationPage type + extend `FetchSSECallbacks.onDone` with `svgData` |
| 9 | `packages/client/src/components/chat/MarkdownRenderer.tsx` | Add SVG tags to DOMPurify `ALLOWED_TAGS` and `ALLOWED_ATTR` |
| 10 | `packages/server/src/services/proposalAIService.ts` | Add `export` to 3 analytics functions: `calculateWinRates`, `scorePendingProposals`, `generateRecommendations` |

---

## 19. Existing Patterns to Reuse

| What | Where | How It's Used |
|------|-------|---------------|
| `useChat` hook | `packages/client/src/hooks/useChat.ts` | Chat sidebar — handles messages, streaming, persistence, RAF batching |
| `ChatContainer` | `packages/client/src/components/chat/ChatContainer.tsx` | Reference for sidebar layout (NOT directly used — Studio has custom layout) |
| `ChatMessageItem` | `packages/client/src/components/chat/ChatMessage.tsx` | Render AI messages in sidebar |
| `ChatInput` | `packages/client/src/components/chat/ChatInput.tsx` | Chat input textarea in sidebar |
| `InlineChart` | `packages/client/src/components/chat/InlineChart.tsx` | Render CHART_DATA in chat + document |
| `MarkdownRenderer` | `packages/client/src/components/chat/MarkdownRenderer.tsx` | Render markdown in document preview |
| `ChatHistorySidebar` | `packages/client/src/components/chat/ChatHistorySidebar.tsx` | Conversation list in sidebar |
| `LoadingIndicator` | `packages/client/src/components/chat/LoadingIndicator.tsx` | Streaming phase indicator |
| `fetchSSE` | `packages/client/src/lib/api.ts` (line ~1150) | SSE streaming client |
| `streamCompletion` | `packages/server/src/services/utils/streamHelper.ts` | Server SSE streaming helper |
| `CHART_PROMPT` | `packages/server/src/services/utils/streamHelper.ts` | Appended to system prompts for chart generation |
| `parseChartData` | `packages/server/src/services/utils/streamHelper.ts` | Extract CHART_DATA from AI response |
| `getOpenAI` pattern | Each service has its own copy (NOT imported) | Lazy-initialized OpenAI client — copy the ~10-line function from any existing service |
| `getAllProposals` | `packages/server/src/services/proposalSyncService.ts` | Load all proposal data |
| `getPipelineStats` | `packages/server/src/services/pipelineSyncService.ts` | Pipeline intake statistics |
| `calculateWinRates` | `packages/server/src/services/proposalAIService.ts` (line 902) | Win rate analytics — **must add `export` keyword** |
| `scorePendingProposals` | `packages/server/src/services/proposalAIService.ts` (line 587) | Pending proposal probability — **must add `export` keyword** |
| `generateRecommendations` | `packages/server/src/services/proposalAIService.ts` (line 756) | Auto-generated strategic recs — **must add `export` keyword** |
| `clientSuccessData` | `packages/server/src/data/clientSuccessData.ts` | 40 case studies, 37 results, 20 testimonials, 17 awards |
| `truncateHistory` | `packages/server/src/services/utils/streamHelper.ts` | Conversation history truncation |
| `requireAuth` | `packages/server/src/middleware/auth.ts` | Applied globally in `index.ts` — do NOT add per-route |
| `getCurrentUserId` | `packages/server/src/middleware/getCurrentUser.ts` | Get current user for DB scoping |
| DOMPurify | `packages/client/src/components/chat/MarkdownRenderer.tsx` | XSS sanitization (needs SVG tags added) |
| AppHeader | `packages/client/src/components/AppHeader.tsx` | Page header (no breadcrumb changes needed) |
| Dialog components | `packages/client/src/components/ui/dialog.tsx` | Export dialog, template picker |
| Button/Input/etc | `packages/client/src/components/ui/` | All shadcn components available |

---

## 20. Verification Checklist

1. Navigate to `/studio` — page loads with toolbar + split pane (chat LEFT, document RIGHT)
2. Click "Brief Me" — streaming briefing appears with real charts on 8.5x11 pages
3. Click "Deploy to Editor" — briefing content populates document editor
4. Switch to Editor mode — edit markdown, see live 8.5x11 page preview
5. Page navigator shows correct page count, click thumbnails to jump
6. Format toolbar: change font → preview updates
7. Format toolbar: change margins → pages reflow
8. Format toolbar: switch to two-column layout → content reflows
9. Format toolbar: change spacing/size/alignment → all work
10. Cmd+Z / Cmd+Shift+Z — undo/redo
11. Cmd+F — find & replace bar, highlight matches, replace works
12. Auto-save indicator: "Saving..." → "All changes saved"
13. AI chat: type query → streaming response with charts + follow-ups
14. Click "Deploy →" on AI message → content appends to document
15. Drag AI message to document → content inserts with visual indicator
16. Ask AI for a diagram → SVG renders inline in chat + deployable to document
17. Open photo picker → browse photos, insert into document
18. Save SVG/content to asset bucket → appears in asset panel
19. Switch to Review mode → paste text → AI critiques with suggestions
20. Export PDF → downloads clean 8.5x11 PDF with charts, SVGs, photos
21. Export Word → downloads .docx with formatting, images
22. Dark mode → all components render correctly
23. Conversation persistence → reload, chat history preserved
24. Document persistence → save, reload, content + formatting restored
25. `/studio` NOT on dashboard, NOT in settings, NOT in breadcrumbs

---

## 21. Future Upgrades

The schema and architecture explicitly support these upgrades WITHOUT migrations:

| Upgrade | How It's Supported |
|---------|-------------------|
| **Real-time collaboration** | `sharedWith` JSONB array on documents. Add WebSocket sync layer. |
| **Version history + diff** | `version` integer + `parentId` FK. Branch/fork documents. |
| **Template marketplace** | `studio_templates` table with `isSystem` flag. Add sharing/publishing. |
| **AI-powered formatting** | Extend documentAIService with formatting mode. AI returns FormatSettings. |
| **Document comments** | Add `metadata.comments` JSONB array with position anchors. |
| **Custom branding/logos** | Store in `studio_assets` as `logo` type. Reference in FormatSettings. |
| **Additional page sizes** | Add `pageSize` to FormatSettings. Update page rendering dimensions. |
| **Multi-section documents** | FormatSettings per-section via metadata. Sections as top-level blocks. |
| **Collaborative editing** | `sharedWith` + Operational Transform or CRDT library. |
| **AI image generation** | Extend documentAIService to call DALL-E. Store in assets. |
| **Document analytics** | `metadata.analytics` tracking views, edits, exports over time. |
| **Approval workflows** | `mode` already has "draft"/"final". Add "pending-review" status. |

---

## Model

All Studio AI services use **gpt-4o** (the most powerful model available in the OpenAI SDK). The model constant is defined in one place (`streamCompletion` in `streamHelper.ts`) for easy upgrade when newer models become available.

---

## Color Theme: Emerald

**Primary**: `#10B981` (Emerald 500)
**Why**: Professional, calming, distinct from all existing themes (cyan, violet, indigo, purple). No pink/fuchsia. Associated with creation and productivity.

| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Primary | `#10B981` | `#34D399` |
| Bot avatar | Gradient: `#10B981 → #059669 → #047857` | Same |
| User bubble | `from-emerald-50 to-teal-100/80` | Themed dark |
| Accents | `emerald-50/100/200` | `emerald-900/700` |
| Send button | `from-emerald-500 to-teal-500` | Same |
| Active tab | Emerald underline | Emerald underline |
| Drop zone | `ring-emerald-400 bg-emerald-50/20` | `ring-emerald-500 bg-emerald-900/20` |

---

*This specification is self-contained. Everything needed to build Document Studio is documented here.*
