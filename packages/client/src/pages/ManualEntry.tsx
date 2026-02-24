import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams, Navigate } from "react-router-dom"
import { useIsAdmin } from "@/contexts/AuthContext"
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Tag,
  FolderOpen,
  FileText,
  MessageSquare,
  Loader2,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import { answersApi, topicsApi, aiApi, ApiError } from "@/lib/api"

interface Topic {
  id: string
  name: string
  displayName: string
}

type EntryStatus = "Approved" | "Draft"

export function ManualEntry() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return <Navigate to="/" replace />
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Get RFP text from URL if coming from RFP Analyzer
  const rfpText = searchParams.get("rfpText") || ""

  // Form state
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [topicId, setTopicId] = useState("")
  const [subtopic, setSubtopic] = useState("")
  const [status, setStatus] = useState<EntryStatus>("Draft")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  // UI state
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const hasProcessedRfpText = useRef(false)

  // Load topics on mount
  useEffect(() => {
    const loadTopics = async () => {
      setIsLoading(true)
      try {
        const data = await topicsApi.getAll()
        setTopics(data)
        if (data.length > 0 && !topicId && data[0]) {
          setTopicId(data[0].id)
        }
      } catch (err) {
        console.error("Failed to load topics:", err)
        setError("Failed to load topics. Please refresh the page.")
      } finally {
        setIsLoading(false)
      }
    }
    loadTopics()
  }, [])

  // Auto-populate fields from RFP text using AI
  // The selected RFP text becomes the ANSWER, and AI generates the question + metadata
  useEffect(() => {
    // Only process once, and only if we have rfpText and topics
    if (!rfpText || topics.length === 0 || hasProcessedRfpText.current) return

    hasProcessedRfpText.current = true

    // Immediately set the RFP text as the answer
    setAnswer(rfpText)

    const generateMetadata = async () => {
      setIsGenerating(true)
      try {
        // Use AI to generate a question and metadata based on the answer text
        const topicNames = topics.map(t => t.displayName).join(", ")
        const result = await aiApi.query({
          query: `You are a helpful assistant. Based on this content that will be used as an answer in our Q&A library, generate the appropriate question and metadata.

IMPORTANT: Respond with ONLY valid JSON, no markdown, no explanation. Format:
{"question": "A clear question that this content answers", "suggestedTopic": "One of: ${topicNames}", "suggestedTags": ["tag1", "tag2"]}

Content to analyze: "${rfpText.slice(0, 800).replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
          maxSources: 0,
        })

        // Try to parse the AI response as JSON
        try {
          // Clean up the response - remove markdown code blocks if present
          let jsonStr = result.response.trim()
          if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.slice(7)
          } else if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.slice(3)
          }
          if (jsonStr.endsWith("```")) {
            jsonStr = jsonStr.slice(0, -3)
          }
          jsonStr = jsonStr.trim()

          const parsed = JSON.parse(jsonStr)
          if (parsed.question) setQuestion(parsed.question)
          if (parsed.suggestedTopic) {
            const matchedTopic = topics.find(
              t => t.displayName.toLowerCase() === parsed.suggestedTopic.toLowerCase() ||
                   t.name.toLowerCase() === parsed.suggestedTopic.toLowerCase()
            )
            if (matchedTopic) setTopicId(matchedTopic.id)
          }
          if (parsed.suggestedTags && Array.isArray(parsed.suggestedTags)) {
            setTags(parsed.suggestedTags.slice(0, 5).map((t: string) => t.toLowerCase()))
          }
        } catch (parseErr) {
          // If JSON parsing fails, leave question empty for user to fill
          console.error("Failed to parse AI response:", parseErr, result.response)
        }
      } catch (err) {
        console.error("Failed to generate metadata:", err)
        // Answer is already set, user can manually add the question
      } finally {
        setIsGenerating(false)
      }
    }

    generateMetadata()
  }, [rfpText, topics])

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSaving(true)

    try {
      await answersApi.create({
        question: question.trim(),
        answer: answer.trim(),
        topicId,
        subtopic: subtopic.trim() || undefined,
        status,
        tags,
      })

      setSuccess(true)

      // Reset form after short delay
      setTimeout(() => {
        setQuestion("")
        setAnswer("")
        setSubtopic("")
        setTags([])
        setStatus("Draft")
        setSuccess(false)
      }, 2000)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Failed to save entry. Please try again.")
      }
      console.error("Save error:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const isFormValid = question.trim() && answer.trim() && topicId

  const getFieldClasses = (fieldName: string) => {
    const isFocused = focusedField === fieldName
    return `transition-all duration-300 ${isFocused ? "ring-2 ring-blue-500/20 border-blue-500" : ""}`
  }

  // Color variants for tags
  const tagColors = [
    "bg-blue-100 text-blue-700 border-blue-200",
    "bg-purple-100 text-purple-700 border-purple-200",
    "bg-teal-100 text-teal-700 border-teal-200",
    "bg-orange-100 text-orange-700 border-orange-200",
    "bg-amber-100 text-amber-700 border-amber-200",
    "bg-emerald-100 text-emerald-700 border-emerald-200",
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <AppHeader />

      {/* Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {/* AI Generating Banner */}
          {isGenerating && (
            <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-2xl flex items-center gap-3 shadow-sm animate-fade-in-up">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Loader2 className="text-purple-600 animate-spin" size={20} />
              </div>
              <div>
                <p className="font-semibold text-purple-800">AI is populating fields...</p>
                <p className="text-purple-600 text-sm">Generating question and suggested metadata from your selected text.</p>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {success && (
            <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl flex items-center gap-3 shadow-sm animate-fade-in-up">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="font-semibold text-emerald-800">Entry saved successfully!</p>
                <p className="text-emerald-600 text-sm">Your Q&A has been added to the library.</p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-red-50/80 border border-red-200 rounded-2xl flex items-start gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="text-red-600" size={20} />
              </div>
              <div className="pt-1">
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-600 text-sm mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Main Content Card */}
            <Card className="border-slate-200/80 dark:border-slate-700 dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <MessageSquare size={18} className="text-blue-500" />
                  Question & Answer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Question Field */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <FileText size={16} className="text-slate-400" />
                    Question
                    <span className="text-red-500">*</span>
                  </label>
                  <div className={`rounded-xl ${getFieldClasses("question")}`}>
                    <Textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onFocus={() => setFocusedField("question")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter the question..."
                      className="min-h-[100px] text-base"
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {question.length} characters
                  </p>
                </div>

                {/* Answer Field */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <Sparkles size={16} className="text-slate-400" />
                    Answer
                    <span className="text-red-500">*</span>
                  </label>
                  <div className={`rounded-xl ${getFieldClasses("answer")}`}>
                    <Textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onFocus={() => setFocusedField("answer")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter the answer..."
                      className="min-h-[200px] text-base"
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {answer.length} characters
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Metadata Card */}
            <Card className="border-slate-200/80 dark:border-slate-700 dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <FolderOpen size={18} className="text-purple-500" />
                  Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Topic Select */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <FolderOpen size={16} className="text-slate-400" />
                      Topic
                      <span className="text-red-500">*</span>
                    </label>
                    <Select value={topicId} onValueChange={setTopicId}>
                      <SelectTrigger className="rounded-xl h-12">
                        <SelectValue placeholder={isLoading ? "Loading topics..." : "Select a topic"} />
                      </SelectTrigger>
                      <SelectContent>
                        {topics.map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            {topic.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subtopic Field */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <FolderOpen size={16} className="text-slate-400" />
                      Subtopic
                      <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <Input
                      value={subtopic}
                      onChange={(e) => setSubtopic(e.target.value)}
                      onFocus={() => setFocusedField("subtopic")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g., Security, Compliance"
                      className={`h-12 ${getFieldClasses("subtopic")}`}
                    />
                  </div>
                </div>

                {/* Status Select */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <CheckCircle2 size={16} className="text-slate-400" />
                    Status
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStatus("Draft")}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                        status === "Draft"
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                          : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500"
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${status === "Draft" ? "bg-amber-500" : "bg-slate-300"}`} />
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus("Approved")}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                        status === "Approved"
                          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500"
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${status === "Approved" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Approved
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {status === "Draft"
                      ? "Draft entries won't appear in AI responses"
                      : "Approved entries will be included in AI responses"}
                  </p>
                </div>

                {/* Tags Field */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <Tag size={16} className="text-slate-400" />
                    Tags
                    <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onFocus={() => setFocusedField("tags")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Add a tag and press Enter"
                      className={`flex-1 h-12 ${getFieldClasses("tags")}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddTag}
                      disabled={!tagInput.trim()}
                      className="h-12 px-4 rounded-xl border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                    >
                      <Plus size={18} />
                    </Button>
                  </div>

                  {/* Tags Display */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {tags.map((tag, index) => (
                        <span
                          key={tag}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 hover:shadow-sm ${tagColors[index % tagColors.length]}`}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-0.5 hover:opacity-70 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/")}
                className="rounded-xl text-slate-600 hover:text-slate-800"
              >
                <X className="mr-2" size={18} />
                Cancel
              </Button>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuestion("")
                    setAnswer("")
                    setSubtopic("")
                    setTags([])
                    setStatus("Draft")
                    setError(null)
                  }}
                  className="rounded-xl border-slate-300 hover:border-slate-400"
                >
                  Clear Form
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  size="lg"
                  disabled={!isFormValid || isSaving}
                  className="rounded-xl min-w-[140px]"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2" size={18} />
                      Save Entry
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
