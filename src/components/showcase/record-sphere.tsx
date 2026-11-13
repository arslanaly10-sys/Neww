"use client";
import { useEffect, useRef } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Capability { title: string; note: string; built: boolean }

/**
 * A sphere of dots that turns slowly, with one card at its centre: the single portfolio record. Purely decorative:
 * the card and the two lists around it carry all the meaning in text. With reduced motion it is drawn once and stays
 * still; it only animates while on screen.
 */
function DotSphere({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // A Fibonacci sphere: evenly spread points. About one in fourteen is gold.
    const N = 900;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, gold: i % 14 === 3 };
    });
    let colors = { dot: "#8a8a8a", gold: "#c9a45c" };
    const readColors = () => {
      const s = getComputedStyle(canvas);
      colors = { dot: s.getPropertyValue("--muted").trim() || colors.dot, gold: s.getPropertyValue("--gold-fill").trim() || colors.gold };
    };
    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (angle: number) => {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) / 2 - 4;
      const cx = w / 2, cy = h / 2;
      const c = Math.cos(angle), s = Math.sin(angle), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (const p of pts) {
        const x = p.x * c + p.z * s;
        const z0 = -p.x * s + p.z * c;
        const y = p.y * ct - z0 * st;
        const z = p.y * st + z0 * ct;
        const depth = (z + 1) / 2; // 0 back, 1 front
        ctx.globalAlpha = p.gold ? 0.35 + depth * 0.65 : 0.12 + depth * 0.55;
        ctx.fillStyle = p.gold ? colors.gold : colors.dot;
        ctx.beginPath();
        ctx.arc(cx + x * R, cy + y * R, (p.gold ? 1.5 : 1) + depth * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    readColors(); resize();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let angle = 0.6, raf = 0, last = 0, visible = true;
    const tick = (t: number) => {
      if (last) angle += Math.min(50, t - last) * 0.00008;
      last = t;
      draw(angle);
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    });
    if (still) draw(angle); else { io.observe(canvas); raf = requestAnimationFrame(tick); }
    const ro = new ResizeObserver(() => { resize(); draw(angle); });
    ro.observe(canvas);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { readColors(); draw(angle); };
    mq.addEventListener("change", onScheme);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); mq.removeEventListener("change", onScheme); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className={cn("block size-full", className)} />;
}

function List({ items, side, builtLabel, plannedLabel }: { items: Capability[]; side: "start" | "end"; builtLabel: string; plannedLabel: string }) {
  return (
    <ul className={cn("flex flex-col gap-5", side === "start" ? "lg:items-end lg:text-end" : "lg:items-start")}>
      {items.map((x) => (
        <li key={x.title} className="max-w-sm">
          <p className={cn("flex items-center gap-2 font-semibold", side === "start" && "lg:flex-row-reverse")}>
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", x.built ? "bg-gold-fill" : "bg-muted")} />{x.title}
          </p>
          <p className={cn("mt-1 flex items-start gap-1.5 text-sm text-muted", side === "start" && "lg:flex-row-reverse")}>
            {x.built ? <CheckCircle2 aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-ok" /> : <Clock aria-hidden="true" size={15} className="mt-0.5 shrink-0" />}
            <span><span className="sr-only">{x.built ? builtLabel : plannedLabel}: </span>{x.note}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** "What goes in, what comes out": capabilities around the one record, each marked built or planned, honestly. */
export function RecordSphere({ heading, lead, center, centerSub, inputs, outputs, inputsLabel, outputsLabel, builtLabel, plannedLabel }: {
  heading: string; lead: string; center: string; centerSub: string; inputs: Capability[]; outputs: Capability[]; inputsLabel: string; outputsLabel: string; builtLabel: string; plannedLabel: string;
}) {
  return (
    <section aria-labelledby="rs-h" className="mt-20">
      <h2 id="rs-h" className="font-display text-3xl">{heading}</h2>
      <p className="mt-2 max-w-xl text-muted">{lead}</p>
      <div className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)_minmax(0,1fr)] lg:gap-6">
        <div className="order-2 lg:order-1"><h3 className="mb-4 text-sm font-semibold text-gold lg:sr-only">{inputsLabel}</h3><List items={inputs} side="start" builtLabel={builtLabel} plannedLabel={plannedLabel} /></div>
        <div className="relative order-1 mx-auto aspect-square w-full max-w-[24rem] lg:order-2">
          <DotSphere />
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="rounded-xl border border-gold-fill/70 bg-surface/90 px-6 py-4 text-center shadow-md backdrop-blur-sm">
              <p className="font-display text-lg">{center}</p>
              <p className="text-sm text-muted">{centerSub}</p>
            </div>
          </div>
        </div>
        <div className="order-3"><h3 className="mb-4 text-sm font-semibold text-gold lg:sr-only">{outputsLabel}</h3><List items={outputs} side="end" builtLabel={builtLabel} plannedLabel={plannedLabel} /></div>
      </div>
    </section>
  );
}
