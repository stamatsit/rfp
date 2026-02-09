import { useState, useEffect, useCallback } from "react"
import { X, Clock, RotateCcw, ChevronDown, ChevronRight } from "lucide-react"
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

export function VersionHistory({ documentId, currentContent, onRestore, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [showDiff, setShowDiff] = useState(false)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Version History</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Version list */}
          <div className="w-56 border-r border-slate-200 dark:border-slate-700 overflow-y-auto flex-shrink-0">
            {isLoading ? (
              <div className="p-4 text-xs text-slate-400">Loading...</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">No versions yet</div>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setSelectedVersion(v); setShowDiff(false) }}
                  className={`w-full text-left px-3 py-3 border-b border-slate-100 dark:border-slate-700 transition-colors ${
                    selectedVersion?.id === v.id
                      ? "bg-emerald-50 dark:bg-emerald-900/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">v{v.version}</span>
                    <span className="text-[10px] text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{v.title}</p>
                  {v.changeDescription && (
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{v.changeDescription}</p>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Version detail / diff */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedVersion ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Version {selectedVersion.version} &middot; {selectedVersion.title}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {new Date(selectedVersion.createdAt).toLocaleString()} by {selectedVersion.createdBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      {showDiff ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Diff
                    </button>
                    <button
                      onClick={() => handleRestore(selectedVersion)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded border border-emerald-200 dark:border-emerald-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {showDiff ? (
                    <div className="font-mono text-[11px] leading-relaxed">
                      {diff.map((line, i) => (
                        <div
                          key={i}
                          className={`px-2 py-0.5 ${
                            line.type === "added"
                              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                              : line.type === "removed"
                              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                              : "text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <span className="select-none mr-2 text-slate-300 dark:text-slate-600">
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
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Select a version to preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
