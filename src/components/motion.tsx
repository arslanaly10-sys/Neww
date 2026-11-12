"use client";
import { useEffect } from "react";
import { MotionConfig, motion, type Transition, type Variants } from "motion/react";

/**
 * Motion for the whole app. This is a finance tool, so motion stays quiet: short ease-out curves, no overshoot.
 * `reducedMotion="user"` drops transform and layout animation for people who ask for less motion (opacity stays).
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const ENTER: Transition = { duration: 0.32, ease: EASE_OUT };

export function MotionProvider({ children }: { children: React.ReactNode }) {
  // Tells the head script (JS_FLAG in the root layout) that the app is running, so it keeps animations switched on.
  useEffect(() => { (window as Window & { __zosReady?: boolean }).__zosReady = true; }, []);
  return <MotionConfig reducedMotion="user" transition={ENTER}>{children}</MotionConfig>;
}

/** Fades and lifts its content in once, on mount. */
export function Reveal({ children, className, delay = 0, y = 8 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div data-anim className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ ...ENTER, delay }}>
      {children}
    </motion.div>
  );
}

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const item: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: ENTER } };

/** A container whose StaggerItem children enter one after another. Keeps the caller's element and classes. */
export function Stagger({ children, className, as = "div", "aria-label": label }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "ul"; "aria-label"?: string }) {
  const M = motion[as];
  return <M className={className} aria-label={label} variants={group} initial="hidden" animate="show">{children}</M>;
}
export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const M = motion[as];
  return <M data-anim className={className} variants={item}>{children}</M>;
}

/** A horizontal bar that grows from the start edge (left in English, right in Arabic) to its width. */
export function GrowBar({ width, rtl, className, delay = 0 }: { width: string; rtl: boolean; className?: string; delay?: number }) {
  return (
    <motion.div
      data-anim
      className={className}
      style={{ width, originX: rtl ? 1 : 0 }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
    />
  );
}
