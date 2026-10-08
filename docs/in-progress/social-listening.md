# Topic Ideation (social listening for content ideas)

**Status:** Shipped behind an allowlist (`LISTENING_ALLOWLIST`, default: Eric only).
Migration 009 is applied to rfp-prod. Internal planning notes (people, meeting notes, account
details, keys) are kept outside this public repo.

## What it is

Search any topic or institution ("online nursing degree", "college enrollment trends",
"Coe College") and get, from a meaningful sample of public conversation:

- sentiment, computed from per-post labels
- the subtopics the conversation breaks into
- questions people ask, word for word, each linked
- standout quotes, word for word, each linked
- ranked content ideas, each citing at least two real posts
- every source, filterable

A topic is a saved search. **Rescan** adds new posts and digs one page deeper; only new items
are read and labeled; the report is rebuilt over everything collected and marks what is new.

## Honesty guarantees (enforced in code, see `listening/checks.ts`)

- Every count and percentage is computed from stored labels; model prose with numbers is dropped.
- A quote or question is shown only if it appears verbatim in fetched text.
- An idea is shown only if at least two relevant posts support it; the number of ideas scales
  with the sample (2 for under 12 posts, up to 8).
- Questions and quotes come only from posts, comments and reviews (not news headlines or video
  titles).
- Failed or skipped sources are named in the report (grouped by reason); a thin sample says so.
- No em or en dashes in model text.

## Architecture

Engine `packages/server/src/listening/` (framework-free):

| Stage | File | Notes |
|---|---|---|
| Plan | `plan.ts` | Rewrites the topic into the audience's phrasings; quotes named entities; records what is off-topic |
| Search | `harvest.ts`, `sources/pse.ts`, `sources/serper.ts` | Site groups: Reddit, forums, social, reviews; plus YouTube comments and Google News |
| Read | `sources/reader.ts` | Most-discussed threads in full; Reddit via the Arctic Shift archive when `LISTENING_REDDIT_ARCHIVE=true` |
| Label | `label.ts` | Per item: relevance, sentiment, subtopic, audience, verbatim question and quote |
| Group | `cluster.ts` | Up to 8 subtopics, stable names across rescans |
| Write | `synthesize.ts` | Summary, subtopic notes, ranked questions, ideas with evidence |
| Assemble | `report.ts`, `metrics.ts` | All figures computed here |
| Store | `store.ts` | Postgres (`prepare: false`, required behind the Supabase transaction pooler), memory store for tests |

API: `routes/listening.ts` (local Express) and `api/listening.ts` (Vercel, `maxDuration` 300),
both thin adapters over `listening/service.ts`. Progress streams as server-sent events; a scan
keeps running if the browser leaves, and Cancel stops it (in-process immediately, across Vercel
instances via a database flag). A partial unique index allows one running scan per topic.

Client: `/listening/:topicId?`, `pages/TopicIdeation.tsx`, `components/listening/**`,
`hooks/useScan.ts` (module-level store so a scan survives the app's pathname-keyed remounts),
`lib/listeningApi.ts`.

## Search providers

- **Google Programmable Search** works only with a key from a project that had the Custom Search
  JSON API before Google closed it, and only with an engine created before the closure (new
  engines answer briefly, then return 404). The API shuts down **2027-01-01**. Free quota is a
  hard 100 queries/day; a full scan uses about 17 to 24.
- **Serper** (`SERPER_API_KEY`): Google results, about $1 per 1,000 searches.
- `LISTENING_SEARCH`: `auto` (default: Google first, Serper behind it; a hard Google failure moves
  the rest of the run to Serper), `google`, or `serper`. Coverage records `searchCalls` (Google)
  and `serperCalls` separately; the daily-allowance refusal is skipped when Serper is configured.

## Environment

| Variable | Purpose |
|---|---|
| `GOOGLE_PSE_API_KEY`, `GOOGLE_PSE_ENGINE_ID` | Google search (engine defaults to the one in `config.ts`) |
| `SERPER_API_KEY` | Serper search |
| `YOUTUBE_API_KEY` | YouTube videos and comments |
| `OPENAI_API_KEY` | Analysis (model from `lib/aiModels.ts`) |
| `LISTENING_REDDIT_ARCHIVE` | `true` to read Reddit threads through Arctic Shift |
| `LISTENING_SEARCH` | `auto` / `google` / `serper` |
| `LISTENING_ALLOWLIST` | comma-separated emails; unset = Eric only |
| `LISTENING_DATABASE_URL` | local dev only: point just this tool at rfp-prod |

## Verification

- `cd packages/server && npx vitest run src/listening`: 55 tests (engine scenarios with fakes:
  rescan, cancel, partial failures, hung database, Google-to-Serper fallback, fabricated quotes).
- `cd packages/client && npx playwright test e2e/topic-ideation.spec.ts`: 10 tests on fixtures.
- `SHOTS=<dir> npx playwright test e2e/topic-ideation.visual.spec.ts`: desktop and phone, light and dark.
- Live: `npx tsx src/listening/cli.ts "<topic>" --rescan` runs the real engine against a memory
  store; `npx tsx src/listening/probe.ts` checks every source.

## Open

- crawl4ai as an optional fallback reader: decision pending; see [crawl4ai-option.md](crawl4ai-option.md).
- Scheduled rescans and alerts: not built.
