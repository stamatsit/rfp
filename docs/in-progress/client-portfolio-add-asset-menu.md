# Client Portfolio — Add Asset Menu

**Status:** Built and type-clean. **Uncommitted on `main`.** Not interactively verified in the browser yet.
**Owner:** Eric Yerke
**Built:** 2026-05-12

---

## What it does

Adds an admin-gated "Add" dropdown to the top of the Assets tab on a client's portfolio page. The dropdown opens four asset types — Testimonial, Case Study, Award, Top-line Result — and each opens the existing `NewEntryPanel` with the client name pre-filled. After save, the new asset appears in its section without a page reload.

Closes the obvious UX gap where the Client Portfolio was effectively read-only — to add a single testimonial you had to leave the client's page, navigate to `/testimonials`, add it there, and hope the client-name string matched.

## Files touched (all uncommitted)

- [packages/client/src/components/client-portfolio/ClientPortfolioContext.tsx](../../packages/client/src/components/client-portfolio/ClientPortfolioContext.tsx)
  - Extracted per-client load into a callable `loadClientProfile(clientName, cancelledRef)`
  - Exposed `refreshProfile()` and `refreshGlobalAssets()` on the selection context
- [packages/client/src/components/NewEntryPanel.tsx](../../packages/client/src/components/NewEntryPanel.tsx)
  - Added `defaultClient?: string` prop
  - On `isOpen` flip or `defaultClient` change, pre-fills the four client/org form fields (`csClient`, `resClient`, `testOrg`, `awardClient`)
- [packages/client/src/components/client-portfolio/ClientAssetsTab.tsx](../../packages/client/src/components/client-portfolio/ClientAssetsTab.tsx)
  - New `<ADD_OPTIONS>` constant with the 4 entry types
  - Admin-gated dropdown UI at the top of the assets list, with outside-click dismissal
  - Mounts a second `NewEntryPanel` instance when an option is picked
  - On save: refreshes per-client profile, refreshes global asset lists, dispatches the existing `new-entry-saved` window event so other listeners stay in sync

## Behavior

- **Non-admin users**: no Add button rendered at all (admin-gating is *hide*, not *disable*, matching the rest of the app)
- **Admin**: Add dropdown shows in the top-right of the Assets tab. Click → 4 options. Pick one → existing `NewEntryPanel` opens with `defaultType` set and the active client pre-filled in the relevant field. Submit → asset appears in its section.

## Verified

- TypeScript clean across all three changed files (other unrelated TS errors exist in `MagicEraser.tsx`, `useInpainting.ts`, `telea.ts` — pre-existing, not introduced)
- Dev server boots without compile errors

## Not yet verified

- End-to-end click-through in the browser as an admin user. Plumbing is sound but the interactive flow (open dropdown → pick option → see panel pre-fill → submit → asset appears) hasn't been manually exercised.
- If refresh doesn't appear to happen post-save, suspect [ClientPortfolioContext.tsx:344-366](../../packages/client/src/components/client-portfolio/ClientPortfolioContext.tsx#L344-L366) — the `mergedData` memo's dep array may need `dbTestimonials`/`dbAwards`.

## What this does NOT solve

Adding an asset still uses **client-name string matching** under the hood, not a foreign key. Renaming a client still orphans their assets. That's a separate cleanup (upgrade #3 from the original list). This feature is the smallest-unit-of-shippable-value: "let me add a testimonial from a client's page." The FK refactor is a follow-up.

## Related work

- [active-clients-source-of-truth.md](active-clients-source-of-truth.md) — the next architectural change to Client Portfolio. Its Add/Edit modal additions (status field + email domains) will need to merge cleanly with the current uncommitted state. Coordinate.
