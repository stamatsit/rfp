export interface ClientChatContext {
  clientName: string
  sector?: string
  caseStudies: Array<{
    focus: string
    challenge?: string | null
    solution?: string | null
    metrics: Array<{ label: string; value: string }>
    testimonialQuote?: string | null
    testimonialAttribution?: string | null
  }>
  results: Array<{ metric: string; result: string; direction: "increase" | "decrease" }>
  testimonials: Array<{ quote: string; name?: string | null; title?: string | null; organization?: string | null }>
  awards: Array<{ name: string; year: number | string; issuingAgency?: string | null; awardLevel?: string | null }>
  proposals: Array<{ date?: string | null; projectType?: string | null; category?: string | null; won?: string | null; servicesOffered?: string[] }>
  qaAnswers?: Array<{ question: string; answer: string; topic: string }>
  documents?: Array<{ title: string; docType: string; summary: string | null; keyPoints: string[] | null }>
  brandKit?: { primaryColor: string | null; primaryFont: string | null; tone: string | null; styleNotes: string | null; websiteUrl: string | null } | null
}
