import { useEffect, useRef, useState } from "react"
import { ShieldAlert, X, Loader2 } from "lucide-react"
import { doNotContactApi, type DoNotContactEntry } from "@/lib/api"
import { DOMAIN_RE } from "@/lib/domainRegex"

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all duration-200"
const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"

function extractDomain(email: string): string | null {
  if (!email) return null
  const at = email.indexOf("@")
  if (at < 0 || at === email.length - 1) return null
  const d = email.slice(at + 1).toLowerCase().trim()
  return DOMAIN_RE.test(d) ? d : null
}

export interface DoNotContactDialogProps {
  defaults?: { email?: string; institution?: string; clientId?: string }
  onClose: () => void
  onSaved: (entry: DoNotContactEntry) => void
}

export function DoNotContactDialog({ defaults, onClose, onSaved }: DoNotContactDialogProps) {
  const [email, setEmail] = useState(defaults?.email || "")
  const [institution, setInstitution] = useState(defaults?.institution || "")
  const [comment, setComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaults?.email) {
      // institution pre-filled — focus comment instead
      return
    }
    emailRef.current?.focus()
  }, [defaults?.email])

  const domain = extractDomain(email)
  const canSubmit = !!domain && institution.trim().length > 0 && !saving

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!domain) { setError("Enter a valid email address"); return }
    if (!institution.trim()) { setError("Institution name is required"); return }
    setSaving(true)
    setError(null)
    try {
      const saved = await doNotContactApi.create({
        email: email.trim(),
        institution: institution.trim(),
        comment: comment.trim() || undefined,
        clientId: defaults?.clientId,
      })
      onSaved(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add DNC entry")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md mx-4 border border-slate-200/60 dark:border-slate-700/60 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.03), 0 8px 32px rgb(0 0 0 / 0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 sticky top-0 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-red-600">
              <ShieldAlert size={15} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Add Organization to Do Not Contact
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
            <label className={labelCls}>
              Representative email at this organization <span className="text-red-500">*</span>
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              placeholder="e.g., contact@example.com"
              required
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              We store this email for record-keeping. <strong>Matching applies to the entire domain</strong> —
              anyone {domain ? <code>@{domain}</code> : <span>at this domain</span>} will be suppressed.
            </p>
          </div>

          <div>
            <label className={labelCls}>
              Institution name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={institution}
              onChange={e => setInstitution(e.target.value)}
              className={inputCls}
              placeholder="e.g., Acme University"
              required
            />
          </div>

          <div>
            <label className={labelCls}>
              Comment <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Why are they on the list? e.g., asked to be removed 2026-04-15"
            />
          </div>

          {domain && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-sm text-amber-800 dark:text-amber-300">
              <strong>Confirm:</strong> this will suppress all emails at <code>{domain}</code>.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-sm font-medium text-white shadow-sm transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Adding…" : "Add to Do Not Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
