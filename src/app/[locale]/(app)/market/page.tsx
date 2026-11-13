import { getTranslations, setRequestLocale } from "next-intl/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { districts, marketSeries, marketSources } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { momentum3m, sentiment } from "@/lib/metrics";
import { dateFmt, pct } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { SampleBadge } from "@/components/fig";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("market");

export default async function Market({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await pageContext("market");
  const t = await getTranslations("market");
  const db = await getDb();
  const ds = await db.select().from(districts).orderBy(asc(districts.name));
  const series = await db.select().from(marketSeries).orderBy(asc(marketSeries.month));
  const sources = await db.select().from(marketSources);
  const ar = locale === "ar";
  const idx = sources.find((s) => s.id === "ms-price-index")!;
  const gaps = sources.filter((s) => s.provenance === "not_published");
  const tone = { cooling: "danger", stable: "muted", warming: "ok" } as const;

  const rows = ds.map((d) => {
    const vals = series.filter((s) => s.districtId === d.id).map((s) => Number(s.priceIndex));
    const m = momentum3m(vals);
    return { d, vals, latest: vals[vals.length - 1], m, s: sentiment(m) };
  });

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>

      <Card className="mb-6 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="gold">{t("synthetic")}</Badge><span className="font-semibold">{ar ? idx.titleAr : idx.title}</span></div>
        <dl className="mt-2 grid gap-2 text-muted sm:grid-cols-3">
          <div><dt className="text-xs">{t("published")}</dt><dd className="num text-text">{dateFmt(idx.publishedOn!, locale)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs">{t("production")}</dt><dd className="text-text">{ar ? idx.productionSourceAr : idx.productionSource}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs">{t("source")}</dt><dd>{ar ? idx.noteAr : idx.note}</dd></div>
        </dl>
      </Card>

      <ul className="grid gap-3 md:hidden">
        {rows.map(({ d, vals, latest, m, s }) => (
          <li key={d.id} id={d.id} className="scroll-mt-24">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{ar ? d.nameAr : d.name}</span><Badge tone={tone[s]}>{t(s)}</Badge></div>
              <div className="mt-2 flex items-center justify-between gap-3"><Sparkline values={vals} label={`${ar ? d.nameAr : d.name} ${t("trend")}`} /><div className="text-end"><p className="num font-display text-lg">{latest.toFixed(1)}</p><p className="num text-xs text-muted">{pct(m, locale)}</p></div></div>
            </Card>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border border-line md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>{["district", "index", "momentum", "sentiment", "trend"].map((k) => <th key={k} scope="col" className="px-3 py-2.5 text-start font-semibold">{t(k as "district")}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ d, vals, latest, m, s }) => (
              <tr key={d.id} id={d.id} className="scroll-mt-24 border-t border-line">
                <td className="px-3 py-2.5 font-semibold">{ar ? d.nameAr : d.name}</td>
                <td className="px-3 py-2.5"><span className="num">{latest.toFixed(1)}</span></td>
                <td className="px-3 py-2.5"><span className="num">{pct(m, locale)}</span></td>
                <td className="px-3 py-2.5"><Badge tone={tone[s]}>{t(s)}</Badge></td>
                <td className="px-3 py-2.5"><Sparkline values={vals} label={`${ar ? d.nameAr : d.name} ${t("trend")}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">{t("ruleNote")}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {gaps.map((g) => (
          <Card key={g.id} className="border-dashed">
            <Badge tone="danger">{t("notPublished")}</Badge>
            <h2 className="mt-2 font-display text-xl">{ar ? g.titleAr : g.title}</h2>
            <p className="mt-1 text-sm text-muted">{ar ? g.noteAr : g.note}</p>
            <p className="mt-2 text-xs text-muted">{t("production")}: {ar ? g.productionSourceAr : g.productionSource}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
