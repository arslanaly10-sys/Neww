"use client";
import { Fragment, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowDown } from "lucide-react";
import { BrandEye } from "../brand";

interface Chip { label: string; title: string; note: string }

const EASE = [0.22, 1, 0.36, 1] as const;

/** One headline line whose words come into focus one after another. Stays real, readable text throughout. */
function Line({ text, delay, className }: { text: string; delay: number; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i, a) => (
        <Fragment key={i}>
          <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span data-anim className="inline-block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.08 }}>{w}</motion.span>
          </span>
          {i < a.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The sign-in hero in the zmnhoof.com look: the gold eye inside slowly turning orbits, three notes that drift in
 * around it, and a headline that rises word by word. The eye leans toward the pointer. With reduced motion everything
 * is shown at rest.
 */
export function LoginHero({ label, lineA, lineB, lead, cta, live, chips }: { label: string; lineA: string; lineB: string; lead: string; cta: string; live: string; chips: Chip[] }) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 80, damping: 18 }), sy = useSpring(py, { stiffness: 80, damping: 18 });
  const rotY = useTransform(sx, [-1, 1], [-10, 10]);
  const rotX = useTransform(sy, [-1, 1], [8, -8]);
  const driftX = useTransform(sx, [-1, 1], [-14, 14]);
  const driftXNeg = useTransform(sx, [-1, 1], [14, -14]);
  const driftY = useTransform(sy, [-1, 1], [-10, 10]);
  const onMove = (e: React.PointerEvent) => {
    if (reduce || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const spin = (s: number, dir = 1) => (reduce ? {} : { animate: { rotate: dir * 360 }, transition: { duration: s, repeat: Infinity, ease: "linear" as const } });
  const pos = ["start-0 top-[30%]", "end-0 top-[58%]", "start-[12%] bottom-0"];

  return (
    <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onPointerMove={onMove} onPointerLeave={() => { px.set(0); py.set(0); }}>
      <div className="relative z-10">
        <motion.p data-anim className="flex items-center gap-3 text-sm text-gold" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <motion.span aria-hidden="true" className="h-px w-10 bg-gold-fill" style={{ originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }} />
          {label}
        </motion.p>
        <h1 className="mt-6 font-display text-5xl leading-[1.05] md:text-7xl">
          <Line text={lineA} delay={0.15} className="block" />
          <Line text={lineB} delay={0.4} className="block italic text-gold rtl:not-italic" />
        </h1>
        <motion.p data-anim className="mt-6 max-w-md text-lg text-muted" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.8 }}>{lead}</motion.p>
        <motion.div data-anim className="mt-8 flex flex-wrap items-center gap-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.95 }}>
          <motion.a href="#signin" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-gold-fill px-6 text-sm font-semibold text-on-gold shadow-md">
            {cta}<ArrowDown aria-hidden="true" size={16} />
          </motion.a>
          <span className="flex items-center gap-2 text-xs text-muted">
            <span aria-hidden="true" className="relative flex size-2"><motion.span className="absolute inset-0 rounded-full bg-teal" animate={reduce ? {} : { scale: [1, 2.4], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity }} /><span className="relative size-2 rounded-full bg-teal" /></span>
            {live}
          </span>
        </motion.div>
      </div>

      <div ref={stage} aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[34rem] [perspective:900px]">
        {/* Orbits, each turning at its own pace, with a bead travelling on each. */}
        {[{ i: "inset-[2%]", s: 60, d: 1 }, { i: "inset-[10%] [transform:rotateX(64deg)]", s: 38, d: -1 }, { i: "inset-[16%]", s: 80, d: 1 }].map((o, k) => (
          <div key={k} className={`absolute ${o.i}`}>
            <motion.div className="absolute inset-0 rounded-full border border-teal/30" {...spin(o.s, o.d)}>
              <span className="absolute -top-1 start-1/2 size-2 rounded-full bg-gold-fill shadow-[0_0_12px_var(--gold-fill)]" />
            </motion.div>
          </div>
        ))}
        <motion.div className="absolute inset-[14%] grid place-items-center" style={{ rotateX: rotX, rotateY: rotY }}
          initial={{ opacity: 0, scale: 0.86, filter: "blur(10px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}>
          <motion.div className="absolute inset-[18%] rounded-full bg-gold-fill/20 blur-3xl" animate={reduce ? {} : { opacity: [0.5, 0.9, 0.5], scale: [0.95, 1.05, 0.95] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
          <BrandEye size={420} priority className="relative w-full drop-shadow-[0_20px_40px_rgba(0,0,0,.45)]" />
        </motion.div>
        {chips.map((c, i) => (
          <motion.div key={c.title} className={`absolute ${pos[i]} hidden w-44 sm:block`} style={{ x: i % 2 ? driftX : driftXNeg, y: driftY }}>
          <motion.div className="rounded-md border border-teal/40 bg-bg/80 p-3 backdrop-blur-sm"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 1 + i * 0.18 }}>
            <p className="text-[11px] text-teal">{c.label}</p>
            <p className="mt-1 font-display text-base leading-tight">{c.title}</p>
            <p className="mt-1 text-xs text-muted">{c.note}</p>
            <motion.span className="mt-2 block h-px bg-gold-fill" style={{ originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 0.4 }} transition={{ duration: 0.8, delay: 1.3 + i * 0.18 }} />
          </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

