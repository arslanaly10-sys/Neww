import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listIntakes, listRuns } from "@/lib/horus-runs";
import { dateFmt, money } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("hv", "runsTitle");

export default async function RunsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("valuation");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("hv");
  const runs = (await listRuns(user))!.filter((r) => r.assetId);
  const intakes = await listIntakes(user);
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { compact: true, fx: SAMPLE_FX_EGP_PER_USD });
  const tone = (s: string) => (s === "signed_off" ? "ok" : s === "returned" ? "danger" : "gold") as "ok" | "danger" | "gold";
  const runList = runs.length === 0 ? <Card className="text-sm text-muted">{t("noRuns")}</Card> : (
    <ul aria-label={t("runsTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <Link href={`/valuation/runs/${r.id}`} className="min-w-56 flex-1 font-semibold underline decoration-line underline-offset-4 hover:decoration-gold"><span className="num">{r.assetId}</span> {ar ? r.assetNameAr : r.assetName}</Link>
          <span className="num">{M(r.lowEgp)} {t("to")} {M(r.highEgp)}</span>
          <span className="text-muted">{t("confShort", { n: r.confidence })}</span>
          <Badge tone={tone(r.status)}>{t(`st_${r.status}` as "st_in_review")}</Badge>
          <span className="text-xs text-muted">{dateFmt(r.createdAt.toISOString().slice(0, 10), locale)}</span>
        </li>
      ))}
    </ul>
  );
  const intakeList = !intakes ? null : intakes.length === 0 ? <Card className="text-sm text-muted">{t("noIntakes")}</Card> : (
    <ul aria-label={t("intakesTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
      {intakes.map(({ i, low, high, confidence }) => {
        const a = i.answers as { type: string; districtId: string };
        return (
          <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <Link href={`/evaluate/${i.id}`} className="min-w-56 flex-1 underline decoration-line underline-offset-4 hover:decoration-gold">{t(`t_${a.type}` as "t_villa")}, {a.districtId}</Link>
            {low !== null && high !== null && <span className="num">{M(low)} {t("to")} {M(high)}</span>}
            {confidence !== null && <span className="text-muted">{t("confShort", { n: confidence })}</span>}
            <span className="text-xs text-muted">{i.contactName ? t("contactLeft", { name: i.contactName }) : t("noContact")}</span>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="space-y-6">
      <Link href="/valuation" className="tap inline-block text-sm text-gold underline underline-offset-4">{(await getTranslations("nav"))("valuation")}</Link>
      <PageHeader animated title={t("runsTitle")} lead={t("runsLead")}><Link href="/evaluate" className="tap text-sm text-gold underline underline-offset-4">{t("openPublic")}</Link></PageHeader>
      {intakeList ? <HashTabs label={t("runsTitle")} tabs={[{ id: "runs", label: t("tabRuns"), count: runs.filter((r) => r.status === "in_review").length, content: runList }, { id: "intakes", label: t("tabIntakes"), count: intakes!.length, content: intakeList }]} /> : runList}
    </div>
  );
}
