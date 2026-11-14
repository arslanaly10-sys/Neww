import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { pageContext } from "@/lib/page";
import { listSources } from "@/lib/market-data/service";
import { can } from "@/lib/permissions";
import { int } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { FileImport, ImportNow } from "@/components/market-data/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("md", "sourcesTitle");

/** The data-source registry: every outside source by layer, how it is reached, its licence and how fresh it is. */
export default async function SourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("sources");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("md");
  const layers = await listSources(user);
  const ar = locale === "ar";
  const manage = can(user.role, "sources.manage");
  const when = (d: Date) => d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: "Africa/Cairo" });
  const fTone = (f: string) => (f === "fresh" ? "ok" : f === "due" ? "gold" : f === "stale" || f === "never" ? "danger" : "muted") as "ok" | "gold" | "danger" | "muted";
  const sTone = (s: string | null) => (s === "ok" ? "ok" : s === "partial" ? "gold" : s === "failed" ? "danger" : "muted") as "ok" | "gold" | "danger" | "muted";
  return (
    <div className="space-y-8">
      <PageHeader animated title={t("sourcesTitle")} lead={manage ? t("sourcesLeadAdmin") : t("sourcesLead")}><Link href="/market/intelligence" className="tap text-sm text-gold underline underline-offset-4">{t("pulseTitle")}</Link></PageHeader>
      {layers.map(({ layer, sources }) => (
        <section key={layer} aria-labelledby={`ly-${layer}`} className="space-y-3">
          <div><h2 id={`ly-${layer}`} className="font-display text-2xl">{t(`ly_${layer}`)}</h2><p className="max-w-2xl text-sm text-muted">{t(`lyh_${layer}`)}</p></div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {sources.map((s) => (
              <li key={s.id} className={cn("space-y-2 rounded-xl border bg-surface p-4 text-sm", s.lastStatus === "failed" ? "border-danger/50" : "border-line")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{ar ? s.nameAr : s.name}</h3>
                  <span className="flex flex-wrap gap-1.5"><Badge tone="muted">{t(`ac_${s.access}`)}</Badge>{s.lastStatus && <Badge tone={sTone(s.lastStatus)}>{t(`ls_${s.lastStatus}`)}</Badge>}{s.freshness !== "na" && <Badge tone={fTone(s.freshness)}>{t(`fr_${s.freshness}`)}</Badge>}</span>
                </div>
                <p>{ar ? s.coverageAr : s.coverage}</p>
                <p className="text-muted">{ar ? s.noteAr : s.note}</p>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-muted">{t("licence")}</dt><dd>{s.licence}</dd>
                  {s.cadenceDays !== null && <><dt className="text-muted">{t("cadence")}</dt><dd>{t("everyDays", { n: s.cadenceDays })}</dd></>}
                  {s.lastImportAt && <><dt className="text-muted">{t("lastImport")}</dt><dd>{when(s.lastImportAt)}{t("rowsN", { n: int(s.observations, locale) })}</dd></>}
                  {s.lastError && <><dt className="text-muted">{t("lastIssue")}</dt><dd className="text-danger">{s.lastError}</dd></>}
                </dl>
                {s.runs.length > 0 && (
                  <details className="text-xs"><summary className="cursor-pointer text-gold underline underline-offset-4">{t("history", { n: s.runs.length })}</summary>
                    <ul className="mt-1 space-y-0.5">{s.runs.map((r) => <li key={r.id}>{when(r.startedAt)}{": "}<span className={r.status === "failed" ? "text-danger" : r.status === "partial" ? "text-gold" : "text-ok"}>{t(`ls_${r.status}`)}</span>{r.rows ? t("rowsN", { n: r.rows }) : ""}{r.error ? `, ${r.error}` : ""}{t("by", { who: r.triggeredBy })}</li>)}</ul>
                  </details>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {s.homepage && <a href={s.homepage} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-xs text-gold underline underline-offset-4">{t("homepage")}<ExternalLink aria-hidden="true" size={12} /><span className="sr-only">{t("newTab")}</span></a>}
                  {manage && s.access === "api" && <ImportNow sourceId={s.id} name={s.name} />}
                  {manage && s.access === "file" && <FileImport sourceId={s.id as "capmas_cpi"} name={s.name} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
