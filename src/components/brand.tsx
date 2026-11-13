import { cn } from "@/lib/cn";

/** The ZMNHOOF eye: the brand's own mark, from zmnhoof.com. Decorative beside the wordmark, which carries the name. */
export function BrandEye({ size = 28, className, priority = false }: { size?: number; className?: string; priority?: boolean }) {
  const src = size <= 48 ? "/brand/zmnhoof-eye-96.webp" : size <= 96 ? "/brand/zmnhoof-eye-192.webp" : size <= 256 ? "/brand/zmnhoof-eye-512.webp" : "/brand/zmnhoof-eye-960.webp";
  // eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized brand asset; no optimisation needed
  return <img src={src} alt="" aria-hidden="true" width={size} height={Math.round(size * 0.876)} fetchPriority={priority ? "high" : "auto"} className={cn("inline-block shrink-0 object-contain", className)} />;
}

export function Wordmark({ className, eye = true }: { className?: string; eye?: boolean }) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2.5 font-display text-[1.15rem] tracking-[0.18em] text-text", className)}>
      {eye && <BrandEye size={30} />}
      <span>ZMNHOOF<span className="ms-2 text-gold">OS</span></span>
    </span>
  );
}

/** Subtle line-art Eye of Horus. Decorative; pair with a text label. */
export function HorusGlyph({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={cn("text-gold", className)}>
      <path d="M2.5 11.5c3-4.2 6.2-6 9.5-6s6.5 1.8 9.5 6c-3 3.6-6.2 5.3-9.5 5.3S5.5 15.1 2.5 11.5Z" />
      <circle cx="12" cy="11.4" r="2.6" />
      <path d="M12 16.8v3.2M12 20c-1.6 0-2.6.9-3.2 2M8.6 14.8c-1.4 1.2-2.7 1.9-4.6 2.2" />
    </svg>
  );
}
