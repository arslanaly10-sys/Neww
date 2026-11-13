"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion } from "motion/react";
import { ArrowDown, CheckCircle2, Clock, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Capability { id: string; title: string; note: string; detail: string; built: boolean }
interface Copy { heading: string; lead: string; center: string; centerSub: string; inputs: string; outputs: string; built: string; planned: string; hint: string; tryIt: string; close: string }

const N = 900;
const POINTS = Array.from({ length: N }, (_, i) => {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = Math.PI * (3 - Math.sqrt(5)) * i;
  // Where the dot starts before the sphere gathers: scattered outwards in its own direction.
  const spread = 1.5 + ((i * 7919) % 100) / 60;
  return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, gold: i % 14 === 3, spread };
});

/**
 * The dot sphere, drawn on a canvas each frame from Motion values: `angle` turns it, `gather` pulls scattered dots
 * into the sphere when it first comes into view, `glow` brightens the gold dots while a line is chosen. Dragging
 * spins it; it settles back to its slow turn with a spring. With reduced motion it is drawn once, gathered and still.
 */
function DotSphere({ glowOn }: { glowOn: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { amount: 0.25 });
  const reduce = useReducedMotion();
  const angle = useMotionValue(0.6);
  const speed = useMotionValue(0.00008);
  const gather = useMotionValue(reduce ? 1 : 0);
  const glow = useMotionValue(0);
  const size = useRef({ w: 0, h: 0, ctx: null as CanvasRenderingContext2D | null, dot: "#888", gold: "#c9a45c" });

  const draw = useCallback(() => {
    const s = size.current;
    const ctx = s.ctx;
    if (!ctx) return;
    const { w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) / 2 - 6, cx = w / 2, cy = h / 2;
    const a = angle.get(), g = gather.get(), gl = glow.get();
    const c = Math.cos(a), sn = Math.sin(a), ct = Math.cos(0.32), st = Math.sin(0.32);
    for (let i = 0; i < N; i++) {
      const p = POINTS[i];
      const x = p.x * c + p.z * sn;
      const z0 = -p.x * sn + p.z * c;
      const y = p.y * ct - z0 * st;
      const z = p.y * st + z0 * ct;
      const depth = (z + 1) / 2;
      const k = p.spread + (1 - p.spread) * g; // 1 once gathered
      ctx.globalAlpha = (p.gold ? 0.35 + depth * 0.65 + gl * 0.3 : 0.12 + depth * 0.55 - gl * 0.08) * (0.25 + 0.75 * g);
      ctx.fillStyle = p.gold ? s.gold : s.dot;
      ctx.beginPath();
      ctx.arc(cx + x * R * k, cy + y * R * k, (p.gold ? 1.5 + gl * 0.8 : 1) + depth * 0.9, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [angle, gather, glow]);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const s = size.current;
    s.ctx = el.getContext("2d");
    const colors = () => { const cs = getComputedStyle(el); s.dot = cs.getPropertyValue("--muted").trim() || s.dot; s.gold = cs.getPropertyValue("--gold-fill").trim() || s.gold; };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      s.w = el.clientWidth; s.h = el.clientHeight;
      el.width = Math.round(s.w * dpr); el.height = Math.round(s.h * dpr);
      s.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    colors(); resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { colors(); draw(); };
    mq.addEventListener("change", onScheme);
    return () => { ro.disconnect(); mq.removeEventListener("change", onScheme); };
  }, [draw]);

  // Gather the dots the first time the sphere is seen.
  useEffect(() => {
    if (!inView || reduce || gather.get() > 0) return;
    const c = animate(gather, 1, { duration: 1.8, ease: [0.22, 1, 0.36, 1], onUpdate: draw });
    return () => c.stop();
  }, [inView, reduce, gather, draw]);
  useEffect(() => {
    const c = animate(glow, glowOn ? 1 : 0, { duration: 0.4, onUpdate: draw });
    return () => c.stop();
  }, [glowOn, glow, draw]);

  useAnimationFrame((_, delta) => {
    if (!inView || reduce) return;
    angle.set(angle.get() + speed.get() * Math.min(delta, 50));
    draw();
  });

  return (
    <motion.div ref={wrap} className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing" aria-hidden="true"
      onPan={(_, info) => { if (!reduce) { speed.set(info.delta.x * 0.0009); } }}
      onPanEnd={(_, info) => { if (!reduce) { speed.set(info.velocity.x * 0.000004); animate(speed, 0.00008, { type: "spring", bounce: 0, visualDuration: 1.6 }); } }}>
      <canvas ref={canvas} className="block size-full" />
    </motion.div>
  );
}

/** "What goes in, what comes out": choose a line to open it in the centre; a flow line joins it to the sphere. */
export function RecordSphere({ inputs, outputs, copy }: { inputs: Capability[]; outputs: Capability[]; copy: Copy }) {
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const sphere = useRef<HTMLDivElement>(null);
  const dots = useRef(new Map<string, HTMLElement>());
  const [line, setLine] = useState<{ d: string; w: number; h: number } | null>(null);
  const active = hover ?? sel;
  const cur = [...inputs, ...outputs].find((x) => x.id === sel) ?? null;
  const side = cur ? (inputs.some((x) => x.id === cur.id) ? copy.inputs : copy.outputs) : "";

  // The flow line: from the chosen line's bullet to the edge of the sphere, curving in. Measured from the layout.
  useLayoutEffect(() => {
    const measure = () => {
      const g = grid.current, s = sphere.current, d = active ? dots.current.get(active) : null;
      if (!g || !s || !d || window.innerWidth < 1024) { setLine(null); return; }
      const G = g.getBoundingClientRect(), S = s.getBoundingClientRect(), D = d.getBoundingClientRect();
      const x1 = D.left + D.width / 2 - G.left, y1 = D.top + D.height / 2 - G.top;
      const cx = S.left + S.width / 2 - G.left, cy = S.top + S.height / 2 - G.top;
      const r = S.width / 2 - 8;
      const ang = Math.atan2(y1 - cy, x1 - cx);
      const x2 = cx + Math.cos(ang) * r, y2 = cy + Math.sin(ang) * r;
      const mx = (x1 + x2) / 2;
      setLine({ d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, w: G.width, h: G.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  const list = (items: Capability[], start: boolean) => (
    <ul className={cn("flex flex-col gap-2", start ? "lg:items-end lg:text-end" : "lg:items-start")}>
      {items.map((x, i) => {
        const on = sel === x.id;
        return (
          <motion.li key={x.id} className="w-full max-w-sm" initial={{ opacity: 0, x: start ? -24 : 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.5 }}
            transition={{ type: "spring", bounce: 0, visualDuration: 0.5, delay: i * 0.06 }}>
            <motion.button type="button" aria-expanded={on} aria-controls="rs-detail" onClick={() => { setSel(on ? null : x.id); if (!on && window.innerWidth < 1024) sphere.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}
              onMouseEnter={() => setHover(x.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(x.id)} onBlur={() => setHover(null)}
              whileHover={{ x: start ? -4 : 4 }} whileTap={{ scale: 0.98 }}
              className={cn("w-full rounded-lg px-3 py-2 text-start transition-colors", start && "lg:text-end", on ? "bg-surface-2" : "hover:bg-surface-2/60")}>
              <span className={cn("flex items-center gap-2 font-semibold", start && "lg:flex-row-reverse", on && "text-gold")}>
                <span ref={(el) => { if (el) dots.current.set(x.id, el); }} aria-hidden="true" className={cn("relative size-2 shrink-0 rounded-full", x.built ? "bg-gold-fill" : "bg-muted")}>
                  {on && <motion.span layoutId="rs-ping" className="absolute -inset-1.5 rounded-full border border-gold-fill" />}
                </span>
                {x.title}
              </span>
              <span className={cn("mt-1 flex items-start gap-1.5 text-sm font-normal text-muted", start && "lg:flex-row-reverse")}>
                {x.built ? <CheckCircle2 aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-ok" /> : <Clock aria-hidden="true" size={15} className="mt-0.5 shrink-0" />}
                <span><span className="sr-only">{x.built ? copy.built : copy.planned}: </span>{x.note}</span>
              </span>
            </motion.button>
          </motion.li>
        );
      })}
    </ul>
  );

  return (
    <section aria-labelledby="rs-h" className="mt-20">
      <h2 id="rs-h" className="font-display text-3xl">{copy.heading}</h2>
      <p className="mt-2 max-w-xl text-muted">{copy.lead}</p>
      <p className="mt-1 text-xs text-muted">{copy.hint}</p>
      <div ref={grid} className="relative mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)_minmax(0,1fr)] lg:gap-6">
        {line && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 hidden lg:block" width={line.w} height={line.h} viewBox={`0 0 ${line.w} ${line.h}`}>
            <motion.path key={line.d} d={line.d} fill="none" className="stroke-gold-fill" strokeWidth={1.5} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.45, ease: "easeOut" }} />
            <motion.path key={`c-${line.d}`} d={line.d} pathLength={1} fill="none" className="stroke-gold-fill" strokeWidth={4} strokeLinecap="round" strokeDasharray="0.04 0.96"
              initial={{ strokeDashoffset: 1 }} animate={{ strokeDashoffset: [1, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.45 }} />
          </svg>
        )}
        <div className="order-2 lg:order-1"><h3 className="mb-3 px-3 text-sm font-semibold text-gold lg:sr-only">{copy.inputs}</h3>{list(inputs, true)}</div>
        <motion.div ref={sphere} className="relative order-1 mx-auto aspect-square w-full max-w-[26rem] lg:order-2"
          initial={{ opacity: 0, scale: 0.92 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.8 }}>
          <DotSphere glowOn={!!active} />
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
            <motion.div layout id="rs-detail" role="region" aria-live="polite" aria-label={cur ? cur.title : copy.center}
              className={cn("pointer-events-auto rounded-xl border bg-surface/90 text-center shadow-md backdrop-blur-sm", cur ? "w-full max-w-[19rem] border-gold-fill p-5 text-start" : "border-gold-fill/70 px-6 py-4")}
              transition={{ type: "spring", bounce: 0, visualDuration: 0.35 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                {cur ? (
                  <motion.div key={cur.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="relative">
                    <button type="button" onClick={() => setSel(null)} aria-label={copy.close} className="absolute -end-3 -top-3 grid size-10 place-items-center rounded-md hover:bg-surface-2"><X aria-hidden="true" size={16} /></button>
                    <p className="text-xs text-muted">{side}</p>
                    <p className="pe-6 font-display text-lg">{cur.title}</p>
                    <p className={cn("mt-1 flex items-center gap-1.5 text-xs font-semibold", cur.built ? "text-ok" : "text-muted")}>{cur.built ? <CheckCircle2 aria-hidden="true" size={13} /> : <Clock aria-hidden="true" size={13} />}{cur.built ? copy.built : copy.planned}</p>
                    <p className="mt-2 text-sm">{cur.detail}</p>
                    {cur.built && <a href="#signin" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm text-gold underline underline-offset-4">{copy.tryIt}<ArrowDown aria-hidden="true" size={14} /></a>}
                  </motion.div>
                ) : (
                  <motion.div key="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <p className="font-display text-lg">{copy.center}</p>
                    <p className="text-sm text-muted">{copy.centerSub}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
        <div className="order-3"><h3 className="mb-3 px-3 text-sm font-semibold text-gold lg:sr-only">{copy.outputs}</h3>{list(outputs, false)}</div>
      </div>
    </section>
  );
}
