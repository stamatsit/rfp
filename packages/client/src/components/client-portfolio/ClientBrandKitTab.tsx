/**
 * ClientBrandKitTab — Brand identity: scrape, manual edit, colors, fonts, logo.
 */

import { useState, useRef } from "react"
import {
  Palette,
  Wand2,
  Loader2,
  Pencil,
  Upload,
  RotateCcw,
  Image,
} from "lucide-react"
import { useClientSelection } from "./ClientPortfolioContext"
import { clientBrandKitApi, type ClientBrandKit } from "@/lib/api"
import { toast } from "@/hooks/useToast"

export function ClientBrandKitTab() {
  const { selectedClient, brandKit, setBrandKit } = useClientSelection()

  const [scrapingUrl, setScrapingUrl] = useState(brandKit?.websiteUrl || "")
  const [isScraping, setIsScraping] = useState(false)
  const [editingBrandKit, setEditingBrandKit] = useState(false)
  const [brandKitDraft, setBrandKitDraft] = useState<Partial<ClientBrandKit>>({})
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  if (!selectedClient) return null

  // ── Handlers
  const handleScrape = async () => {
    if (!scrapingUrl.trim()) return
    setIsScraping(true)
    try {
      const kit = await clientBrandKitApi.scrape(selectedClient, scrapingUrl.trim())
      setBrandKit(kit)
      setEditingBrandKit(false)
      if (kit.scrapeStatus === "failed") {
        toast.error("Scrape failed — could not load the website")
      } else {
        const parts: string[] = []
        const colorCount = [kit.primaryColor, kit.secondaryColor, kit.accentColor].filter(Boolean).length
        if (colorCount) parts.push(`${colorCount} color${colorCount > 1 ? "s" : ""}`)
        if (kit.primaryFont) parts.push("font")
        if (kit.logoUrl || kit.logoStorageKey) parts.push("logo")
        if (parts.length) {
          toast.success(`Scraped: ${parts.join(", ")}`)
        } else {
          toast.error("No styles found — site uses external stylesheets. Enter brand colors manually.")
        }
      }
    } catch (err: unknown) {
      console.error("Scrape failed:", err)
      toast.error(`Scrape failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setIsScraping(false)
    }
  }

  const handleBrandKitSave = async () => {
    try {
      const kit = await clientBrandKitApi.update(selectedClient, brandKitDraft)
      setBrandKit(kit)
      setEditingBrandKit(false)
      setBrandKitDraft({})
    } catch (err) {
      toast.error(`Brand kit save failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const kit = await clientBrandKitApi.uploadLogo(selectedClient, file)
      setBrandKit(prev => prev ? { ...prev, logoStorageKey: kit.logoStorageKey, logoUrl: kit.logoUrl } : kit)
    } catch (err: unknown) {
      toast.error(`Logo upload failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const startEditing = () => {
    setEditingBrandKit(true)
    setScrapingUrl(brandKit?.websiteUrl || "")
    setBrandKitDraft({
      primaryColor: brandKit?.primaryColor ?? "",
      secondaryColor: brandKit?.secondaryColor ?? "",
      accentColor: brandKit?.accentColor ?? "",
      primaryFont: brandKit?.primaryFont ?? "",
      tone: brandKit?.tone ?? "",
      styleNotes: brandKit?.styleNotes ?? "",
      websiteUrl: brandKit?.websiteUrl ?? "",
    })
  }

  const copyColor = (hex: string) => {
    navigator.clipboard.writeText(hex)
    setCopiedColor(hex)
    setTimeout(() => setCopiedColor(null), 2000)
  }

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Palette size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Brand Kit</span>
        {brandKit?.scrapeStatus === "partial" && !brandKit.primaryColor && !brandKit.primaryFont && (
          <span className="text-[10px] text-amber-500 font-medium">no styles found</span>
        )}
        {[brandKit?.primaryColor, brandKit?.secondaryColor, brandKit?.accentColor].filter(Boolean).map(hex => (
          <span key={hex} className="w-3 h-3 rounded-full border border-white dark:border-slate-700 shadow-sm" style={{ backgroundColor: hex! }} />
        ))}
      </div>

      {/* Edit / Scrape mode */}
      {!brandKit || editingBrandKit ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={scrapingUrl}
              onChange={e => setScrapingUrl(e.target.value)}
              placeholder="https://client-website.com"
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            <button
              onClick={handleScrape}
              disabled={isScraping || !scrapingUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isScraping ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
              {isScraping ? "Scraping…" : "Scrape"}
            </button>
          </div>
          {editingBrandKit && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {(["primaryColor", "secondaryColor", "accentColor"] as const).map(field => {
                  const val = (brandKitDraft as Record<string, string | undefined>)[field] ?? ""
                  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(val)
                  return (
                    <div key={field}>
                      <label className="text-[10px] text-slate-400 block mb-0.5 capitalize">{field.replace("Color", "")}</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={isValidHex ? val : "#888888"}
                          onChange={e => setBrandKitDraft(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0 shrink-0"
                        />
                        <input
                          type="text"
                          placeholder="#000000"
                          value={val}
                          onChange={e => setBrandKitDraft(prev => ({ ...prev, [field]: e.target.value }))}
                          className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Primary Font</label>
                  <input
                    type="text"
                    placeholder="Inter"
                    value={brandKitDraft.primaryFont ?? ""}
                    onChange={e => setBrandKitDraft(prev => ({ ...prev, primaryFont: e.target.value }))}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Brand Tone</label>
                  <input
                    type="text"
                    placeholder="Professional, warm"
                    value={brandKitDraft.tone ?? ""}
                    onChange={e => setBrandKitDraft(prev => ({ ...prev, tone: e.target.value }))}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Style Notes</label>
                <textarea
                  placeholder="Brand voice notes, visual style, etc."
                  value={brandKitDraft.styleNotes ?? ""}
                  onChange={e => setBrandKitDraft(prev => ({ ...prev, styleNotes: e.target.value }))}
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleBrandKitSave} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white transition-colors">Save</button>
                <button onClick={() => { setEditingBrandKit(false); setBrandKitDraft({}) }} className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {!editingBrandKit && (
            <button onClick={startEditing} className="text-[11px] text-sky-500 hover:text-sky-600 transition-colors">Enter manually instead</button>
          )}
        </div>
      ) : (
        /* Display mode */
        <div className="space-y-4">
          {!brandKit.primaryColor && !brandKit.primaryFont && !brandKit.tone && !brandKit.logoUrl && !brandKit.logoStorageKey && (
            <p className="text-[11px] text-slate-400 italic">
              {brandKit.scrapeStatus === "failed"
                ? "Scrape failed — site could not be loaded."
                : "No styles found. The site likely uses external stylesheets."
              }
              {" "}
              <button onClick={startEditing} className="text-sky-500 hover:text-sky-600 underline">Enter manually</button>
            </p>
          )}

          {/* Colors */}
          {[brandKit.primaryColor, brandKit.secondaryColor, brandKit.accentColor].some(Boolean) && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Colors</p>
              <div className="flex gap-2.5 flex-wrap">
                {[brandKit.primaryColor, brandKit.secondaryColor, brandKit.accentColor].filter(Boolean).map(hex => (
                  <button
                    key={hex}
                    onClick={() => copyColor(hex!)}
                    className="group relative w-9 h-9 rounded-full border-2 border-white dark:border-slate-700 shadow-sm hover:scale-110 transition-transform"
                    style={{ backgroundColor: hex! }}
                    title={copiedColor === hex ? "Copied!" : hex!}
                  >
                    {copiedColor === hex && (
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded whitespace-nowrap">Copied!</span>
                    )}
                  </button>
                ))}
                {brandKit.rawColors && brandKit.rawColors
                  .filter(c => c !== brandKit.primaryColor && c !== brandKit.secondaryColor && c !== brandKit.accentColor)
                  .slice(0, 5)
                  .map(hex => (
                    <button
                      key={hex}
                      onClick={() => copyColor(hex)}
                      className="w-5 h-5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-110 transition-transform opacity-60 hover:opacity-100"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))
                }
              </div>
            </div>
          )}

          {/* Typography */}
          {brandKit.primaryFont && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Typography</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{brandKit.primaryFont}{brandKit.fontStack && brandKit.fontStack !== brandKit.primaryFont ? <span className="text-slate-400 text-[10px]"> · {brandKit.fontStack}</span> : ""}</p>
            </div>
          )}

          {/* Tone */}
          {brandKit.tone && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Brand Tone</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{brandKit.tone}</span>
            </div>
          )}

          {/* Style Notes */}
          {brandKit.styleNotes && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{brandKit.styleNotes}</p>
          )}

          {/* Logo */}
          {(brandKit.logoUrl || brandKit.logoStorageKey) && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Logo</p>
              {brandKit.logoUrl
                ? <img src={brandKit.logoUrl} alt="Logo" className="h-8 max-w-24 object-contain rounded" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                : <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><Image size={12} /> Logo uploaded</span>
              }
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 flex-wrap">
            <button
              onClick={startEditing}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <Pencil size={10} /> Edit
            </button>
            <input ref={logoInputRef} type="file" className="hidden" accept="image/*,.svg" onChange={handleLogoUpload} />
            <button
              onClick={() => logoInputRef.current?.click()}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <Upload size={10} /> Upload Logo
            </button>
            {brandKit.websiteUrl && (
              <button
                onClick={startEditing}
                disabled={isScraping}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={10} /> Re-scrape
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
