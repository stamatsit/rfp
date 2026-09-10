/**
 * Client Portal admin (staff side). Any signed-in Stamats user can create a
 * client workspace, invite client users, approve an institution email domain,
 * and see what a client has stored. Talks to /api/portal/admin/* with the
 * internal session.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Check, Copy, Globe, Mail, Plus, RefreshCw, Search, ShieldOff, ShieldCheck, Users } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { addCsrfHeader } from "@/lib/csrfToken"
import { toast } from "@/hooks/useToast"

interface ClientRow { id: string; name: string; status: string; user_count: number; domain_count: number; image_count: number }
interface PortalUser { id: string; email: string; name: string | null; status: "invited" | "active" | "disabled"; invited_by: string | null; invited_at: string; accepted_at: string | null; last_login_at: string | null; invite_live: boolean | null }
interface Domain { id: string; domain: string; created_by: string | null; created_at: string }
interface Detail { client: { id: string; name: string; status: string }; users: PortalUser[]; domains: Domain[]; imageCount: number; emailConfigured: boolean }

async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  const mutating = init.method && init.method !== "GET"
  const finalHeaders = mutating ? await addCsrfHeader(headers) : headers
  const res = await fetch(`/api/portal/admin${path}`, { credentials: "include", ...init, headers: finalHeaders })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

function fmtDate(v: string | null): string {
  return v ? new Date(v).toLocaleDateString() : "never"
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500) }} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#C41230] hover:underline">
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : "Copy invite link"}
    </button>
  )
}

export function PortalAdmin() {
  useDocumentTitle("Client Portal")
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [newClient, setNewClient] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [lastInvite, setLastInvite] = useState<{ email: string; inviteUrl: string; emailed: boolean } | null>(null)
  const [domainInput, setDomainInput] = useState("")
  const [busy, setBusy] = useState(false)

  const loadClients = useCallback(async () => {
    try { setClients((await adminJson<{ clients: ClientRow[] }>("/clients")).clients) }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not load clients") }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await adminJson<Detail>(`/clients/${id}`)) }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not load client") }
  }, [])

  useEffect(() => { void loadClients() }, [loadClients])
  useEffect(() => { setLastInvite(null); if (selectedId) void loadDetail(selectedId); else setDetail(null) }, [selectedId, loadDetail])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (clients ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [clients, query])

  const refreshAll = async () => { await loadClients(); if (selectedId) await loadDetail(selectedId) }

  const createClient = async (e: FormEvent) => {
    e.preventDefault()
    if (!newClient.trim()) return
    setBusy(true)
    try {
      const d = await adminJson<{ client: { id: string } }>("/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newClient.trim() }) })
      setNewClient("")
      await loadClients()
      setSelectedId(d.client.id)
      toast.success("Client created")
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not create client") }
    finally { setBusy(false) }
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedId || !inviteEmail.trim()) return
    setBusy(true)
    try {
      const d = await adminJson<{ email: string; inviteUrl: string; emailed: boolean }>(`/clients/${selectedId}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail.trim() }) })
      setLastInvite(d)
      setInviteEmail("")
      toast.success(d.emailed ? `Invitation emailed to ${d.email}` : "Invite created. Email isn't configured, so copy the link.")
      await refreshAll()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Invite failed") }
    finally { setBusy(false) }
  }

  const userAction = async (u: PortalUser, action: "revoke" | "restore" | "resend") => {
    if (action === "revoke" && !window.confirm(`Remove access for ${u.email}?`)) return
    setBusy(true)
    try {
      const d = await adminJson<{ inviteUrl?: string; emailed?: boolean }>(`/users/${u.id}/${action}`, { method: "POST" })
      if (action === "resend" && d.inviteUrl) { setLastInvite({ email: u.email, inviteUrl: d.inviteUrl, emailed: !!d.emailed }); toast.success(d.emailed ? "Invitation re-sent" : "New link ready to copy") }
      else toast.success(action === "revoke" ? "Access removed" : "Access restored")
      await refreshAll()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Action failed") }
    finally { setBusy(false) }
  }

  const addDomain = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedId || !domainInput.trim()) return
    setBusy(true)
    try {
      await adminJson(`/clients/${selectedId}/domains`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domainInput.trim() }) })
      setDomainInput("")
      toast.success("Domain approved")
      await refreshAll()
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not add domain") }
    finally { setBusy(false) }
  }

  const removeDomain = async (d: Domain) => {
    if (!selectedId || !window.confirm(`Stop allowing @${d.domain} to sign up?`)) return
    try { await adminJson(`/clients/${selectedId}/domains/${d.id}`, { method: "DELETE" }); await refreshAll() }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not remove domain") }
  }

  const inputCls = "h-9 px-3 rounded-lg text-[13px] bg-white dark:bg-slate-800 border border-black/[0.1] dark:border-white/[0.1] outline-none focus:border-[#C41230]/60 dark:text-white"
  const btn = "h-9 px-3 rounded-lg text-[13px] font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 disabled:opacity-50 inline-flex items-center gap-1.5"
  const card = "bg-white dark:bg-slate-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-sm"
  const portalUrl = `${window.location.origin}/portal/login`

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900">
      <AppHeader />
      <main className="flex-1 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#C41230] flex items-center justify-center shadow-lg shadow-[#C41230]/20"><Users size={20} className="text-white" /></div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Client Portal</h1>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">Invite clients to the Image Toolkit. They sign in at <span className="font-mono">{portalUrl}</span> and see nothing else.</p>
            </div>
            <button type="button" onClick={refreshAll} className="h-9 w-9 rounded-lg border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-500" aria-label="Refresh"><RefreshCw size={14} /></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
            <div className={`${card} p-4`}>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" className={`${inputCls} w-full pl-8`} />
              </div>
              <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1 space-y-0.5">
                {clients === null && <p className="text-[12px] text-slate-500 px-2 py-2">Loading...</p>}
                {filtered.map((c) => (
                  <button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedId === c.id ? "bg-[#C41230]/10 text-[#C41230]" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100"}`}>
                    <p className="text-[13px] font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.user_count} user{c.user_count === 1 ? "" : "s"} · {c.domain_count} domain{c.domain_count === 1 ? "" : "s"} · {c.image_count} image{c.image_count === 1 ? "" : "s"}{c.status !== "active" ? ` · ${c.status}` : ""}</p>
                  </button>
                ))}
                {clients && filtered.length === 0 && <p className="text-[12px] text-slate-500 px-2 py-2">No clients match.</p>}
              </div>
              <form onSubmit={createClient} className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <input value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="New client name" className={`${inputCls} flex-1 min-w-0`} />
                <button type="submit" className={btn} disabled={busy || !newClient.trim()}><Plus size={14} /> Add</button>
              </form>
            </div>

            {!detail ? (
              <div className={`${card} p-8 text-center text-[13px] text-slate-500 dark:text-slate-400`}>Pick a client on the left, or add a new one.</div>
            ) : (
              <div className="space-y-5">
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{detail.client.name}</h2>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">{detail.imageCount} stored image{detail.imageCount === 1 ? "" : "s"} · invites are {detail.emailConfigured ? "emailed from noreply@stamats.com" : "NOT emailed (email not configured): copy the link and send it yourself"}</p>
                    </div>
                  </div>
                  <form onSubmit={invite} className="flex items-center gap-2">
                    <Mail size={14} className="text-slate-400" />
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@university.edu" className={`${inputCls} flex-1`} required />
                    <button type="submit" className={btn} disabled={busy || !inviteEmail.trim()}>Invite</button>
                  </form>
                  {lastInvite && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-[12px] text-slate-700 dark:text-slate-200 flex items-center justify-between gap-3">
                      <span>{lastInvite.emailed ? `Emailed ${lastInvite.email}. ` : `Link for ${lastInvite.email}, expires in 7 days. `}You can also send the link yourself.</span>
                      <CopyLink url={lastInvite.inviteUrl} />
                    </div>
                  )}
                </div>

                <div className={`${card} p-5`}>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white mb-2">People</h3>
                  {detail.users.length === 0 && <p className="text-[12px] text-slate-500 dark:text-slate-400">No one invited yet.</p>}
                  <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    {detail.users.map((u) => (
                      <div key={u.id} className="py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{u.name || u.email}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email} · {u.status === "active" ? `active, last sign-in ${fmtDate(u.last_login_at)}` : u.status === "invited" ? `invited ${fmtDate(u.invited_at)} by ${u.invited_by || "unknown"}${u.invite_live ? "" : " (link expired)"}` : "access removed"}</p>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${u.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : u.status === "invited" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{u.status}</span>
                        {u.status === "invited" && <button type="button" onClick={() => userAction(u, "resend")} disabled={busy} className="text-[12px] font-medium text-[#C41230] hover:underline">Resend</button>}
                        {u.status !== "disabled" ? (
                          <button type="button" onClick={() => userAction(u, "revoke")} disabled={busy} aria-label="Remove access" className="text-slate-400 hover:text-red-600"><ShieldOff size={14} /></button>
                        ) : (
                          <button type="button" onClick={() => userAction(u, "restore")} disabled={busy} aria-label="Restore access" className="text-slate-400 hover:text-emerald-600"><ShieldCheck size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${card} p-5`}>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">Whole institution access</h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">Anyone with an email at an approved domain can sign up on their own and lands in this workspace.</p>
                  <form onSubmit={addDomain} className="flex items-center gap-2 mb-3">
                    <Globe size={14} className="text-slate-400" />
                    <input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="university.edu" className={`${inputCls} flex-1`} />
                    <button type="submit" className={btn} disabled={busy || !domainInput.trim()}>Approve domain</button>
                  </form>
                  {detail.domains.length === 0 && <p className="text-[12px] text-slate-500 dark:text-slate-400">No domains approved. Only invited people can sign in.</p>}
                  <div className="flex flex-wrap gap-2">
                    {detail.domains.map((d) => (
                      <span key={d.id} className="inline-flex items-center gap-2 text-[12px] font-mono px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        @{d.domain}
                        <button type="button" onClick={() => removeDomain(d)} aria-label={`Remove ${d.domain}`} className="text-slate-400 hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
