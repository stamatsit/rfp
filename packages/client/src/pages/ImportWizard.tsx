import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { useIsAdmin } from "@/contexts/AuthContext"
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, Sparkles, FileCheck, ListChecks, PartyPopper } from "lucide-react"
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui"
import { AppHeader } from "@/components/AppHeader"
import { importApi, ApiError } from "@/lib/api"
import type { ImportPreview, ImportResult, ImportIssue } from "@/types"

type WizardStep = "upload" | "preview" | "issues" | "complete"

const stepConfig = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "preview", label: "Preview", icon: FileCheck },
  { key: "issues", label: "Review", icon: ListChecks },
  { key: "complete", label: "Complete", icon: PartyPopper },
] as const

export function ImportWizard() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return <Navigate to="/" replace />
  const [step, setStep] = useState<WizardStep>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const currentStepIndex = stepConfig.findIndex(s => s.key === step)

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setIsLoading(true)
    setError(null)

    try {
      const previewData = await importApi.preview(selectedFile)

      setPreview({
        totalRows: previewData.totalRows,
        previewRows: previewData.previewRows,
        issues: previewData.issues,
        newCount: previewData.newCount,
        updateCount: previewData.updateCount,
      })
      setStep("preview")
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Failed to preview file. Please check the file format.")
      }
      console.error("Preview error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    setIsLoading(true)
    setError(null)

    try {
      let importResult

      if (file) {
        importResult = await importApi.execute(file)
      } else {
        throw new Error("No file selected")
      }

      setResult({
        success: importResult.success,
        imported: importResult.imported,
        updated: importResult.updated,
        skipped: importResult.skipped,
        issues: importResult.issues,
      })
      setStep("complete")
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Failed to import file. Please try again.")
      }
      console.error("Import error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const resetWizard = () => {
    setStep("upload")
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Progress indicator */}
      <div className="border-b border-slate-200/60 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {stepConfig.map((s, i) => {
              const Icon = s.icon
              const isActive = step === s.key
              const isComplete = currentStepIndex > i

              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                        isActive
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110"
                          : isComplete
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/25"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle2 size={22} />
                      ) : (
                        <Icon size={20} />
                      )}
                    </div>
                    <span className={`mt-2 text-xs font-medium transition-colors ${
                      isActive ? "text-blue-600 dark:text-blue-400" : isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {i < stepConfig.length - 1 && (
                    <div className="flex-1 mx-3 h-0.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isComplete ? "w-full bg-gradient-to-r from-emerald-500 to-emerald-400" : "w-0"
                        }`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-6 py-8 flex items-start justify-center">
        <div className="w-full max-w-3xl animate-fade-in-up">
          {/* Error display */}
          {error && (
            <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-red-50/80 border border-red-200 rounded-2xl flex items-start gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="text-red-600" size={20} />
              </div>
              <div className="pt-1">
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-600 text-sm mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <Card className="border-slate-200/80 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Sparkles size={18} className="text-teal-500" />
                  Upload Excel File
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
                    isDragging
                      ? "border-teal-500 bg-teal-50/50 ring-4 ring-teal-500/20"
                      : "border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100/50 hover:border-teal-400 hover:bg-teal-50/30"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                    const droppedFile = e.dataTransfer.files[0]
                    if (droppedFile) handleFileSelect(droppedFile)
                  }}
                  onClick={() => {
                    const input = document.createElement("input")
                    input.type = "file"
                    input.accept = ".xlsx,.xls"
                    input.onchange = (e) => {
                      const selectedFile = (e.target as HTMLInputElement).files?.[0]
                      if (selectedFile) handleFileSelect(selectedFile)
                    }
                    input.click()
                  }}
                >
                  <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-300 ${
                    isDragging
                      ? "bg-teal-500 text-white scale-110"
                      : "bg-slate-200/80 text-slate-500"
                  }`}>
                    <Upload size={28} />
                  </div>
                  <p className="text-lg font-semibold text-slate-800">
                    {isDragging ? "Drop your file here" : "Drop your Excel file here"}
                  </p>
                  <p className="text-slate-500 mt-1">
                    or click to browse
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Badge variant="secondary" className="bg-slate-200/80 text-slate-600">.xlsx</Badge>
                    <Badge variant="secondary" className="bg-slate-200/80 text-slate-600">.xls</Badge>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && preview && (
            <Card className="border-slate-200/80 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <FileCheck size={18} className="text-blue-500" />
                  Preview Import
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200/50">
                    <p className="text-3xl font-bold text-slate-700">{preview.totalRows}</p>
                    <p className="text-sm text-slate-500 mt-1">Total Rows</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl border border-emerald-200/50">
                    <p className="text-3xl font-bold text-emerald-600">{preview.newCount}</p>
                    <p className="text-sm text-emerald-600/70 mt-1">New Entries</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl border border-blue-200/50">
                    <p className="text-3xl font-bold text-blue-600">{preview.updateCount}</p>
                    <p className="text-sm text-blue-600/70 mt-1">Updates</p>
                  </div>
                </div>

                {/* Issues warning */}
                {preview.issues.length > 0 && (
                  <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="text-amber-600" size={20} />
                    </div>
                    <div className="pt-1">
                      <p className="font-semibold text-amber-800">
                        {preview.issues.length} issues found
                      </p>
                      <p className="text-amber-700 text-sm mt-0.5">
                        Some rows have missing or invalid data. Click "Review Issues" to see details.
                      </p>
                    </div>
                  </div>
                )}

                {/* Preview table */}
                <div>
                  <h3 className="font-medium text-slate-700 mb-3 text-sm">
                    First {preview.previewRows.length} rows preview:
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Question</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Tags</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {preview.previewRows.map((row) => (
                            <tr key={row.row} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-mono text-slate-500 text-xs">{row.row}</td>
                              <td className="px-4 py-3 max-w-xs truncate text-slate-700" title={row.question}>
                                {row.question}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.category}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {row.tags?.slice(0, 3).map((tag, i) => (
                                    <Badge
                                      key={tag}
                                      variant={i === 0 ? "default" : i === 1 ? "purple" : "teal"}
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                  {(row.tags?.length || 0) > 3 && (
                                    <Badge variant="outline" className="text-xs">+{(row.tags?.length || 0) - 3}</Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={resetWizard} className="rounded-xl text-slate-600 hover:text-slate-800">
                    <ArrowLeft className="mr-2" size={18} />
                    Back
                  </Button>
                  <div className="flex gap-3">
                    {preview.issues.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setStep("issues")}
                        className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        <AlertCircle className="mr-2" size={16} />
                        Review Issues ({preview.issues.length})
                      </Button>
                    )}
                    <Button
                      variant="success"
                      size="lg"
                      onClick={handleImport}
                      disabled={isLoading}
                      className="rounded-xl"
                    >
                      {isLoading ? "Importing..." : "Import All"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Issues */}
          {step === "issues" && preview && (
            <Card className="border-slate-200/80 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-100 px-6 py-5">
                <CardTitle className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                  <AlertCircle className="text-amber-600" size={20} />
                  Review Issues ({preview.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <p className="text-slate-600 text-sm leading-relaxed">
                  The following rows have issues. Rows with missing required fields will be skipped during import.
                  You can fix them in your spreadsheet and re-upload, or proceed anyway.
                </p>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Row</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Issue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.issues.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                            No issues found
                          </td>
                        </tr>
                      ) : (
                        preview.issues.map((issue: ImportIssue, i: number) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-500 text-xs">{issue.row}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={issue.type === "collision" ? "warning" : "destructive"}
                                className="text-xs"
                              >
                                {issue.type.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{issue.message}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep("preview")} className="rounded-xl text-slate-600 hover:text-slate-800">
                    <ArrowLeft className="mr-2" size={18} />
                    Back
                  </Button>
                  <Button
                    variant="default"
                    size="lg"
                    onClick={handleImport}
                    disabled={isLoading}
                    className="rounded-xl"
                  >
                    {isLoading ? "Importing..." : "Import Anyway"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Complete */}
          {step === "complete" && result && (
            <Card className="border-slate-200/80 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100 px-6 py-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="text-white" size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold text-emerald-800">Import Complete</CardTitle>
                    <p className="text-emerald-600 text-sm mt-0.5">Your data has been successfully imported</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-5 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl border border-emerald-200/50">
                    <p className="text-3xl font-bold text-emerald-600">{result.imported}</p>
                    <p className="text-sm text-emerald-600/70 mt-1">New Entries</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl border border-blue-200/50">
                    <p className="text-3xl font-bold text-blue-600">{result.updated}</p>
                    <p className="text-sm text-blue-600/70 mt-1">Updated</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200/50">
                    <p className="text-3xl font-bold text-slate-500">{result.skipped}</p>
                    <p className="text-sm text-slate-500 mt-1">Skipped</p>
                  </div>
                </div>

                {result.issues.length > 0 && (
                  <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl">
                    <p className="font-semibold text-amber-800 mb-2 text-sm">
                      {result.issues.length} rows had issues and were skipped
                    </p>
                    <details className="text-sm">
                      <summary className="cursor-pointer text-amber-700 hover:text-amber-800 font-medium">
                        View details
                      </summary>
                      <ul className="mt-3 space-y-1.5 text-amber-700">
                        {result.issues.slice(0, 10).map((issue, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">Row {issue.row}</span>
                            <span className="text-sm">{issue.message}</span>
                          </li>
                        ))}
                        {result.issues.length > 10 && (
                          <li className="text-amber-600 italic">...and {result.issues.length - 10} more</li>
                        )}
                      </ul>
                    </details>
                  </div>
                )}

                <div className="flex justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={resetWizard}
                    className="rounded-xl border-slate-300 hover:border-teal-400 hover:bg-teal-50"
                  >
                    <Upload className="mr-2" size={18} />
                    Import Another
                  </Button>
                  <Link to="/">
                    <Button variant="ghost" size="lg" className="rounded-xl text-slate-600 hover:text-slate-800">
                      Back to Home
                    </Button>
                  </Link>
                  <Link to="/search">
                    <Button size="lg" className="rounded-xl">
                      <Sparkles className="mr-2" size={18} />
                      Search Library
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-8 shadow-2xl shadow-slate-900/20 text-center max-w-sm mx-4">
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
                </div>
                <p className="text-lg font-semibold text-slate-800">Processing...</p>
                <p className="text-sm text-slate-500 mt-1">This may take a moment</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
