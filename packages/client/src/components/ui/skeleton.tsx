function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className ?? ""}`} />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700 p-6 space-y-4">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

function SkeletonMessage() {
  return (
    <div className="flex gap-4">
      <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

function SkeletonConversationItem() {
  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <Skeleton className="h-3.5 w-4/5" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonMessage, SkeletonConversationItem }
