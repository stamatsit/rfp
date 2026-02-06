// Stamats Client Success Data
// Compiled from stamats.com and external sources — February 2026
// This file is completely isolated: zero imports from any app module.

// ─── Interfaces ──────────────────────────────────────────────

export interface CompanyStat {
  label: string
  value: string
  detail?: string
  source?: string
}

export interface TopLineResult {
  metric: string
  result: string
  client: string
  /** Numeric value for chart sorting/sizing (absolute value, e.g. 481 for "+481%") */
  numericValue: number
  /** "increase" | "decrease" */
  direction: "increase" | "decrease"
}

export interface CaseStudyMetric {
  label: string
  value: string
}

export interface CaseStudy {
  id: number
  client: string
  category: "higher-ed" | "healthcare" | "other"
  focus: string
  challenge: string
  solution: string
  metrics: CaseStudyMetric[]
  testimonial?: {
    quote: string
    attribution: string
  }
  awards?: string[]
  /** Whether this case study was sourced/verified externally */
  externallyVerified?: boolean
  sources?: string[]
}

export interface Testimonial {
  quote: string
  name: string
  title: string
  organization: string
  source?: string
}

export interface Award {
  name: string
  year: string
  clientOrProject: string
  source?: string
}

export interface NamedClient {
  name: string
  sector: "higher-ed" | "healthcare" | "other"
}

export interface ResearchStudy {
  name: string
  description: string
  duration?: string
  partners?: string[]
  findings: string[]
  sources?: string[]
}

export interface ConferenceAppearance {
  event: string
  role: string
  source?: string
}

export interface ClientSuccessData {
  companyStats: CompanyStat[]
  externallyVerifiedStats: CompanyStat[]
  coreValues: string[]
  serviceLines: string[]
  notableFirsts: string[]
  topLineResults: TopLineResult[]
  caseStudies: CaseStudy[]
  awards: Award[]
  testimonials: Testimonial[]
  namedClients: NamedClient[]
  researchStudies: ResearchStudy[]
  conferenceAppearances: ConferenceAppearance[]
  podcast: { name: string; season: string; episodes: string; hosts: string[]; platforms: string[] }
}

// ─── Data ────────────────────────────────────────────────────

export const clientSuccessData: ClientSuccessData = {
  // ── Company Stats ──────────────────────────────────────────
  companyStats: [
    { label: "Founded", value: "1923", detail: "By Frank French & Herbert Stamats" },
    { label: "Years in Business", value: "100+" },
    { label: "Google Partner Status", value: "Top 3%", detail: "Google Premier Partner" },
    { label: "FeaturedCustomers Rating", value: "4.8/5.0", detail: "From 1,797 reference ratings" },
    { label: "Fortune 500 Clients", value: "30+" },
    { label: "Industries Served", value: "10+" },
    { label: "Clients Served Annually", value: "100+" },
    { label: "Surveys Conducted Annually", value: "10,000+" },
    { label: "Campaigns Executed Annually", value: "100+" },
    { label: "Daily Interactions Managed", value: "1,000,000+" },
    { label: "Web Projects Completed (2025)", value: "90+" },
    { label: "On-Time Delivery Record", value: "100%" },
    { label: "ADA Compliance", value: "100%" },
    { label: "Programs Analyzed", value: "400+" },
    { label: "In-House Team", value: "100%" },
    { label: "Print Heritage", value: "60+ years", detail: "Since the 1950s" },
  ],

  // ── Externally Verified Company Stats ──────────────────────
  externallyVerifiedStats: [
    { label: "BBB Rating", value: "A+", detail: "0 complaints over 103 years", source: "BBB.org" },
    { label: "FeaturedCustomers", value: "4.8/5.0", detail: "From 1,797 ratings; 58 reviews", source: "FeaturedCustomers" },
    { label: "Annual Revenue", value: "~$25 million", detail: "2014 figure", source: "The Gazette" },
    { label: "Century Milestone", value: "100+ years", detail: "One of only ~1,000 U.S. companies over 100 years old", source: "Corridor Business Journal" },
    { label: "Family Ownership", value: "100%", detail: "Family-owned for entire century", source: "Corridor Business Journal" },
    { label: "Incorporated", value: "October 16, 1946", source: "BBB.org" },
    { label: "Content Reach", value: "2 million+ readers", detail: "500,000+ articles, podcasts & pages/year", source: "stamats.com" },
    { label: "Content Speed", value: "2x faster", detail: "Produces content 2x faster than in-house teams", source: "stamats.com/solutions/content" },
  ],

  coreValues: [
    "Service — Anticipating client needs",
    "Entrepreneurship — Initiative and creativity",
    "Integrity — Honesty, openness, and accountability",
    "Community — Internal support and promotion from within",
  ],

  serviceLines: [
    "AI & SEO Strategy",
    "Brand & Design",
    "CMS & Website Design",
    "Content Marketing",
    "Digital Marketing",
    "Enrollment Marketing",
    "Print, Podcast & Video",
    "Research",
  ],

  notableFirsts: [
    "First company to offer market research services to educational institutions (1980s)",
    "Created The Buildings Show, a commercial buildings industry trade show",
    "First agency to create a college viewbook",
    "Premier Cascade CMS partner",
  ],

  // ── Top-Line Results ───────────────────────────────────────
  topLineResults: [
    { metric: "Conversion growth on optimized pages", result: "+481%", client: "Oakland Community College", numericValue: 481, direction: "increase" },
    { metric: "Clicks to apply increase", result: "+332%", client: "North Greenville University", numericValue: 332, direction: "increase" },
    { metric: "Admissions page conversions (5 weeks)", result: "+250%", client: "Oakland Community College", numericValue: 250, direction: "increase" },
    { metric: "Spring RFI leads increase", result: "+167%", client: "Mid Michigan College", numericValue: 167, direction: "increase" },
    { metric: "Click-through rate improvement", result: "+152%", client: "Rutgers University", numericValue: 152, direction: "increase" },
    { metric: "Conversions for pipefitting/plumbing program", result: "+150%", client: "Owens Community College", numericValue: 150, direction: "increase" },
    { metric: "Conversion rate improvement", result: "+124%", client: "Rutgers University", numericValue: 124, direction: "increase" },
    { metric: "Page conversion rate increase", result: "+111%", client: "Dominican University", numericValue: 111, direction: "increase" },
    { metric: "Non-traditional student affinity growth", result: "+100%", client: "Troy University", numericValue: 100, direction: "increase" },
    { metric: "Top-choice consideration growth", result: "+100%", client: "Troy University", numericValue: 100, direction: "increase" },
    { metric: "Program page views YoY", result: "+84%", client: "Morehead State University", numericValue: 84, direction: "increase" },
    { metric: "Website engagement YoY", result: "+82%", client: "Morehead State University", numericValue: 82, direction: "increase" },
    { metric: "Organic traffic growth", result: "+80%", client: "Oakland Community College", numericValue: 80, direction: "increase" },
    { metric: "Non-traditional enrollment increase", result: "+74%", client: "Owens Community College", numericValue: 74, direction: "increase" },
    { metric: "Conversions increase (no budget increase)", result: "+70%", client: "Owens Community College", numericValue: 70, direction: "increase" },
    { metric: "Honors-eligible freshmen increase", result: "+68%", client: "Eastern Illinois University", numericValue: 68, direction: "increase" },
    { metric: "Organic entrances increase", result: "+66%", client: "Golden West College", numericValue: 66, direction: "increase" },
    { metric: "Cost per lead decrease", result: "-59%", client: "Owens Community College", numericValue: 59, direction: "decrease" },
    { metric: "LinkedIn followers increase (first year)", result: "+57%", client: "Max Planck Florida Institute", numericValue: 57, direction: "increase" },
    { metric: "New users growth", result: "+54%", client: "UT Southwestern", numericValue: 54, direction: "increase" },
    { metric: "Giving page views (60 days)", result: "+53%", client: "IU Simon Cancer Center", numericValue: 53, direction: "increase" },
    { metric: "New student enrollment YoY", result: "+50%", client: "Owens Community College", numericValue: 50, direction: "increase" },
    { metric: "Conversions increase (same budget)", result: "+50%", client: "Rutgers University", numericValue: 50, direction: "increase" },
    { metric: "Open house attendance increase", result: "+50%", client: "Owens Community College", numericValue: 50, direction: "increase" },
    { metric: "Traditional undergrad inquiries post-launch", result: "+49%", client: "Belhaven University", numericValue: 49, direction: "increase" },
    { metric: "Homepage views (60 days)", result: "+48%", client: "IU Simon Cancer Center", numericValue: 48, direction: "increase" },
    { metric: "Applications increase", result: "+40%", client: "North Carolina A&T", numericValue: 40, direction: "increase" },
    { metric: "First-choice applicants increase", result: "+38%", client: "Brescia University College", numericValue: 38, direction: "increase" },
    { metric: "Fall applications increase", result: "+36%", client: "Mid Michigan College", numericValue: 36, direction: "increase" },
    { metric: "Visitors to program pages", result: "+32%", client: "Dominican University", numericValue: 32, direction: "increase" },
    { metric: "Total enrollment growth (2 years)", result: "+26%", client: "North Greenville University", numericValue: 26, direction: "increase" },
    { metric: "Freshman enrollment increase", result: "+24.5%", client: "Eastern Illinois University", numericValue: 24.5, direction: "increase" },
    { metric: "Applications increase (5 months)", result: "+20%", client: "University of Kentucky", numericValue: 20, direction: "increase" },
    { metric: "Positive opinion rating increase", result: "+20%", client: "Troy University", numericValue: 20, direction: "increase" },
    { metric: "New student enrollment (no extra budget)", result: "+18%", client: "Owens Community College", numericValue: 18, direction: "increase" },
    { metric: "Year-over-year conversions", result: "+967", client: "Pima Community College", numericValue: 967, direction: "increase" },
    { metric: "Traditional inquiries YoY", result: "+328", client: "Belhaven University", numericValue: 328, direction: "increase" },
  ],

  // ── Case Studies (1-40) ────────────────────────────────────
  caseStudies: [
    // ── Original Case Studies (1-21) ───────────────────────────
    {
      id: 1,
      client: "Oakland Community College",
      category: "higher-ed",
      focus: "SEO & Analytics",
      challenge: "Low organic search visibility; inability to track visitor journeys across thousands of pages or identify conversion bottlenecks.",
      solution: "Multi-year partnership with custom analytics dashboard (Google Search Console + Looker Studio providing '169 times the data'), user journey audits, content optimization, GA4 implementation, and quarterly reviews.",
      metrics: [
        { label: "Conversion growth on optimized pages", value: "+481%" },
        { label: "Organic traffic growth", value: "+80%" },
        { label: "Monthly traffic increase", value: "2x" },
      ],
      testimonial: {
        quote: "You guys are incredible. This has been an incredible partnership — evidenced by the improvements that have been made, and the traction we're building.",
        attribution: "Liz Schnell, Vice Chancellor for Marketing & Communications",
      },
    },
    {
      id: 2,
      client: "North Greenville University",
      category: "higher-ed",
      focus: "Brand & Enrollment",
      challenge: "Unclear institutional identity; declining enrollment momentum.",
      solution: "Comprehensive brand refresh (messaging matrix, tagline 'Every day. Epic.'), WordPress website redesign with Program Finder, and multi-year digital campaigns.",
      metrics: [
        { label: "Clicks to apply increase (YoY)", value: "+332%" },
        { label: "Total enrollment growth (2 years)", value: "+26%" },
        { label: "Applicant goal turnaround", value: "100 below → 40 above goal" },
      ],
      testimonial: {
        quote: "Through innovative tactics, our strategic partnership with Stamats, and tireless work, it looks like we will hit another new student enrollment high mark this fall. Epic.",
        attribution: "NGU Marketing Leadership",
      },
    },
    {
      id: 3,
      client: "Mid Michigan College",
      category: "higher-ed",
      focus: "Website Redesign",
      challenge: "Existing website failed to represent student determination; inflexible design with excessive content creating a confusing experience.",
      solution: "Comprehensive website audit, Guided Pathways with academic journeys tailored to student interests, interactive Program Finder, authentic storytelling, Cascade CMS platform.",
      metrics: [
        { label: "Spring RFI leads increase (2024 vs 2023)", value: "+167%" },
        { label: "Spring RFI leads captured within 1 month post-launch", value: "81%" },
        { label: "Fall applications increase (2024 vs 2023)", value: "+36%" },
      ],
      testimonial: {
        quote: "On Day 2, our enrollment team said they felt like they've gotten a ton more inquiry forms... marketing ran the numbers, and they definitely have. That's amazing!",
        attribution: "Mid Michigan College",
      },
      awards: ["2025 NCMPR Gold Medallion — Viewbook", "2025 NCMPR Gold Medallion — Recruitment Campaign"],
    },
    {
      id: 4,
      client: "Dominican University",
      category: "higher-ed",
      focus: "Website Optimization",
      challenge: "Outdated design with inflexible templates, heavy reliance on left navigation, inconsistent menus, weak campus narrative, over-dependence on PDFs.",
      solution: "Redesigned homepage and program page templates deployed while maintaining the main site infrastructure; analytics-driven priorities.",
      metrics: [
        { label: "Page conversion rate increase", value: "+111%" },
        { label: "Visitors to undergrad program pages", value: "+32%" },
        { label: "RFI form submissions", value: "+17%" },
        { label: "Event registrations", value: "+12%" },
        { label: "Applications submitted", value: "+7%" },
      ],
    },
    {
      id: 5,
      client: "Morehead State University",
      category: "higher-ed",
      focus: "CMS & Website Redesign",
      challenge: "Website didn't reflect campus vibrancy; navigation and search needed simplification; accessibility gaps.",
      solution: "Migration of 3,500+ content pieces to modern CMS, mountain-themed interface, custom Program Finder, accessibility optimization.",
      metrics: [
        { label: "Program page views YoY", value: "+84%" },
        { label: "Website engagement YoY", value: "+82%" },
        { label: "Clicks to apply", value: "+10%" },
        { label: "Unique searches in first weeks", value: "24,000+" },
        { label: "Program Finder ranking", value: "4th most-viewed page" },
        { label: "Google ranking improvement", value: "Unranked → #7" },
      ],
      testimonial: {
        quote: "The Stamats crew is working as hard as we are — that's rare in an external partner.",
        attribution: "Director, Web and Digital Marketing, Morehead State University",
      },
    },
    {
      id: 6,
      client: "Owens Community College",
      category: "higher-ed",
      focus: "Digital Enrollment Marketing",
      challenge: "Needed to effectively target adult learners (working professionals, stopouts); maximize conversions for nontraditional students.",
      solution: "Multi-term, AI-enhanced digital strategy with simplified RFI forms, relatable adult testimonials, deadline-driven messaging, and conversion-focused landing pages.",
      metrics: [
        { label: "Cost per lead decrease", value: "-59%" },
        { label: "Conversions increase (no budget increase)", value: "+70%" },
        { label: "Weekly leads increase", value: "33 → 56 per week" },
        { label: "Non-traditional enrollment (Spring 2025)", value: "+74%" },
        { label: "New student enrollment YoY (Fall 2025)", value: "+50%" },
      ],
      testimonial: {
        quote: "I really appreciate you. Stamats is unbelievable when it comes to taking the time to work through things and helping us make decisions as our partnership continues to evolve.",
        attribution: "Owens Community College",
      },
    },
    {
      id: 7,
      client: "Pima Community College",
      category: "higher-ed",
      focus: "Workforce Enrollment",
      challenge: "FastTrack workforce programs required agile marketing aligned with rolling cohort start dates, not traditional academic calendars.",
      solution: "Flexible, data-driven SEM campaigns for five programs with dedicated landing pages, automated Day-0 emails, and information session reminders. One-year controlled testing before 2024 rollout.",
      metrics: [
        { label: "Year-over-year conversions", value: "+967" },
        { label: "Cost per conversion reduction", value: "-10%" },
        { label: "Cost per click reduction", value: "-12%" },
        { label: "Program capacity", value: "Most programs at capacity" },
        { label: "Waitlists", value: "Trades & healthcare programs" },
        { label: "EMS enrollment", value: "Highest since FastTrack launch (2021)" },
        { label: "Info session attendance", value: "Doubled" },
      ],
      testimonial: {
        quote: "I have never seen a more effective campaign in my 25 years.",
        attribution: "Workforce Development and Innovation Leader, Pima Community College",
      },
    },
    {
      id: 8,
      client: "Belhaven University",
      category: "higher-ed",
      focus: "Website Consolidation",
      challenge: "Four separate websites creating fragmented user experience; hindering enrollment growth.",
      solution: "Merged four sites into one unified platform; reduced to 2,500 pages; 67% PDF reduction; implemented 159 GA4 measurement changes; four distinct CTA strategies; visual Program Finder.",
      metrics: [
        { label: "Traditional inquiries YoY", value: "+328" },
        { label: "Adult graduate online applications YoY", value: "+89" },
        { label: "Adult graduate online inquiries YoY", value: "+59 (highest ever)" },
        { label: "PDF reduction", value: "67%" },
      ],
      testimonial: {
        quote: "Your expertise has been incredible. We trust you, and the depth of your team is off the charts. The creativity you brought to the project was exceptional in how you helped us bring the spirit of Belhaven alive on the web.",
        attribution: "Dr. Roger Parrott, President of Belhaven University",
      },
    },
    {
      id: 9,
      client: "IU Simon Comprehensive Cancer Center",
      category: "healthcare",
      focus: "Science Storytelling & Web",
      challenge: "Groundbreaking research was obscured by outdated website navigation; needed revitalized brand voice for multiple audiences.",
      solution: "Website redesign with intentional content architecture for patients, researchers, donors, and referring physicians; enhanced clinical trial visibility; content showcase strategy.",
      metrics: [
        { label: "Homepage views increase (60 days)", value: "+48%" },
        { label: "Research content engagement", value: "+46%" },
        { label: "Giving page views (60 days)", value: "+53%" },
      ],
      testimonial: {
        quote: "This website redesign has been a success on all fronts from my perspective, and I am very grateful for your expertise, creativity, flexibility to work around our schedules, and overall ability to meet our needs.",
        attribution: "IU Simon Comprehensive Cancer Center",
      },
      awards: ["2025 HealthcareADAwards Merit — Integrated Marketing", "2025 Digital Health Award Merit — Website Redesign"],
    },
    {
      id: 10,
      client: "Fox Valley Technical College",
      category: "higher-ed",
      focus: "Stopout Re-Enrollment",
      challenge: "Need to re-engage stopout students and individuals with some college credit but no degree.",
      solution: "Omnichannel campaign (3 postcards, 9 emails, 6 text messages) with deadline-driven messaging and personalized communications. Launched in 2 months.",
      metrics: [
        { label: "New applications generated (10 months)", value: "278" },
        { label: "Enrolled students", value: "77" },
        { label: "Return on investment", value: "$135,000" },
      ],
      testimonial: {
        quote: "The reason we picked Stamats is because you had enrollment strategy as part of your plan from start to finish.",
        attribution: "Barb Dreger, Director of College Marketing, Fox Valley Technical College",
      },
    },
    {
      id: 11,
      client: "UT Southwestern Medical Center",
      category: "healthcare",
      focus: "Content Marketing",
      challenge: "Needed a content strategy to drive awareness and appointments across multiple specialties.",
      solution: "Decade-long partnership building the MedBlog into a system-wide content engine with 85+ articles annually, SME interviews, and multi-channel storytelling.",
      metrics: [
        { label: "Web traffic from MedBlog", value: "40%" },
        { label: "New website users YoY growth", value: "+54%" },
        { label: "Articles produced annually", value: "85+" },
        { label: "Pageviews", value: "Millions each year" },
        { label: "Media placements", value: "Dozens regional & national" },
      ],
      awards: ["2025 Digital Health Award Merit — Patient Storytelling"],
    },
    {
      id: 12,
      client: "Houston Methodist Hospital",
      category: "healthcare",
      focus: "Publication Management",
      challenge: "Previous vendor left the organization without publication support; needed end-to-end management.",
      solution: "Full publication redesign (2022) and ongoing management including original article writing, photography, infographics, translation support, and printer coordination.",
      metrics: [
        { label: "Editions published annually", value: "3" },
        { label: "Hospital locations served", value: "8" },
        { label: "Custom articles created yearly by location", value: "100+" },
        { label: "Publication history", value: "Over a decade" },
      ],
      awards: ["2025 Gold Aster Award — Magazine Series", "2025 Digital Health Award Merit"],
    },
    {
      id: 13,
      client: "Troy University",
      category: "higher-ed",
      focus: "Ad Impact Research",
      challenge: "Needed data-driven insights for marketing across 19 locations in 5 states.",
      solution: "Advertising impact study analyzing student decision factors (cost, flexibility, scholarships, career outcomes, brand reputation).",
      metrics: [
        { label: "Non-traditional student affinity growth", value: "+100%" },
        { label: "Top-choice consideration growth", value: "+100%" },
        { label: "Positive opinion rating increase", value: "+20%" },
      ],
      testimonial: {
        quote: "The results helped me adjust our strategic marketing plan, update senior leadership on our brand perception and were immediately put to use.",
        attribution: "Samantha Johnson, Senior Director of Marketing, Troy University",
      },
    },
    {
      id: 14,
      client: "Golden West College",
      category: "higher-ed",
      focus: "Admissions UX Redesign",
      challenge: "Inefficient admissions and financial aid experience with confusing site architecture (51 pages, 6 menus).",
      solution: "Streamlined from 51 to 41 pages and 6 menus to 4 task-based pathways; clickable cards, accordion components, mobile optimization, reusable Cascade design blocks.",
      metrics: [
        { label: "Organic entrances increase", value: "+66%" },
        { label: "Page view growth YoY", value: "+25%" },
      ],
      testimonial: {
        quote: "Our admissions project was a game changer for the college website. It made our work fun again — we don't feel constrained anymore.",
        attribution: "Andrea Rangno, Director of Marketing and Public Relations, Golden West College",
      },
    },
    {
      id: 15,
      client: "UW-Parkside EOC",
      category: "higher-ed",
      focus: "Video Marketing Campaign",
      challenge: "Promote the Educational Opportunity Center (serving 850+ adults annually) on a tight timeline.",
      solution: "Short video campaign with targeted digital advertising across specific counties.",
      metrics: [
        { label: "People reached (2-week campaign)", value: "144,000" },
        { label: "Total ad views", value: "650,000" },
        { label: "Average views per user", value: "4.5" },
        { label: "Clicks to EOC website & inquiry form", value: "2,700" },
        { label: "Video hook rate", value: "97%" },
      ],
    },
    {
      id: 16,
      client: "UT Permian Basin",
      category: "higher-ed",
      focus: "Tuition Estimator Tool",
      challenge: "Students found tuition information confusing and overwhelming.",
      solution: "Interactive, personalized tuition estimator with decision tree logic, persona categories, and SEO-optimized content in Cascade CMS.",
      metrics: [
        { label: "Page viewers using calculator (90 days)", value: "27%" },
        { label: "New users from organic search", value: "77%" },
        { label: "Viewers exploring graduate program costs", value: "23%" },
      ],
      testimonial: {
        quote: "The array of users engaging with the calculator proves that our content strategy worked. From undergrad, online, and graduate students — this tool is universal to all.",
        attribution: "Tatum Hubbard, VP of Marketing & Communications, UT Permian Basin",
      },
    },
    {
      id: 17,
      client: "IU Simon / End Lung Cancer Now",
      category: "healthcare",
      focus: "Awareness Campaign",
      challenge: "Launch first lung cancer awareness campaign in Indiana (one of the highest lung cancer rate states in the U.S.).",
      solution: "3-month multichannel campaign with hub-and-spoke article series, patient stories, native display advertising, and social media targeting women, Black/Latino populations, veterans, and rural residents.",
      metrics: [
        { label: "Ad impressions", value: "6.5 million" },
        { label: "New website visitors", value: "3,460" },
        { label: "Website sessions increase", value: "+8%" },
      ],
      awards: ["2025 HealthcareADAwards Merit"],
    },
    {
      id: 18,
      client: "Max Planck Florida Institute for Neuroscience",
      category: "healthcare",
      focus: "Media Outreach",
      challenge: "Needed to gain media attention for research in competitive South Florida biosciences cluster.",
      solution: "Shifted from standard press releases to translational science storytelling with blog/news creation, earned media strategies, and social media distribution.",
      metrics: [
        { label: "LinkedIn followers increase (first year)", value: "+57%" },
        { label: "Prime local & national media placements", value: "14" },
        { label: "Total relevant media placements", value: "35" },
      ],
      testimonial: {
        quote: "Working together strategically is the epitome of working smarter, not harder.",
        attribution: "Katie Walsh Edwards, AVP of Public Engagement, MPFI",
      },
    },
    {
      id: 19,
      client: "MedStar Health",
      category: "healthcare",
      focus: "Content Marketing Partnership",
      challenge: "Needed ongoing patient engagement across channels serving Baltimore to D.C. service areas.",
      solution: "Comprehensive content program including blog, podcast ('Medical Intel'), social media, native advertising, and SEO optimization. Partnership since 2017.",
      metrics: [
        { label: "Appointments generated (3 months from blog CTAs)", value: "150+" },
        { label: "SME interviews conducted", value: "410" },
        { label: "Social media posts delivered annually", value: "210" },
        { label: "Continuous partnership", value: "8+ years" },
      ],
    },
    {
      id: 20,
      client: "Roswell Park Comprehensive Cancer Center",
      category: "healthcare",
      focus: "Research Lab Websites",
      challenge: "Needed to scale content strategy across dozens of research labs.",
      solution: "Modular, scalable website templates for individual lab sites with 45-minute content intake process.",
      metrics: [
        { label: "Research lab websites developed", value: "35" },
        { label: "Total page views across lab sites", value: "35,000+" },
        { label: "Top-performing individual lab views", value: "4,000+" },
        { label: "Average monthly views per lab", value: "100" },
      ],
      awards: ["PAMN Award — Innovation in Academic Medical Center Marketing"],
    },
    {
      id: 21,
      client: "Rio Hondo College",
      category: "higher-ed",
      focus: "Brand & Website Redesign",
      challenge: "Misaligned brand perception; website didn't reflect institutional strengths.",
      solution: "Brand strategy grounded in focus group research; WordPress website redesign with conversion optimization.",
      metrics: [
        { label: "Views on new 'Get Started' page", value: "14,000+" },
        { label: "Visitors advancing to First-Time Students page", value: "5,000+" },
        { label: "Visitors advancing to Transfer Students page", value: "1,000+" },
      ],
      testimonial: {
        quote: "Thank you for your enthusiasm and support in establishing consistent recognition of our image and brand promise of which we can all be proud.",
        attribution: "Rio Hondo College President",
      },
    },

    // ── Additional Case Studies from External & Cross-Referenced Sources (22-40) ──
    {
      id: 22,
      client: "Eastern Illinois University",
      category: "higher-ed",
      focus: "'All In' Brand Campaign",
      challenge: "Three consecutive years of double-digit enrollment declines alongside state legislative budget cuts.",
      solution: "Developed the 'All In' campaign positioning EIU as a public institution that makes an extraordinary investment in every student. United the campus community and fueled a resurgence in student interest.",
      metrics: [
        { label: "Freshman enrollment increase", value: "+24.5%" },
        { label: "Applications increase", value: "2x" },
        { label: "Visit day attendance increase", value: "2x" },
        { label: "Honors-eligible freshmen increase", value: "+68%" },
        { label: "Enrollment decline", value: "Immediately reversed" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work/eastern-illinois-university", "Herald-Review", "EIU Media Relations"],
    },
    {
      id: 23,
      client: "University of Kentucky",
      category: "higher-ed",
      focus: "'See Blue' Brand Campaign",
      challenge: "Leadership established an ambitious 'Top 20 Business Plan' to grow enrollment from 22,000 to 35,000. Research showed the university needed to expand recruitment beyond Kentucky and increase mindshare.",
      solution: "Created the 'See Blue' brand identity communicating UK's purpose and promise, applied across website, PR events, and comprehensive ad campaigns.",
      metrics: [
        { label: "Applications increase (within 5 months)", value: "+20%" },
        { label: "Applications growth (2010→2023)", value: "13,537 → 28,233" },
        { label: "Total enrollment growth (2010→2024)", value: "27,951 → 36,161 (record)" },
        { label: "Academic quality", value: "Higher GPA, ACT scores, more National Merit Scholars" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work/university-of-kentucky", "UKNow", "NKY Tribune"],
    },
    {
      id: 24,
      client: "Belhaven University",
      category: "higher-ed",
      focus: "Externally Verified Results (Hannon Hill)",
      challenge: "Four separate websites creating fragmented user experience; hindering enrollment growth.",
      solution: "Merged four sites into one unified platform; reduced to 2,500 pages; 67% PDF reduction; implemented 159 GA4 measurement changes; four distinct CTA strategies; visual Program Finder.",
      metrics: [
        { label: "Traditional undergrad inquiries post-launch", value: "+49%" },
        { label: "Online inquiries post-launch", value: "+27%" },
        { label: "Traditional undergrad applications", value: "+6%" },
        { label: "Online applications", value: "+22%" },
        { label: "Record enrollment (Fall 2025)", value: "~4,500 students (up from 4,005)" },
        { label: "Traditional undergrads milestone", value: "Surpassed 1,000 (first since 2018)" },
      ],
      testimonial: {
        quote: "[We have seen a] 49% increase in traditional undergraduate inquiries since the new website's launch and a 27% increase in online inquiries.",
        attribution: "Doreen Fagerheim, AVP Digital Media & Web Marketing, Belhaven University",
      },
      externallyVerified: true,
      sources: ["Hannon Hill: Customer Spotlight", "Belhaven.edu: Record Enrollment Fall 2025"],
    },
    {
      id: 25,
      client: "Rutgers University",
      category: "higher-ed",
      focus: "Paid Search Optimization",
      challenge: "Previous vendor's campaign lacked optimization, wasting budget on low-quality clicks from irrelevant search terms with very few conversions.",
      solution: "Stamats took the exact same ad budget and created a comprehensive paid search strategy, focusing broad keywords on users most likely to convert.",
      metrics: [
        { label: "Click-through rate improvement", value: "1.24% → 3.13% (+152%)" },
        { label: "Conversions improvement", value: "10/month → 15/month (+50%)" },
        { label: "Conversion rate improvement", value: "5.38% → 12.05% (+124%)" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work", "Rutgers Procurement Services: Stamats ACE Vendor"],
    },
    {
      id: 26,
      client: "Hastings College",
      category: "higher-ed",
      focus: "Brand & Website Overhaul",
      challenge: "Declining enrollment; recruitment messaging and website lacked appeal, were not organized around prospects' needs, and were not mobile-friendly.",
      solution: "Comprehensive brand and site makeover completed in time for the next recruitment cycle.",
      metrics: [
        { label: "Enrollment increase", value: "+6%" },
        { label: "Effective communication increase", value: "+11%" },
        { label: "Enrollment", value: "Reached record highs" },
        { label: "First-year class (Fall 2023)", value: "347 students (tied all-time record)" },
        { label: "Budget impact", value: "First surplus in ~10 years" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work/hastings-college", "Hastings Tribune"],
    },
    {
      id: 27,
      client: "North Carolina A&T",
      category: "higher-ed",
      focus: "Brand Renewal",
      challenge: "Needed a renewed brand identity to match the institution's status as the nation's largest public HBCU.",
      solution: "Stamats-led brand renewal campaign to strengthen positioning and drive applications.",
      metrics: [
        { label: "Applications increase", value: "+40%" },
        { label: "Fall 2025 enrollment", value: "15,275 (first HBCU ever to exceed 15,000)" },
        { label: "Total applications received", value: "~52,000" },
        { label: "Consecutive years as largest public HBCU", value: "12" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work/north-carolina-at-brand", "NCAT.edu: Fall 2025 Enrollment"],
    },
    {
      id: 28,
      client: "University of North Carolina Wilmington",
      category: "higher-ed",
      focus: "Full-Scale Website Redesign",
      challenge: "First major overhaul of UNCW's website; needed to serve ~19,000 students and ~2,500 employees.",
      solution: "Information architecture mapping, content strategy, and creative direction across approximately 18,000 pages merged into a streamlined, student-centric site with academic program finder and mobile-friendly design. Launched May 2023.",
      metrics: [
        { label: "Pages touched, optimized, and merged", value: "~18,000" },
        { label: "New features", value: "Academic degree program finder, myUNCW section" },
      ],
      testimonial: {
        quote: "UNCW's Offices of University Relations and Information Technology Services coordinated the web redesign project and worked closely with academic units and other administrative divisions in collaboration with Stamats.",
        attribution: "UNCW News Release",
      },
      externallyVerified: true,
      sources: ["UNCW News: Launches New Website", "UNCW Web Redesign"],
    },
    {
      id: 29,
      client: "Waukesha County Technical College",
      category: "higher-ed",
      focus: "CMS & Website Redesign",
      challenge: "Homegrown CMS required a single point of contact for even minor changes; served nearly 20,000 students annually.",
      solution: "Stamats managed the redesign as a Modern Campus CMS partner. Simplified layout highlighting priority content, video functionality, new program listing tool.",
      metrics: [
        { label: "Content change turnaround", value: "Hours instead of days or weeks" },
        { label: "SEO impact", value: "Increased page views and higher search engine rankings" },
        { label: "Delivery", value: "Ahead of schedule" },
      ],
      testimonial: {
        quote: "The site is the cleanest it's been in years. A new CMS and redesign gives our website a fresh look — and the responsiveness required for mobile applications.",
        attribution: "Sue Stern, Marketing Manager, WCTC",
      },
      externallyVerified: true,
      sources: ["Modern Campus: Students First — WCTC"],
    },
    {
      id: 30,
      client: "Trine University",
      category: "higher-ed",
      focus: "Website Redesign",
      challenge: "Needed a contemporary design appealing to tech-savvy prospective students while emphasizing Trine's 99% job placement rate.",
      solution: "Stamats partnered with Trine as a Modern Campus implementation partner for a full redesign in 2016.",
      metrics: [],
      testimonial: {
        quote: "Having a CMS puts us in control of our brand, saves us time, and empowers our employees to take ownership.",
        attribution: "Deborah Richard, Director of Digital Marketing, Trine University",
      },
      externallyVerified: true,
      sources: ["Modern Campus: Trine University Successful Redesign"],
    },
    {
      id: 31,
      client: "Taylor University",
      category: "higher-ed",
      focus: "New Website",
      challenge: "Needed a modern digital platform to serve prospective and current students.",
      solution: "Full website redesign with Stamats as strategic partner.",
      metrics: [
        { label: "Annual page views", value: "1.8 million+" },
        { label: "Mobile visits", value: "50%+ of all visits" },
      ],
      testimonial: {
        quote: "I am grateful for the work of our marketing team and our partner, Stamats, in making this possible through incredible teamwork and an enhanced digital platform.",
        attribution: "Holly Whitby, MBA, MSIDT, VP for Enrollment & Marketing, Taylor University",
      },
      externallyVerified: true,
      sources: ["Taylor University: Welcome to Taylor's New Website"],
    },
    {
      id: 32,
      client: "University of Florida",
      category: "higher-ed",
      focus: "Mercury Web Template",
      challenge: "Needed brand alignment across UF's sprawling web presence with modern, accessible templates.",
      solution: "Stamats partnered with UF's Office of Strategic Communications to create the Mercury web template/theme, then implemented by UF IT for campus-wide use.",
      metrics: [],
      testimonial: {
        quote: "In all my website redesigns — and I mean a lot — I have never had them make it through executive socialization without any issues and this fast.",
        attribution: "Assistant Vice President, University of Florida",
      },
      externallyVerified: true,
      sources: ["UF Brand Center: Mercury Web Theme", "UF IT News"],
    },
    {
      id: 33,
      client: "Owens Community College",
      category: "higher-ed",
      focus: "Extended Results (NCMPR Presentation)",
      challenge: "Needed to effectively target adult learners (working professionals, stopouts); maximize conversions for nontraditional students.",
      solution: "Multi-year partnership with AI-enhanced digital strategy, co-presented results at NCMPR National Conference.",
      metrics: [
        { label: "New student enrollment (2023-2024, no extra budget)", value: "+18%" },
        { label: "Conversions for pipefitting/plumbing", value: "+150%" },
        { label: "Cost per conversion decrease (pipefitting/plumbing)", value: "$6" },
        { label: "Adult learner campaign conversions (1 month)", value: "178" },
        { label: "Conversions from January deadline campaign", value: "+57%" },
        { label: "Click-through rate during holiday period", value: "+40%" },
        { label: "Open house attendance (2023)", value: "+50%" },
      ],
      awards: ["Gold — 13th Annual Education Digital Marketing Awards"],
      externallyVerified: true,
      sources: ["Stamats Insights: 18% Enrollment Increase, No Extra Budget Required"],
    },
    {
      id: 34,
      client: "Oakland Community College",
      category: "higher-ed",
      focus: "Extended Results",
      challenge: "Low organic search visibility; inability to track visitor journeys across thousands of pages or identify conversion bottlenecks.",
      solution: "Content audit and UX improvements with custom analytics dashboard.",
      metrics: [
        { label: "Admissions page conversions (5 weeks)", value: "+250%" },
        { label: "Dashboard data multiplier", value: "169x the data (GSC + Looker Studio)" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work/oakland-community-college-seo-strategy"],
    },
    {
      id: 35,
      client: "Drake University",
      category: "higher-ed",
      focus: "D+ Campaign",
      challenge: "Needed an edgy, out-of-the-box campaign to capture prospective students' attention.",
      solution: "Stamats created the 'D+' campaign — using a mildly ironic symbol to create cognitive dissonance and inspire students to learn more.",
      metrics: [],
      testimonial: {
        quote: "Everyone is trying to do something different. It isn't just a gimmick. It's a very strategic, well thought-out program — and it has worked with our target audience.",
        attribution: "Debra Lukehart, Executive Director of Marketing and Communications, Drake University",
      },
      externallyVerified: true,
      sources: ["Deseret News: Edgy College Marketing"],
    },
    {
      id: 36,
      client: "Virginia Gay Hospitals and Clinics",
      category: "healthcare",
      focus: "Market Research",
      challenge: "Needed market research to guide growth strategy using customized methodology.",
      solution: "Stamats conducted market research using their proprietary Strategic Sequence Mapping technique.",
      metrics: [
        { label: "Outcome", value: "Concrete decision to open a new primary care clinic" },
      ],
      externallyVerified: true,
      sources: ["PR Newswire: Stamats Brings Nearly 90 Years of Marketing Research Expertise to Health Care"],
    },
    {
      id: 37,
      client: "Physicians' Clinic of Iowa",
      category: "healthcare",
      focus: "Strategic Planning",
      challenge: "Needed alignment between business strategies and marketing tactics.",
      solution: "Stamats completed two Strategic Sequence Mapping sessions.",
      metrics: [],
      testimonial: {
        quote: "Aligning business strategies with marketing strategies and tactics.",
        attribution: "Michael Sundall, CEO, Physicians' Clinic of Iowa",
      },
      externallyVerified: true,
      sources: ["PR Newswire: Stamats Brings Nearly 90 Years of Marketing Research Expertise to Health Care"],
    },
    {
      id: 38,
      client: "Brescia University College",
      category: "higher-ed",
      focus: "Digital Campaigns",
      challenge: "Needed to increase first-choice applicants.",
      solution: "Digital campaign strategy producing results faster than expected.",
      metrics: [
        { label: "First-choice applicants increase", value: "+38%" },
      ],
      externallyVerified: true,
      sources: ["stamats.com/our-work"],
    },
    {
      id: 39,
      client: "Roswell Park Comprehensive Cancer Center",
      category: "healthcare",
      focus: "PAMN Awards (Externally Verified)",
      challenge: "Needed to scale content strategy across dozens of research labs.",
      solution: "Lab website initiative and survivorship workshop program.",
      metrics: [
        { label: "Total page views since April 2022 launch", value: "34,881" },
        { label: "PAMN distinction", value: "Only organization to win two first-place awards" },
      ],
      awards: ["NACCDO-PAMN First Place — Physician-to-Physician Award", "NACCDO-PAMN First Place — Survivorship Award"],
      externallyVerified: true,
      sources: ["Stamats Insights: PAMN Roswell Awards"],
    },
    {
      id: 40,
      client: "Dutchess Community College",
      category: "higher-ed",
      focus: "Website Redesign",
      challenge: "Needed a future-looking design showcasing programs in aviation, hospitality, college transfer, and nearly 80 other fields.",
      solution: "Stamats created a future-looking design for this Poughkeepsie, NY institution. Launched March 2023.",
      metrics: [],
      externallyVerified: true,
      sources: ["Stamats Insights: 6 Reasons Why Community College Websites Deserve Attention"],
    },
  ],

  // ── Awards (Original + Externally Verified) ────────────────
  awards: [
    // 2025
    { name: "Gold Aster Award — Magazine Series", year: "2025", clientOrProject: "Houston Methodist Hospital" },
    { name: "HealthcareADAwards Merit — Integrated Marketing", year: "2025", clientOrProject: "IU Simon / End Lung Cancer Now" },
    { name: "Digital Health Award Merit — Website Redesign", year: "2025", clientOrProject: "IU Simon Comprehensive Cancer Center" },
    { name: "Digital Health Award Merit — Patient Storytelling", year: "2025", clientOrProject: "UT Southwestern" },
    { name: "NCMPR Gold Medallion — Viewbook", year: "2025", clientOrProject: "Mid Michigan College" },
    { name: "NCMPR Gold Medallion — Recruitment Campaign", year: "2025", clientOrProject: "Mid Michigan College" },
    // 2024
    { name: "NACCDO-PAMN First Place — Physician-to-Physician", year: "2024", clientOrProject: "Roswell Park Cancer Center", source: "Stamats/PAMN" },
    { name: "NACCDO-PAMN First Place — Survivorship", year: "2024", clientOrProject: "Roswell Park Cancer Center", source: "Stamats/PAMN" },
    // 2023
    { name: "NCMPR Paragon Gold — Viewbook", year: "2023", clientOrProject: "Harper College", source: "NCMPR" },
    { name: "NCMPR Paragon Silver — Viewbook", year: "2023", clientOrProject: "Kirkwood Community College", source: "NCMPR" },
    { name: "NCMPR Paragon Gold — Wild Card in Print", year: "2023", clientOrProject: "College of Lake County", source: "NCMPR" },
    { name: "NCMPR Paragon Silver — Communication Success Story", year: "2023", clientOrProject: "Fox Valley Technical College", source: "NCMPR" },
    // 2019
    { name: "Folio: Show — Website, B2B General", year: "2019", clientOrProject: "MeetingsToday.com", source: "Stamats" },
    { name: "Folio: Show — Immersive/Interactive Storytelling", year: "2019", clientOrProject: "BUILDINGS Magazine", source: "Buildings.com" },
    // 2015
    { name: "Internet Advertising Competition — Best Education Website", year: "2015", clientOrProject: "Fox Valley Technical College", source: "IAC Award" },
    // Undated
    { name: "PAMN Award — Innovation in Marketing", year: "—", clientOrProject: "Roswell Park Cancer Center" },
    { name: "Education Digital Marketing Awards Gold — Digital Advertising", year: "—", clientOrProject: "Owens Community College", source: "stamats.com" },
  ],

  // ── Testimonials (standalone) ──────────────────────────────
  testimonials: [
    // Original testimonials
    {
      quote: "In my 25 years here, I have worked with dozens and dozens of vendors. Stamats is at the top of the list as one of my favorites.",
      name: "Doreen Fagerheim",
      title: "AVP Digital Media & Web Marketing",
      organization: "Belhaven University",
    },
    {
      quote: "I tell any prospective Stamats client when evaluating a new vendor, that whoever the other vendor is, they would have to be able to create gold out of the air to outrank Stamats.",
      name: "Alex Sanchez",
      title: "Chief Experience Officer",
      organization: "BeWell (New Mexico's Health Insurance Exchange)",
    },
    {
      quote: "Stamats is, arguably, the nation's leading expert in educational research, using national data and local research to help institutions shape marketing decision-making.",
      name: "",
      title: "Leadership",
      organization: "Pima Community College",
    },
    {
      quote: "I appreciate our partnership, knowing that Stamats is keeping an eye on everything every day. I don't even have to think about the campaigns because I know they always are.",
      name: "Meaghan L. Arena, EdD",
      title: "VP for Enrollment, Marketing and Student Retention",
      organization: "University of Southern Maine",
    },
    {
      quote: "We partnered with Stamats for a comprehensive brand assessment and strategy project, and the experience exceeded our expectations at every stage.",
      name: "Diana Fairbanks",
      title: "AVP of Public Relations, Marketing and Communications",
      organization: "Northwestern Michigan College",
    },
    {
      quote: "I can't speak highly enough of how impactful it has been to work alongside Stamats on our content development strategy for our website rebuild project.",
      name: "Leanne Frisinger",
      title: "Director of Web Strategy and Development",
      organization: "University of Northern Colorado",
    },
    {
      quote: "The Stamats workshops are so helpful in getting our web and enrollment teams together — too often we think we do web, and enrollment does recruiting, when they truly are hand in hand.",
      name: "Tatum Hubbard",
      title: "Chief of Staff/VP of Marketing and Communications",
      organization: "UT Permian Basin",
    },
    {
      quote: "Stamats strategic approach to brand definition, development, and creative delivery was a great fit for our university. We needed 'everything,' and they did it all — on time and on budget.",
      name: "",
      title: "",
      organization: "Rensselaer Polytechnic Institute",
    },
    {
      quote: "It was wonderful working with Stamats on my Market Demand Analysis. Their report was thorough, well-researched, and tailored to my needs.",
      name: "Dr. Julie Bruck",
      title: "Director, School of Landscape Architecture",
      organization: "University of Florida",
    },
    {
      quote: "One of the key benefits of working with Stamats is not only do you get a beautiful website, but they upskill your team and guide you through changing your culture.",
      name: "Mary Pat Moore",
      title: "Executive Director of Public Relations & Marketing",
      organization: "Hawkeye Community College",
    },
    // Additional externally-sourced testimonials
    {
      quote: "Stamats brings a wealth of knowledge in higher education. Our firm brings leading-edge brand creative and extensive consumer brand marketing.",
      name: "Bill Thorburn",
      title: "President & Founder",
      organization: "The Thorburn Group",
      source: "The Gazette",
    },
    {
      quote: "We have been able to establish and maintain tremendous personal relationships with our clients over the years. Those relationships and our ability to provide value in the markets our clients serve have been a mainstay for us.",
      name: "Peter Stamats",
      title: "President & CEO",
      organization: "Stamats",
      source: "PR Newswire",
    },
    {
      quote: "We've morphed and changed from a fledgling marketing business to one with a national reputation for higher education and health care marketing.",
      name: "Bill Stamats",
      title: "EVP",
      organization: "Stamats",
      source: "PR Newswire",
    },
    {
      quote: "Students were organically finding this tool and using it before we even promoted it!",
      name: "Sandra Fancher",
      title: "Chief Innovation Officer",
      organization: "Stamats",
      source: "Hannon Hill",
    },
    {
      quote: "You have a name that people in this industry know and trust. You have been our partner in this and have supported us every step of the way.",
      name: "Alexander Szczesny",
      title: "Senior Digital Content Coordinator",
      organization: "Roswell Park Comprehensive Cancer Center",
    },
    {
      quote: "This story is excellent! You've really captured the essence of what we do in a concise, easy to understand format. I'm truly impressed (and Marketing will tell you that doesn't happen that often!).",
      name: "",
      title: "Neurosurgery Chair",
      organization: "MedStar Washington Hospital Center",
    },
    {
      quote: "They understood our unique needs, were incredibly responsive, pushed us when we needed to be pushed, helped us avoid some political minefields, and really gave us what we needed.",
      name: "",
      title: "",
      organization: "Client (unattributed)",
    },
    {
      quote: "Engaging in this campaign, we were able to witness firsthand what you are capable of, and we've been impressed.",
      name: "",
      title: "Interim Dean, College of Natural and Health Sciences",
      organization: "University of Wisconsin-Parkside",
    },
    {
      quote: "We could not have created such a comprehensive AI website without your team.",
      name: "Renee Buchanan",
      title: "Associate Director, Communications and Marketing",
      organization: "University of Florida AI",
      source: "UF IT News",
    },
    {
      quote: "We are pleased that Stamats has entrusted us with these brands that have been under their stewardship for so long.",
      name: "Chris Ferrell",
      title: "CEO",
      organization: "Endeavor Business Media",
      source: "PR Newswire",
    },
  ],

  // ── Named Clients ──────────────────────────────────────────
  namedClients: [
    // Higher Education (Original)
    { name: "Belhaven University", sector: "higher-ed" },
    { name: "Dominican University", sector: "higher-ed" },
    { name: "Fox Valley Technical College", sector: "higher-ed" },
    { name: "Golden West College", sector: "higher-ed" },
    { name: "Hawkeye Community College", sector: "higher-ed" },
    { name: "Mid Michigan College", sector: "higher-ed" },
    { name: "Morehead State University", sector: "higher-ed" },
    { name: "North Greenville University", sector: "higher-ed" },
    { name: "Northwestern Michigan College", sector: "higher-ed" },
    { name: "Oakland Community College", sector: "higher-ed" },
    { name: "Owens Community College", sector: "higher-ed" },
    { name: "Pima Community College", sector: "higher-ed" },
    { name: "Pueblo Community College", sector: "higher-ed" },
    { name: "Rensselaer Polytechnic Institute", sector: "higher-ed" },
    { name: "Rio Hondo College", sector: "higher-ed" },
    { name: "Taylor University", sector: "higher-ed" },
    { name: "Troy University", sector: "higher-ed" },
    { name: "University of Florida", sector: "higher-ed" },
    { name: "University of Northern Colorado", sector: "higher-ed" },
    { name: "University of Southern Maine", sector: "higher-ed" },
    { name: "University of Texas Permian Basin", sector: "higher-ed" },
    { name: "University of Wisconsin-Parkside", sector: "higher-ed" },
    // Higher Education (Additional from external sources)
    { name: "Brescia University College", sector: "higher-ed" },
    { name: "College of Lake County", sector: "higher-ed" },
    { name: "Drake University", sector: "higher-ed" },
    { name: "Dutchess Community College", sector: "higher-ed" },
    { name: "Eastern Illinois University", sector: "higher-ed" },
    { name: "Harper College", sector: "higher-ed" },
    { name: "Hastings College", sector: "higher-ed" },
    { name: "Kirkwood Community College", sector: "higher-ed" },
    { name: "North Carolina A&T", sector: "higher-ed" },
    { name: "Rutgers University", sector: "higher-ed" },
    { name: "Trine University", sector: "higher-ed" },
    { name: "University of Kentucky", sector: "higher-ed" },
    { name: "University of New Mexico (College of Pharmacy)", sector: "higher-ed" },
    { name: "University of North Carolina Wilmington", sector: "higher-ed" },
    { name: "Waukesha County Technical College", sector: "higher-ed" },
    // Healthcare & Research (Original)
    { name: "Houston Methodist Hospital", sector: "healthcare" },
    { name: "IU Simon Comprehensive Cancer Center", sector: "healthcare" },
    { name: "Max Planck Florida Institute for Neuroscience", sector: "healthcare" },
    { name: "MedStar Health", sector: "healthcare" },
    { name: "Roswell Park Comprehensive Cancer Center", sector: "healthcare" },
    { name: "UT Southwestern Medical Center", sector: "healthcare" },
    // Healthcare (Additional from external sources)
    { name: "Physicians' Clinic of Iowa", sector: "healthcare" },
    { name: "Virginia Gay Hospitals and Clinics", sector: "healthcare" },
    // Other
    { name: "ABC Medical (Navigator)", sector: "other" },
    { name: "BeWell (New Mexico Health Insurance Exchange)", sector: "other" },
  ],

  // ── Proprietary Research Studies ───────────────────────────
  researchStudies: [
    {
      name: "TeensTALK",
      description: "Annual study of college-bound high school students",
      duration: "20+ years",
      partners: ["Chegg (reaching 15+ million students)", "ACT"],
      findings: [
        "~33% of students research at least 10 colleges before applying",
        "40% plan to enroll within 30 miles of home",
        "Average distance: just over 200 miles from home",
        "Students increasingly begin serious searches in junior year (shift from senior year)",
        "'Offers my intended major' is the #1 factor in adding a college to consideration",
      ],
      sources: ["Inside Higher Ed", "PR Newswire: TeensTALK 2012", "ACT Conference"],
    },
    {
      name: "AdultStudentsTALK",
      description: "Annual study on recruiting and supporting adult learners",
      findings: [
        "91% of admissions professionals rate adult undergraduate recruitment as 'moderately' to 'very' important",
        "96.3% rate graduate student recruitment as 'moderately' to 'very' important",
        "63% of admissions marketers lack a dedicated recruitment budget for adult undergrads",
        "5 out of 8 schools secret-shopped failed to respond to inquiries within 48 hours",
        "71.1% view institutional websites as most successful recruitment tool",
      ],
      sources: ["TargetX: 2019 AdultStudentsTALK Survey"],
    },
    {
      name: "HigherEdTALK",
      description: "Survey of 493 senior team members at U.S. colleges and universities",
      findings: [
        "70% said competition for prospective students was the #1 external challenge",
        "55% cited public uncertainty about the value of higher education",
        "54% said growing enrollment was their top strategic priority",
      ],
      sources: ["Stamats News: HigherEdTALK Study"],
    },
  ],

  // ── Conference & Thought Leadership ────────────────────────
  conferenceAppearances: [
    { event: "Content Marketing World", role: "Mariah Tang spoke 7 times (most recently Oct 2024)", source: "stamats.com/insights" },
    { event: "NCMPR National Conference", role: "Co-presented Owens CC enrollment case study", source: "stamats.com/insights" },
    { event: "Cascade CMS User Conference", role: "Sandra Fancher presented 3 consecutive years (2023-2025)", source: "Hannon Hill" },
    { event: "NACCDO-PAMN Conference", role: "Presented with IU Simon Cancer Center", source: "stamats.com/insights" },
    { event: "HMPS 2025 (Healthcare Marketing)", role: "Attended and published industry recap", source: "stamats.com/insights" },
    { event: "SASMC (Adult Student Marketing Conference)", role: "Hosted for 10 consecutive years", source: "stamats.com/insights" },
    { event: "CASE Integrated Marketing Symposium", role: "Greg Carroll co-chaired", source: "CASE.org" },
  ],

  // ── Podcast ────────────────────────────────────────────────
  podcast: {
    name: "Did I Say That Out Loud?",
    season: "Season 2",
    episodes: "45+",
    hosts: ["Stu Eddins (AVP, Strategy)", "Mariah Tang (Chief Content Marketing Officer)"],
    platforms: ["Apple Podcasts", "Spotify", "Google Podcasts"],
  },
}
