import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Lock, KeyRound } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { checkAuth } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        await checkAuth()
        navigate("/")
      } else {
        setError(data.error || "Failed to change password")
      }
    } catch {
      setError("Unable to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  const isFormValid = currentPassword && newPassword && confirmPassword && newPassword.length >= 8

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-slate-950 transition-colors animate-fade-in">
      <div className="w-full max-w-[380px] px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
            <KeyRound size={28} className="text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">
            Change password
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">
            Choose a new password to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current password */}
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoFocus
              autoComplete="current-password"
              className="w-full pl-12 pr-4 h-[52px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
            />
          </div>

          {/* New password */}
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoComplete="new-password"
              className="w-full pl-12 pr-4 h-[52px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
            />
          </div>

          {/* Confirm password */}
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full pl-12 pr-4 h-[52px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-600 text-center animate-fade-in-up">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !isFormValid}
            className={`
              w-full h-[52px] rounded-xl
              font-semibold text-[15px]
              flex items-center justify-center gap-2
              transition-all duration-150 ease-out
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950
              ${isLoading || !isFormValid
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed disabled:opacity-50'
                : 'bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 active:scale-[0.97] shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
              }
            `}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Update password
                <ArrowRight size={18} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-[12px] text-slate-400 mt-10">
          &copy; {new Date().getFullYear()} Stamats
        </p>
      </div>
    </div>
  )
}
