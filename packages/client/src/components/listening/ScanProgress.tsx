import { useEffect, useState } from "react"
import { AlertTriangle, Check, Loader2, X } from "lucide-react"
import type { ScanState } from "@/hooks/useScan"
import type { Stage } from "@/types/listening"
import { Card, fmtDuration, plural } from "./ui"

type StepId = "plan" | "search" | "read" | "label" | "write"
const STAGE_TO_STEP: Record<Stage, StepId> = { plan: "plan", search: "search", read: "read", label: "label", cluster: "write", write: "write", save: "write" }
// Labeling comes before reading: only threads that are really about the topic are opened in full.
const ORDER: StepId[] = ["plan", "search", "label", "read", "write"]

const COPY: Record<StepId, { title: string; rescanTitle?: string }> = {
  plan: { title: "Working out how people search for this", rescanTitle: "Adding a fresh way to search" },
  search: { title: "Searching Reddit, forums, social, reviews, YouTube and news", rescanTitle: "Looking for new posts and digging deeper" },
  label: { title: "Reading every post: is it about this, who wrote it, how they feel" },
  read: { title: "Opening the threads that are about it, in full" },
  write: { title: "Grouping subtopics, writing ideas, checking each against its sources" },
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function StepIcon({ status }: { status: "done" | "active" | "pending" | "warn" }) {
  if (status === "done")
    return (
      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
        <Check size={14} strokeWidth={3} />
      </span>
    )
  if (status === "active")
    return (
      <span className="w-6 h-6 rounded-full bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
        <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />
      </span>
    )
  if (status === "warn")
    return (
      <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        <AlertTriangle size={13} strokeWidth={2.5} />
      </span>
    )
  return <span className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-slate-700 shrink-0" />
}

export function ScanProgress({ state, query, onCancel, compact = false }: { state: ScanState; query: string; onCancel: () => void; compact?: boolean }) {
  const running = state.phase === "running" || state.phase === "starting"
  const now = useNow(running)
  const elapsed = state.startedAt ? now - state.startedAt : 0
  const [cancelling, setCancelling] = useState(false)
  const isRescan = state.trigger === "rescan"
  const isRebuild = state.trigger === "rebuild"

  const steps = isRebuild ? (["label", "write"] as StepId[]) : ORDER
  const activeStep: StepId | null = state.stage ? STAGE_TO_STEP[state.stage] : running ? (isRebuild ? "label" : "plan") : null
  const activeIdx = activeStep ? steps.indexOf(activeStep) : -1

  const statusOf = (id: StepId, i: number): "done" | "active" | "pending" | "warn" => {
    if (state.phase === "done") return "done"
    if (i < activeIdx) {
      if (id === "search" && state.lanes.some((l) => l.status === "failed")) return "warn"
      return "done"
    }
    if (i === activeIdx) return running ? "active" : "pending"
    return "pending"
  }

  const detail = (id: StepId): React.ReactNode => {
    if (id === "plan" && state.plan) {
      const shown = isRescan ? state.plan.searches.filter((s) => s.addedRunId) : state.plan.searches
      if (!shown.length) return null
      return (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {shown.map((s) => (
            <span key={s.q} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[12.5px] text-slate-600 dark:text-slate-300">
              {s.q.replace(/"/g, "")}
            </span>
          ))}
        </div>
      )
    }
    if (id === "search" && state.lanes.length) {
      const ok = state.lanes.filter((l) => l.status !== "failed")
      // Sources that failed for the same reason share one line.
      const failed = new Map<string, string[]>()
      for (const l of state.lanes) {
        if (l.status !== "failed") continue
        const reason = l.note ?? "did not answer"
        failed.set(reason, [...(failed.get(reason) ?? []), l.label])
      }
      return (
        <div className="mt-2 space-y-1.5">
          {ok.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ok.map((l) => (
                <span
                  key={l.lane}
                  title={l.note}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] tabular-nums ${
                    l.status === "ok"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {l.status === "ok" && <Check size={12} strokeWidth={3} />}
                  {l.label}
                  {l.status === "ok" && <b className="font-semibold">{l.count}</b>}
                </span>
              ))}
            </div>
          )}
          {[...failed.entries()].map(([reason, labels]) => (
            <p key={reason} className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-[12.5px] text-amber-800 dark:text-amber-300 w-fit max-w-full">
              <X size={12} strokeWidth={3} className="mt-[3px] shrink-0" />
              <span>
                <b className="font-semibold">{labels.join(", ")}</b> {reason}
              </span>
            </p>
          ))}
        </div>
      )
    }
    if (id === "read" && state.toRead !== null) {
      return <p className="text-[12.5px] text-slate-500 mt-1">{state.toRead ? `${plural(state.toRead, "thread")} about the topic, with their replies` : "No new threads about it to open"}</p>
    }
    if (id === "label" && state.toLabel) {
      const p = Math.min(100, Math.round((100 * state.labeled) / state.toLabel))
      return (
        <div className="mt-2 max-w-sm">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(p, 3)}%` }} />
          </div>
          <p className="text-[12.5px] text-slate-500 mt-1.5 tabular-nums">
            {state.labeled.toLocaleString()} of {state.toLabel.toLocaleString()} posts
          </p>
        </div>
      )
    }
    return null
  }

  const title = isRebuild ? "Refreshing the analysis" : isRescan ? "Rescanning for more" : `Scanning “${query}”`

  return (
    <Card className={compact ? "p-5" : "p-6 sm:p-8"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={`${compact ? "text-[16px]" : "text-[20px]"} font-semibold tracking-[-0.01em] text-slate-900 dark:text-white`}>{title}</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums" aria-live="off">
            {fmtDuration(elapsed)} elapsed · {isRebuild ? "usually under a minute" : "usually 2 to 3 minutes"}
          </p>
        </div>
        {running && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => {
              setCancelling(true)
              onCancel()
            }}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 border border-black/[0.08] dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            {cancelling ? "Stopping..." : "Cancel"}
          </button>
        )}
      </div>

      {state.detached && running ? (
        <div className="mt-6" aria-live="polite">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-sky-500 animate-[indeterminate_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
          </div>
          <p className="text-[13.5px] text-slate-600 dark:text-slate-300 mt-3">Still working on the server. This page will update the moment it finishes.</p>
        </div>
      ) : (
        <ol className={`${compact ? "mt-4 space-y-3" : "mt-7 space-y-5"}`} aria-live="polite">
          {steps.map((id, i) => {
            const st = statusOf(id, i)
            return (
              <li key={id} className="flex gap-3.5">
                <StepIcon status={st} />
                <div className="min-w-0 pt-0.5">
                  <p
                    className={`text-[14.5px] leading-snug ${
                      st === "pending" ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100 font-medium"
                    }`}
                  >
                    {(isRescan && COPY[id].rescanTitle) || COPY[id].title}
                  </p>
                  {st !== "pending" && detail(id)}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!compact && running && (
        <p className="text-[12.5px] text-slate-400 mt-7 border-t border-black/[0.05] dark:border-white/[0.06] pt-4">
          You can leave this page. The scan keeps going and saves itself when it finishes.
        </p>
      )}
    </Card>
  )
}
