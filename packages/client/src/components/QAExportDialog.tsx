import { useState } from "react"
import {
  Download,
  FileText,
  File,
  Loader2,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Label,
} from "@/components/ui"
import type { AnswerResponse, AIAdaptResponse } from "@/lib/api"

interface QAExportDialogProps {
  open: boolean
  onClose: () => void
  selectedAnswers: AnswerResponse[]
  adaptedResults?: Array<AIAdaptResponse & { id: string }>
}

type ExportFormat = "docx" | "pdf"

export function QAExportDialog({ open, onClose, selectedAnswers, adaptedResults }: QAExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("docx")
  const [filename, setFilename] = useState(() => `Q&A Export - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`)
  const [includeLetterhead, setIncludeLetterhead] = useState(true)
  const [useAdapted, setUseAdapted] = useState(!!adaptedResults)
  const [isExporting, setIsExporting] = useState(false)
  const [exported, setExported] = useState(false)

  const exportItems = (useAdapted && adaptedResults)
    ? selectedAnswers.map(a => {
        const adapted = adaptedResults.find(r => r.id === a.id)
        return {
          question: a.question,
          answer: adapted?.adaptedContent || a.answer,
        }
      })
    : selectedAnswers.map(a => ({ question: a.question, answer: a.answer }))

  const handleExportWord = async () => {
    setIsExporting(true)
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx")
      const { saveAs } = await import("file-saver")

      const paragraphs: InstanceType<typeof Paragraph>[] = []

      if (includeLetterhead) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: "Stamats", bold: true, size: 40, font: "Calibri" })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 40 },
        }))
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: `Q&A Library Export — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
            size: 20,
            color: "666666",
            font: "Calibri",
          })],
          spacing: { after: 120 },
        }))
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: `${exportItems.length} answer${exportItems.length > 1 ? "s" : ""}${useAdapted && adaptedResults ? " (adapted)" : ""}`,
            size: 18,
            color: "999999",
            font: "Calibri",
          })],
          spacing: { after: 240 },
        }))
        // Divider line
        paragraphs.push(new Paragraph({
          children: [],
          border: { bottom: { style: "single" as any, size: 1, color: "CCCCCC" } },
          spacing: { after: 300 },
        }))
      }

      for (let i = 0; i < exportItems.length; i++) {
        const item = exportItems[i]!
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: item.question, bold: true, size: 24, font: "Calibri" })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: i > 0 ? 300 : 0, after: 120 },
        }))

        // Split answer into paragraphs by double newlines
        const answerParagraphs = item.answer.split(/\n{2,}/)
        for (const p of answerParagraphs) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: p.trim(), size: 22, font: "Calibri" })],
            spacing: { after: 160, line: 276 },
          }))
        }
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children: paragraphs,
        }],
      })

      const blob = await Packer.toBlob(doc)
      saveAs(blob, `${filename}.docx`)
      setExported(true)
      setTimeout(() => setExported(false), 2000)
    } catch (e) {
      console.error("DOCX export failed:", e)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default

      let html = ""
      if (includeLetterhead) {
        html += `<div style="margin-bottom:24px;">
          <h1 style="font-size:20px; font-weight:bold; margin:0 0 4px 0; color:#1a1a1a;">Stamats</h1>
          <p style="font-size:11px; color:#666; margin:0 0 4px 0;">Q&A Library Export — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <p style="font-size:10px; color:#999; margin:0 0 16px 0;">${exportItems.length} answer${exportItems.length > 1 ? "s" : ""}${useAdapted && adaptedResults ? " (adapted)" : ""}</p>
          <hr style="border:none; border-top:1px solid #ddd; margin-bottom:20px;" />
        </div>`
      }

      for (const item of exportItems) {
        html += `<h2 style="font-size:14px; font-weight:600; margin:20px 0 6px 0; color:#1a1a1a;">${escapeHtml(item.question)}</h2>`
        const paragraphs = item.answer.split(/\n{2,}/)
        for (const p of paragraphs) {
          html += `<p style="font-size:12px; margin:0 0 10px 0; line-height:1.65; color:#333;">${escapeHtml(p.trim())}</p>`
        }
      }

      const container = document.createElement("div")
      container.style.cssText = "position:fixed; left:-9999px; top:0; width:816px; padding:72px; font-family:Calibri,Arial,sans-serif; color:#1a1a1a;"
      container.innerHTML = html
      document.body.appendChild(container)

      try {
        await html2pdf().set({
          margin: 0,
          filename: `${filename}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        }).from(container).save()
        setExported(true)
        setTimeout(() => setExported(false), 2000)
      } finally {
        document.body.removeChild(container)
      }
    } catch (e) {
      console.error("PDF export failed:", e)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExport = () => {
    if (format === "docx") handleExportWord()
    else handleExportPDF()
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Download size={16} className="text-emerald-500" />
            Export {selectedAnswers.length} Answer{selectedAnswers.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            Download selected answers as a formatted document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format picker */}
          <div>
            <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-2 block">Format</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("docx")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "docx"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <FileText size={18} className={format === "docx" ? "text-blue-500" : "text-slate-400"} />
                <div className="text-left">
                  <p className={`text-[13px] font-medium ${format === "docx" ? "text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"}`}>Word</p>
                  <p className="text-[10px] text-slate-400">.docx</p>
                </div>
              </button>
              <button
                onClick={() => setFormat("pdf")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "pdf"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <File size={18} className={format === "pdf" ? "text-blue-500" : "text-slate-400"} />
                <div className="text-left">
                  <p className={`text-[13px] font-medium ${format === "pdf" ? "text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"}`}>PDF</p>
                  <p className="text-[10px] text-slate-400">.pdf</p>
                </div>
              </button>
            </div>
          </div>

          {/* Filename */}
          <div>
            <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Filename</Label>
            <Input
              value={filename}
              onChange={e => setFilename(e.target.value)}
              className="h-9 text-[13px]"
            />
          </div>

          {/* Letterhead toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLetterhead}
              onChange={e => setIncludeLetterhead(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] text-slate-600 dark:text-slate-400">Include Stamats letterhead</span>
          </label>

          {/* Content source toggle (only if adapted results available) */}
          {adaptedResults && adaptedResults.length > 0 && (
            <div>
              <Label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-2 block">Content Source</Label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setUseAdapted(false)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    !useAdapted
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setUseAdapted(true)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    useAdapted
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  Adapted
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">
              {exportItems.length} items will be exported
            </p>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {exportItems.slice(0, 6).map((item, i) => (
                <p key={i} className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {item.question}
                </p>
              ))}
              {exportItems.length > 6 && (
                <p className="text-[11px] text-slate-400">+{exportItems.length - 6} more</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="h-9 rounded-lg text-[13px]">
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || !filename.trim()}
              className="h-9 rounded-lg text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isExporting ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Exporting...</>
              ) : exported ? (
                <><Check size={14} className="mr-1.5" /> Downloaded</>
              ) : (
                <><Download size={14} className="mr-1.5" /> Export {format.toUpperCase()}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
