/**
 * Converts markdown to HTML for insertion into TipTap editor.
 * Based on MarkdownRenderer's renderMarkdown() with image support added.
 */
export function markdownToHtml(raw: string): string {
  if (!raw || !raw.trim()) return ""

  let html = raw

  // Code blocks (triple backtick) — must be done before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = (code as string).replace(/</g, "&lt;").replace(/>/g, "&gt;").trimEnd()
    return `<pre><code>${escaped}</code></pre>`
  })

  // Inline code (single backtick)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Headings (### before ##, then #)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr />")

  // Images — before links so ![...](...) isn't caught by link regex
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")

  // Tables
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_match, headerRow: string, _separator, bodyRows: string) => {
      const headers = headerRow.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim())
      const rows = bodyRows.trim().split("\n").map((row: string) =>
        row.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim())
      )
      const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join("")
      const bodyHtml = rows.map((row: string[]) =>
        `<tr>${row.map((c: string) => `<td>${c}</td>`).join("")}</tr>`
      ).join("")
      return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
    }
  )

  // Extract SVG blocks before line processing (they span multiple lines)
  html = html.replace(/SVG_DATA:\s*(<svg[\s\S]*?<\/svg>)/g, '$1')
  const svgBlocks: string[] = []
  html = html.replace(/<svg[\s\S]*?<\/svg>/g, (match) => {
    const idx = svgBlocks.length
    svgBlocks.push(match)
    return `__SVG_BLOCK_${idx}__`
  })

  // Process lines for lists and paragraphs
  const lines = html.split("\n")
  const processed: string[] = []
  let inList: "ul" | "ol" | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Restore SVG blocks
    const svgPlaceholder = line.trim().match(/^__SVG_BLOCK_(\d+)__$/)
    if (svgPlaceholder) {
      if (inList) {
        processed.push(`</${inList}>`)
        inList = null
      }
      processed.push(svgBlocks[parseInt(svgPlaceholder[1]!)]!)
      continue
    }

    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/)
    const numberMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/)

    if (bulletMatch) {
      if (inList !== "ul") {
        if (inList) processed.push(`</${inList}>`)
        processed.push("<ul>")
        inList = "ul"
      }
      processed.push(`<li>${bulletMatch[1]}</li>`)
    } else if (numberMatch) {
      if (inList !== "ol") {
        if (inList) processed.push(`</${inList}>`)
        processed.push("<ol>")
        inList = "ol"
      }
      processed.push(`<li>${numberMatch[2]}</li>`)
    } else {
      if (inList) {
        processed.push(`</${inList}>`)
        inList = null
      }
      if (line.trim() === "") {
        // Skip empty lines — TipTap handles spacing
      } else if (
        line.startsWith("<h") ||
        line.startsWith("<pre") ||
        line.startsWith("<table") ||
        line.startsWith("<hr") ||
        line.startsWith("<img") ||
        line.startsWith("<blockquote")
      ) {
        processed.push(line)
      } else {
        processed.push(`<p>${line}</p>`)
      }
    }
  }
  if (inList) processed.push(`</${inList}>`)

  return processed.join("")
}

/**
 * Detects whether a string is markdown (vs HTML).
 * Used for migrating old saved content.
 */
export function isMarkdown(content: string): boolean {
  if (!content.trim()) return false
  // If it contains markdown heading markers but no HTML heading tags, it's markdown
  const hasMarkdownHeadings = /^#{1,3}\s/m.test(content)
  const hasHtmlHeadings = /<h[1-3][\s>]/i.test(content)
  if (hasMarkdownHeadings && !hasHtmlHeadings) return true
  // If it contains markdown bold but no <strong> tags
  const hasMarkdownBold = /\*\*.+?\*\*/.test(content)
  const hasHtmlBold = /<strong>/i.test(content)
  if (hasMarkdownBold && !hasHtmlBold) return true
  // If it contains markdown image syntax
  if (/!\[.*?\]\(.*?\)/.test(content)) return true
  // If it has no HTML tags at all, treat as markdown
  if (!/<[a-z][\s>]/i.test(content) && content.trim().length > 0) return true
  return false
}
