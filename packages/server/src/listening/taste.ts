/**
 * What a person and their team have made of earlier ideas, turned into a few
 * lines the model sees when it writes new ones: thumbs up and saved ideas are
 * "liked", thumbs down is "passed on". It steers which ideas get written. It
 * is never evidence, and nothing is trained on it.
 */
import type { Store } from "./store.js"
import type { IdeaTaste } from "./types.js"

const MAX_LINES = 8

const line = (i: { headline: string; format: string; audience: string }) => `${i.headline} (${i.format}, for ${i.audience})`

/**
 * Taste for writing ideas on one topic as one person: votes on this topic by
 * anyone who can read it, then that person's votes elsewhere, then the ideas
 * on their board. An idea liked by one person and passed on by another says
 * nothing either way and is left out.
 */
export async function ideaTaste(store: Store, topicId: string, userEmail: string): Promise<IdeaTaste> {
  const [here, mine, saved] = await Promise.all([
    store.listVotes({ topicId, limit: 60 }),
    store.listVotes({ createdBy: userEmail, limit: 60 }),
    store.listSavedIdeas(userEmail),
  ])
  const liked = new Map<string, string>()
  const passed = new Map<string, string>()
  for (const v of [...here, ...mine]) {
    const into = v.vote === 1 ? liked : passed
    if (!into.has(v.fingerprint)) into.set(v.fingerprint, line(v.idea))
  }
  for (const s of saved) if (s.status !== "dropped" && !liked.has(s.fingerprint)) liked.set(s.fingerprint, line(s.idea))
  for (const fp of [...liked.keys()]) {
    if (!passed.has(fp)) continue
    liked.delete(fp)
    passed.delete(fp)
  }
  return { liked: [...liked.values()].slice(0, MAX_LINES), passed: [...passed.values()].slice(0, MAX_LINES) }
}
