import { pct } from "@/lib/format";

/** Horizontal share bars with the exact percentage beside each; the percentage text is the accessible value. */
export function AllocationBars({ items, total, locale }: { items: { id: string; label: string; value: number }[]; total: number; locale: string }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{a.label}</span>
            <bdi className="text-muted">{pct(a.value / total, locale)}</bdi>
          </div>
          <div aria-hidden="true" className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-gold-fill" style={{ width: `${(a.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
