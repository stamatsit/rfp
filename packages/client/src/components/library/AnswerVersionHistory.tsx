import { History, X, GitBranch, RotateCcw, AlertTriangle } from "lucide-react"
import { Button, Badge } from "@/components/ui"
import type { AnswerVersion } from "@/lib/api"

interface AnswerVersionHistoryProps {
  versions: AnswerVersion[]
  selectedVersion: AnswerVersion | null
  onSelectVersion: (version: AnswerVersion | null) => void
  onClose: () => void
  onRestore: (version: AnswerVersion) => void
  onOpenForked: (forkedToId: string) => void
}

export function AnswerVersionHistory({
  versions, selectedVersion, onSelectVersion, onClose, onRestore, onOpenForked,
}: AnswerVersionHistoryProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-[15px]">
          <History size={18} className="text-blue-600 dark:text-blue-400" />
          Version History
          <span className="text-slate-400 dark:text-slate-500 font-normal text-[13px]">({versions.length})</span>
        </h3>
        <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg active:scale-[0.98] transition-all duration-150">
          <X size={14} className="mr-1.5" /> Close
        </Button>
      </div>

      {versions.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-8 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl text-[13px]">
          No version history available yet.
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {versions.slice().reverse().map((version) => {
            const isFork = !!version.forkedToId
            return isFork ? (
              <div
                key={version.id}
                className="p-4 rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-violet-50/60 dark:bg-violet-900/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-violet-600 dark:text-violet-400" />
                    <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Saved as new entry</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(version.createdAt).toLocaleDateString()} at{" "}
                      {new Date(version.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">by {version.createdBy}</span>
                </div>
                <button
                  className="text-sm text-violet-700 dark:text-violet-300 underline hover:text-violet-900 dark:hover:text-violet-100 text-left transition-colors duration-150"
                  onClick={() => onOpenForked(version.forkedToId!)}
                >
                  Open forked entry →
                </button>
              </div>
            ) : (
              <div
                key={version.id}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                  selectedVersion?.id === version.id
                    ? "bg-blue-50/80 dark:bg-blue-900/30 border-blue-300/60 dark:border-blue-700/50 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                    : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/40 hover:bg-slate-100/60 dark:hover:bg-slate-700/40"
                }`}
                onClick={() => onSelectVersion(version)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">v{version.versionNumber}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(version.createdAt).toLocaleDateString()} at{" "}
                      {new Date(version.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {version.versionNumber === versions.length && (
                    <Badge variant="success" className="text-xs">Current</Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{version.question}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">{version.answer}</p>
              </div>
            )
          })}
        </div>
      )}

      {selectedVersion && selectedVersion.versionNumber !== versions.length && (
        <div className="p-4 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-900 dark:text-amber-200 text-[14px]">Restore this version?</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                This will open the editor with v{selectedVersion.versionNumber}'s content.
              </p>
              <Button
                size="sm"
                className="mt-3 rounded-lg active:scale-[0.98] transition-all duration-150"
                onClick={() => onRestore(selectedVersion)}
              >
                <RotateCcw size={14} className="mr-1.5" /> Restore Version
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
