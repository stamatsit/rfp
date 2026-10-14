# Topic Ideation (social listening for content ideas)

**Status:** Shipped behind an allowlist (`LISTENING_ALLOWLIST`, default: the soft-launch list in
`listening/access.ts`). Everyone on it sees every scan (team visibility, since 2026-10-14).
Migrations 009 to 014 are applied to rfp-prod (012 drafts, 013 thumbs and 014 words to leave
out on 2026-10-14, before the code that reads them shipped). Internal planning notes (people, meeting notes, account
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

## Ownership, visibility and sharing

**Team visibility (the default since 2026-10-14).** Everyone with access can open, export and save
ideas from every topic anyone has scanned, read only (`seesEveryTopic` in `listening/access.ts`).
The home page lists them as "Everyone's topics" with each owner; nothing is labeled private or
shared, and the Share button is hidden, since everyone already sees everything. Rescan, refresh,
delete and cancel stay with the person who ran the scan, and each person's idea board stays their
own. `access` and the topic detail return `visibility: "team"`. Setting
`LISTENING_VISIBILITY=private` brings back the rules below without a code change.

Under private visibility, topics belong to the person who created them (`listening_topics.created_by`, the session email,
compared case-insensitively). `service.ts` scopes every call: the list shows only your topics, and
opening, rescanning, refreshing, cancelling or deleting someone else's topic answers 404, so its
existence never leaks. The Google daily allowance stays shared (one project-wide quota) and the
search cache is shared (search results, no user data).

Under private visibility, admins (`listening/access.ts`, default Eric, `LISTENING_ADMINS` overrides)
can open and export every topic anyone has scanned, private ones included, and see who ran each scan; read only, like
a shared topic. The topic list returns them a `team` list (everyone else's topics) shown as
"Everyone's topics" with each owner and whether it is shared. Deleted topics are hard deleted, so
an admin does not see those.

Who ran each scan: `listening_runs.created_by` is returned on every run (`RunSummary.createdBy`)
and shown in the scan history, on admin topic cards, and in exports.

The owner can share a topic (Share button, `POST /topics/:id/share`, migration 010 columns
`shared`, `shared_at`). A shared topic shows under "Shared with you" for everyone with access, who
can open it, export it and save its ideas (`role: "viewer"` in the detail response). Rescan,
refresh, delete, cancel and sharing stay with the owner; unsharing ends access at once. Saved
copies a teammate already made stay on their board.

## Topic library

`components/listening/TopicLibrary.tsx`, the saved topics on the home page, built to stay usable at
a hundred scans. One list at a time behind tabs (Your topics, then Shared with you, or Everyone's
topics for an admin), each with its count. Every card and line shows the topic's time range, so the
same topic scanned over two ranges can be told apart.

- Fewer than 7 topics in a tab: the plain card grid, newest first, no controls.
- From 7: a filter box (every word typed must appear in the topic, its summary, its range or its
  owner's name), a sort (newest, A to Z, most posts, most positive, most negative) and a
  cards/list switch. In the tabs that hold other people's topics, a person picker with counts.
- From 13: the compact list is the default view. Either view shows 24 at a time with Show more.
- Controls only act while they are on screen, so a filter typed in a long tab never hides topics
  in a short one.
- The view and sort are remembered in the browser (`localStorage`); the tab, filter and depth last
  for the visit (`sessionStorage`), so coming back from a topic lands on the same list.

Filtering and sorting run in the browser over what `GET /topics` already returns (list rows carry
no report). The server caps that at 200 of your own and 500 of other people's; past that the list
needs server-side paging.

## The page (redesign, 2026-10-14)

Built for repeat use by a content team: type a topic, wait, read, pick ideas, draft, export.

- **Home** (`ListeningHome.tsx`). A first visit gets the welcome, what the tool does and example
  topics. Once anyone has scanned, the page leads with the search box, a meter of today's shared
  allowance ("About 3 scans left today", amber at one, red at none) and the topic library. Scan
  stays enabled with an empty box and says to type a topic, instead of looking broken.
  "Topics" and "Idea board" are the tool's two places, as tabs at the top of both pages.
- **Topic page** (`TopicView.tsx`). Tabs: Overview, Ideas, Questions, Quotes, Subtopics, Sources.
  The tab and an open idea live in the address (`?tab=ideas&idea=idea3`), so a reload, a pasted
  link or Back lands in the same place; a tab change always closes the idea panel. Overview is a
  one-screen digest: the summary and feeling, the top three ideas, the top five questions, three
  quotes (strongest feelings first), subtopic bars coloured by feeling, where the sample came
  from, and the institution's own posts and the news, each with "See all" into its tab. On a real
  124-post report the overview is about 3,500 px tall on a phone, against about 14,000 px for the
  old single page.
- **Header actions**: Export (the primary action, for everyone), Update (owner only: "Rescan for
  new posts" with its cost in searches and the scans left today, "Rewrite the analysis" with no
  searches, "Scan another time range") and More (Delete). Share appears only when topics are
  private by default (`LISTENING_VISIBILITY=private`).
- **Ideas** are a compact list (headline, angle, format, audience, posts, subtopic, drafts written)
  with thumbs and Save on each row and audience filters. A row opens the **idea panel**
  (`IdeaPanel.tsx`, a Radix Dialog side panel, full screen on a phone): angle, why now, Save,
  thumbs, Copy idea, then tabs "Outline and posts", "Blog outline", "LinkedIn post", "Headlines".
  Previous and next (and the Left and Right arrow keys) step through the list, and the tab stays
  put, so writing headlines for every idea is one click each. Nothing is drafted until asked. A
  draft being written keeps going if you step away and back (`IdeaDrafts.tsx`). The idea board
  uses the same panel.
- **Questions** and **Quotes** (`report/Questions.tsx`, `report/Quotes.tsx`) filter by who asked
  and by feeling, and copy one or all (quotes with their links, for interview prep).
- **Idea board** (`IdeaBoard.tsx`): a column per status on wide screens (New, Pitched, In progress,
  Published; Dropped folded away below), a filtered list on narrow ones.
- **Long scans**: when a scan ends while the tab is in the background, the tab title says
  "Ready: <topic>" until you come back, and "Notify me when it's done" on the progress card turns on
  a browser notification (remembered; hidden where the browser blocks notifications).
- **Building blocks** (`primitives.tsx`): one button family, keyboard tabs (arrow keys, Home, End),
  chips, the side panel, Radix menus (arrow keys, typeahead, Escape), and text tones that pass
  WCAG AA contrast in both themes (secondary text is slate-500 in light, slate-400 in dark, never
  lighter). The panel and menus sit above the app's assistant button (z-index 950 and up).

## Idea board

`/listening/ideas`. Save on any idea card stores a frozen copy in `listening_saved_ideas`
(migration 010): headline, angle, audience, format, why now, outline, subtopic name and its
sources (link, platform, the verbatim quote or an excerpt, date). A rescan that rewrites a topic's
ideas never changes a saved copy, and deleting the topic keeps it (`topic_id` set null, the topic
name kept). One save per idea per person (`UNIQUE (created_by, fingerprint)`, fingerprint = topic
id plus normalized headline). Status: new, pitched, in progress, published, dropped. Each person's
board is their own. API: `GET/POST /ideas`, `PATCH/DELETE /ideas/:id`; the topic detail response
carries `savedIdeas` (report idea id to saved id) so Save shows as Saved.

## Working an idea: drafts, thumbs, more ideas

All three use the analysis model only and never a search.

**Drafts** (`listening/drafts.ts`, `components/listening/IdeaDrafts.tsx`, migration 012). From any
idea, in the idea panel on the topic page or the board: a **blog outline**, a **LinkedIn post** or
**headlines**, written from the idea and the posts saved with it. The content team writes its own
articles, so a blog gets an outline (notes for a writer, with the posts each section answers) and
never finished copy. Drafts hang off the saved copy of the idea (`listening_idea_drafts`, one per
kind per saved idea, removed with it), so drafting from a topic also saves the idea to the board,
and only once the draft exists: a failed draft leaves nothing behind. Opening a draft again costs
nothing; "Write another" asks once, then replaces it. Checks applied to every draft: a number
survives only if the idea or one of its posts contains it, quotation marks survive only around
words a post really contains, hashtags and dashes are stripped, and a draft too thin after the
checks is refused rather than shown. API: `POST /ideas/draft` with `{savedId}` or
`{topicId, ideaId}`, a `kind`, and `fresh` to replace.

**Thumbs** (`listening/taste.ts`, migration 013). Thumbs up or down on any idea in a topic you can
read; one vote per idea per person (`listening_idea_votes`), kept with a small copy of the idea so
it outlives a rescan or the topic. Votes change nothing on the page. They become a few lines of
guidance ("liked", "passed on") shown to the model the next time ideas are written for that
person: thumbs up and saved ideas count as liked, thumbs down as passed on, and an idea one person
liked and another passed on is left out. It is taste, never evidence, and nothing is trained on
it. API: `POST /ideas/vote` with `{topicId, ideaId, vote}` (1, -1, or 0 to clear).

**More ideas** (`writeMoreIdeas` in `synthesize.ts`, `moreIdeas` in `service.ts`). The owner can ask
for up to 4 more ideas at a time (24 a topic) written from the posts already collected, each a
different angle from the ones the topic has. Every new idea goes through the same second check
against its cited posts as a scan's ideas; if that check cannot run, nothing is added, and when no
further idea holds up the page says so. Not available while a scan runs, and discarded if the
report changed meanwhile. A rescan or refresh rewrites the topic's ideas, added ones included;
saved copies stay. API: `POST /topics/:id/ideas/more`.

## Export

Topic page, Export menu (`components/listening/exportReport.ts`): **PDF** (real text drawn with
jsPDF: selectable, searchable, every source a clickable link, page numbers), **Word** (`docx`,
editable, external hyperlinks, page numbers) and **Copy as text**. One builder (`exportBlocks`)
feeds both files in the page's reading order: summary and feeling, ideas with outlines and sources,
questions, subtopics, quotes, the institution's own posts, news, and how it was made. The PDF uses
the built-in Helvetica, so emoji and scripts it cannot draw are dropped from the PDF only
(`pdfSafe`); the Word file keeps them. File name: `Topic Ideation - <topic> - <report date>`.

## Time ranges

`listening/window.ts`. A topic is scanned over a preset (past 24 hours, week, month, 3 months,
year, or any time) or a fixed custom range (`time_window = 'custom'` with `window_from` and
`window_to`, migration 011). `resolveWindow` turns the choice into what each source takes: Google
`dateRestrict` for presets and the date sort (`sort=date:r:YYYYMMDD:YYYYMMDD`) for a fixed range,
Serper `tbs`, YouTube `publishedAfter`/`publishedBefore`, Google News `when:Nd` or
`after: before:`. Search engines apply presets themselves and their snippet dates are approximate,
so a dated search hit is only checked against a fixed range; a reply carries its own exact date and
is left out when older than any range. Undated items are kept; a day of slack absorbs time zones.
What was left out is named in the report notes. A topic keeps the range it was created with; "Scan
another time range" in the topic menu starts a new scan of the same topic (`/listening?q=`).

## Words to leave out

`listening/exclude.ts`, migration 014 (`listening_topics.exclude_terms`). Up to eight words or
phrases, set on the search form ("Leave out words") when a topic is first scanned and kept with
it, so every rescan leaves them out too. Two things happen:

1. Every search (Google, YouTube, Google News) carries them as leave-out operators (`-word`,
   `-"two words"`), added at search time so the stored phrasings stay clean, and the planner is
   told not to write searches about them.
2. Anything collected that still mentions one is dropped before it is stored, replies included,
   and a post whose full text turns out to mention one is marked not relevant without asking the
   model (`labels.leftOut`). This is the guarantee: no post that mentions an excluded word, as a
   whole word or phrase in any letter case, is counted. A simple plural counts ("sport" matches
   "sports"); a singular is never guessed ("news" does not match "new").

It is about the words and nothing looser. The labeler is deliberately not told the list: asked to
also drop posts "mainly about" those words, it dropped 15 to 30 percent of unrelated posts in a
test on a real topic. A word that is part of the topic itself is refused. The topic's header, "How
this was made", the exports and the library all say what a topic leaves out, and "Scan another
time range" carries the list to the new scan (`/listening?q=...&x=...`).

## Team usage

`GET /usage` (`service.usage`): today's scans (the shared Google allowance resets at midnight
Pacific) and a seven-day tally per person, shown under "Who has scanned?" on the home page.
Refreshes use no searches and are left out. A private topic's name shows only to its owner and
admins; teammates see "a private topic".

## Sources export

Export menu, "All sources (spreadsheet)": `GET /topics/:id/sources` returns every relevant post
with its stored text (up to about 1,800 characters a post) and labels; the browser writes a CSV (link, platform, date, counted or why not,
feeling, subtopic, title, text) for deeper analysis in another tool. Cells that start like a
formula are prefixed with an apostrophe, since post text comes from the open web. "Copy source
links" copies the links of the posts counted in the report.

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
| `LISTENING_ALLOWLIST` | comma-separated emails; unset = the list in `listening/access.ts` |
| `LISTENING_ADMINS` | comma-separated emails; unset = Eric |
| `LISTENING_VISIBILITY` | `team` (default: everyone sees every topic) or `private` |
| `LISTENING_DATABASE_URL` | local dev only: point just this tool at rfp-prod |

## Verification

- `cd packages/server && npx vitest run src/listening`: 104 tests (engine scenarios with fakes:
  rescan, cancel, partial failures, hung database, Google-to-Serper fallback, fabricated quotes,
  passing mentions, an institution's own posts, unsupported ideas, relabeling old labels, one
  user never seeing or touching another's topics, sharing read only, the idea board, drafts and
  their checks, thumbs and taste, more ideas and its refusals, words to leave out).
- `cd packages/client && npx playwright test e2e/topic-ideation.spec.ts`: 47 tests on fixtures,
  including downloading the PDF and Word exports and checking their text and links, sharing, a
  teammate's read-only view, saving to and working the idea board, and a library of 100 topics
  (tabs, filter, person, sort, paging, both views, phone width), each kind of draft, thumbs, and
  more ideas and words to leave out, the report tabs and the address, the idea panel (previous,
  next, arrow keys, Back), question and quote filters and copy, the scan-done tab title and
  notification, and the board at phone width.
  `KEEP_EXPORTS=<dir>` keeps the downloaded files for a visual check.
- `npx playwright test e2e/topic-ideation.a11y.spec.ts`: axe-core, WCAG 2.0 to 2.2 A and AA, light
  and dark: home, first visit, every report tab, the idea panel and each draft (offered and
  written), the board empty and full. Fails on any violation.
- `SHOTS=<dir> npx playwright test e2e/topic-ideation.visual.spec.ts`: desktop and phone, light and dark.
- `REAL_DIR=<json dir> SHOTS=<dir> npx playwright test e2e/topic-ideation.real.spec.ts`: the same
  pages rendered from topic details dumped from production (kept outside the repo), every tab and
  the idea panel, for judging density on real reports.
- Live: `npx tsx src/listening/cli.ts "<topic>" --rescan` runs the real engine against a memory
  store; `npx tsx src/listening/probe.ts` checks every source.

## Open

- crawl4ai as an optional fallback reader: decision pending; see [crawl4ai-option.md](crawl4ai-option.md).
- Scheduled rescans and alerts: not built.
- Changing an existing topic's time range in place (today: the topic menu starts a new scan of the same topic over another range).
- "People also ask" from Serper responses as their own section, once Serper is funded.
- Library: grouping one topic's scans over several time ranges under one entry; a hint under the
  search box when the topic typed has already been scanned (saves the shared allowance).
- Leaving out a subject rather than a word (posts about it that never use the word). It needs its
  own yes or no from the model per post; folding it into relevance was not precise enough.
- Screenshots of representative posts for client decks: tested 2026-10-13 and not possible from
  the server. Reddit answers the app's capture service with "You've been blocked by network
  security" on both its layouts, and Quora refuses it too. Getting round that block is not
  something to build. What works today: every quote and source links to the live post, to open
  and capture in your own browser. A possible substitute is a one-page proof sheet per idea
  (the quotes word for word, with dates and links), clearly not a screenshot.
