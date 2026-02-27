import { useState } from "react"
import { X, FileText, FileDown, Loader2, Copy, Check, AlertCircle } from "lucide-react"
import type { FormatSettings, LetterheadConfig } from "@/types/studio"
import { legacyFontToValue, legacySizeToValue } from "./fonts"

interface ExportDialogProps {
  title: string
  content: string
  formatSettings: FormatSettings
  onClose: () => void
}

type ExportFormat = "pdf" | "docx" | "clipboard"

// ── Helpers for DOCX conversion ──────────────────────────

/** Convert CSS px to Word half-points (1pt = 2 half-points, 1px ≈ 0.75pt) */
function pxToHalfPoints(px: number): number {
  return Math.round(px * 0.75 * 2)
}

/** Convert CSS px to Word twips (1 inch = 1440 twips, 96px = 1 inch) */
function pxToTwips(px: number): number {
  return Math.round((px / 96) * 1440)
}

/** Get the first Word-safe font name from a CSS font stack */
function resolveWordFont(fontFamily: string): string {
  // Map common web fonts to Word-safe equivalents
  const wordMap: Record<string, string> = {
    "Inter": "Calibri",
    "Open Sans": "Calibri",
    "Lato": "Calibri",
    "Roboto": "Calibri",
    "Source Sans 3": "Calibri",
    "Nunito": "Calibri",
    "Poppins": "Calibri",
    "Montserrat": "Calibri",
    "DM Sans": "Calibri",
    "Work Sans": "Calibri",
    "Outfit": "Calibri",
    "Sora": "Calibri",
    "Space Grotesk": "Calibri",
    "Georgia": "Georgia",
    "Merriweather": "Georgia",
    "Playfair Display": "Georgia",
    "Lora": "Georgia",
    "EB Garamond": "Garamond",
    "Libre Baskerville": "Georgia",
    "JetBrains Mono": "Courier New",
    "Fira Code": "Courier New",
    "IBM Plex Mono": "Courier New",
  }
  return wordMap[fontFamily] || "Calibri"
}

/** Parse inline styles from an element */
function getInlineStyles(el: HTMLElement) {
  const style = el.style
  return {
    fontFamily: style.fontFamily?.replace(/['"]/g, "").split(",")[0]?.trim() || null,
    fontSize: style.fontSize || null,
    fontWeight: style.fontWeight || null,
    fontStyle: style.fontStyle || null,
    textDecoration: style.textDecoration || null,
    textAlign: style.textAlign || null,
    color: style.color || null,
  }
}

export function ExportDialog({ title, content, formatSettings, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [filename, setFilename] = useState(title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "document")
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Word count estimate from HTML
  const wordCount = content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length

  const handleExport = async () => {
    setIsExporting(true)
    setExportError(null)
    try {
      if (format === "pdf") {
        await exportPDF()
      } else if (format === "docx") {
        await exportWord()
      } else if (format === "clipboard") {
        await copyToClipboard()
        return // copyToClipboard handles its own state
      }
      onClose()
    } catch (err) {
      console.error("Export failed:", err)
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      // Strip HTML to plain text
      const tmp = document.createElement("div")
      tmp.innerHTML = content
      const text = tmp.textContent || tmp.innerText || ""
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        onClose()
      }, 1200)
    } catch {
      setExportError("Clipboard access denied. Try copying manually.")
    } finally {
      setIsExporting(false)
    }
  }

  const exportPDF = async () => {
    const element = document.getElementById("document-preview")
    if (!element) return

    const html2pdf = (await import("html2pdf.js")).default

    const opt = {
      margin: 0,
      filename: `${filename}.pdf`,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" as const },
    }

    await html2pdf().set(opt).from(element).save()
  }

  const exportWord = async () => {
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel,
      AlignmentType, Table: DocxTable, TableRow: DocxTableRow,
      TableCell: DocxTableCell, WidthType, BorderStyle,
      LevelFormat, convertInchesToTwip,
      Header, Footer, ImageRun,
    } = await import("docx")
    const { saveAs } = await import("file-saver")

    // Resolve document-level defaults from formatSettings
    const docFont = resolveWordFont(legacyFontToValue(formatSettings.fontFamily))
    const docFontSizePx = parseFloat(legacySizeToValue(formatSettings.fontSize)) || 15
    const docFontSizeHp = pxToHalfPoints(docFontSizePx)

    const alignMap: Record<string, typeof AlignmentType[keyof typeof AlignmentType]> = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    }
    const docAlign = alignMap[formatSettings.textAlign] || AlignmentType.LEFT

    // Page margins from formatSettings
    const marginMap = { narrow: 0.5, normal: 1, wide: 1.25 }
    const marginInches = marginMap[formatSettings.pageMargins] || 1

    // ── Parse HTML content into a temp DOM ──────────────
    const parser = new DOMParser()
    const parsed = parser.parseFromString(`<div>${content}</div>`, "text/html")
    const root = parsed.body.firstElementChild as HTMLElement
    if (!root) return

    // ── Convert DOM nodes to docx paragraphs ────────────

    /** Convert a single inline/text node to a TextRun */
    function nodeToTextRuns(node: Node, inherited: {
      bold?: boolean
      italic?: boolean
      underline?: boolean
      font?: string
      size?: number // half-points
      color?: string
    } = {}): InstanceType<typeof TextRun>[] {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ""
        if (!text) return []
        return [new TextRun({
          text,
          bold: inherited.bold,
          italics: inherited.italic,
          underline: inherited.underline ? {} : undefined,
          font: inherited.font || docFont,
          size: inherited.size || docFontSizeHp,
          color: inherited.color,
        })]
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return []
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()
      const styles = getInlineStyles(el)

      // Build inherited state for children
      const childInherited = { ...inherited }

      if (tag === "strong" || tag === "b") childInherited.bold = true
      if (tag === "em" || tag === "i") childInherited.italic = true
      if (tag === "u") childInherited.underline = true
      if (tag === "code") childInherited.font = "Courier New"

      // Inline style overrides
      if (styles.fontFamily) {
        childInherited.font = resolveWordFont(styles.fontFamily)
      }
      if (styles.fontSize) {
        const px = parseFloat(styles.fontSize)
        if (px > 0) childInherited.size = pxToHalfPoints(px)
      }
      if (styles.fontWeight && (styles.fontWeight === "bold" || parseInt(styles.fontWeight) >= 600)) {
        childInherited.bold = true
      }
      if (styles.fontStyle === "italic") childInherited.italic = true
      if (styles.color) {
        // Parse rgb() or hex to 6-char hex
        const hex = colorToHex(styles.color)
        if (hex) childInherited.color = hex
      }

      // Handle <br>
      if (tag === "br") {
        return [new TextRun({ text: "", break: 1 })]
      }

      // Recurse children
      const runs: InstanceType<typeof TextRun>[] = []
      for (const child of Array.from(el.childNodes)) {
        runs.push(...nodeToTextRuns(child, childInherited))
      }
      return runs
    }

    /** Convert a block-level element to Paragraph(s) */
    function elementToParagraphs(el: HTMLElement): InstanceType<typeof Paragraph>[] {
      const tag = el.tagName.toLowerCase()
      const styles = getInlineStyles(el)

      // Resolve alignment
      let alignment = docAlign
      if (styles.textAlign) {
        alignment = alignMap[styles.textAlign] || docAlign
      }

      // Headings
      if (tag === "h1" || tag === "h2" || tag === "h3") {
        const level = tag === "h1" ? HeadingLevel.HEADING_1
          : tag === "h2" ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3

        const headingSizes: Record<string, number> = {
          h1: pxToHalfPoints(24),
          h2: pxToHalfPoints(18),
          h3: pxToHalfPoints(16),
        }

        const runs = nodeToTextRuns(el, {
          bold: true,
          font: docFont,
          size: headingSizes[tag],
        })

        return [new Paragraph({
          heading: level,
          alignment,
          children: runs,
          spacing: { before: tag === "h1" ? 360 : 240, after: 120 },
        })]
      }

      // Paragraphs
      if (tag === "p") {
        const runs = nodeToTextRuns(el)
        return [new Paragraph({
          alignment,
          children: runs.length > 0 ? runs : [new TextRun({ text: "" })],
          spacing: { after: 120 },
        })]
      }

      // Unordered list
      if (tag === "ul") {
        return listToParagraphs(el, "bullet", 0)
      }

      // Ordered list
      if (tag === "ol") {
        return listToParagraphs(el, "number", 0)
      }

      // Blockquote
      if (tag === "blockquote") {
        const paras: InstanceType<typeof Paragraph>[] = []
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const runs = nodeToTextRuns(child, { italic: true, color: "666666" })
          paras.push(new Paragraph({
            alignment,
            children: runs,
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { after: 120 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: "10B981" },
            },
          }))
        }
        if (paras.length === 0) {
          const runs = nodeToTextRuns(el, { italic: true, color: "666666" })
          paras.push(new Paragraph({
            alignment,
            children: runs,
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { after: 120 },
          }))
        }
        return paras
      }

      // Horizontal rule
      if (tag === "hr") {
        return [new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
          spacing: { before: 240, after: 240 },
        })]
      }

      // Table
      if (tag === "table") {
        return tableToDocx(el, DocxTable, DocxTableRow, DocxTableCell, WidthType, BorderStyle, Paragraph, TextRun)
      }

      // Pre/code block
      if (tag === "pre") {
        const code = el.textContent || ""
        const lines = code.split("\n")
        return lines.map((line) =>
          new Paragraph({
            children: [new TextRun({
              text: line,
              font: "Courier New",
              size: pxToHalfPoints(13),
            })],
            spacing: { after: 0 },
          })
        )
      }

      // Fallback: treat as paragraph
      const runs = nodeToTextRuns(el)
      if (runs.length > 0) {
        return [new Paragraph({ alignment, children: runs, spacing: { after: 120 } })]
      }
      return []
    }

    /** Convert list element to paragraphs with bullet/number formatting */
    function listToParagraphs(
      listEl: HTMLElement,
      type: "bullet" | "number",
      level: number
    ): InstanceType<typeof Paragraph>[] {
      const paras: InstanceType<typeof Paragraph>[] = []
      const items = Array.from(listEl.children).filter(
        (c) => c.tagName.toLowerCase() === "li"
      ) as HTMLElement[]

      for (const li of items) {
        // Check for nested lists inside <li>
        const nestedList = li.querySelector("ul, ol")
        const liChildren = Array.from(li.childNodes)

        // Get text runs from direct content (not nested lists)
        const runs: InstanceType<typeof TextRun>[] = []
        for (const child of liChildren) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const childEl = child as HTMLElement
            if (childEl.tagName.toLowerCase() === "ul" || childEl.tagName.toLowerCase() === "ol") {
              continue // skip nested lists, handle separately
            }
          }
          runs.push(...nodeToTextRuns(child))
        }

        if (runs.length > 0) {
          paras.push(new Paragraph({
            children: runs,
            numbering: { reference: type === "bullet" ? "bullet-list" : "number-list", level },
            spacing: { after: 60 },
          }))
        }

        // Handle nested list
        if (nestedList) {
          const nestedType = nestedList.tagName.toLowerCase() === "ol" ? "number" : "bullet"
          paras.push(...listToParagraphs(nestedList as HTMLElement, nestedType, level + 1))
        }
      }
      return paras
    }

    /** Convert an HTML table to docx Table */
    function tableToDocx(
      tableEl: HTMLElement,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      DTable: any, DRow: any, DCell: any, DWidthType: any, DBorderStyle: any,
      DParagraph: typeof Paragraph, DTextRun: typeof TextRun
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any[] {
      const rows: HTMLTableRowElement[] = []
      tableEl.querySelectorAll("tr").forEach((tr) => rows.push(tr))

      if (rows.length === 0) return []

      const docxRows = rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td")) as HTMLElement[]
        return new DRow({
          children: cells.map((cell) => {
            const isHeader = cell.tagName.toLowerCase() === "th"
            const runs = nodeToTextRuns(cell, {
              bold: isHeader,
              size: isHeader ? pxToHalfPoints(12) : docFontSizeHp,
            })
            return new DCell({
              children: [new DParagraph({
                children: runs.length > 0 ? runs : [new DTextRun({ text: "" })],
              })],
              width: { size: 100 / cells.length, type: DWidthType.PERCENTAGE },
              shading: isHeader ? { fill: "F1F5F9" } : undefined,
              borders: {
                bottom: { style: DBorderStyle.SINGLE, size: 1, color: "E2E8F0" },
              },
            })
          }),
        })
      })

      return [new DTable({
        rows: docxRows,
        width: { size: 100, type: DWidthType.PERCENTAGE },
      })]
    }

    // ── Letterhead helpers ─────────────────────────────
    function base64ToUint8Array(dataUrl: string): Uint8Array {
      const base64 = dataUrl.split(",")[1]!
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }

    // Page content width in EMU (8.5" - 2*margin, 1 inch = 914400 EMU)
    const pageWidthEmu = (8.5 - 2 * marginInches) * 914400

    function buildLetterheadParagraphs(config: LetterheadConfig): InstanceType<typeof Paragraph>[] {
      if (config.mode === "none") return []

      const lhAlign = config.alignment === "center" ? AlignmentType.CENTER
        : config.alignment === "right" ? AlignmentType.RIGHT
        : AlignmentType.LEFT

      if (config.mode === "full-image" && config.fullImageData) {
        const imgData = base64ToUint8Array(config.fullImageData)
        // Scale: full width, height proportional
        const heightEmu = (config.fullImageHeight / 96) * 914400
        return [new Paragraph({
          alignment: lhAlign,
          children: [new ImageRun({
            data: imgData,
            transformation: {
              width: pageWidthEmu / 914400 * 72, // points
              height: heightEmu / 914400 * 72,
            },
            type: "png",
          })],
        })]
      }

      if (config.mode === "logo-text") {
        const paras: InstanceType<typeof Paragraph>[] = []
        const tf = config.textFields

        // Logo + company name on first line
        const firstLineRuns: InstanceType<typeof TextRun | typeof ImageRun>[] = []
        if (config.logoData) {
          const logoData = base64ToUint8Array(config.logoData)
          const logoWidthPt = (config.logoWidth / 96) * 72
          const logoHeightPt = logoWidthPt // square aspect
          firstLineRuns.push(new ImageRun({
            data: logoData,
            transformation: { width: logoWidthPt, height: logoHeightPt },
            type: "png",
          }))
          firstLineRuns.push(new TextRun({ text: "  " }))
        }
        if (tf.companyName) {
          firstLineRuns.push(new TextRun({
            text: tf.companyName,
            bold: true,
            size: pxToHalfPoints(16),
            font: docFont,
          }))
        }
        if (firstLineRuns.length > 0) {
          paras.push(new Paragraph({ alignment: lhAlign, children: firstLineRuns, spacing: { after: 40 } }))
        }

        // Tagline
        if (tf.tagline) {
          paras.push(new Paragraph({
            alignment: lhAlign,
            children: [new TextRun({ text: tf.tagline, italics: true, size: pxToHalfPoints(11), font: docFont, color: "666666" })],
            spacing: { after: 20 },
          }))
        }

        // Contact info line
        const contactParts = [tf.address, tf.phone, tf.email, tf.website].filter(Boolean)
        if (contactParts.length > 0) {
          paras.push(new Paragraph({
            alignment: lhAlign,
            children: [new TextRun({ text: contactParts.join("  |  "), size: pxToHalfPoints(9), font: docFont, color: "888888" })],
            spacing: { after: 40 },
          }))
        }

        return paras
      }

      return []
    }

    // Build docx Header and Footer from letterhead config
    const lhHeader = formatSettings.letterheadHeader
    const lhFooter = formatSettings.letterheadFooter
    const hasLetterheadHeader = lhHeader && lhHeader.mode !== "none"
    const hasLetterheadFooter = lhFooter && lhFooter.mode !== "none"

    const docxHeaders = hasLetterheadHeader
      ? { default: new Header({ children: buildLetterheadParagraphs(lhHeader) }) }
      : undefined

    const docxFooters = hasLetterheadFooter
      ? { default: new Footer({ children: [
          ...buildLetterheadParagraphs(lhFooter),
          ...(formatSettings.showPageNumbers ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "", size: pxToHalfPoints(9), color: "999999" })],
          })] : []),
        ] }) }
      : undefined

    // ── Build the document ──────────────────────────────
    const children: (InstanceType<typeof Paragraph> | InstanceType<typeof DocxTable>)[] = []

    // Title + date only if no letterhead header (letterhead replaces them)
    if (!hasLetterheadHeader) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: title, bold: true, size: pxToHalfPoints(28), font: docFont })],
        spacing: { after: 240 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: new Date().toLocaleDateString(), italics: true, color: "999999", size: pxToHalfPoints(13) })],
        spacing: { after: 480 },
      }))
    }

    // Content blocks
    const blockElements = Array.from(root.children) as HTMLElement[]
    for (const el of blockElements) {
      const paras = elementToParagraphs(el)
      children.push(...paras)
    }

    // If content had no block children, fall back to text
    if (blockElements.length === 0 && root.textContent?.trim()) {
      children.push(new Paragraph({
        children: [new TextRun({ text: root.textContent.trim(), font: docFont, size: docFontSizeHp })],
      }))
    }

    const doc = new Document({
      numbering: {
        config: [
          {
            reference: "bullet-list",
            levels: [
              { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
              { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.25) } } } },
              { level: 2, format: LevelFormat.BULLET, text: "\u25AA", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) } } } },
            ],
          },
          {
            reference: "number-list",
            levels: [
              { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
              { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.25) } } } },
              { level: 2, format: LevelFormat.LOWER_ROMAN, text: "%3.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) } } } },
            ],
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: pxToTwips(marginInches * 96),
              right: pxToTwips(marginInches * 96),
              bottom: pxToTwips(marginInches * 96),
              left: pxToTwips(marginInches * 96),
            },
          },
        },
        headers: docxHeaders,
        footers: docxFooters,
        children: children as InstanceType<typeof Paragraph>[],
      }],
    })

    const blob = await Packer.toBlob(doc)
    saveAs(blob, `${filename}.docx`)
  }

  const extSuffix = format === "pdf" ? ".pdf" : format === "docx" ? ".docx" : ""

  const FormatBtn = ({
    id, icon: Icon, label, sublabel, active,
  }: {
    id: ExportFormat
    icon: typeof FileDown
    label: string
    sublabel: string
    active: boolean
  }) => (
    <button
      onClick={() => { setFormat(id); setExportError(null) }}
      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
        active
          ? "border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 shadow-sm"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/60 dark:hover:bg-slate-700/30"
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
      <div>
        <div className={`text-xs font-semibold ${active ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>{label}</div>
        <div className="text-[10px] text-slate-400">{sublabel}</div>
      </div>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[420px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Export Document</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {wordCount.toLocaleString()} words · "{title.slice(0, 40)}{title.length > 40 ? "…" : ""}"
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Filename */}
          {format !== "clipboard" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Filename</label>
              <div className="flex items-center gap-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-300">
                <input
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 h-9 px-3 text-sm bg-transparent text-slate-700 dark:text-slate-300 outline-none"
                  placeholder="document"
                />
                <span className="px-2.5 text-[11px] text-slate-400 dark:text-slate-500 font-mono border-l border-slate-200 dark:border-slate-700 h-9 flex items-center bg-slate-100/60 dark:bg-slate-800/60">
                  {extSuffix}
                </span>
              </div>
            </div>
          )}

          {/* Format selection */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Format</label>
            <div className="grid grid-cols-3 gap-2">
              <FormatBtn id="pdf"       icon={FileDown} label="PDF"        sublabel="Print-ready"    active={format === "pdf"} />
              <FormatBtn id="docx"      icon={FileText} label="Word"       sublabel="Editable .docx"  active={format === "docx"} />
              <FormatBtn id="clipboard" icon={Copy}     label="Copy Text"  sublabel="Plain text"      active={format === "clipboard"} />
            </div>
          </div>

          {/* Error state */}
          {exportError && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Export failed</p>
                <p className="text-[10px] text-red-500/80 dark:text-red-400/70 mt-0.5">{exportError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || (format !== "clipboard" && !filename.trim())}
            className="px-4 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {format === "clipboard" ? "Copying…" : "Exporting…"}
              </>
            ) : format === "clipboard" ? (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy to Clipboard
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5" />
                Export {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Utility: CSS color to 6-char hex ─────────────────────
function colorToHex(color: string): string | undefined {
  if (!color) return undefined
  // Already hex
  if (color.startsWith("#")) {
    const hex = color.replace("#", "")
    if (hex.length === 3) return hex.split("").map((c) => c + c).join("")
    if (hex.length === 6) return hex
    return undefined
  }
  // rgb(r, g, b)
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    return [r, g, b].map((c) => parseInt(c!).toString(16).padStart(2, "0")).join("")
  }
  return undefined
}
