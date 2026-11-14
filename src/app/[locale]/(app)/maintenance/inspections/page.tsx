import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { INSPECTION_KINDS, listInspections } from "@/lib/ops";
import { DEMO_TODAY } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { dateFmt, int } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { OpsNav } from "@/components/ops/subnav";
import { RecordInspection, ScheduleInspection } from "@/components/ops/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("ops", "inspTitle");
const R_TONE = { pass: "ok", issues: "gold", fail: "danger" } as const;
const S_TONE = { low: "muted", medium: "gold", high: "danger" } as const;

export default async function InspectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("ops");
  const data = await listInspections(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const manage = can(user.role, "work.manage");
  const upcoming = data.items.filter((x) => x.status === "scheduled").sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
  const done = data.items.filter((x) => x.status === "done");
  const openFindings = done.flatMap((x) => x.findings).filter((f) => !f.workOrderId).length;
  const opt = (x: { id: string; name: string; nameAr: string }) => ({ id: x.id, name: x.name, nameAr: x.nameAr });
  const label = (x: (typeof data.items)[number]) => `${x.id}, ${x.asset ? (ar ? x.asset.nameAr : x.asset.name) : x.assetId}`;

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("inspTitle")} lead={t("inspLead")}><SampleBadge /></PageHeader>
      <OpsNav current="inspections" role={user.role} />
      <Stagger className={KPI5}>
        <Stat label={t("kUpcoming")}><span className="num">{int(upcoming.length, locale)}</span></Stat>
        <Stat label={t("kOverdueInsp")}><span className={cn("num", upcoming.some((x) => x.overdue) && "text-danger")}>{int(upcoming.filter((x) => x.overdue).length, locale)}</span></Stat>
        <Stat label={t("kDoneInsp")}><span className="num">{int(done.length, locale)}</span></Stat>
        <Stat label={t("kFindings")}><span className="num">{int(done.reduce((s, x) => s + x.findings.length, 0), locale)}</span></Stat>
        <Stat label={t("kNoWork")}><span className="num">{int(openFindings, locale)}</span></Stat>
      </Stagger>
      {manage && <ScheduleInspection assets={data.assets.map(opt)} managers={data.managers.map(opt)} contractors={data.contractors.map(opt)} kinds={INSPECTION_KINDS} me={user.id} today={DEMO_TODAY} />}

      <section aria-labelledby="up-h" className="space-y-3">
        <h2 id="up-h" className="font-display text-2xl">{t("upcoming")}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">{t("noUpcoming")}</p> : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((x) => (
              <li key={x.id}>
                <Card className={cn("h-full space-y-2 text-sm", x.overdue && "border-danger/60")}>
                  <p className="flex flex-wrap items-center gap-1.5"><span className="num text-xs font-semibold text-gold">{x.id}</span><Badge tone="muted">{t(`ik_${x.kind}`)}</Badge>{x.overdue && <Badge tone="danger">{t("overdue")}</Badge>}</p>
                  <h3 className="font-semibold">{x.asset ? <Link href={`/asset/${x.assetId}/record`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{x.assetId}: {ar ? x.asset.nameAr : x.asset.name}</Link> : x.assetId}</h3>
                  <p className="text-muted">{t("onWith", { date: dateFmt(x.scheduledOn, locale), who: x.inspector ? (ar ? x.inspector.nameAr : x.inspector.name) : "–" })}{x.contractor ? ` ${t("withContractor", { name: ar ? x.contractor.nameAr : x.contractor.name })}` : ""}</p>
                  {x.notes && <p>{x.notes}</p>}
                  {manage && <RecordInspection id={x.id} label={label(x)} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-h" className="space-y-3">
        <h2 id="done-h" className="font-display text-2xl">{t("completed")}</h2>
        <ul className="space-y-3">
          {done.map((x) => (
            <li key={x.id}>
              <Card className="space-y-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-1.5"><span className="num text-xs font-semibold text-gold">{x.id}</span><Badge tone="muted">{t(`ik_${x.kind}`)}</Badge>{x.result && <Badge tone={R_TONE[x.result as "pass"]}>{t(`rs_${x.result}`)}</Badge>}</p>
                    <h3 className="mt-1 font-semibold">{x.assetId}: {x.asset ? (ar ? x.asset.nameAr : x.asset.name) : ""}</h3>
                  </div>
                  <p className="text-muted">{t("doneOnBy", { date: dateFmt(x.doneOn ?? x.scheduledOn, locale), who: x.inspector ? (ar ? x.inspector.nameAr : x.inspector.name) : "–" })}</p>
                </div>
                {x.notes && <p>{x.notes}</p>}
                {x.findings.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("findingsOf", { id: x.id })}>
                    {x.findings.map((f, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <p><Badge tone={S_TONE[f.severity]}>{t(`sv_${f.severity}`)}</Badge> <strong>{f.area}</strong>: {f.note}</p>
                        {f.workOrderId ? <Link href={`/maintenance/${f.workOrderId}`} className="text-gold underline underline-offset-4">{t("workOrder", { id: f.workOrderId })}</Link> : <span className="text-muted">{t("noWorkOrder")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
