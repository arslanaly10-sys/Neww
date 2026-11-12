"use client";
import { useSyncExternalStore } from "react";
import BlurText from "./react-bits/TextAnimations/BlurText/BlurText";
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

/** A quiet field of dots behind the sign-in hero; dots near the pointer warm to gold. Decorative only. */
export function HeroDots({ className }: { className?: string }) {
  const p = usePalette();
  return (
    <div aria-hidden="true" className={className}>
      <DotGrid baseColor={p.line} activeColor={p.goldFill} dotSize={3} gap={26} proximity={140} fade={0.6} opacity={0.7} clickShock={false} />
    </div>
  );
}

// Words stay fully opaque and only come into focus, so the text keeps its full contrast for the whole animation.
const FOCUS_FROM = { filter: "blur(8px)", opacity: 1, y: 6 };
const FOCUS_TO = [{ filter: "blur(0px)", opacity: 1, y: 0 }];

/**
 * The page headline, blurred in word by word. A plain <h1> carries the text for screen readers and the page outline;
 * the animated copy is visual only (BlurText renders a <p>, which may not sit inside a heading).
 */
export function BlurHeadline({ text, className }: { text: string; className?: string }) {
  return (
    <>
      <h1 className="sr-only">{text}</h1>
      <div aria-hidden="true">
        <BlurText text={text} className={className} animateBy="words" delay={70} stepDuration={0.45} animationFrom={FOCUS_FROM} animationTo={FOCUS_TO} />
      </div>
    </>
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
