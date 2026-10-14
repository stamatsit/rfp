/**
 * Building blocks for Topic Ideation: one button family, keyboard-friendly
 * tabs, a side panel and menus (Radix underneath, so focus, Escape and arrow
 * keys work everywhere), and the text tones that pass WCAG AA contrast on
 * white and on the dark theme's cards.
 */
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACCENT } from "./ui"

// ─── text tones ─────────────────────────────────────────────────────────────
// slate-400 on white and slate-500 on slate-900 both fail AA for small text,
// so secondary text is slate-500 in light and slate-400 in dark, never lighter.

export const tone = {
  /** Secondary text: meta lines, hints, counts. */
  muted: "text-slate-500 dark:text-slate-400",
  /** Body copy. */
  body: "text-slate-600 dark:text-slate-300",
  /** Small caps label above a block. */
  label: "text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500 dark:text-slate-400",
  /** Inline link. */
  link: "font-medium text-sky-700 dark:text-sky-400 hover:underline underline-offset-2",
} as const

export const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"

// ─── buttons ────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand"
type Size = "sm" | "md" | "lg" | "icon" | "iconSm"

const VARIANT: Record<Variant, string> = {
  primary: "text-white shadow-sm hover:brightness-[1.08] active:brightness-95",
  secondary:
    "border border-black/[0.1] dark:border-white/[0.12] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-[0_1px_1px_rgba(15,23,42,0.04)]",
  ghost: "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  brand: "bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-500/20",
}

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 gap-1.5 rounded-lg text-[12.5px]",
  md: "h-10 px-3.5 gap-2 rounded-xl text-[13.5px]",
  lg: "h-12 px-6 gap-2 rounded-xl text-[15px]",
  icon: "h-10 w-10 rounded-xl",
  iconSm: "h-8 w-8 rounded-lg",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", className, style, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center shrink-0 whitespace-nowrap font-medium transition-[background-color,color,filter,opacity] disabled:opacity-50 disabled:pointer-events-none",
        ring,
        VARIANT[variant],
        SIZE[size],
        variant === "primary" && "font-semibold",
        className,
      )}
      style={variant === "primary" ? { background: ACCENT, ...style } : style}
      {...props}
    />
  )
})

// ─── tabs ───────────────────────────────────────────────────────────────────

export interface TabDef<T extends string> {
  id: T
  label: string
  count?: number
  /** A small green dot: something is ready in this tab. */
  done?: boolean
  /** Shown instead of `label` on narrow screens. */
  short?: string
}

/**
 * A tab row with roving focus: arrow keys, Home and End move between tabs and
 * select them. Panels use `tabPanelProps`.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  idBase,
  className,
  size = "md",
}: {
  tabs: Array<TabDef<T>>
  active: T
  onChange: (id: T) => void
  label: string
  idBase: string
  className?: string
  size?: "sm" | "md"
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the selected tab in view when the row scrolls sideways (narrow screens). Never scrolls the page.
  useEffect(() => {
    const list = ref.current
    const el = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!list || !el) return
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left - 8)
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8
  }, [active])
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active)
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next]!.id)
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className={cn("relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors",
              size === "md" ? "h-9 px-3 text-[13.5px]" : "h-8 px-2.5 text-[12.5px]",
              ring,
              on ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
            )}
          >
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            {t.count !== undefined && t.count > 0 && <span className={cn("tabular-nums text-[12px]", on ? "opacity-75" : "text-slate-500 dark:text-slate-400")}>{t.count}</span>}
            {t.done && (
              <>
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="sr-only">(written)</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function tabPanelProps(idBase: string, id: string, active: string) {
  return {
    role: "tabpanel" as const,
    id: `${idBase}-panel-${id}`,
    "aria-labelledby": `${idBase}-tab-${id}`,
    hidden: id !== active,
    tabIndex: -1,
  }
}

// ─── chips (filters) ────────────────────────────────────────────────────────

export function Chip({ on, onClick, children, dot, count }: { on: boolean; onClick: () => void; children: ReactNode; dot?: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors border",
        ring,
        on
          ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900"
          : "border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-black/[0.16] dark:hover:border-white/[0.2]",
      )}
    >
      {dot && <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: dot }} />}
      {children}
      {count !== undefined && <span className={cn("tabular-nums", on ? "opacity-75" : "text-slate-500 dark:text-slate-400")}>{count}</span>}
    </button>
  )
}

// ─── side panel ─────────────────────────────────────────────────────────────

/**
 * A panel that slides in from the right on wide screens and covers the screen
 * on a phone. Escape, the close button and the backdrop close it; focus is
 * trapped inside and goes back where it came from.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  header,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name; shown visually by the caller inside `header` or `children`. */
  title: string
  description?: string
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[950] bg-slate-950/30 dark:bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-[951] w-full sm:w-[min(680px,calc(100vw-48px))] flex flex-col bg-white dark:bg-slate-950 sm:border-l border-black/[0.08] dark:border-white/[0.08] shadow-[-24px_0_48px_rgba(15,23,42,0.12)] data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200 motion-reduce:animate-none focus:outline-none"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          {/* The accessible name only; the visible heading lives in the body. */}
          <DialogPrimitive.Title asChild>
            <span className="sr-only">{title}</span>
          </DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
          <div className="shrink-0 flex items-center gap-2 h-14 px-3 sm:px-4 border-b border-black/[0.06] dark:border-white/[0.08] pt-[env(safe-area-inset-top,0px)]">
            <div className="flex-1 min-w-0 flex items-center gap-1">{header}</div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X size={18} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div data-panel-scroll className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── menus ──────────────────────────────────────────────────────────────────

export const MenuRoot = Menu.Root
export const MenuTrigger = Menu.Trigger

export function MenuContent({ children, label, width = "w-72", align = "end" }: { children: ReactNode; label: string; width?: string; align?: "start" | "end" }) {
  return (
    <Menu.Portal>
      <Menu.Content
        aria-label={label}
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          width,
          "z-[960] max-w-[calc(100vw-24px)] outline-none focus:outline-none focus-visible:outline-none rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-slate-900 shadow-xl p-1.5 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none",
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  )
}

export function MenuItem({
  icon,
  title,
  hint,
  onSelect,
  disabled,
  danger,
}: {
  icon: ReactNode
  title: string
  hint?: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <Menu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800 data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className={cn("block text-[13.5px] font-medium", danger ? "text-rose-700 dark:text-rose-400" : "text-slate-800 dark:text-slate-100")}>{title}</span>
        {hint && <span className="block text-[12px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>}
      </span>
    </Menu.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className={cn("px-3 pt-2.5 pb-1", tone.label)}>{children}</Menu.Label>
}

export function MenuSeparator() {
  return <Menu.Separator className="my-1.5 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
}
