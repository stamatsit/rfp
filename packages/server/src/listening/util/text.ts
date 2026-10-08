/**
 * Text helpers. The verbatim checks are the honesty guarantee: a quote or a
 * question is only shown if it can be found in text we actually fetched.
 */

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#x2F;": "/",
  "&hellip;": "...",
  "&mdash;": "-",
  "&ndash;": "-",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp|#x2F|hellip|mdash|ndash|rsquo|lsquo|rdquo|ldquo);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}

/** Collapse whitespace and clip, cutting at a word boundary. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(" ")
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trimEnd() + "..."
}

/** Normalization used for verbatim matching: case, quotes, dashes, whitespace, ellipses. */
export function normForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * True when `needle` appears in `haystack` after normalization. A quote that
 * the model trimmed with "..." in the middle is accepted only if every
 * segment appears, in order.
 */
export function isVerbatim(needle: string, haystack: string): boolean {
  const n = normForMatch(needle).replace(/^["']+|["']+$/g, "").trim()
  if (n.length < 8) return false
  const h = normForMatch(haystack)
  if (h.includes(n)) return true
  const parts = n.split(/\s*\.\.\.\s*/).map((p) => p.trim()).filter((p) => p.length >= 6)
  if (parts.length < 2) return false
  let from = 0
  for (const p of parts) {
    const at = h.indexOf(p, from)
    if (at < 0) return false
    from = at + p.length
  }
  return true
}

/**
 * Find the original-case span in `haystack` matching `needle`, so the UI
 * shows the author's exact words rather than the model's casing.
 */
export function originalSpan(needle: string, haystack: string): string {
  const n = normForMatch(needle).replace(/^["']+|["']+$/g, "").trim()
  const flat = haystack.replace(/\s+/g, " ")
  const lower = normForMatch(flat)
  const at = lower.indexOf(n)
  if (at < 0 || lower.length !== flat.length) return needle.trim()
  return flat.slice(at, at + n.length)
}

/** Question sentences in a text, used when the model's question does not verify. */
export function questionSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ")
  const out: string[] = []
  const re = /[^.!?\n]{12,240}\?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(flat))) {
    const q = m[0].trim().replace(/^[-*>\s"']+/, "")
    if (q.split(" ").length >= 4) out.push(q)
  }
  return out
}

/** Significant query tokens for a cheap relevance pre-check. */
const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "at", "is", "it", "my", "your", "how", "what",
  "why", "do", "does", "are", "be", "with", "about", "vs", "versus", "best", "inc", "llc", "co",
])

export function queryTokens(q: string): string[] {
  return normForMatch(q)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0
}
