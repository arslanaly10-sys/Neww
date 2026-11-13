import { cn } from "@/lib/cn";

/**
 * Where a portfolio's records live today, fanned out on an arc around the problem statement. Each label sits on a
 * radius, reading outward; every fourth dot is gold. The arc is drawn in SVG so it scales; on phones the same labels
 * show as a plain list instead, because they would be too small to read.
 */
export function ScatteredArc({ heading, sub, body, labels, listLabel, rtl }: { heading: string; sub: string; body: string; labels: string[]; listLabel: string; rtl: boolean }) {
  const W = 1000, H = 640, cx = 500, cy = 545, R = 300;
  const n = labels.length;
  // From the far left (190°) over the top to the far right (350°), measured clockwise from 3 o'clock in SVG.
  const angles = labels.map((_, i) => 190 + (160 * i) / (n - 1));
  const ordered = rtl ? [...labels].reverse() : labels;
  return (
    <section aria-labelledby="sa-h" className="mt-20 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="hidden w-full md:block" direction="ltr">
          {ordered.map((label, i) => {
            const a = angles[i];
            const rad = (a * Math.PI) / 180;
            const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
            const lx = cx + (R + 18) * Math.cos(rad), ly = cy + (R + 18) * Math.sin(rad);
            const left = a < 270; // labels on the left half are turned to read left to right
            const edge = Math.min(a - 190, 350 - a) / 80; // 0 at the ends, 1 at the top
            const opacity = 0.45 + 0.55 * Math.min(1, edge * 1.6);
            return (
              <g key={label} opacity={opacity}>
                <circle cx={x} cy={y} r={3.2} className={i % 4 === 1 ? "fill-gold-fill" : "fill-muted"} />
                <text x={lx} y={ly} transform={`rotate(${left ? a + 180 : a} ${lx} ${ly})`} textAnchor={left ? "end" : "start"} dominantBaseline="central" className="fill-muted text-[17px]">{label}</text>
              </g>
            );
          })}
        </svg>
        <div className="px-6 pb-8 pt-8 text-center md:absolute md:inset-x-0 md:bottom-0 md:pb-10 md:pt-0">
          <h2 id="sa-h" className="font-display text-3xl md:text-4xl">{heading}</h2>
          <p className="mt-1 text-lg md:text-xl">{sub}</p>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted">{body}</p>
        </div>
      </div>
      <ul aria-label={listLabel} className={cn("flex flex-wrap justify-center gap-2 px-6 pb-8 md:sr-only")}>
        {labels.map((l) => <li key={l} className="rounded-full border border-line px-3 py-1 text-sm text-muted">{l}</li>)}
      </ul>
    </section>
  );
}
