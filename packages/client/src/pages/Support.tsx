import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Send, CheckCircle, Mail, Loader2 } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button } from "@/components/ui"
import { feedbackApi } from "@/lib/api"

export function Support() {
  const [message, setMessage] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setIsSubmitting(true)
    setError("")

    try {
      await feedbackApi.submit({
        messageId: `support-${Date.now()}`,
        score: "up",
        page: "support",
        query: message.trim(),
      })
      setSubmitted(true)
    } catch {
      setError("Failed to send message. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setMessage("")
    setSubmitted(false)
    setError("")
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Back Navigation */}
      <div className="px-6 pt-6">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Get Support</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Send us a message and we'll get back to you</p>
              </div>
            </div>

            {submitted ? (
              /* Success State */
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={32} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Message Sent
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">
                  Your support request has been received. We'll follow up soon.
                </p>
                <Button onClick={handleReset} variant="outline">
                  Send Another Message
                </Button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                    >
                      Your Message
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe what you need help with..."
                      rows={8}
                      className="w-full px-4 py-3 border border-slate-200/80 dark:border-slate-700 rounded-xl
                               bg-white dark:bg-slate-800
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                               transition-all duration-200 resize-none text-slate-900 dark:text-white
                               placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={!message.trim() || isSubmitting}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Send size={18} />
                      )}
                      {isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 px-6 border-t border-slate-200/40 dark:border-slate-800/40 bg-white/60 dark:bg-slate-900/60 transition-colors">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[13px] text-slate-400 dark:text-slate-500 transition-colors">
            &copy; {new Date().getFullYear()} Stamats
          </p>
        </div>
      </footer>
    </div>
  )
}
