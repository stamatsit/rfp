/**
 * Run a real scan from the terminal against an in-memory store, then
 * optionally a rescan, and check the report's invariants.
 *
 *   cd packages/server && npx tsx src/listening/cli.ts "online nursing degree" [--rescan] [--window 1y]
 *
 * Search/API responses go through the dev file cache (.cache/listening), so
 * re-running the same topic the same day costs no Google quota.
 */
import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { checkReport } from "./checks.js"
import { buildDeps } from "./deps.js"
import { executeRun, startRun } from "./engine.js"
import { MemoryStore } from "./store.js"
import type { RunEvent, TimeWindow } from "./types.js"

async function main() {
  const args = process.argv.slice(2)
  const query = args.find((a) => !a.startsWith("--"))
  if (!query) throw new Error('usage: cli.ts "topic" [--rescan] [--window 3m|1y|any]')
  const rescan = args.includes("--rescan")
  const wi = args.indexOf("--window")
  const timeWindow = (wi >= 0 ? args[wi + 1] : "1y") as TimeWindow

  const store = new MemoryStore()
  const stageAt = new Map<string, number>()
  let last = Date.now()
  const emit = (e: RunEvent) => {
    const now = Date.now()
    if (e.type === "stage") {
      console.log(`  +${((now - last) / 1000).toFixed(1)}s  stage ${e.stage}${e.detail ? ` (${e.detail})` : ""}`)
      stageAt.set(e.stage, now)
      last = now
    } else if (e.type === "lane") {
      console.log(`         lane ${e.lane.label.padEnd(8)} ${e.lane.status.padEnd(7)} ${String(e.lane.count).padStart(3)}  ${e.lane.note ?? ""}`)
    } else if (e.type === "plan") {
      console.log(`         plan: ${e.plan.searches.map((s) => s.q).join(" | ")}`)
      if (e.plan.disambiguation) console.log(`         off-topic: ${e.plan.disambiguation}`)
    } else if (e.type === "error") {
      console.log(`  ERROR ${e.message}`)
    }
  }

  const run = async (trigger: "initial" | "rescan", topicId?: string) => {
    const deps = buildDeps({ store, cacheDir: path.resolve(process.cwd(), ".cache/listening") })
    const t0 = Date.now()
    last = t0
    const { topic, runId } =
      trigger === "initial"
        ? await startRun(store, { trigger, createdBy: "cli@local", query, timeWindow })
        : await startRun(store, { trigger, createdBy: "cli@local", topicId: topicId! })
    console.log(`\n=== ${trigger}: ${query}`)
    const status = await executeRun(deps, { topic, runId, trigger }, emit)
    const t = await store.getTopic(topic.id)
    const items = await store.allItems(topic.id)
    const r = t?.report
    const u = deps.llm.usage()
    console.log(`  status ${status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, model calls ${u.calls}, cost $${u.costUsd.toFixed(4)}`)
    if (!r) return topic.id
    const x = r.totals.excluded
    console.log(`  items ${r.totals.collected} (new ${r.totals.newThisRun}, read in full ${r.totals.fullyRead}), people about it ${r.totals.relevant}, sentiment score ${r.sentiment.score}`)
    console.log(`  not counted: ${x.mentions} passing mentions, ${x.self} own accounts, ${x.organizations} organizations, ${x.media} media`)
    if (r.ownVoice) console.log(`  own voice (${r.ownVoice.name}, ${r.ownVoice.count}): ${r.ownVoice.note}`)
    console.log(`  search calls ${r.coverage.searchCalls}, YouTube units ${r.coverage.youtubeUnits}, analysis ${r.analysisSource}${r.thin ? ", THIN" : ""}`)
    if (r.coverage.notes.length) console.log(`  notes: ${r.coverage.notes.join(" | ")}`)
    if (r.warnings.length) console.log(`  warnings: ${r.warnings.join(" | ")}`)
    console.log(`  summary: ${r.summary}`)
    for (const s of r.subtopics) console.log(`  [${s.id}] ${s.name} (${s.count}, ${s.share}%, score ${s.sentiment.score}, new ${s.newCount})`)
    console.log(`  questions: ${r.questions.length}, quotes: ${r.quotes.length}, ideas: ${r.ideas.length}, news: ${r.news.length}`)
    for (const i of r.ideas) console.log(`   - ${i.headline} [${i.format}, ${i.audience}, ${i.evidenceItemIds.length} sources]`)
    for (const q of r.questions.slice(0, 5)) console.log(`   ? ${q.text}`)
    const failures = checkReport(r, items)
    console.log(failures.length ? `  CHECKS FAILED (${failures.length}):\n   ${failures.join("\n   ")}` : "  checks: all invariants hold")
    const out = path.resolve(process.cwd(), ".cache/listening-runs")
    fs.mkdirSync(out, { recursive: true })
    const file = path.join(out, `${query.replace(/\W+/g, "-").toLowerCase()}-${trigger}.json`)
    fs.writeFileSync(file, JSON.stringify({ report: r, items }, null, 2))
    console.log(`  saved ${file}`)
    return topic.id
  }

  const id = await run("initial")
  if (rescan) await run("rescan", id)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
