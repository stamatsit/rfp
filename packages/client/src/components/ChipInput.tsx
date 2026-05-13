import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all duration-200"

export interface ChipInputProps {
  values: string[]
  onChange: (values: string[]) => void
  /** Validate a raw value; return canonical form (e.g., lowercased) or null to reject. */
  validate?: (raw: string) => string | null
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
}

/**
 * Reusable chip-style multi-input.
 * Press Enter, Tab, or comma to commit the current text as a chip.
 * Backspace on empty input removes the last chip.
 */
export function ChipInput({ values, onChange, validate, placeholder, ariaLabel, disabled }: ChipInputProps) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setText("")
      setError(null)
      return
    }
    const canonical = validate ? validate(trimmed) : trimmed
    if (canonical === null) {
      setError(`Invalid: ${trimmed}`)
      return
    }
    if (values.includes(canonical)) {
      setError(`Already added: ${canonical}`)
      return
    }
    onChange([...values, canonical])
    setText("")
    setError(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (text.trim()) {
        e.preventDefault()
        commit(text)
      }
    } else if (e.key === "Backspace" && text === "" && values.length > 0) {
      e.preventDefault()
      onChange(values.slice(0, -1))
      setError(null)
    }
  }

  const removeChip = (idx: number) => {
    if (disabled) return
    onChange(values.filter((_, i) => i !== idx))
    setError(null)
  }

  return (
    <div>
      <div
        className={`${inputCls} flex flex-wrap items-center gap-1.5 cursor-text`}
        onClick={(e) => {
          const target = e.currentTarget.querySelector("input")
          target?.focus()
        }}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 text-xs font-medium"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeChip(i)
                }}
                className="hover:text-red-600 transition-colors"
                aria-label={`Remove ${v}`}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => text.trim() && commit(text)}
          placeholder={values.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="flex-1 min-w-[6rem] bg-transparent border-0 outline-none text-sm py-0.5"
        />
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
