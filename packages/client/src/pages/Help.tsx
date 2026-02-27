import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  Search,
  ChevronDown,
  Sparkles,
  FileSearch,
  FileSpreadsheet,
  Image,
  PenLine,
  Lightbulb,
  Settings,
  ArrowRight,
  BarChart2,
  BookOpen,
  Quote,
  Wand2,
  FileText,
  Keyboard,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"

interface HelpArticle {
  id: string
  question: string
  answer: string
  category: string
}

interface CategoryInfo {
  icon: React.ReactNode
  color: string
  bg: string
}

const categoryMeta: Record<string, CategoryInfo> = {
  "Getting Started": { icon: <Lightbulb size={20} />, color: "text-amber-500", bg: "bg-amber-50" },
  "Search Library": { icon: <Search size={20} />, color: "text-emerald-500", bg: "bg-emerald-50" },
  "Ask AI": { icon: <Sparkles size={20} />, color: "text-violet-500", bg: "bg-violet-50" },
  "Proposal Insights": { icon: <BarChart2 size={20} />, color: "text-cyan-500", bg: "bg-cyan-50" },
  "Client Success": { icon: <BookOpen size={20} />, color: "text-violet-500", bg: "bg-violet-50" },
  "Unified AI": { icon: <Sparkles size={20} />, color: "text-indigo-500", bg: "bg-indigo-50" },
  "Testimonials & Awards": { icon: <Quote size={20} />, color: "text-orange-500", bg: "bg-orange-50" },
  "AI Humanizer": { icon: <Wand2 size={20} />, color: "text-amber-500", bg: "bg-amber-50" },
  "Document Studio": { icon: <FileText size={20} />, color: "text-blue-500", bg: "bg-blue-50" },
  "RFP Analyzer": { icon: <FileSearch size={20} />, color: "text-red-500", bg: "bg-red-50" },
  "Import Data": { icon: <FileSpreadsheet size={20} />, color: "text-blue-500", bg: "bg-blue-50" },
  "Photo Library": { icon: <Image size={20} />, color: "text-orange-500", bg: "bg-orange-50" },
  "New Entry": { icon: <PenLine size={20} />, color: "text-indigo-500", bg: "bg-indigo-50" },
  "Keyboard & Navigation": { icon: <Keyboard size={20} />, color: "text-slate-500", bg: "bg-slate-100" },
  "Settings": { icon: <Settings size={20} />, color: "text-slate-500", bg: "bg-slate-100" },
  "Tips & Troubleshooting": { icon: <Settings size={20} />, color: "text-slate-500", bg: "bg-slate-100" },
}

const helpArticles: HelpArticle[] = [
  // Getting Started
  {
    id: "gs-1",
    category: "Getting Started",
    question: "How do I get started with the Content Library?",
    answer: "Start by importing your existing Q&A content from Excel using the Import Data feature. Once imported, you can search your library, ask AI questions, and copy approved answers directly into your proposals. The homepage shows all available tools — try clicking 'AI Tools' to access the full suite of AI features, or 'Search Library' to browse your content directly.",
  },
  {
    id: "gs-2",
    category: "Getting Started",
    question: "What's the difference between Approved and Draft status?",
    answer: "Approved entries are verified content ready for use in proposals. All AI tools only use Approved content when answering questions. Draft entries are visible in search but excluded from AI responses — use Draft for content that needs review before being made official.",
  },
  {
    id: "gs-3",
    category: "Getting Started",
    question: "How is content organized?",
    answer: "Content is organized using Topics (main categories like 'Security' or 'Pricing'), Subtopics (optional finer groupings), and Tags (cross-cutting themes like 'compliance'). This structure helps you find content quickly and enables the AI to provide more relevant answers.",
  },
  {
    id: "gs-4",
    category: "Getting Started",
    question: "What AI tools are available?",
    answer: "All AI tools are found at /ai (the AI Tools hub), organized into four tabs: Ask AI searches your Q&A library and synthesizes answers grounded in your approved content. Proposal Insights analyzes your proposal win/loss history and surfaces trends. Client Success searches case studies, testimonials, and awards to find proof points. Unified AI cross-references all three sources simultaneously for the most comprehensive answers. Additional AI tools: AI Humanizer rewrites AI-generated text to sound natural, and Document Studio includes an integrated AI chat sidebar for document writing.",
  },

  // Search Library
  {
    id: "search-1",
    category: "Search Library",
    question: "How do I search for content?",
    answer: "Type keywords in the search bar — results update as you type. You can search across both Q&A entries and photos. Use the filters panel to narrow by topic, status (Approved/Draft), or content type. Click any result to view full details and copy the content. Press '/' from anywhere in the app to jump directly to Search Library.",
  },
  {
    id: "search-2",
    category: "Search Library",
    question: "How do I copy an answer to use in my proposal?",
    answer: "Click the copy icon on any search result card, or open the full details and click 'Copy Answer'. The text is copied to your clipboard and ready to paste into your document. A checkmark confirms the copy was successful.",
  },
  {
    id: "search-3",
    category: "Search Library",
    question: "Can I filter search results?",
    answer: "Yes! Click the 'Filters' button to show filter options. You can filter by: Content type (Answers or Photos), Topic/Category, and Status (Approved or Draft). Active filters show as badges and can be cleared individually or all at once.",
  },
  {
    id: "search-4",
    category: "Search Library",
    question: "How do I edit an existing answer?",
    answer: "Click on any answer in search results to open the detail panel. Click 'Edit' to modify the question, answer text, topic, tags, or status. Your changes are saved when you click 'Save'. Previous versions are kept in version history.",
  },

  // Ask AI
  {
    id: "ai-1",
    category: "Ask AI",
    question: "How does Ask AI work?",
    answer: "Ask AI searches your Approved library content to find relevant answers, then synthesizes a response based only on that content. It never makes up information — if no relevant approved content exists, it will tell you. Every response includes clickable sources showing which Q&A entries were used.",
  },
  {
    id: "ai-2",
    category: "Ask AI",
    question: "Why did the AI refuse to answer my question?",
    answer: "Ask AI only answers using your approved library content. If it refuses, it means no relevant approved content was found. Try: 1) Rephrasing your question with different keywords, 2) Checking if relevant content exists but is marked as Draft, 3) Adding the needed content to your library.",
  },
  {
    id: "ai-3",
    category: "Ask AI",
    question: "Can I filter AI responses by topic?",
    answer: "Yes! Use the topic dropdown before asking your question. The AI will only search within that topic's approved content. This is helpful when you have similar content across different contexts and want more focused answers.",
  },
  {
    id: "ai-4",
    category: "Ask AI",
    question: "How do I refine or reformat an AI response?",
    answer: "After receiving an answer, click the Refine button on any message. You can: Shorten or expand the content, convert to bullet points, change the tone (Formal or Casual), set a target word count, or write custom instructions. There's also a 'Refine Content' mode where you paste any text and provide refinement instructions — useful for adapting content you already have.",
  },
  {
    id: "ai-5",
    category: "Ask AI",
    question: "What are the follow-up prompt pills?",
    answer: "After each AI response, the system suggests relevant follow-up questions as clickable pills above the input. Click any pill to ask that question automatically. You can disable this behavior in Settings > AI > Auto-suggest.",
  },

  // Proposal Insights
  {
    id: "pi-1",
    category: "Proposal Insights",
    question: "What is Proposal Insights?",
    answer: "Proposal Insights is an AI analytics tool that analyzes your proposal win/loss history. Ask natural language questions like 'What's our win rate for higher ed clients?' or 'Which AE closes the most deals?' and get data-driven answers based on your actual proposal database.",
  },
  {
    id: "pi-2",
    category: "Proposal Insights",
    question: "What kinds of questions can I ask?",
    answer: "Proposal Insights is designed for win/loss analysis and trend discovery. Try quick actions like: Full Funnel (end-to-end metrics), Win Formula (patterns in winning proposals), Team Intel (performance by account executive), Momentum (recent trend direction), Sweet Spots (your strongest market niches), and Strategy Brief (actionable recommendations).",
  },
  {
    id: "pi-3",
    category: "Proposal Insights",
    question: "How current is the proposal data?",
    answer: "The status bar at the top of Proposal Insights shows the total number of proposals synced and the last sync timestamp. Admins can trigger a manual sync using the 'Sync Now' button to pull the latest data from the pipeline.",
  },

  // Client Success
  {
    id: "cs-1",
    category: "Client Success",
    question: "What is Client Success?",
    answer: "Client Success is an AI tool that searches your library of 40+ case studies, client results, testimonials, and awards. Use it to find proof points for proposals, locate the right client quote for a presentation, or surface relevant statistics to support a pitch.",
  },
  {
    id: "cs-2",
    category: "Client Success",
    question: "What quick actions are available?",
    answer: "Client Success includes six quick action buttons: For a Case Study (full narrative), For a Proposal (relevant wins and stats), For a Presentation (punchy proof points), Grab a Stat (specific measurable results), Find Quote (testimonials by context), and Find Proof (evidence supporting a specific claim).",
  },
  {
    id: "cs-3",
    category: "Client Success",
    question: "How is Client Success different from Ask AI?",
    answer: "Ask AI searches your Q&A library — your internal knowledge base of proposal answers. Client Success searches a separate dataset of case studies, results, testimonials, and awards. For proposal writing, use Ask AI for process/capability questions and Client Success for proof points, quotes, and client success stories.",
  },

  // Unified AI
  {
    id: "ua-1",
    category: "Unified AI",
    question: "What is Unified AI?",
    answer: "Unified AI simultaneously searches your Q&A library, proposal history, and client success data in a single query. It's the most powerful option when you need answers that span multiple sources — for example, 'What's our strongest pitch for healthcare higher ed clients?' draws on proposal win data, case studies, and relevant Q&A content together.",
  },
  {
    id: "ua-2",
    category: "Unified AI",
    question: "When should I use Unified AI vs the other AI tools?",
    answer: "Use specific tools when you have a focused question: Ask AI for Q&A library content, Proposal Insights for win/loss analytics, Client Success for case studies and proof points. Use Unified AI when you want cross-referenced insights — like preparing a comprehensive proposal strategy, identifying content gaps, or running a smart search across everything at once.",
  },

  // Testimonials & Awards
  {
    id: "ta-1",
    category: "Testimonials & Awards",
    question: "How do I find the right testimonial for a proposal?",
    answer: "Use the AI Finder tab under Testimonials to search with natural language — describe the type of client, sector, or outcome you need. For manual browsing, use the Browse tab and filter by sector (Higher Ed, Healthcare, Other), status (Approved/Draft/Hidden), or sort by length to find quotes that fit your space constraints.",
  },
  {
    id: "ta-2",
    category: "Testimonials & Awards",
    question: "How do I manage testimonial status?",
    answer: "Each testimonial can be Approved (ready for use), Draft (under review), or Hidden (archived). Use the Approve or Hide buttons on each card to change status. The 'Mark as used' action tracks how often each testimonial has been used in proposals.",
  },
  {
    id: "ta-3",
    category: "Testimonials & Awards",
    question: "How do I browse awards?",
    answer: "Switch to the Awards tab to browse Stamats award history. Filter by submission type (Client/Stamats/Other) and sort by year, agency, or usage frequency. Each award card shows the agency, year, and any uploaded award image.",
  },

  // AI Humanizer
  {
    id: "hum-1",
    category: "AI Humanizer",
    question: "What does the AI Humanizer do?",
    answer: "The AI Humanizer rewrites AI-generated text to sound more human and natural. Paste your AI-written content, choose a tone (Professional, Conversational, or Academic) and strength (Light, Balanced, or Heavy), then click Humanize. The result is rewritten to reduce detectable AI patterns while preserving the meaning.",
  },
  {
    id: "hum-2",
    category: "AI Humanizer",
    question: "What is the Scan mode?",
    answer: "Scan mode analyzes text and gives it a Human Score from 0–100%. It identifies specific patterns that AI detectors flag and shows a breakdown of flagged phrases. Use Scan to check content before submitting it, or after humanizing to measure improvement. The 'Fix These Issues' button lets you humanize based on the scan results.",
  },
  {
    id: "hum-3",
    category: "AI Humanizer",
    question: "What file types can I upload to the Humanizer?",
    answer: "You can upload PDF, Word (.docx, .doc), or plain text (.txt) files. The text is extracted automatically and placed into the input field. You can also drag and drop files directly into the chat input.",
  },

  // Document Studio
  {
    id: "ds-1",
    category: "Document Studio",
    question: "What is Document Studio?",
    answer: "Document Studio is a rich text editor for creating proposal documents, case studies, and other formal content. It includes an integrated AI chat sidebar that can help draft sections, suggest phrasing, pull content from your Q&A library, and refine text — all without leaving the editor.",
  },
  {
    id: "ds-2",
    category: "Document Studio",
    question: "What keyboard shortcuts work in Document Studio?",
    answer: "Document Studio has its own set of shortcuts: Cmd+S saves the document to the server, Cmd+Z / Cmd+Shift+Z for undo/redo, Cmd+F opens Find & Replace, Cmd+O toggles the document browser, Cmd+Shift+R toggles between edit and review mode, and Escape closes any open modal.",
  },
  {
    id: "ds-3",
    category: "Document Studio",
    question: "Does Document Studio auto-save?",
    answer: "Yes. Documents auto-save to the server on a configurable interval. You can change the interval in Settings > General > Document Studio > Auto-Save Interval (options: 1s, 3s, 5s, 10s, 30s). A manual Cmd+S save is also always available.",
  },

  // RFP Analyzer
  {
    id: "rfp-1",
    category: "RFP Analyzer",
    question: "What file types can I upload to the RFP Analyzer?",
    answer: "You can upload PDF, Word documents (.docx, .doc), and plain text files (.txt) up to 20MB. The text is extracted automatically and displayed in a scrollable viewer where you can work with it.",
  },
  {
    id: "rfp-2",
    category: "RFP Analyzer",
    question: "How does the AI document scan work?",
    answer: "After uploading a document, configure your scan criteria (checkboxes for what to look for, like missing sections or unclear language). Click 'Scan' and the AI analyzes the entire document against your criteria, flagging issues by severity (critical, warning, info). You can dismiss flags, add notes, or restore dismissed items.",
  },
  {
    id: "rfp-3",
    category: "RFP Analyzer",
    question: "Can I save my uploaded RFP documents?",
    answer: "Yes! After uploading, click 'Save Document' to store it for later. Saved documents appear in the Documents tab and can be reopened anytime. The extracted text and any notes are preserved.",
  },

  // Import Data
  {
    id: "import-1",
    category: "Import Data",
    question: "What Excel format should I use for importing?",
    answer: "Your spreadsheet needs columns for: Question, Answer, and Category (required). Optional columns: Tags (comma-separated), Subtopic, and Status. Column names are flexible — 'Q' works for Question, 'Topic' works for Category, etc. The system auto-detects common column names.",
  },
  {
    id: "import-2",
    category: "Import Data",
    question: "What happens if I import duplicate content?",
    answer: "The system detects duplicates using a fingerprint based on question text and topic. If a match is found, the existing entry is updated with the new content instead of creating a duplicate. This lets you maintain content in Excel and re-import to sync changes.",
  },
  {
    id: "import-3",
    category: "Import Data",
    question: "Why are some rows showing warnings during import?",
    answer: "Warnings appear for rows missing required fields (Question, Answer, or Category) or when potential issues are detected. You can still import — problematic rows will be skipped and listed in the results. Review the warnings to fix your spreadsheet for next time.",
  },
  {
    id: "import-4",
    category: "Import Data",
    question: "Are new topics created automatically?",
    answer: "Yes! If your Category column contains values that don't match existing topics, new topics are created automatically during import. This makes it easy to organize content — just use consistent category names in your spreadsheet.",
  },

  // Photo Library
  {
    id: "photo-1",
    category: "Photo Library",
    question: "What image formats are supported?",
    answer: "You can upload PNG, JPG, GIF, and WebP images up to 10MB each. Drag and drop multiple files at once, or click to browse. Each photo needs a title and topic before uploading.",
  },
  {
    id: "photo-2",
    category: "Photo Library",
    question: "How do I link photos to answers?",
    answer: "Open any photo or answer in the detail view and click 'Link' to connect them. Photos can be linked to multiple answers, and answers can have multiple photos. Linked content appears together in search results for easy access.",
  },
  {
    id: "photo-3",
    category: "Photo Library",
    question: "Can I rename a photo after uploading?",
    answer: "Yes! Click on any photo to open details, then edit the title. Renaming won't break existing links — the internal storage key stays the same. You can also update the topic, tags, and status.",
  },

  // New Entry
  {
    id: "entry-1",
    category: "New Entry",
    question: "When should I use manual entry vs import?",
    answer: "Use manual entry for adding individual Q&A items quickly — great for one-off additions or when you don't have a spreadsheet. Use import when you have multiple entries in Excel or want to bulk update content. Both create the same type of library entries.",
  },
  {
    id: "entry-2",
    category: "New Entry",
    question: "What fields are required for a new entry?",
    answer: "Required: Question, Answer, and Topic. Optional: Subtopic (for finer organization), Tags (comma-separated keywords), and Status (defaults to Approved). Write clear, specific questions for better AI matching.",
  },

  // Settings
  {
    id: "set-1",
    category: "Settings",
    question: "How do I customize the home screen?",
    answer: "Open Settings and go to the Home Screen tab. You can toggle each tile on or off and drag them to reorder. Available tiles: AI Tools, Search Library, Import Data, New Entry, Photo Library, Document Scanner, and Testimonials & Awards. Changes take effect immediately on the home page.",
  },
  {
    id: "set-2",
    category: "Settings",
    question: "What are Dashboard Widgets?",
    answer: "Dashboard Widgets are live data panels that appear on the home screen when enabled. Go to Settings > Widgets to turn them on. Available widgets: Services Breakdown (bar chart of your top service categories), Top Services by Win Rate (which service types close most often), and Momentum (a gauge showing recent win rate vs historical average). You can enable the master toggle in Settings > Home Screen > Dashboard Widgets.",
  },
  {
    id: "set-3",
    category: "Settings",
    question: "How do I change the font size?",
    answer: "Go to Settings > Appearance > Font Size and pick S, M, or L. This scales the entire UI — S is 14px, M is 16px (default), and L is 18px. The change applies immediately and persists across sessions.",
  },
  {
    id: "set-4",
    category: "Settings",
    question: "What AI settings are available?",
    answer: "In Settings > AI you can control: Response Length (Concise / Balanced / Detailed — affects how much the AI writes), Show Sources (toggle whether cited Q&A entries appear below AI responses), and Auto-suggest (whether follow-up question pills appear after each AI answer).",
  },
  {
    id: "set-5",
    category: "Settings",
    question: "Where do I find experimental features?",
    answer: "Experimental features are in Settings > Labs. Currently available: Command Palette (Cmd+K quick-launch overlay), AI Companion (floating assistant button), and Side Navigation Rail (fixed left sidebar with icon shortcuts). Labs features are stable but not part of the default experience.",
  },

  // Keyboard & Navigation
  {
    id: "kb-1",
    category: "Keyboard & Navigation",
    question: "What keyboard shortcuts are available?",
    answer: "Global shortcuts: Press '?' to open the Help Center, press '/' to jump to Search Library, and press Cmd+K (or Ctrl+K on Windows) to open the Command Palette. These work from anywhere except when typing in a text field. Document Studio adds editor shortcuts: Cmd+S saves, Cmd+F finds, Cmd+O opens the document browser, Cmd+Shift+R toggles review mode.",
  },
  {
    id: "kb-2",
    category: "Keyboard & Navigation",
    question: "What is the Command Palette?",
    answer: "The Command Palette (Cmd+K) is a quick-launch overlay that lets you navigate to any page or jump to a recent conversation without using the mouse. Type to filter by page name or description, use arrow keys to navigate the list, and press Enter to open. You can enable or disable it in Settings > Labs > Command Palette.",
  },
  {
    id: "kb-3",
    category: "Keyboard & Navigation",
    question: "What is the AI Companion?",
    answer: "The AI Companion is a floating assistant button available on every page. Click it to open a mini chat that offers contextual help and suggestions based on where you are in the app. Enable or disable it in Settings > Labs > AI Companion. It defaults to on.",
  },
  {
    id: "kb-4",
    category: "Keyboard & Navigation",
    question: "What is the Side Navigation Rail?",
    answer: "The Side Navigation Rail is an optional fixed left sidebar showing icon shortcuts to the main sections: Home, Search Library, AI Tools, Document Studio, AI Humanizer, and Testimonials & Awards. It's off by default — enable it in Settings > Labs > Side Navigation Rail. When active, page content shifts right to accommodate it.",
  },

  // Tips & Troubleshooting
  {
    id: "tip-1",
    category: "Tips & Troubleshooting",
    question: "How can I get better AI responses?",
    answer: "Be specific in your questions — 'What security certifications do we have?' beats 'Tell me about security'. Use topic filtering for focused answers. Make sure relevant content is marked as Approved, not Draft. If responses seem incomplete, check if your library has coverage for that topic. Try Unified AI when a question spans multiple knowledge areas.",
  },
  {
    id: "tip-2",
    category: "Tips & Troubleshooting",
    question: "My search isn't finding content I know exists — what's wrong?",
    answer: "Try different keywords — search matches against question and answer text. Check your filters — you might have a topic or status filter active. Clear all filters and search again. Also verify the content is in your library by browsing without a search query.",
  },
  {
    id: "tip-3",
    category: "Tips & Troubleshooting",
    question: "How do I keep my library organized as it grows?",
    answer: "Use consistent topic naming (pick 'Security' or 'Information Security', not both). Apply tags for themes that span multiple topics. Periodically review Draft content and either approve or remove it. Mark outdated content as Draft until updated.",
  },
  {
    id: "tip-4",
    category: "Tips & Troubleshooting",
    question: "Can multiple people use the library at the same time?",
    answer: "Yes! The library is shared across all users. Changes made by one person are immediately visible to others. Be mindful when editing — if two people edit the same entry simultaneously, the last save wins. Version history lets you recover previous content if needed.",
  },
  {
    id: "tip-5",
    category: "Tips & Troubleshooting",
    question: "How do I resume a previous AI conversation?",
    answer: "Every AI page keeps a conversation history accessible from the sidebar (click the history icon). You can also use the Command Palette (Cmd+K) which shows your five most recent conversations with direct links. Conversations are saved automatically and scoped to your account.",
  },
]

const categoryOrder = [
  "Getting Started",
  "Search Library",
  "Ask AI",
  "Proposal Insights",
  "Client Success",
  "Unified AI",
  "Testimonials & Awards",
  "AI Humanizer",
  "Document Studio",
  "RFP Analyzer",
  "Import Data",
  "Photo Library",
  "New Entry",
  "Keyboard & Navigation",
  "Settings",
  "Tips & Troubleshooting",
]

export function Help() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return helpArticles

    const query = searchQuery.toLowerCase()
    return helpArticles.filter(
      (a) =>
        a.question.toLowerCase().includes(query) ||
        a.answer.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const toggleArticle = (id: string) => {
    setExpandedArticles((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Group articles by category
  const groupedArticles = useMemo(() => {
    const groups: { category: string; articles: HelpArticle[] }[] = []

    for (const cat of categoryOrder) {
      const catArticles = filteredArticles.filter((a) => a.category === cat)
      if (catArticles.length > 0) {
        groups.push({ category: cat, articles: catArticles })
      }
    }

    return groups
  }, [filteredArticles])

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-slate-950 transition-colors duration-300">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-[40px] font-semibold text-slate-900 dark:text-white tracking-tight mb-3 transition-colors">
            Help Center
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 transition-colors">
            Everything you need to know about the Content Library
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-xl mx-auto mb-16">
          <Search
            size={20}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-5 h-12 text-[17px] rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          />
        </div>

        {/* Search Results */}
        {searchQuery ? (
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 transition-colors">
              {filteredArticles.length} result{filteredArticles.length !== 1 ? "s" : ""}
            </p>
            {filteredArticles.length > 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden transition-colors" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {filteredArticles.map((article, idx) => {
                  const meta = categoryMeta[article.category]
                  return (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      isExpanded={expandedArticles.has(article.id)}
                      onToggle={() => toggleArticle(article.id)}
                      searchQuery={searchQuery}
                      isLast={idx === filteredArticles.length - 1}
                      showCategory
                      meta={meta}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-500 dark:text-slate-400 transition-colors">No results found</p>
              </div>
            )}
          </div>
        ) : (
          /* Category Grid */
          <div className="space-y-12">
            {groupedArticles.map((group) => {
              const meta = categoryMeta[group.category]
              if (!meta) return null
              return (
                <section key={group.category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} dark:bg-opacity-20 ${meta.color} flex items-center justify-center transition-colors`}>
                      {meta.icon}
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white transition-colors">
                      {group.category}
                    </h2>
                  </div>

                  {/* Articles */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden transition-colors" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    {group.articles.map((article, idx) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        isExpanded={expandedArticles.has(article.id)}
                        onToggle={() => toggleArticle(article.id)}
                        searchQuery={searchQuery}
                        isLast={idx === group.articles.length - 1}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {/* Contact */}
        <div className="mt-20 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-2 transition-colors">Still have questions?</p>
          <Link
            to="/support"
            className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Contact Support
            <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    </div>
  )
}

// Article Card Component
interface ArticleCardProps {
  article: HelpArticle
  isExpanded: boolean
  onToggle: () => void
  searchQuery: string
  isLast?: boolean
  showCategory?: boolean
  meta?: CategoryInfo
}

function ArticleCard({ article, isExpanded, onToggle, searchQuery, isLast, showCategory, meta }: ArticleCardProps) {
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
    const parts = text.split(regex)

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  return (
    <div className={!isLast && !isExpanded ? "border-b border-slate-100 dark:border-slate-800" : ""}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex-1">
          {showCategory && meta && (
            <span className={`text-xs font-medium ${meta.color} mb-1 block`}>
              {article.category}
            </span>
          )}
          <span className="text-[15px] text-slate-800 dark:text-slate-200 transition-colors">
            {highlightText(article.question)}
          </span>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-300 dark:text-slate-600 flex-shrink-0 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className={`px-5 pb-5 ${!isLast ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
          <p className="text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed transition-colors">
            {highlightText(article.answer)}
          </p>
        </div>
      )}
    </div>
  )
}
