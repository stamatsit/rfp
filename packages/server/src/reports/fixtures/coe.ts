import type { ReportData } from "../types.js"

/**
 * Golden-test fixture: a ReportData payload that, when fed through renderReport(),
 * should reproduce the Stamats Coe College gap-analysis report 1:1 in appearance.
 *
 * Keep this in sync with coe-gap-analysis-report.html at the repo root.
 */
export const coeReportData: ReportData = {
  client: {
    name: "Coe College",
    auditedUrl: "https://www.coe.edu/academics/majors-areas-study",
    auditedUrlDisplay: "coe.edu/academics/majors-areas-study",
    shortName: "Coe",
  },
  firm: {
    name: "Stamats",
    logoUrl: "screenshots/stamats-logo.png",
  },
  meta: {
    title: "Coe College Majors Page \u2014 Gap Analysis Report",
    description:
      "Comprehensive gap analysis of Coe College's Majors & Areas of Study page covering accessibility, SEO, content, UX, privacy, performance, and competitive positioning.",
    ogDescription:
      "87 issues identified across 10 categories. Comprehensive audit with scores, priorities, and competitive benchmarking.",
    twitterDescription: "87 issues identified across 10 categories.",
    datePublished: "2026-03-30",
    dateDisplay: "March 30, 2026",
  },
  nav: [
    { href: "#health-score", label: "Score" },
    { href: "#exec", label: "Summary" },
    { href: "#severity", label: "Severity" },
    { href: "#cat-scores", label: "Categories" },
    { href: "#screenshots", label: "Page Now" },
    { href: "#programs", label: "Programs" },
    { href: "#opportunities", label: "Opportunities" },
    { href: "#cat-a11y", label: "A11y" },
    { href: "#cat-seo", label: "SEO" },
    { href: "#schema-deep-dive", label: "Schema" },
    { href: "#cat-content", label: "Content" },
    { href: "#cat-ux", label: "UX" },
    { href: "#cat-modern", label: "Features" },
    { href: "#cat-trust", label: "Trust" },
    { href: "#cat-privacy", label: "Privacy" },
    { href: "#competitive", label: "Competitive" },
    { href: "#priorities", label: "Priorities" },
  ],
  hero: {
    badge: "87 issues across 10 categories",
    titleLine1: "Coe College",
    titleLine2: "Majors Page",
    titleLine3: "Gap Analysis",
    subtitle:
      "A comprehensive audit of coe.edu/academics/majors-areas-study covering accessibility, SEO, content, UX, privacy, performance, and competitive positioning against peer institutions.",
    subtitleHighlight: "coe.edu/academics/majors-areas-study",
    screenshot: "screenshots/coe-viewport.png",
    floatTags: [
      { text: "0 alt texts", tone: "critical" },
      { text: "No meta description", tone: "high" },
      { text: "82 programs, 0 filters", tone: "medium" },
    ],
    stats: [
      { number: 27, label: "Critical", tone: "critical" },
      { number: 30, label: "High", tone: "high" },
      { number: 22, label: "Medium", tone: "medium" },
      { number: 10, label: "Categories", tone: "accent" },
    ],
  },
  healthScore: {
    score: 18,
    grade: "F",
    heading: "Page scores 18 out of 100",
    subtitle:
      "Aggregated across all audit dimensions. A score below 40 indicates fundamental gaps requiring immediate attention. Peer institutions score 55\u201375 on the same rubric.",
    body: "The page fulfills its most basic function (listing program names with links) but fails to meet modern standards in every other dimension.",
    subGrades: [
      { name: "Accessibility", score: 8, grade: "F" },
      { name: "SEO & Markup", score: 12, grade: "F" },
      { name: "Content", score: 5, grade: "F" },
      { name: "UX & Interface", score: 15, grade: "F" },
      { name: "Modern Features", score: 0, grade: "F" },
      { name: "Trust Signals", score: 3, grade: "F" },
      { name: "Privacy & Legal", score: 10, grade: "F" },
      { name: "Performance", score: 35, grade: "D" },
    ],
  },
  executiveSummary: {
    heading: "The page works. Nothing else does.",
    subtitle:
      "Coe's Majors page is the primary gateway for prospective students. Despite 82 program listings, it provides almost zero information about any of them.",
    cards: [
      {
        icon: "search",
        tone: "critical",
        title: "No Way to Search or Filter",
        body: "82 programs in one flat list. No keyword search, no category filters, no department grouping. Students who don't know what they want have zero way to explore.",
      },
      {
        icon: "file",
        tone: "critical",
        title: "Zero Program Descriptions",
        body: "Every major is a name and a link. Not one sentence about what students will study, what careers it leads to, or why Coe's program stands out.",
      },
      {
        icon: "eye",
        tone: "critical",
        title: "Accessibility Failures",
        body: "Zero alt text. No ARIA labels. Inaccessible symbols. Missing semantic HTML. Fails WCAG 2.1 Level A \u2014 the bare minimum \u2014 with potential ADA legal exposure.",
      },
      {
        icon: "external",
        tone: "critical",
        title: "Invisible to Search & Social",
        body: "No meta description, OG tags, Twitter Cards, Schema.org, or canonical URL. Social previews are blank. Google gets zero structured information.",
      },
      {
        icon: "shield",
        tone: "critical",
        title: "Privacy Violations",
        body: "5 tracking scripts fire before consent. Hotjar records session replays. No cookie banner. Likely violates GDPR, CCPA, and emerging state privacy laws.",
      },
      {
        icon: "trophy",
        tone: "high",
        title: "No Trust Signals",
        body: "No rankings, accreditation badges, graduation rates, employment data, class sizes, or student-faculty ratio. Zero proof of value from a quality institution.",
      },
    ],
  },
  severity: {
    heading: "65% of issues are Critical or High",
    subtitle:
      "These aren't nice-to-haves. They represent industry standards that Coe is currently missing.",
    counts: { critical: 27, high: 30, medium: 22, low: 8 },
  },
  categoryScores: {
    heading: "Performance by category",
    subtitle:
      "Each scored on a 100-point scale. Red means failing. Yellow means far below standard.",
    categories: [
      { id: "a11y", name: "Accessibility", score: 8, issueCount: 9, icon: "eye", tone: "critical", tagline: "WCAG 2.2 AA" },
      { id: "seo", name: "SEO & Markup", score: 12, issueCount: 12, icon: "search", tone: "high", tagline: "Search visibility" },
      { id: "content", name: "Content", score: 5, issueCount: 14, icon: "file", tone: "critical", tagline: "Information depth" },
      { id: "ux", name: "UX & Interface", score: 15, issueCount: 10, icon: "layout", tone: "purple", tagline: "Usability" },
      { id: "modern", name: "Modern Features", score: 0, issueCount: 11, icon: "sparkle", tone: "medium", tagline: "Innovation" },
      { id: "trust", name: "Trust Signals", score: 3, issueCount: 10, icon: "trophy", tone: "low", tagline: "Social proof" },
      { id: "privacy", name: "Privacy & Legal", score: 10, issueCount: 6, icon: "shield", tone: "critical", tagline: "Compliance" },
      { id: "performance", name: "Performance", score: 35, issueCount: 7, icon: "zap", tone: "high", tagline: "Speed & tech debt" },
      { id: "competitive", name: "Competitive", score: 0, issueCount: 17, icon: "stethoscope", tone: "critical", tagline: "0/17 peer features" },
      { id: "naming", name: "Naming", score: 25, issueCount: 4, icon: "edit", tone: "high", tagline: "Consistency" },
    ],
  },
  screenshots: {
    heading: "What the page looks like today",
    subtitle:
      "Captured March 30, 2026. A text-heavy link list with no visual hierarchy, no descriptions, and no interactive elements.",
    images: {
      desktop: "screenshots/coe-viewport.png",
      mobile: "screenshots/coe-mobile.png",
    },
    callouts: [
      {
        heading: "Full-page capture",
        bodyHtml:
          `The page is an extremely long vertical scroll of plain-text links. <a href="screenshots/coe-majors-fullpage.png" target="_blank" download="coe-majors-fullpage.png">Download full-page screenshot &rarr;</a>`,
      },
      {
        heading: "Early direction sketch",
        bodyHtml:
          `We put together a rough concept exploring what a redesigned version of this page could feel like &mdash; search, filtering, program cards, and a few other ideas. It's very much a starting point for conversation, not a final direction. <a href="coe-majors-redesign-mockup.html" target="_blank">Take a look &rarr;</a>`,
      },
    ],
  },
  catalog: {
    sectionLabel: "Programs Snapshot",
    heading: "82 listings, 3 categories, 8 discontinued",
    categories: [
      {
        icon: "cap",
        name: "Majors",
        count: 60,
        tone: "accent",
        body: "On-campus areas of study. 19 also offered as minors.",
        tags: [
          { label: "Accounting" },
          { label: "Biology" },
          { label: "Business Admin" },
          { label: "Chemistry" },
          { label: "Computer Science" },
          { label: "Data Science" },
          { label: "Neuroscience" },
          { label: "Nursing" },
          { label: "+52 more", variant: "muted" },
        ],
      },
      {
        icon: "book",
        name: "Minors",
        count: 8,
        tone: "medium",
        body: "Standalone minors plus 19 majors that double as minors.",
        tags: [
          { label: "Anthropology", variant: "minor" },
          { label: "Applied Math", variant: "minor" },
          { label: "Art History", variant: "minor" },
          { label: "Classical Studies", variant: "minor" },
          { label: "Health & Society", variant: "minor" },
          { label: "Museum Studies", variant: "minor" },
          { label: "Religion", variant: "minor" },
          { label: "Secondary Ed", variant: "minor" },
        ],
      },
      {
        icon: "stethoscope",
        name: "Pre-Professional",
        count: 14,
        tone: "high",
        body: "Preparatory tracks for graduate & professional schools.",
        tags: [
          { label: "Pre-Med" },
          { label: "Pre-Law" },
          { label: "Pre-Dental" },
          { label: "Pre-Engineering" },
          { label: "Pre-Pharmacy" },
          { label: "+9 more", variant: "muted" },
        ],
      },
    ],
    warning: {
      heading: "8 discontinued programs still listed alongside active ones",
      body: `Differentiated only by tiny <code style="background:rgba(255,255,255,.05);padding:2px 6px;border-radius:4px;font-size:.8rem">*</code> symbols with the legend buried at the bottom.`,
      tags: [
        { label: "Environmental Science", variant: "closed" },
        { label: "Film Studies", variant: "closed" },
        { label: "French & Francophone", variant: "closed" },
        { label: "Molecular Biology", variant: "closed" },
        { label: "Writing", variant: "closed" },
        { label: "Anthropology", variant: "closed" },
        { label: "Art History", variant: "closed" },
        { label: "Religion", variant: "closed" },
      ],
    },
  },
  opportunities: {
    heading: "What Coe stands to gain",
    subtitle:
      "Fixing these gaps isn't about compliance alone \u2014 it's about enrollment, trust, and competitive positioning.",
    items: [
      {
        impactLabel: "High Impact",
        tone: "low",
        title: "Boost search visibility & CTR",
        body: "Meta descriptions, Schema.org, OG tags, and canonical URLs could lift organic CTR 20-40% and unlock Google rich snippets.",
        metrics: [
          { value: "+30%", label: "CTR lift" },
          { value: "5", label: "Quick wins" },
          { value: "1-2d", label: "Timeline" },
        ],
      },
      {
        impactLabel: "Enrollment Driver",
        tone: "accent",
        title: "Program search & descriptions",
        body: "Search/filter and brief descriptions transform a link directory into an exploration tool. Students engage longer and convert at higher rates.",
        metrics: [
          { value: "3-5x", label: "Time on page" },
          { value: "+25%", label: "Engagement" },
          { value: "2-4w", label: "Timeline" },
        ],
      },
      {
        impactLabel: "Trust Builder",
        tone: "high",
        title: "Outcome data & trust signals",
        body: `Graduation rates, employment stats, accreditation badges, and rankings directly address families' #1 concern: "Is this worth the investment?"`,
        metrics: [
          { value: "\u2191\u2191", label: "Parent trust" },
          { value: "\u2191\u2191", label: "Counselor refs" },
          { value: "1-3w", label: "Timeline" },
        ],
      },
      {
        impactLabel: "Risk Mitigation",
        tone: "critical",
        title: "Accessibility & privacy compliance",
        body: "WCAG fixes and cookie consent eliminate ADA lawsuit risk and privacy regulation exposure. Higher-ed is increasingly targeted in a11y litigation.",
        metrics: [
          { value: "$$$", label: "Risk avoided" },
          { value: "\u2191\u2191", label: "Inclusivity" },
          { value: "1-2w", label: "Timeline" },
        ],
      },
      {
        impactLabel: "Differentiator",
        tone: "medium",
        title: `AI advisor & "Find Your Major" quiz`,
        body: `An interactive "What should I study?" tool becomes a lead gen engine. Peers are adopting fast \u2014 early movers capture undecided students.`,
        metrics: [
          { value: "\u2191\u2191\u2191", label: "Lead gen" },
          { value: "Unique", label: "Among IA peers" },
          { value: "4-8w", label: "Timeline" },
        ],
      },
      {
        impactLabel: "Quick Win",
        tone: "accent",
        title: "Remove dead code & upgrade analytics",
        body: "Removing legacy UA and adding async attributes improves load time with zero risk. GA4 upgrade restores lost data collection.",
        metrics: [
          { value: "Faster", label: "Page load" },
          { value: "Data", label: "Restored" },
          { value: "<1d", label: "Timeline" },
        ],
      },
    ],
  },
  categoryDetails: {
    categories: [
      {
        id: "a11y",
        name: "Accessibility",
        subtitle: "WCAG 2.2 / ADA compliance",
        icon: "eye",
        tone: "critical",
        score: 8,
        issueCount: 9,
        issues: [
          { severity: "critical", title: "No alt text on any image", description: "All 8 images have zero alt text. Violates WCAG 2.1 Level A (1.1.1). ADA Title III liability." },
          { severity: "critical", title: "No ARIA labels on navigation", description: "Dropdowns lack aria-expanded, aria-haspopup. Keyboard users can't determine menu state." },
          { severity: "critical", title: "Search field has no label element", description: "Placeholder text only, not a proper <label>. Violates WCAG 2.1 Level A (1.3.1)." },
          { severity: "critical", title: "Symbol legend is inaccessible", description: `Screen readers say "caret" not "also a minor." Legend buried at page bottom.` },
          { severity: "high", title: "No visible focus indicators", description: "Keyboard users can't see focus. Violates WCAG 2.1 AA (2.4.7)." },
          { severity: "high", title: "Missing semantic landmarks", description: "No <nav>, <main>, <footer> elements. Screen readers can't jump between regions." },
          { severity: "high", title: "No lang attribute", description: "Screen readers may use wrong pronunciation. Violates WCAG 2.1 A (3.1.1)." },
          { severity: "medium", title: "No skip-to-section links", description: "80+ items need skip links to Minors and Pre-Professional sections." },
          { severity: "medium", title: "No high-contrast mode", description: "Many higher-ed sites now offer built-in accessibility toolbars." },
        ],
      },
      {
        id: "seo",
        name: "SEO & Technical Markup",
        subtitle: "Search visibility & social sharing",
        icon: "search",
        tone: "high",
        score: 12,
        issueCount: 12,
        issues: [
          { severity: "critical", title: "No meta description", description: "Google auto-generates snippets unpredictably. Competitors get higher CTR." },
          { severity: "critical", title: "No Open Graph tags", description: "Facebook, LinkedIn, messaging previews are blank." },
          { severity: "critical", title: "No Twitter/X Cards", description: "Blank previews on X/Twitter sharing." },
          { severity: "critical", title: "No Schema.org structured data", description: "No JSON-LD for CollegeOrUniversity, Course, BreadcrumbList. No rich results." },
          { severity: "critical", title: "No canonical URL", description: "Risk of duplicate content indexing." },
          { severity: "high", title: "Legacy Universal Analytics", description: "UA sunset July 2023. Dead code still slowing the page." },
          { severity: "high", title: "Heading hierarchy broken", description: "H1 \u2192 H2 with no H3s for sub-groupings." },
          { severity: "medium", title: "No sitemap reference", description: `No <link rel="sitemap"> in <head>.` },
          { severity: "medium", title: "No hreflang tags", description: "Translate widget present but no hreflang for engines." },
          { severity: "medium", title: "No lazy loading", description: "All images load eagerly regardless of viewport." },
        ],
      },
      {
        id: "content",
        name: "Content Gaps",
        subtitle: "What prospective students can't find",
        icon: "file",
        tone: "accent",
        score: 5,
        issueCount: 14,
        issues: [
          { severity: "critical", title: "Zero program descriptions", description: "Every major is a name + link. Students must click each one individually." },
          { severity: "critical", title: "No student outcomes", description: "No employment rate, salary, grad school data. The #1 thing Gen Z looks for." },
          { severity: "critical", title: "No accreditation info", description: "No HLC, AACSB, CCNE, ABET badges. Top trust signal for families \u2014 absent." },
          { severity: "high", title: "No faculty info", description: "No names, credentials, research interests, or ratio per department." },
          { severity: "high", title: "No degree requirements", description: "No credit hours, 4-year plans, or course roadmaps." },
          { severity: "high", title: "No testimonials", description: "No quotes, alumni spotlights, or social proof for any program." },
          { severity: "high", title: "No video content", description: "Zero department videos, spotlights, or tours. Video is Gen Z's dominant format." },
          { severity: "high", title: "Discontinued programs unexplained", description: "8 programs closed with zero context \u2014 temporary, permanent, or teach-out?" },
          { severity: "medium", title: "No cost or ROI data", description: "No per-program costs, net price calculator, or ROI estimates." },
          { severity: "medium", title: "No research or internship info", description: "A liberal arts differentiator left completely invisible." },
        ],
      },
      {
        id: "ux",
        name: "User Experience",
        subtitle: "Navigation, layout & interaction",
        icon: "layout",
        tone: "purple",
        score: 15,
        issueCount: 10,
        issues: [
          { severity: "critical", title: "No search or filter", description: "82 programs, no search, no filters, no grouping. Users scroll the entire list." },
          { severity: "high", title: "No department grouping", description: "All 60 majors in one flat alphabetical list." },
          { severity: "high", title: "Confusing symbol notation", description: "^, *, ** symbols with legend at BOTTOM. Users see symbols before meaning." },
          { severity: "high", title: "No mobile cards", description: "Plain text links. Standard: cards with icon, description, CTA." },
          { severity: "high", title: "Discontinued mixed with active", description: `"Environmental Science*" next to "Environmental Studies."` },
          { severity: "medium", title: "No undecided pathway", description: `No interest quiz, popular majors, or "don't know?" section.` },
          { severity: "medium", title: "Redundant entries", description: `"Molecular Biology" vs "Molecular Biology - Biology," "Spanish" vs "Spanish Studies."` },
          { severity: "medium", title: "No page anchoring", description: "No sticky TOC, no back-to-top, no anchor links." },
        ],
      },
      {
        id: "modern",
        name: "Modern Features Absent",
        subtitle: "Tools peer institutions already offer",
        icon: "sparkle",
        tone: "medium",
        score: 0,
        issueCount: 11,
        issues: [
          { severity: "high", title: "No AI chatbot / virtual advisor", description: `"What major is right for me?" \u2014 #1 question. Competitors deploying rapidly.` },
          { severity: "high", title: `No "Find Your Major" quiz`, description: "No interest inventory or career-to-major matching." },
          { severity: "high", title: "No interactive explorer", description: "No visual map of program relationships or interest areas." },
          { severity: "medium", title: "No pathway visualizer", description: "No course progression flowcharts or prerequisite chains." },
          { severity: "medium", title: "No cost/ROI calculator", description: "No salary projection or loan repayment tool by major." },
          { severity: "medium", title: "No bookmarking / comparison", description: "Can't save or compare programs of interest." },
          { severity: "medium", title: "No virtual tours on page", description: "Tour exists elsewhere, not embedded per-department here." },
          { severity: "medium", title: "No event tie-ins", description: `No info sessions, open house dates, or "talk to a student" per department.` },
        ],
      },
      {
        id: "trust",
        name: "Trust Signals",
        subtitle: "Credibility for students & parents",
        icon: "trophy",
        tone: "low",
        score: 3,
        issueCount: 10,
        issues: [
          { severity: "critical", title: "No rankings displayed", description: `No U.S. News, Forbes, Niche, or "Best Value" badges.` },
          { severity: "critical", title: "No graduation/retention rates", description: "IPEDS data is public but not shown here." },
          { severity: "high", title: "No employment stats", description: `No "X% employed within 6 months" or employer partnerships.` },
          { severity: "high", title: "No student-faculty ratio", description: "KEY liberal arts selling point \u2014 completely invisible." },
          { severity: "high", title: "No class size data", description: "Another core differentiator left hidden." },
          { severity: "high", title: "No alumni data", description: "No alumni count, notable alumni, or employer cloud." },
          { severity: "medium", title: "No program accreditations", description: "Nursing, Business, Education badges not displayed." },
        ],
      },
      {
        id: "privacy",
        name: "Privacy & Compliance",
        subtitle: "GDPR, CCPA, cookie consent",
        icon: "shield",
        tone: "critical",
        score: 10,
        issueCount: 6,
        issues: [
          { severity: "critical", title: "No cookie consent banner", description: "Hotjar (session replays), GA, GTM, Ads, Mautic all fire before consent. Violates GDPR, CCPA, CPRA." },
          { severity: "high", title: "No WCAG conformance claim", description: "No accessibility statement or accommodation contact." },
          { severity: "high", title: "No contextual privacy link", description: "Privacy policy only in footer, not near forms/CTAs." },
          { severity: "medium", title: "No data retention disclosure", description: "Mautic collecting behavioral data, no storage duration disclosed." },
        ],
      },
      {
        id: "perf",
        name: "Performance",
        subtitle: "Speed, code quality & tech debt",
        icon: "zap",
        tone: "high",
        score: 35,
        issueCount: 7,
        issues: [
          { severity: "high", title: "Render-blocking scripts", description: "5 tracking scripts in <head> without async/defer." },
          { severity: "high", title: "Dead UA analytics code", description: "Sunset July 2023. Still loaded, still slowing the page." },
          { severity: "medium", title: "No image lazy loading", description: "All images load eagerly regardless of viewport position." },
          { severity: "medium", title: "No Content Security Policy", description: "Third-party scripts without CSP increase XSS risk." },
          { severity: "medium", title: "Concrete5 CMS (legacy)", description: "Smaller ecosystem limits plugin options for needed features." },
        ],
      },
      {
        id: "naming",
        name: "Naming & Consistency",
        subtitle: "Duplicates, ambiguity & URL mismatches",
        icon: "edit",
        tone: "high",
        score: 25,
        issueCount: 4,
        issues: [
          { severity: "high", title: "Duplicate/ambiguous listings", description: `"Molecular Biology" (closed) AND "Molecular Biology - Biology" (active). "Spanish" AND "Spanish Studies" both link to /foreign-language.` },
          { severity: "high", title: "Inconsistent naming", description: `"Finance - Business Administration" vs "Media Production - Art" vs "Accounting" (no suffix).` },
          { severity: "medium", title: `"Pre-Music Therapy" \u2192 Music page`, description: "Every other pre-professional program has its own page." },
          { severity: "medium", title: "URL/name mismatch", description: `"Interdisciplinary Science" links to /general-science.` },
        ],
      },
    ],
  },
  schemaDeepDive: {
    currentState: [
      { type: "CollegeOrUniversity", heading: "Institution Identity", body: "Google doesn't know this is a college, where it's located, its accreditation status, or how to display it in knowledge panels.", present: false },
      { type: "EducationalOccupationalProgram", heading: "Individual Programs", body: "None of the 82 programs are marked up. Google can't show program names, types, or provider info in rich results.", present: false },
      { type: "ItemList", heading: "Program Listing", body: "The list of majors isn't identified as a structured list. Can't appear as a carousel or list snippet in search results.", present: false },
      { type: "BreadcrumbList", heading: "Navigation Path", body: "Breadcrumbs exist visually (Coe > Academics > Majors) but aren't in markup. Google shows raw URLs instead of clean paths.", present: false },
    ],
    whatsNeeded: [
      { label: "Block 1", heading: "CollegeOrUniversity", body: `Institution identity with name, address, geo coordinates, phone, email, founding date, social profiles, logo, and accreditation credentials. Uses <code style="font-size:.75rem">@id</code> so programs can reference it.`, present: true, note: `Shown in "CollegeOrUniversity" tab` },
      { label: "Block 2", heading: "ItemList + Programs", body: `Wraps all 82 programs as <code style="font-size:.75rem">EducationalOccupationalProgram</code> entries inside an <code style="font-size:.75rem">ItemList</code>. Each program has name, URL, type (Major/Minor/Pre-Professional), and provider reference.`, present: true, note: `Shown in "Program List" tab` },
      { label: "Block 3", heading: "BreadcrumbList", body: `Three-level navigation: Coe College \u2192 Academics \u2192 Majors & Areas of Study. Enables clean breadcrumb display in Google search results.`, present: true, note: `Shown in "BreadcrumbList" tab` },
      { label: "Also Recommended", heading: "Open Graph + Twitter Cards", body: `Not Schema.org but equally critical: <code style="font-size:.75rem">og:title</code>, <code style="font-size:.75rem">og:description</code>, <code style="font-size:.75rem">og:image</code>, <code style="font-size:.75rem">twitter:card</code>. These control how links appear when shared on social media.`, present: false, note: "Also missing from page" },
    ],
    codeBlocks: [
      {
        tabId: "institution",
        tabLabel: "CollegeOrUniversity",
        introText: `This block establishes Coe College as a recognized entity in Google's Knowledge Graph. Copy-paste ready.`,
        code: `<span class="cmt">// Place in &lt;head&gt; of every page</span>
&lt;script type=<span class="str">"application/ld+json"</span>&gt;
{
  <span class="key">"@context"</span>: <span class="str">"https://schema.org"</span>,
  <span class="key">"@type"</span>: <span class="str">"CollegeOrUniversity"</span>,
  <span class="key">"@id"</span>: <span class="str">"https://www.coe.edu/#institution"</span>,
  <span class="key">"name"</span>: <span class="str">"Coe College"</span>,
  <span class="key">"url"</span>: <span class="str">"https://www.coe.edu"</span>,
  <span class="key">"logo"</span>: <span class="str">"https://www.coe.edu/application/themes/coecollege/img/logo.png"</span>,
  <span class="key">"description"</span>: <span class="str">"A selective, private, nationally recognized four-year
    coeducational liberal arts institution since 1851."</span>,
  <span class="key">"foundingDate"</span>: <span class="str">"1851"</span>,
  <span class="key">"telephone"</span>: <span class="str">"+1-877-225-5263"</span>,
  <span class="key">"email"</span>: <span class="str">"admission@coe.edu"</span>,
  <span class="key">"address"</span>: {
    <span class="key">"@type"</span>: <span class="str">"PostalAddress"</span>,
    <span class="key">"streetAddress"</span>: <span class="str">"1220 First Avenue NE"</span>,
    <span class="key">"addressLocality"</span>: <span class="str">"Cedar Rapids"</span>,
    <span class="key">"addressRegion"</span>: <span class="str">"IA"</span>,
    <span class="key">"postalCode"</span>: <span class="str">"52402"</span>
  },
  <span class="key">"geo"</span>: {
    <span class="key">"@type"</span>: <span class="str">"GeoCoordinates"</span>,
    <span class="key">"latitude"</span>: 41.9984,
    <span class="key">"longitude"</span>: -91.6553
  },
  <span class="key">"sameAs"</span>: [
    <span class="str">"https://www.facebook.com/CoeCollege"</span>,
    <span class="str">"https://www.instagram.com/coecollege/"</span>,
    <span class="str">"https://twitter.com/CoeCollege"</span>,
    <span class="str">"https://www.linkedin.com/school/coe-college/"</span>,
    <span class="str">"https://www.youtube.com/coecollege"</span>
  ]
}
&lt;/script&gt;`,
        impact: {
          tone: "accent",
          icon: "target",
          body: `<strong>What this enables:</strong> Google Knowledge Panel for "Coe College" searches, rich institution cards, correct attribution when programs appear in search, and proper social profile linking.`,
        },
      },
      {
        tabId: "programs",
        tabLabel: "Program List",
        introText: `Each program is typed as EducationalOccupationalProgram and references the institution via @id. Showing 3 of 82.`,
        code: `&lt;script type=<span class="str">"application/ld+json"</span>&gt;
{
  <span class="key">"@context"</span>: <span class="str">"https://schema.org"</span>,
  <span class="key">"@type"</span>: <span class="str">"ItemList"</span>,
  <span class="key">"name"</span>: <span class="str">"Coe College Majors & Areas of Study"</span>,
  <span class="key">"numberOfItems"</span>: 82,
  <span class="key">"itemListElement"</span>: [
    {
      <span class="key">"@type"</span>: <span class="str">"ListItem"</span>,
      <span class="key">"position"</span>: 1,
      <span class="key">"item"</span>: {
        <span class="key">"@type"</span>: <span class="str">"EducationalOccupationalProgram"</span>,
        <span class="key">"name"</span>: <span class="str">"Biology"</span>,
        <span class="key">"url"</span>: <span class="str">"https://www.coe.edu/academics/.../biology"</span>,
        <span class="key">"provider"</span>: { <span class="key">"@id"</span>: <span class="str">"https://www.coe.edu/#institution"</span> },
        <span class="key">"educationalProgramMode"</span>: <span class="str">"In-person"</span>,
        <span class="key">"programType"</span>: <span class="str">"Major"</span>
      }
    }
    <span class="cmt">// ... repeat for all 82 programs</span>
  ]
}
&lt;/script&gt;`,
        impact: {
          tone: "low",
          icon: "external",
          body: `<strong>What this enables:</strong> Google can display program names as a list/carousel in search results for queries like "Coe College majors" or "nursing programs in Iowa." Each program links back to the institution entity.`,
        },
      },
      {
        tabId: "breadcrumb",
        tabLabel: "BreadcrumbList",
        introText: `Breadcrumbs exist visually on the page but aren't in structured markup, so Google shows raw URLs in search results instead of clean navigation paths.`,
        code: `&lt;script type=<span class="str">"application/ld+json"</span>&gt;
{
  <span class="key">"@context"</span>: <span class="str">"https://schema.org"</span>,
  <span class="key">"@type"</span>: <span class="str">"BreadcrumbList"</span>,
  <span class="key">"itemListElement"</span>: [
    {
      <span class="key">"@type"</span>: <span class="str">"ListItem"</span>,
      <span class="key">"position"</span>: 1,
      <span class="key">"name"</span>: <span class="str">"Coe College"</span>,
      <span class="key">"item"</span>: <span class="str">"https://www.coe.edu"</span>
    },
    {
      <span class="key">"@type"</span>: <span class="str">"ListItem"</span>,
      <span class="key">"position"</span>: 2,
      <span class="key">"name"</span>: <span class="str">"Academics"</span>,
      <span class="key">"item"</span>: <span class="str">"https://www.coe.edu/academics"</span>
    },
    {
      <span class="key">"@type"</span>: <span class="str">"ListItem"</span>,
      <span class="key">"position"</span>: 3,
      <span class="key">"name"</span>: <span class="str">"Majors & Areas of Study"</span>,
      <span class="key">"item"</span>: <span class="str">"https://www.coe.edu/academics/majors-areas-study"</span>
    }
  ]
}
&lt;/script&gt;`,
        impact: {
          tone: "high",
          icon: "link",
          body: `<strong>What this enables:</strong> Google displays <strong>Coe College \u203a Academics \u203a Majors & Areas of Study</strong> in search results instead of the raw URL. Improves CTR by making results look more navigable and trustworthy.`,
        },
      },
    ],
    impact: [
      { label: "Search Results", tone: "low", heading: "Rich snippets in Google", body: "Programs can appear as expandable lists, knowledge panels, or carousel results. Competitors with structured data get visually richer, higher-CTR listings." },
      { label: "Voice Search", tone: "high", heading: "Google Assistant & Siri answers", body: `"What majors does Coe College offer?" \u2014 without Schema, voice assistants can't answer. With it, your programs are in the answer graph.` },
      { label: "AI Overviews", tone: "accent", heading: "Google AI-generated summaries", body: `Google's AI Overviews pull from structured data to generate summary answers. Without Schema, Coe is invisible in these new result types.` },
      { label: "Competitive Edge", tone: "critical", heading: "Peer institutions have this", body: `Many comparable liberal arts colleges already have Schema.org markup. Every day without it, Coe loses search visibility to institutions that do.` },
    ],
    implementationCallout: {
      heading: "Implementation effort: Low",
      body: "These are 3 static JSON-LD blocks in the page's <head>. No CMS plugin required. A developer can implement all three in under 2 hours. The program list can be generated dynamically from the existing CMS data. Zero risk \u2014 structured data is invisible to users, only read by search engines.",
    },
  },
  competitive: {
    heading: "Coe vs. peer institutions: 0 for 17",
    subtitle: "Feature-by-feature comparison with comparable liberal arts colleges.",
    subjectColumnLabel: "Coe",
    features: [
      { feature: "Program search & filter", subject: false, peers: "Most" },
      { feature: "Program descriptions", subject: false, peers: "All" },
      { feature: "Student outcome data", subject: false, peers: "Many" },
      { feature: "Interactive major quiz", subject: false, peers: "Many" },
      { feature: "Video content per program", subject: false, peers: "Many" },
      { feature: "Faculty highlights", subject: false, peers: "Most" },
      { feature: "Schema.org structured data", subject: false, peers: "Many" },
      { feature: "Open Graph social tags", subject: false, peers: "Most" },
      { feature: "Cookie consent mechanism", subject: false, peers: "Most" },
      { feature: "Mobile-first card design", subject: false, peers: "Most" },
      { feature: "Chatbot / virtual assistant", subject: false, peers: "Growing" },
      { feature: "Cost / ROI information", subject: false, peers: "Some" },
      { feature: "Accreditation badges", subject: false, peers: "Most" },
      { feature: "Rankings displayed", subject: false, peers: "Most" },
      { feature: "Degree pathway visualizer", subject: false, peers: "Some" },
      { feature: "Accessibility statement", subject: false, peers: "Most" },
      { feature: "GA4 (current analytics)", subject: false, peers: "All" },
    ],
    warning: {
      heading: "This isn't about innovation \u2014 it's about catching up",
      body: "These are table-stakes features. The gap widens every enrollment cycle.",
    },
  },
  priorities: {
    heading: "Top 20 priorities, ranked by impact",
    subtitle: "Addressing the top 5 alone would dramatically transform this page's effectiveness.",
    items: [
      { rank: 1, name: "Search and filter for programs", severity: "critical" },
      { rank: 2, name: "Brief description for each program", severity: "critical" },
      { rank: 3, name: "Schema.org structured data (JSON-LD)", severity: "critical" },
      { rank: 4, name: "Open Graph + Twitter Card meta tags", severity: "critical" },
      { rank: 5, name: "Meta description tag", severity: "critical" },
      { rank: 6, name: "Cookie consent banner", severity: "critical" },
      { rank: 7, name: "Alt text on all images", severity: "critical" },
      { rank: 8, name: "ARIA labels on interactive elements", severity: "critical" },
      { rank: 9, name: "Student outcome / career data", severity: "critical" },
      { rank: 10, name: "Accreditation & ranking badges", severity: "critical" },
      { rank: 11, name: "Canonical URL tag", severity: "critical" },
      { rank: 12, name: "Upgrade from UA to GA4", severity: "high" },
      { rank: 13, name: "Program-specific video content", severity: "high" },
      { rank: 14, name: "Faculty highlights per department", severity: "high" },
      { rank: 15, name: `"Find Your Major" quiz tool`, severity: "high" },
      { rank: 16, name: "Semantic HTML5 landmarks", severity: "high" },
      { rank: 17, name: "Degree requirements / credit hours", severity: "high" },
      { rank: 18, name: "Student testimonials per program", severity: "high" },
      { rank: 19, name: "Card-based responsive layout", severity: "high" },
      { rank: 20, name: "WCAG 2.2 AA accessibility statement", severity: "high" },
    ],
  },
  assistant: {
    greeting:
      "Hi! I can answer questions about this Coe College gap analysis. Try asking about specific categories, scores, priorities, or opportunities.",
    introTitle: "This report has a brain",
    introBody: `Ask our <strong>Report Assistant</strong> anything about this gap analysis. It knows every score, issue, priority, and opportunity in detail.`,
    exampleChips: [
      { label: "What's the overall score?", query: "What's the overall score?" },
      { label: "Top priorities?", query: "What are the top priorities?" },
      { label: "Quick wins?", query: "What are the quick wins?" },
    ],
    responses: [
      {
        patterns: ["overall|total score|health|grade|how.*score|how.*do|how.*bad"],
        answer:
          `The page scores **18 out of 100** overall \u2014 Grade F. There are 87 total issues: 27 Critical, 30 High, 22 Medium, 8 Low. The lowest categories are Modern Features (0/100), Competitive (0/100), and Trust Signals (3/100). Performance is the "best" at 35/100.`,
      },
      {
        patterns: ["access|a11y|wcag|ada|screen reader|alt text|aria"],
        answer:
          `**Accessibility scores 8/100** with 9 issues. Critical: No alt text on any image, No ARIA labels on navigation, Search field has no label, Symbol legend inaccessible. Key concern: zero alt text on any image and no ARIA labels \u2014 fails WCAG 2.1 Level A with potential ADA Title III liability.`,
      },
      {
        patterns: ["seo|search engine|meta|schema|open graph|og tag|twitter card|canonical"],
        answer:
          `**SEO scores 12/100** with 12 issues. The page has no meta description, no OG tags, no Twitter Cards, no Schema.org JSON-LD, and no canonical URL. Social link previews are completely blank. Still running dead Universal Analytics code (sunset July 2023).`,
      },
      {
        patterns: ["content(?! security)|description|program info|faculty|video|testimonial|outcome"],
        answer:
          `**Content scores 5/100** \u2014 the worst category with 14 issues. Every major is just a name and a link. Zero descriptions, zero student outcome data, zero accreditation info, zero faculty info, zero video content, zero testimonials.`,
      },
      {
        patterns: ["ux|user experience|search|filter|navigation|mobile|interface|design"],
        answer:
          `**UX scores 15/100** with 10 issues. The biggest failure: 82 programs in one flat alphabetical list with no search, no filters, no category grouping. Discontinued programs are mixed in with active ones, differentiated only by tiny symbols.`,
      },
      {
        patterns: ["modern|feature|chatbot|quiz|find.*major|interactive|pathway"],
        answer:
          `**Modern Features scores 0/100** \u2014 Coe has none. No AI chatbot, no "Find Your Major" quiz, no interactive explorer, no pathway visualizer, no cost calculator, no bookmarking, no virtual tours on this page. Peers are adopting these rapidly.`,
      },
      {
        patterns: ["trust|ranking|graduation|retention|employment|alumni|class size|faculty ratio"],
        answer:
          `**Trust Signals scores 3/100** with 10 issues. No rankings displayed, no graduation/retention rates, no employment stats, no student-faculty ratio, no class sizes, no alumni data. Zero proof of value despite being a quality institution.`,
      },
      {
        patterns: ["privacy|cookie|consent|gdpr|ccpa|tracking|hotjar|mautic"],
        answer:
          `**Privacy scores 10/100** with 6 issues. Critical: 5 tracking scripts fire before any consent \u2014 Hotjar (session replays!), GA, GTM, Google Ads, and Mautic. No cookie banner exists. Likely violates GDPR, CCPA, CPRA, and other state privacy laws.`,
      },
      {
        patterns: ["performance|speed|load|technical|debt|cms|concrete"],
        answer:
          `**Performance scores 35/100** \u2014 the "best" category. Issues: render-blocking tracking scripts in <head>, dead UA analytics code still loading, no image lazy loading, no CSP headers, and a legacy Concrete5 CMS.`,
      },
      {
        patterns: ["competitive|peer|comparison|vs|versus|other college"],
        answer:
          `**Competitive scores 0/100** \u2014 Coe has 0 of 17 features that peer liberal arts colleges commonly offer. This includes search/filter, descriptions, outcome data, quiz tools, video, Schema.org, OG tags, cookie consent, mobile cards, chatbot, and more. This isn't about innovation \u2014 it's about catching up.`,
      },
      {
        patterns: ["naming|inconsist|duplicate|ambiguous|url mismatch"],
        answer:
          `**Naming scores 25/100** with 4 issues. "Molecular Biology" (closed) AND "Molecular Biology - Biology" (active) both listed. "Spanish" and "Spanish Studies" both link to /foreign-language. Naming format inconsistent across programs.`,
      },
      {
        patterns: ["prior|top|first|most important|what should|where.*start|action|plan"],
        answer:
          `**Top 5 priorities:** 1) Search and filter for programs, 2) Brief description for each program, 3) Schema.org structured data, 4) Open Graph + Twitter Cards, 5) Meta description tag. Just the top 5 would dramatically transform the page.`,
      },
      {
        patterns: ["opportunit|gain|benefit|upside|roi|what.*fix|improve"],
        answer:
          `Key opportunities: SEO quick wins (+30% CTR, 1-2 days), program search & descriptions (3-5x time on page, 2-4 weeks), trust signals (parent trust boost, 1-3 weeks), a11y/privacy compliance (legal risk eliminated, 1-2 weeks), AI quiz (lead gen differentiator, 4-8 weeks).`,
      },
      {
        patterns: ["program|major|minor|pre-professional|how many|discontinued|closed"],
        answer:
          `The page lists **82 programs**: 60 majors, 8 standalone minors, and 14 pre-professional tracks. 19 majors also available as minors. **8 programs are discontinued** but still listed alongside active ones with only tiny symbols to differentiate them.`,
      },
      {
        patterns: ["tracker|analytics|script|ga4|universal"],
        answer:
          `5 tracking scripts load without consent: Hotjar (session replays), Google Tag Manager, Google Analytics (legacy UA), Google Ads, Mautic marketing automation. The GA property (UA-3745152-31) is a legacy Universal Analytics ID that stopped processing data in July 2023 \u2014 it's dead code still slowing the page.`,
      },
      {
        patterns: ["quick win|easy|fast|low.*effort|simple"],
        answer:
          "Quickest wins: 1) Add meta description tag (<5 min), 2) Add OG + Twitter Card tags (<30 min), 3) Add alt text to all 8 images (<1 hr), 4) Remove dead UA analytics code (<5 min), 5) Add canonical URL (<5 min). These alone would improve SEO, social sharing, and accessibility significantly.",
      },
    ],
    fallback:
      "I can answer questions about any of the 10 audit categories (accessibility, SEO, content, UX, modern features, trust signals, privacy, performance, competitive, naming), the overall score, priorities, opportunities, programs, or quick wins. What would you like to know?",
  },
}
