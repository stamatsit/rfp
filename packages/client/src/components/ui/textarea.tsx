import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          `flex min-h-[120px] w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800
           px-4 py-3 text-[15px] text-slate-900 dark:text-white leading-relaxed
           shadow-[0_1px_2px_rgba(0,0,0,0.02)]
           transition-all duration-200 ease-out`,
          "placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]",
          "focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10",
          "focus:shadow-[0_0_0_1px_rgba(59,130,246,0.1)]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900",
          "resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
