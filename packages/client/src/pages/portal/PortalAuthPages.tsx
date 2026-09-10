/**
 * Portal sign-in, self sign-up by approved domain, forgot password, and the
 * invite / reset acceptance page. All talk to /api/portal only.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom"
import { ImageDown } from "lucide-react"
import { portalJson, usePortalAuth } from "@/contexts/PortalAuthContext"

function Frame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#C41230] flex items-center justify-center"><ImageDown size={18} className="text-white" strokeWidth={2.25} /></div>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Stamats Image Toolkit</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Convert, crop, enhance, erase, remove backgrounds</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-sm p-6">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 mb-4">{subtitle}</p>}
          {children}
        </div>
        {footer && <div className="text-[12px] text-slate-500 dark:text-slate-400 text-center mt-4 space-x-3">{footer}</div>}
      </div>
    </div>
  )
}

const input = "w-full h-10 px-3 rounded-lg text-[14px] bg-white dark:bg-slate-800 border border-black/[0.1] dark:border-white/[0.1] outline-none focus:border-[#C41230]/60 dark:text-white"
const label = "block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1"
const primary = "w-full h-10 rounded-lg bg-[#C41230] hover:bg-[#a30f28] text-white text-[14px] font-medium disabled:opacity-50"
const link = "text-[#C41230] hover:underline"

export function PortalLogin() {
  const { isAuthenticated, isLoading, login } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const from = (location.state as { from?: string } | null)?.from
  const dest = from && from.startsWith("/portal") ? from : "/portal"

  if (!isLoading && isAuthenticated) return <Navigate to={dest} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await login(email, password); navigate(dest, { replace: true }) }
    catch (err) { setError(err instanceof Error ? err.message : "Sign in failed") }
    finally { setBusy(false) }
  }

  return (
    <Frame title="Sign in" subtitle="Use the email address your invitation was sent to." footer={<><Link to="/portal/forgot" className={link}>Forgot password?</Link><span>·</span><Link to="/portal/signup" className={link}>Sign up with an approved email</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label} htmlFor="p-email">Email</label><input id="p-email" className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className={label} htmlFor="p-pass">Password</label><input id="p-pass" className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button type="submit" className={primary} disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </Frame>
  )
}

export function PortalSignup() {
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    try {
      const data = await portalJson<{ message: string }>("/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
      setMsg(data.message)
    } catch (err) { setError(err instanceof Error ? err.message : "Sign up failed") }
    finally { setBusy(false) }
  }
  return (
    <Frame title="Sign up" subtitle="If your organization's email domain is approved, we'll email you a link to set a password." footer={<Link to="/portal/login" className={link}>Back to sign in</Link>}>
      {msg ? <p className="text-[14px] text-slate-700 dark:text-slate-200">{msg}</p> : (
        <form onSubmit={submit} className="space-y-3">
          <div><label className={label} htmlFor="s-email">Work email</label><input id="s-email" className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <button type="submit" className={primary} disabled={busy}>{busy ? "Sending..." : "Send me a link"}</button>
        </form>
      )}
    </Frame>
  )
}

export function PortalForgot() {
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const data = await portalJson<{ message: string }>("/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
      setMsg(data.message)
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed") }
    finally { setBusy(false) }
  }
  return (
    <Frame title="Reset your password" subtitle="Enter your email and we'll send a link to choose a new password." footer={<Link to="/portal/login" className={link}>Back to sign in</Link>}>
      {msg ? <p className="text-[14px] text-slate-700 dark:text-slate-200">{msg}</p> : (
        <form onSubmit={submit} className="space-y-3">
          <div><label className={label} htmlFor="f-email">Email</label><input id="f-email" className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <button type="submit" className={primary} disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
        </form>
      )}
    </Frame>
  )
}

export function PortalInvite() {
  const { token = "" } = useParams()
  const { refresh } = usePortalAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState<{ email: string; name: string | null; clientName: string; purpose: "invite" | "reset" } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    portalJson<{ email: string; name: string | null; clientName: string; purpose: "invite" | "reset" }>(`/invite/${encodeURIComponent(token)}`)
      .then((d) => { if (alive) { setInfo(d); setName(d.name ?? "") } })
      .catch((err) => { if (alive) setLoadError(err instanceof Error ? err.message : "This link is invalid") })
    return () => { alive = false }
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match"); return }
    setBusy(true); setError(null)
    try {
      await portalJson(`/invite/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) })
      await refresh()
      navigate("/portal", { replace: true })
    } catch (err) { setError(err instanceof Error ? err.message : "Could not set your password") }
    finally { setBusy(false) }
  }

  if (loadError) {
    return (
      <Frame title="This link doesn't work" subtitle={loadError} footer={<Link to="/portal/login" className={link}>Go to sign in</Link>}>
        <p className="text-[13px] text-slate-600 dark:text-slate-300">Ask your Stamats contact to send a new invitation, or use "Forgot password" on the sign-in page if you already have an account.</p>
      </Frame>
    )
  }
  if (!info) return <Frame title="One moment"><p className="text-[13px] text-slate-500">Checking your link...</p></Frame>

  const isInvite = info.purpose === "invite"
  return (
    <Frame title={isInvite ? `Welcome to ${info.clientName}` : "Choose a new password"} subtitle={isInvite ? "Set a password to start using the Image Toolkit." : `For ${info.email}`}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label}>Email</label><input className={`${input} opacity-70`} value={info.email} disabled /></div>
        {isInvite && <div><label className={label} htmlFor="i-name">Your name</label><input id="i-name" className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
        <div><label className={label} htmlFor="i-pass">Password</label><input id="i-pass" className={input} type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <div><label className={label} htmlFor="i-confirm">Confirm password</label><input id="i-confirm" className={input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button type="submit" className={primary} disabled={busy}>{busy ? "Saving..." : isInvite ? "Create my account" : "Set new password"}</button>
      </form>
    </Frame>
  )
}
