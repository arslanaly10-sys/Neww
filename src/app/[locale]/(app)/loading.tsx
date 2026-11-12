import { Skeleton } from "@/components/ui";

/** Shown while a page's data loads: shapes, not spinners. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">…</span>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
}
