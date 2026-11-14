import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listUtilities, UTILITIES, UTILITY_UNIT } from "@/lib/ops";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { dateFmt, int, money } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { OpsNav } from "@/components/ops/subnav";
import { AddReading, UsageBars } from "@/components/ops/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("ops", "utTitle");

export default async function UtilitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("ops");
  const data = await listUtilities(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD, compact: true });

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("utTitle")} lead={t("utLead")}><SampleBadge /></PageHeader>
      <OpsNav current="utilities" role={user.role} />
      {can(user.role, "work.manage") && <AddReading assets={data.assets.map((a) => ({ id: a.id, name: a.name, nameAr: a.nameAr }))} utilities={UTILITIES} today={DEMO_TODAY} />}
      <ul className="grid gap-4 lg:grid-cols-2">
        {data.meters.map((m) => {
          const unit = UTILITY_UNIT[m.utility];
          const name = `${m.assetId}: ${m.asset ? (ar ? m.asset.nameAr : m.asset.name) : ""}, ${t(`ut_${m.utility}`)}`;
          const flagged = m.periods.filter((p) => p.anomaly);
          const last = m.periods.at(-1);
          return (
            <li key={`${m.assetId}-${m.utility}`}>
              <Card className="space-y-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold">{name}</h2>
                  {m.anomalies > 0 ? <Badge tone="danger">{t("spikes", { n: m.anomalies })}</Badge> : <Badge tone="ok">{t("noSpikes")}</Badge>}
                </div>
                <UsageBars periods={m.periods} unit={unit} label={name} />
                <dl className="grid grid-cols-3 gap-2">
                  <div><dt className="text-xs text-muted">{t("lastPeriod")}</dt><dd className="num">{last ? `${int(last.use, locale)} ${unit}` : "–"}</dd></div>
                  <div><dt className="text-xs text-muted">{t("lastRead")}</dt><dd>{m.last ? dateFmt(m.last.readOn, locale) : "–"}</dd></div>
                  <div><dt className="text-xs text-muted">{t("yearCost")}</dt><dd className="num">{M(m.yearCostEgp)}</dd></div>
                </dl>
                {flagged.map((p) => <p key={p.to} className="text-danger">{t("spikeLine", { from: dateFmt(p.from, locale), to: dateFmt(p.to, locale), use: int(p.use, locale), unit })}</p>)}
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="max-w-2xl text-xs text-muted">{t("utNote")}</p>
    </div>
  );
}
