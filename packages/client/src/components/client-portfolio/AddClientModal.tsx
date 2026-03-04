import { useState, useEffect, useRef } from "react"
import { Building2, X, Loader2 } from "lucide-react"
import { clientsApi, type ClientResponse } from "@/lib/api"

const SECTOR_LABELS: Record<string, string> = {
  "higher-ed": "Higher Ed",
  healthcare: "Healthcare",
  other: "Other",
}

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all duration-200"
const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"

interface AddClientModalProps {
  client: ClientResponse | null
  onClose: () => void
  onSaved: (c: ClientResponse) => void
}

export function AddClientModal({ client, onClose, onSaved }: AddClientModalProps) {
  const [name, setName] = useState(client?.name || "")
  const [sector, setSector] = useState<"higher-ed" | "healthcare" | "other">(client?.sector || "higher-ed")
  const [notes, setNotes] = useState(client?.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError("Institution name is required"); return }
    setSaving(true)
    setError(null)
    try {
      const data = { name: name.trim(), sector, notes: notes.trim() || undefined }
      const saved = client ? await clientsApi.update(client.id, data) : await clientsApi.create(data)
      onSaved(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save client")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md mx-4 border border-slate-200/60 dark:border-slate-700/60"
        style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.03), 0 8px 32px rgb(0 0 0 / 0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)" }}>
              <Building2 size={15} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {client ? "Edit Client" : "Add Client"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>Institution Name <span className="text-red-500">*</span></label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g., University of Vermont"
              required
            />
          </div>

          <div>
            <label className={labelCls}>Sector</label>
            <div className="flex gap-2">
              {(["higher-ed", "healthcare", "other"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSector(s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    sector === s
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  {SECTOR_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Internal context about this client…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-sm font-medium text-white shadow-sm transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Saving…" : client ? "Save Changes" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
