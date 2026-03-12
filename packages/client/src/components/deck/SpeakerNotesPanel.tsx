import { MessageSquare } from "lucide-react"

interface SpeakerNotesPanelProps {
  notes: string
  onChange: (notes: string) => void
}

export function SpeakerNotesPanel({ notes, onChange }: SpeakerNotesPanelProps) {
  return (
    <div className="flex-shrink-0 border-t border-slate-200/60 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/60">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-200/40 dark:border-slate-700/30">
        <MessageSquare className="w-3 h-3 text-slate-400" />
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Speaker Notes</span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add speaker notes for this slide..."
        className="w-full h-24 px-4 py-2 text-[12px] text-slate-600 dark:text-slate-300 bg-transparent resize-none outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed"
      />
    </div>
  )
}
