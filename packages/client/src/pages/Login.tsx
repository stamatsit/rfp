import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowRight, Lock, Mail, Bot, TrendingUp, BookOpen, Search } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

const features = [
  { icon: Bot, text: "AI answers from your approved library" },
  { icon: TrendingUp, text: "Proposal analytics and win rates" },
  { icon: BookOpen, text: "Client success data at your fingertips" },
  { icon: Search, text: "Instant search across all content" },
]

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setAuthenticated(true)
        if (data.mustChangePassword) {
          navigate("/change-password")
        } else {
          navigate("/")
        }
      } else {
        setError(data.error || "Invalid credentials")
        setPassword("")
      }
    } catch {
      setError("Unable to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f5f5f7] dark:bg-slate-950 transition-colors">
      {/* Left — Feature showcase (hidden on mobile) */}
      <div
        className="hidden md:flex flex-1 relative overflow-hidden items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
        }}
      >
        {/* Ambient floating orbs */}
        <div
          className="absolute top-20 -left-20 w-80 h-80 rounded-full opacity-[0.12] blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #3B82F6, transparent 70%)', animationDelay: '0s' }}
        />
        <div
          className="absolute bottom-10 right-10 w-96 h-96 rounded-full opacity-[0.10] blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #8B5CF6, transparent 70%)', animationDelay: '1.5s' }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-[0.08] blur-3xl animate-float"
          style={{ background: 'radial-gradient(circle, #06B6D4, transparent 70%)', animationDelay: '3s' }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-[380px] px-10">
          <div className="mb-10">
            <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-[0.2em] mb-3 animate-fade-in">
              Stamats Content Platform
            </p>
            <h2 className="text-[32px] font-semibold text-white tracking-tight leading-tight animate-fade-in-up">
              Your AI-powered{" "}
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                content library
              </span>
            </h2>
            <p className="text-[15px] text-slate-400 mt-3 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              Proposals, client results, and approved content — organized, searchable, and AI-ready.
            </p>
          </div>

          <div className="space-y-4 stagger-children">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.text} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-blue-400" strokeWidth={1.75} />
                  </div>
                  <p className="text-[14px] text-slate-300 leading-snug">{feature.text}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-12 pt-8 border-t border-white/[0.06] animate-fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
            <p className="text-[12px] text-slate-500">
              AI-powered tools for agencies that win
            </p>
          </div>
        </div>
      </div>

      {/* Right — Sign-in form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[340px]">
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
              <Mail
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                autoComplete="email"
                className={`
                  w-full pl-12 pr-4 h-[52px] rounded-xl
                  bg-white dark:bg-slate-800
                  border ${error ? 'border-red-300' : 'border-slate-200/60 dark:border-slate-700'}
                  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
                  text-[16px]
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                `}
                style={{
                  boxShadow: error
                    ? 'none'
                    : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)'
                }}
              />
            </div>

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
                autoComplete="current-password"
                className={`
                  w-full pl-12 pr-4 h-[52px] rounded-xl
                  bg-white dark:bg-slate-800
                  border ${error ? 'border-red-300' : 'border-slate-200/60 dark:border-slate-700'}
                  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
                  text-[16px]
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
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
              disabled={isLoading || !email || !password}
              className={`
                w-full h-[52px] rounded-xl
                font-semibold text-[15px]
                flex items-center justify-center gap-2
                transition-all duration-200
                ${isLoading || !email || !password
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                }
              `}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={18} strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[14px] text-slate-500 dark:text-slate-400 mt-6">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Create one
            </Link>
          </p>

          <p className="text-center text-[12px] text-slate-400 mt-10">
            &copy; {new Date().getFullYear()} Stamats
          </p>
        </div>
      </div>
    </div>
  )
}
