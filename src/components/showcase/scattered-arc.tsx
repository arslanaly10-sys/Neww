"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { ArrowDown, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ArcItem { label: string; how: string }
interface Copy { heading: string; sub: string; body: string; listLabel: string; how: string; today: string; tryIt: string; close: string; hint: string }

const W = 1000, H = 640, CX = 500, CY = 545, R = 300;
const rot = (a: number) => `rotate(${a.toFixed(2)} ${CX} ${CY})`;

/** Writes an angle motion value into an SVG rotate() attribute about the arc's centre, frame by frame. */
function useRotateAttr(angle: MotionValue<number>) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => angle.on("change", (v) => ref.current?.setAttribute("transform", rot(v))), [angle]);
  return ref;
}

function Pulse() {
  const angle = useMotionValue(190);
  const ref = useRotateAttr(angle);
  useEffect(() => { const c = animate(angle, [190, 350], { duration: 9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }); return () => c.stop(); }, [angle]);
  return (
    <g ref={ref} transform={rot(190)} aria-hidden="true">
      <circle cx={CX + R - 26} cy={CY} r={4} className="fill-gold-fill" />
      <circle cx={CX + R - 26} cy={CY} r={10} className="fill-gold-fill" opacity={0.18} />
    </g>
  );
}

function Label({ it, i, a, on, dim, seen, delay, reduce, onPick }: { it: ArcItem; i: number; a: number; on: boolean; dim: boolean; seen: boolean; delay: number; reduce: boolean; onPick: () => void }) {
  const angle = useMotionValue(reduce ? a : 270);
  const ref = useRotateAttr(angle);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { angle.jump(a); return; }
    const c = animate(angle, a, { ...SPRING, delay });
    return () => c.stop();
  }, [seen, a, reduce, delay, angle]);
  const left = a < 270;
  const edge = Math.min(a - 190, 350 - a) / 80;
  const rest = 0.5 + 0.5 * Math.min(1, edge * 1.6);
  const flip = left ? `rotate(180 ${CX + R + 18} ${CY})` : undefined;
  const w = it.label.length * 8.6 + 40;
  return (
    <g ref={ref} transform={rot(reduce ? a : 270)}>
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: seen ? (dim ? 0.3 : rest) : 0 }} transition={{ duration: 0.4, delay: seen && !on && !dim ? delay : 0 }}
      role="button" tabIndex={0} aria-pressed={on} aria-label={it.label} className="cursor-pointer outline-none [&:focus-visible_.ring]:opacity-100 [&:hover_text]:fill-[var(--text)]"
      onClick={onPick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}>
      <rect x={CX + R - 12} y={CY - 15} width={w} height={30} rx={8} className="ring pointer-events-none fill-transparent stroke-gold-fill opacity-0" transform={flip} />
      <rect x={CX + R - 12} y={CY - 15} width={w} height={30} fill="transparent" transform={flip} />
      <motion.circle cx={CX + R} cy={CY} className={i % 4 === 1 || on ? "fill-gold-fill" : "fill-muted"} initial={false} animate={{ r: on ? 6 : 3.4 }} />
      <text x={CX + R + 18} y={CY} dominantBaseline="central" textAnchor={left ? "end" : "start"} transform={flip} className={cn("text-[17px] transition-colors", on ? "fill-gold font-semibold" : "fill-muted")}>{it.label}</text>
    </motion.g>
    </g>
  );
}
const SPRING = { type: "spring", bounce: 0.15, visualDuration: 0.7 } as const;

/**
 * Where a portfolio's records live today, fanned out on an arc around the problem statement. The labels open like a
 * fan when the section scrolls into view, a gold pulse runs along the arc, and each source is a button: choosing one
 * draws a line to the centre and shows what ZMNHOOF OS does with it. Phones get the same sources as a list of buttons.
 */
export function ScatteredArc({ items, copy, rtl }: { items: ArcItem[]; copy: Copy; rtl: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const reduce = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const seen = useInView(svg, { once: true, amount: 0.3 });
  const n = items.length;
  // From the far left (190°) over the top to the far right (350°). In Arabic the first source sits on the right.
  const angleOf = (i: number) => 190 + (160 * (rtl ? n - 1 - i : i)) / (n - 1);
  const pick = (i: number) => { setTouched(true); setSel((s) => (s === i ? null : i)); };
  const cur = sel === null ? null : items[sel];

  return (
    <section aria-labelledby="sa-h" className="mt-20 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={copy.listLabel} className="hidden w-full select-none md:block" direction="ltr">
          <motion.path d={arcPath(R - 26, 186, 354)} fill="none" className="stroke-line" strokeWidth={1} strokeDasharray="2 6"
            initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.4, ease: "easeOut" }} />
          {!reduce && seen && <Pulse />}
          <AnimatePresence>
            {cur && sel !== null && (
              <motion.path key={sel} d={`M ${pt(angleOf(sel), R).x} ${pt(angleOf(sel), R).y} Q ${CX} ${CY - 120} ${CX} ${CY - 70}`} fill="none" className="stroke-gold-fill" strokeWidth={1.5}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />
            )}
          </AnimatePresence>
          {items.map((it, i) => (
            <Label key={it.label} it={it} i={i} a={angleOf(i)} on={sel === i} dim={sel !== null && sel !== i} seen={seen} reduce={!!reduce}
              delay={touched ? 0 : 0.05 * Math.abs(i - (n - 1) / 2)} onPick={() => pick(i)} />
          ))}
        </svg>

        <div className="px-6 pb-8 pt-8 text-center md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:pb-8 md:pt-0 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_[role=region]]:pointer-events-auto">
          <AnimatePresence mode="wait" initial={false}>
            {cur ? (
              <motion.div key={`d-${sel}`} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                className="relative mx-auto max-w-xl rounded-xl border border-gold-fill/60 bg-surface p-5 text-start shadow-md" role="region" aria-live="polite" aria-label={cur.label}>
                <button type="button" onClick={() => setSel(null)} aria-label={copy.close} className="absolute end-2 top-2 grid size-10 place-items-center rounded-md hover:bg-surface-2"><X aria-hidden="true" size={16} /></button>
                <p className="text-sm text-muted">{copy.today}</p>
                <p className="font-display text-2xl">{cur.label}</p>
                <p className="mt-3 text-sm font-semibold text-gold">{copy.how}</p>
                <p className="mt-1">{cur.how}</p>
                <a href="#signin" className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-gold underline underline-offset-4">{copy.tryIt}<ArrowDown aria-hidden="true" size={14} /></a>
              </motion.div>
            ) : (
              <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h2 id="sa-h" className="font-display text-3xl md:text-4xl">{copy.heading}</h2>
                <p className="mt-1 text-lg md:text-xl">{copy.sub}</p>
                <p className="mx-auto mt-4 max-w-xl text-sm text-muted">{copy.body}</p>
                <p className="mt-2 text-xs text-muted">{copy.hint}</p>
              </motion.div>
            )}
          </AnimatePresence>
          {cur && <h2 id="sa-h" className="sr-only">{copy.heading}</h2>}
        </div>
      </div>
      <ul aria-label={copy.listLabel} className="flex flex-wrap justify-center gap-2 px-6 pb-8 md:hidden">
        {items.map((it, i) => (
          <li key={it.label}>
            <button type="button" aria-pressed={sel === i} onClick={() => pick(i)} className={cn("min-h-10 rounded-full border px-3 text-sm", sel === i ? "border-gold bg-gold-fill text-on-gold" : "border-line text-muted hover:bg-surface-2")}>{it.label}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function pt(a: number, r: number) { const rad = (a * Math.PI) / 180; return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }; }
function arcPath(r: number, from: number, to: number) { const s = pt(from, r), e = pt(to, r); return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`; }
