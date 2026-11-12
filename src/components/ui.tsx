import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { BlurHeadline } from "./brand-fx";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        gold: "bg-gold-fill text-on-gold hover:brightness-110 active:brightness-95",
        outline: "border border-line bg-transparent text-text hover:border-gold/60 hover:bg-surface-2 active:bg-line/60",
        ghost: "bg-transparent text-text hover:bg-surface-2 active:bg-line/60",
      },
      // Phones get 44px tap targets; from md up the compact desktop heights return.
      size: { sm: "min-h-11 px-3 text-[13px] md:min-h-9", md: "min-h-11 md:min-h-10", icon: "min-h-11 w-11 px-0 md:min-h-10 md:w-10" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);
export function Button({ className, variant, size, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface p-5", className)} {...p} />;
}

export function Badge({ className, tone = "muted", ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "gold" | "teal" | "danger" | "ok" }) {
  const tones = {
    muted: "border-line text-muted",
    gold: "border-gold/50 text-gold",
    teal: "border-teal/50 text-teal",
    danger: "border-danger/50 text-danger",
    ok: "border-ok/50 text-ok",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold  ", tones[tone], className)} {...p} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton h-4 w-full", className)} />;
}

/** `animated` blurs the title in word by word (React Bits BlurText); the page keeps a real <h1> either way. */
export function PageHeader({ title, lead, children, animated = false }: { title: string; lead?: string; children?: React.ReactNode; animated?: boolean }) {
  const titleClass = "font-display text-3xl leading-tight text-text md:text-4xl";
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {animated ? <BlurHeadline text={title} className={titleClass} /> : <h1 className={titleClass}>{title}</h1>}
        {lead && <p className="mt-2 max-w-2xl text-muted">{lead}</p>}
      </div>
      {children}
    </header>
  );
}
