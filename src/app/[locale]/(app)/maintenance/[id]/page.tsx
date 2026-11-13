import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page";
import { getWorkOrder } from "@/lib/work";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { dateFmt, listSep, money } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { CompleteWork, NoteForm, WorkEditor } from "@/components/work/controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^WO-\d{3}$/.test(id) ? id : "Work order" };
}
const P_TONE = { urgent: "danger", high: "gold", normal: "muted", low: "muted" } as const;
const S_TONE = { open: "gold", in_progress: "gold", on_hold: "muted", done: "ok", cancelled: "muted" } as const;

export default async function WorkOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("maintenance");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("work");
  const data = await getWorkOrder(user, id);
  if (!data) notFound();
  const { work: w, events, managers, money: showMoney } = data;
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const manage = can(user.role, "work.manage");
  const open = w.status !== "done" && w.status !== "cancelled";
  const when = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const who = (e: { actorName: string; actorNameAr: string }) => (ar ? e.actorNameAr : e.actorName);
  const name = (id: unknown) => managers.find((m) => m.id === id);
  const eventText = (e: (typeof events)[number]) => {
    const d = e.detail as Record<string, string | number | null>;
    switch (e.kind) {
      case "created": return t("ev_created", { who: who(e) });
      case "status": return t("ev_status", { who: who(e), to: t(`s_${d.to}` as "s_open") });
      case "priority": return t("ev_priority", { who: who(e), to: t(`p_${d.to}` as "p_normal") });
      case "assigned": return t("ev_assigned", { who: who(e), to: d.assigneeId ? (ar ? name(d.assigneeId)?.nameAr : name(d.assigneeId)?.name) ?? String(d.assigneeId) : t("unassigned"), vendor: d.vendor ? ` (${d.vendor})` : "" });
      case "due": return t("ev_due", { who: who(e), to: d.to ? dateFmt(String(d.to), locale) : "–" });
      case "estimate": return t("ev_estimate", { who: who(e), amount: d.estimateEgp ? M(Number(d.estimateEgp)) : "–" });
      case "completed": return d.actualEgp !== undefined && d.actualEgp !== null ? t("ev_completedCost", { who: who(e), amount: M(Number(d.actualEgp)) }) : t("ev_completed", { who: who(e) });
      default: return t("ev_note", { who: who(e) });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/maintenance" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("title")}</Link>
        <PageHeader title={w.title} lead={`${w.id}${listSep(locale)}${w.assetId ? `${w.assetId}: ${ar ? w.assetNameAr : w.assetName}` : t("portfolioLevel")}`}>
          <span className="flex flex-wrap gap-2"><Badge tone={S_TONE[w.status]}>{t(`s_${w.status}`)}</Badge><Badge tone={P_TONE[w.priority as "normal"]}>{t(`p_${w.priority}`)}</Badge>{w.overdue && <Badge tone="danger">{t("overdue")}</Badge>}</span>
        </PageHeader>
      </div>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">{t("category")}</dt><dd>{t(`c_${w.category}` as "c_other")}</dd></div>
          <div><dt className="text-muted">{t("assignee")}</dt><dd>{w.assigneeName ? (ar ? w.assigneeNameAr : w.assigneeName) : t("unassigned")}{w.vendor ? `${listSep(locale)}${w.vendor}` : ""}</dd></div>
          <div><dt className="text-muted">{t("due")}</dt><dd>{w.dueOn ? dateFmt(w.dueOn, locale) : "–"}</dd></div>
          <div><dt className="text-muted">{t("reportedBy")}</dt><dd>{ar ? w.reporterNameAr : w.reporterName}</dd></div>
          {showMoney && <div><dt className="text-muted">{t("estimateLabel")}</dt><dd>{w.estimateEgp ? M(w.estimateEgp) : "–"}</dd></div>}
          {showMoney && w.status === "done" && <div><dt className="text-muted">{t("actualLabel")}</dt><dd>{w.actualEgp !== null ? M(w.actualEgp) : "–"}{w.ledgerEntryId ? <> <Link href="/finance?cat=maintenance#ledger" className="text-xs text-gold underline underline-offset-4">{t("inLedger", { id: w.ledgerEntryId })}</Link></> : null}</dd></div>}
        </dl>
        {w.description && <p className="mt-4 max-w-md text-sm">{w.description}</p>}
      </Card>
      {manage && open && (
        <section aria-labelledby="ed-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="ed-h" className="font-display text-2xl">{t("manage")}</h2><CompleteWork id={w.id} kind={w.kind} title={`${w.id}, ${w.title}`} estimateEgp={w.estimateEgp} /></div>
          <Card><WorkEditor work={w} managers={managers} /></Card>
        </section>
      )}
      <section aria-labelledby="tl-h">
        <h2 id="tl-h" className="mb-3 font-display text-2xl">{t("timeline")}</h2>
        <ol className="space-y-3 border-s border-line ps-4">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <p>{eventText(e)} <span className="text-xs text-muted">{when(e.at)}</span></p>
              {e.text && <p className="mt-1 rounded-md bg-surface-2 p-2">{e.text}</p>}
            </li>
          ))}
        </ol>
        <div className="mt-4 max-w-md"><NoteForm id={w.id} /></div>
      </section>
    </div>
  );
}
