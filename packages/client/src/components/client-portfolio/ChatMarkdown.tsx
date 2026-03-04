import DOMPurify from "dompurify"

/**
 * Lightweight markdown→HTML for AI chat bubbles.
 * Handles bold, italic, headings, lists, code, and line breaks.
 * Uses DOMPurify for safety.
 */
function chatMarkdownToHtml(raw: string): string {
  if (!raw?.trim()) return ""

  let html = raw

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const escaped = (code as string).replace(/</g, "&lt;").replace(/>/g, "&gt;").trimEnd()
    return `<pre class="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs overflow-x-auto my-1.5"><code>${escaped}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs">$1</code>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<p class="font-semibold mt-2">$1</p>')
  html = html.replace(/^## (.+)$/gm, '<p class="font-semibold mt-2">$1</p>')
  html = html.replace(/^# (.+)$/gm, '<p class="font-bold mt-2">$1</p>')

  // Bold + italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")

  // Process lines for lists and paragraphs
  const lines = html.split("\n")
  const processed: string[] = []
  let inList: "ul" | "ol" | null = null

  for (const line of lines) {
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/)
    const numberMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/)

    if (bulletMatch) {
      if (inList !== "ul") {
        if (inList) processed.push(`</${inList}>`)
        processed.push('<ul class="list-disc pl-4 my-1 space-y-0.5">')
        inList = "ul"
      }
      processed.push(`<li>${bulletMatch[1]}</li>`)
    } else if (numberMatch) {
      if (inList !== "ol") {
        if (inList) processed.push(`</${inList}>`)
        processed.push('<ol class="list-decimal pl-4 my-1 space-y-0.5">')
        inList = "ol"
      }
      processed.push(`<li>${numberMatch[2]}</li>`)
    } else {
      if (inList) {
        processed.push(`</${inList}>`)
        inList = null
      }
      if (line.trim() === "") {
        // skip empties
      } else if (line.startsWith("<pre") || line.startsWith("<p ")) {
        processed.push(line)
      } else {
        processed.push(`<p>${line}</p>`)
      }
    }
  }
  if (inList) processed.push(`</${inList}>`)

  return DOMPurify.sanitize(processed.join(""))
}

export function ChatMarkdown({ text }: { text: string }) {
  const html = chatMarkdownToHtml(text)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
