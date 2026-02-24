import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  `inline-flex items-center rounded-full border px-2.5 py-0.5
   text-xs font-medium tracking-wide
   transition-all duration-200 ease-out
   focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-2`,
  {
    variants: {
      variant: {
        default: `
          border-transparent bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300
          shadow-[0_0_0_1px_rgba(59,130,246,0.1)]
        `,
        secondary: `
          border-transparent bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
        `,
        destructive: `
          border-transparent bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300
          shadow-[0_0_0_1px_rgba(239,68,68,0.1)]
        `,
        outline: `
          border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800
          shadow-[0_1px_2px_rgba(0,0,0,0.02)]
        `,
        success: `
          border-transparent bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300
          shadow-[0_0_0_1px_rgba(16,185,129,0.1)]
        `,
        warning: `
          border-transparent bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300
          shadow-[0_0_0_1px_rgba(245,158,11,0.1)]
        `,
        purple: `
          border-transparent bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300
          shadow-[0_0_0_1px_rgba(139,92,246,0.1)]
        `,
        teal: `
          border-transparent bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300
          shadow-[0_0_0_1px_rgba(20,184,166,0.1)]
        `,
        orange: `
          border-transparent bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300
          shadow-[0_0_0_1px_rgba(249,115,22,0.1)]
        `,
        sky: `
          border-transparent bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300
          shadow-[0_0_0_1px_rgba(14,165,233,0.1)]
        `,
        indigo: `
          border-transparent bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
          shadow-[0_0_0_1px_rgba(99,102,241,0.1)]
        `,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
