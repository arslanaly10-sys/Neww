"use client";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The value range as a band on a scale, with the most likely value marked; an optional marker for what was paid.
 * The band grows from its centre when seen. Labels are real text beside it; the drawing is decorative.
 */
export function RangeBar({ low, high, value, paid, labels }: { low: number; high: number; value: number; paid?: number | null; labels: { low: string; high: string; value: string; paid?: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const lo = Math.min(low, paid ?? low) * 0.9, hi = Math.max(high, paid ?? high) * 1.1;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div ref={ref} className="space-y-2">
      <div aria-hidden="true" className="relative h-14" dir="ltr">
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-surface-2" />
        <motion.div className="absolute top-5 h-4 rounded-full bg-gold-fill/40 ring-1 ring-gold-fill" style={{ left: `${x(low)}%`, width: `${x(high) - x(low)}%`, originX: 0.5 }}
          initial={{ scaleX: 0 }} animate={{ scaleX: seen ? 1 : 0 }} transition={{ duration: 0.9, ease: EASE }} />
        <motion.div className="absolute top-2 -ms-px h-10 w-0.5 rounded bg-gold-fill" style={{ left: `${x(value)}%` }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : -6 }} transition={{ duration: 0.4, delay: 0.7 }} />
        {paid ? <motion.div className="absolute top-3 -ms-1 size-2.5 rotate-45 border border-text bg-surface" style={{ left: `${x(paid)}%` }} initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay: 0.9 }} /> : null}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>{labels.low}</span><span className="font-semibold text-gold">{labels.value}</span><span>{labels.high}</span></div>
      {paid && labels.paid ? <p className="flex items-center gap-2 text-xs text-muted"><span aria-hidden="true" className="inline-block size-2 rotate-45 border border-text" />{labels.paid}</p> : null}
    </div>
  );
}

/** Confidence as a dial that fills to its score. The score and level are written in the middle. */
export function ConfidenceDial({ score, level, label }: { score: number; level: "high" | "medium" | "low"; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const tone = level === "high" ? "stroke-ok" : level === "medium" ? "stroke-gold-fill" : "stroke-danger";
  return (
    <div ref={ref} className="relative size-32 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx={60} cy={60} r={50} fill="none" className="stroke-surface-2" strokeWidth={10} />
        <motion.circle cx={60} cy={60} r={50} fill="none" className={cn(tone)} strokeWidth={10} strokeLinecap="round" pathLength={1}
          initial={{ pathLength: 0 }} animate={{ pathLength: seen ? score / 100 : 0 }} transition={{ duration: 1.1, ease: EASE }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><span className="num block font-display text-3xl">{score}</span><span className="block text-xs text-muted">{label}</span></div></div>
    </div>
  );
}
