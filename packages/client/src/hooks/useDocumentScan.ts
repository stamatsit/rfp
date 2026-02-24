import { useState, useCallback, useRef } from "react"
import { rfpApi, type ScanFlag, type ScanResponse, type ScanCriterionSnapshot } from "@/lib/api"

interface ScanParams {
  documentId?: string
  documentText: string
  documentType: "RFP" | "Proposal"
  criteria: ScanCriterionSnapshot[]
  originalFilename?: string
  mimeType?: string
  fileSize?: number
  pageCount?: number
  name?: string
}

export function useDocumentScan() {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null)
  const [flags, setFlags] = useState<ScanFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const scan = useCallback(async (params: ScanParams) => {
    setIsScanning(true)
    setError(null)
    try {
      const result = await rfpApi.scan(params)
      setScanResult(result)
      setFlags(result.flags)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed"
      setError(msg)
      throw err
    } finally {
      setIsScanning(false)
    }
  }, [])

  const persistFlags = useCallback((documentId: string, updatedFlags: ScanFlag[]) => {
    // Debounce persistence
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      rfpApi.updateFlags(documentId, updatedFlags).catch(console.error)
    }, 800)
  }, [])

  const dismissFlag = useCallback((flagId: string, documentId?: string) => {
    setFlags((prev) => {
      const updated = prev.map((f) => f.id === flagId ? { ...f, dismissed: true } : f)
      if (documentId) persistFlags(documentId, updated)
      return updated
    })
  }, [persistFlags])

  const restoreFlag = useCallback((flagId: string, documentId?: string) => {
    setFlags((prev) => {
      const updated = prev.map((f) => f.id === flagId ? { ...f, dismissed: false } : f)
      if (documentId) persistFlags(documentId, updated)
      return updated
    })
  }, [persistFlags])

  const addNote = useCallback((flagId: string, note: string, documentId?: string) => {
    setFlags((prev) => {
      const updated = prev.map((f) => f.id === flagId ? { ...f, note } : f)
      if (documentId) persistFlags(documentId, updated)
      return updated
    })
  }, [persistFlags])

  const loadFromDocument = useCallback((scanFlags: ScanFlag[], result?: Partial<ScanResponse>) => {
    setFlags(scanFlags)
    if (result) {
      setScanResult({
        documentId: result.documentId || "",
        flags: scanFlags,
        summary: result.summary || "",
        scannedAt: result.scannedAt || "",
      })
    }
  }, [])

  const reset = useCallback(() => {
    setScanResult(null)
    setFlags([])
    setError(null)
  }, [])

  return {
    isScanning,
    scanResult,
    flags,
    error,
    scan,
    dismissFlag,
    restoreFlag,
    addNote,
    loadFromDocument,
    reset,
  }
}
