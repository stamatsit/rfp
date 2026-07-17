# Content Matrix (DynoMapper)

A one-page tool that turns an existing DynoMapper crawl into a per-page **remediation worksheet** — export to CSV, with optional AI-drafted fixes (meta descriptions, titles, ROT verdicts, classifications). Restricted to **eric.yerke@stamats.com**.

**Status:** Built, uncommitted. Not yet interactively verified against the running app. v1 = native matrix + CSV + AI columns.

---

## What it is

DynoMapper (account: eric.yerke@stamats.com) has already crawled ~27 higher-ed sites. This tool reads those crawls and flattens each into a table — one row per page — that a strategist can export and act on. The differentiator: DynoMapper supplies the **facts** (which pages have broken titles/metas/etc.), the LLM supplies the **drafted fixes** on export.

The tool is deliberately **one page**: pick a site → matrix loads → optionally toggle AI columns and generate → Export CSV.

## Access control (as requested — "only eric.yerke@stamats.com, via settings")

Mirrors the existing **Pitch Deck Designer** gate at every layer:
- **Server (Express):** `requireEric` middleware in [routes/dynomapper.ts](../../packages/server/src/routes/dynomapper.ts) → 403 unless `session.userEmail === "eric.yerke@stamats.com"`.
- **Server (Vercel bundle):** same email check at the top of the `/dynomapper` block in [api/index.ts](../../api/index.ts).
- **Client route/page:** [ContentMatrix.tsx](../../packages/client/src/pages/ContentMatrix.tsx) renders a "Restricted" screen for anyone else.
- **Tile:** added to `ERIC_ONLY_TILES` in both [HomePage.tsx](../../packages/client/src/pages/HomePage.tsx) and [SettingsPanel.tsx](../../packages/client/src/components/SettingsPanel.tsx). Ships **`enabled: false`** — Eric enables it in **Settings → Tiles**.

## Files touched

**Server**
- `packages/server/src/services/dynomapperService.ts` — NEW. DynoMapper client, matrix builder, AI enrichment.
- `packages/server/src/routes/dynomapper.ts` — NEW. Email-gated routes: `GET /status`, `GET /projects`, `GET /matrix`, `POST /enrich`.
- `packages/server/src/routes/index.ts` — mount `/dynomapper`.
- `api/index.ts` — email-gated `/dynomapper` block (dynamic-imports the service, like the scanner).

**Client**
- `packages/client/src/pages/ContentMatrix.tsx` — NEW. The one page.
- `packages/client/src/lib/api.ts` — `dynomapperApi` + types.
- `App.tsx` (route `/content-matrix`), `SettingsPanel.tsx` (tile + `ERIC_ONLY_TILES`), `HomePage.tsx` (`ERIC_ONLY_TILES`).

**Config**
- `DYNOMAPPER_TOKEN` documented in `.env.example`. **Must be set** in `packages/server/.env` (local) and the Vercel project env (prod).
- `Dyno.rtf` (held the raw token) added to `.gitignore` — should be deleted.

## Data model — hard-won API facts (verified against the live API)

The DynoMapper API is quirky; the service works around it:

| Endpoint | Reality | How we use it |
|---|---|---|
| `GET /v1/project` | works | site picker |
| `GET /v1/project/{id}/item` | flat page list, but **`page` param is IGNORED** and it **truncates** (311 of 536 on the big site) | matrix backbone; we note truncation |
| `GET /v1/inventory/{id}` | **effectively broken** — returns 0 at limit≥50, page 2 always empty | **NOT USED** |
| `GET /v1/audit/{id}/{kind}` | **paginates correctly** (page1≠page2) | all per-page issue flags |

**Design consequence:** the matrix rows are the **union** of the `/item` backbone and every audit-flagged URL, so no page-with-a-problem is dropped even when `/item` truncates. Issue flags come from: missing/long/duplicate title, missing/long/duplicate description, orphan, non-crawlable, non-indexable, client-error. Rows are sorted most-issues-first.

**No page body / word count / current meta text** is reliably available (inventory is broken), so AI drafts are inferred from **URL + title + issue flags** — they are suggestions to review, not final copy. (A future v2 could fetch each flagged page via the existing scanner for higher-quality drafts.)

## AI columns (`POST /enrich`, gpt-4o-mini, batched)

`summary · contentType · audience · funnelStage · rot · draftTitle · draftMeta`. Default scope is **only pages with issues** (cost control). Capped at `MAX_ENRICH_ROWS = 400` highest-priority pages. Export CSV is generated client-side and includes whatever AI columns were generated.

## What's left / open (v1)

- [x] Set `DYNOMAPPER_TOKEN` locally, verified full UI flow end-to-end (login → matrix → AI ROT column → CSV export). Prod env var not set yet.
- [ ] Delete `Dyno.rtf`.
- [ ] Set `DYNOMAPPER_TOKEN` on Vercel + commit/push to ship prod.

---

## Nuclear integration roadmap — "Migration Worksheet" mode

**Decided (2026-07-16):** build toward the **full content-migration lifecycle**, with the shared surface being **Microsoft SharePoint/OneDrive (Excel .xlsx via Microsoft Graph)** — NOT Google Sheets.

### What their internal matrix actually is
A content-migration project tracker (sample: `COPY-content-matrix-washtenaw-ai-testing(2-programs).csv` = 141 WCC program pages, one tab of a multi-tab Excel template). 48 columns in 8 phase groups:
`SITE TREE → STATUS(disposition) → AUDIT → STRATEGY → WRITING → MIGRATION → REVIEW → GOVERNANCE`.
- SITE TREE: Old URL, Assigned To, **Page ID** (hierarchical `2.1` = section.item), Navigation Title, New URL
- STATUS: 7-way disposition checkboxes — Delete / Reuse / Write New / Revise / Optimize / As Is / Import (this subset: 137/141 "Write New")
- AUDIT: Tone, Conversion, Readability/SEO, Scannability
- STRATEGY: Keywords, Page Priorities, Cross-Links, CTAs, Notes
- WRITING: Assigned Writer (Stamats), Batch, Content Template ("Program"), External Assets, Link to Draft, **Draft Provided by Stamats**, Assigned Reviewer (client), review-complete flags, Categories
- MIGRATION / REVIEW / GOVERNANCE: human PM (dates, initials, review cycle)
- Row 3 is a **formula rollup row** (`=COUNTA(...)`, disposition counts).

### The thesis
The Content Matrix tool auto-generates the front half of this worksheet (+ the drafts) from a crawl, in their exact Excel format, landing in SharePoint. A crawl becomes a ~60%-done migration project.

### Column mapping (auto vs human)
| Phase / column | Source | Auto |
|---|---|---|
| Site Tree (Old URL, Page ID, Nav Title) | DynoMapper `/item` tree (url, parent, ordering, depth) | ✅ full |
| Disposition (7-way) | AI ROT → their taxonomy, weighted by issue flags | ✅ (better with body) |
| Audit (Tone/Conversion/Readability/Scannability) | AI over **page body** | ⚠️ needs body |
| Strategy (Keywords/Priorities/Cross-Links/CTAs/Notes) | AI + DynoMapper `occurrences` link-graph | ✅ mostly |
| Writing: Content Template, External Assets, **Draft** | AI classify; DynoMapper PDF inventory; **AI writes draft** | ⚠️ draft needs body |
| Assignments, Migration/Review/Governance | Defaults + human PM; Governance dates via diff/monitor | 🧑 assist |

### Critical dependency
Real page **body content** (DynoMapper's body endpoint is broken). Reuse the existing **scannerService** page fetch to feed AI the actual copy — unlocks Audit, keywords, and real drafts.

### Slices (ship order)
- **A. Worksheet export (.xlsx in their exact format)** — ✅ **BUILT + verified (local, 2026-07-17).** `migrationWorksheet.ts` + routes `GET /dynomapper/worksheet.xlsx` and `POST /dynomapper/worksheet/sync`. Produces the exact 48-col/8-group workbook: merged group headers, generated hierarchical Page IDs (`2.1`), AI 7-way disposition + content-template, default assignments, `strat_priorities` + `strat_notes`, live rollup formulas (`=COUNTA`, `=COUNTIF(...,"x")`). Editable (no protection). UI: "Export Worksheet" + "Sync edited worksheet" on the Content Matrix page.
  - **Sync engine** — ✅ non-destructive merge keyed on Old URL: machine columns refresh, human columns preserved, dispositions preserved if human-set, machine cols never wipe a human value with blank, and pages dropped from the crawl are KEPT + flagged `[Not in latest crawl]` (redirects). Round-trip verified (export→edit→re-crawl→merge, 8/8 assertions).
  - **Column ownership** lives in `WORKSHEET_COLUMNS` (owner: machine | default | disposition | human). AUDIT + Keywords/Cross-Links/CTAs + External Assets + Draft + Categories are machine-owned but currently blank → filled by Slices B/C.
- **B. Body-content fetch** — ✅ **BUILT + verified (2026-07-17).** `pageContent.ts` (`fetchPageContent`/`fetchContentMany`, cheerio + SSRF guard + concurrency pool). `generateAuditFields` scores Tone/Conversion/Readability/Scannability + Keywords/CTAs/Cross-Links from real body text; External Assets from fetched PDFs/images. Enabled via `?body=1` (UI: "Deep audit"). Capped at `maxBody=120` pages/request.
- **C. AI drafting** — ✅ **BUILT + verified.** `generateDraft` writes a first-pass Markdown draft per Write-New/Revise page; drafts land in a **"Drafts" tab** in the workbook, rows marked `draftProvided`. `?drafts=N` (UI: "AI drafts" cycles 0/10/25/50, cap 100).
- **D. Live SharePoint/OneDrive** — ⛔ **blocked on Azure AD app registration (Sites.ReadWrite.All).** The `parseWorksheetXlsx`/`mergeWorksheets` engine is already the sync core; Graph just replaces the file upload/download when creds arrive.
- **E. Redirect map + verify** — ✅ **BUILT + verified.** `buildRedirectMap` (Old→New from the New URL column) + `verifyRedirects` (fetches each New URL, flags non-2xx/3xx) + `renderRedirects` (CSV / .htaccess / nginx). Route `POST /dynomapper/worksheet/redirects` (UI: "Redirect map" upload).

### Performance / caps (prod note)
Body-fetch + drafting fetch live pages and call the LLM per page — slow and beyond Vercel's 30s function limit on large sites. Local is unbounded; **prod needs a background job** (or keep `body`/`drafts` off for big sites). Caps in place: `maxBody=120`, `drafts≤100`, audit batch 6, fetch concurrency 8.

### External dependencies to obtain
- [ ] The **master template .xlsx** (this CSV is one tab; need the full multi-tab workbook + formulas + per-client section numbering to match exactly).
- [ ] **Azure AD app registration** for Microsoft Graph (Slice D) — client id/secret + Sites.ReadWrite.All.
