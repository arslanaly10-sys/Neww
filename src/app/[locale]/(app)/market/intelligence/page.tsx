import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { officialContext, portfolioContext, propertyLayer } from "@/lib/market-data/service";
import { AREA_ACCESS, can } from "@/lib/permissions";
import { dateFmt, int } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { Sparkline } from "@/components/market-data/controls";
import { Stagger, StaggerItem } from "@/components/motion";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("md", "pulseTitle");

const fmt = (v: number, unit: string, locale: string) => {
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { maximumFractionDigits: v > 1000 ? 0 : v > 100 ? 1 : 2 });
  return unit === "people" ? nf.format(v) : `${nf.format(v)}${unit.startsWith("%") ? "%" : ""}`;
};

/**
 * Market intelligence in four layers, each metric with its source, place, period, unit, retrieval date, licence and
 * the steps taken on the way in. Context explains the market around the portfolio; it is not evidence of a price.
 */
export default async function IntelligencePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("market");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("md");
  const ar = locale === "ar";
  const [official, ctx, prop] = await Promise.all([officialContext(user), portfolioContext(user), propertyLayer(user)]);
  const showAssets = can(user.role, "asset.view");
  const prov = ({ source, licence, retrieved, transform, period }: { source: string; licence: string; retrieved: string; transform: string; period?: string }) => (
    <details className="mt-2 text-xs"><summary className="cursor-pointer text-gold underline underline-offset-4">{t("provenance")}</summary>
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5"><dt className="text-muted">{t("pSource")}</dt><dd>{source}</dd>{period && <><dt className="text-muted">{t("pPeriod")}</dt><dd>{period}</dd></>}<dt className="text-muted">{t("pRetrieved")}</dt><dd>{dateFmt(retrieved.slice(0, 10), locale)}</dd><dt className="text-muted">{t("licence")}</dt><dd>{licence}</dd><dt className="text-muted">{t("pTransform")}</dt><dd>{transform}</dd></dl>
    </details>
  );
  const srcName = (id: string) => t(`src_${id}` as "src_worldbank");
  const files = ["capmas_cpi", "cbe_fx"].filter((s) => !official.some((o) => o.sourceId === s));
  return (
    <div className="space-y-10">
      <div>
        <Link href="/market" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{(await getTranslations("nav"))("market")}</Link>
        <PageHeader animated title={t("pulseTitle")} lead={t("pulseLead")}>{AREA_ACCESS.sources.includes(user.role) ? <Link href="/sources" className="tap text-sm text-gold underline underline-offset-4">{t("sourcesTitle")}</Link> : null}</PageHeader>
      </div>

      <section aria-labelledby="l1" className="space-y-3">
        <div><h2 id="l1" className="font-display text-2xl">{t("ly_official")}</h2><p className="max-w-2xl text-sm text-muted">{t("lyh_official")}</p></div>
        <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("ly_official")}>
          {official.map((s) => (
            <StaggerItem key={`${s.sourceId}-${s.indicator}`} as="li" className="rounded-xl border border-line bg-surface p-4 text-sm">
              <p className="text-muted">{t.has(`ind_${s.indicator.replace(/\./g, "_")}`) ? t(`ind_${s.indicator.replace(/\./g, "_")}` as "ind_SP_POP_TOTL") : s.label}</p>
              <div className="flex items-end justify-between gap-2"><p><span className="num font-display text-2xl">{s.latest ? fmt(s.latest.value, s.unit, locale) : "–"}</span> <span className="text-xs text-muted">{s.unit === "people" ? t("people") : s.unit.startsWith("%") ? (s.unit === "%" ? "" : t("perYear")) : s.unit}</span></p><Sparkline values={s.points.map((p) => p.value)} className="h-9 w-28 shrink-0" /></div>
              <p className="text-xs text-muted">{t("forPeriod", { period: s.latest?.period ?? "", place: t("egypt") })}{" "}<Badge tone="muted">{srcName(s.sourceId)}</Badge></p>
              {prov({ source: srcName(s.sourceId), licence: s.licence, retrieved: s.retrievedAt, transform: s.transform, period: `${s.points[0]?.period}–${s.latest?.period}` })}
            </StaggerItem>
          ))}
          {files.map((f) => <li key={f} className="rounded-xl border border-dashed border-line p-4 text-sm"><p className="font-semibold">{srcName(f)}</p><p className="mt-1 text-muted">{t("awaitingFile")}</p></li>)}
        </Stagger>
      </section>

      {showAssets && (
        <section aria-labelledby="l2" className="space-y-3">
          <div><h2 id="l2" className="font-display text-2xl">{t("ly_location")}</h2><p className="max-w-2xl text-sm text-muted">{t("lyh_location")}</p></div>
          <div role="region" aria-label={t("locTable")} tabIndex={0} className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="sr-only">{t("locTable")}</caption>
              <thead><tr className="text-xs text-muted"><th scope="col" className="px-3 py-2 text-start font-semibold">{t("cAsset")}</th><th scope="col" className="px-3 py-2 text-end font-semibold">{t("cPop1")}</th><th scope="col" className="px-3 py-2 text-end font-semibold">{t("cPop3")}</th><th scope="col" className="px-3 py-2 text-end font-semibold">{t("cAmenities")}</th><th scope="col" className="px-3 py-2 text-end font-semibold">{t("cTemp")}</th><th scope="col" className="px-3 py-2 text-end font-semibold">{t("cSolar")}</th></tr></thead>
              <tbody>{ctx.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-start font-normal"><Link href={`/asset/${r.id}/record#location`} className="underline decoration-line underline-offset-4 hover:decoration-gold"><span className="num">{r.id}</span> {ar ? r.nameAr : r.name}</Link></th>
                  <td className="px-3 py-2 text-end"><span className="num">{r.pop1 !== null ? int(r.pop1, locale) : "–"}</span></td>
                  <td className="px-3 py-2 text-end"><span className="num">{r.pop3 !== null ? int(r.pop3, locale) : "–"}</span></td>
                  <td className="px-3 py-2 text-end"><span className="num">{r.amenities ?? "–"}</span></td>
                  <td className="px-3 py-2 text-end"><span className="num">{r.temp !== null ? `${r.temp.toFixed(1)}°` : "–"}</span></td>
                  <td className="px-3 py-2 text-end"><span className="num">{r.solar !== null ? r.solar.toFixed(2) : "–"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ul className="space-y-1 text-xs text-muted">
            {ctx.meta.worldpop && <li>{t("metaWorldpop", { date: dateFmt(ctx.meta.worldpop.retrievedAt.slice(0, 10), locale), year: ctx.meta.worldpop.period })}</li>}
            {ctx.meta.nasa_power && <li>{t("metaNasa", { date: dateFmt(ctx.meta.nasa_power.retrievedAt.slice(0, 10), locale) })}</li>}
            <li>{ctx.meta.osm ? t("metaOsm", { date: dateFmt(ctx.meta.osm.retrievedAt.slice(0, 10), locale) }) : t("metaOsmMissing")}</li>
            <li>{t("straightLine")}</li>
          </ul>
        </section>
      )}

      <section aria-labelledby="l3" className="space-y-3">
        <div><h2 id="l3" className="font-display text-2xl">{t("ly_earth")}</h2><p className="max-w-2xl text-sm text-muted">{t("lyh_earth")}</p></div>
        <Card className="text-sm"><p className="font-semibold">{t("src_copernicus")}<Badge tone="muted" className="ms-2">{t("ac_planned")}</Badge></p><p className="mt-1 text-muted">{t("earthNote")}</p></Card>
      </section>

      <section aria-labelledby="l4" className="space-y-3">
        <div><h2 id="l4" className="font-display text-2xl">{t("ly_property")}</h2><p className="max-w-2xl text-sm text-muted">{t("lyh_property")}</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="text-sm"><p className="font-semibold">{t("src_sample_comps")}</p><ul className="mt-2 space-y-1">{prop.comps.map((c) => <li key={c.kind} className="flex justify-between gap-2"><span>{t(`ev_${c.kind}` as "ev_asking")}</span><span className="num">{c.n}</span></li>)}</ul><p className="mt-2 text-xs text-muted">{t("compsLatest", { date: dateFmt(prop.comps.map((c) => c.latest).sort().at(-1) ?? "2026-01-01", locale) })}</p></Card>
          <Card className="text-sm"><p className="font-semibold">{t("src_operating")}</p><p className="mt-2">{t("opLeases", { n: prop.leases })}</p>{prop.invoices > 0 && <p>{t("opInvoices", { n: prop.invoices })}</p>}<p className="mt-2 text-xs text-muted">{t("opNote")}</p></Card>
          <Card className="text-sm"><p className="font-semibold">{t("src_egypt_mls")}<Badge tone="gold" className="ms-2">{t("ac_partnership")}</Badge></p><p className="mt-1 text-muted">{t("mlsNote")}</p></Card>
        </div>
      </section>
    </div>
  );
}
