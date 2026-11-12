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

export function AlertsBoard({ open, snoozed, canSnooze, currency, fx, userNames }: { open: AlertView[]; snoozed: AlertView[]; canSnooze: boolean; currency: Currency; fx: number; userNames: Record<string, { name: string; nameAr: string }> }) {
  const t = useTranslations("al");
  const text = useAlertText(currency, fx);
  const locale = useLocale();
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const snooze = (key: string) => start(async () => {
    setMsg(null);
    const r = await snoozeAlertAction(key, reason);
    if (!r.ok) { setMsg(t(`err_${r.error}` as "err_forbidden")); return; }
    setActive(null); setReason(""); router.refresh();
  });
  const reopen = (key: string) => start(async () => { const r = await reopenAlertAction(key); if (!r.ok) setMsg(t(`err_${r.error}` as "err_forbidden")); else router.refresh(); });

  const row = (a: AlertView, isSnoozed: boolean) => {
    const I = ICON[a.kind];
    return (
      <li key={a.key}>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <I aria-hidden="true" size={18} className={cn("mt-0.5 shrink-0", a.severity === "high" ? "text-danger" : "text-gold")} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-center gap-2"><Badge tone={TONE[a.severity]} className="normal-case">{t(`sev_${a.severity}` as "sev_high")}</Badge><span className="text-xs text-muted">{t(`kind_${a.kind}` as "kind_lease_renewal")}</span></p>
              <p className="mt-1">{text(a)}</p>
              <p className="mt-1 text-xs"><Link href={`/asset/${a.assetId}`} className="text-gold underline underline-offset-4">{t("openAsset")}</Link></p>
              {isSnoozed && a.snoozeReason && <p className="mt-2 rounded bg-surface-2 p-2 text-xs text-muted">{t("snoozedBy", { name: userNames[a.snoozedBy ?? ""]?.[locale === "ar" ? "nameAr" : "name"] ?? a.snoozedBy ?? "", reason: a.snoozeReason })}</p>}
              {active === a.key && (
                <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); snooze(a.key); }}>
                  <label htmlFor={`sz-${a.key}`} className="block text-xs font-semibold uppercase tracking-wide text-muted">{t("snoozeReason")}</label>
                  <input id={`sz-${a.key}`} className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
                  <div className="flex gap-2"><Button type="submit" size="sm" variant="gold" disabled={pending || reason.trim().length < 10}>{t("snoozeConfirm")}</Button><Button type="button" size="sm" onClick={() => { setActive(null); setReason(""); }}>{t("cancel")}</Button></div>
                </form>
              )}
            </div>
            {canSnooze && active !== a.key && (isSnoozed
              ? <Button size="sm" onClick={() => reopen(a.key)} disabled={pending}>{t("reopen")}</Button>
              : <Button size="sm" onClick={() => { setActive(a.key); setReason(""); setMsg(null); }}><AlarmClock aria-hidden="true" size={14} />{t("snooze")}</Button>)}
          </div>
        </Card>
      </li>
    );
  };

  return (
    <div className="space-y-8">
      {!canSnooze && <p className="text-xs text-muted">{t("onlyManagers")}</p>}
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
      <section aria-labelledby="al-open">
        <h2 id="al-open" className="mb-3 flex items-center gap-2 font-display text-2xl"><AlertTriangle aria-hidden="true" size={20} className="text-gold" />{t("alertsTitle")} <span className="text-base text-muted"><bdi>({open.length})</bdi></span></h2>
        {open.length === 0 ? <Card className="text-sm text-muted">{t("noAlerts")}</Card> : <ul className="grid gap-3 lg:grid-cols-2">{open.map((a) => row(a, false))}</ul>}
      </section>
      <section aria-labelledby="al-snoozed">
        <h2 id="al-snoozed" className="mb-3 font-display text-xl">{t("snoozedTitle")} <span className="text-base text-muted"><bdi>({snoozed.length})</bdi></span></h2>
        {snoozed.length === 0 ? <p className="text-sm text-muted">{t("noSnoozed")}</p> : <ul className="grid gap-3 lg:grid-cols-2">{snoozed.map((a) => row(a, true))}</ul>}
      </section>
    </div>
  );
}
