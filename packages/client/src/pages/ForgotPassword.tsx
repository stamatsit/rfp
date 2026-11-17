import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ArrowLeft, Mail, KeyRound, MailCheck } from "lucide-react"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"

const inputClass =
  "w-full pl-12 pr-4 h-[52px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
const linkClass =
  "text-blue-600 dark:text-blue-400 hover:underline font-medium rounded focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"

export default function ForgotPassword() {
  useDocumentTitle("Reset Password")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setSent(true)
      } else {
        setError(data.error || "Something went wrong. Please try again.")
      }
    } catch {
      setError("Unable to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-slate-950 transition-colors animate-fade-in">
      <div className="w-full max-w-[380px] px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
            {sent ? (
              <MailCheck size={28} className="text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
            ) : (
              <KeyRound size={28} className="text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
            )}
          </div>
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">
            {sent ? "Check your email" : "Forgot password?"}
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">
            {sent
              ? "If an account exists for that email, a reset link is on its way. It expires in 1 hour."
              : "Enter your Stamats email and we'll send you a link to choose a new password."}
          </p>
        </div>

        {!sent && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <label htmlFor="fp-email" className="sr-only">Email</label>
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" strokeWidth={1.75} />
              <input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                autoComplete="email"
                className={inputClass}
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)" }}
              />
            </div>

            {error && <p className="text-[13px] text-red-600 text-center animate-fade-in-up">{error}</p>}

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className={`
                w-full h-[52px] rounded-xl
                font-semibold text-[15px]
                flex items-center justify-center gap-2
                transition-all duration-150 ease-out
                focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950
                ${isLoading || !email.trim()
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-600 cursor-not-allowed disabled:opacity-50"
                  : "bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 active:scale-[0.97] shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
                }
              `}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Send reset link
                  <ArrowRight size={18} strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        )}

        <p className="text-center text-[14px] text-slate-500 dark:text-slate-400 mt-6">
          <Link to="/login" className={`${linkClass} inline-flex items-center gap-1.5`}>
            <ArrowLeft size={14} strokeWidth={2} />
            Back to sign in
          </Link>
        </p>

        <p className="text-center text-[12px] text-slate-500 mt-10">
          &copy; {new Date().getFullYear()} Stamats
        </p>
      </div>
    </div>
  )
}
