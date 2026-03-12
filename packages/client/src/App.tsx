import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
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
import { CommandPalette } from "./components/CommandPalette"
import { NavRail } from "./components/NavRail"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { loadSettings } from "./components/SettingsPanel"

// Lazy-load non-critical routes to reduce initial bundle size
const ImportWizard = lazy(() => import("./pages/ImportWizard").then(m => ({ default: m.ImportWizard })))
const PhotoUpload = lazy(() => import("./pages/PhotoUpload").then(m => ({ default: m.PhotoUpload })))
const SearchLibrary = lazy(() => import("./pages/SearchLibrary").then(m => ({ default: m.SearchLibrary })))
const ManualEntry = lazy(() => import("./pages/ManualEntry").then(m => ({ default: m.ManualEntry })))
const AIHub = lazy(() => import("./pages/AIHub").then(m => ({ default: m.AIHub })))
const RFPAnalyzer = lazy(() => import("./pages/RFPAnalyzer").then(m => ({ default: m.RFPAnalyzer })))

const Help = lazy(() => import("./pages/Help").then(m => ({ default: m.Help })))
const Support = lazy(() => import("./pages/Support").then(m => ({ default: m.Support })))
const DocumentStudio = lazy(() => import("./pages/DocumentStudio").then(m => ({ default: m.DocumentStudio })))
const TestimonialManager = lazy(() => import("./pages/TestimonialManager").then(m => ({ default: m.TestimonialManager })))
const AIHumanizer = lazy(() => import("./pages/AIHumanizer").then(m => ({ default: m.AIHumanizer })))
const ClientPortfolio = lazy(() => import("./pages/ClientPortfolio").then(m => ({ default: m.ClientPortfolio })))
const ImageConverter = lazy(() => import("./pages/ImageConverter").then(m => ({ default: m.ImageConverter })))
const PitchDeckDesigner = lazy(() => import("./pages/PitchDeckDesigner").then(m => ({ default: m.PitchDeckDesigner })))
const MeetingIntake = lazy(() => import("./pages/MeetingIntake").then(m => ({ default: m.MeetingIntake })))
const Analytics = lazy(() => import("./pages/Analytics").then(m => ({ default: m.Analytics })))

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="animate-fade-in">
      {children}
    </div>
  )
}

function applyFontSize(fontSize: string) {
  const sizes: Record<string, string> = { small: "14px", medium: "16px", large: "18px" }
  document.documentElement.style.fontSize = sizes[fontSize] ?? "16px"
}

function AppRoutes() {
  const location = useLocation()
  const isAuthPage = ["/login", "/register", "/change-password"].includes(location.pathname)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [newEntryDefaultType, setNewEntryDefaultType] = useState<string | undefined>()
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [navRailEnabled, setNavRailEnabled] = useState(() => loadSettings().navRailEnabled ?? false)

  useEffect(() => {
    applyFontSize(loadSettings().fontSize ?? "medium")
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setNewEntryDefaultType(detail?.type || undefined)
      setShowNewEntry(true)
    }
    window.addEventListener("open-new-entry", handler)
    return () => window.removeEventListener("open-new-entry", handler)
  }, [])

  useEffect(() => {
    const handler = () => setShowCommandPalette(true)
    window.addEventListener("open-command-palette", handler)
    return () => window.removeEventListener("open-command-palette", handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      const s = loadSettings()
      setNavRailEnabled(s.navRailEnabled ?? false)
      applyFontSize(s.fontSize ?? "medium")
    }
    window.addEventListener("settings-changed", handler)
    return () => window.removeEventListener("settings-changed", handler)
  }, [])

  const handleNewEntrySaved = useCallback(() => {
    window.dispatchEvent(new CustomEvent("new-entry-saved"))
  }, [])

  return (
    <>
      <KeyboardShortcuts />
      <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
      {navRailEnabled && !isAuthPage && <NavRail />}
      <NewEntryPanel
        isOpen={showNewEntry}
        onClose={() => setShowNewEntry(false)}
        onSaved={handleNewEntrySaved}
        defaultType={newEntryDefaultType as any}
      />
      <div className={navRailEnabled && !isAuthPage ? "pl-14" : ""}>
        <PageTransition>
          <ErrorBoundary>
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
            <Route path="/ai" element={<ProtectedRoute><AIHub /></ProtectedRoute>} />
            <Route path="/insights" element={<Navigate to="/ai?tab=proposals" replace />} />
            <Route path="/case-studies" element={<Navigate to="/ai?tab=client-success" replace />} />
            <Route path="/unified-ai" element={<Navigate to="/ai?tab=unified" replace />} />
            <Route path="/analyze" element={<ProtectedRoute><RFPAnalyzer /></ProtectedRoute>} />
            <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
            <Route path="/studio" element={<ProtectedRoute><DocumentStudio /></ProtectedRoute>} />
            <Route path="/testimonials" element={<ProtectedRoute><TestimonialManager /></ProtectedRoute>} />
            <Route path="/humanize" element={<ProtectedRoute><AIHumanizer /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><ClientPortfolio /></ProtectedRoute>} />
            <Route path="/convert" element={<ProtectedRoute><ImageConverter /></ProtectedRoute>} />
            <Route path="/pitch-deck" element={<ProtectedRoute><PitchDeckDesigner /></ProtectedRoute>} />
            <Route path="/meetings" element={<ProtectedRoute><MeetingIntake /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </PageTransition>
        <AICompanion />
        <Toaster />
      </div>
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
