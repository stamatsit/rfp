import { useState } from "react"
import { X, FileText, FileDown, Loader2 } from "lucide-react"

interface ExportDialogProps {
  title: string
  onClose: () => void
}

type ExportFormat = "pdf" | "docx"

export function ExportDialog({ title, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [filename, setFilename] = useState(title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "document")
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      if (format === "pdf") {
        await exportPDF()
      } else {
        await exportWord()
      }
      onClose()
    } catch (err) {
      console.error("Export failed:", err)
    } finally {
      setIsExporting(false)
    }
  }

  const exportPDF = async () => {
    const element = document.getElementById("document-preview")
    if (!element) return

    // Dynamic import to keep bundle small
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
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx")
    const { saveAs } = await import("file-saver")

    // Get plain text from preview element
    const element = document.getElementById("document-preview")
    if (!element) return

    const lines = element.innerText.split("\n")
    const paragraphs = lines.map((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return new Paragraph({ children: [] })
      }

      // Simple heading detection
      if (trimmed.length < 80 && trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
        return new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: trimmed, bold: true })],
          spacing: { before: 240, after: 120 },
        })
      }

      return new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: trimmed })],
        spacing: { after: 120 },
      })
    })

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true, size: 32 })],
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: new Date().toLocaleDateString(), italics: true, color: "999999", size: 20 })],
            spacing: { after: 480 },
          }),
          ...paragraphs,
        ],
      }],
    })

    const blob = await Packer.toBlob(doc)
    saveAs(blob, `${filename}.docx`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[400px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Export Document</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Filename */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Filename</label>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
            />
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat("pdf")}
                className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                  format === "pdf"
                    ? "border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <FileDown className={`w-5 h-5 ${format === "pdf" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
                <div className="text-left">
                  <div className={`text-sm font-medium ${format === "pdf" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>PDF</div>
                  <div className="text-[10px] text-slate-400">Print-ready</div>
                </div>
              </button>
              <button
                onClick={() => setFormat("docx")}
                className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                  format === "docx"
                    ? "border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <FileText className={`w-5 h-5 ${format === "docx" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
                <div className="text-left">
                  <div className={`text-sm font-medium ${format === "docx" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>Word</div>
                  <div className="text-[10px] text-slate-400">Editable .docx</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !filename.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Exporting...
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
