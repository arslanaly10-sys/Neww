"use client";
import { useLocale, useTranslations } from "next-intl";
import { listSep } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AlertView } from "@/lib/alerts-service";
import type { Currency } from "@/lib/format";
import { Badge, Card } from "../ui";
import { useAlertText } from "./board";

const TONE = { high: "danger", medium: "gold", low: "muted" } as const;
/** Overview summary: the few most severe alerts, the counts, and a way in. */
export function AttentionCard({ top, alertTotal, approvals, currency, fx }: { top: AlertView[]; alertTotal: number; approvals: number; currency: Currency; fx: number }) {
  const t = useTranslations("al");
  const locale = useLocale();
  const text = useAlertText(currency, fx);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl"><AlertTriangle aria-hidden="true" size={18} className="text-gold" />{t("needsAttention")}</h2>
        <p className="text-xs text-muted"><bdi>{t("alertCount", { n: alertTotal })}</bdi>{listSep(locale)}<bdi>{t("approvalCount", { n: approvals })}</bdi></p>
      </div>
      {top.length === 0 && approvals === 0 ? <p className="text-sm text-muted">{t("nothingNow")}</p> : (
        <ul className="space-y-2.5">
          {top.map((a) => (
            <li key={a.key} className="flex items-start gap-2 text-sm"><Badge tone={TONE[a.severity]} className="mt-0.5 shrink-0">{t(`sev_${a.severity}` as "sev_high")}</Badge><span>{text(a)}</span></li>
          ))}
        </ul>
      )}
      <Link href="/overview/alerts" className="tap mt-4 inline-block text-sm text-gold underline underline-offset-4">{t("viewAll")}</Link>
    </Card>
  );
}
