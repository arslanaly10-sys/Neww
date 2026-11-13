"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring", bounce: 0, visualDuration: 0.5 } as const;

/** A whole number that counts up to its value when first seen, and moves to a new value when it changes. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(() => String(Math.round(mv.get())));
  useEffect(() => { if (seen) { const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }); return () => c.stop(); } }, [seen, value, mv]);
  return <motion.span ref={ref} className={cn("num", className)}>{text}</motion.span>;
}

export interface RingSegment { key: string; label: string; color: string; assets: { id: string; name: string }[] }

/**
 * Occupancy as a ring. Segments draw in one after another; choosing one (on the ring or in the legend) lifts it,
 * shows its count in the middle and opens the list of its assets, each a link to the asset.
 */
export function OccupancyRing({ segments, title, totalLabel, hint, openLabel }: { segments: RingSegment[]; title: string; totalLabel: string; hint: string; openLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const [sel, setSel] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.assets.length, 0);
  const gap = 0.012;
  const present = segments.filter((s) => s.assets.length);
  const arcs = present.map((s, i) => ({ ...s, i, frac: s.assets.length / total, start: present.slice(0, i).reduce((n, x) => n + x.assets.length, 0) / total }));
  const cur = segments.find((s) => s.key === sel) ?? null;
  const id = useId();
  return (
    <div ref={ref}>
      <h3 id={`${id}-h`} className="mb-3 font-display text-xl">{title}</h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative size-44 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90 rtl:scale-x-[-1]" aria-hidden="true">
            <circle cx={60} cy={60} r={48} fill="none" className="stroke-surface-2" strokeWidth={14} />
            {arcs.map((a) => (
              <motion.circle key={a.key} cx={60} cy={60} r={48} fill="none" pathLength={1} strokeWidth={14} stroke={a.color}
                strokeDashoffset={-a.start} style={{ cursor: "pointer" }} onClick={() => setSel(sel === a.key ? null : a.key)}
                initial={{ strokeDasharray: "0 1", opacity: 1 }}
                animate={seen ? { strokeDasharray: `${Math.max(0, a.frac - gap)} 1`, opacity: sel && sel !== a.key ? 0.35 : 1, strokeWidth: sel === a.key ? 18 : 14 } : {}}
                transition={{ strokeDasharray: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 + a.i * 0.18 }, default: { duration: 0.25 } }} />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={cur?.key ?? "all"} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}>
                <CountUp value={cur ? cur.assets.length : total} className="block font-display text-3xl" />
                <span className="block max-w-24 text-xs text-muted">{cur ? cur.label : totalLabel}</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <ul aria-labelledby={`${id}-h`} className="min-w-40 flex-1 space-y-1">
          {segments.map((s) => (
            <li key={s.key}>
              <button type="button" aria-expanded={sel === s.key} aria-controls={`${id}-list`} disabled={!s.assets.length} onClick={() => setSel(sel === s.key ? null : s.key)}
                className={cn("flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-start text-sm disabled:opacity-50", sel === s.key ? "bg-surface-2 font-semibold" : "hover:bg-surface-2/60")}>
                <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1">{s.label}</span>
                <span className="num text-muted">{s.assets.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted">{hint}</p>
      <AnimatePresence initial={false}>
        {cur && (
          <motion.div key={cur.key} id={`${id}-list`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
            <ul aria-label={cur.label} className="mt-3 grid gap-1 sm:grid-cols-2">
              {cur.assets.map((a, i) => (
                <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.2 }}>
                  <Link href={`/asset/${a.id}`} className="group flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-gold-fill">
                    <span className="num text-muted">{a.id}</span><span className="flex-1 truncate">{a.name}</span>
                    <ArrowUpRight aria-hidden="true" size={14} className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100" />
                    <span className="sr-only">{openLabel}</span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface BarRow { id: string; name: string; value: number; valueText: string; gain: number; gainText: string }

/**
 * The largest holdings as bars. Switching between value and gain re-sorts them, and each bar slides to its new
 * place (a layout animation); the bars grow from the start edge. Every bar opens its asset.
 */
export function HoldingsRace({ rows, title, byValue, byGain, sortLabel, rtl }: { rows: BarRow[]; title: string; byValue: string; byGain: string; sortLabel: string; rtl: boolean }) {
  const [mode, setMode] = useState<"value" | "gain">("value");
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const key = mode === "value" ? "value" : "gain";
  const sorted = [...rows].sort((a, b) => b[key] - a[key]).slice(0, 8);
  const max = Math.max(...sorted.map((r) => Math.abs(r[key])), 1);
  const id = useId();
  return (
    <div ref={ref}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${id}-h`} className="font-display text-xl">{title}</h3>
        <div role="radiogroup" aria-label={sortLabel} className="relative flex rounded-md border border-line p-0.5 text-sm">
          {(["value", "gain"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("relative z-10 min-h-9 rounded px-3", mode === m ? "font-semibold text-gold" : "text-muted hover:text-text")}>
              {mode === m && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 -z-10 rounded bg-surface-2" transition={SPRING} />}
              {m === "value" ? byValue : byGain}
            </button>
          ))}
        </div>
      </div>
      <ol aria-labelledby={`${id}-h`} className="space-y-1.5">
        {sorted.map((r, i) => {
          const v = r[key];
          return (
            <motion.li key={r.id} layout transition={SPRING}>
              <Link href={`/asset/${r.id}`} className="group block rounded-md px-2 py-1.5 hover:bg-surface-2/60">
                <span className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate"><span className="num me-2 text-muted">{r.id}</span>{r.name}</span>
                  <span className={cn("num shrink-0", mode === "gain" && (v >= 0 ? "text-ok" : "text-danger"))}>{mode === "value" ? r.valueText : r.gainText}</span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.span className={cn("block h-full rounded-full", mode === "gain" && v < 0 ? "bg-danger" : "bg-gold-fill")} style={{ originX: rtl ? 1 : 0, width: `${(Math.abs(v) / max) * 100}%` }}
                    initial={{ scaleX: 0 }} animate={{ scaleX: seen ? 1 : 0 }} transition={{ ...SPRING, delay: seen ? i * 0.04 : 0 }} />
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

export interface LinePoint { label: string; value: number; cost: number; valueText: string; costText: string }

/**
 * Value against cost over time. Both lines draw themselves in when seen; moving the pointer (or the arrow keys)
 * scrubs along the months and reads out that month's figures.
 */
export function ValueLine({ points, title, valueLabel, costLabel, scrubLabel }: { points: LinePoint[]; title: string; valueLabel: string; costLabel: string; scrubLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const [idx, setIdx] = useState(points.length - 1);
  const W = 1000, H = 260, P = 10;
  const max = Math.max(...points.map((p) => Math.max(p.value, p.cost))) * 1.05;
  const min = Math.min(...points.map((p) => Math.min(p.value, p.cost))) * 0.9;
  const X = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const Y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const path = (k: "value" | "cost") => points.map((p, i) => `${i ? "L" : "M"} ${X(i).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(" ");
  const area = `${path("value")} L ${X(points.length - 1)} ${H - P} L ${X(0)} ${H - P} Z`;
  const p = points[idx];
  const id = useId();
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    setIdx(Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))));
  };
  return (
    <div ref={ref}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`${id}-h`} className="font-display text-xl">{title}</h3>
        <p aria-live="polite" className="text-sm"><span className="text-muted">{p.label}: </span><span className="font-semibold text-gold">{valueLabel} <span className="num">{p.valueText}</span></span><span className="text-muted">, {costLabel} <span className="num">{p.costText}</span></span></p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gold-fill" direction="ltr"
        role="slider" tabIndex={0} aria-label={scrubLabel} aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={idx} aria-valuetext={`${p.label}: ${valueLabel} ${p.valueText}, ${costLabel} ${p.costText}`}
        onPointerMove={onMove} onPointerDown={onMove}
        onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.min(points.length - 1, i + 1)); } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === "Home") setIdx(0); if (e.key === "End") setIdx(points.length - 1); }}>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--gold-fill)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--gold-fill)" stopOpacity={0} /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} className="stroke-line" strokeDasharray="2 4" />)}
        <motion.path d={area} fill={`url(#${id}-g)`} initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: 0.8, delay: 0.9 }} />
        <motion.path d={path("cost")} fill="none" className="stroke-muted" strokeWidth={1.5} initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.2, ease: "easeInOut" }} />
        <motion.path d={path("value")} fill="none" className="stroke-gold-fill" strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.4, ease: "easeInOut", delay: 0.15 }} />
        <motion.g initial={false} animate={{ x: X(idx) }} transition={{ type: "spring", bounce: 0, visualDuration: 0.2 }}>
          <line x1={0} x2={0} y1={P} y2={H - P} className="stroke-line" />
        </motion.g>
        <motion.circle r={5} className="fill-gold-fill stroke-surface" strokeWidth={2} initial={false} animate={{ cx: X(idx), cy: Y(p.value) }} transition={{ type: "spring", bounce: 0, visualDuration: 0.2 }} />
        <motion.circle r={4} className="fill-surface stroke-muted" strokeWidth={1.5} initial={false} animate={{ cx: X(idx), cy: Y(p.cost) }} transition={{ type: "spring", bounce: 0, visualDuration: 0.2 }} />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{points[0].label}</span><span>{points[points.length - 1].label}</span></div>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-5 rounded bg-gold-fill" />{valueLabel}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-5 rounded bg-muted" />{costLabel}</span>
      </p>
    </div>
  );
}
