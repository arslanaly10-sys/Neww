import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { CAPEX_CATEGORIES, listCapex } from "@/lib/ops";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { dateFmt, int, money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { OpsNav } from "@/components/ops/subnav";
import { CapexActions, ProposeCapex } from "@/components/ops/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("ops", "cxTitle");
const TONE = { proposed: "gold", approved: "teal", in_progress: "teal", done: "ok", rejected: "muted" } as const;
const ORDER = ["proposed", "approved", "in_progress", "done", "rejected"];

export default async function CapexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("ops");
  const data = await listCapex(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const manage = can(user.role, "work.manage");
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD, compact: true });
  const opt = (x: { id: string; name: string; nameAr: string }) => ({ id: x.id, name: x.name, nameAr: x.nameAr });
  const items = [...data.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("cxTitle")} lead={t("cxLead")}><SampleBadge /></PageHeader>
      <OpsNav current="capex" role={user.role} />
      <Stagger className={KPI5}>
        <Stat label={t("kAwaiting")}><span className="num">{int(data.totals.awaiting, locale)}</span></Stat>
        <Stat label={t("kApproved")}><span className="num">{M(data.totals.approvedBudget)}</span></Stat>
        <Stat label={t("kSpent")}><span className="num">{M(data.totals.spent)}</span></Stat>
        <Stat label={t("kRemaining")}><span className="num">{M(Math.max(0, data.totals.approvedBudget - data.totals.spent))}</span></Stat>
        <Stat label={t("kOver")}><span className={cn("num", data.items.some((x) => x.overBudget) && "text-danger")}>{int(data.items.filter((x) => x.overBudget).length, locale)}</span></Stat>
      </Stagger>
      {manage && <ProposeCapex assets={data.assets.map(opt)} contractors={data.contractors.map(opt)} categories={CAPEX_CATEGORIES} />}
      <ul className="space-y-3">
        {items.map((x) => {
          const title = ar && x.titleAr ? x.titleAr : x.title;
          const share = x.budgetEgp ? Math.min(1, x.spentEgp / x.budgetEgp) : 0;
          return (
            <li key={x.id}>
              <Card className="grid gap-4 text-sm md:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-1.5"><span className="num text-xs font-semibold text-gold">{x.id}</span><Badge tone={TONE[x.status as "proposed"]}>{t(`cs_${x.status}`)}</Badge><Badge tone="muted">{t(`cx_${x.category}`)}</Badge>{x.overBudget && <Badge tone="danger">{t("overBudget")}</Badge>}</p>
                  <h2 className="text-base font-semibold">{title}</h2>
                  <p className="text-muted">{x.assetId}: {x.asset ? (ar ? x.asset.nameAr : x.asset.name) : ""}{x.contractor ? `, ${ar ? x.contractor.nameAr : x.contractor.name}` : ""}</p>
                  {x.note && <p>{x.note}</p>}
                  <p className="text-xs text-muted">{t("proposedBy", { who: x.proposer ? (ar ? x.proposer.nameAr : x.proposer.name) : x.proposedBy })}{x.decider ? `, ${t(x.status === "rejected" ? "rejectedBy" : "approvedBy", { who: ar ? x.decider.nameAr : x.decider.name })}` : ""}{x.completedOn ? `, ${t("completedOn", { date: dateFmt(x.completedOn, locale) })}` : x.startOn ? `, ${t("startsOn", { date: dateFmt(x.startOn, locale) })}` : ""}</p>
                </div>
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-xs text-muted">{t("budget")}</dt><dd className="num">{M(x.budgetEgp)}</dd></div>
                    <div><dt className="text-xs text-muted">{t("spent")}</dt><dd className={cn("num", x.overBudget && "text-danger")}>{M(x.spentEgp)}</dd></div>
                    {x.usefulLifeYears && <div><dt className="text-xs text-muted">{t("life")}</dt><dd>{t("nYears", { n: x.usefulLifeYears })}</dd></div>}
                    {x.expectedUpliftEgp !== null && <div><dt className="text-xs text-muted">{t("uplift")}</dt><dd className="num">{M(x.expectedUpliftEgp)}</dd></div>}
                  </dl>
                  {x.status !== "rejected" && x.status !== "proposed" && <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={t("spentShare", { pct: Math.round((x.spentEgp / x.budgetEgp) * 100) })}><div className={cn("h-full origin-left rounded-full rtl:origin-right", x.overBudget ? "bg-danger" : "bg-gold-fill")} style={{ transform: `scaleX(${share})` }} /></div>}
                  {manage && <CapexActions id={x.id} status={x.status} mine={x.proposedBy === user.id} spent={x.spentEgp} label={`${x.id}, ${title}`} />}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="max-w-2xl text-xs text-muted">{t("cxNote")}</p>
    </div>
  );
}
