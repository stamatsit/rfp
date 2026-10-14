/**
 * Topic Ideation: social listening for content ideas.
 * /listening            search, your topics, topics shared with you
 * /listening/ideas      your idea board
 * /listening/:topicId   one topic's report (and its live scans)
 * One route with an optional param, because the app remounts pages on every
 * path change and a running scan must keep its live stream.
 */
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { BookmarkCheck, Lock, Radar } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { IdeaBoard } from "@/components/listening/IdeaBoard"
import { ListeningHome } from "@/components/listening/ListeningHome"
import { TopicView } from "@/components/listening/TopicView"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useScan } from "@/hooks/useScan"
import { listeningApi } from "@/lib/listeningApi"
import { cn } from "@/lib/utils"
import type { AccessInfo, TimeWindow, TopicRow } from "@/types/listening"

/** Module-level because the app remounts pages on every path change. */
let navigatedForRun: string | null = null

/** The tool's two places: the topics and your idea board. */
function ToolNav({ board, ideaCount }: { board: boolean; ideaCount: number | null }) {
  const item = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 h-9 rounded-lg px-3.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50",
      on ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]" : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white",
    )
  return (
    <nav aria-label="Topic Ideation" className="mb-6">
      <ul className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
        <li>
          <Link to="/listening" aria-current={board ? undefined : "page"} className={item(!board)}>
            <Radar size={15} aria-hidden /> Topics
          </Link>
        </li>
        <li>
          <Link to="/listening/ideas" aria-current={board ? "page" : undefined} className={item(board)}>
            <BookmarkCheck size={15} aria-hidden /> Idea board
            {ideaCount !== null && <span className="tabular-nums text-[12.5px] text-slate-500 dark:text-slate-400">{ideaCount}</span>}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

export function TopicIdeation() {
  const { topicId: param } = useParams<{ topicId?: string }>()
  const board = param === "ideas"
  const topicId = board ? undefined : param
  const navigate = useNavigate()
  const [access, setAccess] = useState<AccessInfo | null>(null)
  const [denied, setDenied] = useState(false)
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [shared, setShared] = useState<TopicRow[]>([])
  const [team, setTeam] = useState<TopicRow[] | null>(null)
  const [ideaCount, setIdeaCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  // A topic to put in the search box, carried in the address (?q=) because the
  // app rebuilds this page on every navigation and would lose it from state.
  const [search] = useSearchParams()
  const prefill = search.get("q") ?? ""
  // Words to leave out, carried the same way when a topic is scanned again over another range.
  const prefillLeave = search.get("x") ?? ""
  const scan = useScan()
  useDocumentTitle("Topic Ideation")

  const refresh = useCallback(async () => {
    try {
      const [a, t, ideas] = await Promise.all([listeningApi.access(), listeningApi.topics(), listeningApi.ideas().catch(() => null)])
      setAccess(a)
      setTopics(t.topics)
      setShared(t.shared ?? [])
      setTeam(t.team ?? null)
      setIdeaCount(ideas ? ideas.ideas.length : null)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401) navigate("/login", { replace: true })
      else if (status === 403) setDenied(true)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void refresh()
  }, [refresh, param])

  // A new scan moves to its topic page as soon as the server confirms it, once
  // per scan, whatever stage it has reached by then (a cached scan can finish
  // before the first render). Coming back home later does not bounce you again.
  useEffect(() => {
    const s = scan.state
    if (s.trigger !== "initial" || !s.topicId || !s.runId) return
    if (navigatedForRun === s.runId) return
    navigatedForRun = s.runId
    if (topicId !== s.topicId) navigate(`/listening/${s.topicId}`)
  }, [scan.state, topicId, navigate])

  const startNew = (query: string, timeWindow: TimeWindow, range?: { from: string; to: string }, exclude: string[] = []) =>
    void scan.start({ kind: "new", query, timeWindow, ...(timeWindow === "custom" && range ? range : {}), ...(exclude.length ? { exclude } : {}) })

  const startingNew = scan.state.trigger === "initial" && scan.state.phase === "starting"
  const startError = scan.state.trigger === "initial" && scan.state.phase === "failed" && !scan.state.topicId ? scan.state.error : null

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900">
      <AppHeader
        title="Topic Ideation"
        breadcrumbs={
          topicId || board
            ? [{ label: "Library", href: "/" }, { label: "Topic Ideation", href: "/listening" }, { label: board ? "Idea board" : "Topic" }]
            : [{ label: "Library", href: "/" }, { label: "Topic Ideation" }]
        }
      />
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-24">
        {denied ? (
          <div className="max-w-md mx-auto text-center py-24">
            <Lock size={26} className="mx-auto text-slate-300" />
            <p className="text-[16px] font-medium text-slate-800 dark:text-slate-100 mt-4">Topic Ideation is not available on your account yet.</p>
            <Link to="/" className="inline-block mt-6 text-[14px] font-medium text-sky-700 dark:text-sky-400 hover:underline">
              Back to the library
            </Link>
          </div>
        ) : board ? (
          <>
            <ToolNav board ideaCount={ideaCount} />
            <IdeaBoard />
          </>
        ) : topicId ? (
          <TopicView
            key={topicId}
            topicId={topicId}
            scan={scan}
            onNewSearch={(q, leave) => navigate(`/listening?q=${encodeURIComponent(q)}${leave?.length ? `&x=${encodeURIComponent(leave.join(", "))}` : ""}`)}
            budget={access && !access.sources.serper ? access.budget : null}
          />
        ) : (
          <>
          <ToolNav board={false} ideaCount={ideaCount} />
          <ListeningHome
            access={access}
            topics={topics}
            shared={shared}
            team={team}
            loading={loading}
            starting={startingNew}
            startError={startError}
            initialQuery={prefill}
            initialExclude={prefillLeave}
            onScan={startNew}
            onEdit={() => startError && scan.reset()}
          />
          </>
        )}
      </main>
    </div>
  )
}
