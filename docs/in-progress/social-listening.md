# Topic Ideation (social listening for content ideas)

**Status:** Shipped behind an allowlist (`LISTENING_ALLOWLIST`, default: Eric only).
Migrations 009 and 010 are applied to rfp-prod. Internal planning notes (people, meeting notes, account
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

## Who counts (report version 2)

Every item gets two labels besides relevance: `about` (the topic is the main subject, not a
passing mention such as a bio line, a list of colleges or a landmark) and `speaker` (`person`,
`self` = the named institution's own accounts, `organization`, `media`). Only
`isPublicConversation` items (relevant, about, person, not a news article) feed sentiment,
subtopics, platforms, months, questions, quotes, idea evidence and the thin flag. The rest are
listed in Sources with a tag and counted in `totals.excluded`; a named institution's own posts
get their own section (`ownVoice`) with a one-line comparison; news outlets posting on social go
to "In the news".

Why: the first live scan of a small private college (Oct 2026) reported 35 relevant posts and +54
sentiment, but 6 of 9 quotes were the college's own Facebook posts, 2 of 6 questions came from
threads about other things, all 8 threads read in full were off topic ("COE" car permits, visa
forms), and one idea rested on a theme park thread. Rescanned under these rules: 4 posts by people,
flagged thin, no unsupported ideas. A general topic (FAFSA changes) kept a full report: 73 posts by
people, 6 ideas, 6 of 8 threads read in full on topic.

Other rules from that audit:
- Threads are read in full only after labeling, and only if labeled `about`; a read thread is
  relabeled on its full text.
- Each idea is rechecked against its cited posts (`verifyIdeas`); posts that do not support it are
  dropped, then ideas left with fewer than two.
- A question must end in "?" and have at least four words.
- Reddit `?tl=` translation links collapse to one thread; search-result pages (Yelp search,
  LinkedIn jobs) are never collected.
- Labels carry `v: 2`; older labels are relabeled on the next scan or Refresh analysis (no
  searches used). Version 1 reports show a banner offering that refresh.

## Ownership and sharing

Topics belong to the person who created them (`listening_topics.created_by`, the session email,
compared case-insensitively). `service.ts` scopes every call: the list shows only your topics, and
opening, rescanning, refreshing, cancelling or deleting someone else's topic answers 404, so its
existence never leaks. The Google daily allowance stays shared (one project-wide quota) and the
search cache is shared (search results, no user data).

The owner can share a topic (Share button, `POST /topics/:id/share`, migration 010 columns
`shared`, `shared_at`). A shared topic shows under "Shared with you" for everyone with access, who
can open it, export it and save its ideas (`role: "viewer"` in the detail response). Rescan,
refresh, delete, cancel and sharing stay with the owner; unsharing ends access at once. Saved
copies a teammate already made stay on their board.

## Idea board

`/listening/ideas`. Save on any idea card stores a frozen copy in `listening_saved_ideas`
(migration 010): headline, angle, audience, format, why now, outline, subtopic name and its
sources (link, platform, the verbatim quote or an excerpt, date). A rescan that rewrites a topic's
ideas never changes a saved copy, and deleting the topic keeps it (`topic_id` set null, the topic
name kept). One save per idea per person (`UNIQUE (created_by, fingerprint)`, fingerprint = topic
id plus normalized headline). Status: new, pitched, in progress, published, dropped. Each person's
board is their own. API: `GET/POST /ideas`, `PATCH/DELETE /ideas/:id`; the topic detail response
carries `savedIdeas` (report idea id to saved id) so Save shows as Saved.

## Export

Topic page, Export menu (`components/listening/exportReport.ts`): **PDF** (real text drawn with
jsPDF: selectable, searchable, every source a clickable link, page numbers), **Word** (`docx`,
editable, external hyperlinks, page numbers) and **Copy as text**. One builder (`exportBlocks`)
feeds both files in the page's reading order: summary and feeling, ideas with outlines and sources,
questions, subtopics, quotes, the institution's own posts, news, and how it was made. The PDF uses
the built-in Helvetica, so emoji and scripts it cannot draw are dropped from the PDF only
(`pdfSafe`); the Word file keeps them. File name: `Topic Ideation - <topic> - <report date>`.

## Honesty guarantees (enforced in code, see `listening/checks.ts`)

- Every count and percentage is computed from stored labels; model prose with numbers is dropped.
- A quote or question is shown only if it appears verbatim in fetched text, comes from a person's
  post mainly about the topic, and (questions) is a real question.
- An idea is shown only if at least two people's posts about the topic support it, confirmed by a
  second check; the number of ideas scales with the sample (2 for under 12 posts, up to 8).
- Questions and quotes come only from posts, comments and reviews (not news headlines or video
  titles).
- The institution's own posts, other organizations and news outlets never enter the figures.
- Failed or skipped sources are named in the report (grouped by reason); a thin sample says so.
- No em or en dashes in model text.

## Architecture

Engine `packages/server/src/listening/` (framework-free):

| Stage | File | Notes |
|---|---|---|
| Plan | `plan.ts` | Rewrites the topic into the audience's phrasings; quotes named entities and stores `entityName`; records what is off-topic |
| Search | `harvest.ts`, `sources/pse.ts`, `sources/serper.ts` | Site groups: Reddit, forums, social, reviews; plus YouTube comments and Google News |
| Label | `label.ts` | Per item: relevance, about vs passing mention, speaker, sentiment toward the topic, subtopic, audience, verbatim question and quote |
| Read | `harvest.ts` (`pickThreads`, `deepRead`), `sources/reader.ts` | Threads labeled `about`, in full with replies, then a second short labeling pass; Reddit via the Arctic Shift archive when `LISTENING_REDDIT_ARCHIVE=true` |
| Group | `cluster.ts` | Up to 8 subtopics, stable names across rescans |
| Write | `synthesize.ts` | Summary, own-voice note, subtopic notes, ranked questions, ideas with evidence, then `verifyIdeas` |
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

- `cd packages/server && npx vitest run src/listening`: 71 tests (engine scenarios with fakes:
  rescan, cancel, partial failures, hung database, Google-to-Serper fallback, fabricated quotes,
  passing mentions, an institution's own posts, unsupported ideas, relabeling old labels, one
  user never seeing or touching another's topics, sharing read only, the idea board).
- `cd packages/client && npx playwright test e2e/topic-ideation.spec.ts`: 20 tests on fixtures,
  including downloading the PDF and Word exports and checking their text and links, sharing, a
  teammate's read-only view, and saving to and working the idea board.
  `KEEP_EXPORTS=<dir>` keeps the downloaded files for a visual check.
- `SHOTS=<dir> npx playwright test e2e/topic-ideation.visual.spec.ts`: desktop and phone, light and dark.
- Live: `npx tsx src/listening/cli.ts "<topic>" --rescan` runs the real engine against a memory
  store; `npx tsx src/listening/probe.ts` checks every source.

## Open

- crawl4ai as an optional fallback reader: decision pending; see [crawl4ai-option.md](crawl4ai-option.md).
- Scheduled rescans and alerts: not built.
- Widening an existing topic's time range in place (today: start a new search with a longer range).
- "People also ask" from Serper responses as their own section, once Serper is funded.
