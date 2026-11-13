import { Card } from "./ui";
import { StaggerItem } from "./motion";

/** Five KPI tiles without a hole: three across, then two wider ones (two by two, then one full row, on tablets). */
export const KPI5 = "grid gap-4 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 lg:grid-cols-6 lg:[&>*]:col-span-2 lg:[&>*:nth-child(n+4)]:col-span-3";

export function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <StaggerItem className="min-w-0">
      <Card className="h-full min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-2 font-display text-2xl leading-tight [font-variant-numeric:lining-nums_tabular-nums] md:text-3xl">{children}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </Card>
    </StaggerItem>
  );
}
