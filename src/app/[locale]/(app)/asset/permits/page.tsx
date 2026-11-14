import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { permitRegister } from "@/lib/permits";
import { PERMIT_KINDS, type PermitState } from "@/lib/permits-rules";
import { can } from "@/lib/permissions";
import { dateFmt, int } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { PermitReview } from "@/components/permits/controls";
import { STATE_ICON, STATE_TONE } from "@/components/permits/permit-list";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("permits", "title");
const FILTERS = ["all", "action", "expiring", "pending", "attention"] as const;

/** The portfolio's permits and legal status: a matrix of assets by permit, with what needs doing and the review queue. */
export default async function PermitsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ show?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("permits");
  const reg = await permitRegister(user);
  if (!reg) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const verify = can(user.role, "records.verify");
  const show = (FILTERS as readonly string[]).includes(sp.show ?? "") ? (sp.show as (typeof FILTERS)[number]) : "all";
  const rows = show === "all" ? reg.rows : reg.rows.filter((r) => r.items.some((i) => (i.required || i.permit) && i.state.state === show));
  const kinds = PERMIT_KINDS.filter((k) => reg.rows.some((r) => r.items.some((i) => i.kind === k)));
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");
  const count = (s: PermitState) => reg.rows.filter((r) => r.items.some((i) => (i.required || i.permit) && i.state.state === s)).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/asset" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("allAssets")}</Link>
        <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      </div>
      <Stagger className={KPI5}>
        <Stat label={t("kInOrder")}><span className="num">{t("ofN", { n: int(reg.totals.inOrder, locale), total: int(reg.totals.assets, locale) })}</span></Stat>
        <Stat label={t("kAction")}><span className={cn("num", reg.totals.action > 0 && "text-danger")}>{int(reg.totals.action, locale)}</span></Stat>
        <Stat label={t("kExpiring")}><span className="num">{int(reg.totals.expiring, locale)}</span></Stat>
        <Stat label={t("kUnregistered")}><span className="num">{int(reg.totals.unregistered, locale)}</span></Stat>
        <Stat label={t("kUnverified")}><span className="num">{int(reg.totals.unverified, locale)}</span></Stat>
      </Stagger>

      <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
        {FILTERS.map((f) => <li key={f}><Link href={f === "all" ? "/asset/permits" : `/asset/permits?show=${f}`} aria-current={show === f ? "true" : undefined} className={chip(show === f)}>{t(`f_${f}`)}{f !== "all" && <span className="num text-xs font-semibold">{count(f)}</span>}</Link></li>)}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface" role="region" aria-label={t("matrix")} tabIndex={0}>
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">{t("matrix")}</caption>
          <thead className="text-muted"><tr className="border-b border-line">
            <th scope="col" className="p-3 text-start font-semibold">{t("asset")}</th>
            {kinds.map((k) => <th key={k} scope="col" className="p-3 text-start font-semibold">{t(`k_${k}`)}</th>)}
            <th scope="col" className="p-3 text-start font-semibold">{t("overall")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset.id} className="border-b border-line last:border-0 align-top">
                <th scope="row" className="p-3 text-start font-normal"><Link href={`/asset/${r.asset.id}/record#permits`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold"><span className="num">{r.asset.id}</span> {ar ? r.asset.nameAr : r.asset.name}</Link></th>
                {kinds.map((k) => {
                  const i = r.items.find((x) => x.kind === k);
                  if (!i) return <td key={k} className="p-3 text-muted">{t("na")}</td>;
                  const Icon = STATE_ICON[i.state.state];
                  const text = i.state.reason === "expiring" ? t("r_expiringShort", { days: i.state.days ?? 0 }) : i.permit?.form && i.state.state !== "action" ? t(`tf_${i.permit.form}`) : t(`rs_${i.state.reason}`);
                  return <td key={k} className="p-3"><span className={cn("inline-flex items-center gap-1.5", i.state.state === "action" && "font-semibold text-danger")}><Icon aria-hidden="true" size={14} className={cn(i.state.state === "ok" ? "text-ok" : i.state.state === "action" ? "text-danger" : i.state.state === "pending" ? "text-teal" : "text-gold")} />{text}</span>{i.permit?.expiresOn && i.state.state !== "expiring" && <span className="block text-xs text-muted">{t("untilDate", { date: dateFmt(i.permit.expiresOn, locale) })}</span>}</td>;
                })}
                <td className="p-3"><Badge tone={STATE_TONE[r.compliance.state]}>{t(`as_${r.compliance.state}`)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-3xl text-xs text-muted">{t("policyNote")}</p>

      <section id="queue" aria-labelledby="q-h" className="space-y-3">
        <h2 id="q-h" className="font-display text-2xl">{t("queueTitle")}</h2>
        <p className="text-sm text-muted">{verify ? t("queueLead") : t("queueLeadRead")}</p>
        {reg.queue.length === 0 ? <Card className="text-sm text-muted">{t("queueEmpty")}</Card> : (
          <ul aria-label={t("queueTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
            {reg.queue.map((p) => {
              const what = t("whatFor", { kind: t(`k_${p.kind}`), asset: p.assetId });
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                  <div className="min-w-60 flex-1">
                    <p><Link href={`/asset/${p.assetId}/record#permits`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold">{what}</Link></p>
                    <p className="text-xs text-muted">{t(`st_${p.status}`)}{p.reference ? `, ${p.reference}` : ""}. {t("byOn", { who: ar ? p.recorderNameAr : p.recorderName, date: dateFmt(p.recordedAt.toISOString(), locale) })}</p>
                  </div>
                  <Badge tone={p.verification === "disputed" ? "danger" : "muted"}>{t(`v_${p.verification}`)}</Badge>
                  {verify && p.recordedBy !== user.id && <PermitReview id={p.id} what={what} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
