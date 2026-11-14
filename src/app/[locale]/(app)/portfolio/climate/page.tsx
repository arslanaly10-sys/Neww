import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { climatePortfolio } from "@/lib/climate";
import { BAND, HAZARDS } from "@/lib/climate-rules";
import { dateFmt, int, pct } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { ExposureBars } from "@/components/climate/controls";
import { BAND_TONE, LevelDots } from "@/components/climate/hazard-list";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("climate", "title");

/** The portfolio's climate and physical exposure: value at each level per hazard, and every asset by hazard. */
export default async function ClimatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("portfolio");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("climate");
  const data = await climatePortfolio(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const P = (x: number) => pct(x, locale, 0);
  const highAny = data.rows.filter((r) => r.overall.level >= 4);
  const rows = [...data.rows].sort((a, b) => b.overall.level - a.overall.level || a.asset.id.localeCompare(b.asset.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portfolio" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("back")}</Link>
        <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      </div>
      <Stagger className={KPI5}>
        <Stat label={t("kHigh")}><span className={cn("num", highAny.length > 0 && "text-danger")}>{t("ofN", { n: int(highAny.length, locale), total: int(data.rows.length, locale) })}</span></Stat>
        <Stat label={t("kHeat")}><span className="num">{P(data.byHazard.find((h) => h.hazard === "heat")!.high)}</span></Stat>
        <Stat label={t("kFlood")}><span className="num">{P(data.byHazard.find((h) => h.hazard === "flood")!.high)}</span></Stat>
        <Stat label={t("kSurveyed")}><span className="num">{int(data.overrides, locale)}</span></Stat>
        <Stat label={t("kAdapted")}><span className="num">{int(data.adapted, locale)}</span></Stat>
      </Stagger>

      <section aria-labelledby="v-h" className="space-y-3">
        <h2 id="v-h" className="font-display text-2xl">{t("valueAtLevel")}</h2>
        <Card>
          <ExposureBars rows={data.byHazard.map((h) => ({ hazard: h.hazard, name: t(`h_${h.hazard}`), high: h.high, medium: h.medium, low: h.low, text: t("shareLine", { high: P(h.high), medium: P(h.medium), low: P(h.low) }) }))} />
          <p className="mt-4 flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true"><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-danger" />{t("band_high")}</span><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-gold-fill" />{t("band_medium")}</span><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-teal/35" />{t("band_low")}</span></p>
        </Card>
      </section>

      <section aria-labelledby="m-h" className="space-y-3">
        <h2 id="m-h" className="font-display text-2xl">{t("byAsset")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface" role="region" aria-label={t("matrix")} tabIndex={0}>
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">{t("matrix")}</caption>
            <thead className="text-muted"><tr className="border-b border-line">
              <th scope="col" className="p-3 text-start font-semibold">{t("asset")}</th>
              {HAZARDS.map((h) => <th key={h} scope="col" className="p-3 text-start font-semibold">{t(`h_${h}`)}</th>)}
              <th scope="col" className="p-3 text-start font-semibold">{t("overall")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.asset.id} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 text-start font-normal"><Link href={`/asset/${r.asset.id}/record#climate`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold"><span className="num">{r.asset.id}</span> {ar ? r.asset.nameAr : r.asset.name}</Link></th>
                  {r.results.map((x) => <td key={x.hazard} className="p-3"><LevelDots n={x.residual} label={t(`lvs_${x.residual}`)} />{x.override && <span className="block text-xs text-muted">{t("surveyed")}</span>}</td>)}
                  <td className="p-3"><Badge tone={BAND_TONE[BAND(r.overall.level)]}>{t(`band_${BAND(r.overall.level)}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">{t("howTitle")}</h2>
        <p>{t("how1")}</p>
        <p>{t("how2")}</p>
        <p>{t("noProjection")}</p>
        <p className="text-xs text-muted">{t("method_note", { version: data.version, date: data.source ? dateFmt(data.source.retrievedAt, locale) : "–" })}</p>
      </Card>
    </div>
  );
}
