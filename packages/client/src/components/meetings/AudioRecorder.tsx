/**
 * AudioRecorder — Live microphone recording component.
 * Uses MediaRecorder API with WebM/Opus (fallback to MP4 for Safari).
 * Includes live waveform visualization via AnalyserNode.
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, Square, Pause, Play, Trash2 } from "lucide-react"

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, durationSecs: number) => void
  disabled?: boolean
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return "audio/webm"
}

function Waveform({ analyser, isActive }: { analyser: AnalyserNode | null; isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!analyser || !isActive || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)

      ctx.clearRect(0, 0, w, h)

      // Draw waveform
      ctx.lineWidth = 2
      ctx.strokeStyle = "#10b981" // emerald-500
      ctx.beginPath()

      const sliceWidth = w / bufferLength
      let x = 0
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i]! / 128.0
        const y = (v * h) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.lineTo(w, h / 2)
      ctx.stroke()
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, isActive])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800"
    />
  )
}

export function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "paused" | "done">("idle")
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
    }
  }, [audioUrl])

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setPermissionDenied(false)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up AnalyserNode for waveform
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyserNode = audioCtx.createAnalyser()
      analyserNode.fftSize = 2048
      source.connect(analyserNode)
      setAnalyser(analyserNode)

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setState("done")
        stream.getTracks().forEach(t => t.stop())
        setAnalyser(null)
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {})
          audioCtxRef.current = null
        }
      }

      recorder.start(1000)
      setState("recording")
      setDuration(0)
      startTimer()
    } catch (err: any) {
      console.error("Failed to access microphone:", err)
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionDenied(true)
      }
    }
  }, [startTimer])

  const stopRecording = useCallback(() => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
  }, [stopTimer])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause()
      setState("paused")
      stopTimer()
    }
  }, [stopTimer])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume()
      setState("recording")
      startTimer()
    }
  }, [startTimer])

  const discard = useCallback(() => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setAudioUrl(null)
    setAnalyser(null)
    blobRef.current = null
    chunksRef.current = []
    setDuration(0)
    setState("idle")
  }, [audioUrl, stopTimer])

  const submit = useCallback(() => {
    if (blobRef.current) {
      onRecordingComplete(blobRef.current, duration)
    }
  }, [duration, onRecordingComplete])

  if (permissionDenied) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6 text-center">
        <Mic className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-red-700 dark:text-red-300">Microphone access denied</p>
        <p className="text-xs text-red-500 dark:text-red-400 mt-1">
          Please allow microphone access in your browser settings and try again.
        </p>
        <button
          onClick={() => { setPermissionDenied(false); startRecording() }}
          className="mt-3 px-4 py-1.5 text-xs font-medium rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-6">
      {/* Idle state — start button */}
      {state === "idle" && (
        <div className="text-center">
          <button
            onClick={startRecording}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic className="w-5 h-5" />
            Start Recording
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
            Click to start recording from your microphone
          </p>
        </div>
      )}

      {/* Recording / Paused state */}
      {(state === "recording" || state === "paused") && (
        <div className="space-y-4">
          {/* Waveform */}
          <Waveform analyser={analyser} isActive={state === "recording"} />

          {/* Timer + status */}
          <div className="flex items-center justify-center gap-3">
            <div className={`w-3 h-3 rounded-full ${state === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
            <span className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {formatDuration(duration)}
            </span>
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              {state === "recording" ? "Recording" : "Paused"}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {state === "recording" ? (
              <button
                onClick={pauseRecording}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            ) : (
              <button
                onClick={resumeRecording}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Done state — preview + submit */}
      {state === "done" && audioUrl && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <Mic className="w-4 h-4" />
              <span>Recording — {formatDuration(duration)}</span>
            </div>
            <button
              onClick={discard}
              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-3 h-3" />
              Discard
            </button>
          </div>

          {/* Audio preview */}
          <audio src={audioUrl} controls className="w-full" />

          <button
            onClick={submit}
            disabled={disabled}
            className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use This Recording
          </button>
        </div>
      )}
    </div>
  )
}
