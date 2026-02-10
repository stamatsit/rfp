import { useState, useEffect, useCallback, useRef } from "react"
import { X, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Loader2, ClipboardCheck, RefreshCw, Clock, Minus, Plus, Upload, Trash2, AlignLeft, AlignCenter, AlignRight, ImageIcon } from "lucide-react"
import type { Editor } from "@tiptap/react"
import type { FormatSettings, ColumnLayout, HeaderStyle, LetterheadConfig, LetterheadMode } from "@/types/studio"
import { DEFAULT_LETTERHEAD_HEADER, DEFAULT_LETTERHEAD_FOOTER } from "@/types/studio"
import { studioApi } from "@/lib/api"
import type { PanelTab } from "@/pages/DocumentStudio"
import { FONTS, FONT_SIZES, loadGoogleFont, getFontDef, legacyFontToValue, legacySizeToValue } from "./fonts"

// ── Types ─────────────────────────────────────────────────

interface HeadingItem {
  level: number
  text: string
  pos: number
}

interface ChecklistItem {
  id: string
  category: string
  requirement: string
  priority: "high" | "medium" | "low"
}

interface ComplianceResult {
  id: string
  status: "met" | "partial" | "missing"
  note: string
}

interface InspectorPanelProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  format: FormatSettings
  onUpdateFormat: (partial: Partial<FormatSettings>) => void
  editor: Editor | null
  rfpText: string | null
  documentContent: string
  hasDocumentId: boolean
  onOpenHistory?: () => void
}

// ── Tab button ────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-150 ${
        active
          ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      {label}
    </button>
  )
}

// ── Shared classes ────────────────────────────────────────

const selectClass = "text-[11px] bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2 mb-1">{children}</div>
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</span>
      {children}
    </label>
  )
}

// ── Letterhead Section ───────────────────────────────────

const inputClass = "w-full text-[11px] bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"

function LetterheadSection({ label, config, onUpdate }: {
  label: string
  config: LetterheadConfig
  onUpdate: (partial: Partial<LetterheadConfig>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<"full" | "logo">("full")

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      alert("Image must be under 500KB. Please use a smaller or compressed image.")
      e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      if (uploadTarget === "full") {
        onUpdate({ fullImageData: dataUrl })
      } else {
        onUpdate({ logoData: dataUrl })
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }, [onUpdate, uploadTarget])

  const triggerUpload = (target: "full" | "logo") => {
    setUploadTarget(target)
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const modes: { id: LetterheadMode; label: string }[] = [
    { id: "none", label: "None" },
    { id: "full-image", label: "Image" },
    { id: "logo-text", label: "Logo+Text" },
  ]

  return (
    <div className="space-y-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0 last:mb-0 last:pb-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Label + mode selector */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onUpdate({ mode: m.id })}
            className={`flex-1 px-1.5 py-1 text-[10px] font-medium rounded-md transition-all duration-150 ${
              config.mode === m.id
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Full Image mode */}
      {config.mode === "full-image" && (
        <div className="space-y-2">
          {config.fullImageData ? (
            <div className="relative rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
              <img
                src={config.fullImageData}
                alt="Letterhead preview"
                className="w-full object-contain"
                style={{ maxHeight: 60 }}
              />
              <button
                onClick={() => onUpdate({ fullImageData: null })}
                className="absolute top-1 right-1 p-1 bg-white/90 dark:bg-slate-800/90 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                title="Remove image"
              >
                <Trash2 className="w-3 h-3 text-red-500" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => triggerUpload("full")}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-[11px] text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Header Image
            </button>
          )}

          {/* Height slider */}
          {config.fullImageData && (
            <FieldRow label="Height">
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={30}
                  max={200}
                  value={config.fullImageHeight}
                  onChange={(e) => onUpdate({ fullImageHeight: parseInt(e.target.value) })}
                  className="flex-1 h-1 accent-emerald-500"
                />
                <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{config.fullImageHeight}</span>
              </div>
            </FieldRow>
          )}
        </div>
      )}

      {/* Logo + Text mode */}
      {config.mode === "logo-text" && (
        <div className="space-y-2">
          {/* Logo upload */}
          <div className="flex items-center gap-2">
            {config.logoData ? (
              <div className="relative w-12 h-12 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0">
                <img src={config.logoData} alt="Logo" className="w-full h-full object-contain p-1" />
                <button
                  onClick={() => onUpdate({ logoData: null })}
                  className="absolute -top-0.5 -right-0.5 p-0.5 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <X className="w-2.5 h-2.5 text-red-500" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => triggerUpload("logo")}
                className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors"
                title="Upload logo"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <input
                type="text"
                placeholder="Company Name"
                value={config.textFields.companyName}
                onChange={(e) => onUpdate({ textFields: { ...config.textFields, companyName: e.target.value } })}
                className={inputClass + " mb-1 font-medium"}
              />
              <input
                type="text"
                placeholder="Tagline"
                value={config.textFields.tagline}
                onChange={(e) => onUpdate({ textFields: { ...config.textFields, tagline: e.target.value } })}
                className={inputClass + " text-[10px]"}
              />
            </div>
          </div>

          {/* Logo width slider */}
          {config.logoData && (
            <FieldRow label="Logo Size">
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={24}
                  max={120}
                  value={config.logoWidth}
                  onChange={(e) => onUpdate({ logoWidth: parseInt(e.target.value) })}
                  className="flex-1 h-1 accent-emerald-500"
                />
                <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{config.logoWidth}</span>
              </div>
            </FieldRow>
          )}

          {/* Contact fields */}
          <div className="space-y-1">
            <input type="text" placeholder="Address" value={config.textFields.address} onChange={(e) => onUpdate({ textFields: { ...config.textFields, address: e.target.value } })} className={inputClass} />
            <div className="grid grid-cols-2 gap-1">
              <input type="text" placeholder="Phone" value={config.textFields.phone} onChange={(e) => onUpdate({ textFields: { ...config.textFields, phone: e.target.value } })} className={inputClass} />
              <input type="text" placeholder="Email" value={config.textFields.email} onChange={(e) => onUpdate({ textFields: { ...config.textFields, email: e.target.value } })} className={inputClass} />
            </div>
            <input type="text" placeholder="Website" value={config.textFields.website} onChange={(e) => onUpdate({ textFields: { ...config.textFields, website: e.target.value } })} className={inputClass} />
          </div>
        </div>
      )}

      {/* Shared controls (alignment, divider) — only when not "none" */}
      {config.mode !== "none" && (
        <div className="space-y-2">
          {/* Alignment */}
          <FieldRow label="Align">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => (
                <button
                  key={align}
                  onClick={() => onUpdate({ alignment: align })}
                  className={`p-1.5 rounded transition-colors ${
                    config.alignment === align
                      ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Divider toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Divider</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={config.showDivider}
                onChange={() => onUpdate({ showDivider: !config.showDivider })}
                className="sr-only peer"
              />
              <div className="w-7 h-4 rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:bg-emerald-500 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3" />
            </div>
          </label>
        </div>
      )}
    </div>
  )
}

// ── Format Tab ────────────────────────────────────────────

function FormatTab({ format, onUpdate, hasDocumentId, onOpenHistory }: {
  format: FormatSettings
  onUpdate: (partial: Partial<FormatSettings>) => void
  hasDocumentId: boolean
  onOpenHistory?: () => void
}) {
  const currentFontValue = legacyFontToValue(format.fontFamily)
  const currentSizeValue = legacySizeToValue(format.fontSize)
  const currentFontDef = getFontDef(currentFontValue)
  const currentSizeNum = parseInt(currentSizeValue) || 15

  const stepSize = (dir: 1 | -1) => {
    const idx = FONT_SIZES.findIndex((s) => s.value === currentSizeValue)
    const nextIdx = idx === -1
      ? FONT_SIZES.findIndex((s) => parseInt(s.value) >= currentSizeNum) + dir
      : idx + dir
    const clamped = Math.max(0, Math.min(FONT_SIZES.length - 1, nextIdx))
    onUpdate({ fontSize: FONT_SIZES[clamped]!.value })
  }

  return (
    <div className="px-3 py-3 space-y-2.5">
      <SectionLabel>Typography</SectionLabel>

      {/* Font family */}
      <div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Font</span>
        <select
          value={currentFontValue}
          onChange={(e) => {
            const fontDef = getFontDef(e.target.value)
            loadGoogleFont(fontDef)
            onUpdate({ fontFamily: e.target.value })
          }}
          className={selectClass + " w-full"}
          style={{ fontFamily: currentFontDef.css }}
        >
          {(["sans", "serif", "mono", "display"] as const).map((cat) => {
            const fontsInCat = FONTS.filter((f) => f.category === cat)
            if (fontsInCat.length === 0) return null
            return (
              <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                {fontsInCat.map((font) => (
                  <option key={font.value} value={font.value}>{font.name}</option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      {/* Font size stepper */}
      <div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Size</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => stepSize(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <select
            value={currentSizeValue}
            onChange={(e) => onUpdate({ fontSize: e.target.value })}
            className={selectClass + " flex-1 text-center tabular-nums"}
          >
            {FONT_SIZES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}px</option>
            ))}
          </select>
          <button
            onClick={() => stepSize(1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Line height */}
      <FieldRow label="Line Height">
        <select
          value={format.lineHeight}
          onChange={(e) => onUpdate({ lineHeight: e.target.value as FormatSettings["lineHeight"] })}
          className={selectClass}
        >
          <option value="tight">Tight</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </FieldRow>

      {/* ── Page Layout ── */}
      <SectionLabel>Page Layout</SectionLabel>

      <FieldRow label="Margins">
        <select
          value={format.pageMargins}
          onChange={(e) => onUpdate({ pageMargins: e.target.value as FormatSettings["pageMargins"] })}
          className={selectClass}
        >
          <option value="narrow">Narrow (0.5&quot;)</option>
          <option value="normal">Normal (1&quot;)</option>
          <option value="wide">Wide (1.25&quot;)</option>
        </select>
      </FieldRow>

      <FieldRow label="Columns">
        <select
          value={format.columnLayout}
          onChange={(e) => onUpdate({ columnLayout: e.target.value as ColumnLayout })}
          className={selectClass}
        >
          <option value="single">Single</option>
          <option value="two-column">Two Column</option>
          <option value="sidebar">Sidebar</option>
        </select>
      </FieldRow>

      {/* Legacy header — only show when no letterhead is active */}
      {(!format.letterheadHeader || format.letterheadHeader.mode === "none") && (
        <FieldRow label="Header">
          <select
            value={format.headerStyle}
            onChange={(e) => onUpdate({ headerStyle: e.target.value as HeaderStyle })}
            className={selectClass}
          >
            <option value="none">None</option>
            <option value="minimal">Minimal</option>
            <option value="branded">Branded</option>
          </select>
        </FieldRow>
      )}

      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">Page Numbers</span>
        <div className="relative">
          <input
            type="checkbox"
            checked={format.showPageNumbers}
            onChange={() => onUpdate({ showPageNumbers: !format.showPageNumbers })}
            className="sr-only peer"
          />
          <div className="w-8 h-[18px] rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:bg-emerald-500 transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[14px]" />
        </div>
      </label>

      {/* ── Letterhead ── */}
      <SectionLabel>Letterhead</SectionLabel>

      <LetterheadSection
        label="Header"
        config={format.letterheadHeader ?? DEFAULT_LETTERHEAD_HEADER}
        onUpdate={(partial) => onUpdate({
          letterheadHeader: { ...(format.letterheadHeader ?? DEFAULT_LETTERHEAD_HEADER), ...partial },
          // When activating letterhead, set legacy header to none
          ...(partial.mode && partial.mode !== "none" ? { headerStyle: "none" as HeaderStyle } : {}),
        })}
      />

      <LetterheadSection
        label="Footer"
        config={format.letterheadFooter ?? DEFAULT_LETTERHEAD_FOOTER}
        onUpdate={(partial) => onUpdate({ letterheadFooter: { ...(format.letterheadFooter ?? DEFAULT_LETTERHEAD_FOOTER), ...partial } })}
      />

      {/* ── Style ── */}
      <SectionLabel>Style</SectionLabel>

      <FieldRow label="Accent Color">
        <div className="relative">
          <input
            type="color"
            value={format.colorAccent}
            onChange={(e) => onUpdate({ colorAccent: e.target.value })}
            className="w-6 h-6 rounded-md cursor-pointer border border-slate-200 dark:border-slate-700 appearance-none"
            style={{ backgroundColor: format.colorAccent }}
          />
        </div>
      </FieldRow>

      {/* History */}
      {hasDocumentId && onOpenHistory && (
        <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Version History
          </button>
        </div>
      )}
    </div>
  )
}

// ── Outline Tab ───────────────────────────────────────────

function OutlineTab({ editor }: { editor: Editor | null }) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activePos, setActivePos] = useState<number | null>(null)

  const extractHeadings = useCallback(() => {
    if (!editor) return
    const items: HeadingItem[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        items.push({
          level: node.attrs.level as number,
          text: node.textContent,
          pos,
        })
      }
    })
    setHeadings(items)
  }, [editor])

  useEffect(() => {
    if (!editor) return
    extractHeadings()
    editor.on("update", extractHeadings)
    return () => { editor.off("update", extractHeadings) }
  }, [editor, extractHeadings])

  const handleClick = (pos: number) => {
    if (!editor) return
    editor.commands.setTextSelection(pos + 1)
    editor.commands.scrollIntoView()
    editor.commands.focus()
    setActivePos(pos)
  }

  return (
    <div className="py-1">
      {headings.length === 0 ? (
        <p className="px-4 py-8 text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
          No headings yet.<br />Add headings to see your document outline.
        </p>
      ) : (
        headings.map((h, i) => (
          <button
            key={`${h.pos}-${i}`}
            onClick={() => handleClick(h.pos)}
            className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors flex items-center gap-1.5 ${
              activePos === h.pos
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
            style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
          >
            <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 opacity-40" />
            <span className={`truncate ${h.level === 1 ? "font-semibold" : h.level === 2 ? "font-medium" : ""}`}>
              {h.text || "(empty heading)"}
            </span>
          </button>
        ))
      )}
    </div>
  )
}

// ── Checklist Tab ─────────────────────────────────────────

const priorityColors = {
  high: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  low: "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800",
}

const statusIcons = {
  met: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  partial: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  missing: <XCircle className="w-3.5 h-3.5 text-red-500" />,
}

function ChecklistTab({ rfpText, documentContent }: { rfpText: string | null; documentContent: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [results, setResults] = useState<Map<string, ComplianceResult>>(new Map())
  const [isGenerating, setIsGenerating] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!rfpText) return
    setIsGenerating(true)
    setResults(new Map())
    try {
      const response = await studioApi.generateChecklist(rfpText)
      setItems(response.items)
    } catch (err) {
      console.error("Checklist generation failed:", err)
    } finally {
      setIsGenerating(false)
    }
  }, [rfpText])

  const handleCheck = useCallback(async () => {
    if (items.length === 0) return
    setIsChecking(true)
    try {
      const response = await studioApi.checkCompliance(documentContent, items)
      const map = new Map<string, ComplianceResult>()
      for (const r of response.results) {
        map.set(r.id, r)
      }
      setResults(map)
    } catch (err) {
      console.error("Compliance check failed:", err)
    } finally {
      setIsChecking(false)
    }
  }, [documentContent, items])

  if (!rfpText) {
    return (
      <p className="px-4 py-8 text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
        Upload an RFP document in the chat sidebar to enable compliance checking.
      </p>
    )
  }

  const grouped = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category]!.push(item)
    return acc
  }, {})

  const metCount = Array.from(results.values()).filter((r) => r.status === "met").length
  const partialCount = Array.from(results.values()).filter((r) => r.status === "partial").length
  const totalChecked = results.size
  const progressPct = items.length > 0 ? Math.round((metCount / items.length) * 100) : 0

  return (
    <div>
      {/* Progress bar */}
      {items.length > 0 && totalChecked > 0 && (
        <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            <span>{metCount} met / {partialCount} partial / {items.length - metCount - partialCount} missing</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex gap-1.5">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md transition-colors disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
          {items.length > 0 ? "Regenerate" : "Generate"}
        </button>
        {items.length > 0 && (
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50"
          >
            {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Check
          </button>
        )}
      </div>

      {/* Items */}
      <div className="py-1">
        {items.length === 0 && !isGenerating && (
          <p className="px-4 py-8 text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
            Click &ldquo;Generate&rdquo; to extract requirements from the uploaded RFP.
          </p>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
            <span className="ml-2 text-[11px] text-slate-500">Analyzing RFP...</span>
          </div>
        )}

        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category} className="mb-2">
            <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {category}
            </div>
            {categoryItems.map((item) => {
              const result = results.get(item.id)
              return (
                <div
                  key={item.id}
                  className="px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {result ? statusIcons[result.status] : (
                        <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-slate-200 dark:border-slate-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.requirement}
                      </p>
                      <span className={`inline-block mt-0.5 px-1.5 py-px text-[9px] font-semibold rounded ${priorityColors[item.priority]}`}>
                        {item.priority}
                      </span>
                      {result?.note && (
                        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {result.note}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Inspector Panel ──────────────────────────────────

export function InspectorPanel({
  activeTab,
  onTabChange,
  format,
  onUpdateFormat,
  editor,
  rfpText,
  documentContent,
  hasDocumentId,
  onOpenHistory,
}: InspectorPanelProps) {
  if (!activeTab) return null

  return (
    <div className="w-[276px] flex-shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200/50 dark:border-slate-800/80 flex flex-col overflow-hidden animate-inspector-in">
      {/* Header with tabs */}
      <div className="px-3 pt-2 pb-1.5 border-b border-slate-100/80 dark:border-slate-800/80 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Inspector</span>
          <button
            onClick={() => onTabChange(null)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-3 h-3 text-slate-400" />
          </button>
        </div>
        {/* Segmented control */}
        <div className="flex bg-slate-100/80 dark:bg-slate-800/80 rounded-lg p-0.5">
          <TabButton label="Format" active={activeTab === "format"} onClick={() => onTabChange("format")} />
          <TabButton label="Outline" active={activeTab === "outline"} onClick={() => onTabChange("outline")} />
          <TabButton label="Checklist" active={activeTab === "checklist"} onClick={() => onTabChange("checklist")} />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "format" && (
          <FormatTab
            format={format}
            onUpdate={onUpdateFormat}
            hasDocumentId={hasDocumentId}
            onOpenHistory={onOpenHistory}
          />
        )}
        {activeTab === "outline" && (
          <OutlineTab editor={editor} />
        )}
        {activeTab === "checklist" && (
          <ChecklistTab rfpText={rfpText} documentContent={documentContent} />
        )}
      </div>
    </div>
  )
}
