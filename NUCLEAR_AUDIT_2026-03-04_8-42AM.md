# Nuclear Codebase Audit — March 4, 2026 @ 8:42 AM

**Scope**: Full monorepo — `packages/client`, `packages/server`, `api/index.ts`, deployment config
**Method**: 5 parallel agents auditing server architecture, client architecture, API layer & data flow, security & deployment, and code quality & DX

---

## Table of Contents

1. [Critical Issues (Fix Immediately)](#1-critical-issues)
2. [Security Findings](#2-security-findings)
3. [Architecture & Technical Debt](#3-architecture--technical-debt)
4. [Client-Side Findings](#4-client-side-findings)
5. [Server-Side Findings](#5-server-side-findings)
6. [API Layer & Data Flow](#6-api-layer--data-flow)
7. [Code Quality & DX](#7-code-quality--dx)
8. [Performance Issues](#8-performance-issues)
9. [Deployment & Infrastructure](#9-deployment--infrastructure)
10. [Prioritized Action Plan](#10-prioritized-action-plan)

---

## 1. Critical Issues

### 1A. `api/index.ts` Monolith — 6,676 Lines of Duplicated Code
The Vercel serverless entry point is a **complete duplication** of the entire server codebase — all schema definitions, route handlers, business logic, and utilities are copy-pasted into one file. Every change must be made twice. Schema drift has already occurred:
- `proposals` table in `api/index.ts` is missing fields: `presentationDate`, `estimatedLaunchDate`, `actualLaunchDate`, `cmsType`, `websiteLink`
- `savedDocuments` uses untyped `jsonb` in api/index.ts but properly typed `$type<ScanFlag[]>()` in schema.ts
- Auth systems differ completely: Express uses `express-session` + `connect.sid`; Vercel uses HMAC-signed `rfp-session` cookie

### 1B. Open User Registration — No Domain Restriction
**`api/index.ts:1194-1246`** — The `/auth/register` endpoint allows ANY email address. No `@stamats.com` restriction exists in code despite being documented as a requirement. Anyone on the internet can create an account and access all application data.

### 1C. 100+ MB of Binary Files in Git
| File | Size |
|------|------|
| `Loopio.docx` | 68 MB |
| `renamed-images/` (131 PNGs) | 34 MB |
| Various `.xlsx` files | ~1 MB |
| **Total** | **~102 MB** |

Every `git clone` downloads all of this.

### 1D. XSS via Unsanitized SVG Injection
**`ChatMessage.tsx:78`** and **`StudioChatSidebar.tsx:67`** — SVG data from AI responses is injected via `dangerouslySetInnerHTML` without DOMPurify sanitization. DOMPurify is already a dependency but not used here.

---

## 2. Security Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **CRITICAL** | Open registration — no email domain restriction | `api/index.ts:1194-1246` |
| 2 | **HIGH** | No login brute-force protection in Vercel (in-memory rate limiter resets on cold starts) | `api/index.ts:1005-1027` |
| 3 | **HIGH** | SVG `dangerouslySetInnerHTML` without DOMPurify | `ChatMessage.tsx:78`, `StudioChatSidebar.tsx:67` |
| 4 | **HIGH** | Weak session secret: `rfp-library-stamats-secret-2024` (guessable) | `.env:14` |
| 5 | **HIGH** | Weak database password: `P!zza123!!@@` (dictionary word) | `.env` |
| 6 | **HIGH** | 23 known vulnerabilities in deps (10 high severity) including SheetJS 0.18.5 | `npm audit` |
| 7 | **HIGH** | Session secret fallback to `"fallback-secret"` if env vars unset | `api/index.ts:899` |
| 8 | **MEDIUM** | Custom `markdownToHtml.ts` has no sanitization — `<a href>` and `<img src>` could enable javascript: URIs | `markdownToHtml.ts:44,47` |
| 9 | **MEDIUM** | CORS falls back to wildcard `*` if `CORS_ORIGIN` env var unset | `api/index.ts:1075` |
| 10 | **MEDIUM** | No `Content-Security-Policy` header | `vercel.json` |
| 11 | **MEDIUM** | No MIME type validation on file uploads — client-controlled content type accepted | Multiple upload endpoints |
| 12 | **MEDIUM** | AI endpoints have no per-user rate limiting — one user could exhaust OpenAI credits | All AI routes |
| 13 | **MEDIUM** | Session payload is readable (base64, not encrypted — only HMAC-signed) | `api/index.ts:956-964` |
| 14 | **LOW** | Default password `St@mats` hardcoded in seed script + E2E test | `seedUsers.ts:9` |
| 15 | **LOW** | CSRF cookie set as `HttpOnly` (requires extra GET endpoint round-trip) | `api/index.ts:1129` |
| 16 | **LOW** | `seedUsers.ts` still includes terminated employee `lindsey.cook@stamats.com` | `seedUsers.ts:14` |
| 17 | **INFO** | SQL injection well-mitigated (parameterized queries throughout) | All routes |
| 18 | **INFO** | SSRF guard (`isPublicUrl`) properly blocks internal IPs | `api/index.ts:15-24` |
| 19 | **INFO** | CSRF double-submit pattern with constant-time comparison — correctly implemented | `api/index.ts:1029-1070` |

---

## 3. Architecture & Technical Debt

### 3A. Dual Codebase Problem
The local Express server (`packages/server/`) and Vercel entry point (`api/index.ts`) are **entirely separate implementations** with different auth systems, different rate limiting, and drifting schema definitions. Bug fixes in one may not reach the other.

### 3B. OpenAI Client Duplicated 12 Times
The identical lazy-init pattern is copy-pasted across 12 files, each creating its own OpenAI instance:
- `aiService.ts`, `proposalAIService.ts`, `caseStudyAIService.ts`, `unifiedAIService.ts`, `humanizerAIService.ts`, `companionAIService.ts`, `briefingAIService.ts`, `documentAIService.ts`, `testimonialAIService.ts`, `clientAIService.ts`, `clientSuccess.ts` (route), `conversations.ts` (route)

Should be a single shared utility.

### 3C. Chat Page Boilerplate Duplicated 5x
`ProposalInsights`, `CaseStudies`, `UnifiedAI`, `AskAI`, and `AIHumanizer` all share near-identical code:
- Same `parseResult` function
- Same `latestFollowUps` memo
- Same `?conv=` URL param handling useEffect
- Same `ChatContainer` + `ChatHistorySidebar` wiring
- Same empty-state structure

Only differences: theme color, quick actions, data context renderer, API endpoints. Classic case for a shared page wrapper.

### 3D. `clientSuccessData.ts` Duplicated Between Client and Server
2,345 lines × 2 copies. Identical files confirmed by diff. Must be kept in sync manually.

### 3E. No Shared Package
No `packages/shared` workspace despite both client and server needing shared types, data files, and utilities.

---

## 4. Client-Side Findings

### Pages Inventory
| Page | LOC | Issues |
|------|-----|--------|
| SearchLibrary | **3,250** | Massive — needs breaking into sub-components. Many `useState` calls, deep prop drilling |
| ClientPortfolio | **2,238** | 11 `as any` casts, complex tab state management |
| AIHumanizer | **1,974** | LCS diff algorithm (50+ lines) should be extracted to utility |
| TestimonialManager | **1,663** | Multi-tab, multi-filter — candidate for modularization |
| SavedDocuments | 304 | **DEAD CODE** — not routed anywhere. Delete. |
| Settings | 7 | **DEAD CODE** — just re-exports SettingsPanel. Delete. |

### Component Issues
- **SettingsPanel (64 KB)** — Mounted on every page via AppHeader. Entire settings UI code parsed on every page load. Should be lazy-loaded and extracted to a SettingsContext.
- **AppHeader breadcrumbs incomplete** — Missing entries for `/analyze`, `/studio`, `/clients`, `/humanize`, `/testimonials`
- **No error boundary** — If any page crashes, the entire app fails
- **PageTransition uses `key={location.pathname}`** — Forces full remount on every route change, destroying state in heavy pages

### State Management
- No centralized settings store (localStorage + custom events + direct reads — race condition prone)
- No global error state
- No request deduplication or caching
- `useChat` hook (16.6 KB) handles too many responsibilities — should split into `useChat`, `useConversations`, `useStreaming`

### Accessibility
Only 6 uses of `aria-*` attributes across the entire client. Missing:
- `aria-label` and `aria-current` on breadcrumbs
- `aria-selected` on NavRail items
- `aria-activedescendant` on CommandPalette keyboard nav
- `aria-live` on streaming chat content
- Proper label associations on form inputs

### Routing Confusion
- `/insights`, `/case-studies`, `/unified-ai` redirect to `/ai?tab=X` — the actual page files exist but are only accessed as tab children of AIHub
- No clear documentation of routing strategy

---

## 5. Server-Side Findings

### Database Schema Issues
| Issue | Location |
|-------|----------|
| Missing index on `answerItemVersions.answerItemId + versionNumber` | `schema.ts` |
| Missing index on `photoAssetVersions.photoAssetId` | `schema.ts` |
| `clients` table lacks unique constraint on `name` (but `clientBrandKit` has one) | `schema.ts:254` |
| `clientQaLinks` missing unique constraint on `(clientName, answerId)` — allows duplicate links | `schema.ts:468` |
| `userId` fields are `text` with no FK to `users` table (`savedDocuments`, `conversations`, `studioDocuments`, `studioTemplates`, `studioAssets`) | Multiple |
| `conversations.page` uses hardcoded enum — adding new AI pages requires schema migration | `schema.ts` |
| `studioDocumentVersions.documentId` has FK in schema.ts but not in api/index.ts | Drift |

### Migration Strategy
- Raw SQL scripts with `CREATE TABLE IF NOT EXISTS` — idempotent but:
  - No down migrations (no rollback)
  - No migration tracking (no record of what's been applied)
  - No column-level ALTERs

### Services Layer
- `getUnifiedAIStats()` fetches ALL proposals + 1000 answers + 1000 photos just for counts — runs on every page load
- `buildUnifiedContext()` dumps entire case study database into every AI prompt — expensive and unbounded
- Error handling uses `.catch(() => [])` pattern — good for UX, bad for debugging

---

## 6. API Layer & Data Flow

### Endpoint Auth Gaps
- `/api/search` — **PUBLIC** (no auth check)
- `/api/conversations` — **PUBLIC** (historical data visible)
- `/api/topics` — **PUBLIC**

### Type Safety Gaps
| Issue | Location |
|-------|----------|
| Studio APIs return `Promise<unknown>` instead of typed responses | `api.ts:1821-1878` |
| `Record<string, unknown>` overuse for client data endpoints | `api.ts:1524-1557` |
| AI response `metadata` typed as `Record<string, unknown>`, immediately cast inline | All chat pages |
| No schema validation (zod/joi) on any route handler | All routes |

### Client-Server Contract Mismatches
- Client merges hardcoded `clientSuccessData` + DB data — risk of duplicates
- Supabase pre-signed URLs (`ClientBrandKit.logoUrl`) expire but client never refreshes
- Conversation message timestamps parsed inconsistently (string vs Date)

### Error Handling
- 20+ instances of `.catch(() => {})` or `.catch(() => [])` silently swallowing errors on client
- `useChat` conversation save failures logged to console but never shown to user
- Server returns generic `"Internal server error"` — no structured error codes

---

## 7. Code Quality & DX

### Testing — Near Zero Coverage
- **Client**: 0 test files. Playwright listed as dev dep but no test files exist.
- **Server**: 2 test files (456 lines total) — `services.test.ts` and `import.test.ts`
- **Hardcoded local path in test**: `import.test.ts:17` has `/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx`
- No CI/CD test pipeline

### Type Safety
- **41 `as any` casts** across 8 files (worst: `ClientPortfolio.tsx` with 11 casts, `clientSuccess.ts` route with 18)
- **14 `eslint-disable` suppressions** — mostly `react-hooks/exhaustive-deps` in chat pages

### Dead Code
- `SavedDocuments.tsx` (304 lines) — never routed
- `Settings.tsx` (7 lines) — unnecessary re-export
- Dead `whereClause` variable at `api/index.ts:1663`
- `helmet` dependency — never imported
- `zod` dependency — never used
- `uuid` dependency — likely unused (DB uses `defaultRandom()`)

### Documentation
- **No README.md** in root or packages
- No OpenAPI/Swagger spec for the API
- Stale phase reports in `docs/` (PHASE0-5) and root (PHASE6, architecture audit from Feb 10)
- Primary documentation lives in Claude Code memory files — not accessible to other developers
- `check-dupes.cjs` and `remove-exact-dupes.cjs` are one-off scripts committed to root

### Git Hygiene
- `~$Stamats-Client winning awards.xlsx` (Excel lock file) in working dir — add `~$*` to .gitignore
- `.DS_Store` may be tracked from prior commit
- `--legacy-peer-deps` in Vercel install command masks dependency issues

---

## 8. Performance Issues

| Issue | Impact | Location |
|-------|--------|----------|
| `getUnifiedAIStats()` fetches ALL proposals + 1000 answers + 1000 photos for counts | Slow page loads | `unifiedAIService.ts:527-563` |
| `buildUnifiedContext()` sends all case studies/testimonials/awards in every AI prompt | Token waste, slow responses | `unifiedAIService.ts` |
| SearchLibrary (3,250 LOC) may render entire dataset — no virtual scrolling | Jank on large datasets | `SearchLibrary.tsx` |
| ClientPortfolio (2,238 LOC) loads all tabs at once | Unnecessary rendering | `ClientPortfolio.tsx` |
| AppHeader re-renders on every route change via `useLocation()` | Unnecessary re-renders | `AppHeader.tsx` |
| `useChat` stores all messages in state — no windowing | Slow scrolling on long chats | `useChat.ts` |
| PageTransition `key={pathname}` forces full component tree remount | Expensive, destroys state | `App.tsx` |
| SettingsPanel (64 KB) mounted on every page | Parse/eval cost | `AppHeader.tsx` |
| 8 separate OpenAI client instances possible in one process | Memory waste | Multiple services |
| In-memory search pagination: all results fetched, then sliced in JS | Memory waste, slow | `search.ts:32-38` |
| Homepage fetches 5 API calls in parallel with `Promise.all` — if one stalls, all stall | Slow dashboard | `HomePage.tsx:337-341` |

---

## 9. Deployment & Infrastructure

### Vercel Config
- Functions: 30s timeout, 1024MB memory — appropriate
- Security headers: X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy — good
- Missing: Content-Security-Policy
- `--legacy-peer-deps` in install command

### Dual Code Path Risk
| Aspect | Local Server | Vercel (`api/index.ts`) |
|--------|-------------|----------------------|
| Auth | express-session + `connect.sid` | HMAC-signed `rfp-session` cookie |
| Rate limiting | express-rate-limit (5 login/min) | In-memory Map (ineffective on serverless) |
| Security headers | helmet middleware | Manual headers in vercel.json |
| Schema | `packages/server/src/db/schema.ts` | Inline redefinition (drifted) |
| Multipart parsing | multer | Custom parser |

### Dependencies
- Root `package.json` duplicates many server deps for Vercel compatibility
- `bcrypt` (native, local) vs `bcryptjs` (pure JS, Vercel) — intentional but confusing
- `express-session`, `express-rate-limit`, `helmet`, `cookie-parser` — dead deps for production

---

## 10. Prioritized Action Plan

### Tier 1 — Fix Immediately (Security)
| # | Action | Effort |
|---|--------|--------|
| 1 | Restrict registration to `@stamats.com` emails | 15 min |
| 2 | Sanitize SVG data with DOMPurify before `dangerouslySetInnerHTML` | 15 min |
| 3 | Rotate session secret to 64+ random hex chars | 15 min |
| 4 | Rotate database password to 32+ random chars | 30 min |
| 5 | Remove terminated employee from `seedUsers.ts` | 5 min |
| 6 | Add `~$*` to `.gitignore` | 2 min |

### Tier 2 — Fix This Sprint (Stability & Bugs)
| # | Action | Effort |
|---|--------|--------|
| 7 | Add React error boundary wrapping routes | 30 min |
| 8 | Complete AppHeader breadcrumb pageConfig | 15 min |
| 9 | Remove PageTransition `key={pathname}` (prevents remounts) | 10 min |
| 10 | Delete dead code: `SavedDocuments.tsx`, `Settings.tsx` | 5 min |
| 11 | Fix chat conversation save race condition (add save-in-progress flag) | 30 min |
| 12 | Use `Promise.allSettled` instead of `Promise.all` for dashboard stats | 15 min |
| 13 | Add Content-Security-Policy header to `vercel.json` | 30 min |

### Tier 3 — Fix This Month (Architecture)
| # | Action | Effort |
|---|--------|--------|
| 14 | Extract shared OpenAI client to `packages/server/src/services/utils/openai.ts` | 1 hr |
| 15 | Create shared chat page wrapper component (deduplicate 5 AI pages) | 2-3 hrs |
| 16 | Lazy-load SettingsPanel (only when opened) | 1 hr |
| 17 | Extract SettingsContext (replace localStorage + events) | 2 hrs |
| 18 | Add missing DB indexes (answerItemVersions, photoAssetVersions) | 15 min |
| 19 | Add unique constraints (clients.name, clientQaLinks) | 15 min |
| 20 | Move `clientSuccessData.ts` to shared location (eliminate duplicate) | 1 hr |
| 21 | Add userId FK constraints to savedDocuments, conversations, studio tables | 30 min |

### Tier 4 — Address Over Time (Tech Debt)
| # | Action | Effort |
|---|--------|--------|
| 22 | Break up SearchLibrary (3,250 LOC) into sub-components | 4-6 hrs |
| 23 | Break up ClientPortfolio (2,238 LOC) into sub-components | 3-4 hrs |
| 24 | Eliminate `as any` casts (41 instances) with proper interfaces | 2-3 hrs |
| 25 | Add schema validation (zod) to API route handlers | 3-4 hrs |
| 26 | Remove 100+ MB of binary files from git history | 1-2 hrs |
| 27 | Add client-side tests (Playwright) | Ongoing |
| 28 | Fix hardcoded local path in `import.test.ts` | 10 min |
| 29 | Audit and remove unused deps (helmet, zod, uuid) | 30 min |
| 30 | Update SheetJS and resolve npm audit vulnerabilities | 2-3 hrs |
| 31 | Implement persistent rate limiting (Redis or DB-backed) | 2-3 hrs |
| 32 | Add accessibility (ARIA attributes) across all components | Ongoing |
| 33 | Consolidate dark mode to use Tailwind `dark:` prefix consistently | 2-3 hrs |
| 34 | Write README.md and API documentation | 2-3 hrs |
| 35 | Resolve `api/index.ts` monolith (long-term architectural decision) | Major effort |

---

## Appendix: Fixes Applied (March 4, 2026)

The following safe fixes were implemented immediately after the audit. All changes verified with a successful build.

| # | Fix | Files Modified | Impact |
|---|-----|---------------|--------|
| 1 | **Restrict registration to @stamats.com emails** | `api/index.ts`, `packages/server/src/routes/auth.ts` | Blocks unauthorized account creation |
| 2 | **Sanitize SVG with DOMPurify** | `ChatMessage.tsx`, `StudioChatSidebar.tsx` | Prevents XSS via malicious SVG in AI responses |
| 3 | **Sanitize markdownToHtml output** | `packages/client/src/lib/markdownToHtml.ts` | Prevents XSS via markdown-to-HTML injection |
| 4 | **Remove terminated employee from seed script** | `packages/server/src/scripts/seedUsers.ts` | Removed `lindsey.cook@stamats.com` |
| 5 | **Add `~$*` to .gitignore** | `.gitignore` | Prevents Excel lock files from being committed |
| 6 | **Add React ErrorBoundary** | `App.tsx`, new `components/ErrorBoundary.tsx` | Catches page crashes gracefully instead of white screen |
| 7 | **Delete dead code** | Deleted `SavedDocuments.tsx`, `Settings.tsx` | Removed 311 lines of unreachable code |
| 8 | **Fix HomePage import** | `pages/HomePage.tsx` | Updated import from deleted `Settings.tsx` to `SettingsPanel` |
| 9 | **Use Promise.allSettled for dashboard** | `pages/HomePage.tsx` | One slow/failed API call no longer blocks entire dashboard |
| 10 | **Add Content-Security-Policy header** | `vercel.json` | Mitigates XSS, restricts script/connect sources |

### Not applied (require coordination):
- **Session secret rotation** — would log out all active users. Do at low-traffic time.
- **Database password rotation** — requires Supabase console + env var update.
- **DB unique constraints** — need to check for existing duplicates first.
- **DB foreign key constraints** — need to check for orphaned records first.

---

*Generated by 5 parallel Claude agents auditing the full codebase.*
