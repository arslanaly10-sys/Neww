"use client";
import * as Popover from "@radix-ui/react-popover";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "./ui";

/**
 * A number that shows its working. Click to see the source rows, the calculation and the assumption set.
 * Every headline figure in the app uses this so nothing is a bare number.
 */
export function Fig({
  value, source, calc, assumptions = "AS-MAC-1.0.0", label,
}: { value: string; source: string; calc?: string; assumptions?: string; label: string }) {
  const t = useTranslations("fig");
  const s = useTranslations("sample");
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`${label}: ${value}. ${t("source")}`}
        className="tap cursor-pointer rounded [unicode-bidi:isolate] underline decoration-gold/50 decoration-dotted underline-offset-4 hover:decoration-gold"
      >
        {value}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} collisionPadding={12} className="z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-line bg-surface p-4 text-sm shadow-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-text">{label}</span>
            <Badge tone="gold" title={s("badgeTitle")}>{s("badge")}</Badge>
          </div>
          <dl className="space-y-2 text-muted">
            <div><dt className="text-xs font-semibold text-gold">{t("source")}</dt><dd>{source}</dd></div>
            {calc && <div><dt className="text-xs font-semibold text-gold">{t("calc")}</dt><dd>{calc}</dd></div>}
            <div><dt className="text-xs font-semibold text-gold">{t("assumptions")}</dt><dd className="num">{assumptions}</dd></div>
          </dl>
          <Link href="/valuation#register" className="mt-3 inline-block text-gold underline underline-offset-4">{t("open")}</Link>
          <Popover.Close className="sr-only">{t("close")}</Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SampleBadge() {
  const s = useTranslations("sample");
  return <Badge tone="gold" title={s("badgeTitle")}>{s("badge")}</Badge>;
}
