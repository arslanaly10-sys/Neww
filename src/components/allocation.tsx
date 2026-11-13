import { pct } from "@/lib/format";

/**
 * Horizontal share bars with the exact percentage beside each; the percentage text is the accessible value.
 * With `limit`, the rest fold under a "show more" disclosure so long lists stay short.
 */
export function AllocationBars({ items, total, locale, limit, moreLabel }: { items: { id: string; label: string; value: number }[]; total: number; locale: string; limit?: number; moreLabel?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value));
  const head = limit ? items.slice(0, limit) : items;
  const rest = limit ? items.slice(limit) : [];
  const bar = (a: { id: string; label: string; value: number }) => (
        <li key={a.id}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{a.label}</span>
            <bdi className="text-muted">{pct(a.value / total, locale)}</bdi>
          </div>
          <div aria-hidden="true" className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-gold-fill" style={{ width: `${(a.value / max) * 100}%` }} /></div>
        </li>
  );
  return (
    <>
      <ul className="space-y-3">{head.map(bar)}</ul>
      {rest.length > 0 && (
        <details className="mt-3 group">
          <summary className="tap cursor-pointer text-sm text-gold underline underline-offset-4">{moreLabel ? moreLabel(rest.length) : `+${rest.length}`}</summary>
          <ul className="mt-3 space-y-3">{rest.map(bar)}</ul>
        </details>
      )}
    </>
  );
}
