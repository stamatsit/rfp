/**
 * Report invariants: the honesty bar, as code. Used by the eval runner, the
 * CLI and unit tests. Returns a list of failures; empty means the report holds.
 */
import { LIMITS } from "./config.js"
import { isConversation } from "./metrics.js"
import type { Item, Report } from "./types.js"
import { isVerbatim } from "./util/text.js"

export function checkReport(report: Report, items: Item[]): string[] {
  const fail: string[] = []
  const byId = new Map(items.map((it) => [it.id, it]))
  const relevantConv = items.filter((it) => it.labels?.relevant && isConversation(it))

  // Every reference resolves to a stored item with a URL.
  const refs: Array<[string, string]> = []
  report.subtopics.forEach((s) => s.itemIds.forEach((id) => refs.push([`subtopic ${s.id}`, id])))
  report.questions.forEach((q, i) => refs.push([`question ${i + 1}`, q.itemId]))
  report.quotes.forEach((q, i) => refs.push([`quote ${i + 1}`, q.itemId]))
  report.ideas.forEach((idea) => idea.evidenceItemIds.forEach((id) => refs.push([`idea ${idea.id}`, id])))
  report.news.forEach((n, i) => refs.push([`news ${i + 1}`, n.itemId]))
  for (const [where, id] of refs) {
    const it = byId.get(id)
    if (!it) fail.push(`${where}: unknown item ${id}`)
    else if (!/^https?:\/\//.test(it.url)) fail.push(`${where}: item ${id} has no link`)
  }

  // Ideas: enough distinct, relevant evidence.
  for (const idea of report.ideas) {
    const ev = new Set(idea.evidenceItemIds)
    if (ev.size < LIMITS.minIdeaEvidence) fail.push(`idea ${idea.id}: only ${ev.size} evidence items`)
    for (const id of ev) if (byId.get(id) && !byId.get(id)!.labels?.relevant) fail.push(`idea ${idea.id}: evidence ${id} is not relevant`)
    if (!idea.headline.trim()) fail.push(`idea ${idea.id}: empty headline`)
  }

  // Quotes and questions are verbatim in what was fetched.
  for (const q of report.quotes) {
    const it = byId.get(q.itemId)
    if (it && !isVerbatim(q.text, `${it.title}\n${it.text}`)) fail.push(`quote not verbatim: "${q.text.slice(0, 60)}"`)
  }
  for (const q of report.questions) {
    const it = byId.get(q.itemId)
    if (it && !isVerbatim(q.text, `${it.title}\n${it.text}`)) fail.push(`question not verbatim: "${q.text.slice(0, 60)}"`)
  }

  // Figures add up.
  const s = report.sentiment
  if (s.positive + s.neutral + s.negative + s.mixed !== relevantConv.length) {
    fail.push(`sentiment counts (${s.positive + s.neutral + s.negative + s.mixed}) != relevant conversation (${relevantConv.length})`)
  }
  if (report.totals.relevant !== relevantConv.length) fail.push(`totals.relevant ${report.totals.relevant} != ${relevantConv.length}`)
  const subSum = report.subtopics.reduce((n, x) => n + x.count, 0)
  if (subSum > relevantConv.length) fail.push(`subtopic counts ${subSum} exceed relevant ${relevantConv.length}`)
  const platSum = report.platforms.reduce((n, p) => n + p.count, 0)
  if (platSum !== relevantConv.length) fail.push(`platform counts ${platSum} != relevant ${relevantConv.length}`)
  for (const sub of report.subtopics) {
    if (sub.itemIds.length !== sub.count) fail.push(`subtopic ${sub.id}: count ${sub.count} != ${sub.itemIds.length} items`)
  }

  // House style: no em or en dashes anywhere the model wrote.
  const texts = [
    report.summary,
    report.interpretation,
    ...report.subtopics.flatMap((x) => [x.name, x.summary]),
    ...report.ideas.flatMap((i) => [i.headline, i.angle, i.whyNow, ...i.outline]),
  ]
  for (const t of texts) if (/[–—]/.test(t)) fail.push(`dash in: "${t.slice(0, 60)}"`)

  // The model was told not to state numbers; percentages in prose would be unverified.
  for (const t of [report.summary, ...report.subtopics.map((x) => x.summary)]) {
    if (/\d+(\.\d+)?\s*%/.test(t)) fail.push(`percentage in model text: "${t.slice(0, 60)}"`)
  }
  return fail
}
