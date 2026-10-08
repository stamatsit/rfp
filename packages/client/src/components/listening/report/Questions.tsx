import { ArrowUpRight, MessageCircleQuestion } from "lucide-react"
import type { Report } from "@/types/listening"
import { AUDIENCE_LABEL, Card, CopyButton, ExternalLink, NewBadge, PlatformBadge, SectionHeading } from "../ui"

export function Questions({ report }: { report: Report }) {
  return (
    <section>
      <SectionHeading
        id="questions"
        title="Questions people ask"
        count={report.questions.length}
        hint="Word for word, most worth answering first. Each one links to where it was asked."
        action={report.questions.length ? <CopyButton text={() => report.questions.map((q) => `- ${q.text}`).join("\n")} label="Copy all" /> : undefined}
      />
      {report.questions.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageCircleQuestion size={22} className="mx-auto text-slate-300" />
          <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-3">No direct questions found yet. A rescan often surfaces them.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {report.questions.map((q, i) => (
            <ExternalLink
              key={q.itemId}
              href={q.url}
              className="group flex gap-4 px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors first:rounded-t-2xl last:rounded-b-2xl"
            >
              <span className="text-[12px] font-semibold text-slate-300 dark:text-slate-600 tabular-nums w-5 shrink-0 pt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{q.text}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] text-slate-500">
                  <PlatformBadge platform={q.platform} />
                  {q.audience !== "general" && <span>Asked by {AUDIENCE_LABEL[q.audience].toLowerCase()}</span>}
                  {q.isNew && report.totals.runs > 1 && <NewBadge />}
                </p>
              </div>
              <ArrowUpRight size={16} className="shrink-0 text-slate-300 group-hover:text-sky-500 transition-colors mt-1" aria-label="Open thread" />
            </ExternalLink>
          ))}
        </Card>
      )}
    </section>
  )
}
