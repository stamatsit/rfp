import React from "react"
import DOMPurify from "dompurify"

interface MarkdownRendererProps {
  content: string
}

function renderMarkdown(raw: string): string {
  let html = raw

  // Code blocks (triple backtick) — must be done before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = code.replace(/</g, "&lt;").replace(/>/g, "&gt;").trimEnd()
    return `<pre class="md-code-block"><code>${escaped}</code></pre>`
  })

  // Inline code (single backtick)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')

  // Headings (most specific first: ##### → #)
  html = html.replace(/^#{5,}\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^#### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr" />')

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>')

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")

  // Tables: detect | header | header | pattern
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_match, headerRow: string, _separator, bodyRows: string) => {
      const headers = headerRow.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim())
      const rows = bodyRows.trim().split("\n").map((row: string) =>
        row.split("|").filter((c: string) => c.trim()).map((c: string) => c.trim())
      )
      const headerHtml = headers.map((h: string) => `<th class="md-th">${h}</th>`).join("")
      const bodyHtml = rows.map((row: string[]) =>
        `<tr>${row.map((c: string) => `<td class="md-td">${c}</td>`).join("")}</tr>`
      ).join("")
      return `<table class="md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
    }
  )

  // Extract SVG blocks before line processing (they span multiple lines)
  // Handle both inline SVG and SVG_DATA: marker from streaming
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
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/)
    const numberMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/)

    // Check for SVG placeholder
    const svgPlaceholder = line.trim().match(/^__SVG_BLOCK_(\d+)__$/)
    if (svgPlaceholder) {
      if (inList) {
        processed.push(`</${inList}>`)
        inList = null
      }
      processed.push(svgBlocks[parseInt(svgPlaceholder[1]!)]!)
      continue
    }

    if (bulletMatch) {
      if (inList !== "ul") {
        if (inList) processed.push(`</${inList}>`)
        processed.push('<ul class="md-ul">')
        inList = "ul"
      }
      processed.push(`<li>${bulletMatch[1]}</li>`)
    } else if (numberMatch) {
      if (inList !== "ol") {
        if (inList) processed.push(`</${inList}>`)
        processed.push('<ol class="md-ol">')
        inList = "ol"
      }
      processed.push(`<li>${numberMatch[2]}</li>`)
    } else {
      if (inList) {
        processed.push(`</${inList}>`)
        inList = null
      }
      // Skip empty lines, don't wrap already-processed HTML tags
      if (line.trim() === "") {
        // Empty line = paragraph break (small spacer div)
        processed.push('<div class="md-spacer"></div>')
      } else if (line.startsWith("<h") || line.startsWith("<pre") || line.startsWith("<table") || line.startsWith("<hr")) {
        processed.push(line)
      } else {
        processed.push(`<p class="md-p">${line}</p>`)
      }
    }
  }
  if (inList) processed.push(`</${inList}>`)

  html = processed.join("")

  return html
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = React.useMemo(() => {
    const rendered = renderMarkdown(content)
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [
        "a", "strong", "em", "br", "ul", "ol", "li", "p", "div",
        "h2", "h3", "pre", "code", "table", "thead",
        "tbody", "tr", "th", "td", "hr",
        // SVG elements
        "svg", "circle", "rect", "path", "text", "tspan", "line",
        "polyline", "polygon", "g", "defs", "use", "clipPath", "mask",
        "filter", "linearGradient", "radialGradient", "stop",
        "foreignObject", "marker", "pattern", "symbol", "title", "desc",
      ],
      ALLOWED_ATTR: [
        "class", "href", "target", "rel",
        // SVG attributes
        "viewBox", "xmlns", "d", "cx", "cy", "r", "rx", "ry",
        "x", "y", "x1", "y1", "x2", "y2", "width", "height",
        "fill", "stroke", "stroke-width", "stroke-linecap",
        "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
        "opacity", "transform", "font-family", "font-size",
        "font-weight", "text-anchor", "dominant-baseline", "points",
        "offset", "stop-color", "stop-opacity", "gradientUnits",
        "id", "href", "xlink:href", "preserveAspectRatio",
        "clip-path", "mask", "filter",
      ],
    })
  }, [content])

  return (
    <div className="prose prose-slate prose-sm max-w-none">
      <div
        className="md-content leading-[1.7] text-slate-700 dark:text-slate-200 text-[15px]
                    [&_.md-p]:my-0 [&_.md-p]:leading-[1.7]
                    [&_.md-spacer]:h-3
                    [&_.md-h2]:text-lg [&_.md-h2]:font-semibold [&_.md-h2]:text-slate-900 [&_.md-h2]:dark:text-white [&_.md-h2]:mt-4 [&_.md-h2]:mb-2
                    [&_.md-h3]:text-base [&_.md-h3]:font-semibold [&_.md-h3]:text-slate-800 [&_.md-h3]:dark:text-slate-100 [&_.md-h3]:mt-3 [&_.md-h3]:mb-1.5
                    [&_.md-ul]:list-disc [&_.md-ul]:pl-5 [&_.md-ul]:my-2 [&_.md-ul]:space-y-1
                    [&_.md-ol]:list-decimal [&_.md-ol]:pl-5 [&_.md-ol]:my-2 [&_.md-ol]:space-y-1
                    [&_li]:text-[15px] [&_li]:leading-relaxed
                    [&_.md-code-block]:bg-slate-100 [&_.md-code-block]:dark:bg-slate-900 [&_.md-code-block]:rounded-lg [&_.md-code-block]:p-3 [&_.md-code-block]:my-2 [&_.md-code-block]:overflow-x-auto [&_.md-code-block]:text-sm [&_.md-code-block]:font-mono [&_.md-code-block]:whitespace-pre
                    [&_.md-inline-code]:bg-slate-100 [&_.md-inline-code]:dark:bg-slate-800 [&_.md-inline-code]:rounded [&_.md-inline-code]:px-1.5 [&_.md-inline-code]:py-0.5 [&_.md-inline-code]:text-sm [&_.md-inline-code]:font-mono
                    [&_.md-table]:w-full [&_.md-table]:my-3 [&_.md-table]:border-collapse
                    [&_.md-th]:text-left [&_.md-th]:text-xs [&_.md-th]:font-semibold [&_.md-th]:text-slate-600 [&_.md-th]:dark:text-slate-300 [&_.md-th]:px-3 [&_.md-th]:py-2 [&_.md-th]:border-b [&_.md-th]:border-slate-200 [&_.md-th]:dark:border-slate-700 [&_.md-th]:bg-slate-50 [&_.md-th]:dark:bg-slate-800/50
                    [&_.md-td]:text-sm [&_.md-td]:px-3 [&_.md-td]:py-1.5 [&_.md-td]:border-b [&_.md-td]:border-slate-100 [&_.md-td]:dark:border-slate-800
                    [&_.md-hr]:border-slate-200 [&_.md-hr]:dark:border-slate-700 [&_.md-hr]:my-4
                    [&_.md-link]:text-blue-600 [&_.md-link]:dark:text-blue-400 [&_.md-link]:underline [&_.md-link]:underline-offset-2 [&_.md-link]:decoration-blue-300 [&_.md-link]:dark:decoration-blue-600 [&_.md-link]:hover:text-blue-700 [&_.md-link]:dark:hover:text-blue-300 [&_.md-link]:transition-colors"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
