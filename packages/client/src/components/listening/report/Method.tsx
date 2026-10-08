import { useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import type { Plan, Report, RunSummary } from "@/types/listening"
import { Card, METHOD_TEXT, fmtDate, fmtClock, plural, verdictFromScore, SentimentDot } from "../ui"

const TRIGGER: Record<RunSummary["trigger"], string> = { initial: "First scan", rescan: "Rescan", rebuild: "Refreshed analysis" }

export function Method({ report, plan, runs }: { report: Report; plan: Plan | null; runs: RunSummary[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section id="method" className="scroll-mt-32">
      <Card>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/40 rounded-2xl"
        >
          <span>
            <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">How this was made</span>
            <span className="block text-[12.5px] text-slate-500 mt-0.5">
              {plural(report.totals.collected, "item")} collected over {plural(runs.filter((r) => r.status === "complete").length || 1, "scan")}, every number counted from the posts themselves
            </span>
          </span>
          <ChevronDown size={18} className={`text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="px-5 pb-5 grid gap-6 md:grid-cols-2 text-[13px] text-slate-600 dark:text-slate-300">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2">Searches used</p>
              <ul className="space-y-1">
                {(plan?.searches ?? []).map((s) => (
                  <li key={s.q} className="flex gap-2">
                    <span className="text-slate-300">·</span>
                    <span>
                      {s.q.replace(/"/g, "")} <span className="text-slate-400">({s.why})</span>
                    </span>
                  </li>
                ))}
              </ul>
              {plan?.disambiguation && <p className="mt-3 text-slate-500">Treated as off-topic: {plan.disambiguation}</p>}
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mt-5 mb-2">Sources, latest scan</p>
              <ul className="space-y-1.5">
                {report.coverage.lanes.map((l) => (
                  <li key={l.lane} className="flex items-start gap-2">
                    {l.status === "ok" ? <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <X size={14} className="text-amber-500 mt-0.5 shrink-0" />}
                    <span>
                      {l.label}
                      {l.status === "ok" ? <span className="text-slate-400"> · {l.count} found</span> : <span className="text-slate-400"> · {l.note ?? l.status}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-slate-500 leading-relaxed">{METHOD_TEXT}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2">Scan history</p>
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06] rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                {runs.map((r) => {
                  const v = verdictFromScore(r.sentimentScore)
                  return (
                    <li key={r.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <span>
                        <span className="text-slate-800 dark:text-slate-100 font-medium">{TRIGGER[r.trigger]}</span>
                        <span className="text-slate-400"> · {fmtDate(r.startedAt)} {fmtClock(r.startedAt)}</span>
                      </span>
                      <span className="text-right tabular-nums">
                        {r.status === "complete" ? (
                          <span className="inline-flex items-center gap-2">
                            {r.trigger !== "rebuild" && <span>+{r.newItems}</span>}
                            {r.sentimentScore !== null && <SentimentDot tone={v.tone} />}
                          </span>
                        ) : (
                          <span className={r.status === "failed" ? "text-rose-500" : "text-slate-400"} title={r.error ?? undefined}>
                            {r.status === "running" ? "running" : r.status}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}
