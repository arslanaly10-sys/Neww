import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getDocuments, getPortfolio } from "@/lib/access";
import { can } from "@/lib/permissions";
import { dateFmt, int, money, pct } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { GlowCard } from "@/components/brand-fx";
import { Fig, SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { getAssetCashflows, getAssetHistory, getAssetValuations } from "@/lib/portfolio-data";
import { assessRisk } from "@/lib/risk";
import { portfolioMetrics } from "@/lib/metrics";
import { IncomeChart, ValueChart } from "@/components/charts";
import { EyeOff } from "lucide-react";

/** Keep a number and its percent sign together, left to right, inside Arabic or English sentences. */
const ltr = (s: string) => `\u2066${s}\u2069`;

export default async function AssetPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("asset");
  const ty = await getTranslations("types");
  const fi = await getTranslations("finish");
  const st = await getTranslations("status");
  const dk = await getTranslations("docKind");
  const ds = await getTranslations("docStatus");
  const u = await getTranslations("units");
  const ar = locale === "ar";
  const all = await getPortfolio(user);
  const a = all.find((x) => x.id === id);
  if (!a) notFound();
  const docs = (await getDocuments(user)).filter((d) => d.assetId === id);
  const x = await getTranslations("assetx");
  const cl = await getTranslations("clause");
  const pf = await getTranslations("pf");
  const fx = SAMPLE_FX_EGP_PER_USD;
  const [hist, vals, cash] = await Promise.all([getAssetHistory(user, id), getAssetValuations(user, id), getAssetCashflows(user, id)]);
  const mx = portfolioMetrics(all);
  const share = (mx.allocation.find((d) => d.id === a.districtId)?.value ?? 0) / mx.value;
  const risk = assessRisk({ occupancy: a.occupancy, vacantSince: a.vacantSince, leaseEnd: a.lease?.endDate ?? null, leaseCurrency: a.lease?.currency ?? null, docs, districtShare: share });
  const last12 = [...new Set(cash.map((c) => c.month))].slice(-12);
  const cashByMonth = last12.map((m) => ({
    month: m,
    income: cash.filter((c) => c.month === m && c.amountEgp > 0).reduce((s, c) => s + c.amountEgp, 0),
    costs: cash.filter((c) => c.month === m && c.amountEgp < 0).reduce((s, c) => s + c.amountEgp, 0),
  }));
  const incomeTotal = cashByMonth.reduce((s, c) => s + c.income, 0);
  const costTotal = cashByMonth.reduce((s, c) => s + c.costs, 0);
  const netIncome = cash.reduce((s, c) => s + c.amountEgp, 0);
  const bandTone = { low: "ok", medium: "gold", high: "danger" } as const;
  const showIncome = can(user.role, "asset.income_costs.view");
  const gain = a.valueEgp - a.costEgp;
  const docTone = { verified: "ok", pending: "gold", missing: "danger", expired: "danger" } as const;
  const l = a.lease;
  const clauses = (l?.clauses ?? {}) as Record<string, string>;
  void pf;

  return (
    <div>
      <Link href="/asset" className="mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("back")}</Link>
      <PageHeader animated title={ar ? a.nameAr : a.name} lead={`${ar ? a.district.nameAr : a.district.name} · ${ty(a.type as "villa")}${ar ? "" : ` · ${a.compound}`}`}>
        <span className="flex items-center gap-2"><span className="num text-sm text-muted">{a.id}</span><SampleBadge /></span>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-3">
        <GlowCard className="rounded-lg! p-5!">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("value")}</p>
          <p className="mt-2 font-display text-3xl">
            <Fig label={t("value")} value={money(a.valueEgp, currency, locale)} source={`${a.valueSource === "seed" ? "Seed record" : a.valueSource} · ${t("valueSet", { date: dateFmt(a.valueSetOn, locale) })}`}
              calc={currency === "USD" ? `${money(a.valueEgp, "EGP", locale)} ÷ ${SAMPLE_FX_EGP_PER_USD}` : undefined} assumptions="AS-VAL-1.0.0" />
          </p>
        </GlowCard>
        <GlowCard className="rounded-lg! p-5!">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("cost")}</p>
          <p className="mt-2 font-display text-3xl"><Fig label={t("cost")} value={money(a.costEgp, currency, locale)} source={t("acquired", { date: dateFmt(a.acquiredOn, locale) })} /></p>
        </GlowCard>
        <GlowCard className="rounded-lg! p-5!">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("value")} − {t("cost")}</p>
          <p className="mt-2 font-display text-3xl"><Fig label="Gain" value={money(gain, currency, locale)} source={`${money(a.valueEgp, "EGP", locale)} − ${money(a.costEgp, "EGP", locale)}`} /></p>
          <p className="num mt-1 text-xs text-muted">{pct(gain / a.costEgp, locale)}</p>
        </GlowCard>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-xl">{t("facts")}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-muted">{t("areaLabel")}</dt><dd className="num">{int(a.areaSqm, locale)} {u("sqm")}</dd></div>
            <div><dt className="text-muted">{t("floor")}</dt><dd className="num">{a.floor === null ? "–" : a.floor === 0 ? t("ground") : a.floor}</dd></div>
            <div><dt className="text-muted">{t("finish")}</dt><dd>{fi(a.finish as "luxury")}</dd></div>
            <div><dt className="text-muted">{t("built")}</dt><dd className="num">{a.yearBuilt ?? "–"}</dd></div>
            <div className="col-span-2"><dt className="text-muted">{st(a.occupancy as "let")}</dt><dd>{a.vacantSince ? t("vacantSince", { date: dateFmt(a.vacantSince, locale) }) : "–"}</dd></div>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-xl">{t("lease")}</h2>
          {!l ? <p className="text-muted">{t("noLease")}</p> : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2"><dt className="text-muted">{t("tenant")}</dt><dd>{ar ? l.tenant.nameAr : l.tenant.name} <span className="num text-xs text-muted">{l.id}</span></dd></div>
              <div className="col-span-2"><dt className="text-muted">{t("term")}</dt><dd><bdi>{dateFmt(l.startDate, locale)}</bdi> – <bdi>{dateFmt(l.endDate, locale)}</bdi></dd></div>
              <div><dt className="text-muted">{t("rent")}</dt><dd>{showIncome && l.monthlyRent !== null ? <bdi>{l.currency === "USD" ? money(l.monthlyRent * SAMPLE_FX_EGP_PER_USD, currency, locale) : money(l.monthlyRent, currency, locale)}</bdi> : <span className="text-muted">{t("rentHidden")}</span>}</dd></div>
              <div><dt className="text-muted">{t("indexation")}</dt><dd className="num">{l.annualIndexationPct}%</dd></div>
              <div><dt className="text-muted">{t("deposit")}</dt><dd>{t("depositMonths", { n: l.depositMonths })}</dd></div>
              <div className="col-span-2"><dt className="text-muted">{t("clauses")}</dt><dd><ul className="list-disc space-y-1 ps-5 text-muted">{(["break", "renewal", "sublet", "governingLaw"] as const).map((k) => <li key={k}><span className="text-text">{cl(`label_${k}` as "label_break")}:</span> {cl(`${k}_${clauses[k]}` as "break_none")}</li>)}</ul></dd></div>
            </dl>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 font-display text-xl">{x("valueVsCost")}</h2>
        <ValueChart data={hist.points} currency={currency} fx={fx} label={x("valueSeries")} costLabel={x("costSeries")} />
        <p className="mt-3 text-xs text-muted">{x("valueChartNote")}</p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-xl">{x("incomeCosts")}</h2>
          {!showIncome ? (
            <div className="flex gap-3 rounded-md border border-dashed border-line p-4 text-sm">
              <EyeOff aria-hidden="true" className="mt-0.5 shrink-0 text-gold" size={18} />
              <div><p className="font-semibold">{x("hiddenTitle")}</p><p className="mt-1 text-muted">{x("hiddenBody")}</p></div>
            </div>
          ) : cashByMonth.length === 0 ? <p className="text-muted">{x("noIncome")}</p> : (
            <>
              <IncomeChart data={cashByMonth} currency={currency} fx={fx} incomeLabel={x("income")} costLabel={x("costs")} />
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-muted">{x("income")}</dt><dd><Fig label={x("income")} value={money(incomeTotal, currency, locale, { compact: true })} source={x("incomeSrc")} /></dd></div>
                <div><dt className="text-xs text-muted">{x("costs")}</dt><dd><Fig label={x("costs")} value={money(Math.abs(costTotal), currency, locale, { compact: true })} source={x("incomeSrc")} /></dd></div>
                <div><dt className="text-xs text-muted">{x("netYield")}</dt><dd><Fig label={x("netYield")} value={pct(netIncome / a.valueEgp, locale)} source={x("incomeSrc")} calc={`${money(netIncome, "EGP", locale)} ÷ ${money(a.valueEgp, "EGP", locale)}`} /></dd></div>
              </dl>
            </>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">{x("risk")}</h2>
            <Badge tone={bandTone[risk.band]}>{x(`band_${risk.band}` as "band_low")}</Badge>
          </div>
          <p className="mb-4 flex items-baseline gap-2"><span className="text-xs uppercase tracking-wide text-muted">{x("riskScore")}</span>
            <Fig label={x("riskScore")} value={`${risk.score}/100`} source={x("riskNote", { version: ltr(risk.version) })} assumptions="AS-RISK-1.1.0" calc={risk.drivers.map((d) => `${d.score} × ${Math.round(d.weight * 100)}%`).join(" + ")} />
          </p>
          <ul className="space-y-3">
            {risk.drivers.map((d) => (
              <li key={d.key} className="text-sm">
                <div className="flex justify-between gap-3"><span className="font-semibold">{x(`driver_${d.key}` as "driver_fx")}</span><span className="text-muted"><bdi>{d.score}/100</bdi> · <bdi>{x("weight", { w: ltr(`${Math.round(d.weight * 100)}%`) })}</bdi></span></div>
                <div aria-hidden="true" className="my-1 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-gold-fill" style={{ width: `${d.score}%` }} /></div>
                <p className="text-xs text-muted">{x(`r_${d.reason.id}` as "r_leaseNa", d.reason.id === "concShare" ? { pct: ltr(`${d.reason.params.pct}%`) } : d.reason.params)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{x("riskNote", { version: ltr(risk.version) })}</p>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-xl">{x("valuations")}</h2><Link href={`/valuation?asset=${a.id}`} className="text-sm text-gold underline underline-offset-4">{x("runValuation")}</Link></div>
        {vals.length === 0 ? <p className="text-sm text-muted">{x("noValuations")}</p> : (
          <ul className="divide-y divide-line text-sm">
            {vals.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="num font-semibold text-gold">{v.id}</span> <span className="text-muted">{v.confirmedAt ? x("confirmedOn", { date: dateFmt(v.confirmedAt.toISOString().slice(0, 10), locale) }) : dateFmt(v.createdAt.toISOString().slice(0, 10), locale)}</span></span>
                <span className="flex items-center gap-3"><span className="text-xs text-muted">{x("modelEstimate")}: <bdi>{money(v.modelEstimateEgp, currency, locale, { fx, compact: true })}</bdi></span><bdi className="font-semibold">{v.finalValueEgp ? money(v.finalValueEgp, currency, locale, { fx }) : "–"}</bdi><Badge tone={v.status === "confirmed" ? "ok" : "gold"}>{x(`valStatus_${v.status}` as "valStatus_draft")}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-xl">{t("docs")}</h2><Link href="/asset/documents" className="text-sm text-gold underline underline-offset-4">{(await getTranslations("docs"))("title")}</Link></div>
        <ul className="divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><span className="font-semibold">{dk(d.kind as "lease")}</span> <span className="num text-xs text-muted">{d.id}</span>{d.expiresOn && <bdi className="ms-2 text-xs text-muted">{dateFmt(d.expiresOn, locale)}</bdi>}</span>
              <Badge tone={docTone[d.status as "verified"]}>{ds(d.status as "verified")}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
