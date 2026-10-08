/**
 * Group the free-text subtopics from pass 1 into at most 8 named subtopics.
 * The model only names groups and assigns label strings to them; item counts
 * are computed in code. On rescans the previous names are offered so the
 * report stays recognisable from run to run.
 */
import { z } from "zod"
import { LIMITS } from "./config.js"
import type { LlmClient } from "./llm.js"
import type { Item } from "./types.js"
import { normForMatch } from "./util/text.js"

export interface Cluster {
  name: string
  description: string
  labels: string[]
}

const ClusterSchema = z.object({
  clusters: z.array(
    z.object({
      name: z.string().describe("2 to 5 words, sentence case, plain language a content writer would use"),
      description: z.string().describe("One sentence describing what this group of conversation covers"),
      labels: z.array(z.string()).describe("Every input label that belongs here, copied exactly"),
    }),
  ),
})

export function labelCounts(items: Item[]): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const it of items) {
    if (!it.labels?.relevant) continue
    const k = it.labels.subtopic
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export async function clusterSubtopics(
  llm: LlmClient,
  query: string,
  items: Item[],
  previous: string[],
  signal?: AbortSignal,
): Promise<Cluster[]> {
  const counts = labelCounts(items).slice(0, 220)
  if (counts.length === 0) return []
  const out = await llm.structured({
    name: "listening_clusters",
    schema: ClusterSchema,
    system: `You organise conversation about "${query}" into subtopics for a content team. Make each subtopic distinct and specific enough to write about. Use between 3 and ${LIMITS.maxSubtopics} subtopics. Assign every label to exactly one subtopic.`,
    user: `${previous.length ? `Subtopics used last time (keep these names where they still fit):\n${previous.map((p) => `- ${p}`).join("\n")}\n\n` : ""}Labels with how many posts used each:\n${counts.map(([l, n]) => `${l} (${n})`).join("\n")}`,
    maxTokens: 3500,
    signal,
  })
  return out.clusters
    .filter((c) => c.name.trim() && c.labels.length)
    .slice(0, LIMITS.maxSubtopics)
    .map((c) => ({ name: c.name.trim().slice(0, 60), description: c.description.trim().slice(0, 240), labels: c.labels.map((l) => normForMatch(l)) }))
}

/** Used when the clustering call fails: the most common labels become subtopics. */
export function fallbackClusters(items: Item[]): Cluster[] {
  return labelCounts(items)
    .slice(0, LIMITS.maxSubtopics - 1)
    .filter(([, n]) => n >= 2)
    .map(([l]) => ({ name: l.charAt(0).toUpperCase() + l.slice(1), description: "", labels: [l] }))
}

/** item id -> cluster index, by exact label; unassigned labels map to -1. */
export function assignClusters(items: Item[], clusters: Cluster[]): Map<string, number> {
  const byLabel = new Map<string, number>()
  clusters.forEach((c, i) => c.labels.forEach((l) => byLabel.has(l) || byLabel.set(l, i)))
  const out = new Map<string, number>()
  for (const it of items) {
    if (!it.labels?.relevant) continue
    out.set(it.id, byLabel.get(normForMatch(it.labels.subtopic)) ?? -1)
  }
  return out
}
