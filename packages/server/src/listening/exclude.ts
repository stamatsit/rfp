/**
 * Words and phrases a scan leaves out ("negative keywords"), set when the
 * topic is first scanned and kept with it. They act in three places:
 *
 * 1. every search carries them as leave-out operators (-word, -"two words"),
 *    so fewer of the day's searches come back with posts nobody wants, and
 *    the planner is told not to write searches about them;
 * 2. anything collected that still mentions one is dropped before it is
 *    stored, and a post whose full text or a reply turns out to mention one is
 *    marked not relevant without asking the model.
 *
 * The second is the guarantee: no post that mentions an excluded word, as a
 * whole word or phrase, is counted in a report. It is about the words and
 * nothing looser: a post on the same subject that never uses them stays.
 */

export const MAX_EXCLUDE_TERMS = 8

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export type CleanExclusions = { ok: true; terms: string[] } | { ok: false; error: string }

/**
 * Validates what the form sent (a list, or one comma-separated string).
 * Quotation marks and leading operators are dropped, repeats are merged, and
 * a word that is part of the topic is refused, since leaving it out would
 * leave out everything.
 */
export function cleanExclusions(input: unknown, query: string): CleanExclusions {
  if (input === undefined || input === null || input === "") return { ok: true, terms: [] }
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\n]/) : null
  if (!raw || raw.some((t) => typeof t !== "string")) return { ok: false, error: "List the words to leave out, separated by commas" }
  const terms: string[] = []
  const seen = new Set<string>()
  for (const entry of raw as string[]) {
    const term = entry
      .replace(/["\u201C\u201D]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s+-]+/, "")
      .trim()
    const key = norm(term)
    if (!key || seen.has(key)) continue
    if (key.length < 2 || term.length > 40) return { ok: false, error: "Each word or phrase to leave out needs 2 to 40 characters" }
    if (key.split(" ").length > 4) return { ok: false, error: "Keep each phrase to leave out to four words or fewer" }
    seen.add(key)
    terms.push(term)
  }
  if (terms.length > MAX_EXCLUDE_TERMS) return { ok: false, error: `Leave out up to ${MAX_EXCLUDE_TERMS} words or phrases` }
  const clash = terms.find((t) => mentionsExcluded(query, [t]) !== null)
  if (clash) return { ok: false, error: `"${clash}" is part of the topic, so leaving it out would leave out everything` }
  return { ok: true, terms }
}

/**
 * The first excluded word or phrase this text mentions, or null. Whole words
 * only ("art" does not match "start"), any letter case, punctuation ignored,
 * and a simple plural of the last word counts ("sport" matches "sports").
 * It never guesses a singular: "news" must not match "new".
 */
export function mentionsExcluded(text: string, terms: readonly string[] | null | undefined): string | null {
  if (!terms?.length) return null
  const hay = ` ${norm(text)} `
  for (const term of terms) {
    const n = norm(term)
    if (!n) continue
    if ([n, `${n}s`, `${n}es`].some((f) => hay.includes(` ${f} `))) return term
  }
  return null
}

/** The search as typed, plus the leave-out operators Google, YouTube and Google News all understand. */
export function withExclusions(q: string, terms: readonly string[] | null | undefined): string {
  if (!terms?.length) return q
  return `${q} ${terms.map((t) => (/\s/.test(t.trim()) ? `-"${t.trim()}"` : `-${t.trim()}`)).join(" ")}`
}

/** "sports, graduate school and rankings" */
export function listExclusions(terms: readonly string[]): string {
  if (terms.length <= 1) return terms[0] ?? ""
  return `${terms.slice(0, -1).join(", ")} and ${terms[terms.length - 1]}`
}
