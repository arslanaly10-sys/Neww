"use client";
import { useLocale, useTranslations } from "next-intl";
import { listSep } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AlertView } from "@/lib/alerts-service";
import type { Currency } from "@/lib/format";
import { Badge, Card } from "../ui";
import { byUrgency, useAlertText } from "./board";

const TONE = { high: "danger", medium: "gold", low: "muted" } as const;
/** Overview summary: the few most severe alerts, the counts, and a way in. */
export function AttentionCard({ top, all, alertTotal, approvals, currency, fx }: { top: AlertView[]; all?: AlertView[]; alertTotal: number; approvals: number; currency: Currency; fx: number }) {
  const t = useTranslations("al");
  const locale = useLocale();
  const text = useAlertText(currency, fx);
  const list = all ?? top;
  const kinds = (["lease_renewal", "missing_document", "valuation_drift", "vacancy_cost"] as const)
    .map((k) => ({ k, n: list.filter((a) => a.kind === k).length, high: list.filter((a) => a.kind === k && a.severity === "high").length })).filter((x) => x.n);
  const urgent = [...list].sort(byUrgency)[0];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl"><AlertTriangle aria-hidden="true" size={18} className="text-gold" />{t("needsAttention")}</h2>
        <p className="text-xs text-muted"><bdi>{t("alertCount", { n: alertTotal })}</bdi>{listSep(locale)}<bdi>{t("approvalCount", { n: approvals })}</bdi></p>
      </div>
      {list.length === 0 && approvals === 0 ? <p className="text-sm text-muted">{t("nothingNow")}</p> : (
        <>
          {urgent && <p className="mb-3 flex items-start gap-2 text-sm"><Badge tone={TONE[urgent.severity]} className="mt-0.5 shrink-0">{t("mostUrgent")}</Badge><span>{text(urgent)}</span></p>}
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {kinds.map((x) => (
              <li key={x.k} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>{t(`group_${x.k}` as "group_lease_renewal")}</span>
                <span className="flex items-center gap-2"><span className="num font-semibold">{x.n}</span>{x.high > 0 && <Badge tone="danger">{t("highN", { n: x.high })}</Badge>}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href="/overview/alerts" className="tap mt-4 inline-block text-sm text-gold underline underline-offset-4">{t("viewAll")}</Link>
    </Card>
  );
}
