import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getPortfolio } from "@/lib/access";
import { getAggregateIncome, getHistory, getUpdates } from "@/lib/portfolio-data";
import { portfolioMetrics } from "@/lib/metrics";
import { can } from "@/lib/permissions";
import { dateFmt, int, money, pct } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Fig, SampleBadge } from "@/components/fig";
import { Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { NoAccess } from "@/components/no-access";
import { ValueChart } from "@/components/charts";
import { AllocationBars } from "@/components/allocation";
import { HoldingsTable } from "@/components/holdings-table";
import { PortfolioMap } from "@/components/portfolio-map";
import { PackButtons } from "@/components/pack/pack-buttons";
import { Link } from "@/i18n/navigation";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("pf");

export default async function Portfolio({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("portfolio");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("pf");
  const ty = await getTranslations("types");
  const ar = locale === "ar";
  const pk = await getTranslations("packui");
  const sc = await getTranslations("scn");
  const fx = SAMPLE_FX_EGP_PER_USD;

  const [rows, history, agg, updates] = await Promise.all([getPortfolio(user), getHistory(user), getAggregateIncome(), getUpdates(user)]);
  const m = portfolioMetrics(rows);
  const showAssetYield = can(user.role, "asset.income_costs.view");
  const netYield = agg.net / m.value;

  const holdings = rows.map((r) => ({
    id: r.id, name: r.name, nameAr: r.nameAr, district: r.district.name, districtAr: r.district.nameAr, type: r.type, areaSqm: r.areaSqm,
    value: r.valueEgp, cost: r.costEgp, occupancy: r.occupancy,
    netYield: showAssetYield ? (agg.byAsset.get(r.id) ?? 0) / r.valueEgp : null,
  }));
  const mapDistricts = m.allocation.map((a) => {
    const d = rows.find((r) => r.districtId === a.id)!.district;
    return { id: a.id, name: a.name, nameAr: a.nameAr, lat: Number(d.lat), lng: Number(d.lng), value: a.value, share: a.value / m.value, count: a.count };
  });
  const mapAssets = rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr, districtId: r.districtId, lat: Number(r.lat), lng: Number(r.lng), value: r.valueEgp }));

  const update = (u: (typeof updates)[number]) => (
    <li key={u.id}>
      <Card className="p-4">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><bdi>{dateFmt(u.postedOn, locale)}</bdi>{u.status === "draft" && <Badge tone="gold">{t("draft")}</Badge>}</p>
        <h3 className="mt-1 font-semibold">{ar ? u.titleAr : u.title}</h3>
        <p className="mt-1 text-sm text-muted">{ar ? u.bodyAr : u.body}</p>
      </Card>
    </li>
  );
  return (
    <div className="space-y-8">
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>

      <section aria-label={pk("title")} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl"><h2 className="font-display text-xl">{pk("title")}</h2><p className="text-sm text-muted">{pk("lead")}</p><p className="mt-1 text-xs text-muted">{pk("note")}</p></div>
        <div className="flex flex-col items-start gap-3 md:items-end"><PackButtons /><Link href="/portfolio/scenarios" className="tap text-sm text-gold underline underline-offset-4">{sc("openScenarios")}</Link></div>
      </section>

      <Stagger as="section" aria-label={t("kpiValue")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("kpiValue")}>
          <Fig label={t("kpiValue")} value={money(m.value, currency, locale, { compact: true })} source={t("valueSrc", { n: m.count })}
            calc={`${money(m.value, "EGP", locale)}${currency === "USD" ? ` ÷ ${fx}` : ""}`} />
        </Stat>
        <Stat label={t("kpiYield")} hint={!showAssetYield ? t("yieldAgg") : undefined}>
          <Fig label={t("kpiYield")} value={pct(netYield, locale, 1)} source={t("yieldSrc", { from: dateFmt(agg.from, locale), to: dateFmt(agg.to, locale) })}
            calc={showAssetYield ? `${money(agg.net, "EGP", locale)} ÷ ${money(m.value, "EGP", locale)}` : undefined} />
        </Stat>
        <Stat label={t("kpiIncome")} hint={`${int(m.incomeUnits, locale)} / ${int(m.count, locale)}`}>
          <Fig label={t("kpiIncome")} value={int(m.incomeUnits, locale)} source={t("incomeSrc")} />
        </Stat>
        <Stat label={t("kpiGain")} hint={<bdi>{pct(m.gainPct, locale)}</bdi>}>
          <Fig label={t("kpiGain")} value={money(m.gain, currency, locale, { compact: true })} source={t("gainSrc")} calc={`${money(m.value, "EGP", locale)} − ${money(m.cost, "EGP", locale)}`} />
        </Stat>
      </Stagger>

      <Card>
        <h2 className="mb-4 font-display text-xl">{t("mapTitle")}</h2>
        <PortfolioMap districts={mapDistricts} assets={mapAssets} currency={currency} fx={fx} />
      </Card>

      <Card>
        <h2 className="mb-4 font-display text-2xl">{t("chartTitle")}</h2>
        <ValueChart data={history.map((h) => ({ month: h.month, value: h.value, cost: h.cost }))} currency={currency} fx={fx} label={t("valueLabel")} costLabel={t("costLabel")} />
        <p className="mt-3 text-xs text-muted">{t("chartNote")}</p>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-xl">{t("allocType")}</h2>
          <AllocationBars total={m.value} locale={locale} items={m.byType.map((x) => ({ id: x.id, label: ty(x.id as "villa"), value: x.value }))} />
        </Card>
        <Card>
          <h2 className="mb-4 font-display text-xl">{t("allocDistrict")}</h2>
          <AllocationBars total={m.value} locale={locale} items={m.allocation.map((x) => ({ id: x.id, label: ar ? x.nameAr : x.name, value: x.value }))} limit={5} moreLabel={(n) => t("moreDistricts", { n })} />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl">{t("holdings")}</h2>
        <HoldingsTable rows={holdings} currency={currency} fx={fx} showYield={showAssetYield} />
      </section>

      <section aria-labelledby="upd">
        <h2 id="upd" className="mb-3 font-display text-2xl">{t("updates")}</h2>
        <ul className="space-y-3">{updates.slice(0, 3).map(update)}</ul>
        {updates.length > 3 && (
          <details className="mt-3">
            <summary className="tap cursor-pointer text-sm text-gold underline underline-offset-4">{t("moreUpdates", { n: updates.length - 3 })}</summary>
            <ul className="mt-3 space-y-3">{updates.slice(3).map(update)}</ul>
          </details>
        )}
        <p className="mt-3 text-xs text-muted">{t("draftNote")}</p>
      </section>
    </div>
  );
}
