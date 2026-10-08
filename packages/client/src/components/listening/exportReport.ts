/**
 * Report export, built in the browser from the report and its sources: a PDF
 * to share and a Word file to edit. One content builder (exportBlocks) feeds
 * both renderers, so the two always say the same thing, in the page's reading
 * order, with every source linked.
 *
 * The PDF is drawn as real text with jsPDF (selectable, searchable, sharp at
 * any zoom, links that click), not a screenshot of the page.
 */
import type { ItemView, Platform, Report, RunSummary, SentimentBreakdown, TopicRow } from "@/types/listening"
import {
  AUDIENCE_LABEL,
  METHOD_TEXT,
  PLATFORM,
  SENTIMENT_COLOR,
  SENTIMENT_LABEL,
  WINDOW_LABEL,
  exclusionParts,
  fmtDate,
  isLegacyReport,
  joinList,
  pct,
  plural,
  sampleLabel,
  verdict,
} from "./ui"

export interface ExportInput {
  report: Report
  topic: TopicRow
  items: Map<string, ItemView>
  runs: RunSummary[]
}

// ─── content ────────────────────────────────────────────────────────────────

export type Block =
  | { t: "eyebrow"; text: string }
  | { t: "title"; text: string }
  | { t: "meta"; text: string }
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; text: string; tone?: "muted" | "strong" }
  | { t: "note"; text: string; tone: "amber" | "sky" }
  | { t: "bullets"; items: string[] }
  | { t: "sentiment"; s: SentimentBreakdown; label: string }
  | { t: "source"; label: string; text: string; url: string; quote?: boolean }

const SENTIMENT_ORDER = ["positive", "mixed", "neutral", "negative"] as const

function longDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function clipText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "..." : t
}

function sourceLabel(platform: Platform, date: string | null | undefined, extra?: string | null): string {
  return [PLATFORM[platform]?.label ?? "Web", extra, fmtDate(date)].filter(Boolean).join(" · ")
}

/** The report as an ordered list of blocks, in the same order as the page. */
export function exportBlocks({ report: r, topic, items, runs }: ExportInput): Block[] {
  const out: Block[] = []
  const scans = runs.filter((x) => x.status === "complete").length || 1
  const subName = new Map(r.subtopics.map((s) => [s.id, s.name]))
  const quoteOf = new Map(r.quotes.map((q) => [q.itemId, q.text]))
  const v = verdict(r.sentiment)

  out.push({ t: "eyebrow", text: "Stamats · Topic Ideation" })
  out.push({ t: "title", text: topic.query })
  out.push({ t: "meta", text: [sampleLabel(r), WINDOW_LABEL[topic.timeWindow], plural(scans, "scan"), `report of ${longDate(r.generatedAt)}`].join(" · ") })
  const left = exclusionParts(r)
  if (left.length) out.push({ t: "p", text: `Not counted: ${joinList(left)}.`, tone: "muted" })
  if (isLegacyReport(r)) {
    out.push({ t: "note", tone: "sky", text: "This report was made before the accuracy update and counts every relevant post. Use Refresh analysis in Topic Ideation to recount it." })
  }
  if (r.thin) {
    out.push({ t: "note", tone: "amber", text: r.totals.relevant ? `Only ${sampleLabel(r)} so far. Treat the figures below as a small sample.` : "No posts by people about this yet." })
  }

  out.push({ t: "h2", text: "What people are saying" })
  out.push({ t: "p", text: r.summary })
  out.push({ t: "sentiment", s: r.sentiment, label: v.label })
  const where = r.platforms.slice(0, 5).map((p) => `${PLATFORM[p.platform].label} ${pct(p.count, r.totals.relevant)}%`)
  out.push({
    t: "p",
    tone: "muted",
    text: [plural(r.platforms.length, "platform"), `${r.totals.fullyRead.toLocaleString()} read in full`, where.length ? `Where: ${where.join(", ")}` : ""].filter(Boolean).join(" · "),
  })

  out.push({ t: "h2", text: r.ideas.length ? `Content ideas (${r.ideas.length})` : "Content ideas" })
  if (!r.ideas.length) {
    out.push({
      t: "p",
      tone: "muted",
      text:
        r.totals.relevant < 3
          ? "Not enough conversation yet to suggest ideas."
          : r.analysisSource === "llm"
            ? "No idea had at least two posts that clearly back it up, so none are shown."
            : "Ideas were not written for this scan.",
    })
  }
  r.ideas.forEach((idea, i) => {
    out.push({ t: "h3", text: `${i + 1}. ${idea.headline}` })
    const sub = idea.subtopicId ? subName.get(idea.subtopicId) : null
    out.push({ t: "p", tone: "muted", text: [idea.format.charAt(0).toUpperCase() + idea.format.slice(1), `for ${AUDIENCE_LABEL[idea.audience].toLowerCase()}`, sub].filter(Boolean).join(" · ") })
    out.push({ t: "p", text: idea.angle })
    if (idea.whyNow) out.push({ t: "p", text: `Why now: ${idea.whyNow}` })
    if (idea.outline.length) out.push({ t: "bullets", items: idea.outline })
    out.push({ t: "p", tone: "strong", text: `Sources (${idea.evidenceItemIds.length})` })
    for (const id of idea.evidenceItemIds) {
      const it = items.get(id)
      if (!it) continue
      const q = quoteOf.get(id)
      out.push({ t: "source", label: sourceLabel(it.platform, it.publishedAt), text: q ?? clipText(it.kind === "comment" || !it.title ? it.excerpt : `${it.title}: ${it.excerpt}`, 260), url: it.url, quote: !!q })
    }
  })

  if (r.questions.length) {
    out.push({ t: "h2", text: `Questions people ask (${r.questions.length})` })
    for (const q of r.questions) out.push({ t: "source", label: sourceLabel(q.platform, null, AUDIENCE_LABEL[q.audience]), text: q.text, url: q.url })
  }

  if (r.subtopics.length) {
    out.push({ t: "h2", text: "Subtopics" })
    for (const s of r.subtopics) {
      out.push({ t: "h3", text: s.name })
      out.push({ t: "p", tone: "muted", text: `${s.share}% of the conversation · ${plural(s.count, "post")} · ${verdict(s.sentiment).label}` })
      out.push({ t: "p", text: s.summary })
    }
  }

  if (r.quotes.length) {
    out.push({ t: "h2", text: "In their words" })
    for (const q of r.quotes) out.push({ t: "source", label: sourceLabel(q.platform, null, SENTIMENT_LABEL[q.sentiment]), text: q.text, url: q.url, quote: true })
  }

  if (r.ownVoice?.posts.length) {
    const own = r.ownVoice
    out.push({ t: "h2", text: `What ${own.name} says about itself` })
    out.push({ t: "p", tone: "muted", text: `${plural(own.count, "post")} from ${own.name}'s own accounts, kept apart from public opinion.` })
    if (own.note) out.push({ t: "p", text: own.note })
    for (const p of own.posts) out.push({ t: "source", label: sourceLabel(p.platform, p.publishedAt), text: p.title || p.excerpt, url: p.url })
  }

  if (r.news.length) {
    out.push({ t: "h2", text: "In the news" })
    for (const n of r.news) out.push({ t: "source", label: [n.source, fmtDate(n.publishedAt)].filter(Boolean).join(" · ") || "News", text: n.title, url: n.url })
  }

  out.push({ t: "h2", text: "How this was made" })
  out.push({ t: "p", text: METHOD_TEXT })
  if (topic.plan?.searches.length) out.push({ t: "p", text: `Searches used: ${topic.plan.searches.map((s) => s.q.replace(/"/g, "")).join("; ")}.` })
  if (r.coverage.lanes.length) {
    const lanes = r.coverage.lanes.map((l) => (l.status === "ok" ? `${l.label} ${l.count} found` : `${l.label} ${l.note ?? l.status}`))
    out.push({ t: "p", text: `Sources on the latest scan: ${lanes.join("; ")}.` })
  }
  const notes = [...r.coverage.notes, ...r.warnings]
  if (notes.length) out.push({ t: "bullets", items: notes })
  out.push({ t: "p", tone: "muted", text: `${plural(r.totals.collected, "item")} collected over ${plural(scans, "scan")}. Every number is counted from the posts themselves.` })
  return out
}

export function exportFilename(topic: TopicRow, report: Report, ext: "pdf" | "docx"): string {
  const day = (report.generatedAt || new Date().toISOString()).slice(0, 10)
  const name = topic.query.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return `Topic Ideation - ${name} - ${day}.${ext}`
}

/** Display form of a link: no protocol or www, shortened to fit. */
export function shortUrl(url: string, max = 90): string {
  const s = url.replace(/^https?:\/\/(www\.)?/, "")
  return s.length > max ? `${s.slice(0, max - 3)}...` : s
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const PAGE = { w: 612, h: 792, margin: 56, bottom: 64 }
const COLOR = { ink: "#0F172A", body: "#334155", muted: "#64748B", link: "#0369A1", rule: "#E2E8F0", accent: "#0284C7", amberBg: "#FFFBEB", amberRule: "#F59E0B", skyBg: "#F0F9FF", skyRule: "#0EA5E9" }

/** Windows-1252 extras that the PDF's built-in Helvetica can draw. */
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ")

/** Text the built-in PDF fonts can draw: drops emoji, private-use glyphs and scripts Helvetica lacks. */
export function pdfSafe(s: string): string {
  return [...s.normalize("NFC")]
    .filter((ch) => {
      const c = ch.codePointAt(0)!
      return (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch) || ch === "\n"
    })
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim()
}

export async function exportPdf(input: ExportInput): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true })
  doc.setProperties({ title: `${input.topic.query}: Topic Ideation`, creator: "Stamats Topic Ideation" })
  const width = PAGE.w - 2 * PAGE.margin
  let y = PAGE.margin

  const newPage = () => {
    doc.addPage()
    y = PAGE.margin
  }
  const room = (h: number) => {
    if (y + h > PAGE.h - PAGE.bottom) newPage()
  }
  const setText = (size: number, style: "normal" | "bold" | "italic" | "bolditalic", color: string) => {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(color)
  }
  const measure = (text: string, size: number, style: "normal" | "bold" | "italic" | "bolditalic", w: number, lh = 1.45) => {
    setText(size, style, COLOR.body)
    const lines = doc.splitTextToSize(pdfSafe(text), w) as string[]
    return { lines, height: lines.length * size * lh, lineH: size * lh }
  }
  const write = (
    text: string,
    o: { size?: number; style?: "normal" | "bold" | "italic" | "bolditalic"; color?: string; x?: number; w?: number; after?: number; url?: string; lh?: number } = {},
  ) => {
    const size = o.size ?? 10.5
    const style = o.style ?? "normal"
    const x = o.x ?? PAGE.margin
    const m = measure(text, size, style, o.w ?? width - (x - PAGE.margin), o.lh)
    setText(size, style, o.color ?? COLOR.body)
    for (const line of m.lines) {
      room(m.lineH)
      doc.text(line, x, y, { baseline: "top" })
      if (o.url) doc.link(x, y, doc.getTextWidth(line), m.lineH, { url: o.url })
      y += m.lineH
    }
    y += o.after ?? 6
  }
  const rule = (gap = 10) => {
    doc.setDrawColor(COLOR.rule)
    doc.setLineWidth(0.75)
    doc.line(PAGE.margin, y, PAGE.margin + width, y)
    y += gap
  }

  for (const b of exportBlocks(input)) {
    switch (b.t) {
      case "eyebrow":
        write(b.text.toUpperCase(), { size: 8, style: "bold", color: COLOR.accent, after: 6 })
        break
      case "title":
        write(b.text, { size: 24, style: "bold", color: COLOR.ink, after: 6, lh: 1.2 })
        break
      case "meta":
        write(b.text, { size: 9.5, color: COLOR.muted, after: 4 })
        break
      case "h2": {
        y += 10
        room(80) // keep a heading with what follows it
        rule(12)
        write(b.text, { size: 15, style: "bold", color: COLOR.ink, after: 8, lh: 1.25 })
        break
      }
      case "h3":
        y += 4
        room(60)
        write(b.text, { size: 12, style: "bold", color: COLOR.ink, after: 4, lh: 1.3 })
        break
      case "p":
        write(b.text, {
          size: b.tone === "muted" ? 9.5 : 10.5,
          style: b.tone === "strong" ? "bold" : "normal",
          color: b.tone === "muted" ? COLOR.muted : b.tone === "strong" ? COLOR.ink : COLOR.body,
          after: b.tone === "strong" ? 4 : 7,
        })
        break
      case "note": {
        const pad = 9
        const m = measure(b.text, 10, "normal", width - 2 * pad - 3)
        room(m.height + 2 * pad)
        doc.setFillColor(b.tone === "amber" ? COLOR.amberBg : COLOR.skyBg)
        doc.rect(PAGE.margin, y, width, m.height + 2 * pad, "F")
        doc.setFillColor(b.tone === "amber" ? COLOR.amberRule : COLOR.skyRule)
        doc.rect(PAGE.margin, y, 3, m.height + 2 * pad, "F")
        const top = y
        y += pad
        write(b.text, { size: 10, color: COLOR.ink, x: PAGE.margin + pad + 3, w: width - 2 * pad - 3, after: 0 })
        y = top + m.height + 2 * pad + 8
        break
      }
      case "bullets":
        for (const it of b.items) {
          const m = measure(it, 10.5, "normal", width - 16)
          room(Math.min(m.height, m.lineH * 2))
          setText(10.5, "normal", COLOR.muted)
          doc.text("•", PAGE.margin + 4, y, { baseline: "top" })
          write(it, { x: PAGE.margin + 16, after: 3 })
        }
        y += 4
        break
      case "sentiment": {
        const s = b.s
        const total = s.positive + s.neutral + s.negative + s.mixed
        room(48)
        write(`Overall feeling: ${b.label}`, { size: 10.5, style: "bold", color: COLOR.ink, after: 6 })
        if (total) {
          let x = PAGE.margin
          for (const k of SENTIMENT_ORDER) {
            if (!s[k]) continue
            const w = (width * s[k]) / total
            doc.setFillColor(SENTIMENT_COLOR[k])
            doc.rect(x, y, w, 8, "F")
            x += w
          }
          y += 14
          write(
            SENTIMENT_ORDER.filter((k) => s[k] > 0)
              .map((k) => `${SENTIMENT_LABEL[k]} ${pct(s[k], total)}%`)
              .join(" · "),
            { size: 9.5, color: COLOR.muted, after: 4 },
          )
        }
        break
      }
      case "source": {
        const x = PAGE.margin + 12
        const w = width - 12
        const text = b.quote ? `“${b.text}”` : b.text
        const label = measure(b.label, 8.5, "bold", w)
        const body = measure(text, 10, b.quote ? "italic" : "normal", w)
        const link = measure(shortUrl(b.url), 8.5, "normal", w)
        // Sources are short (clipped text), so each stays whole on one page and its side rule matches it.
        const blockH = label.height + 1 + body.height + 1 + link.height
        room(blockH + 9)
        doc.setFillColor(COLOR.rule)
        doc.rect(PAGE.margin + 2, y + 1, 2, blockH - 2, "F")
        write(b.label, { size: 8.5, style: "bold", color: COLOR.muted, x, w, after: 1 })
        write(text, { size: 10, style: b.quote ? "italic" : "normal", color: COLOR.body, x, w, after: 1, url: b.url })
        write(shortUrl(b.url), { size: 8.5, color: COLOR.link, x, w, after: 9, url: b.url })
        break
      }
    }
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages()
  const name = pdfSafe(input.topic.query)
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(COLOR.rule)
    doc.setLineWidth(0.5)
    doc.line(PAGE.margin, PAGE.h - 40, PAGE.w - PAGE.margin, PAGE.h - 40)
    setText(8, "normal", COLOR.muted)
    doc.text(`Topic Ideation · ${name}`, PAGE.margin, PAGE.h - 30, { baseline: "top" })
    doc.text(`Page ${i} of ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 30, { baseline: "top", align: "right" })
  }
  doc.save(exportFilename(input.topic, input.report, "pdf"))
}

// ─── Word ───────────────────────────────────────────────────────────────────

export async function exportDocx(input: ExportInput): Promise<void> {
  const d = await import("docx")
  const { saveAs } = await import("file-saver")
  const hex = (c: string) => c.replace("#", "").toUpperCase()
  const children: InstanceType<typeof d.Paragraph>[] = []

  for (const b of exportBlocks(input)) {
    switch (b.t) {
      case "eyebrow":
        children.push(new d.Paragraph({ spacing: { after: 80 }, children: [new d.TextRun({ text: b.text.toUpperCase(), bold: true, size: 16, color: hex(COLOR.accent), characterSpacing: 20 })] }))
        break
      case "title":
        children.push(new d.Paragraph({ heading: d.HeadingLevel.TITLE, spacing: { after: 80 }, children: [new d.TextRun({ text: b.text, bold: true, size: 48, color: hex(COLOR.ink) })] }))
        break
      case "meta":
        children.push(new d.Paragraph({ spacing: { after: 60 }, children: [new d.TextRun({ text: b.text, size: 19, color: hex(COLOR.muted) })] }))
        break
      case "h2":
        children.push(
          new d.Paragraph({
            heading: d.HeadingLevel.HEADING_1,
            keepNext: true,
            spacing: { before: 360, after: 120 },
            border: { top: { style: d.BorderStyle.SINGLE, size: 6, color: hex(COLOR.rule), space: 10 } },
            children: [new d.TextRun({ text: b.text, bold: true, size: 30, color: hex(COLOR.ink) })],
          }),
        )
        break
      case "h3":
        children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 200, after: 60 }, children: [new d.TextRun({ text: b.text, bold: true, size: 24, color: hex(COLOR.ink) })] }))
        break
      case "p":
        children.push(
          new d.Paragraph({
            keepNext: b.tone === "strong",
            spacing: { after: b.tone === "strong" ? 60 : 120 },
            children: [new d.TextRun({ text: b.text, size: b.tone === "muted" ? 19 : 21, bold: b.tone === "strong", color: hex(b.tone === "muted" ? COLOR.muted : b.tone === "strong" ? COLOR.ink : COLOR.body) })],
          }),
        )
        break
      case "note":
        children.push(
          new d.Paragraph({
            spacing: { before: 120, after: 160 },
            shading: { type: d.ShadingType.CLEAR, color: "auto", fill: hex(b.tone === "amber" ? COLOR.amberBg : COLOR.skyBg) },
            border: { left: { style: d.BorderStyle.SINGLE, size: 18, color: hex(b.tone === "amber" ? COLOR.amberRule : COLOR.skyRule), space: 8 } },
            children: [new d.TextRun({ text: b.text, size: 20, color: hex(COLOR.ink) })],
          }),
        )
        break
      case "bullets":
        for (const it of b.items) children.push(new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new d.TextRun({ text: it, size: 21, color: hex(COLOR.body) })] }))
        break
      case "sentiment": {
        const s = b.s
        const total = s.positive + s.neutral + s.negative + s.mixed
        const runs = [new d.TextRun({ text: `Overall feeling: ${b.label}`, bold: true, size: 21, color: hex(COLOR.ink) })]
        for (const k of SENTIMENT_ORDER) {
          if (!s[k]) continue
          runs.push(new d.TextRun({ text: "     ■ ", size: 21, color: hex(SENTIMENT_COLOR[k]) }))
          runs.push(new d.TextRun({ text: `${SENTIMENT_LABEL[k]} ${pct(s[k], total)}%`, size: 19, color: hex(COLOR.muted) }))
        }
        children.push(new d.Paragraph({ spacing: { before: 60, after: 100 }, children: runs }))
        break
      }
      case "source":
        children.push(
          new d.Paragraph({
            keepLines: true,
            spacing: { after: 140 },
            indent: { left: 240 },
            border: { left: { style: d.BorderStyle.SINGLE, size: 8, color: hex(COLOR.rule), space: 8 } },
            children: [
              new d.TextRun({ text: b.label, bold: true, size: 17, color: hex(COLOR.muted) }),
              new d.TextRun({ text: b.quote ? `“${b.text}”` : b.text, italics: !!b.quote, size: 20, color: hex(COLOR.body), break: 1 }),
              new d.TextRun({ text: "", break: 1 }),
              new d.ExternalHyperlink({ link: b.url, children: [new d.TextRun({ text: shortUrl(b.url), size: 17, color: hex(COLOR.link), underline: {} })] }),
            ],
          }),
        )
        break
    }
  }

  const doc = new d.Document({
    creator: "Stamats Topic Ideation",
    title: `${input.topic.query}: Topic Ideation`,
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: hex(COLOR.body) } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({
                alignment: d.AlignmentType.RIGHT,
                children: [new d.TextRun({ children: [`Topic Ideation · ${input.topic.query}     Page `, d.PageNumber.CURRENT, " of ", d.PageNumber.TOTAL_PAGES], size: 16, color: hex(COLOR.muted) })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  saveAs(await d.Packer.toBlob(doc), exportFilename(input.topic, input.report, "docx"))
}
