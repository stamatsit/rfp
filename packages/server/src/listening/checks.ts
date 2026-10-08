/**
 * Report invariants: the honesty bar, as code. Used by the eval runner, the
 * CLI and unit tests. Returns a list of failures; empty means the report holds.
 */
import { LIMITS } from "./config.js"
import { isPublicConversation, isVoice, sampleExclusions } from "./metrics.js"
import type { Item, Report } from "./types.js"
import { isRealQuestion, isVerbatim } from "./util/text.js"

export function checkReport(report: Report, items: Item[]): string[] {
  const fail: string[] = []
  const byId = new Map(items.map((it) => [it.id, it]))
  const sample = items.filter(isPublicConversation)

  // Every reference resolves to a stored item with a URL.
  const refs: Array<[string, string]> = []
  report.subtopics.forEach((s) => s.itemIds.forEach((id) => refs.push([`subtopic ${s.id}`, id])))
  report.questions.forEach((q, i) => refs.push([`question ${i + 1}`, q.itemId]))
  report.quotes.forEach((q, i) => refs.push([`quote ${i + 1}`, q.itemId]))
  report.ideas.forEach((idea) => idea.evidenceItemIds.forEach((id) => refs.push([`idea ${idea.id}`, id])))
  report.news.forEach((n, i) => refs.push([`news ${i + 1}`, n.itemId]))
  report.ownVoice?.posts.forEach((p, i) => refs.push([`own post ${i + 1}`, p.itemId]))
  for (const [where, id] of refs) {
    const it = byId.get(id)
    if (!it) fail.push(`${where}: unknown item ${id}`)
    else if (!/^https?:\/\//.test(it.url)) fail.push(`${where}: item ${id} has no link`)
  }

  // Ideas: enough distinct evidence, all of it people's posts about the topic.
  for (const idea of report.ideas) {
    const ev = new Set(idea.evidenceItemIds)
    if (ev.size < LIMITS.minIdeaEvidence) fail.push(`idea ${idea.id}: only ${ev.size} evidence items`)
    for (const id of ev) {
      const it = byId.get(id)
      if (it && !isPublicConversation(it)) fail.push(`idea ${idea.id}: evidence ${id} is not a person's post about the topic`)
    }
    if (!idea.headline.trim()) fail.push(`idea ${idea.id}: empty headline`)
  }

  // Quotes and questions: verbatim, from people's own words about the topic; questions are real questions.
  for (const q of report.quotes) {
    const it = byId.get(q.itemId)
    if (!it) continue
    if (!isVerbatim(q.text, `${it.title}\n${it.text}`)) fail.push(`quote not verbatim: "${q.text.slice(0, 60)}"`)
    if (!isVoice(it)) fail.push(`quote not from a person's post about the topic: "${q.text.slice(0, 60)}"`)
  }
  for (const q of report.questions) {
    const it = byId.get(q.itemId)
    if (!it) continue
    if (!isVerbatim(q.text, `${it.title}\n${it.text}`)) fail.push(`question not verbatim: "${q.text.slice(0, 60)}"`)
    if (!isVoice(it)) fail.push(`question not from a person's post about the topic: "${q.text.slice(0, 60)}"`)
    if (!isRealQuestion(q.text)) fail.push(`not a real question: "${q.text.slice(0, 60)}"`)
  }

  // The institution's own posts stay out of everything people said.
  for (const p of report.ownVoice?.posts ?? []) {
    const it = byId.get(p.itemId)
    if (it && it.labels?.speaker !== "self") fail.push(`own post ${p.itemId} is not from the institution's own account`)
  }

  // Figures add up over the sample.
  const s = report.sentiment
  if (s.positive + s.neutral + s.negative + s.mixed !== sample.length) {
    fail.push(`sentiment counts (${s.positive + s.neutral + s.negative + s.mixed}) != sample (${sample.length})`)
  }
  if (report.totals.relevant !== sample.length) fail.push(`totals.relevant ${report.totals.relevant} != ${sample.length}`)
  const ex = sampleExclusions(items)
  const tx = report.totals.excluded
  if (tx.mentions !== ex.mentions || tx.self !== ex.self || tx.organizations !== ex.organizations || tx.media !== ex.media) {
    fail.push(`excluded counts ${JSON.stringify(tx)} != ${JSON.stringify(ex)}`)
  }
  const subSum = report.subtopics.reduce((n, x) => n + x.count, 0)
  if (subSum > sample.length) fail.push(`subtopic counts ${subSum} exceed sample ${sample.length}`)
  const platSum = report.platforms.reduce((n, p) => n + p.count, 0)
  if (platSum !== sample.length) fail.push(`platform counts ${platSum} != sample ${sample.length}`)
  for (const sub of report.subtopics) {
    if (sub.itemIds.length !== sub.count) fail.push(`subtopic ${sub.id}: count ${sub.count} != ${sub.itemIds.length} items`)
    for (const id of sub.itemIds) {
      const it = byId.get(id)
      if (it && !isPublicConversation(it)) fail.push(`subtopic ${sub.id}: item ${id} is outside the sample`)
    }
  }
  if (report.thin !== sample.length < LIMITS.thinThreshold) fail.push(`thin flag ${report.thin} disagrees with sample ${sample.length}`)

  // House style: no em or en dashes anywhere the model wrote.
  const texts = [
    report.summary,
    report.interpretation,
    report.ownVoice?.note ?? "",
    ...report.subtopics.flatMap((x) => [x.name, x.summary]),
    ...report.ideas.flatMap((i) => [i.headline, i.angle, i.whyNow, ...i.outline]),
  ]
  for (const t of texts) if (/[–—]/.test(t)) fail.push(`dash in: "${t.slice(0, 60)}"`)

  // The model was told not to state numbers; percentages in prose would be unverified.
  for (const t of [report.summary, report.ownVoice?.note ?? "", ...report.subtopics.map((x) => x.summary)]) {
    if (/\d+(\.\d+)?\s*%/.test(t)) fail.push(`percentage in model text: "${t.slice(0, 60)}"`)
  }
  return fail
}
