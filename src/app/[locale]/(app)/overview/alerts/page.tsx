import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { getAlerts } from "@/lib/alerts-service";
import { listApprovals } from "@/lib/approvals-service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { AlertsBoard } from "@/components/alerts/board";
import { ApprovalsQueue } from "@/components/alerts/approvals-queue";
import { LiveFeed } from "@/components/alerts/live-feed";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("al");

export default async function AlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency } = await pageContext("overview");
  const t = await getTranslations("al");
  const o = await getTranslations("overview");
  const fx = SAMPLE_FX_EGP_PER_USD;
  const [{ open, snoozed }, approvals, allUsers] = await Promise.all([getAlerts(user), listApprovals(user), (await getDb()).select().from(users)]);
  const names = Object.fromEntries(allUsers.map((u) => [u.id, { name: u.name, nameAr: u.nameAr }]));
  return (
    <div className="space-y-10">
      <div>
        <Link href="/overview" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{o("title")}</Link>
        <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      </div>
      <section aria-labelledby="ap">
        <h2 id="ap" className="mb-1 font-display text-2xl">{t("approvalsTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("approvalsLead")}</p>
        <ApprovalsQueue items={approvals} currency={currency} fx={fx} />
      </section>
      {user.role !== "admin" && <AlertsBoard open={open} snoozed={snoozed} canSnooze={user.role === "manager"} currency={currency} fx={fx} userNames={names} />}
      <LiveFeed currency={currency} fx={fx} limit={10} />
    </div>
  );
}
