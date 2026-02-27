import { useState, useEffect, useCallback } from "react"
import { X, Clock, RotateCcw, ChevronDown, ChevronRight, Loader2, AlertTriangle } from "lucide-react"
import { studioApi } from "@/lib/api"

interface Version {
  id: string
  version: number
  title: string
  content: string
  changeDescription: string | null
  createdBy: string
  createdAt: string
}

interface VersionHistoryProps {
  documentId: string
  currentContent: string
  onRestore: (content: string, title: string) => void
  onClose: () => void
}

function diffLines(a: string, b: string): { type: "same" | "added" | "removed"; text: string }[] {
  const aLines = a.split("\n")
  const bLines = b.split("\n")
  const result: { type: "same" | "added" | "removed"; text: string }[] = []

  const maxLen = Math.max(aLines.length, bLines.length)
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i]
    const bLine = bLines[i]
    if (aLine === bLine) {
      result.push({ type: "same", text: aLine ?? "" })
    } else {
      if (aLine !== undefined) result.push({ type: "removed", text: aLine })
      if (bLine !== undefined) result.push({ type: "added", text: bLine })
    }
  }
  return result
}

function formatFileSize(str: string): string {
  const bytes = new Blob([str]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VersionHistory({ documentId, currentContent, onRestore, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [confirmingRestore, setConfirmingRestore] = useState(false)

  const fetchVersions = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await studioApi.listVersions(documentId) as Version[]
      setVersions(data.sort((a, b) => b.version - a.version))
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void fetchVersions()
  }, [fetchVersions])

  const handleRestore = (version: Version) => {
    onRestore(version.content, version.title)
    onClose()
  }

  const diff = selectedVersion ? diffLines(selectedVersion.content, currentContent) : []
  const isLatest = versions.length > 0 && selectedVersion?.id === versions[0]?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Version History</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Version list */}
          <div className="w-[200px] border-r border-slate-200 dark:border-slate-700 overflow-y-auto flex-shrink-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                <span className="text-[11px] text-slate-400">Loading versions…</span>
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <Clock className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  No versions saved yet
                </p>
              </div>
            ) : (
              versions.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => { setSelectedVersion(v); setShowDiff(false); setConfirmingRestore(false) }}
                  className={`w-full text-left px-3 py-3 border-b border-slate-100 dark:border-slate-700/60 transition-colors ${
                    selectedVersion?.id === v.id
                      ? "bg-emerald-50 dark:bg-emerald-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">v{v.version}</span>
                    <div className="flex items-center gap-1">
                      {idx === 0 && (
                        <span className="px-1.5 py-px text-[8px] font-bold bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 rounded-full uppercase tracking-wider">
                          Current
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                    {new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{v.title}</p>
                  {v.changeDescription && (
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate italic">{v.changeDescription}</p>
                  )}
                  <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-1">{formatFileSize(v.content)}</p>
                </button>
              ))
            )}
          </div>

          {/* Version detail / diff */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedVersion ? (
              <>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Version {selectedVersion.version}
                      </span>
                      {isLatest && (
                        <span className="px-1.5 py-px text-[8px] font-bold bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 rounded-full uppercase tracking-wider">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(selectedVersion.createdAt).toLocaleString()} · {selectedVersion.createdBy} · {formatFileSize(selectedVersion.content)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-colors ${
                        showDiff
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {showDiff ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Diff
                    </button>
                    {!isLatest && (
                      <button
                        onClick={() => setConfirmingRestore(true)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md border border-emerald-200 dark:border-emerald-700 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                    )}
                  </div>
                </div>

                {/* Confirm restore banner */}
                {confirmingRestore && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 flex-1 leading-snug">
                      This will replace the current document content. Continue?
                    </p>
                    <button
                      onClick={() => { handleRestore(selectedVersion); setConfirmingRestore(false) }}
                      className="px-2.5 py-1 text-[10px] font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-md transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setConfirmingRestore(false)}
                      className="px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4">
                  {showDiff ? (
                    <div className="font-mono text-[11px] leading-relaxed rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400">
                          <span className="text-red-500 font-semibold">−</span> v{selectedVersion.version} &nbsp;
                          <span className="text-green-600 font-semibold">+</span> current
                        </span>
                      </div>
                      {diff.map((line, i) => (
                        <div
                          key={i}
                          className={`px-2 py-0.5 ${
                            line.type === "added"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                              : line.type === "removed"
                              ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                              : "text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <span className={`select-none mr-2 font-bold ${
                            line.type === "added" ? "text-green-600 dark:text-green-400"
                            : line.type === "removed" ? "text-red-500 dark:text-red-400"
                            : "text-slate-300 dark:text-slate-600"
                          }`}>
                            {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                          </span>
                          {line.text || "\u00A0"}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                      {selectedVersion.content}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
                <Clock className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  Select a version on the left to preview its content
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
