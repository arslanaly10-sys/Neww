import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getLeasing } from "@/lib/leasing";
import { BUCKETS } from "@/lib/leasing-calc";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { dateFmt, int, listSep, money, pct } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { RecordPayment, RenewalEditor, SendReminder } from "@/components/leasing/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("lease");

const STAGE_TONE = { not_started: "muted", offered: "gold", negotiating: "gold", agreed: "ok", leaving: "danger" } as const;

export default async function LeasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("leases");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("lease");
  const data = await getLeasing(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const fx = SAMPLE_FX_EGP_PER_USD;
  const M = (egp: number, compact = false) => money(egp, currency, locale, { fx, compact });
  const rentText = (n: number | null, cur: string) => (n === null ? null : `${cur === "USD" ? "USD" : ar ? "جنيه" : "EGP"} ${int(n, locale)}`);
  const leaseCount = data.tenants.reduce((s, x) => s + x.leases.length, 0);

  const tenantsPanel = (
    <section aria-labelledby="tn-h">
      <h2 id="tn-h" className="sr-only">{t("tabTenants")}</h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {data.tenants.map((x) => {
          const next = x.leases[0];
          return (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/leases/${x.id}`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold">{ar ? x.nameAr : x.name}</Link>
                <p className="text-xs text-muted">{x.sector}{listSep(locale)}{x.leases.map((l) => `${l.id}: ${ar ? l.assetNameAr : l.assetName}`).join(listSep(locale))}</p>
                {next && <p className="mt-0.5 text-xs text-muted">{t("endsOn", { date: dateFmt(next.endDate, locale), n: next.daysLeft })}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {next?.renewal && <Badge tone={STAGE_TONE[next.renewal.status]}>{t(`st_${next.renewal.status}`)}</Badge>}
                {x.arrearsEgp !== null && (x.arrearsEgp > 0
                  ? <Badge tone="danger">{t("arrearsBadge", { amount: M(x.arrearsEgp, true), days: x.oldestOverdueDays ?? 0 })}</Badge>
                  : <Badge tone="ok">{t("upToDate")}</Badge>)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const byStage = (["leaving", "not_started", "offered", "negotiating", "agreed"] as const).map((s) => ({ s, items: data.renewals.filter((r) => (r.renewal?.status ?? "not_started") === s) })).filter((g) => g.items.length);
  const renewalsPanel = (
    <section aria-labelledby="rn-h">
      <h2 id="rn-h" className="mb-1 font-display text-2xl">{t("renewalsTitle")}</h2>
      <p className="mb-4 max-w-md text-sm text-muted">{t("renewalsLead", { days: 180 })}</p>
      {byStage.length === 0 ? <Card className="text-sm text-muted">{t("noRenewals")}</Card> : (
        <div className="space-y-5">
          {byStage.map((g) => (
            <section key={g.s} aria-labelledby={`st-${g.s}`} className="rounded-lg border border-line bg-surface">
              <h3 id={`st-${g.s}`} className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold"><Badge tone={STAGE_TONE[g.s]}>{t(`st_${g.s}`)}</Badge><span className="text-sm font-normal text-muted">{t("leasesN", { n: g.items.length })}</span></h3>
              <ul className="divide-y divide-line">
                {g.items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p><span className="num font-semibold text-gold">{r.id}</span> <Link href={`/asset/${r.assetId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{ar ? r.assetNameAr : r.assetName}</Link>{listSep(locale)}<Link href={`/leases/${r.tenantId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{ar ? r.tenantNameAr : r.tenantName}</Link></p>
                      <p className={r.daysLeft <= 60 ? "text-danger" : "text-muted"}>{t("endsOn", { date: dateFmt(r.endDate, locale), n: r.daysLeft })}</p>
                      {data.money && <p className="mt-0.5">{t("rentNow", { rent: rentText(r.monthlyRent, r.currency) ?? "–" })}{r.renewal?.proposedRent ? <>{listSep(locale)}{t("rentProposed", { rent: rentText(r.renewal.proposedRent, r.currency) ?? "", pct: pct(r.renewal.proposedRent / (r.monthlyRent ?? r.renewal.proposedRent) - 1, locale) })}</> : null}</p>}
                      {r.renewal?.proposedEnd && <p className="text-muted">{t("newEnd", { date: dateFmt(r.renewal.proposedEnd, locale) })}</p>}
                      {r.renewal?.note && <p className="mt-1 rounded bg-surface-2 p-2 text-xs text-muted">{r.renewal.note}</p>}
                    </div>
                    {data.money && <RenewalEditor leaseId={r.id} title={`${r.id}, ${ar ? r.assetNameAr : r.assetName}`} currency={r.currency} endDate={r.endDate} current={r.renewal} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!data.money && <p className="mt-4 text-xs text-muted">{t("investorNote")}</p>}
    </section>
  );

  const rent = data.rent;
  const rentPanel = rent && (
    <section aria-labelledby="rc-h" className="space-y-6">
      <h2 id="rc-h" className="sr-only">{t("tabRent")}</h2>
      <Stagger className={KPI5}>
        <Stat label={t("kCollected", { month: dateFmt(rent.period, locale).replace(/^\d+\s/, "") })} hint={t("ofBilled", { collected: M(rent.month.collected, true), billed: M(rent.month.billed, true) })}><span className="num">{rent.month.rate === null ? "–" : pct(rent.month.rate, locale, 0)}</span></Stat>
        <Stat label={t("kPrev")} hint={t("paidOfN", { n: rent.prev.paidCount, m: rent.prev.count })}><span className="num">{rent.prev.rate === null ? "–" : pct(rent.prev.rate, locale, 0)}</span></Stat>
        <Stat label={t("kArrears")} hint={t("invoicesN", { n: rent.open.filter((i) => i.daysOverdue > 0).length })}><span className="num">{M(rent.aging.total, true)}</span></Stat>
        <Stat label={t("kOver60")}><span className={rent.aging.buckets.d61_90 + rent.aging.buckets.d90p > 0 ? "num text-danger" : "num"}>{M(rent.aging.buckets.d61_90 + rent.aging.buckets.d90p, true)}</span></Stat>
        <Stat label={t("kTenantsLate")}><span className="num">{int(data.tenants.filter((x) => (x.arrearsEgp ?? 0) > 0).length, locale)}</span></Stat>
      </Stagger>
      <Card>
        <h3 className="mb-3 font-display text-xl">{t("agingTitle")}</h3>
        <ul className="grid gap-3 sm:grid-cols-4">
          {BUCKETS.map((b) => {
            const v = rent.aging.buckets[b];
            return (
              <li key={b}>
                <div className="mb-1 flex justify-between gap-2 text-sm"><span>{t(`b_${b}`)}</span><bdi className="num">{M(v, true)}</bdi></div>
                <div aria-hidden="true" className="h-2 rounded-full bg-surface-2"><div className={`h-2 rounded-full ${b === "d0_30" ? "bg-gold-fill" : "bg-danger"}`} style={{ width: `${rent.aging.total ? (v / rent.aging.total) * 100 : 0}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </Card>
      <div>
        <h3 id="open-h" className="mb-3 font-display text-xl">{t("openTitle", { n: rent.open.length })}</h3>
        {rent.open.length === 0 ? <Card className="text-sm text-muted">{t("allPaid")}</Card> : (
          <ul aria-labelledby="open-h" className="divide-y divide-line rounded-lg border border-line bg-surface">
            {rent.open.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold"><Link href={`/leases/${i.tenantId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{ar ? i.tenantNameAr : i.tenantName}</Link></p>
                  <p className="text-muted">{ar ? i.assetNameAr : i.assetName}{listSep(locale)}<span className="num">{i.leaseId}</span>{listSep(locale)}{t("periodOf", { month: dateFmt(i.period, locale).replace(/^\d+\s/, "") })}</p>
                  <p className="mt-0.5"><span className="font-semibold">{M(i.outstandingEgp)}</span> <span className="text-muted">{i.paidEgp > 0 ? t("partOf", { of: M(i.amountEgp) }) : ""}</span></p>
                  <p className={i.daysOverdue > 30 ? "text-xs text-danger" : "text-xs text-muted"}>{i.daysOverdue > 0 ? t("overdueDays", { n: i.daysOverdue, date: dateFmt(i.dueOn, locale) }) : t("dueOn", { date: dateFmt(i.dueOn, locale) })}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <RecordPayment invoiceId={i.id} outstandingEgp={i.outstandingEgp} period={i.period} today={DEMO_TODAY} title={`${ar ? i.tenantNameAr : i.tenantName}, ${i.period.slice(0, 7)}`} />
                  {i.daysOverdue > 0 && <SendReminder invoiceId={i.id} lastReminderOn={i.lastReminderOn} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">{t("currencyNote")}</p>
      </div>
    </section>
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead", { tenants: data.tenants.length, leases: leaseCount })}><SampleBadge /></PageHeader>
      <HashTabs label={t("title")} tabs={[
        ...(rentPanel ? [{ id: "rent", label: t("tabRent"), count: rent!.open.filter((i) => i.daysOverdue > 0).length, content: rentPanel }] : []),
        { id: "renewals", label: t("tabRenewals"), count: data.renewals.length, content: renewalsPanel },
        { id: "tenants", label: t("tabTenants"), count: data.tenants.length, content: tenantsPanel },
      ]} />
    </div>
  );
}
