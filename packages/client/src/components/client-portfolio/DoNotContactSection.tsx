import { useState } from "react"
import { ShieldAlert, Plus, ArrowRightLeft, Trash2, Mail } from "lucide-react"
import { doNotContactApi, clientsApi, type DoNotContactEntry, type ClientResponse } from "@/lib/api"
import { useClientData } from "./ClientPortfolioContext"
import { DoNotContactDialog } from "./DoNotContactDialog"
import { AddClientModal } from "./AddClientModal"

export function DoNotContactSection() {
  const { dncEntries, setDncEntries, dncLoading, isAdmin, refreshDnc, dbClients, setDbClients } = useClientData()
  const [showDialog, setShowDialog] = useState(false)
  const [moveTarget, setMoveTarget] = useState<DoNotContactEntry | null>(null)
  const [moveExistingClient, setMoveExistingClient] = useState<ClientResponse | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleAdded = (entry: DoNotContactEntry) => {
    setDncEntries(prev => [...prev, entry])
    setShowDialog(false)
  }

  const handleDelete = async (entry: DoNotContactEntry) => {
    if (!confirm(`Remove "${entry.institution}" from Do Not Contact?\n\nThis will be logged in the audit trail. Historical webinar imports tagged DNC stay tagged until re-categorized.`)) return
    setBusyId(entry.id)
    try {
      await doNotContactApi.delete(entry.id)
      setDncEntries(prev => prev.filter(e => e.id !== entry.id))
    } catch (err) {
      alert(`Failed to remove: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleMoveToClient = (entry: DoNotContactEntry) => {
    // If a client already owns this domain, edit them. Otherwise create new.
    const existing = dbClients.find(c => c.emailDomains.includes(entry.domain))
    setMoveTarget(entry)
    setMoveExistingClient(existing ?? null)
  }

  const handleClientSavedFromMove = async (saved: ClientResponse) => {
    if (!moveTarget) return
    // Append the DNC entry's domain to the saved client if missing (only happens for existing-client case)
    const needsDomain = !saved.emailDomains.includes(moveTarget.domain)
    let final = saved
    if (needsDomain) {
      final = await clientsApi.update(saved.id, {
        name: saved.name,
        sector: saved.sector,
        notes: saved.notes ?? undefined,
        status: saved.status,
        emailDomains: [...saved.emailDomains, moveTarget.domain],
      })
    }
    // Update / insert client in local state
    setDbClients(prev => {
      const idx = prev.findIndex(c => c.id === final.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = final
        return next
      }
      return [...prev, final]
    })
    // Delete the DNC entry
    try {
      await doNotContactApi.delete(moveTarget.id)
      setDncEntries(prev => prev.filter(e => e.id !== moveTarget.id))
    } catch (err) {
      alert(`Client saved, but failed to remove DNC entry: ${err instanceof Error ? err.message : "unknown"}`)
      // Best-effort refresh
      refreshDnc()
    }
    setMoveTarget(null)
    setMoveExistingClient(null)
  }

  const handleMoveToNonClient = async (entry: DoNotContactEntry) => {
    if (!confirm(`Move "${entry.institution}" to Non-Client? This deletes the DNC entry (audit-logged) so they re-enter the outreach pool on the next re-categorize.`)) return
    setBusyId(entry.id)
    try {
      await doNotContactApi.delete(entry.id)
      setDncEntries(prev => prev.filter(e => e.id !== entry.id))
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : "unknown"}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Do Not Contact
            <span className="ml-2 text-sm font-normal text-slate-500">({dncEntries.length})</span>
          </h3>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors flex-shrink-0"
          >
            <Plus size={12} />
            Add
          </button>
        )}
      </div>

      {dncLoading ? (
        <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">Loading…</div>
      ) : dncEntries.length === 0 ? (
        <div className="px-4 py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
          No suppressed organizations.
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
          {dncEntries.map(entry => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{entry.institution}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    @{entry.domain}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Mail size={11} />
                  <span className="truncate">{entry.email}</span>
                </div>
                {entry.comment && (
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 italic">"{entry.comment}"</p>
                )}
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  Added {new Date(entry.createdAt).toLocaleDateString()} by {entry.createdBy}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMoveToClient(entry)}
                    disabled={busyId === entry.id}
                    className="px-2 py-1 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                    title="Move to Client"
                  >
                    <ArrowRightLeft size={12} className="inline mr-1" />
                    Client
                  </button>
                  <button
                    onClick={() => handleMoveToNonClient(entry)}
                    disabled={busyId === entry.id}
                    className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                    title="Move to Non-Client (deletes DNC entry)"
                  >
                    Non-Client
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={busyId === entry.id}
                    className="p-1 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Delete (audit-logged)"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showDialog && (
        <DoNotContactDialog
          onClose={() => setShowDialog(false)}
          onSaved={handleAdded}
        />
      )}

      {moveTarget && (
        <AddClientModal
          client={moveExistingClient}
          defaults={{
            name: moveTarget.institution,
            emailDomains: moveExistingClient ? undefined : [moveTarget.domain],
          }}
          onClose={() => { setMoveTarget(null); setMoveExistingClient(null) }}
          onSaved={handleClientSavedFromMove}
        />
      )}
    </div>
  )
}
