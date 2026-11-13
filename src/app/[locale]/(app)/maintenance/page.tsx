import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listWork, boardOrder, type WorkView } from "@/lib/work";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { dateFmt, int, listSep, money } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { NewWork, NextStep } from "@/components/work/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("work");
const P_TONE = { urgent: "danger", high: "gold", normal: "muted", low: "muted" } as const;
const COLUMNS = ["open", "in_progress", "on_hold", "done"] as const;

export default async function MaintenancePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string; mine?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("work");
  const data = await listWork(user);
  if (!data) return <NoAccess role={user.role} />;
  const ar = locale === "ar";
  const manage = can(user.role, "work.manage");
  const kind = sp.kind === "maintenance" || sp.kind === "task" ? sp.kind : null;
  const mine = manage && sp.mine === "1";
  const shown = data.items.filter((w) => (!kind || w.kind === kind) && (!mine || w.assigneeId === user.id));
  const active = data.items.filter((w) => ["open", "in_progress", "on_hold"].includes(w.status));
  const month = DEMO_TODAY.slice(0, 7);
  const doneThisMonth = data.items.filter((w) => w.status === "done" && w.completedOn?.startsWith(month)).length;
  const spentYear = data.items.filter((w) => w.status === "done" && w.completedOn?.startsWith(DEMO_TODAY.slice(0, 4))).reduce((s, w) => s + (w.actualEgp ?? 0), 0);
  const recentDone = (w: WorkView) => w.status !== "done" || (w.completedOn ?? "") >= new Date(Date.parse(`${DEMO_TODAY}T00:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10);
  const q = (k: string | null, m: boolean) => { const p = new URLSearchParams(); if (k) p.set("kind", k); if (m) p.set("mine", "1"); const s = p.toString(); return s ? `/maintenance?${s}` : "/maintenance"; };
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");

  const card = (w: WorkView) => (
    <li key={w.id}>
      <article aria-labelledby={`wt-${w.id}`} className={cn("rounded-lg border bg-surface p-3 text-sm", w.overdue ? "border-danger/60" : "border-line")}>
        <p className="flex flex-wrap items-center gap-1.5"><span className="num text-xs font-semibold text-gold">{w.id}</span><Badge tone={P_TONE[w.priority as "normal"]}>{t(`p_${w.priority}`)}</Badge>{w.kind === "task" && <Badge tone="muted">{t("k_task")}</Badge>}</p>
        <h3 id={`wt-${w.id}`} className="mt-1 font-semibold"><Link href={`/maintenance/${w.id}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{w.title}</Link></h3>
        <p className="text-xs text-muted">{w.assetId ? `${w.assetId}: ${ar ? w.assetNameAr : w.assetName}` : t("portfolioLevel")}</p>
        <p className="mt-1 text-xs text-muted">{w.assigneeName ? (ar ? w.assigneeNameAr : w.assigneeName) : t("unassigned")}{w.vendor ? `${listSep(locale)}${w.vendor}` : ""}</p>
        {w.status === "done" ? <p className="text-xs text-muted">{t("doneOn", { date: dateFmt(w.completedOn!, locale) })}{w.actualEgp ? `${listSep(locale)}${money(w.actualEgp, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD, compact: true })}` : ""}</p>
          : w.dueOn && <p className={cn("text-xs", w.overdue ? "font-semibold text-danger" : "text-muted")}>{w.overdue ? t("overdueSince", { date: dateFmt(w.dueOn, locale) }) : t("dueBy", { date: dateFmt(w.dueOn, locale) })}</p>}
        {manage && w.status !== "done" && <div className="mt-2"><NextStep id={w.id} kind={w.kind} status={w.status} title={`${w.id}, ${w.title}`} estimateEgp={w.estimateEgp} /></div>}
      </article>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("title")} lead={manage ? t("lead") : t("leadInvestor")}><SampleBadge /></PageHeader>
      <Stagger className={KPI5}>
        <Stat label={t("kOpen")}><span className="num">{int(active.length, locale)}</span></Stat>
        <Stat label={t("kOverdue")}><span className={cn("num", active.some((w) => w.overdue) && "text-danger")}>{int(active.filter((w) => w.overdue).length, locale)}</span></Stat>
        <Stat label={t("kUrgent")}><span className="num">{int(active.filter((w) => w.priority === "urgent").length, locale)}</span></Stat>
        <Stat label={t("kDoneMonth")}><span className="num">{int(doneThisMonth, locale)}</span></Stat>
        <Stat label={manage ? t("kSpent") : t("kUnassigned")}><span className="num">{manage ? money(spentYear, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD, compact: true }) : int(active.filter((w) => !w.assigneeId).length, locale)}</span></Stat>
      </Stagger>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
          <li><Link href={q(null, mine)} aria-current={!kind ? "true" : undefined} className={chip(!kind)}>{t("all")}</Link></li>
          <li><Link href={q("maintenance", mine)} aria-current={kind === "maintenance" ? "true" : undefined} className={chip(kind === "maintenance")}>{t("k_maintenance")}</Link></li>
          <li><Link href={q("task", mine)} aria-current={kind === "task" ? "true" : undefined} className={chip(kind === "task")}>{t("k_tasks")}</Link></li>
          {manage && <li><Link href={q(kind, !mine)} aria-current={mine ? "true" : undefined} className={chip(mine)}>{t("mine")}</Link></li>}
        </ul>
        <NewWork assets={data.assets} managers={data.managers} canManage={manage} today={DEMO_TODAY} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = shown.filter((w) => w.status === col && recentDone(w)).sort(boardOrder);
          return (
            <section key={col} aria-labelledby={`col-${col}`} className="rounded-lg bg-surface-2/60 p-3">
              <h2 id={`col-${col}`} className="mb-3 flex items-center justify-between font-semibold">{t(`s_${col}`)} <span className="num rounded-full bg-surface px-2 text-xs">{items.length}</span></h2>
              {items.length === 0 ? <p className="text-sm text-muted">{t("emptyColumn")}</p> : <ul className="space-y-3">{items.map(card)}</ul>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">{t("boardNote")}</p>
    </div>
  );
}
