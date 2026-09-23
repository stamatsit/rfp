# Screenshot library, run cap and re-scan guard

Image Toolkit's "Capture from URL" tool (`SitemapCaptureModal`) takes full-page
screenshots through ScreenshotOne using one shared key on the Basic plan
(2,000 captures a month, 40 a minute). Shipped 2026-09-23. Three rules keep
that budget honest.

## The rules

- **50 pages per run, hard block.** `MAX_PAGES_PER_RUN` in
  `packages/client/src/lib/screenshotCaptureRules.ts`. Counted as unique pages
  after URL normalization, not captures, so 50 pages at "both" viewports is
  100 captures. Applies to the sitemap tree path and the manual paste path. The
  footer explains the overage and the Capture button is disabled.
- **Every capture is stored.** Bytes go to the PRIVATE Supabase Storage bucket
  `screenshots`; one row per capture in `screenshot_captures` (migration 008).
  Images are served through `GET /api/screenshot/captures/:id/image`, never by a
  public bucket URL. Recording is best-effort: the PNG always goes back to the
  user, and the response carries `X-Capture-Stored` plus `X-Capture-Id` so the
  modal can flag "not saved to library" on a miss.
- **Already-captured pages are flagged, not hidden.** The tree fetches
  `GET /api/screenshot/history?domain=` (most recent capture per page and
  viewport, team-wide) and shows a "captured 3d ago D" badge, folder counts like
  "(69, 12 captured)", a progress strip, and a Library list with open links.
  Folder, group and select-all fills skip captured pages for the chosen
  viewport; a checkbox includes them; clicking one page directly always selects
  it, and a set that is entirely captured fills in full.

## Where things live

| Piece | File |
|---|---|
| Cap, URL key, history index, skip filter (pure, tested) | `packages/client/src/lib/screenshotCaptureRules.ts` |
| Modal | `packages/client/src/components/SitemapCaptureModal.tsx` |
| Express route: capture + record, history, image | `packages/server/src/routes/screenshot.ts` |
| Storage key, PNG dimensions, URL key (server copy, tested) | `packages/server/src/lib/screenshotLibrary.ts` |
| Drizzle table | `screenshotCaptures` in `packages/server/src/db/schema.ts` |
| Migration | `packages/server/migrations/008_screenshot_captures.sql` (+ `_DOWN.sql`) |
| Bucket creation (one-off, dry run by default) | `scripts/create-screenshots-bucket.mjs` |
| Vercel bundle | `api/index.ts`: inline helpers before the multipart parser, the two GET routes right before the POST screenshot route, and the record call inside it |

The bundle reads and writes `screenshot_captures` through raw `queryClient`
template literals (same convention as mm_* and client_success_*); the
`pgTable` const is not registered in the bundle's Drizzle schema. Keep the
inline helpers in step with `screenshotLibrary.ts`.

**URL key** for dedupe: lowercase scheme and host, strip `www.`, strip the
hash, strip a trailing slash except at root, keep path case and query.
**Storage key**: `<domain>/<yyyy-mm>/<slug>-<viewport>-<yyyymmddThhmmss>-<sha1 8>.png`.

## Operations

- ScreenshotOne key: `SCREENSHOTONE_ACCESS_KEY` on Vercel (production and
  preview are stored sensitive, so the dashboard cannot show them) and in
  `packages/server/.env`. The secret key is stored but never read: requests are
  unsigned. Missing access key silently falls back to Microlink's free tier.
- Quota check that costs nothing: `GET https://api.screenshotone.com/usage?access_key=...`.
- Migration 008 and the bucket exist on rfp-prod and on the kwre dev project.
- GET routes are open to every logged-in user; POST /screenshot is in the
  bundle's non-admin write allowlist.

## Known gaps

- Quick Select group checkbox: the row and its `TriStateCheckbox` both call the
  toggle and the checkbox does not stop propagation, so clicking exactly the
  checkbox toggles twice and does nothing. Clicking the label works. Pre-dates
  this feature; one-line fix (`stopPropagation`) not yet made.
- No server-side per-user daily cap, and the modal does not yet show the
  ScreenshotOne remaining monthly quota. Both were noted, neither asked for.
- The four capture loops in the modal (run, retry failed, retry one, manual
  batch) share `captureViaApi` but still duplicate their pool logic.
