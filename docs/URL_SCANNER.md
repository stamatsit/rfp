# URL Scanner

Reference for how the URL scanner collects data and how every score, percentage, and rating shown on the frontend is derived.

---

## 1. File map

### Backend (where the work happens)
- [packages/server/src/services/scannerService.ts](../packages/server/src/services/scannerService.ts) — 1608-line orchestrator with all analyzers and scoring
- [packages/server/src/routes/scanner.ts](../packages/server/src/routes/scanner.ts) — Express routes: `POST /scan`, `POST /crawl`, `GET /sitemap`, `GET /sitemap-stream`, `POST /ai`
- [packages/server/src/types/scanner.ts](../packages/server/src/types/scanner.ts) — `ScanReport`, `ScanIssue`, `CategoryScore`, `Severity`, `Category` types

### Vercel serverless bundle
- [api/index.ts:7584-7746](../api/index.ts#L7584-L7746) — bundled scanner routes; dynamic-imports `scannerService.js` to isolate ESM transitive deps

### Frontend
- [packages/client/src/pages/URLScanner.tsx](../packages/client/src/pages/URLScanner.tsx) — page, SSE client, results UI, score rendering, animated ring
- [packages/client/src/components/SettingsPanel.tsx:195-205](../packages/client/src/components/SettingsPanel.tsx#L195-L205) — home-screen tile (`id: "url-scanner"`, route `/scanner`, default-on, "NEW" badge)
- [packages/client/src/components/SettingsPanel.tsx:329](../packages/client/src/components/SettingsPanel.tsx#L329) — `urlScannerEnabled: true`
- [packages/client/src/components/SettingsPanel.tsx:362-369](../packages/client/src/components/SettingsPanel.tsx#L362-L369) — Labs-flag → tile-visibility migration

### Untracked
- `URL Scan Fix/` at repo root — UI mockup screenshots only, no code

---

## 2. Data collection pipeline

### Single-URL scan (`POST /scan`, SSE)

Steps streamed to the client as `{ step, status }` events ([scannerService.ts:1444-1577](../packages/server/src/services/scannerService.ts#L1444-L1577)):

1. **fetch** — `fetch(url)` with 15s default timeout (overridable 5–30s), UA string `Mozilla/5.0 (compatible; StamatsScanner/1.0)`
2. **structure** — eight analyzers run in parallel via `Promise.all`:
   - `analyzeHeadings`, `analyzeImages`, `analyzeLandmarks`, `analyzeForms`, `analyzeMeta`, `analyzeSecurityHeaders`, `analyzeSchema`, `analyzeSiteStructure`
3. **accessibility** — `runAxeAudit` runs axe-core inside jsdom (see §3)
4. **links** (optional) — `checkLinks` HEAD/GET-probes every link with 5s timeout
5. **scoring** — `calculateScores` + `generateSummary`
6. **complete** — final `{ report }` payload

### Sitemap-driven crawl (`POST /crawl`)
[scanner.ts:322-439](../packages/server/src/routes/scanner.ts#L322-L439). Discovers `/sitemap.xml` or robots.txt declarations, caps at 200 URLs, runs the full single-URL pipeline per page, then aggregates totals + most common ruleIds. Each page is scored independently — there is no cross-page context.

### Screenshots
Separate feature (sitemap-driven screenshot capture, recent commit `c96becc`). **Not part of the accessibility/score pipeline.**

---

## 3. Accessibility specifics

- **Engine:** [axe-core](https://www.deque.com/axe/) (industry-standard WCAG audit engine).
- **Page environment:** [jsdom v24](../package.json) — static DOM, no headless browser. Pinned to v24 because v29+ pulls ESM-only `@exodus/bytes/encoding-lite.js` which breaks the Vercel bundle's `require()`.
- **Injection:** `dom.window.eval(axeSource)`, then `axe.run(dom.window.document, { runOnly: { type: "tag", values: tags } })` ([scannerService.ts:1014-1033](../packages/server/src/services/scannerService.ts#L1014-L1033)).
- **WCAG level** (user-selectable, default AA) → axe tags:
  - `A` → `["wcag2a", "best-practice"]`
  - `AA` → adds `"wcag2aa"`
  - `AAA` → adds `"wcag2aaa"`
- **Severity mapping** from axe `impact` ([line 1062](../packages/server/src/services/scannerService.ts#L1062)):
  - `critical` | `serious` → `error`
  - `moderate` → `warning`
  - else → `info`
- **Custom DOM checks** run in parallel and feed the same issue list (headings, images, landmarks, forms, meta, security headers, schema, links, site structure).
- **Deduplication:** if a custom rule and axe both flag the same `category::selector`, the axe version wins ([scannerService.ts:1516-1528](../packages/server/src/services/scannerService.ts#L1516-L1528)).

### Hard limits
- No JS execution (`runScripts: "outside-only"`) — SPAs and JS-rendered DOM are under-reported.
- No real CSS render — computed contrast on dynamically styled content is not measured.
- Vercel function `maxDuration: 30s`.

---

## 4. How every score is derived

### 4a. Per-category score (server)

[scannerService.ts:1290-1298](../packages/server/src/services/scannerService.ts#L1290-L1298). Computed for each of the 11 categories (`headings, images, landmarks, forms, document, links, performance, contrast, security, schema, structure`):

```
score = clamp(0, 100, 100 - errors*15 - warnings*5 - infos*1)
```

- 1 error costs 15 points, 1 warning costs 5, 1 info costs 1.
- 7 errors alone → 0. 20 warnings alone → 0.
- Categories with no issues report `score: 100`.

Stored as `categoryScores: { category, score, errors, warnings, infos }[]`.

### 4b. Server overall score (the big number in the ring)

[scannerService.ts:1300-1322](../packages/server/src/services/scannerService.ts#L1300-L1322). Five intermediate buckets, weighted sum, rounded, clamped:

| Bucket          | Composition                                          | Weight |
|-----------------|------------------------------------------------------|--------|
| Accessibility   | `(images + contrast) / 2`                            | 35%    |
| Structure       | `(headings + landmarks + forms + structure) / 4`     | 20%    |
| SEO             | `(document*2 + schema) / 3`                          | 25%    |
| Security        | `security`                                           | 10%    |
| Links           | `links`                                              | 10%    |

```
overallScore = round(
  acc*0.35 + structure*0.20 + seo*0.25 + security*0.10 + links*0.10
)
```

Missing category defaults to 100 ([line 1306](../packages/server/src/services/scannerService.ts#L1306)). `performance` is computed but **not** in the overall.

### 4c. Frontend "4 tile" scores (the cards next to the ring)

[URLScanner.tsx:2284-2294](../packages/client/src/pages/URLScanner.tsx#L2284-L2294). The four big tiles are **recomputed on the client** with a slightly different shape:

| Tile           | Frontend formula                                            |
|----------------|-------------------------------------------------------------|
| Accessibility  | `(images + contrast + forms + landmarks) / 4`               |
| Structure      | `(headings + structure) / 2`                                |
| SEO            | `(document*2 + schema) / 3`                                 |
| Security       | `security`                                                  |

> ⚠️ **Mismatch with the server overall.** The server rolls `forms` and `landmarks` into Structure (20% weight). The frontend rolls them into Accessibility for display. So the *Accessibility tile a user sees* and the *Accessibility component baked into the overall ring* are not the same number. The overall ring itself is server-computed and authoritative; the tiles are an alternate aggregation only used for visual grouping.
>
> Links is also dropped from the tile view (still part of the overall score, just not surfaced as its own tile).

### 4d. Score → color (visual rating)

[URLScanner.tsx:248-258](../packages/client/src/pages/URLScanner.tsx#L248-L258):

| Range  | Color (hex)               | Tailwind        | Meaning |
|--------|---------------------------|-----------------|---------|
| ≥ 90   | `hsl(152 69% 41%)` green  | `text-emerald-500` | Good    |
| 70–89  | `hsl(38 92% 50%)` amber   | `text-amber-500`   | Warning |
| < 70   | `hsl(0 84% 60%)` red      | `text-red-500`     | Poor    |

Used by the ring stroke, the tile number text, the tile progress bar fill ([line 525](../packages/client/src/pages/URLScanner.tsx#L525) — `width: ${score}%`), the printable HTML report ([line 1106](../packages/client/src/pages/URLScanner.tsx#L1106)), and the saved-scan history list ([line 2460](../packages/client/src/pages/URLScanner.tsx#L2460)).

### 4e. Animated ring

[URLScanner.tsx:425-489](../packages/client/src/pages/URLScanner.tsx#L425-L489). SVG circle, `strokeDashoffset = circumference * (1 - score/100)`, ease-out-cubic over 1s. Pure visual — the displayed integer is `Math.round(score * eased)`.

### 4f. Severity counts shown above the issue list

Direct counts of `report.issues` filtered by severity. Color: error=red, warning=amber, info=blue ([URLScanner.tsx:260-272](../packages/client/src/pages/URLScanner.tsx#L260-L272)).

---

## 5. Letter grades and other ratings

### Security headers grade

[scannerService.ts:592-598](../packages/server/src/services/scannerService.ts#L592-L598). Counts presence of 6 headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

| Headers present | Grade |
|-----------------|-------|
| 6               | A+    |
| 5               | A     |
| 4               | B     |
| 3               | C     |
| 2               | D     |
| 0–1             | F     |

Missing CSP or HSTS becomes an `error`-severity issue; other missing headers become `warning`. Those issues then feed the `security` category score (4a), which is the entire Security bucket in the overall (4b).

### "What's working" positives

[scannerService.ts:1362-1408](../packages/server/src/services/scannerService.ts#L1362-L1408). Up to 3 of: security grade A/A+, lang attribute set, ≥90% link health (computed `Math.round(healthy/total*100)`), heading score >90, image score >90, page has title, viewport set, JSON-LD schema present, BreadcrumbList present.

### "Top priorities"

[scannerService.ts:1338-1359](../packages/server/src/services/scannerService.ts#L1338-L1359). Issues grouped by `ruleId`, sorted by severity (error → warning → info) then by count desc, top 3 returned with `(N instances)` suffix when count > 1.

### Crawl progress bar

[URLScanner.tsx:2760](../packages/client/src/pages/URLScanner.tsx#L2760). Pure progress: `width: (done/total)*100%`. No scoring involved.

### Link health %

[scannerService.ts:1373](../packages/server/src/services/scannerService.ts#L1373). `Math.round(healthy / total * 100)`. Surfaced only in the "what's working" list when ≥90.

---

## 6. End-to-end example

Scan finds:
- **images**: 2 errors, 1 warning → `100 - 30 - 5 = 65`
- **contrast**: 0 issues → `100`
- **headings**: 1 warning → `95`
- **landmarks**: 1 error → `85`
- **forms**: clean → `100`
- **structure**: clean → `100`
- **document**: 1 warning → `95`
- **schema**: 1 warning → `95`
- **security**: 4 of 6 headers present → grade B; 2 warnings counted → `90`
- **links**: 1 warning → `95`

Server intermediates:
- Accessibility = (65 + 100) / 2 = **82.5**
- Structure = (95 + 85 + 100 + 100) / 4 = **95**
- SEO = (95*2 + 95) / 3 = **95**
- Security = **90**
- Links = **95**

Server overall:
```
0.35*82.5 + 0.20*95 + 0.25*95 + 0.10*90 + 0.10*95
= 28.875 + 19 + 23.75 + 9 + 9.5
= 90.125 → round → 90
```

Frontend tiles (different aggregation):
- Accessibility tile = (65 + 100 + 100 + 85) / 4 = **88**  ← ≠ server's 82.5
- Structure tile = (95 + 100) / 2 = **98**
- SEO tile = **95**
- Security tile = **90**

Overall ring shows **90** in green (≥90). Accessibility tile shows **88** in amber (70–89). Same scan.

---

## 7. Known issues / things to revisit

1. **Frontend/server formula drift** (§4c). The Accessibility/Structure tiles can disagree with the bucket weights driving the overall ring. Either align the tile formula to the server's bucket math or surface 5 tiles (add Links).
2. **`performance` category** is computed but never enters the overall score. Currently dead weight unless something is downstream of `categoryScores`.
3. **No JS/CSS rendering.** SPA-heavy targets will look better than they are. Swapping to Playwright/Puppeteer would also break the 30s Vercel ceiling — needs design.
4. **Score is integer-rounded everywhere.** Two scans differing by <1 point look identical.
