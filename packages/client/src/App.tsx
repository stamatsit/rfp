import { useState, useEffect, useCallback } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { HomePage, ImportWizard, PhotoUpload, SearchLibrary, ManualEntry, AskAI, RFPAnalyzer, Help, Support, SavedDocuments, Settings, ProposalInsights, CaseStudies, UnifiedAI } from "./pages"
import Login from "./pages/Login"
import { AuthProvider } from "./contexts/AuthContext"
import { ThemeProvider } from "./contexts/ThemeContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { KeyboardShortcuts } from "./components/KeyboardShortcuts"
import { NewEntryPanel } from "./components/NewEntryPanel"

function App() {
  const [showNewEntry, setShowNewEntry] = useState(false)

  // Listen for global "open-new-entry" event (dispatched by tiles)
  useEffect(() => {
    const handler = () => setShowNewEntry(true)
    window.addEventListener("open-new-entry", handler)
    return () => window.removeEventListener("open-new-entry", handler)
  }, [])

  const handleNewEntrySaved = useCallback(() => {
    // Dispatch event so Library page can refresh if it's open
    window.dispatchEvent(new CustomEvent("new-entry-saved"))
  }, [])

  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <KeyboardShortcuts />
        <NewEntryPanel
          isOpen={showNewEntry}
          onClose={() => setShowNewEntry(false)}
          onSaved={handleNewEntrySaved}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/import" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
          <Route path="/photos" element={<ProtectedRoute><PhotoUpload /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchLibrary /></ProtectedRoute>} />
          <Route path="/new" element={<ProtectedRoute><ManualEntry /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AskAI /></ProtectedRoute>} />
          <Route path="/analyze" element={<ProtectedRoute><RFPAnalyzer /></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><SavedDocuments /></ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/insights" element={<ProtectedRoute><ProposalInsights /></ProtectedRoute>} />
          <Route path="/case-studies" element={<ProtectedRoute><CaseStudies /></ProtectedRoute>} />
          <Route path="/unified-ai" element={<ProtectedRoute><UnifiedAI /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
