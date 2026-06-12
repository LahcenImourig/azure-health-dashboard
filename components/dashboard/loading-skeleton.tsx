import { cn } from '@/lib/utils';

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border p-5 shadow-sm space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
          <Skeleton className="h-6 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>
  );
}
