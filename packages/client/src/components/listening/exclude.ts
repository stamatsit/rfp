/**
 * Words to leave out of a scan, as typed in the search form. The server
 * validates the same way (listening/exclude.ts); this copy lets the form say
 * what is wrong before a scan is asked for.
 */

export const MAX_EXCLUDE_TERMS = 8

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** "sports, -rankings, "greek life"" becomes ["sports", "rankings", "greek life"], repeats merged. */
export function parseExclusions(text: string): string[] {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const entry of text.split(/[,\n]/)) {
    const term = entry
      .replace(/["“”]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s+-]+/, "")
      .trim()
    const key = norm(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    terms.push(term)
  }
  return terms
}

const mentions = (text: string, term: string) => {
  const n = norm(term)
  const hay = ` ${norm(text)} `
  return !!n && [n, `${n}s`, `${n}es`].some((f) => hay.includes(` ${f} `))
}

/** Why this list cannot be used with this topic, or null when it can. */
export function excludeProblem(terms: string[], topic: string): string | null {
  for (const t of terms) {
    if (norm(t).length < 2 || t.length > 40) return "Each word or phrase to leave out needs 2 to 40 characters."
    if (norm(t).split(" ").length > 4) return "Keep each phrase to four words or fewer."
  }
  if (terms.length > MAX_EXCLUDE_TERMS) return `Leave out up to ${MAX_EXCLUDE_TERMS} words or phrases.`
  const clash = terms.find((t) => mentions(topic, t))
  if (clash) return `"${clash}" is part of the topic, so leaving it out would leave out everything.`
  return null
}
