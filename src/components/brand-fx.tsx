"use client";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import DotGrid from "./react-bits/Backgrounds/DotGrid/DotGrid";
import ShinyText from "./react-bits/TextAnimations/ShinyText/ShinyText";
import SpotlightCard from "./react-bits/Components/SpotlightCard/SpotlightCard";
import StatusMark from "./react-bits/Micro/StatusMark/StatusMark";

/**
 * React Bits effects dressed in the ZMNHOOF palette. Some of these components only take literal colours (they draw
 * to a canvas), so the palette below mirrors the tokens in globals.css and follows the visitor's colour scheme.
 * Every effect respects prefers-reduced-motion on its own.
 */
const PALETTE = {
  light: { text: "#14120e", line: "#d8cfba", gold: "#7a5a14", goldFill: "#c9a45c" },
  dark: { text: "#efe8d8", line: "#2a2e36", gold: "#c9a45c", goldFill: "#c9a45c" },
} as const;

const DARK = "(prefers-color-scheme: dark)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(DARK);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
function usePalette() {
  const dark = useSyncExternalStore(subscribe, () => window.matchMedia(DARK).matches, () => false);
  return PALETTE[dark ? "dark" : "light"];
}

// Whether this browser can draw WebGL at all (checked once). The server assumes it can.
let webgl: boolean | undefined;
const hasWebGL = () => {
  if (webgl === undefined) {
    try { const c = document.createElement("canvas"); webgl = Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { webgl = false; }
  }
  return webgl;
};
const noSubscribe = () => () => {};

/**
 * A quiet field of dots behind the sign-in hero; dots near the pointer warm to gold. Decorative only.
 * Without WebGL (no support, or the context is lost) the same dots show as a still CSS pattern; globals.css shows it
 * too when JavaScript is not running.
 */
export function HeroDots({ className }: { className?: string }) {
  const p = usePalette();
  const gl = useSyncExternalStore(noSubscribe, hasWebGL, () => true);
  const [lost, setLost] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const onLost = () => setLost(true);
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  const live = gl && !lost;
  return (
    <div ref={ref} aria-hidden="true" className={`hero-dots ${className ?? ""}`} data-still={live ? undefined : ""}>
      {live && <DotGrid baseColor={p.line} activeColor={p.goldFill} dotSize={3} gap={26} proximity={140} fade={0.6} opacity={0.7} clickShock={false} />}
    </div>
  );
}

/**
 * The page headline as a real, visible <h1> whose words come into focus one after another (the BlurText look, built
 * with Motion so it can live inside a heading). Words stay fully opaque, so the text keeps its contrast throughout;
 * data-anim lets globals.css show them at rest when JavaScript is not running.
 */
export function BlurHeadline({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <h1 className={className}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <motion.span
            data-anim
            className="inline-block"
            initial={{ filter: "blur(8px)", y: 6 }}
            animate={{ filter: "blur(0px)", y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </h1>
  );
}

/** A slow gold sheen across a label, for the AI entry point. The text stays real text. */
export function Sheen({ children }: { children: string }) {
  const p = usePalette();
  return <ShinyText text={children} color={p.text} shineColor={p.gold} speed={3.5} delay={4} glow={0} />;
}

/** A card with a soft gold light that follows the pointer, drawn on the app's own surface and border tokens. */
export function GlowCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <SpotlightCard
      theme="light"
      spotlightColor={PALETTE.dark.goldFill}
      intensity={0.5}
      className={className}
      style={{ "--spotlight-card-surface": "var(--surface)", "--spotlight-card-border": "var(--line)", "--spotlight-card-shadow": "none" } as React.CSSProperties}
    >
      {children}
    </SpotlightCard>
  );
}

/**
 * The audit chain's state as a drawn mark: it spins while a check runs, then draws a check or a failure mark.
 * Purely visual; the words next to it say the same thing for everyone.
 */
export function ChainMark({ state }: { state: "running" | "ok" | "bad" }) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <StatusMark status={state === "running" ? "running" : state === "ok" ? "done" : "failed"} color="var(--muted)" doneColor="var(--ok)" errorColor="var(--danger)" size={18} />
    </span>
  );
}
