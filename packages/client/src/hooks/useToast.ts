import { useSyncExternalStore, useCallback } from "react"

export interface Toast {
  id: string
  message: string
  variant: "success" | "error" | "warning" | "info"
}

let toasts: Toast[] = []
let listeners: Array<() => void> = []
let counter = 0

function notify() {
  listeners.forEach((l) => l())
}

function addToast(message: string, variant: Toast["variant"], duration = 4000) {
  const id = `toast-${++counter}`
  toasts = [...toasts, { id, message, variant }]
  notify()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, duration)
}

function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export const toast = {
  success: (message: string) => addToast(message, "success"),
  error: (message: string) => addToast(message, "error"),
  warning: (message: string) => addToast(message, "warning"),
  info: (message: string) => addToast(message, "info"),
}

export function useToasts() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.push(listener)
      return () => {
        listeners = listeners.filter((l) => l !== listener)
      }
    },
    () => toasts
  )

  const dismiss = useCallback((id: string) => dismissToast(id), [])

  return { toasts: snapshot, dismiss }
}
