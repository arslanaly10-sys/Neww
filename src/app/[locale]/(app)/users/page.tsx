import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listUsers } from "@/lib/users";
import { PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { UsersAdmin } from "@/components/settings/forms";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { CountUp } from "@/components/charts/motion-charts";
import { timeAgo } from "@/lib/time-ago";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("settings", "usersTitle");

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("users");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("settings");
  const rows = (await listUsers(user))!;
  const ar = locale === "ar";
  const count = (f: (x: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  return (
    <div className="space-y-6">
      <PageHeader animated title={t("usersTitle")} lead={t("usersLead")} />
      <Stagger as="section" className={KPI5} aria-label={t("usersTitle")}>
        <Stat label={t("kActive")}><CountUp value={count((x) => x.status === "active")} /></Stat>
        <Stat label={t("kInvited")}><CountUp value={count((x) => x.status === "invited")} /></Stat>
        <Stat label={t("kDeactivated")}><CountUp value={count((x) => x.status === "deactivated")} /></Stat>
        <Stat label={t("kManagers")}><CountUp value={count((x) => x.role === "manager" && x.status !== "deactivated")} /></Stat>
        <Stat label={t("kAdmins")}><CountUp value={count((x) => x.role === "admin" && x.status === "active")} /></Stat>
      </Stagger>
      <UsersAdmin rows={rows.map((u) => ({ id: u.id, name: ar ? u.nameAr : u.name, email: u.email, role: u.role, title: ar ? u.titleAr : u.title, status: u.status, lastSeen: u.lastSeenAt ? timeAgo(u.lastSeenAt, locale) : null, me: u.id === user.id }))} />
      <p className="text-xs text-muted">{t("usersNote")}</p>
    </div>
  );
}
