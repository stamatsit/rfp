import { useState, useEffect, useCallback } from "react"
import { rfpApi, type ScanCriterion, type ScanCriterionSnapshot } from "@/lib/api"

export function useScanCriteria() {
  const [defaults, setDefaults] = useState<ScanCriterion[]>([])
  const [custom, setCustom] = useState<ScanCriterion[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await rfpApi.getScanCriteria()
      setDefaults(result.defaults)
      setCustom(result.criteria)
    } catch (err) {
      console.error("Failed to load scan criteria:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addCriterion = async (label: string, description?: string) => {
    const row = await rfpApi.addScanCriterion({ label, description })
    setCustom((prev) => [...prev, row])
    return row
  }

  const removeCriterion = async (id: string) => {
    await rfpApi.deleteScanCriterion(id)
    setCustom((prev) => prev.filter((c) => c.id !== id))
  }

  // Get all active criteria as snapshots for the scan API
  const getActiveCriteria = useCallback((): ScanCriterionSnapshot[] => {
    return [...defaults, ...custom]
      .filter((c) => c.isActive)
      .map((c) => ({ id: c.id, label: c.label, description: c.description || undefined }))
  }, [defaults, custom])

  return {
    defaults,
    custom,
    isLoading,
    addCriterion,
    removeCriterion,
    getActiveCriteria,
    reload: load,
  }
}
