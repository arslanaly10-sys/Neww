import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { factQueue } from "@/lib/asset-record";
import { can } from "@/lib/permissions";
import { dateFmt, int, listSep, money } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { FactReview } from "@/components/record/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("record", "queueTitle");

/** Every fact still waiting for a reviewer, across the portfolio: the analyst's queue. */
export default async function FactQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("record");
  const fi = await getTranslations("finish");
  const st = await getTranslations("status");
  const ds = await getTranslations("docStatus");
  const q = (await factQueue(user))!;
  const ar = locale === "ar";
  const verify = can(user.role, "records.verify");
  const val = (field: string, v: string) => field === "value_egp" ? money(Number(v), currency, locale, { fx: SAMPLE_FX_EGP_PER_USD }) : field.endsWith("sqm") ? `${int(Number(v), locale)} m²` : field === "finish" ? fi(v as "luxury") : field === "occupancy" ? st(v as "let") : field === "status" ? t(`as_${v}` as "as_ready") : field === "title_status" && ds.has(v) ? ds(v as "verified") : field === "permitted_use" && t.has(`use_${v}`) ? t(`use_${v}` as "use_residential") : v;
  const disputed = q.filter((f) => f.status === "disputed").length;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/asset" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("allAssets")}</Link>
        <PageHeader animated title={t("queueTitle")} lead={verify ? t("queueLead") : t("queueLeadRead")} />
      </div>
      <p className="text-sm">{t("queueCount", { n: q.length, disputed })}</p>
      {q.length === 0 ? <Card className="text-sm text-muted">{t("queueEmpty")}</Card> : (
        <ul aria-label={t("queueTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
          {q.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <div className="min-w-60 flex-1">
                <p><Link href={`/asset/${f.assetId}/record#facts`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold"><span className="num">{f.assetId}</span> {ar ? f.assetNameAr : f.assetName}</Link></p>
                <p>{t(`f_${f.field}` as "f_area_sqm")}: <span className="font-semibold">{val(f.field, f.value)}</span></p>
                <p className="text-xs text-muted">{f.sourceLabel}{listSep(locale)}{t("observed", { date: dateFmt(f.observedOn, locale) })}{f.reviewNote ? `${listSep(locale)}${f.reviewNote}` : ""}</p>
              </div>
              <Badge tone={f.status === "disputed" ? "danger" : "muted"}>{t(`fs_${f.status}` as "fs_verified")}</Badge>
              {verify && <FactReview id={f.id} label={`${f.assetId} ${t(`f_${f.field}` as "f_area_sqm")}`} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
