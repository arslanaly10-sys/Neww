import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/permissions";

const TABS = [
  { id: "board", href: "/maintenance", roles: ["investor", "manager"] },
  { id: "inspections", href: "/maintenance/inspections", roles: ["investor", "manager"] },
  { id: "contractors", href: "/maintenance/contractors", roles: ["investor", "manager"] },
  { id: "utilities", href: "/maintenance/utilities", roles: ["manager"] },
  { id: "capex", href: "/maintenance/capex", roles: ["manager"] },
] as const;

/** Operations sections under Maintenance. Costs (utilities, capital works) only for managers. */
export async function OpsNav({ current, role }: { current: (typeof TABS)[number]["id"]; role: Role }) {
  const t = await getTranslations("ops");
  return (
    <nav aria-label={t("navLabel")} className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1 pb-1">
        {TABS.filter((x) => (x.roles as readonly string[]).includes(role)).map((x) => (
          <li key={x.id}>
            <Link href={x.href} aria-current={x.id === current ? "page" : undefined} className={cn("inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm", x.id === current ? "bg-surface-2 font-semibold text-text shadow-[inset_0_-2px_0_var(--gold)]" : "text-muted hover:bg-surface-2 hover:text-text")}>{t(`tab_${x.id}`)}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
