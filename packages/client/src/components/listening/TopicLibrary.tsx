import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutGrid, List, ListFilter, Loader2, Lock, Users, X } from "lucide-react"
import type { TopicRow } from "@/types/listening"
import { Card, SentimentPill, personName, plural, timeAgo, windowLabel } from "./ui"

/**
 * The saved topics on the home page: yours, the ones shared with you and, for
 * admins, everyone's. Built to stay usable at a hundred scans: one list at a
 * time, a filter box, a person picker, sorting, and a compact list that shows
 * a page at a time. A handful of topics keeps the plain card grid and no
 * controls at all.
 */

export type Scope = "mine" | "shared" | "team"
export type SortKey = "newest" | "name" | "posts" | "positive" | "negative"
export type ViewMode = "cards" | "list"

/** The filter bar appears from this many topics up. */
export const FILTER_FROM = 7
/** The compact list becomes the default from this many topics up. */
export const LIST_FROM = 13
/** Topics shown before "Show more". */
export const PAGE = 24

const SORTS: Array<[SortKey, string]> = [
  ["newest", "Newest first"],
  ["name", "Topic A to Z"],
  ["posts", "Most posts"],
  ["positive", "Most positive"],
  ["negative", "Most negative"],
]

const scannedAt = (t: TopicRow) => new Date(t.lastRunAt ?? t.updatedAt).getTime() || 0

/** "Past year", or "Mar 1, 2026 to May 31, 2026" for custom dates. */
export function rangeLabel(t: TopicRow): string {
  const l = windowLabel(t)
  return l.charAt(0).toUpperCase() + l.slice(1)
}

/** ", without sports" or ", without sports +2": enough to tell two scans of one topic apart. */
export function withoutLabel(t: TopicRow): string {
  const terms = t.excludeTerms ?? []
  return terms.length ? `, without ${terms[0]}${terms.length > 1 ? ` +${terms.length - 1}` : ""}` : ""
}

/** Every word typed must appear in the topic, its summary, its time range, what it leaves out or its owner's name. */
export function matchesFilter(t: TopicRow, find: string): boolean {
  const words = find.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = `${t.query} ${t.headline ?? ""} ${rangeLabel(t)} ${(t.excludeTerms ?? []).join(" ")} ${personName(t.createdBy)}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** A new array in the chosen order. Ties, and topics with no feeling yet, fall back to newest first. */
export function sortTopics(list: TopicRow[], sort: SortKey): TopicRow[] {
  const newest = (a: TopicRow, b: TopicRow) => scannedAt(b) - scannedAt(a)
  const byScore = (dir: 1 | -1) => (a: TopicRow, b: TopicRow) => {
    if (a.sentimentScore === null || b.sentimentScore === null) {
      return a.sentimentScore === b.sentimentScore ? newest(a, b) : a.sentimentScore === null ? 1 : -1
    }
    return dir * (b.sentimentScore - a.sentimentScore) || newest(a, b)
  }
  const out = [...list]
  if (sort === "name") return out.sort((a, b) => a.query.localeCompare(b.query, undefined, { sensitivity: "base" }) || newest(a, b))
  if (sort === "posts") return out.sort((a, b) => b.relevantCount - a.relevantCount || newest(a, b))
  if (sort === "positive") return out.sort(byScore(1))
  if (sort === "negative") return out.sort(byScore(-1))
  return out.sort(newest)
}

// ─── what the browser remembers ─────────────────────────────────────────────
// View and sort are a lasting preference. Tab, filter and depth last for the
// visit, so coming back from a topic lands where you left the list (the app
// rebuilds this page on every navigation).

const PREFS_KEY = "ti-library-prefs"
const VISIT_KEY = "ti-library-visit"

function load<T extends object>(store: "local" | "session", key: string): Partial<T> {
  try {
    const raw = (store === "local" ? window.localStorage : window.sessionStorage).getItem(key)
    const v: unknown = raw ? JSON.parse(raw) : null
    return v && typeof v === "object" ? (v as Partial<T>) : {}
  } catch {
    return {}
  }
}

function save(store: "local" | "session", key: string, value: object): void {
  try {
    ;(store === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value))
  } catch {
    // Private windows and blocked storage: the library still works, it just forgets.
  }
}

interface Prefs {
  view: ViewMode | null
  sort: SortKey
}
interface Visit {
  scope: Scope | null
  find: string
  person: string
  shown: number
}

// ─── one topic, two densities ───────────────────────────────────────────────

function topicState(t: TopicRow) {
  const running = t.lastRunStatus === "running"
  const failed = !running && (t.lastRunStatus === "failed" || t.lastRunStatus === "cancelled") && !t.headline
  const summary = t.headline ?? (running ? "First scan in progress..." : failed ? "The last scan did not finish. Open to try again." : "No results yet.")
  return { running, failed, summary }
}

/**
 * mine: your topic (marked when shared). shared: someone shared it with you.
 * team: someone else's topic, seen because everyone sees every topic (teamView)
 * or because you are an admin (then marked shared or private).
 * With team visibility "shared" and "private" mean nothing, so only the owner shows.
 */
function ownerBadge(t: TopicRow, scope: Scope, teamView: boolean) {
  const who = personName(t.createdBy)
  if (scope === "team") return teamView ? { text: who, Icon: Users, tone: "slate" } : { text: `${who} · ${t.shared ? "shared" : "private"}`, Icon: t.shared ? Users : Lock, tone: t.shared ? "sky" : "slate" }
  if (scope === "shared") return { text: `Shared by ${who}`, Icon: Users, tone: "sky" }
  return t.shared && !teamView ? { text: "Shared with your team", Icon: Users, tone: "sky" } : null
}

const BADGE_TONE: Record<string, string> = {
  sky: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
}

function TopicCard({ t, now, scope, teamView }: { t: TopicRow; now: number; scope: Scope; teamView: boolean }) {
  const { running, failed, summary } = topicState(t)
  const badge = ownerBadge(t, scope, teamView)
  return (
    <li className="min-w-0">
      <Link to={`/listening/${t.id}`} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded-2xl">
        <Card className="h-full p-5 flex flex-col group-hover:border-black/[0.12] dark:group-hover:border-white/[0.16] group-hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all">
          {badge && (
            <span className={`self-start inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium mb-2 ${BADGE_TONE[badge.tone]}`}>
              <badge.Icon size={12} /> {badge.text}
            </span>
          )}
          <h3 className="text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-white line-clamp-2">{t.query}</h3>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
            {rangeLabel(t)}
            {withoutLabel(t)}
          </p>
          <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-3">{summary}</p>
          <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-[12px] text-slate-500 dark:text-slate-400">
            {running ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
                <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> Scanning
              </span>
            ) : failed ? (
              <span className="font-medium text-rose-600 dark:text-rose-400">Did not finish</span>
            ) : (
              <span className="flex items-center gap-3">
                <SentimentPill score={t.sentimentScore} />
                <span className="tabular-nums">{plural(t.relevantCount, "post")}</span>
              </span>
            )}
            <span className="shrink-0">{timeAgo(t.lastRunAt ?? t.updatedAt, now)}</span>
          </div>
        </Card>
      </Link>
    </li>
  )
}

/** One line of the compact list: topic and range, a one-line summary, then feeling, posts and age in columns. */
function TopicLine({ t, now, scope, teamView }: { t: TopicRow; now: number; scope: Scope; teamView: boolean }) {
  const { running, failed, summary } = topicState(t)
  const badge = ownerBadge(t, scope, teamView)
  return (
    <li>
      <Link
        to={`/listening/${t.id}`}
        className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1.5 px-4 sm:px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="max-w-full truncate text-[14.5px] font-semibold text-slate-900 dark:text-white">{t.query}</span>
            <span className="text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {rangeLabel(t)}
              {withoutLabel(t)}
            </span>
          </span>
          <span className="mt-1 flex items-center gap-2 min-w-0 text-[12.5px] text-slate-500 dark:text-slate-400">
            {badge && (
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${BADGE_TONE[badge.tone]}`}>
                <badge.Icon size={11} /> {badge.text}
              </span>
            )}
            <span className="truncate">{summary}</span>
          </span>
        </span>
        <span className="flex items-center gap-4 shrink-0 text-[12px] text-slate-500 dark:text-slate-400">
          {running ? (
            <span className="sm:w-[212px] inline-flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> Scanning
            </span>
          ) : failed ? (
            <span className="sm:w-[212px] font-medium text-rose-600 dark:text-rose-400">Did not finish</span>
          ) : (
            <>
              <span className="sm:w-[124px]">
                <SentimentPill score={t.sentimentScore} />
              </span>
              <span className="sm:w-[72px] sm:text-right tabular-nums">{plural(t.relevantCount, "post")}</span>
            </>
          )}
          <span className="ml-auto sm:ml-0 sm:w-[84px] text-right whitespace-nowrap">{timeAgo(t.lastRunAt ?? t.updatedAt, now)}</span>
        </span>
      </Link>
    </li>
  )
}

// ─── the library ────────────────────────────────────────────────────────────

const CONTROL =
  "h-10 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 text-[13.5px] text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"

function Picker({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative min-w-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${CONTROL} w-full appearance-none pl-3 pr-8 font-medium cursor-pointer truncate`}>
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border-x-[4px] border-x-transparent border-t-[5px] border-t-slate-400" />
    </div>
  )
}

export function TopicLibrary({
  topics,
  shared = [],
  team = null,
  teamView = false,
  loading,
  now,
}: {
  topics: TopicRow[] | null
  /** Topics teammates shared: read and export only. */
  shared?: TopicRow[]
  /** Everyone's topics, when you see every topic (team visibility, or an admin). Replaces `shared` when present. */
  team?: TopicRow[] | null
  /** Everyone sees every topic: no shared or private labels. */
  teamView?: boolean
  loading: boolean
  now: number
}) {
  const [prefs] = useState(() => load<Prefs>("local", PREFS_KEY))
  const [visit] = useState(() => load<Visit>("session", VISIT_KEY))
  const [scopeChoice, setScopeChoice] = useState<Scope | null>(visit.scope === "mine" || visit.scope === "shared" || visit.scope === "team" ? visit.scope : null)
  const [find, setFind] = useState(typeof visit.find === "string" ? visit.find.slice(0, 80) : "")
  const [person, setPerson] = useState(typeof visit.person === "string" ? visit.person : "")
  const [shown, setShown] = useState(typeof visit.shown === "number" && visit.shown >= PAGE && visit.shown <= 2000 ? visit.shown : PAGE)
  const [sort, setSort] = useState<SortKey>(SORTS.some(([k]) => k === prefs.sort) ? (prefs.sort as SortKey) : "newest")
  const [viewChoice, setViewChoice] = useState<ViewMode | null>(prefs.view === "cards" || prefs.view === "list" ? prefs.view : null)
  const tabs = useRef<HTMLDivElement>(null)

  const scopes = useMemo(() => {
    const s: Array<{ id: Scope; label: string; list: TopicRow[]; note: string | null }> = [{ id: "mine", label: "Your topics", list: topics ?? [], note: null }]
    if (team)
      s.push({
        id: "team",
        label: "Everyone's topics",
        list: team,
        note: teamView
          ? "Every scan anyone on the team runs shows here. Open, export and save ideas from any of them; only the person who ran it can rescan."
          : "As an admin you can open every scan, private ones too. Only the person who ran it can rescan.",
      })
    else if (shared.length > 0) s.push({ id: "shared", label: "Shared with you", list: shared, note: "Read, export and save ideas. Only the owner can rescan." })
    return s
  }, [topics, shared, team, teamView])

  // With nothing of your own yet, open on what others have scanned.
  const fallback = topics && topics.length === 0 && scopes[1] && scopes[1].list.length > 0 ? scopes[1] : scopes[0]!
  const active = scopes.find((s) => s.id === scopeChoice) ?? fallback

  const people = useMemo(() => {
    const count = new Map<string, number>()
    for (const t of active.list) {
      const who = t.createdBy.trim().toLowerCase()
      count.set(who, (count.get(who) ?? 0) + 1)
    }
    return [...count.entries()].map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n || personName(a.who).localeCompare(personName(b.who)))
  }, [active.list])

  // Controls only act while they are on screen: a short list is shown whole, newest first, as cards.
  const busy = active.list.length >= FILTER_FROM
  const pickPeople = busy && active.id !== "mine" && people.length > 1
  const byPerson = pickPeople && people.some((p) => p.who === person) ? person : ""
  const words = busy ? find.trim() : ""
  const filtering = words !== "" || byPerson !== ""
  const view: ViewMode = busy ? (viewChoice ?? (active.list.length >= LIST_FROM ? "list" : "cards")) : "cards"
  const matched = useMemo(
    () => sortTopics(active.list.filter((t) => matchesFilter(t, words) && (!byPerson || t.createdBy.trim().toLowerCase() === byPerson)), busy ? sort : "newest"),
    [active.list, words, byPerson, sort, busy],
  )
  const visible = matched.slice(0, shown)
  const more = matched.length - visible.length

  useEffect(() => save("session", VISIT_KEY, { scope: scopeChoice, find, person, shown } satisfies Visit), [scopeChoice, find, person, shown])
  useEffect(() => save("local", PREFS_KEY, { view: viewChoice, sort } satisfies Prefs), [viewChoice, sort])

  const chooseScope = (id: Scope) => {
    setScopeChoice(id)
    setPerson("")
    setShown(PAGE)
  }
  const clear = () => {
    setFind("")
    setPerson("")
    setShown(PAGE)
  }
  const onTabKeys = (e: React.KeyboardEvent) => {
    const i = scopes.findIndex((s) => s.id === active.id)
    const next = e.key === "ArrowRight" ? (i + 1) % scopes.length : e.key === "ArrowLeft" ? (i - 1 + scopes.length) % scopes.length : e.key === "Home" ? 0 : e.key === "End" ? scopes.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    chooseScope(scopes[next]!.id)
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  const tabbed = scopes.length > 1
  const listLabel = active.label

  return (
    <section aria-labelledby="topics-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {tabbed ? (
          <>
            <h2 id="topics-heading" className="sr-only">
              Topics
            </h2>
            <div ref={tabs} role="tablist" aria-label="Whose topics" onKeyDown={onTabKeys} className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
              {scopes.map((s) => {
                const on = s.id === active.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={`topics-tab-${s.id}`}
                    aria-selected={on}
                    aria-controls="topics-panel"
                    tabIndex={on ? 0 : -1}
                    onClick={() => chooseScope(s.id)}
                    className={`inline-flex items-center gap-1.5 h-9 rounded-lg px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                      on ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(15,23,42,0.1)]" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {s.label}
                    <span className={`tabular-nums text-[12.5px] ${on ? "text-slate-500 dark:text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>{s.list.length}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <h2 id="topics-heading" className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
            Your topics {topics && topics.length > 0 && <span className="text-slate-500 dark:text-slate-400 tabular-nums">{topics.length}</span>}
          </h2>
        )}
      </div>

      <div id="topics-panel" {...(tabbed ? { role: "tabpanel", "aria-labelledby": `topics-tab-${active.id}` } : {})}>
        {active.note && <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-3">{active.note}</p>}

        {busy && (
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Filter topics</span>
              <ListFilter size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden />
              <input
                value={find}
                onChange={(e) => {
                  setFind(e.target.value)
                  setShown(PAGE)
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Escape" || !find) return
                  setFind("")
                  setShown(PAGE)
                }}
                maxLength={80}
                inputMode="search"
                autoComplete="off"
                placeholder={active.id === "mine" ? "Filter your topics" : "Filter by topic or person"}
                className={`${CONTROL} w-full pl-10 pr-9 placeholder:text-slate-400`}
              />
              {find && (
                <button
                  type="button"
                  onClick={() => {
                    setFind("")
                    setShown(PAGE)
                  }}
                  aria-label="Clear the filter"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <div className="flex gap-2 min-w-0">
              {pickPeople && (
                <Picker
                  label="Person"
                  value={byPerson}
                  onChange={(v) => {
                    setPerson(v)
                    setShown(PAGE)
                  }}
                >
                  <option value="">All people</option>
                  {people.map((p) => (
                    <option key={p.who} value={p.who}>
                      {personName(p.who)} ({p.n})
                    </option>
                  ))}
                </Picker>
              )}
              <Picker
                label="Sort by"
                value={sort}
                onChange={(v) => {
                  setSort(v as SortKey)
                  setShown(PAGE)
                }}
              >
                {SORTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Picker>
              <div role="group" aria-label="View" className="shrink-0 inline-flex rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 p-0.5">
                {(
                  [
                    ["cards", "Cards", LayoutGrid],
                    ["list", "List", List],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={view === mode}
                    onClick={() => setViewChoice(mode)}
                    className={`w-9 h-[34px] inline-flex items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
                      view === mode ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div className={filtering ? "flex items-center gap-3 text-[12.5px] text-slate-500 dark:text-slate-400 mb-3" : "sr-only"}>
            <span className="tabular-nums" aria-live="polite">
              {filtering ? `${matched.length} of ${plural(active.list.length, "topic")}` : ""}
            </span>
            {filtering && (
              <button type="button" onClick={clear} className="font-medium text-sky-700 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded">
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading && !topics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-40 rounded-2xl" />
            ))}
          </div>
        ) : active.list.length === 0 ? (
          active.id === "mine" ? (
            <Card className="p-10 text-center">
              <p className="text-[14.5px] font-medium text-slate-700 dark:text-slate-200">Nothing scanned yet</p>
              <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">Every topic you scan is saved here. Come back any time to read it again or rescan for newer posts.</p>
            </Card>
          ) : (
            <Card className="p-8 text-center text-[13.5px] text-slate-500 dark:text-slate-400">No one else has run a scan yet.</Card>
          )
        ) : matched.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-[14.5px] font-medium text-slate-700 dark:text-slate-200">No topics match</p>
            <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1.5">Try fewer words, or clear the filters to see all {active.list.length}.</p>
          </Card>
        ) : view === "list" ? (
          <Card className="overflow-hidden">
            <ul aria-label={listLabel} className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {visible.map((t) => (
                <TopicLine key={t.id} t={t} now={now} scope={active.id} teamView={teamView} />
              ))}
            </ul>
          </Card>
        ) : (
          <ul aria-label={listLabel} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((t) => (
              <TopicCard key={t.id} t={t} now={now} scope={active.id} teamView={teamView} />
            ))}
          </ul>
        )}

        {more > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px]">
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              Showing {visible.length} of {matched.length}
            </span>
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex items-center h-9 rounded-lg px-3.5 font-medium text-slate-700 dark:text-slate-200 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              Show {Math.min(PAGE, more)} more
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
