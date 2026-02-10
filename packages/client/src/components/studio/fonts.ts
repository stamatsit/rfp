// ── Font definitions for Document Studio ─────────────────

export interface FontDef {
  name: string
  value: string
  category: "sans" | "serif" | "mono" | "display"
  css: string // CSS font-family stack
  google?: string // Google Fonts family name (if needed)
}

export const FONTS: FontDef[] = [
  // Sans-serif
  { name: "Inter", value: "Inter", category: "sans", css: "'Inter', system-ui, sans-serif", google: "Inter" },
  { name: "Open Sans", value: "Open Sans", category: "sans", css: "'Open Sans', sans-serif", google: "Open+Sans" },
  { name: "Lato", value: "Lato", category: "sans", css: "'Lato', sans-serif", google: "Lato" },
  { name: "Roboto", value: "Roboto", category: "sans", css: "'Roboto', sans-serif", google: "Roboto" },
  { name: "Source Sans 3", value: "Source Sans 3", category: "sans", css: "'Source Sans 3', sans-serif", google: "Source+Sans+3" },
  { name: "Nunito", value: "Nunito", category: "sans", css: "'Nunito', sans-serif", google: "Nunito" },
  { name: "Poppins", value: "Poppins", category: "sans", css: "'Poppins', sans-serif", google: "Poppins" },
  { name: "Montserrat", value: "Montserrat", category: "sans", css: "'Montserrat', sans-serif", google: "Montserrat" },
  { name: "DM Sans", value: "DM Sans", category: "sans", css: "'DM Sans', sans-serif", google: "DM+Sans" },
  { name: "Work Sans", value: "Work Sans", category: "sans", css: "'Work Sans', sans-serif", google: "Work+Sans" },

  // Serif
  { name: "Georgia", value: "Georgia", category: "serif", css: "'Georgia', 'Times New Roman', serif" },
  { name: "Merriweather", value: "Merriweather", category: "serif", css: "'Merriweather', Georgia, serif", google: "Merriweather" },
  { name: "Playfair Display", value: "Playfair Display", category: "serif", css: "'Playfair Display', Georgia, serif", google: "Playfair+Display" },
  { name: "Lora", value: "Lora", category: "serif", css: "'Lora', Georgia, serif", google: "Lora" },
  { name: "EB Garamond", value: "EB Garamond", category: "serif", css: "'EB Garamond', Garamond, serif", google: "EB+Garamond" },
  { name: "Libre Baskerville", value: "Libre Baskerville", category: "serif", css: "'Libre Baskerville', Georgia, serif", google: "Libre+Baskerville" },

  // Monospace
  { name: "JetBrains Mono", value: "JetBrains Mono", category: "mono", css: "'JetBrains Mono', 'Fira Code', monospace", google: "JetBrains+Mono" },
  { name: "Fira Code", value: "Fira Code", category: "mono", css: "'Fira Code', monospace", google: "Fira+Code" },
  { name: "IBM Plex Mono", value: "IBM Plex Mono", category: "mono", css: "'IBM Plex Mono', monospace", google: "IBM+Plex+Mono" },

  // Display
  { name: "Outfit", value: "Outfit", category: "display", css: "'Outfit', system-ui, sans-serif", google: "Outfit" },
  { name: "Sora", value: "Sora", category: "display", css: "'Sora', sans-serif", google: "Sora" },
  { name: "Space Grotesk", value: "Space Grotesk", category: "display", css: "'Space Grotesk', sans-serif", google: "Space+Grotesk" },
]

// ── Font sizes (points → px) ─────────────────────────────

export const FONT_SIZES = [
  { label: "8", value: "8px" },
  { label: "9", value: "9px" },
  { label: "10", value: "10px" },
  { label: "11", value: "11px" },
  { label: "12", value: "12px" },
  { label: "13", value: "13px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
  { label: "64", value: "64px" },
  { label: "72", value: "72px" },
]

// ── Google Fonts loader ──────────────────────────────────

const loadedFonts = new Set<string>()

export function loadGoogleFont(fontDef: FontDef) {
  if (!fontDef.google || loadedFonts.has(fontDef.google)) return
  loadedFonts.add(fontDef.google)

  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?family=${fontDef.google}:wght@300;400;500;600;700&display=swap`
  document.head.appendChild(link)
}

export function loadAllGoogleFonts() {
  const families = FONTS.filter((f) => f.google).map((f) => `family=${f.google}:wght@300;400;500;600;700`)
  if (families.length === 0) return

  // Batch load in one request
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`
  document.head.appendChild(link)
}

export function getFontDef(fontValue: string): FontDef {
  return FONTS.find((f) => f.value === fontValue) || FONTS[0]!
}

// Legacy format setting mapper
export function legacyFontToValue(legacy: string): string {
  switch (legacy) {
    case "sans": return "Inter"
    case "serif": return "Georgia"
    case "mono": return "JetBrains Mono"
    default: return legacy
  }
}

export function legacySizeToValue(legacy: string): string {
  switch (legacy) {
    case "small": return "13px"
    case "normal": return "15px"
    case "large": return "17px"
    case "xl": return "20px"
    default: return legacy
  }
}
