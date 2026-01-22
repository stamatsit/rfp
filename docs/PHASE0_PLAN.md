# PHASE 0: Planning & Architecture Decisions

**Date:** January 21, 2026
**Status:** Ready for Approval

---

## 1. Repository Scan Summary

### Current State
- **Working Directory:** `/Users/ericyerke/Desktop/data app/`
- **Status:** Empty (fresh start)
- **Existing Assets:**
  - `renamed-images/` folder with 131 pre-named image files (PNG format)

### Source Data Located
- **Excel File:** `/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx`
  - Sheet: "Library Entries" (882 data rows + 1 header)
  - Columns: Question, Answer, Category, Sub-Category, Tags
  - Format: Microsoft Excel 2007+

### Sample Data Structure
```
Row 1 (Header): Question | Answer | Category | Sub-Category | Tags
Row 2: "Pyramid" Slide for Structure... | NOTE: This is a visual... | Website Design & Creative | | Content,Example/Graphic,Website
Row 3: .ORG or .EDU Website Content | Each year, Stamats writers... | Content Marketing & Optimization | Organic SEO & technical optimization | Client List,Content
```

### Categories Found (Topics)
Based on sampling, categories include:
- Website Design & Creative
- Content Marketing & Optimization
- (Additional categories to be extracted during import)

---

## 2. Stack Decisions

### Frontend
| Choice | Reasoning |
|--------|-----------|
| **React 18** | Industry standard, excellent ecosystem |
| **TypeScript (strict)** | Required per spec; catches errors early |
| **Vite** | Fast dev server, simple config, modern ESM |
| **React Router v6** | Standard routing, supports 4-screen architecture |
| **TailwindCSS** | Rapid UI dev, responsive, accessible components |
| **shadcn/ui** | Grandma-simple large buttons, accessible by default |

### Backend / API
| Choice | Reasoning |
|--------|-----------|
| **Node.js + Express** | Simple REST API, pairs with React/Vite |
| **TypeScript** | Shared types between frontend/backend |

### Database / Persistence
| Choice | Reasoning |
|--------|-----------|
| **SQLite + better-sqlite3** | Zero config, file-based, supports unique constraints, FTS5 for search |
| **Drizzle ORM** | Type-safe, lightweight, works great with SQLite |
| **FTS5 virtual tables** | Full-text search for answers/photos without external dependencies |

**Why SQLite over Postgres/Supabase for MVP:**
1. No external service needed (grandma-simple deployment)
2. Single-file database = easy backup
3. FTS5 provides robust full-text search
4. Unique constraints + transactions support upsert/versioning
5. Can migrate to Postgres later if needed

### File Storage
| Choice | Reasoning |
|--------|-----------|
| **Local filesystem** | MVP simplicity; photos stored with UUID-based keys |
| **Storage path:** `./storage/photos/{uuid}.{ext}` | Never changes on rename |

### AI Integration
| Choice | Reasoning |
|--------|-----------|
| **OpenAI API (gpt-4o-mini)** | Cost-effective, good at following grounding instructions |
| **Retrieval:** FTS5 query → ranked results → context | No vector DB needed for MVP |

### Excel Parsing
| Choice | Reasoning |
|--------|-----------|
| **xlsx** (SheetJS) | Most robust Excel parser for Node.js |

### Testing
| Choice | Reasoning |
|--------|-----------|
| **Vitest** | Fast, Vite-native, Jest-compatible |
| **Testing Library** | React component testing |
| **Supertest** | API endpoint testing |

---

## 3. Data Model Schema (SQLite + Drizzle)

```sql
-- Topics (controlled vocabulary)
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,           -- normalized (lowercase, trimmed)
  display_name TEXT NOT NULL,          -- original casing for UI
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Answer Items (current state)
CREATE TABLE answer_items (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  subtopic TEXT,
  status TEXT NOT NULL DEFAULT 'Approved' CHECK(status IN ('Approved', 'Draft')),
  tags TEXT,                           -- JSON array, normalized
  fingerprint TEXT NOT NULL UNIQUE,    -- for upsert deduplication
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Answer Item Versions (history)
CREATE TABLE answer_item_versions (
  id TEXT PRIMARY KEY,
  answer_item_id TEXT NOT NULL REFERENCES answer_items(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  subtopic TEXT,
  status TEXT NOT NULL,
  tags TEXT,
  version_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NOT NULL DEFAULT 'local'
);

-- Photo Assets (current state)
CREATE TABLE photo_assets (
  id TEXT PRIMARY KEY,
  display_title TEXT NOT NULL,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  status TEXT NOT NULL DEFAULT 'Approved' CHECK(status IN ('Approved', 'Draft')),
  tags TEXT,                           -- JSON array, normalized
  description TEXT,
  storage_key TEXT NOT NULL UNIQUE,    -- UUID-based, never changes
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Photo Asset Versions (history)
CREATE TABLE photo_asset_versions (
  id TEXT PRIMARY KEY,
  photo_asset_id TEXT NOT NULL REFERENCES photo_assets(id) ON DELETE CASCADE,
  display_title TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  status TEXT NOT NULL,
  tags TEXT,
  description TEXT,
  version_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NOT NULL DEFAULT 'local'
);

-- Links between Answers and Photos
CREATE TABLE links_answer_photo (
  answer_item_id TEXT NOT NULL REFERENCES answer_items(id) ON DELETE CASCADE,
  photo_asset_id TEXT NOT NULL REFERENCES photo_assets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NOT NULL DEFAULT 'local',
  PRIMARY KEY (answer_item_id, photo_asset_id)
);

-- Audit Log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL CHECK(action_type IN ('IMPORT', 'EDIT', 'RENAME', 'DOWNLOAD', 'COPY', 'LINK', 'UNLINK', 'AI_REQUEST')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('ANSWER', 'PHOTO', 'SYSTEM')),
  entity_id TEXT,
  details TEXT,                        -- JSON
  actor TEXT NOT NULL DEFAULT 'local',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Full-Text Search (FTS5)
CREATE VIRTUAL TABLE answer_items_fts USING fts5(
  question, answer, tags,
  content='answer_items',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE photo_assets_fts USING fts5(
  display_title, description, tags,
  content='photo_assets',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER answer_items_ai AFTER INSERT ON answer_items BEGIN
  INSERT INTO answer_items_fts(rowid, question, answer, tags) VALUES (NEW.rowid, NEW.question, NEW.answer, NEW.tags);
END;

CREATE TRIGGER answer_items_ad AFTER DELETE ON answer_items BEGIN
  INSERT INTO answer_items_fts(answer_items_fts, rowid, question, answer, tags) VALUES ('delete', OLD.rowid, OLD.question, OLD.answer, OLD.tags);
END;

CREATE TRIGGER answer_items_au AFTER UPDATE ON answer_items BEGIN
  INSERT INTO answer_items_fts(answer_items_fts, rowid, question, answer, tags) VALUES ('delete', OLD.rowid, OLD.question, OLD.answer, OLD.tags);
  INSERT INTO answer_items_fts(rowid, question, answer, tags) VALUES (NEW.rowid, NEW.question, NEW.answer, NEW.tags);
END;

-- (Similar triggers for photo_assets_fts)
```

### Fingerprint Strategy
```typescript
function generateFingerprint(question: string, topicName: string): string {
  const normalized = [
    question.toLowerCase().trim().replace(/\s+/g, ' '),
    topicName.toLowerCase().trim()
  ].join('|');

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

**Collision Handling:**
- If fingerprint matches but answer text differs significantly (edit distance > threshold), flag as "Needs Review"
- Store in `import_issues` temp table during import for user resolution

---

## 4. Directory Structure

```
/Users/ericyerke/Desktop/data app/
├── docs/
│   ├── PHASE0_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── IMPORT_PIPELINE.md
│   ├── SEARCH_RETRIEVAL.md
│   ├── LINKING_MODEL.md
│   ├── AI_GUARDRAILS.md
│   └── CHECKPOINT_REPORTS.md
├── packages/
│   ├── client/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── types/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/                 # Express backend
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── db/
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   └── types/
│       ├── package.json
│       └── tsconfig.json
├── storage/
│   └── photos/                 # UUID-based photo storage
├── data/
│   └── library.db              # SQLite database
├── renamed-images/             # Existing source images
├── package.json                # Root workspace
├── tsconfig.base.json
└── README.md
```

---

## 5. UI Screen Architecture

### Screen 1: Home
**Route:** `/`
- 4 large tiles (280px x 180px minimum)
  - "Upload Spreadsheet" → `/import`
  - "Upload Photos" → `/photos`
  - "Search Library" → `/search`
  - "Help" → Modal with quick guide
- Header: "Library Lite" branding
- Footer: Version + last import timestamp

### Screen 2: Import Wizard
**Route:** `/import`
- Step 1: File upload (drag/drop zone, "Use Sample File" button in dev)
- Step 2: Preview (first 20 rows, column mapping confirmation)
- Step 3: Issues (table with row number, issue type, message, resolution)
- Step 4: Progress + completion summary
- Back button at each step

### Screen 3: Upload Photos
**Route:** `/photos`
- Drag/drop zone (multi-file)
- For each uploaded file:
  - Thumbnail preview
  - Topic dropdown (required, from Topics table)
  - Status toggle (Approved/Draft)
  - Tags input (normalized on blur)
  - Description textarea
- "Upload All" button (large, prominent)
- Below: Existing photos grid with Rename/Download actions

### Screen 4: Search Library
**Route:** `/search`
- Single search bar (large, centered)
- Filter chips: Type (All/Answers/Photos), Topic dropdown, Status toggle
- Results list:
  - Answers: Question preview, topic badge, tags, "Copy" and "View" buttons, linked photos count
  - Photos: Thumbnail, title, topic badge, "Download" and "View" buttons, linked answers count
- Detail drawer/modal:
  - Full content view
  - "Linked Photos/Answers" section
  - "Link to..." button opening search-to-link picker
- AI section at bottom:
  - "Ask AI" button → opens AI input panel
  - Text input with format hints
  - Response area with Sources list

---

## 6. Import Pipeline Overview

```
┌─────────────────┐
│  Upload XLSX    │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Parse Sheet    │  (SheetJS: xlsx)
│  "Library       │
│   Entries"      │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Validate Rows  │
│  - Required:    │
│    Question,    │
│    Answer,      │
│    Category     │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Extract Topics │  (Category column)
│  Upsert to DB   │  normalize → unique
└────────┬────────┘
         ▼
┌─────────────────┐
│  Generate       │
│  Fingerprints   │  hash(question|topic)
└────────┬────────┘
         ▼
┌─────────────────────────────────┐
│  For each row:                  │
│  ┌───────────────────────────┐  │
│  │ Fingerprint exists?       │  │
│  │ YES → Update existing     │  │
│  │       Create new version  │  │
│  │ NO  → Insert new          │  │
│  │       Create version 1    │  │
│  └───────────────────────────┘  │
└────────┬────────────────────────┘
         ▼
┌─────────────────┐
│  Collect Issues │
│  - Missing data │
│  - Collisions   │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Return Summary │
│  + Issues List  │
└─────────────────┘
```

---

## 7. AI Guardrails Summary

### Retrieval-Only Pattern
```
User Request
     │
     ▼
┌─────────────────────────┐
│ FTS5 Search: approved   │
│ answer_items only       │
│ Limit: top 5 by rank    │
└────────────┬────────────┘
             ▼
      ┌──────┴──────┐
      │ Results > 0? │
      └──────┬──────┘
         YES │ NO
          ▼  │  ▼
┌─────────┐  │  ┌──────────────────┐
│ Build   │  │  │ REFUSE:          │
│ context │  │  │ "No approved     │
│ from    │  │  │  answers match." │
│ sources │  │  └──────────────────┘
└────┬────┘
     ▼
┌─────────────────────────┐
│ LLM Prompt:             │
│ "Using ONLY the sources │
│  below, draft response. │
│  DO NOT add any info    │
│  not in sources."       │
│                         │
│ [Source 1: ID, Question,│
│  Answer excerpt]        │
│ ...                     │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ Return:                 │
│ - AI-generated response │
│ - Sources used (IDs +   │
│   question titles)      │
│ - Log to audit_log      │
└─────────────────────────┘
```

### Prompt Template
```
You are a retrieval assistant for an approved Q&A library.

RULES:
1. ONLY use information from the sources provided below.
2. NEVER add facts, claims, or knowledge from outside sources.
3. If the sources don't contain relevant information, say "I don't have approved content for this."
4. Cite source IDs in your response.

USER REQUEST: {userRequest}

FORMAT INSTRUCTIONS: {formatInstructions}

APPROVED SOURCES:
{sources.map(s => `[${s.id}] Question: ${s.question}\nAnswer: ${s.answer}`).join('\n\n')}

Respond based ONLY on the above sources.
```

---

## 8. Phase Execution Commands

### PHASE 1: Scaffold + UI Skeleton
```bash
# 1. Initialize monorepo
cd "/Users/ericyerke/Desktop/data app"
npm init -y
npm pkg set type="module"
npm pkg set workspaces='["packages/*"]'

# 2. Create client package
mkdir -p packages/client/src/{components,pages,hooks,lib,types}
cd packages/client
npm create vite@latest . -- --template react-ts
npm install react-router-dom
npm install -D tailwindcss postcss autoprefixer
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu class-variance-authority clsx tailwind-merge lucide-react

# 3. Create server package
cd ../..
mkdir -p packages/server/src/{routes,services,db}
cd packages/server
npm init -y
npm pkg set type="module"
npm install express cors multer better-sqlite3 drizzle-orm uuid xlsx
npm install -D typescript @types/node @types/express @types/cors @types/multer @types/better-sqlite3 @types/uuid tsx drizzle-kit

# 4. Setup TypeScript
cd ../..
# Create tsconfig.base.json, package tsconfigs

# 5. Setup Tailwind in client
cd packages/client
npx tailwindcss init -p

# 6. Create 4 route pages (skeleton)
# - HomePage.tsx
# - ImportWizard.tsx
# - PhotoUpload.tsx
# - SearchLibrary.tsx

# 7. Setup React Router in App.tsx
```

### PHASE 2: Data Layer
```bash
# 1. Define Drizzle schema in packages/server/src/db/schema.ts
# 2. Create migration: npx drizzle-kit generate
# 3. Run migration: npx drizzle-kit migrate
# 4. Setup FTS5 virtual tables manually (Drizzle doesn't support FTS)
# 5. Create db/index.ts connection wrapper
# 6. Create storage/photos directory
```

### PHASE 3: Excel Import
```bash
# 1. Create packages/server/src/services/importService.ts
# 2. Create packages/server/src/routes/import.ts
# 3. Create packages/client/src/pages/ImportWizard/
# 4. Write tests: packages/server/src/__tests__/import.test.ts
```

### PHASE 4: Photo Upload
```bash
# 1. Create packages/server/src/services/photoService.ts
# 2. Create packages/server/src/routes/photos.ts
# 3. Create packages/client/src/pages/PhotoUpload/
# 4. Write tests: packages/server/src/__tests__/photos.test.ts
```

### PHASE 5: Search + Linking
```bash
# 1. Create packages/server/src/services/searchService.ts
# 2. Create packages/server/src/routes/search.ts
# 3. Create packages/server/src/services/linkService.ts
# 4. Create packages/client/src/pages/SearchLibrary/
# 5. Write tests
```

### PHASE 6: AI Retrieve + Apply
```bash
# 1. Create packages/server/src/services/aiService.ts
# 2. Create packages/server/src/routes/ai.ts
# 3. Add AI panel to SearchLibrary
# 4. Write tests: refusal, sources citation, audit logging
```

---

## 9. File Paths Summary

| Purpose | Path |
|---------|------|
| Source Excel | `/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx` |
| Source Images | `/Users/ericyerke/Desktop/data app/renamed-images/` |
| Database | `/Users/ericyerke/Desktop/data app/data/library.db` |
| Photo Storage | `/Users/ericyerke/Desktop/data app/storage/photos/` |
| Frontend | `/Users/ericyerke/Desktop/data app/packages/client/` |
| Backend | `/Users/ericyerke/Desktop/data app/packages/server/` |

---

## 10. Approval Checklist

Before proceeding to PHASE 1, please confirm:

- [ ] Stack choices (React + Vite + Express + SQLite) approved
- [ ] Data model schema approved
- [ ] 4-screen UI architecture approved
- [ ] Fingerprint strategy for upsert approved
- [ ] AI guardrails approach approved
- [ ] Source file path correct (`/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx`)
- [ ] Ready to proceed

---

**PHASE 0 COMPLETE. Awaiting approval to proceed to PHASE 1.**
