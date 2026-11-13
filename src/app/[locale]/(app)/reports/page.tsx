import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { pageContext } from "@/lib/page";
import { datasetIdsFor } from "@/lib/exports";
import { STATEMENT_PERIODS } from "@/lib/statements";
import { listReports } from "@/lib/reports";
import { can } from "@/lib/permissions";
import { DEMO_TODAY } from "@/lib/assumptions";
import { dateFmt, listSep } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { ActiveToggle, NewSchedule, RunDue, RunNow } from "@/components/reports/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("rep");
const btn = "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold hover:bg-surface-2 active:bg-line/60 md:min-h-9";

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("reports");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("rep");
  const ar = locale === "ar";
  const ids = datasetIdsFor(user.role);
  const sched = await listReports(user);
  const when = (d: Date) => d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  const exportsPanel = (
    <section aria-labelledby="ex-h" className="space-y-4">
      <h2 id="ex-h" className="font-display text-2xl">{t("exportsTitle")}</h2>
      <p className="max-w-md text-sm text-muted">{t("exportsLead")}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {ids.map((id) => (
          <li key={id}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <div><h3 className="font-semibold">{t(`ds_${id}`)}</h3><p className="text-sm text-muted">{t(`dsHelp_${id}`)}</p></div>
              <div className="mt-auto flex flex-wrap gap-2">
                <a className={btn} href={`/api/export?dataset=${id}&format=xlsx&lang=${locale}`} download aria-label={t("dlXlsx", { what: t(`ds_${id}`) })}><FileSpreadsheet aria-hidden="true" size={15} />Excel</a>
                <a className={btn} href={`/api/export?dataset=${id}&format=csv&lang=${locale}`} download aria-label={t("dlCsv", { what: t(`ds_${id}`) })}><Download aria-hidden="true" size={15} />CSV</a>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("exportsNote")}</p>
    </section>
  );

  const statementsPanel = can(user.role, "portfolio.view") && (
    <section aria-labelledby="st-h" className="space-y-4">
      <h2 id="st-h" className="font-display text-2xl">{t("statementsTitle")}</h2>
      <p className="max-w-md text-sm text-muted">{t("statementsLead")}</p>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {STATEMENT_PERIODS.map((p) => (
          <li key={p} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-semibold">{p.includes("Q") ? t("periodQuarter", { q: p.slice(-2), y: p.slice(0, 4) }) : t("periodYear", { y: p })}</span>
            <span className="flex flex-wrap gap-2">
              <a className={btn} href={`/api/statement?period=${p}&lang=en`} download aria-label={t("dlStatement", { period: p, lang: "English" })}><FileText aria-hidden="true" size={15} />PDF, English</a>
              <a className={btn} href={`/api/statement?period=${p}&lang=ar`} download aria-label={t("dlStatement", { period: p, lang: "العربية" })}><FileText aria-hidden="true" size={15} />PDF، العربية</a>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("statementsNote")}</p>
    </section>
  );

  const schedulePanel = sched && (
    <section aria-labelledby="sc-h" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="sc-h" className="font-display text-2xl">{t("scheduleTitle")}</h2><p className="max-w-md text-sm text-muted">{t("scheduleLead")}</p></div>
        <div className="flex flex-wrap items-start gap-2"><RunDue /><NewSchedule datasets={datasetIdsFor("manager").map((d) => ({ id: d, label: t(`ds_${d}`) }))} /></div>
      </div>
      <ul className="space-y-3">
        {sched.schedules.map((s) => (
          <li key={s.id}>
            <Card className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{s.id}</span><span className="font-semibold">{s.name}</span><Badge tone={s.kind === "workbook_management" ? "gold" : "muted"}>{t(`k_${s.kind}` as "k_statement")}</Badge>{s.active === 1 && s.nextRunOn <= DEMO_TODAY && <Badge tone="danger">{t("dueNow")}</Badge>}</p>
                <p className="text-muted">{t(`every_${s.frequency}` as "every_monthly", { day: s.dayOfMonth })}{listSep(locale)}{t("nextOn", { date: dateFmt(s.nextRunOn, locale) })}{s.lastRunAt ? `${listSep(locale)}${t("lastRun", { date: when(s.lastRunAt) })}` : ""}</p>
                <p className="text-xs text-muted">{t("to")} <bdi>{(s.recipients as string[]).join(", ")}</bdi>{(s.datasets as string[]).length ? `${listSep(locale)}${(s.datasets as string[]).map((d) => t(`ds_${d}` as "ds_holdings")).join(", ")}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-start gap-3"><ActiveToggle id={s.id} active={s.active === 1} name={s.name} /><RunNow id={s.id} /></div>
            </Card>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="mb-2 font-display text-xl">{t("runsTitle")}</h3>
        {sched.runs.length === 0 ? <Card className="text-sm text-muted">{t("noRuns")}</Card> : (
          <ul aria-label={t("runsTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
            {sched.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="num font-semibold text-gold">{r.id}</span> <bdi>{r.fileName}</bdi><span className="block text-xs text-muted">{when(r.at)}{listSep(locale)}{size(r.bytes)}{listSep(locale)}<span className="num font-mono">{r.sha256.slice(0, 12)}</span></span></span>
                <a className={btn} href={`/api/reports/${r.id}`} download><Download aria-hidden="true" size={15} />{t("download")}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      <HashTabs label={t("title")} tabs={[
        { id: "exports", label: t("tabExports"), content: exportsPanel },
        ...(statementsPanel ? [{ id: "statements", label: t("tabStatements"), content: statementsPanel }] : []),
        ...(schedulePanel ? [{ id: "scheduled", label: t("tabScheduled"), count: sched!.schedules.length, content: schedulePanel }] : []),
      ]} />
    </div>
  );
}
