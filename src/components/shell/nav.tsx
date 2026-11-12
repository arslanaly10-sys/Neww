"use client";
import { useTranslations } from "next-intl";
import { Briefcase, Building2, LayoutDashboard, LineChart, Scale, ShieldCheck } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { Area } from "@/lib/permissions";

export const AREA_ICON = { overview: LayoutDashboard, portfolio: Briefcase, asset: Building2, valuation: Scale, market: LineChart, governance: ShieldCheck } as const;
const isActive = (path: string, area: Area) => path === `/${area}` || path.startsWith(`/${area}/`);

export function SideNav({ areas, badges = {} }: { areas: Area[]; badges?: Partial<Record<Area, number>> }) {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav aria-label={t("primary")} className="flex flex-col gap-1">
      {areas.map((a) => {
        const Icon = AREA_ICON[a];
        const active = isActive(path, a);
        return (
          <Link
            key={a} href={`/${a}`} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", active ? "bg-surface-2 text-gold" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            <Icon aria-hidden="true" size={18} />
            <span className="flex-1">{t(a)}</span>
            {badges[a] ? <span className="num rounded-full bg-gold-fill px-1.5 text-[11px] font-bold text-on-gold"><span aria-hidden="true">{badges[a]}</span><span className="sr-only"> ({badges[a]})</span></span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar({ areas, badges = {} }: { areas: Area[]; badges?: Partial<Record<Area, number>> }) {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav aria-label={t("primary")} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {areas.map((a) => {
        const Icon = AREA_ICON[a];
        const active = isActive(path, a);
        return (
          <Link key={a} href={`/${a}`} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium", active ? "text-gold" : "text-muted")}>
            <span className="relative"><Icon aria-hidden="true" size={20} />{badges[a] ? <span aria-hidden="true" className="num absolute -end-2.5 -top-1.5 min-w-4 rounded-full bg-gold-fill px-1 text-center text-[10px] font-bold leading-4 text-on-gold">{badges[a]}</span> : null}</span>
            <span className="max-w-full truncate">{t(a)}{badges[a] ? <span className="sr-only"> ({badges[a]})</span> : null}</span>
          </Link>
        );
      })}
    </nav>
  );
}
