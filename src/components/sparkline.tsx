/** Inline SVG sparkline. Time always runs left to right, also in Arabic, as in Egyptian financial charts. */
export function Sparkline({ values, label, tone = "var(--teal)" }: { values: number[]; label: string; tone?: string }) {
  const w = 120, h = 32, pad = 2;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(pad + (i / (values.length - 1)) * (w - pad * 2)).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
