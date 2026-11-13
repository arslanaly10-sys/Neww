import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getFinance } from "@/lib/finance";
import { CATEGORIES, isIncome } from "@/lib/finance-calc";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { dateFmt, listSep, money, pct } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { IncomeChart } from "@/components/charts";
import { AddEntry, MarkPaid, ProposeDistribution } from "@/components/finance/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("fin");
const D_TONE = { proposed: "gold", approved: "ok", rejected: "danger", paid: "muted" } as const;

export default async function FinancePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ cat?: string }> }) {
  const { locale } = await params;
  const { cat } = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("finance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("fin");
  const f = await getFinance(user);
  if (!f) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const fx = SAMPLE_FX_EGP_PER_USD;
  const M = (egp: number, compact = false) => money(egp, currency, locale, { fx, compact });
  const month = (m: string) => dateFmt(m, locale).replace(/^\d+\s/, "");

  const distributionsPanel = (
    <section aria-labelledby="ds-h" className="space-y-5">
      <h2 id="ds-h" className="font-display text-2xl">{t("distTitle")}</h2>
      <p className="max-w-md text-sm text-muted">{t("distLead", { total: M(f.totalPaid) })}</p>
      {f.money && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <p className="font-semibold">{t("nextTitle", { period: f.nextDistribution.period })}</p>
            <p className="text-muted">{t("nextLine", { noi: M(f.nextDistribution.noi), suggested: M(f.nextDistribution.suggested) })}</p>
          </div>
          {f.nextDistribution.canPropose
            ? <ProposeDistribution period={f.nextDistribution.period} suggested={f.nextDistribution.suggested} noi={f.nextDistribution.noi} fmtNoi={M(f.nextDistribution.noi)} />
            : <p className="text-sm text-muted">{t("alreadyProposed")} <Link href="/overview/alerts" className="text-gold underline underline-offset-4">{t("toApprovals")}</Link></p>}
        </Card>
      )}
      {f.distributions.length === 0 ? <Card className="text-sm text-muted">{t("noDist")}</Card> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {f.distributions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{d.id}</span><span className="font-semibold">{d.period}</span><Badge tone={D_TONE[d.status as "paid"]}>{t(`ds_${d.status}`)}</Badge></p>
                <p className="mt-0.5 text-base font-semibold"><bdi>{M(d.amountEgp)}</bdi></p>
                <p className="text-xs text-muted">{t("proposedBy", { name: ar ? d.proposerNameAr : d.proposerName })}{d.deciderName ? `${listSep(locale)}${t("decidedBy", { name: ar ? d.deciderNameAr! : d.deciderName })}` : ""}{d.paidOn ? `${listSep(locale)}${t("paidOn", { date: dateFmt(d.paidOn, locale) })}` : ""}</p>
                {f.money && <p className="text-xs text-muted">{t("basis", { noi: M(d.basisNoiEgp), pct: pct(d.amountEgp / d.basisNoiEgp, locale, 0) })}</p>}
              </div>
              {f.money && d.status === "approved" && <MarkPaid id={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!f.money) {
    return (
      <div>
        <PageHeader animated title={t("title")} lead={t("leadInvestor")}><SampleBadge /></PageHeader>
        {distributionsPanel}
      </div>
    );
  }

  const margin = f.totals.income ? f.totals.noi / f.totals.income : 0;
  const overview = (
    <section aria-labelledby="ov-h" className="space-y-6">
      <h2 id="ov-h" className="sr-only">{t("tabOverview")}</h2>
      <Stagger className={KPI5}>
        <Stat label={t("kIncome")} hint={t("period", { from: month(f.months[0]), to: month(f.months[f.months.length - 1]) })}><span className="num">{M(f.totals.income, true)}</span></Stat>
        <Stat label={t("kCosts")}><span className="num">{M(-f.totals.costs, true)}</span></Stat>
        <Stat label={t("kNoi")} hint={t("margin", { pct: pct(margin, locale, 0) })}><span className="num">{M(f.totals.noi, true)}</span></Stat>
        <Stat label={t("kForecast")} hint={t("forecastHint", { from: month(f.forecast[0].month), to: month(f.forecast[f.forecast.length - 1].month) })}><span className="num">{M(f.forecastTotals.noi, true)}</span></Stat>
        <Stat label={t("kPaid")}><span className="num">{M(f.totalPaid, true)}</span></Stat>
      </Stagger>
      <Card>
        <h3 className="mb-3 font-display text-xl">{t("chartTitle")}</h3>
        <IncomeChart data={f.trailing.map((r) => ({ month: r.month, income: r.income, costs: r.costs }))} currency={currency} fx={fx} incomeLabel={t("income")} costLabel={t("costs")} />
      </Card>
      <Card>
        <h3 className="mb-1 font-display text-xl">{t("forecastTitle")}</h3>
        <p className="mb-3 max-w-md text-sm text-muted">{t("forecastLead")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead><tr className="border-b border-line text-start text-xs text-muted"><th className="py-2 text-start font-semibold">{t("month")}</th><th className="py-2 text-end font-semibold">{t("income")}</th><th className="py-2 text-end font-semibold">{t("costs")}</th><th className="py-2 text-end font-semibold">{t("noi")}</th><th className="py-2 ps-4 text-start font-semibold">{t("leasesEnding")}</th></tr></thead>
            <tbody>
              {f.forecast.map((r) => (
                <tr key={r.month} className="border-b border-line last:border-0">
                  <td className="py-2">{month(r.month)}</td>
                  <td className="py-2 text-end"><span className="num">{M(r.income, true)}</span></td>
                  <td className="py-2 text-end text-muted"><span className="num">{M(-r.costs, true)}</span></td>
                  <td className="py-2 text-end font-semibold"><span className="num">{M(r.noi, true)}</span></td>
                  <td className="py-2 ps-4 text-xs text-muted">{r.leasesEnding.join(", ") || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );

  const catOk = (CATEGORIES as readonly string[]).includes(cat ?? "") ? cat! : null;
  const rows = f.ledger.filter((l) => !catOk || l.category === catOk);
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");
  const ledgerPanel = (
    <section aria-labelledby="lg-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="lg-h" className="font-display text-2xl">{t("ledgerTitle")}</h2><p className="max-w-md text-sm text-muted">{t("ledgerLead")}</p></div>
        <AddEntry assets={f.assets} today={DEMO_TODAY} />
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
        <li><Link href="/finance#ledger" aria-current={!catOk ? "true" : undefined} className={chip(!catOk)}>{t("all")}</Link></li>
        {CATEGORIES.filter((c) => f.ledger.some((l) => l.category === c)).map((c) => <li key={c}><Link href={`/finance?cat=${c}#ledger`} aria-current={catOk === c ? "true" : undefined} className={chip(catOk === c)}>{t(`c_${c}`)}</Link></li>)}
      </ul>
      <ul aria-label={t("ledgerTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
        {rows.slice(0, 60).map((l) => (
          <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p><span className="font-semibold">{t(`c_${l.category}` as "c_rent")}</span> <span className="text-muted">{l.source === "manual" ? t("manual") : ""}</span></p>
              <p className="text-xs text-muted">{l.source === "manual" ? dateFmt(l.date, locale) : month(l.month)}{listSep(locale)}{l.assetId ? `${l.assetId}: ${ar ? l.assetNameAr : l.assetName}` : t("portfolioLevel")}{l.memo ? `${listSep(locale)}${l.memo}` : ""}</p>
            </div>
            <bdi className={cn("num font-semibold", l.amountEgp < 0 ? "text-danger" : "text-ok")}>{l.amountEgp < 0 ? "−" : "+"}{M(Math.abs(l.amountEgp))}</bdi>
          </li>
        ))}
      </ul>
      {rows.length > 60 && <p className="text-xs text-muted">{t("showingN", { n: 60, total: rows.length })}</p>}
    </section>
  );

  /** Differences under half a percent of budget are noise, not a variance worth colouring. */
  const onBudget = (v: (typeof f.bva)[number]) => v.variance === 0 || (v.pct !== null && Math.abs(v.pct) < 0.005);
  const budgetTotals = f.bva.reduce((a, v) => ({ budget: a.budget + v.budget, actual: a.actual + v.actual }), { budget: 0, actual: 0 });
  const budgetPanel = (
    <section aria-labelledby="bg-h" className="space-y-4">
      <h2 id="bg-h" className="font-display text-2xl">{t("budgetTitle", { from: month(f.ytdMonths[0]), to: month(f.ytdMonths[f.ytdMonths.length - 1]) })}</h2>
      <p className="max-w-md text-sm text-muted">{t("budgetLead")}</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[34rem] text-sm">
          <thead><tr className="border-b border-line text-xs text-muted"><th className="px-4 py-2 text-start font-semibold">{t("category")}</th><th className="px-4 py-2 text-end font-semibold">{t("budget")}</th><th className="px-4 py-2 text-end font-semibold">{t("actual")}</th><th className="px-4 py-2 text-end font-semibold">{t("variance")}</th></tr></thead>
          <tbody>
            {f.bva.map((v) => (
              <tr key={v.category} className="border-b border-line">
                <th scope="row" className="px-4 py-2 text-start font-normal">{t(`c_${v.category}` as "c_rent")} <span className="text-xs text-muted">{isIncome(v.category) ? t("incomeTag") : t("costTag")}</span></th>
                <td className="px-4 py-2 text-end"><span className="num">{M(Math.abs(v.budget), true)}</span></td>
                <td className="px-4 py-2 text-end"><span className="num">{M(Math.abs(v.actual), true)}</span></td>
                <td className={cn("px-4 py-2 text-end font-semibold", onBudget(v) ? "text-muted" : v.unfavourable ? "text-danger" : "text-ok")}>
                  <span className="num">{onBudget(v) ? t("onBudget") : `${v.unfavourable ? t("worse") : t("better")} ${M(Math.abs(v.variance), true)}${v.pct !== null ? ` (${pct(Math.abs(v.pct), locale, 0)})` : ""}`}</span>
                </td>
              </tr>
            ))}
            <tr className="font-semibold"><th scope="row" className="px-4 py-2 text-start">{t("noi")}</th><td className="px-4 py-2 text-end"><span className="num">{M(budgetTotals.budget, true)}</span></td><td className="px-4 py-2 text-end"><span className="num">{M(budgetTotals.actual, true)}</span></td>
              <td className={cn("px-4 py-2 text-end", budgetTotals.actual < budgetTotals.budget ? "text-danger" : "text-ok")}><span className="num">{budgetTotals.actual < budgetTotals.budget ? t("worse") : t("better")} {M(Math.abs(budgetTotals.actual - budgetTotals.budget), true)}</span></td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("budgetNote")}</p>
    </section>
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      <HashTabs label={t("title")} tabs={[
        { id: "overview", label: t("tabOverview"), content: overview },
        { id: "ledger", label: t("tabLedger"), content: ledgerPanel },
        { id: "budget", label: t("tabBudget"), count: f.bva.filter((v) => v.unfavourable && !onBudget(v)).length, content: budgetPanel },
        { id: "distributions", label: t("tabDist"), content: distributionsPanel },
      ]} />
    </div>
  );
}
