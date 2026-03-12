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
