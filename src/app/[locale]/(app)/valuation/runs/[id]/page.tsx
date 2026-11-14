import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page";
import { getRun } from "@/lib/horus-runs";
import { can } from "@/lib/permissions";
import { getDb } from "@/db/client";
import { districts, users } from "@/db/schema";
import { dateFmt } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { HorusReport } from "@/components/horus/report";
import { ReviewRun } from "@/components/horus/run-controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^VR-[a-f0-9]{10}$/.test(id) ? id : "HORUS run" };
}

/** One HORUS run as an evidence report, with the analyst's sign-off. */
export default async function RunPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("valuation");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("hv");
  const run = await getRun(user, id);
  if (!run || !run.assetId) notFound();
  const db = await getDb();
  const ds = await db.select().from(districts);
  const people = await db.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users);
  const ar = locale === "ar";
  const who = (pid: string | null) => { const p = people.find((x) => x.id === pid); return p ? (ar ? p.nameAr : p.name) : pid ?? ""; };
  const name = (d: string) => (ar ? ds.find((x) => x.id === d)?.nameAr : ds.find((x) => x.id === d)?.name) ?? d;
  const canReview = can(user.role, "horus.review") && run.status === "in_review" && run.createdBy !== user.id;
  return (
    <div className="space-y-6">
      <Link href={`/asset/${run.assetId}/record`} className="tap inline-block text-sm text-gold underline underline-offset-4">{t("backToRecord", { id: run.assetId })}</Link>
      <PageHeader title={t("runTitle", { id: run.assetId })} lead={t("runLead", { run: run.id, who: who(run.createdBy), date: dateFmt(run.createdAt.toISOString().slice(0, 10), locale) })} />
      {run.reviewedBy && <p className="text-sm">{t(run.status === "signed_off" ? "signedBy" : "returnedBy", { who: who(run.reviewedBy), date: dateFmt(run.reviewedAt!.toISOString().slice(0, 10), locale) })}{run.reviewNote ? `: ${run.reviewNote}` : ""}</p>}
      {canReview && <ReviewRun id={run.id} />}
      {can(user.role, "horus.review") && run.status === "in_review" && run.createdBy === user.id && <p className="text-sm text-muted">{t("ownRunNote")}</p>}
      <Card><HorusReport r={run.result} inputs={run.inputs} status={run.status} locale={locale} currency={currency} districtName={name} /></Card>
    </div>
  );
}
