import { Search, Loader2, X } from "lucide-react"
import { Input } from "@/components/ui"

interface LibrarySearchBarProps {
  value: string
  onChange: (value: string) => void
  isSearching: boolean
  onSearch: () => void
  placeholder?: string
}

export function LibrarySearchBar({ value, onChange, isSearching, onSearch, placeholder }: LibrarySearchBarProps) {
  return (
    <div className="sticky top-0 z-20 px-6 pt-5 pb-3 bg-gradient-to-b from-slate-50 via-slate-50 to-slate-50/80 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950/80 backdrop-blur-sm border-b border-slate-200/30 dark:border-slate-700/20">
      <div className="relative group">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Search answers and photos..."}
          className="w-full h-11 pl-12 pr-12 text-[14px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.04)] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 dark:focus:border-blue-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-white transition-all duration-200"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        {isSearching ? (
          <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
        ) : value ? (
          <button
            onClick={() => onChange("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-150"
          >
            <X size={14} />
          </button>
        ) : (
          <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200/80 dark:border-slate-700 font-mono select-none pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  )
}
