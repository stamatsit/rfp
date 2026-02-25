import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom"
import { HomePage } from "./pages"
import Login from "./pages/Login"
import Register from "./pages/Register"
import ChangePassword from "./pages/ChangePassword"
import { AuthProvider } from "./contexts/AuthContext"
import { ThemeProvider } from "./contexts/ThemeContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { KeyboardShortcuts } from "./components/KeyboardShortcuts"
import { NewEntryPanel } from "./components/NewEntryPanel"
import { Toaster } from "./components/ui/toast"
import { AICompanion } from "./components/AICompanion"

// Lazy-load non-critical routes to reduce initial bundle size
const ImportWizard = lazy(() => import("./pages/ImportWizard").then(m => ({ default: m.ImportWizard })))
const PhotoUpload = lazy(() => import("./pages/PhotoUpload").then(m => ({ default: m.PhotoUpload })))
const SearchLibrary = lazy(() => import("./pages/SearchLibrary").then(m => ({ default: m.SearchLibrary })))
const ManualEntry = lazy(() => import("./pages/ManualEntry").then(m => ({ default: m.ManualEntry })))
const AskAI = lazy(() => import("./pages/AskAI").then(m => ({ default: m.AskAI })))
const RFPAnalyzer = lazy(() => import("./pages/RFPAnalyzer").then(m => ({ default: m.RFPAnalyzer })))

const Help = lazy(() => import("./pages/Help").then(m => ({ default: m.Help })))
const Support = lazy(() => import("./pages/Support").then(m => ({ default: m.Support })))
const ProposalInsights = lazy(() => import("./pages/ProposalInsights").then(m => ({ default: m.ProposalInsights })))
const CaseStudies = lazy(() => import("./pages/CaseStudies").then(m => ({ default: m.CaseStudies })))
const UnifiedAI = lazy(() => import("./pages/UnifiedAI").then(m => ({ default: m.UnifiedAI })))
const DocumentStudio = lazy(() => import("./pages/DocumentStudio").then(m => ({ default: m.DocumentStudio })))
const TestimonialManager = lazy(() => import("./pages/TestimonialManager").then(m => ({ default: m.TestimonialManager })))
const AIHumanizer = lazy(() => import("./pages/AIHumanizer").then(m => ({ default: m.AIHumanizer })))

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="animate-fade-in">
      {children}
    </div>
  )
}

function AppRoutes() {
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [newEntryDefaultType, setNewEntryDefaultType] = useState<string | undefined>()

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setNewEntryDefaultType(detail?.type || undefined)
      setShowNewEntry(true)
    }
    window.addEventListener("open-new-entry", handler)
    return () => window.removeEventListener("open-new-entry", handler)
  }, [])

  const handleNewEntrySaved = useCallback(() => {
    window.dispatchEvent(new CustomEvent("new-entry-saved"))
  }, [])

  return (
    <>
      <KeyboardShortcuts />
      <NewEntryPanel
        isOpen={showNewEntry}
        onClose={() => setShowNewEntry(false)}
        onSaved={handleNewEntrySaved}
        defaultType={newEntryDefaultType as any}
      />
      <PageTransition>
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/import" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
          <Route path="/photos" element={<ProtectedRoute><PhotoUpload /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchLibrary /></ProtectedRoute>} />
          <Route path="/new" element={<ProtectedRoute><ManualEntry /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AskAI /></ProtectedRoute>} />
          <Route path="/analyze" element={<ProtectedRoute><RFPAnalyzer /></ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/insights" element={<ProtectedRoute><ProposalInsights /></ProtectedRoute>} />
          <Route path="/case-studies" element={<ProtectedRoute><CaseStudies /></ProtectedRoute>} />
          <Route path="/unified-ai" element={<ProtectedRoute><UnifiedAI /></ProtectedRoute>} />
          <Route path="/studio" element={<ProtectedRoute><DocumentStudio /></ProtectedRoute>} />
          <Route path="/testimonials" element={<ProtectedRoute><TestimonialManager /></ProtectedRoute>} />
          <Route path="/humanize" element={<ProtectedRoute><AIHumanizer /></ProtectedRoute>} />
        </Routes>
        </Suspense>
      </PageTransition>
      <AICompanion />
      <Toaster />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
