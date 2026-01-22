import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Lock } from "lucide-react"

export default function Login() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        navigate("/")
      } else {
        setError(data.error || "Invalid password")
        setPassword("")
      }
    } catch {
      setError("Unable to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-[380px] px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <img
            src="/stamats-logo.png"
            alt="Stamats"
            className="w-16 h-16 mx-auto mb-6 object-contain"
          />
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">
            Welcome back
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">
            Sign in to your content library
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              className={`
                w-full pl-12 pr-4 h-[52px] rounded-xl
                bg-white dark:bg-slate-800
                border ${error ? 'border-red-300' : 'border-transparent dark:border-slate-700'}
                text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
                text-[16px]
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500/30
              `}
              style={{
                boxShadow: error
                  ? 'none'
                  : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)'
              }}
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-600 text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className={`
              w-full h-[52px] rounded-xl
              font-semibold text-[15px]
              flex items-center justify-center gap-2
              transition-all duration-200
              ${isLoading || !password
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]'
              }
            `}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight size={18} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-[12px] text-slate-400 mt-10">
          © {new Date().getFullYear()} Stamats
        </p>
      </div>
    </div>
  )
}
