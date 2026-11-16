import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listInvoicesForEInvoice } from "@/lib/einvoice";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { dateFmt, money } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { titleFrom } from "@/lib/meta";
import { eInvoiceStatuses } from "@/lib/einvoice-sign";

export const generateMetadata = titleFrom("einv", "title");
const RESIDENTIAL = ["apartment", "villa"];

export default async function EInvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("leases");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("einv");
  const rows = await listInvoicesForEInvoice(user);
  if (!rows) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const statuses = (await eInvoiceStatuses(user)) ?? new Map<string, string>();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/leases" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("back")}</Link>
        <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      </div>
      <p className="max-w-2xl rounded-lg border border-gold/50 bg-gold-fill/10 p-3 text-sm">{t("draftOnly")}</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface" role="region" aria-label={t("table")} tabIndex={0}>
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">{t("table")}</caption>
          <thead className="text-muted"><tr className="border-b border-line">
            <th scope="col" className="p-3 text-start font-semibold">{t("invoice")}</th>
            <th scope="col" className="p-3 text-start font-semibold">{t("tenant")}</th>
            <th scope="col" className="p-3 text-start font-semibold">{t("period")}</th>
            <th scope="col" className="p-3 text-start font-semibold">{t("vat")}</th>
            <th scope="col" className="p-3 text-start font-semibold">{t("stage")}</th>
            <th scope="col" className="p-3 text-end font-semibold">{t("net")}</th>
          </tr></thead>
          <tbody>
            {rows.map(({ i, tenant, tenantAr, asset, assetAr, type }) => (
              <tr key={i.id} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 text-start font-normal"><Link href={`/leases/einvoices/${i.id}`} className="font-semibold text-gold underline underline-offset-4" dir="ltr">{i.id}</Link><span className="block text-xs text-muted">{ar ? assetAr : asset}</span></th>
                <td className="p-3">{ar ? tenantAr : tenant}</td>
                <td className="p-3">{dateFmt(i.period, locale)}</td>
                <td className="p-3"><Badge tone="muted">{RESIDENTIAL.includes(type) ? t("vatExempt") : t("vat14")}</Badge></td>
                <td className="p-3">{(() => { const st = statuses.get(i.id) ?? "draft"; return <Badge tone={st === "signed" ? "ok" : st === "approved" ? "gold" : "muted"}>{t(`es_${st}`)}</Badge>; })()}</td>
                <td className="p-3 text-end"><span className="num">{money(i.amountEgp, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD })}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
