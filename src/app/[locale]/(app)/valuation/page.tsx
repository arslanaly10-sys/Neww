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
import { DecisionControl } from "@/components/decision";
import { HashTabs } from "@/components/hash-tabs";
import { Link } from "@/i18n/navigation";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("val");

export default async function Valuation({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ asset?: string }> }) {
  const { locale } = await params;
  const { asset } = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("valuation");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("val");
  const dc = await getTranslations("decide");
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

  const assetLabel = (v: (typeof vals)[number]) => (v.assetId ? `${v.assetId}: ${ar ? v.assetNameAr : v.assetName}` : t("adHoc"));
  const M = (n: number) => money(n, currency, locale, { fx });

  const queuePanel = (
    <section aria-labelledby="queue-h">
      <h2 id="queue-h" className="mb-1 font-display text-2xl">{t("queue")}</h2>
      <p className="mb-4 max-w-md text-sm text-muted">{t("queueLead")}</p>
      {queue.length === 0 ? <Card className="text-sm text-muted">{t("queueEmpty")}</Card> : (
        <ul className="space-y-3">
          {queue.map((v) => {
            const left = v.requiredApprovals - v.approvedBy.length;
            const final = v.finalValueEgp ?? v.modelEstimateEgp;
            return (
              <li key={v.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{v.id}</span><Badge tone="gold">{t("status_in_review")}</Badge>
                        {v.requiredApprovals > 1 && <Badge tone="danger">{t("needsTwoShort", { n: v.approvedBy.length, m: v.requiredApprovals })}</Badge>}</p>
                      <p className="mt-1 text-sm">{v.assetId ? <Link href={`/asset/${v.assetId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{assetLabel(v)}</Link> : assetLabel(v)}</p>
                      <p className="text-xs text-muted">{t("proposedBy", { name: ar ? v.proposerNameAr : v.proposerName })}{listSep(locale)}<bdi>{dateFmt(v.createdAt.slice(0, 10), locale)}</bdi></p>
                      <p className="mt-2 text-sm"><span className="text-muted">{t("modelEstimate")}:</span> <bdi>{M(v.modelEstimateEgp)}</bdi> <span aria-hidden="true">→</span><span className="sr-only">{dc("to")}</span> <span className="text-muted">{t("finalValue")}:</span> <bdi className="font-semibold">{M(final)}</bdi> <bdi className="text-muted">({pct(v.adjustmentPct, locale)})</bdi></p>
                      {v.reasonCode && <p className="mt-1 text-sm text-muted"><span className="text-text">{t(`rc_${v.reasonCode}` as "rc_other")}:</span> {v.reason}</p>}
                    </div>
                    <DecisionControl kind="valuation" id={v.id} title={`${v.id}, ${assetLabel(v)}`} blockedReason={blocked(v)}
                      reason={v.reasonCode ? `${t(`rc_${v.reasonCode}` as "rc_other")}: ${v.reason ?? ""}` : null}
                      effect={left <= 1 ? (v.assetId ? dc("effectConfirmAsset") : dc("effectConfirm")) : dc("effectPartial", { n: left - 1 })}
                      facts={[
                        { label: dc("fAsset"), value: assetLabel(v) },
                        { label: t("modelEstimate"), value: M(v.modelEstimateEgp) },
                        { label: t("finalValue"), value: M(final), strong: true },
                        { label: dc("fAdjustment"), value: pct(v.adjustmentPct, locale) },
                        { label: dc("fApprovals"), value: dc("approvalsValue", { n: v.approvedBy.length, m: v.requiredApprovals }) },
                        { label: dc("fProposedBy"), value: ar ? v.proposerNameAr : v.proposerName },
                      ]} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const historyPanel = (
    <section aria-labelledby="history-h">
      <h2 id="history-h" className="mb-3 font-display text-2xl">{t("recent")}</h2>
      {history.length === 0 ? <Card className="text-sm text-muted">{t("queueEmpty")}</Card> : (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {history.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0"><span className="num font-semibold text-gold">{v.id}</span> <span>{assetLabel(v)}</span></span>
              <span className="flex items-center gap-3"><bdi className="num">{money(v.finalValueEgp ?? v.modelEstimateEgp, currency, locale, { fx, compact: true })}</bdi><Badge tone={tone[v.status as "confirmed"]}>{t(`status_${v.status}` as "status_confirmed")}</Badge></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const registerPanel = (
    <section aria-labelledby="register-h">
      <h2 id="register-h" className="mb-2 font-display text-2xl">{t("register")}</h2>
      <p className="mb-4 max-w-md text-sm text-muted">{t("registerNote")}</p>
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
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      <HashTabs label={t("title")} tabs={[
        { id: "run", label: t("tabRun"), content: <Workbench districts={ds.map((d) => ({ id: d.id, name: d.name, nameAr: d.nameAr }))} assets={options}
          initialAssetId={options.find((o) => o.id === asset)?.id ?? null} currency={currency} fx={fx} role={user.role} threshold={VALUATION_ASSUMPTIONS.adjustment.secondApproverAbovePct} /> },
        { id: "queue", label: t("tabQueue"), count: queue.length, content: queuePanel },
        { id: "history", label: t("tabHistory"), content: historyPanel },
        { id: "register", label: t("tabRegister"), content: registerPanel },
      ]} />
    </div>
  );
}
