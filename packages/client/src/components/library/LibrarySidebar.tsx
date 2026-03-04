import { FileText, Trophy, TrendingUp, Plus } from "lucide-react"
import type { LibrarySection } from "./libraryUtils"

interface LibrarySidebarProps {
  activeSection: LibrarySection
  onSectionChange: (section: LibrarySection) => void
  isAdmin: boolean
  onNewEntry: () => void
}

const sections = [
  { id: "qa" as const, label: "Q&A Library", icon: FileText, desc: "872 answers" },
  { id: "client-success" as const, label: "Client Success", icon: Trophy, desc: "Case studies & more" },
  { id: "proposals" as const, label: "Proposal Data", icon: TrendingUp, desc: "Win/loss analytics" },
]

export function LibrarySidebar({ activeSection, onSectionChange, isAdmin, onNewEntry }: LibrarySidebarProps) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-slate-200/60 dark:border-slate-700/30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl flex flex-col">
      {/* Section header */}
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.08em]">Library</h2>
      </div>

      {/* Nav items */}
      <nav className="px-3 space-y-1">
        {sections.map((section) => {
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`relative flex items-center gap-3 w-full px-3 py-3 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-blue-50 to-blue-50/60 dark:from-blue-950/50 dark:to-blue-950/20 border border-blue-200/50 dark:border-blue-800/40 shadow-[0_1px_3px_rgba(59,130,246,0.1),0_0_0_1px_rgba(59,130,246,0.05)]"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-blue-500 dark:bg-blue-400" />
              )}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isActive
                  ? "bg-blue-500/10 dark:bg-blue-400/10"
                  : "bg-slate-100 dark:bg-slate-800"
              }`}>
                <section.icon size={16} className={isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
              </div>
              <div className="min-w-0">
                <span className={`block text-[13px] font-semibold leading-tight ${
                  isActive ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"
                }`}>
                  {section.label}
                </span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight truncate">
                  {section.desc}
                </span>
              </div>
            </button>
          )
        })}
      </nav>

      {/* New Entry button */}
      {isAdmin && (
        <div className="px-3 pt-4">
          <button
            onClick={onNewEntry}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] shadow-[0_1px_3px_rgba(59,130,246,0.3),0_4px_12px_rgba(59,130,246,0.15)]"
          >
            <Plus size={15} /> New Entry
          </button>
        </div>
      )}
    </aside>
  )
}
