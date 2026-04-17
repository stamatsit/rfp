import type { ReportData } from "../types.js"
import { esc, safeJson } from "./utils.js"
import { MAIN_STYLES } from "./styles.main.js"
import { INTRO_STYLES } from "./styles.intro.js"
import { CHAT_STYLES } from "./styles.chat.js"

/** Render <head> with meta + OG + Twitter tags + JSON-LD + all <style> blocks. */
export function renderHead(data: ReportData): string {
  const { meta, client } = data
  const ogDesc = meta.ogDescription ?? meta.description
  const twDesc = meta.twitterDescription ?? meta.description

  // Root JSON-LD Report schema — always emit.
  const reportSchema = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: meta.title,
    description: meta.description,
    datePublished: meta.datePublished,
    about: {
      "@type": "WebPage",
      name: client.name,
      url: client.auditedUrl,
    },
  }

  const extraLd = (meta.jsonLdBlocks ?? [])
    .map((block) => `<script type="application/ld+json">${block}</script>`)
    .join("\n")

  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(twDesc)}">

<script type="application/ld+json">${safeJson(reportSchema)}</script>
${extraLd}

<style>${MAIN_STYLES}</style>
<style>${INTRO_STYLES}</style>
<style>${CHAT_STYLES}</style>
</head>`
}
