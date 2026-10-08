/**
 * Runs a scan end to end: plan, search, read, label, group, write, save.
 *
 * startRun() creates the topic/run rows (and refuses a second concurrent run
 * on the same topic); executeRun() does the work and always settles the run
 * row: complete, failed or cancelled. Progress is streamed through `emit`,
 * but the run never depends on anyone listening: a closed browser tab does not
 * stop it, an explicit Cancel does.
 */
import { DEADLINES_MS, LIMITS } from "./config.js"
import { clusterSubtopics, fallbackClusters, type Cluster } from "./cluster.js"
import { harvest, type HarvestDeps } from "./harvest.js"
import { labelItems } from "./label.js"
import type { LlmClient } from "./llm.js"
import { collectQuestions, isConversation, sentimentOf } from "./metrics.js"
import { extendPlan, fallbackPlan, makePlan } from "./plan.js"
import { buildReport, groupSubtopics, subtopicInputs } from "./report.js"
import { within, type Store } from "./store.js"
import { synthesize, type SynthResult } from "./synthesize.js"
import { RunCancelled, type Coverage, type Plan, type RunEvent, type RunTrigger, type TimeWindow, type TopicRow } from "./types.js"
import { describeError } from "./util/http.js"

export interface EngineDeps extends HarvestDeps {
  store: Store
  llm: LlmClient
}

export type Emit = (e: RunEvent) => void

/**
 * Runs executing in this process. Cancel aborts them immediately here; on
 * Vercel the cancel request may land on another instance, so the database
 * flag (polled every 2.5s) is the cross-instance path.
 */
const localRuns = new Map<string, AbortController>()

export function abortLocalRun(runId: string): boolean {
  const c = localRuns.get(runId)
  if (!c) return false
  c.abort(new RunCancelled())
  return true
}

export class TopicNotFound extends Error {
  constructor() {
    super("Topic not found")
    this.name = "TopicNotFound"
  }
}

export async function startRun(
  store: Store,
  input:
    | { trigger: "initial"; createdBy: string; query: string; timeWindow: TimeWindow }
    | { trigger: "rescan" | "rebuild"; createdBy: string; topicId: string },
): Promise<{ topic: TopicRow; runId: string }> {
  if (input.trigger === "initial") {
    const topic = await store.createTopic({ createdBy: input.createdBy, query: input.query, timeWindow: input.timeWindow })
    const runId = await store.createRun(topic.id, input.createdBy, "initial")
    await store.updateTopic(topic.id, { lastRunStatus: "running", lastRunAt: new Date().toISOString() })
    return { topic, runId }
  }
  const topic = await store.getTopic(input.topicId)
  if (!topic) throw new TopicNotFound()
  const runId = await store.createRun(topic.id, input.createdBy, input.trigger)
  await store.updateTopic(topic.id, { lastRunStatus: "running", lastRunAt: new Date().toISOString() })
  return { topic, runId }
}

/**
 * One line per distinct failure reason ("Reddit, Forums, Social: daily allowance
 * used up") instead of one per source, without repeating a general note that
 * says the same thing.
 */
export function groupLaneNotes(lanes: Coverage["lanes"], general: string[]): string[] {
  const byReason = new Map<string, string[]>()
  for (const l of lanes) {
    if (l.status !== "failed") continue
    const reason = l.note ?? "did not answer"
    byReason.set(reason, [...(byReason.get(reason) ?? []), l.label])
  }
  const grouped = [...byReason.entries()].map(([reason, labels]) => `${labels.join(", ")}: ${reason}`)
  const rest = general.filter((n) => !byReason.has(n))
  return [...grouped, ...rest]
}

function emptyCoverage(): Coverage {
  return { lanes: [], degraded: false, notes: [], searchCalls: 0, youtubeUnits: 0 }
}

export async function executeRun(
  deps: EngineDeps,
  args: { topic: TopicRow; runId: string; trigger: RunTrigger },
  emit: Emit,
  outerSignal?: AbortSignal,
): Promise<"complete" | "failed" | "cancelled"> {
  const { store, llm } = deps
  const { topic, runId, trigger } = args
  const started = Date.now()
  const ctrl = new AbortController()
  localRuns.set(runId, ctrl)
  const hardDeadline = setTimeout(() => ctrl.abort(new Error("The scan hit its time limit")), DEADLINES_MS.run)
  const onOuter = () => ctrl.abort(outerSignal?.reason ?? new RunCancelled())
  outerSignal?.addEventListener("abort", onOuter, { once: true })
  const cancelPoll = setInterval(() => {
    store
      .isCancelRequested(runId)
      .then((c) => c && ctrl.abort(new RunCancelled()))
      .catch(() => {})
  }, 2500)
  const signal = ctrl.signal
  const check = () => {
    if (signal.aborted) throw signal.reason ?? new RunCancelled()
  }

  const warnings: string[] = []
  const coverage = emptyCoverage()
  let newItems = 0
  emit({ type: "started", topicId: topic.id, runId, trigger })

  try {
    // ── Plan ───────────────────────────────────────────────────────────────
    let plan: Plan = topic.plan ?? fallbackPlan(topic.query)
    if (trigger === "initial") {
      emit({ type: "stage", stage: "plan" })
      try {
        plan = await makePlan(llm, topic.query, signal)
      } catch (err) {
        check()
        plan = fallbackPlan(topic.query)
        warnings.push(`Search rewrites were unavailable (${describeError(err)}); searched the topic as written`)
      }
    } else if (trigger === "rescan") {
      try {
        plan = await extendPlan(llm, topic.query, plan, runId, signal)
      } catch {
        check()
      }
    }
    emit({ type: "plan", plan })
    // Keep the plan even if this run fails later, so "Try again" reuses it (and its broader suggestions).
    if (trigger !== "rebuild") await store.updateTopic(topic.id, { plan })
    check()

    // ── Search and read ────────────────────────────────────────────────────
    if (trigger !== "rebuild") {
      emit({ type: "stage", stage: "search" })
      const existing = await store.existingCanonicalUrls(topic.id)
      const h = await harvest(deps, {
        query: topic.query,
        plan,
        runId,
        timeWindow: topic.timeWindow,
        trigger,
        existing,
        signal,
        onLane: (lane) => emit({ type: "lane", lane }),
        onRead: (done, total) => {
          if (done === 0) emit({ type: "stage", stage: "read", detail: `${total}` })
        },
      })
      plan = h.plan
      coverage.lanes = h.lanes
      coverage.searchCalls = h.searchCalls
      coverage.serperCalls = h.serperCalls
      coverage.youtubeUnits = h.youtubeUnits
      coverage.notes.push(...groupLaneNotes(h.lanes, h.notes))
      coverage.degraded = h.lanes.some((l) => l.status === "failed") || h.notes.some((n) => /could not be opened|used up/.test(n))
      check()
      const inserted = await store.insertItems(topic.id, runId, h.items)
      newItems = inserted.length
      await store.updateTopic(topic.id, { plan })
      emit({ type: "counts", collected: existing.size + newItems, newItems, fullyRead: h.fullyRead })
      const allFailed = h.lanes.length > 0 && h.lanes.every((l) => l.status !== "ok")
      if (allFailed && existing.size === 0) {
        throw new Error(coverage.notes[0] ?? "No source answered. Check the search keys and try again.")
      }
    } else {
      coverage.lanes = topic.report?.coverage.lanes ?? []
      coverage.notes.push("Rebuilt from items already collected; no new search was run")
    }
    check()

    // ── Label (new and any previously unlabeled items) ─────────────────────
    const toLabel = await store.unlabeledItems(topic.id, LIMITS.maxNewItemsPerRun)
    if (toLabel.length) {
      emit({ type: "stage", stage: "label", detail: `${toLabel.length}` })
      const outcome = await labelItems(llm, toLabel, { query: topic.query, plan }, {
        signal,
        stopAt: started + 175_000,
        onProgress: (n) => emit({ type: "counts", labeled: n }),
      })
      await store.saveLabels(outcome.labels)
      if (outcome.deferred) warnings.push(`${outcome.deferred} items will be analysed on the next scan (time limit)`)
      if (outcome.missing) warnings.push(`${outcome.missing} items could not be analysed`)
      if (outcome.labels.size === 0 && toLabel.length > 0) {
        warnings.push("The analysis model did not answer; showing collected sources without labels")
      }
    }
    check()

    // ── Group and write ────────────────────────────────────────────────────
    const items = await store.allItems(topic.id)
    const relevant = items.filter((it) => it.labels?.relevant)
    const conv = relevant.filter(isConversation)
    let clusters: Cluster[] = []
    if (conv.length) {
      emit({ type: "stage", stage: "cluster" })
      const previous = topic.report?.subtopics.map((s) => s.name) ?? []
      try {
        clusters = await clusterSubtopics(llm, topic.query, conv, previous, signal)
      } catch (err) {
        check()
        clusters = fallbackClusters(conv)
        warnings.push(`Subtopic grouping fell back to raw labels (${describeError(err)})`)
      }
    }
    const grouping = groupSubtopics(conv, clusters, runId)

    let synth: SynthResult | null = null
    if (conv.length >= 3) {
      emit({ type: "stage", stage: "write" })
      try {
        synth = await synthesize(
          llm,
          {
            query: topic.query,
            plan,
            subtopics: subtopicInputs(grouping, conv),
            questions: collectQuestions(relevant, grouping.subtopicOf, runId),
            overall: sentimentOf(conv),
            relevantCount: conv.length,
          },
          signal,
        )
      } catch (err) {
        check()
        warnings.push(`Idea writing was unavailable (${describeError(err)}); use Rebuild to try again`)
      }
    }
    check()

    // ── Save ───────────────────────────────────────────────────────────────
    emit({ type: "stage", stage: "save" })
    const runs = (await store.listRuns(topic.id)).filter((r) => r.status === "complete" || r.id === runId).length
    const report = buildReport({
      topicId: topic.id,
      runId,
      query: topic.query,
      plan,
      items,
      grouping,
      synth,
      coverage,
      runs,
      newThisRun: newItems,
      warnings,
    })
    const usage = llm.usage()
    await store.updateTopic(topic.id, {
      report,
      plan,
      itemCount: items.length,
      relevantCount: report.totals.relevant,
      sentimentScore: report.totals.relevant ? report.sentiment.score : null,
      headline: report.summary.slice(0, 280),
      lastRunAt: new Date().toISOString(),
      lastRunStatus: "complete",
    })
    await store.finishRun(runId, {
      status: "complete",
      newItems,
      totalItems: items.length,
      relevantItems: report.totals.relevant,
      sentimentScore: report.totals.relevant ? report.sentiment.score : null,
      searchCalls: coverage.searchCalls,
      youtubeUnits: coverage.youtubeUnits,
      costUsd: usage.costUsd,
      coverage,
    })
    emit({ type: "done", topicId: topic.id, runId })
    return "complete"
  } catch (err) {
    const cancelled = err instanceof RunCancelled || (signal.aborted && signal.reason instanceof RunCancelled)
    const message = cancelled ? "Scan cancelled" : describeError(err)
    // Tell the browser first; recording the outcome must never keep it waiting.
    emit({ type: "error", message, topicId: topic.id, runId })
    const record = (async () => {
      await store.finishRun(runId, {
        status: cancelled ? "cancelled" : "failed",
        newItems,
        searchCalls: coverage.searchCalls,
        youtubeUnits: coverage.youtubeUnits,
        costUsd: llm.usage().costUsd,
        coverage,
        error: cancelled ? null : message,
      })
      await store.updateTopic(topic.id, { lastRunStatus: cancelled ? "cancelled" : "failed" })
    })()
    // If the database is down too, the stale-run sweep settles the row later.
    await within(record, 8000, undefined)
    return cancelled ? "cancelled" : "failed"
  } finally {
    localRuns.delete(runId)
    clearTimeout(hardDeadline)
    clearInterval(cancelPoll)
    outerSignal?.removeEventListener("abort", onOuter)
  }
}
