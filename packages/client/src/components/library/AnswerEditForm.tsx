import { Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button, Textarea, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui"
import type { Topic } from "@/types"

interface AnswerEditFormProps {
  form: {
    question: string
    answer: string
    topicId: string
    status: "Approved" | "Draft"
    tags: string
  }
  onChange: (form: AnswerEditFormProps["form"]) => void
  topics: Topic[]
  isSaving: boolean
  hasChanges: boolean
  onSave: () => void
  onCancel: () => void
}

export function AnswerEditForm({ form, onChange, topics, isSaving, hasChanges, onSave, onCancel }: AnswerEditFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="answer-question" className="text-[12px] font-medium">Question</Label>
        <Textarea
          id="answer-question"
          value={form.question}
          onChange={(e) => onChange({ ...form, question: e.target.value })}
          placeholder="Enter the question..."
          className="rounded-xl min-h-[80px] text-[13px] bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="answer-content" className="text-[12px] font-medium">Answer</Label>
        <Textarea
          id="answer-content"
          value={form.answer}
          onChange={(e) => onChange({ ...form, answer: e.target.value })}
          placeholder="Enter the answer..."
          className="rounded-xl min-h-[150px] text-[13px] bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/60"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[12px] font-medium">Topic</Label>
          <Select value={form.topicId} onValueChange={(v) => onChange({ ...form, topicId: v })}>
            <SelectTrigger className="rounded-xl text-[13px]">
              <SelectValue placeholder="Select topic" />
            </SelectTrigger>
            <SelectContent>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>{topic.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[12px] font-medium">Status</Label>
          <Select value={form.status} onValueChange={(v) => onChange({ ...form, status: v as "Approved" | "Draft" })}>
            <SelectTrigger className="rounded-xl text-[13px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Approved">
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />Approved</div>
              </SelectItem>
              <SelectItem value="Draft">
                <div className="flex items-center gap-2"><AlertCircle size={14} className="text-amber-500" />Draft</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="answer-tags" className="text-[12px] font-medium">Tags <span className="text-slate-400">(comma-separated)</span></Label>
        <Input
          id="answer-tags"
          value={form.tags}
          onChange={(e) => onChange({ ...form, tags: e.target.value })}
          placeholder="tag1, tag2, tag3"
          className="rounded-xl text-[13px] bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/60"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl active:scale-[0.98] transition-all duration-150" disabled={isSaving}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          className="flex-1 rounded-xl active:scale-[0.98] transition-all duration-150"
          disabled={isSaving || !form.question.trim() || !form.answer.trim() || !hasChanges}
        >
          {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
