import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium
   ring-offset-background transition-all duration-200 ease-out
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2
   disabled:pointer-events-none disabled:opacity-50
   active:scale-[0.98] active:transition-none`,
  {
    variants: {
      variant: {
        default: `
          bg-gradient-to-b from-blue-500 to-blue-600
          text-white rounded-xl
          shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]
          hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_4px_8px_rgba(59,130,246,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]
          hover:from-blue-400 hover:to-blue-500
        `,
        destructive: `
          bg-gradient-to-b from-red-500 to-red-600
          text-white rounded-xl
          shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(239,68,68,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]
          hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_4px_8px_rgba(239,68,68,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]
          hover:from-red-400 hover:to-red-500
        `,
        outline: `
          border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl
          shadow-[0_1px_2px_rgba(0,0,0,0.02)]
          hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white
          hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        `,
        secondary: `
          bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl
          hover:bg-slate-200 dark:hover:bg-slate-700
        `,
        ghost: `
          text-slate-600 dark:text-slate-400 rounded-xl
          hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white
        `,
        link: `
          text-blue-600 dark:text-blue-400 underline-offset-4 hover:underline
        `,
        success: `
          bg-gradient-to-b from-emerald-500 to-emerald-600
          text-white rounded-xl
          shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]
          hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_4px_8px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]
          hover:from-emerald-400 hover:to-emerald-500
        `,
        purple: `
          bg-gradient-to-b from-violet-500 to-purple-600
          text-white rounded-xl
          shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_4px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]
          hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_4px_8px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]
          hover:from-violet-400 hover:to-purple-500
        `,
      },
      size: {
        default: "h-11 px-5 py-2.5 text-[15px]",
        sm: "h-9 px-3.5 text-[13px] rounded-lg",
        lg: "h-12 px-6 text-[15px]",
        xl: "h-14 px-8 text-[16px]",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
