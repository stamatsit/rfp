import { useMemo, useState } from "react"
import { ArrowUpRight, MessageCircleQuestion } from "lucide-react"
import type { Audience, Report } from "@/types/listening"
import { AUDIENCE_LABEL, Card, CopyButton, NewBadge, PlatformBadge, SectionHeading } from "../ui"
import { Chip, ring, tone } from "../primitives"

export function Questions({ report }: { report: Report }) {
  const audiences = useMemo(() => {
    const c = new Map<Audience, number>()
    for (const q of report.questions) c.set(q.audience, (c.get(q.audience) ?? 0) + 1)
    return [...c.entries()].filter(([a]) => a !== "general").sort((a, b) => b[1] - a[1])
  }, [report.questions])
  const [audience, setAudience] = useState<Audience | "all">("all")
  // Number each question by its place in the full list, so a filter keeps the numbers.
  const numbered = report.questions.map((q, i) => ({ q, n: i + 1 }))
  const shown = audience === "all" ? numbered : numbered.filter(({ q }) => q.audience === audience)
  return (
    <section aria-labelledby="questions-title">
      <SectionHeading
        id="questions"
        titleId="questions-title"
        title="Questions people ask"
        count={report.questions.length}
        hint="Word for word, most worth answering first. Each one links to where it was asked."
        action={report.questions.length ? <CopyButton text={() => shown.map(({ q }) => `- ${q.text}`).join("\n")} label={audience === "all" ? "Copy all" : `Copy ${shown.length}`} /> : undefined}
      />
      {audiences.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="group" aria-label="Filter questions by who asked">
          <Chip on={audience === "all"} onClick={() => setAudience("all")} count={report.questions.length}>
            Everyone
          </Chip>
          {audiences.map(([a, n]) => (
            <Chip key={a} on={audience === a} onClick={() => setAudience(audience === a ? "all" : a)} count={n}>
              {AUDIENCE_LABEL[a]}
            </Chip>
          ))}
        </div>
      )}
      {report.questions.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageCircleQuestion size={22} className="mx-auto text-slate-400" />
          <p className={`text-[14px] mt-3 ${tone.body}`}>No direct questions found yet. A rescan often surfaces them.</p>
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {shown.map(({ q, n }) => (
              <li key={`${n}-${q.itemId}`} className="group relative flex gap-4 px-4 sm:px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors first:rounded-t-2xl last:rounded-b-2xl">
                <span aria-hidden className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums w-5 shrink-0 pt-0.5">
                  {n}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 group-hover:text-sky-800 dark:group-hover:text-sky-300 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-sky-500/50"
                  >
                    {q.text}
                  </a>
                  <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12.5px] ${tone.muted}`}>
                    <PlatformBadge platform={q.platform} />
                    {q.audience !== "general" && <span>Asked by {AUDIENCE_LABEL[q.audience].toLowerCase()}</span>}
                    {q.isNew && report.totals.runs > 1 && <NewBadge />}
                  </p>
                </div>
                <span className="relative z-10 shrink-0 flex items-start gap-0.5 -mr-1.5">
                  <CopyButton text={q.text} label="" done="" ariaLabel={`Copy question: ${q.text}`} className="!px-2 h-8" />
                  <ArrowUpRight size={16} aria-hidden className="mt-2 text-slate-400 group-hover:text-sky-600 transition-colors" />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  )
}

/** The first few questions, linked, for the overview. */
export function TopQuestions({ report, limit = 5 }: { report: Report; limit?: number }) {
  return (
    <ol className="space-y-1">
      {report.questions.slice(0, limit).map((q, i) => (
        <li key={`${i}-${q.itemId}`}>
          <a href={q.url} target="_blank" rel="noopener noreferrer" className={`group flex gap-2.5 rounded-lg py-1.5 ${ring}`}>
            <MessageCircleQuestion size={15} aria-hidden className="mt-[3px] shrink-0 text-slate-400 group-hover:text-sky-600" />
            <span className="min-w-0 text-[14px] leading-snug text-slate-800 dark:text-slate-100 group-hover:text-sky-800 dark:group-hover:text-sky-300">{q.text}</span>
          </a>
        </li>
      ))}
    </ol>
  )
}
