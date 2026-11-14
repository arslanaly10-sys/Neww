import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listContractors, TRADES } from "@/lib/ops";
import { can } from "@/lib/permissions";
import { int, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { OpsNav } from "@/components/ops/subnav";
import { NewContractor } from "@/components/ops/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("ops", "ctTitle");

export default async function ContractorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("ops");
  const list = await listContractors(user);
  if (!list) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const manage = can(user.role, "work.manage");
  const money = can(user.role, "asset.income_costs.view");
  const rows = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.jobs - a.jobs);
  const dash = <span className="text-muted">–</span>;

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("ctTitle")} lead={t("ctLead")}><SampleBadge /></PageHeader>
      <OpsNav current="contractors" role={user.role} />
      {manage && <NewContractor trades={TRADES} />}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface" role="region" aria-label={t("ctTable")} tabIndex={0}>
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">{t("ctTable")}</caption>
          <thead className="text-start text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="p-3 text-start font-semibold">{t("contractor")}</th>
              <th scope="col" className="p-3 text-start font-semibold">{t("fTrade")}</th>
              <th scope="col" className="p-3 text-end font-semibold">{t("thJobs")}</th>
              <th scope="col" className="p-3 text-end font-semibold">{t("thOnTime")}</th>
              <th scope="col" className="p-3 text-end font-semibold">{t("thDays")}</th>
              {money && <th scope="col" className="p-3 text-end font-semibold">{t("thCost")}</th>}
              <th scope="col" className="p-3 text-end font-semibold">{t("thRating")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 text-start font-normal"><span className="block font-semibold">{ar ? c.nameAr : c.name}</span><span className="block text-xs text-muted" dir="ltr">{c.id}, {c.email}</span></th>
                <td className="p-3"><Badge tone="muted">{t(`tr_${c.trade}`)}</Badge></td>
                <td className="p-3 text-end"><span className="num">{int(c.jobs, locale)}</span>{c.open > 0 && <span className="block text-xs text-muted">{t("openN", { n: c.open })}</span>}</td>
                <td className="p-3 text-end">{c.onTimePct === null ? dash : <span className={cn("num", c.onTimePct < 60 && "text-danger")}>{pct(c.onTimePct / 100, locale, 0)}</span>}</td>
                <td className="p-3 text-end">{c.avgDays === null ? dash : <span className="num">{t("nDays", { n: c.avgDays })}</span>}</td>
                {money && <td className="p-3 text-end">{c.costVariancePct === null ? dash : <span className={cn("num", c.costVariancePct > 10 && "text-danger")}>{c.costVariancePct > 0 ? "+" : ""}{pct(c.costVariancePct / 100, locale, 1)}</span>}</td>}
                <td className="p-3 text-end">{c.rating === null ? dash : <span><span className="num font-semibold">{c.rating.toFixed(1)}</span><span className="block text-xs text-muted">{t("fromN", { n: c.ratings })}</span></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-2xl text-xs text-muted">{money ? t("ctNote") : t("ctNoteInvestor")}</p>
    </div>
  );
}
