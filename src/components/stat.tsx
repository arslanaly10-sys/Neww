import { Card } from "./ui";
import { StaggerItem } from "./motion";
import { GlowCard } from "./brand-fx";

/** `glow` swaps the plain card for one with a soft gold light under the pointer (React Bits SpotlightCard). */
export function Stat({ label, children, hint, glow = false }: { label: string; children: React.ReactNode; hint?: React.ReactNode; glow?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl leading-tight md:text-3xl">{children}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return (
    <StaggerItem className="min-w-0">
      {glow ? <GlowCard className="h-full min-w-0 rounded-lg! p-5!">{body}</GlowCard> : <Card className="h-full min-w-0">{body}</Card>}
    </StaggerItem>
  );
}
