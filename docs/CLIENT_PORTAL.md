# Client Portal (public Image Toolkit)

Shipped to production 2026-09-10 (main 786f0ea). Clients invited by Stamats
staff get the Image Toolkit at https://ai.stamats.com/portal and nothing else.

## How staff use it

1. Open **Client Portal** from the Home tile or the nav rail (`/portal-admin`).
   Any signed-in Stamats user can do this; no admin role needed.
2. Pick a client (the Client Portfolio list) or add a new one.
3. **Invite** by email. The invitation is emailed from noreply@stamats.com via
   Resend with a link that expires in 7 days; the same link is shown with a
   copy button so you can send it yourself. Resend and Revoke/Restore are
   per person.
4. Optional **whole institution access**: approve an email domain (for
   example `coe.edu`). Anyone signing up at `/portal/signup` with that domain
   gets a link and lands in that client's workspace. `stamats.com` is refused.

## What clients get

- Sign in at `/portal/login` (forgot password at `/portal/forgot`).
- The full Image Toolkit: convert (PNG/WebP/JPEG, quality, width/height),
  crop with presets, magic eraser, background removal, AI enhance, AI alt
  text, batch rename, multi-size export, ZIP. Capture-from-URL is hidden.
- **My Uploads**: their organization's stored images. "Save to My Uploads"
  and "Save all" in the toolkit; upload, open in toolkit, download, delete
  on the My Uploads page.
- A help button that answers questions about using the toolkit only.

## Isolation, by construction

- Portal accounts live in `portal_users`, never in `users`. Sign-in is
  `POST /api/portal/auth/login` only. The `portal-session` cookie is signed
  with `SESSION_SECRET|portal`, so api/index.ts cannot read it: every
  internal route answers 401 to a portal session.
- `/api/portal/*` is its own Vercel function (`api/portal.ts`, rewrite in
  vercel.json ahead of the catch-all). Staff-only routes under
  `/api/portal/admin/*` require the internal `rfp-session` cookie and the
  app's CSRF header. Portal mutations require `x-portal-request: 1` and a
  same-host Origin; cookies are SameSite=Lax.
- Every portal query is scoped by the client id in the session. Files live
  in the private bucket `portal-images` under `<clientId>/<uuid>.<ext>` and
  are served only through server-signed URLs (1 hour; downloads 10 min).
- Frontend: `/portal` routes render without NavRail, CommandPalette,
  KeyboardShortcuts, NewEntryPanel or AICompanion; AuthContext skips its
  staff-login redirect on portal paths.
- Rate limits per IP: 600 requests / 15 min overall, 30 login attempts,
  20 sign-ups, 20 forgot requests; per user: 300 uploads, 120 alt texts,
  60 enhances, 60 help messages per 15 min (in-memory, per instance).

## Tables and storage

Migration `packages/server/migrations/008_client_portal.sql` (rollback
`_DOWN.sql`), applied with `node scripts/apply-migration.mjs`. Tables
`portal_users`, `portal_client_domains`, `portal_images`, all
`REFERENCES clients(id) ON DELETE CASCADE`, RLS enabled with no policies
(server bypasses as owner, PostgREST blocked). Bucket created by
`node scripts/portal-bucket.mjs` (idempotent).

## Environment (stamats/rfp on Vercel)

- `RESEND_API_KEY`, `PORTAL_EMAIL_FROM` (all targets, added 2026-09-10).
  Without the key, invites are not emailed and the admin page says so; the
  copy link still works.
- `REPLICATE_API_TOKEN`: present on Preview and Development, **missing on
  Production** as of 2026-09-10 (the legacy project's value is stored
  sensitive and cannot be read back). Until it is added, AI Enhance on
  production answers "Enhance isn't configured yet. Tell your Stamats
  contact." Everything else works.
- Uses the existing `OPENAI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Code map

- `api/portal.ts`: the function (auth, invites, domains, images, AI, help).
- `packages/client/src/lib/toolkitApi.tsx`: context that points the
  toolkit at `/api/ai` (internal) or `/api/portal/ai` (portal), plus the
  module-level hand-off queue for "Open in toolkit".
- `packages/client/src/pages/portal/`: `PortalShell` (layout, tabs, save to
  library), `PortalLibrary` (My Uploads), `PortalHelpFab`,
  `PortalAuthPages` (login, signup, forgot, invite/reset accept).
- `packages/client/src/contexts/PortalAuthContext.tsx`: portal session state.
- `packages/client/src/pages/PortalAdmin.tsx`: staff page.
- `packages/client/src/pages/ImageConverter.tsx`: portal-mode switches
  (header and Capture-from-URL hidden, Save to My Uploads, queue drain).
- `scripts/portal-e2e-cleanup.mjs`: removes the smoke fixtures.

## Testing notes

- Preview deployments on this project are unprotected, so the branch preview
  is the place for end-to-end runs against the shared production DB.
- For fast iteration on the toolkit, run the client Vite dev server with its
  `/api` proxy pointed at a preview URL and the proxy rewriting the `Origin`
  header to that URL (portal mutations check Origin against Host). Do not
  commit that proxy change.
- The app's `PageTransition` remounts the route subtree on navigation. State
  that must survive a navigation cannot live in a component under it.
- Run the login rate-limit probe last; it locks your IP out of that function
  instance for 15 minutes.
- No Express twin exists for `/api/portal/*` yet; local `npm run dev` does
  not serve the portal API. `scripts/check-route-drift.mjs` counts
  `api/portal.ts` as production so a future twin will not be flagged.

## Verification record (2026-09-10)

Preview of branch client-portal (Vercel, no protection), shared rfp-prod DB.
Throwaway fixtures: staff user portal.smoke@stamats.com, clients "Portal
Smoke College" and "Portal Smoke Two", users eyerke+portal@gmail.com and
eyerke+portal2@gmail.com, domain smokecollege.edu. All removed afterwards by
`scripts/portal-e2e-cleanup.mjs`.

Passed:
- Staff: sign in, Client Portal tile on Home, /portal-admin lists all
  clients, create client, invite (Resend accepted, link shown), approve
  domain (stamats.com and malformed domains rejected), duplicate client and
  cross-client email rejected.
- Client: invite link opens, weak password rejected, token single-use,
  account created, lands on /portal. Shell shows only the toolkit, My
  Uploads, user, sign out and the help button. No nav rail, Stamats Lab
  chrome, Ask AI, AI companion or Capture-from-URL.
- Toolkit: file added, AI alt text via /api/portal/ai/alt-text, Save to My
  Uploads stored a WebP, My Uploads lists it over a signed URL, Enhance
  (denoise) created, processed, succeeded and returned a PNG through the
  portal proxies (preview has a Replicate token; production does not yet).
- Help button: answers a toolkit question, refuses an off-topic one.
- Isolation: client one gets 404 on client two's image (download and
  delete); portal cookie gets 401 on every internal route tried (clients,
  proposals, topics, photos, migration, graphics, internal alt text) and on
  /api/portal/admin; staff cookie gets 401 on portal routes; storage object
  without signature 400, public path 400.
- Auth: forgot returns the same generic answer for known and unknown
  addresses, reset link resolves as reset, sets a new password, is single
  use; login rate-limits after 30 failures per IP; sign out redirects to
  /portal/login and guarded routes redirect while signed out.
- Domain sign-up: unapproved domain 403, approved domain creates an invited
  user and emails the link.

Bugs found and fixed during the run:
- Open in toolkit from My Uploads: first the toolkit's async session restore
  replaced the handed-in file (a1f449b), then the real cause: the app's
  PageTransition remounts the route subtree on navigation, so React state
  in the shell was gone before the toolkit mounted. Files now go through a
  module-level queue in lib/toolkitApi.tsx that the toolkit drains after
  its session restores (786f0ea). Debugged with a local Vite front end
  proxied to the preview API (proxy rewrites Origin; not committed).
- Added "Save all N to My Uploads" for batches (321fe60); verified rename
  flows into stored filenames (campus-tour-1.webp, campus-tour-2.webp).

Confirmed for Eric: portal mode keeps every toolkit option (Batch Rename with
base name, start number, zero-pad and separator; PNG/WebP/JPEG; width,
height, quality; presets in Crop; multi-size export; ZIP; alt text).

## History: the Image Optimizer detour (2026-09-10 morning)

## Findings about the Image Optimizer app (2026-09-10, morning)

- Data app Image Toolkit: route `/convert`, `packages/client/src/pages/ImageConverter.tsx`
  (2,806 lines). Everything runs in the browser except `POST /api/ai/alt-text`
  (OpenAI) and `/api/ai/enhance*` (Replicate). No server storage; state lives in
  localforage. Production lacks `REPLICATE_API_TOKEN` (left on the legacy
  rfp-proposals Vercel project at the July consolidation), so AI Enhance
  returns 503 on ai.stamats.com.
- Data app auth: own `users` table, session cookie, login limited to
  @stamats.com, one global write gate in `api/index.ts`. No tenant concept.
  Public users here would share the origin, the session cookie, and the
  9,000-line API entry with proposals, client success, webinar registrants
  and the do-not-contact list.
- A finished multi-tenant version of this exact tool already exists:
  `~/Desktop/Apps/Image Optimizer`. Live at https://images.stamats.com
  (Vercel project `images`, Stamats team; deployment matches its main at
  4199b5f, 2026-08-14). Separate Supabase project `plojlvardkmrcnfeuucd`
  with 13 tables, 44 RLS policies, storage bucket `images` scoped by client
  slug. Invitation lifecycle with 7-day tokens via edge functions
  `create-invite`, `send-invite-email` (Resend), `accept-invite`, and a
  copy-link fallback. Staff self-register with @stamats.com. Client login
  lands on `/clients/<slug>` then Library, Upload, Optimize, Stock. Its
  SOURCE_MAP.md records that it was built by adapting ImageConverter.tsx.
- Gap in Image Optimizer versus the toolkit: no background removal, no magic
  eraser, no AI enhance. It does have crop, smart crop, HEIC import, alt
  text, ZIP export, naming templates, approvals.

## Options

- A. Use Image Optimizer as-is. Add the three missing editing tools there as
  a follow-up. Recommended: isolation by architecture, already live.
- B. Image Optimizer shell (auth, invites, storage) with the freeform toolkit
  as the client landing surface instead of the content-block Optimize flow.
- C. Build tenancy into the data app. Not recommended: isolation would rest
  on allowlist discipline inside one shared API entry.

## Decision (2026-09-10, Eric)

Option A. Use Image Optimizer as-is. Do not build client accounts, invites or
tenant storage into this data app. Follow-up: port background removal, magic
eraser and AI enhance from `ImageConverter.tsx` into the Image Optimizer.

## Verified live on 2026-09-10

- Deployment on images.stamats.com matches Image Optimizer main (4199b5f).
  Supabase project awake; all 10 edge functions ACTIVE; secrets include
  RESEND_API_KEY, EMAIL_FROM, APP_ORIGIN; auth SMTP is smtp.resend.com;
  site_url is https://images.stamats.com.
- RLS enabled on all 14 public tables with policies. Upload policy scopes
  writes to the caller's own client folder.
- Client login path: RootGate sends client members to /clients/<slug>
  (portal with Upload, Optimize, Library, Stock). Agency staff see the
  agency dashboard. Nothing from this data app is reachable there.
- Live invite test: create-invite + send-invite-email as owner for
  eric.yerke@stamats.com on Test Client succeeded (Resend id
  62acaaa1-ed24-4ecf-9661-7cd45f306bb7, expires 2026-09-17). Copy-link
  fallback also exists in the Settings team panel.

## Gap found and fixed (2026-09-10)

The `images` storage bucket is public and its SELECT policy granted the
public role listing of the whole bucket, so the anon key in the browser
could enumerate every client's folders and file names. Fixed on production
and recorded as `supabase/migrations/20260910000000_storage_select_members.sql`
in the Image Optimizer repo: listing now requires membership of that client
or agency staff. Bucket stays public (UUID object names, direct links and
thumbnail transforms unchanged). Verified: anon listing returns 0, downloads
and render transforms 200, owner listing works.

Residual: anyone holding a direct link can open that image (unlisted model).
A fully private bucket needs signed URLs across uploads, thumbnails, outputs
and the no-login mobile approval page. Not scheduled.

## Reviewer invites (2026-09-10, Eric: "everybody in Stamats should have privilege to invite users")

Shipped in the Image Optimizer repo as commit 2f20615 (functions
create-invite v5 and list-pending-invites v2 deployed). Any accepted agency
member, including the reviewer role self-registration grants, can invite
client users and see pending client invites. Agency-member invites stay
owner/admin. Proven on production with a throwaway reviewer (201 on client
invite, 403 on agency invite), then cleaned up.

## Approved follow-ups (2026-09-10)

1. Help-only AI assistant in the client tool: floating button, chat panel,
   server route whose only knowledge is the app's help topics, refuses
   anything else, signed-in users only, no data access. The data app's AI
   companion is unrelated and unreachable to clients.
2. Per-client domain join: staff set allowed email domains on a client;
   anyone signing up with that domain lands in that workspace via the same
   trigger mechanism that provisions stamats.com staff. Individual invites
   remain.

## Housekeeping before inviting real clients

- Archive test workspaces on production: `test-client`, `new-client-test-3`.
- Remove `https://app.stamats.com/**` from the Supabase auth redirect allow
  list (legacy hostname).
- Owner password sits in plain text in the Image Optimizer's
  PRODUCTION_STATUS.md and CREDENTIALS.md; rotate before wider rollout.

## Files touched

- This data app: docs only (this file, docs/IN_PROGRESS.md).
- Image Optimizer repo: `supabase/migrations/20260910000000_storage_select_members.sql` (uncommitted).
