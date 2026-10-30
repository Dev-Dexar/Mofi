function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface/80 border border-ink/5 ${className}`}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-ink/5 bg-surface p-6 flex flex-col gap-3">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}
