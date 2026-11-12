"use client";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Globe, LogOut, UserRound } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { setCurrency, signOut, switchUser } from "@/app/actions";
import { cn } from "@/lib/cn";
import { buttonStyles } from "../ui";

export interface DemoUser { id: string; name: string; nameAr: string; role: "investor" | "manager" | "admin" }

export function RoleSwitcher({ users, currentId }: { users: DemoUser[]; currentId: string }) {
  const t = useTranslations("roles");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const current = users.find((u) => u.id === currentId);
  return (
    <Menu.Root>
      <Menu.Trigger className={cn(buttonStyles({ variant: "outline", size: "sm" }), "max-w-[12rem]")} aria-label={`${t("switcher")}: ${current ? t(current.role) : ""}`} disabled={pending}>
        <UserRound aria-hidden="true" size={16} />
        <span className="truncate">{current ? t(current.role) : t("switcher")}</span>
        <ChevronDown aria-hidden="true" size={14} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-line bg-surface p-1.5 shadow-xl">
          <Menu.Label className="px-2.5 py-1.5 text-xs text-muted">{t("switchedNote")}</Menu.Label>
          {users.map((u) => (
            <Menu.Item key={u.id} onSelect={() => start(() => switchUser(u.id, locale))}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-text outline-none data-[highlighted]:bg-surface-2">
              <span className="flex-1">
                <span className="block font-semibold">{locale === "ar" ? u.nameAr : u.name}</span>
                <span className="block text-xs text-muted">{t(u.role)}</span>
              </span>
              {u.id === currentId && <Check aria-hidden="true" size={16} className="text-gold" />}
            </Menu.Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item onSelect={() => start(() => signOut(locale))} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-muted outline-none data-[highlighted]:bg-surface-2">
            <LogOut aria-hidden="true" size={16} />
            <SignOutLabel />
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
function SignOutLabel() { return <>{useTranslations("shell")("signOut")}</>; }

export function LangToggle({ className }: { className?: string }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const path = usePathname();
  const other = locale === "ar" ? "en" : "ar";
  return (
    <Link href={path} locale={other} lang={other} aria-label={t("languageLabel")} className={cn(buttonStyles({ variant: "outline", size: "sm" }), className)}>
      <Globe aria-hidden="true" size={16} />
      {t("language")}
    </Link>
  );
}

export function CurrencyToggle({ current, rate, className }: { current: "EGP" | "USD"; rate: number; className?: string }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (c: "EGP" | "USD") => start(async () => { await setCurrency(c); router.refresh(); });
  return (
    <div role="group" aria-label={t("currency")} title={t("rate", { rate })} className={cn("inline-flex overflow-hidden rounded-md border border-line", className)}>
      {(["EGP", "USD"] as const).map((c) => (
        <button key={c} type="button" onClick={() => set(c)} aria-pressed={current === c} disabled={pending}
          className={cn("min-h-11 px-3 text-[13px] font-semibold md:min-h-9", current === c ? "bg-gold-fill text-on-gold" : "text-muted hover:bg-surface-2")}>
          {c}
        </button>
      ))}
    </div>
  );
}
