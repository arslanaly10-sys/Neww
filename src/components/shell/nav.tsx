"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Briefcase, Building2, KeyRound, LayoutDashboard, LineChart, MoreHorizontal, Scale, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { Area } from "@/lib/permissions";

export const AREA_ICON = { overview: LayoutDashboard, portfolio: Briefcase, asset: Building2, leases: KeyRound, valuation: Scale, market: LineChart, governance: ShieldCheck } as const;
const isActive = (path: string, area: Area) => path === `/${area}` || path.startsWith(`/${area}/`);

export function SideNav({ areas, badges = {} }: { areas: Area[]; badges?: Partial<Record<Area, number>> }) {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav aria-label={t("primary")} className="isolate flex flex-col gap-1">
      {areas.map((a) => {
        const Icon = AREA_ICON[a];
        const active = isActive(path, a);
        return (
          <Link
            key={a} href={`/${a}`} aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", active ? "text-gold" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            {active && <motion.span layoutId="sidenav-active" aria-hidden="true" className="absolute inset-0 -z-10 rounded-md bg-surface-2" transition={{ type: "spring", bounce: 0, visualDuration: 0.3 }} />}
            <Icon aria-hidden="true" size={18} />
            <span className="flex-1">{t(a)}</span>
            {badges[a] ? <span className="num rounded-full bg-gold-fill px-1.5 text-xs font-bold text-on-gold"><span aria-hidden="true">{badges[a]}</span><span className="sr-only"> ({badges[a]})</span></span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phones: up to five tabs. With more areas, the first four show and the rest sit behind a "More" sheet. */
export function TabBar({ areas, badges = {} }: { areas: Area[]; badges?: Partial<Record<Area, number>> }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const overflow = areas.length > 5;
  const main = overflow ? areas.slice(0, 4) : areas;
  const rest = overflow ? areas.slice(4) : [];
  const restActive = rest.some((a) => isActive(path, a));
  const tab = "relative flex min-h-14 min-w-11 flex-auto flex-col items-center justify-center gap-0.5 px-0 text-xs font-medium";
  const marker = <motion.span layoutId="tabbar-active" aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold-fill" transition={{ type: "spring", bounce: 0, visualDuration: 0.3 }} />;
  return (
    <nav aria-label={t("primary")} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {main.map((a) => {
        const Icon = AREA_ICON[a];
        const active = isActive(path, a);
        return (
          <Link key={a} href={`/${a}`} aria-current={active ? "page" : undefined} className={cn(tab, active ? "text-gold" : "text-muted")}>
            {active && marker}
            <span className="relative"><Icon aria-hidden="true" size={20} />{badges[a] ? <span aria-hidden="true" className="num absolute -end-2.5 -top-1.5 min-w-4 rounded-full bg-gold-fill px-1 text-center text-[10px] font-bold leading-4 text-on-gold">{badges[a]}</span> : null}</span>
            <span className="max-w-full truncate">{t(a)}{badges[a] ? <span className="sr-only"> ({badges[a]})</span> : null}</span>
          </Link>
        );
      })}
      {overflow && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className={cn(tab, restActive ? "text-gold" : "text-muted")} aria-current={restActive ? "page" : undefined}>
            {restActive && marker}
            <MoreHorizontal aria-hidden="true" size={20} /><span>{t("more")}</span>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <Dialog.Title className="font-display text-xl">{t("more")}</Dialog.Title>
                <Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={18} /></Dialog.Close>
              </div>
              <ul className="divide-y divide-line">
                {rest.map((a) => {
                  const Icon = AREA_ICON[a];
                  const active = isActive(path, a);
                  return (
                    <li key={a}><Link href={`/${a}`} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 text-sm font-medium", active ? "text-gold" : "text-text")}><Icon aria-hidden="true" size={18} />{t(a)}</Link></li>
                  );
                })}
              </ul>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </nav>
  );
}
