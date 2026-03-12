/**
 * Pitch Deck Renderer — Converts structured JSON into branded .pptx files via PptxGenJS
 *
 * Stamats-branded master slides, 9 layout types, widescreen format.
 */

import PptxGenJS from "pptxgenjs"

// ─── Stamats Brand Constants ─────────────────────────────────

const BRAND = {
  navy: "1F4E78",
  teal: "0D9488",
  dark: "1E293B",
  light: "F1F5F9",
  white: "FFFFFF",
  muted: "64748B",
  accent: "3B82F6",
  fontHeading: "Calibri",
  fontBody: "Calibri",
} as const

// ─── Interfaces ──────────────────────────────────────────────

export interface PitchDeckSlide {
  type: "title" | "content" | "two-column" | "image-text" | "chart" | "comparison" | "quote" | "section-divider" | "closing"
  title: string
  subtitle?: string
  bullets?: string[]
  leftColumn?: { title: string; bullets: string[] }
  rightColumn?: { title: string; bullets: string[] }
  quote?: { text: string; attribution: string }
  chartData?: { type: "bar" | "line" | "pie" | "area"; labels: string[]; values: number[]; seriesName?: string }
  comparisonRows?: Array<{ feature: string; us: string; them: string }>
  speakerNotes?: string
}

export interface PitchDeckOutput {
  deckTitle: string
  slides: PitchDeckSlide[]
}

// ─── Master Slide Definitions ────────────────────────────────

function defineMasters(pres: PptxGenJS) {
  pres.defineSlideMaster({
    title: "MASTER_TITLE",
    background: { color: BRAND.navy },
    objects: [
      { rect: { x: 0, y: 6.8, w: "100%", h: 0.7, fill: { color: BRAND.teal } } },
      { text: { text: "STAMATS", options: { x: 10.5, y: 6.9, w: 2.5, h: 0.4, fontSize: 11, color: BRAND.white, fontFace: BRAND.fontBody, align: "right", bold: true, charSpacing: 3 } } },
    ],
  })

  pres.defineSlideMaster({
    title: "MASTER_CONTENT",
    background: { color: BRAND.white },
    objects: [
      { rect: { x: 0, y: 0, w: "100%", h: 0.08, fill: { color: BRAND.navy } } },
      { rect: { x: 0, y: 7.1, w: "100%", h: 0.4, fill: { color: BRAND.light } } },
      { text: { text: "STAMATS", options: { x: 10.5, y: 7.15, w: 2.5, h: 0.3, fontSize: 9, color: BRAND.muted, fontFace: BRAND.fontBody, align: "right", bold: true, charSpacing: 2 } } },
    ],
  })

  pres.defineSlideMaster({
    title: "MASTER_SECTION",
    background: { color: BRAND.teal },
    objects: [
      { rect: { x: 0, y: 6.8, w: "100%", h: 0.7, fill: { color: BRAND.navy } } },
    ],
  })

  pres.defineSlideMaster({
    title: "MASTER_CLOSING",
    background: { color: BRAND.navy },
    objects: [
      { rect: { x: 0, y: 5.5, w: "100%", h: 0.04, fill: { color: BRAND.teal } } },
      { text: { text: "STAMATS", options: { x: 10.5, y: 6.9, w: 2.5, h: 0.4, fontSize: 11, color: BRAND.white, fontFace: BRAND.fontBody, align: "right", bold: true, charSpacing: 3 } } },
    ],
  })
}

// ─── Slide Renderers ─────────────────────────────────────────

function renderTitleSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_TITLE" })
  s.addText(slide.title, {
    x: 0.8, y: 2.0, w: 11.7, h: 1.8,
    fontSize: 44, bold: true, color: BRAND.white,
    fontFace: BRAND.fontHeading, align: "left", valign: "bottom",
  })
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8, y: 4.0, w: 11.7, h: 0.8,
      fontSize: 20, color: BRAND.light,
      fontFace: BRAND.fontBody, align: "left",
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderContentSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })
  s.addText(slide.title, {
    x: 0.8, y: 0.4, w: 11.7, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.navy,
    fontFace: BRAND.fontHeading,
  })
  if (slide.bullets && slide.bullets.length > 0) {
    s.addText(
      slide.bullets.map(b => ({ text: b, options: { bullet: true, indentLevel: 0 } })),
      {
        x: 0.8, y: 1.5, w: 11.7, h: 5.2,
        fontSize: 18, color: BRAND.dark,
        fontFace: BRAND.fontBody, lineSpacingMultiple: 1.4,
        valign: "top",
      }
    )
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderTwoColumnSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })
  s.addText(slide.title, {
    x: 0.8, y: 0.4, w: 11.7, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.navy,
    fontFace: BRAND.fontHeading,
  })

  // Left column
  if (slide.leftColumn) {
    s.addText(slide.leftColumn.title, {
      x: 0.8, y: 1.5, w: 5.5, h: 0.5,
      fontSize: 20, bold: true, color: BRAND.teal,
      fontFace: BRAND.fontHeading,
    })
    if (slide.leftColumn.bullets.length > 0) {
      s.addText(
        slide.leftColumn.bullets.map(b => ({ text: b, options: { bullet: true, indentLevel: 0 } })),
        {
          x: 0.8, y: 2.2, w: 5.5, h: 4.5,
          fontSize: 16, color: BRAND.dark,
          fontFace: BRAND.fontBody, lineSpacingMultiple: 1.3,
          valign: "top",
        }
      )
    }
  }

  // Divider line
  s.addShape(pres.ShapeType.line, {
    x: 6.6, y: 1.5, w: 0, h: 5.2,
    line: { color: BRAND.light, width: 1 },
  })

  // Right column
  if (slide.rightColumn) {
    s.addText(slide.rightColumn.title, {
      x: 7.0, y: 1.5, w: 5.5, h: 0.5,
      fontSize: 20, bold: true, color: BRAND.teal,
      fontFace: BRAND.fontHeading,
    })
    if (slide.rightColumn.bullets.length > 0) {
      s.addText(
        slide.rightColumn.bullets.map(b => ({ text: b, options: { bullet: true, indentLevel: 0 } })),
        {
          x: 7.0, y: 2.2, w: 5.5, h: 4.5,
          fontSize: 16, color: BRAND.dark,
          fontFace: BRAND.fontBody, lineSpacingMultiple: 1.3,
          valign: "top",
        }
      )
    }
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderImageTextSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })
  s.addText(slide.title, {
    x: 0.8, y: 0.4, w: 11.7, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.navy,
    fontFace: BRAND.fontHeading,
  })

  // Image placeholder
  s.addShape(pres.ShapeType.rect, {
    x: 0.8, y: 1.5, w: 5.5, h: 5.2,
    fill: { color: BRAND.light },
    line: { color: "CBD5E1", width: 1, dashType: "dash" },
  })
  s.addText("Insert Image", {
    x: 0.8, y: 3.5, w: 5.5, h: 0.8,
    fontSize: 14, color: BRAND.muted,
    fontFace: BRAND.fontBody, align: "center",
  })

  // Text column
  if (slide.bullets && slide.bullets.length > 0) {
    s.addText(
      slide.bullets.map(b => ({ text: b, options: { bullet: true, indentLevel: 0 } })),
      {
        x: 7.0, y: 1.5, w: 5.5, h: 5.2,
        fontSize: 16, color: BRAND.dark,
        fontFace: BRAND.fontBody, lineSpacingMultiple: 1.4,
        valign: "top",
      }
    )
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderChartSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })
  s.addText(slide.title, {
    x: 0.8, y: 0.4, w: 11.7, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.navy,
    fontFace: BRAND.fontHeading,
  })

  if (slide.chartData && slide.chartData.labels.length > 0) {
    const chartTypeMap: Record<string, PptxGenJS.CHART_NAME> = {
      bar: pres.ChartType.bar,
      line: pres.ChartType.line,
      pie: pres.ChartType.pie,
      area: pres.ChartType.area,
    }
    const chartType = chartTypeMap[slide.chartData.type] || pres.ChartType.bar

    s.addChart(chartType, [
      {
        name: slide.chartData.seriesName || "Series 1",
        labels: slide.chartData.labels,
        values: slide.chartData.values,
      },
    ], {
      x: 0.8, y: 1.5, w: 11.7, h: 5.2,
      showLegend: false,
      showTitle: false,
      chartColors: [BRAND.navy, BRAND.teal, BRAND.accent, "F59E0B", "EF4444", "8B5CF6"],
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderComparisonSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })
  s.addText(slide.title, {
    x: 0.8, y: 0.4, w: 11.7, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.navy,
    fontFace: BRAND.fontHeading,
  })

  if (slide.comparisonRows && slide.comparisonRows.length > 0) {
    const headerRow: PptxGenJS.TableCell[] = [
      { text: "Feature", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy }, fontSize: 14, fontFace: BRAND.fontHeading } },
      { text: "Stamats", options: { bold: true, color: BRAND.white, fill: { color: BRAND.teal }, fontSize: 14, fontFace: BRAND.fontHeading } },
      { text: "Competitor", options: { bold: true, color: BRAND.white, fill: { color: BRAND.muted }, fontSize: 14, fontFace: BRAND.fontHeading } },
    ]

    const dataRows: PptxGenJS.TableCell[][] = slide.comparisonRows.map((row, i) => [
      { text: row.feature, options: { fontSize: 13, fontFace: BRAND.fontBody, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
      { text: row.us, options: { fontSize: 13, fontFace: BRAND.fontBody, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
      { text: row.them, options: { fontSize: 13, fontFace: BRAND.fontBody, fill: { color: i % 2 === 0 ? BRAND.white : BRAND.light } } },
    ])

    s.addTable([headerRow, ...dataRows], {
      x: 0.8, y: 1.5, w: 11.7,
      colW: [4.0, 3.85, 3.85],
      border: { type: "solid", pt: 0.5, color: "E2E8F0" },
      rowH: 0.5,
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderQuoteSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CONTENT" })

  // Teal accent bar
  s.addShape(pres.ShapeType.rect, {
    x: 0.8, y: 2.0, w: 0.08, h: 3.0,
    fill: { color: BRAND.teal },
  })

  if (slide.quote) {
    s.addText(`\u201C${slide.quote.text}\u201D`, {
      x: 1.3, y: 2.0, w: 10.5, h: 2.5,
      fontSize: 24, italic: true, color: BRAND.dark,
      fontFace: BRAND.fontBody, valign: "middle",
      lineSpacingMultiple: 1.4,
    })
    s.addText(`\u2014 ${slide.quote.attribution}`, {
      x: 1.3, y: 4.5, w: 10.5, h: 0.5,
      fontSize: 16, color: BRAND.muted,
      fontFace: BRAND.fontBody,
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderSectionDividerSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_SECTION" })
  s.addText(slide.title, {
    x: 0.8, y: 2.5, w: 11.7, h: 2.0,
    fontSize: 40, bold: true, color: BRAND.white,
    fontFace: BRAND.fontHeading, align: "left", valign: "middle",
  })
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8, y: 4.5, w: 11.7, h: 0.8,
      fontSize: 18, color: BRAND.white,
      fontFace: BRAND.fontBody, align: "left",
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

function renderClosingSlide(pres: PptxGenJS, slide: PitchDeckSlide) {
  const s = pres.addSlide({ masterName: "MASTER_CLOSING" })
  s.addText(slide.title, {
    x: 0.8, y: 1.5, w: 11.7, h: 1.5,
    fontSize: 36, bold: true, color: BRAND.white,
    fontFace: BRAND.fontHeading, align: "center", valign: "middle",
  })
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8, y: 3.2, w: 11.7, h: 1.0,
      fontSize: 20, color: BRAND.light,
      fontFace: BRAND.fontBody, align: "center",
    })
  }
  if (slide.bullets && slide.bullets.length > 0) {
    s.addText(slide.bullets.join("\n"), {
      x: 2.5, y: 4.2, w: 8.3, h: 1.2,
      fontSize: 16, color: BRAND.muted,
      fontFace: BRAND.fontBody, align: "center",
      lineSpacingMultiple: 1.4,
    })
  }
  if (slide.speakerNotes) s.addNotes(slide.speakerNotes)
}

// ─── Renderer Dispatch ───────────────────────────────────────

const RENDERERS: Record<PitchDeckSlide["type"], (pres: PptxGenJS, slide: PitchDeckSlide) => void> = {
  "title": renderTitleSlide,
  "content": renderContentSlide,
  "two-column": renderTwoColumnSlide,
  "image-text": renderImageTextSlide,
  "chart": renderChartSlide,
  "comparison": renderComparisonSlide,
  "quote": renderQuoteSlide,
  "section-divider": renderSectionDividerSlide,
  "closing": renderClosingSlide,
}

// ─── Main Export ─────────────────────────────────────────────

export async function renderPitchDeck(deckData: PitchDeckOutput): Promise<Buffer> {
  const pres = new PptxGenJS()
  pres.layout = "LAYOUT_WIDE" // 13.33 x 7.5 inches (widescreen)
  pres.title = deckData.deckTitle
  pres.author = "Stamats"
  pres.company = "Stamats"

  defineMasters(pres)

  for (const slide of deckData.slides) {
    const renderer = RENDERERS[slide.type]
    if (renderer) {
      renderer(pres, slide)
    } else {
      // Fallback to content slide for unknown types
      renderContentSlide(pres, slide)
    }
  }

  return pres.write({ outputType: "nodebuffer" }) as Promise<Buffer>
}
