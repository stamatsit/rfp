/**
 * Topic Ideation: social listening for content ideas.
 * /listening            search, your topics, topics shared with you
 * /listening/ideas      your idea board
 * /listening/:topicId   one topic's report (and its live scans)
 * One route with an optional param, because the app remounts pages on every
 * path change and a running scan must keep its live stream.
 */
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Lock } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { IdeaBoard } from "@/components/listening/IdeaBoard"
import { ListeningHome } from "@/components/listening/ListeningHome"
import { TopicView } from "@/components/listening/TopicView"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useScan } from "@/hooks/useScan"
import { listeningApi } from "@/lib/listeningApi"
import type { AccessInfo, TimeWindow, TopicRow } from "@/types/listening"

/** Module-level because the app remounts pages on every path change. */
let navigatedForRun: string | null = null

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
  const [prefill, setPrefill] = useState("")
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

  const startNew = (query: string, timeWindow: TimeWindow) => void scan.start({ kind: "new", query, timeWindow })

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
          <IdeaBoard />
        ) : topicId ? (
          <TopicView
            key={topicId}
            topicId={topicId}
            scan={scan}
            onNewSearch={(q) => {
              setPrefill(q)
              navigate("/listening")
            }}
          />
        ) : (
          <ListeningHome
            access={access}
            topics={topics}
            shared={shared}
            team={team}
            ideaCount={ideaCount}
            loading={loading}
            starting={startingNew}
            startError={startError}
            initialQuery={prefill}
            onScan={startNew}
            onEdit={() => startError && scan.reset()}
          />
        )}
      </main>
    </div>
  )
}
