import { useState } from "react"
import { Link } from "react-router-dom"
import {
  HelpCircle,
  X,
  Lightbulb,
  ExternalLink,
  ChevronRight,
} from "lucide-react"
import { Button, Card, CardContent } from "@/components/ui"

interface HelpTip {
  title: string
  description: string
}

interface ContextualHelpProps {
  title: string
  description: string
  tips: HelpTip[]
  learnMoreSection?: string // Section name to link to in /help
}

export function ContextualHelp({
  title,
  description,
  tips,
  learnMoreSection,
}: ContextualHelpProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`text-slate-400 hover:text-slate-600 h-8 w-8 p-0 rounded-lg transition-all ${
          isOpen ? "bg-slate-100 text-slate-600" : ""
        }`}
        title="Help"
      >
        <HelpCircle size={18} />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Help Panel */}
          <Card className="absolute right-0 top-10 z-50 w-80 shadow-xl border-slate-200 rounded-2xl overflow-hidden animate-fade-in-up">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <HelpCircle size={14} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </Button>
              </div>
            </div>

            <CardContent className="p-4 space-y-4">
              <p className="text-slate-600 text-sm leading-relaxed">{description}</p>

              {tips.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Lightbulb size={12} />
                    Quick Tips
                  </h4>
                  <ul className="space-y-2">
                    {tips.map((tip, index) => (
                      <li key={index} className="flex gap-2">
                        <ChevronRight
                          size={14}
                          className="text-blue-400 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-800">
                            {tip.title}
                          </span>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {tip.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {learnMoreSection && (
                <Link
                  to={`/help`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group"
                >
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                    Learn more
                  </span>
                  <ExternalLink
                    size={14}
                    className="text-slate-400 group-hover:text-slate-600"
                  />
                </Link>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// Pre-configured help for each page
export const searchPageHelp = {
  title: "Search Library",
  description:
    "Find answers and photos in your library. Use filters to narrow results by type, topic, or status.",
  tips: [
    {
      title: "Use keywords",
      description: "Search matches text in questions and answers.",
    },
    {
      title: "Filter by topic",
      description: "Click Filters to narrow results to specific categories.",
    },
    {
      title: "Quick copy",
      description: "Click the copy icon to copy an answer to clipboard.",
    },
  ],
  learnMoreSection: "search",
}

export const askAIPageHelp = {
  title: "Ask AI Assistant",
  description:
    "Ask questions in natural language. The AI searches your approved library content to provide accurate, sourced answers.",
  tips: [
    {
      title: "Be specific",
      description: "Specific questions get more focused answers.",
    },
    {
      title: "Check sources",
      description: "Expand 'sources used' to see the original Q&A entries.",
    },
    {
      title: "Filter by topic",
      description: "Use the topic dropdown to focus on specific categories.",
    },
  ],
  learnMoreSection: "ask-ai",
}

export const importPageHelp = {
  title: "Import Wizard",
  description:
    "Bulk import Q&A content from Excel spreadsheets. The wizard will guide you through column mapping and preview.",
  tips: [
    {
      title: "Required columns",
      description: "Question, Answer, and Category are required.",
    },
    {
      title: "Auto-detection",
      description: "Column names are matched automatically.",
    },
    {
      title: "Safe updates",
      description: "Re-importing updates existing entries, doesn't duplicate.",
    },
  ],
  learnMoreSection: "import",
}

export const photosPageHelp = {
  title: "Photo Library",
  description:
    "Upload and manage images for your proposals. Link photos to related Q&A entries for easy discovery.",
  tips: [
    {
      title: "Batch upload",
      description: "Drag multiple files at once to upload them together.",
    },
    {
      title: "Set metadata",
      description: "Add titles and topics before uploading.",
    },
    {
      title: "Link to answers",
      description: "Connect photos to related content in Search Library.",
    },
  ],
  learnMoreSection: "photos",
}

export const manualEntryPageHelp = {
  title: "Manual Entry",
  description:
    "Add individual Q&A entries when you don't have a spreadsheet. Fill in the question, answer, and metadata.",
  tips: [
    {
      title: "Clear questions",
      description: "Write specific questions for better AI matching.",
    },
    {
      title: "Use tags",
      description: "Add tags for cross-cutting themes like 'compliance'.",
    },
    {
      title: "Draft first",
      description: "Save as Draft until reviewed, then mark Approved.",
    },
  ],
  learnMoreSection: "manual-entry",
}
