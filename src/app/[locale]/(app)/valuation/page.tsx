import { getTranslations, setRequestLocale } from "next-intl/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assumptionSets, districts } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { getPortfolio } from "@/lib/access";
import { listValuations } from "@/lib/valuation-service";
import { can } from "@/lib/permissions";
import { dateFmt, money, pct, listSep } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD, VALUATION_ASSUMPTIONS } from "@/lib/assumptions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { SampleBadge } from "@/components/fig";
import { Workbench } from "@/components/valuation/workbench";
import { DecideButtons } from "@/components/valuation/decide-buttons";

export default async function Valuation({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ asset?: string }> }) {
  const { locale } = await params;
  const { asset } = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("valuation");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("val");
  const db = await getDb();
  const ar = locale === "ar";
  const fx = SAMPLE_FX_EGP_PER_USD;

  const [sets, ds, portfolio, vals] = await Promise.all([
    db.select().from(assumptionSets).orderBy(desc(assumptionSets.createdAt)),
    db.select().from(districts).orderBy(districts.name),
    getPortfolio(user),
    listValuations(user),
  ]);
  const options = portfolio.map((a) => ({ id: a.id, name: a.name, nameAr: a.nameAr, districtId: a.districtId, type: a.type, areaSqm: a.areaSqm, floor: a.floor, finish: a.finish, age: a.yearBuilt ? 2026 - a.yearBuilt : null }));
  const queue = vals.filter((v) => v.status === "in_review");
  const history = vals.filter((v) => v.status !== "in_review").slice(0, 8);
  const canConfirm = can(user.role, "valuation.confirm");
  const blocked = (v: (typeof vals)[number]) =>
    !canConfirm ? t("blockedRole") : v.proposedBy === user.id ? t("blockedSelf") : v.approvedBy.includes(user.id) ? t("blockedAlready") : null;
  const tone = { in_review: "gold", confirmed: "ok", rejected: "danger", draft: "muted" } as const;

  return (
    <div className="space-y-10">
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>

      <Workbench districts={ds.map((d) => ({ id: d.id, name: d.name, nameAr: d.nameAr }))} assets={options}
        initialAssetId={options.find((o) => o.id === asset)?.id ?? null} currency={currency} fx={fx} role={user.role} threshold={VALUATION_ASSUMPTIONS.adjustment.secondApproverAbovePct} />

      <section id="queue" className="scroll-mt-24">
        <h2 className="mb-1 font-display text-2xl">{t("queue")}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">{t("queueLead")}</p>
        {queue.length === 0 ? <Card className="text-sm text-muted">{t("queueEmpty")}</Card> : (
          <ul className="space-y-3">
            {queue.map((v) => (
              <li key={v.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{v.id}</span><Badge tone="gold">{t("status_in_review")}</Badge>
                        {v.requiredApprovals > 1 && <Badge tone="danger" className="">{t("needsTwoShort", { n: v.approvedBy.length, m: v.requiredApprovals })}</Badge>}</p>
                      <p className="mt-1 text-sm">{v.assetId ? `${v.assetId}: ${ar ? v.assetNameAr : v.assetName}` : t("adHoc")}</p>
                      <p className="text-xs text-muted">{t("proposedBy", { name: ar ? v.proposerNameAr : v.proposerName })}{listSep(locale)}<bdi>{dateFmt(v.createdAt.slice(0, 10), locale)}</bdi></p>
                      <p className="mt-2 text-sm"><span className="text-muted">{t("modelEstimate")}:</span> <bdi>{money(v.modelEstimateEgp, currency, locale, { fx })}</bdi> → <span className="text-muted">{t("finalValue")}:</span> <bdi className="font-semibold">{money(v.finalValueEgp ?? v.modelEstimateEgp, currency, locale, { fx })}</bdi> <bdi className="text-muted">({pct(v.adjustmentPct, locale)})</bdi></p>
                      {v.reasonCode && <p className="mt-1 text-sm text-muted"><span className="text-text">{t(`rc_${v.reasonCode}` as "rc_other")}:</span> {v.reason}</p>}
                    </div>
                    <DecideButtons id={v.id} blockedReason={blocked(v)} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <>
            <h3 className="mb-2 mt-8 font-display text-lg">{t("recent")}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {history.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span><span className="num font-semibold text-gold">{v.id}</span> <span className="text-muted">{v.assetId ?? t("adHoc")}</span></span>
                  <span className="flex items-center gap-3"><bdi>{money(v.finalValueEgp ?? v.modelEstimateEgp, currency, locale, { fx, compact: true })}</bdi><Badge tone={tone[v.status as "confirmed"]}>{t(`status_${v.status}` as "status_confirmed")}</Badge></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section id="register" className="scroll-mt-24">
        <h2 className="mb-2 font-display text-2xl">{t("register")}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">{t("registerNote")}</p>
        <div className="space-y-3">
          {sets.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="num font-semibold text-gold">{s.id}</h3>
                <bdi className="text-xs text-muted">{dateFmt(s.createdAt.toISOString().slice(0, 10), locale)}</bdi>
              </div>
              <p className="mt-1 text-sm text-muted">{s.note}</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div><dt className="text-muted">{t("kind")}</dt><dd className="font-semibold">{s.kind}</dd></div>
                <div><dt className="text-muted">{t("version")}</dt><dd className="num font-semibold">{s.version}</dd></div>
                <div className="sm:col-span-3"><dt className="text-muted">{t("hash")}</dt><dd className="num break-all font-mono">{s.contentHash}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
