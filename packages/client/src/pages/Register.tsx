import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowRight, Lock, Mail, User } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

export default function Register() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated, checkAuth } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setAuthenticated(true)
        await checkAuth()
        navigate("/")
      } else {
        setError(data.error || "Registration failed")
      }
    } catch {
      setError("Unable to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  const isFormValid = firstName.trim() && lastName.trim() && email && password && confirmPassword && password.length >= 8

  const inputClass = (hasError: boolean) => `
    w-full pl-12 pr-4 h-[52px] rounded-xl
    bg-white dark:bg-slate-800
    border ${hasError ? 'border-red-300' : 'border-transparent dark:border-slate-700'}
    text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
    text-[16px]
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-blue-500/30
  `

  const inputShadow = {
    boxShadow: error
      ? 'none'
      : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-slate-950 transition-colors px-6">
      <div className="w-full max-w-[340px]">
        {/* Header */}
        <div className="text-center mb-10">
          <img
            src="/stamats-logo.png"
            alt="Stamats"
            className="w-16 h-16 mx-auto mb-6 object-contain"
          />
          <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">
            Create account
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">
            Join the content library
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <User
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                autoFocus
                autoComplete="given-name"
                className={inputClass(!!error)}
                style={inputShadow}
              />
            </div>
            <div className="relative flex-1">
              <User
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
                className={inputClass(!!error)}
                style={inputShadow}
              />
            </div>
          </div>

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
              autoComplete="email"
              className={inputClass(!!error)}
              style={inputShadow}
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
              placeholder="Password (min 8 characters)"
              autoComplete="new-password"
              className={inputClass(!!error)}
              style={inputShadow}
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              className={inputClass(!!error)}
              style={inputShadow}
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-600 text-center">
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
              transition-all duration-200
              ${isLoading || !isFormValid
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]'
              }
            `}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Create account
                <ArrowRight size={18} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[14px] text-slate-500 dark:text-slate-400 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Sign in
          </Link>
        </p>

        <p className="text-center text-[12px] text-slate-400 mt-10">
          &copy; {new Date().getFullYear()} Stamats
        </p>
      </div>
    </div>
  )
}
