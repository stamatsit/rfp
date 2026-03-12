/**
 * Meeting AI Service
 *
 * Handles audio transcription via OpenAI Whisper and structured meeting
 * analysis via GPT-4o. Used by the Meeting Intake feature.
 */

import OpenAI from "openai"
import { db, supabaseAdmin } from "../db/index.js"
import { clientDocuments } from "../db/schema.js"
import { eq } from "drizzle-orm"

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

export interface MeetingAnalysis {
  summary: string
  keyPoints: string[]
  actionItems: { text: string; assignee?: string; dueDate?: string }[]
  decisions: string[]
  painPoints: string[]
  opportunities: string[]
  attendees: string[]
  pullQuotes: { quote: string; speaker?: string; title?: string; context?: string }[]
}

const MEETING_ANALYSIS_PROMPT = `You are a meeting notes analyst for Stamats, a higher-education and healthcare marketing agency. Analyze the provided meeting transcript and return a structured JSON response.

Context: Stamats helps colleges, universities, and healthcare organizations with enrollment marketing, brand strategy, digital marketing, and communications. When analyzing meetings, pay special attention to:
- Client enrollment challenges, goals, and timelines
- Marketing budget and resource constraints
- Competitive landscape mentions
- Brand positioning discussions
- Digital/web project requirements
- RFP or proposal opportunities

Return valid JSON only with this exact structure:
{
  "summary": "2-3 sentence overview of what was discussed and key outcomes",
  "keyPoints": ["up to 8 key discussion topics or important statements"],
  "actionItems": [{"text": "specific action to take", "assignee": "person responsible if mentioned", "dueDate": "date if mentioned"}],
  "decisions": ["any decisions that were made or agreed upon"],
  "painPoints": ["client challenges, frustrations, or problems mentioned"],
  "opportunities": ["ways Stamats can help, upsell opportunities, or strategic leverage points"],
  "attendees": ["names of people who spoke or were mentioned as present"],
  "pullQuotes": [{"quote": "exact or near-exact words from the client", "speaker": "name of the person who said it", "title": "their job title if mentioned", "context": "brief note on what prompted the quote"}]
}

If a field has no relevant data, return an empty array []. Always extract attendees from speaker labels or introductions. Be thorough with action items — capture every commitment or follow-up mentioned.

For pullQuotes: Look for compelling statements from CLIENT-SIDE participants (not Stamats staff) that could serve as testimonials. Great pull quotes include:
- Praise for Stamats work, results, or team
- Statements about positive outcomes or ROI
- Expressions of trust, satisfaction, or enthusiasm about the partnership
- Memorable phrases about challenges overcome or goals achieved
Only include quotes where the client is clearly saying something positive or noteworthy about the work. Use their exact words when possible — do not paraphrase. If no strong pull quotes exist, return an empty array.`

/**
 * Transcribe audio using OpenAI Whisper API.
 * Downloads audio from Supabase Storage, sends to Whisper.
 */
export async function transcribeAudio(storageKey: string): Promise<string> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OpenAI not configured")
  if (!supabaseAdmin) throw new Error("Storage not configured")

  // Download audio from Supabase
  const { data, error } = await supabaseAdmin.storage
    .from("client-documents")
    .download(storageKey)

  if (error || !data) {
    throw new Error(`Failed to download audio: ${error?.message || "No data"}`)
  }

  const buffer = Buffer.from(await data.arrayBuffer())

  // Whisper API expects a File-like object
  const ext = storageKey.split(".").pop() || "webm"
  const mimeMap: Record<string, string> = {
    webm: "audio/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    ogg: "audio/ogg",
  }

  const file = new File([buffer], `recording.${ext}`, {
    type: mimeMap[ext] || "audio/webm",
  })

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "text",
  })

  return transcription as unknown as string
}

/**
 * Analyze a meeting transcript using GPT-4o with structured JSON output.
 */
export async function analyzeMeetingTranscript(text: string): Promise<MeetingAnalysis> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OpenAI not configured")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: MEETING_ANALYSIS_PROMPT },
      { role: "user", content: text.slice(0, 50000) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 6000,
  })

  const raw = completion.choices[0]?.message?.content || "{}"
  const parsed = JSON.parse(raw)

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((k: unknown) => typeof k === "string") : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: any) => ({
          text: typeof item.text === "string" ? item.text : String(item),
          assignee: typeof item.assignee === "string" ? item.assignee : undefined,
          dueDate: typeof item.dueDate === "string" ? item.dueDate : undefined,
        }))
      : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: unknown) => typeof d === "string") : [],
    painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.filter((p: unknown) => typeof p === "string") : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.filter((o: unknown) => typeof o === "string") : [],
    attendees: Array.isArray(parsed.attendees) ? parsed.attendees.filter((a: unknown) => typeof a === "string") : [],
    pullQuotes: Array.isArray(parsed.pullQuotes)
      ? parsed.pullQuotes.map((q: any) => ({
          quote: typeof q.quote === "string" ? q.quote : String(q),
          speaker: typeof q.speaker === "string" ? q.speaker : undefined,
          title: typeof q.title === "string" ? q.title : undefined,
          context: typeof q.context === "string" ? q.context : undefined,
        })).filter((q: any) => q.quote && q.quote.length > 0)
      : [],
  }
}

/**
 * Add speaker labels to a transcript using GPT-4o.
 * Uses the attendees list from analysis to attribute dialogue.
 */
export async function diarizeTranscript(
  transcript: string,
  attendees: string[],
): Promise<string> {
  const openai = getOpenAI()
  if (!openai) throw new Error("OpenAI not configured")

  const speakerList = attendees.length > 0
    ? `Known participants: ${attendees.join(", ")}`
    : "No specific participant names are known — use Speaker 1, Speaker 2, etc."

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a transcript editor. Your job is to add speaker labels to an unlabeled meeting transcript.

${speakerList}

Rules:
- Attribute each segment of dialogue to the most likely speaker based on context, tone, role, and content
- Use the format "**Speaker Name:** text" for each turn
- Preserve the original words exactly — do not rephrase, summarize, or omit anything
- Insert a blank line between speaker turns
- If you cannot determine who is speaking, use "**Unknown:**"
- For Stamats staff, you can infer from context (e.g., presenting capabilities, discussing deliverables)
- For client-side speakers, infer from context (e.g., asking about timelines, discussing their institution)
- Keep the full transcript — do not truncate or summarize`,
      },
      { role: "user", content: transcript.slice(0, 50000) },
    ],
    temperature: 0.2,
    max_tokens: 12000,
  })

  return completion.choices[0]?.message?.content || transcript
}

/**
 * Full meeting processing pipeline (fire-and-forget).
 * Called after audio upload or text submission.
 *
 * 1. If audioStorageKey provided: transcribe via Whisper
 * 2. Analyze transcript via GPT-4o
 * 3. Update database record with results
 */
export async function processMeetingIntake(
  docId: string,
  options: { audioStorageKey?: string; transcriptText?: string }
): Promise<void> {
  if (!db) throw new Error("Database unavailable")

  try {
    let transcript = options.transcriptText || ""

    // Step 1: Transcribe audio if provided
    if (options.audioStorageKey && !transcript) {
      await db.update(clientDocuments)
        .set({ processingStatus: "transcribing", updatedAt: new Date() })
        .where(eq(clientDocuments.id, docId))

      transcript = await transcribeAudio(options.audioStorageKey)

      // Save transcript immediately
      await db.update(clientDocuments)
        .set({ extractedText: transcript, updatedAt: new Date() })
        .where(eq(clientDocuments.id, docId))
    }

    if (!transcript.trim()) {
      await db.update(clientDocuments)
        .set({ processingStatus: "error", processingError: "No transcript text available", updatedAt: new Date() })
        .where(eq(clientDocuments.id, docId))
      return
    }

    // Step 2: Analyze transcript
    await db.update(clientDocuments)
      .set({ processingStatus: "analyzing", updatedAt: new Date() })
      .where(eq(clientDocuments.id, docId))

    const analysis = await analyzeMeetingTranscript(transcript)

    // Step 3: Save analysis results (mark complete so UI can show results while diarization runs)
    await db.update(clientDocuments)
      .set({
        summary: analysis.summary,
        keyPoints: analysis.keyPoints,
        meetingActionItems: analysis.actionItems,
        meetingDecisions: analysis.decisions,
        meetingPainPoints: analysis.painPoints,
        meetingOpportunities: analysis.opportunities,
        meetingPullQuotes: analysis.pullQuotes,
        meetingAttendees: analysis.attendees.length > 0 ? analysis.attendees : undefined,
        processingStatus: "complete",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(clientDocuments.id, docId))
  } catch (err) {
    console.error("Meeting processing failed:", err)
    const message = err instanceof Error ? err.message : "Processing failed"
    try {
      await db.update(clientDocuments)
        .set({ processingStatus: "error", processingError: message, updatedAt: new Date() })
        .where(eq(clientDocuments.id, docId))
    } catch {
      // DB update also failed — nothing more we can do
    }
  }
}
