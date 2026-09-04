/**
 * Central OpenAI model configuration.
 *
 * Change the model for the WHOLE APP here — do not hardcode model strings at
 * call sites. (Before 2026-07-30 there were 74 scattered literals, which is why
 * swapping models used to be a 17-file change.)
 *
 * IMPORTANT — the gpt-5.x family rejects two legacy parameters:
 *   • `temperature` — only the default (1) is accepted. Do not pass it.
 *   • `max_tokens`  — renamed. Use `max_completion_tokens`.
 * Passing either returns HTTP 400 and the call fails outright.
 *
 * Function/tool calling is NOT supported on gpt-5.6-luna (it conflicts with
 * reasoning_effort). This app does not use tool calling; if that changes, pick a
 * model that supports it rather than working around this.
 */

/** Primary model — everything user-facing. */
export const AI_MODEL = "gpt-5.6-luna"

/** Lighter-weight tasks (classification, summarisation, extraction). */
export const AI_MODEL_FAST = "gpt-5.6-luna"

/** Audio transcription. Unrelated to the chat models above — do not change. */
export const AI_MODEL_TRANSCRIBE = "whisper-1"
