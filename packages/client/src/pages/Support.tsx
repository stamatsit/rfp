import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Send, CheckCircle, Mail } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Button } from "@/components/ui"

export function Support() {
  const [message, setMessage] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    // Create mailto link and open it
    const subject = encodeURIComponent("Content Library Support Request")
    const body = encodeURIComponent(message)
    window.location.href = `mailto:eric.yerke@stamats.com?subject=${subject}&body=${body}`

    setSubmitted(true)
  }

  const handleReset = () => {
    setMessage("")
    setSubmitted(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
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
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Mail className="text-blue-600" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Get Support</h1>
                <p className="text-slate-500">Send us a message and we'll get back to you</p>
              </div>
            </div>

            {submitted ? (
              /* Success State */
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="text-green-600" size={32} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Email Client Opened
                </h2>
                <p className="text-slate-500 mb-6">
                  Your default email client should have opened with your message.
                  <br />
                  Send the email to complete your support request.
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
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      Your Message
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe what you need help with..."
                      rows={8}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                               transition-colors resize-none text-slate-900
                               placeholder:text-slate-400"
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={!message.trim()}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Send size={18} />
                      Send Message
                    </Button>
                  </div>

                  <p className="text-xs text-slate-400 text-center">
                    This will open your email client to send a message to our support team.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-6 border-t border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} Stamats
          </p>
        </div>
      </footer>
    </div>
  )
}
