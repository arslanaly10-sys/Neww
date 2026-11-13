"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlarmClock, AlertTriangle, BedDouble, FileWarning, Scale, CalendarClock } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { reopenAlertAction, snoozeAlertAction } from "@/app/stage5-actions";
import type { AlertView } from "@/lib/alerts-service";
import { dateFmt, money, pct, type Currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Card } from "../ui";

const ICON = { lease_renewal: CalendarClock, missing_document: FileWarning, valuation_drift: Scale, vacancy_cost: BedDouble } as const;
const TONE = { high: "danger", medium: "gold", low: "muted" } as const;

/** One sentence per alert, built from the alert's data in the viewer's language. */
export function useAlertText(currency: Currency, fx: number) {
  const t = useTranslations("al");
  const dk = useTranslations("docKind");
  const locale = useLocale();
  const ar = locale === "ar";
  return (a: AlertView) => {
    const asset = ar ? a.assetNameAr : a.assetName;
    const d = a.detail;
    switch (a.kind) {
      case "lease_renewal": {
        const n = Number(d.days);
        const when = n === 0 ? t("today") : n > 0 ? t("inDays", { n }) : t("agoDays", { n: -n });
        return t(n < 0 ? "t_lease_ended" : "t_lease_renewal", { lease: String(d.leaseId), asset, date: dateFmt(String(d.endDate), locale), inDays: when });
      }
      case "missing_document": return t("t_missing_document", { kind: dk(String(d.docKind) as "lease"), asset, status: t(`status_${d.status}` as "status_missing") });
      case "valuation_drift": return t("t_valuation_drift", { pct: `${Number(d.driftPct) > 0 ? "+" : ""}${pct(Number(d.driftPct) / 100, locale)}`, asset });
      default: return t("t_vacancy_cost", { asset, days: Number(d.days), cost: money(Number(d.costEgp), currency, locale, { fx, compact: true }) });
    }
  };
}

const KINDS = ["lease_renewal", "missing_document", "valuation_drift", "vacancy_cost"] as const;
const SEV = { high: 0, medium: 1, low: 2 } as const;
/** Most urgent first: severity, then the alert's own clock (days to a lease end, days vacant). */
export const byUrgency = (a: AlertView, b: AlertView) =>
  SEV[a.severity] - SEV[b.severity] || (a.kind === "lease_renewal" && b.kind === "lease_renewal" ? Number(a.detail.days) - Number(b.detail.days) : 0) || (a.kind === "vacancy_cost" && b.kind === "vacancy_cost" ? Number(b.detail.costEgp) - Number(a.detail.costEgp) : 0);

export function AlertsBoard({ open, snoozed, canSnooze, currency, fx, userNames }: { open: AlertView[]; snoozed: AlertView[]; canSnooze: boolean; currency: Currency; fx: number; userNames: Record<string, { name: string; nameAr: string }> }) {
  const t = useTranslations("al");
  const text = useAlertText(currency, fx);
  const locale = useLocale();
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null); // an alert key, or "group:<kind>" for snoozing a whole group
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof KINDS)[number] | "all">("all");
  const [pending, start] = useTransition();

  const snooze = (keys: string[]) => start(async () => {
    setMsg(null); setDone(null);
    let n = 0;
    for (const key of keys) {
      const r = await snoozeAlertAction(key, reason);
      if (!r.ok) { setMsg(t(`err_${r.error}` as "err_forbidden")); break; }
      n++;
    }
    if (n) setDone(t("snoozedN", { n }));
    setActive(null); setReason(""); router.refresh();
  });
  const reopen = (key: string) => start(async () => { const r = await reopenAlertAction(key); if (!r.ok) setMsg(t(`err_${r.error}` as "err_forbidden")); else router.refresh(); });

  const reasonForm = (id: string, keys: string[]) => (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); snooze(keys); }}>
      <label htmlFor={`sz-${id}`} className="block text-xs font-semibold text-muted">{keys.length > 1 ? t("snoozeReasonN", { n: keys.length }) : t("snoozeReason")}</label>
      <input id={`sz-${id}`} className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
      <div className="flex gap-2"><Button type="submit" size="sm" variant="gold" disabled={pending || reason.trim().length < 10}>{t("snoozeConfirm")}</Button><Button type="button" size="sm" onClick={() => { setActive(null); setReason(""); }}>{t("cancel")}</Button></div>
    </form>
  );

  const row = (a: AlertView, isSnoozed: boolean) => {
    const I = ICON[a.kind];
    return (
      <li key={a.key} className="px-4 py-3">
        <div className="flex items-start gap-3">
          <I aria-hidden="true" size={18} className={cn("mt-0.5 shrink-0", a.severity === "high" ? "text-danger" : "text-gold")} />
          <div className="min-w-0 flex-1 text-sm">
            <p><Badge tone={TONE[a.severity]} className="me-2 align-middle">{t(`sev_${a.severity}` as "sev_high")}</Badge>{text(a)}</p>
            <p className="mt-1 text-xs"><Link href={`/asset/${a.assetId}`} className="tap text-gold underline underline-offset-4">{t("openAsset")}</Link></p>
            {isSnoozed && a.snoozeReason && <p className="mt-2 rounded bg-surface-2 p-2 text-xs text-muted">{t("snoozedBy", { name: userNames[a.snoozedBy ?? ""]?.[locale === "ar" ? "nameAr" : "name"] ?? a.snoozedBy ?? "", reason: a.snoozeReason })}</p>}
            {active === a.key && reasonForm(a.key, [a.key])}
          </div>
          {canSnooze && active !== a.key && (isSnoozed
            ? <Button size="sm" onClick={() => reopen(a.key)} disabled={pending}>{t("reopen")}</Button>
            : <Button size="sm" onClick={() => { setActive(a.key); setReason(""); setMsg(null); }}><AlarmClock aria-hidden="true" size={14} />{t("snooze")}</Button>)}
        </div>
      </li>
    );
  };

  const groups = KINDS.map((k) => ({ kind: k, items: open.filter((a) => a.kind === k).sort(byUrgency) })).filter((g) => g.items.length);
  const shown = groups.filter((g) => filter === "all" || g.kind === filter);

  return (
    <div className="space-y-8">
      {!canSnooze && <p className="text-xs text-muted">{t("onlyManagers")}</p>}
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
      {done && <p role="status" className="text-sm text-ok">{done}</p>}
      <section aria-labelledby="al-open">
        <h2 id="al-open" className="mb-3 flex items-center gap-2 font-display text-2xl"><AlertTriangle aria-hidden="true" size={20} className="text-gold" />{t("alertsTitle")} <span className="text-base text-muted"><bdi>({open.length})</bdi></span></h2>
        {open.length === 0 ? <Card className="text-sm text-muted">{t("noAlerts")}</Card> : (
          <>
            <div role="group" aria-label={t("filterLabel")} className="mb-4 flex flex-wrap gap-2">
              {[{ kind: "all" as const, n: open.length }, ...groups.map((g) => ({ kind: g.kind, n: g.items.length }))].map((f) => (
                <button key={f.kind} type="button" aria-pressed={filter === f.kind} onClick={() => setFilter(f.kind)}
                  className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm", filter === f.kind ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2")}>
                  {f.kind === "all" ? t("filterAll") : t(`group_${f.kind}` as "group_lease_renewal")}<span className="num text-xs font-semibold">{f.n}</span>
                </button>
              ))}
            </div>
            <div className="space-y-5">
              {shown.map((g) => {
                const high = g.items.filter((a) => a.severity === "high").length;
                const I = ICON[g.kind];
                return (
                  <section key={g.kind} aria-labelledby={`g-${g.kind}`} className="rounded-lg border border-line bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <h3 id={`g-${g.kind}`} className="flex items-center gap-2 font-semibold"><I aria-hidden="true" size={16} className="text-gold" />{t(`group_${g.kind}` as "group_lease_renewal")} <span className="text-sm font-normal text-muted"><bdi>{t("groupCount", { n: g.items.length, high })}</bdi></span></h3>
                      {canSnooze && g.items.length > 1 && active !== `group:${g.kind}` && <Button size="sm" variant="ghost" onClick={() => { setActive(`group:${g.kind}`); setReason(""); setMsg(null); }}><AlarmClock aria-hidden="true" size={14} />{t("snoozeAll", { n: g.items.length })}</Button>}
                    </div>
                    {active === `group:${g.kind}` && <div className="border-b border-line px-4 pb-3">{reasonForm(g.kind, g.items.map((a) => a.key))}</div>}
                    <ul className="divide-y divide-line">{g.items.map((a) => row(a, false))}</ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="al-snoozed">
        <h2 id="al-snoozed" className="mb-3 font-display text-xl">{t("snoozedTitle")} <span className="text-base text-muted"><bdi>({snoozed.length})</bdi></span></h2>
        {snoozed.length === 0 ? <p className="text-sm text-muted">{t("noSnoozed")}</p> : <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{snoozed.map((a) => row(a, true))}</ul>}
      </section>
    </div>
  );
}
