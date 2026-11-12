"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { decideApprovalAction } from "@/app/stage5-actions";
import type { ApprovalItem } from "@/lib/approvals-service";
import { dateFmt, money, type Currency, listSep } from "@/lib/format";
import { Badge, Button, Card } from "../ui";

export function ApprovalsQueue({ items, currency, fx }: { items: ApprovalItem[]; currency: Currency; fx: number }) {
  const t = useTranslations("al");
  const r = useTranslations("roles");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const pendingItems = items.filter((i) => i.status === "pending");
  const history = items.filter((i) => i.status !== "pending").slice(0, 6);

  const decide = (id: string, d: "approve" | "reject") => start(async () => {
    const res = await decideApprovalAction(id, d);
    if (!res.ok) { setMsg((p) => ({ ...p, [id]: t(`err_${res.error}` as "err_forbidden") })); return; }
    setMsg((p) => ({ ...p, [id]: d === "reject" ? t("rejectedMsg") : res.status === "confirmed" ? t("confirmedMsg") : res.status === "in_review" ? t("partialMsg", { detail: res.detail ?? "" }) : t("approvedMsg") }));
    router.refresh();
  });

  const summary = (i: ApprovalItem) => {
    const s = i.summary;
    if (i.kind === "valuation") return t("a_valuation", { id: i.refId, asset: String((ar ? s.assetAr : s.asset) ?? "–"), model: money(Number(s.modelEstimateEgp), currency, locale, { fx, compact: true }), final: money(Number(s.finalValueEgp ?? s.modelEstimateEgp), currency, locale, { fx, compact: true }), adj: `${Number(s.adjustmentPct) > 0 ? "+" : ""}${s.adjustmentPct}%`, n: Number(s.approved), m: Number(s.required) });
    if (i.kind === "update_draft") return t("a_update", { title: String((ar ? s.titleAr : s.title) ?? i.refId) });
    return t("a_role", { target: String((ar ? s.targetAr : s.target) ?? i.refId) });
  };
  const card = (i: ApprovalItem) => (
    <li key={i.id}>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{i.id}</span><Badge tone="muted" className="">{t(`ak_${i.kind}` as "ak_valuation")}</Badge><Badge tone={i.status === "pending" ? "gold" : i.status === "approved" ? "ok" : "danger"} className="">{t(`st_${i.status}` as "st_pending")}</Badge></p>
            <p className="mt-1">{summary(i)}</p>
            {i.kind === "role_change" && i.note && <p className="mt-1 text-xs text-muted">{i.note}</p>}
            {i.kind === "role_change" && <p className="mt-1 text-xs text-muted">{t("demoRecorded")}</p>}
            {i.kind === "update_draft" && Boolean(i.summary.body) && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">{String((ar ? i.summary.titleAr : i.summary.title) ?? "")}</summary><p className="mt-1 whitespace-pre-line rounded bg-surface-2 p-2">{String((ar ? i.summary.bodyAr : i.summary.body) ?? "")}</p></details>}
            <p className="mt-1 text-xs text-muted">{t("proposedBy", { name: ar ? i.proposerNameAr : i.proposerName })}{listSep(locale)}{t("routedTo", { role: r(i.routeRole as "manager") })}{listSep(locale)}<bdi>{dateFmt(i.createdAt.slice(0, 10), locale)}</bdi></p>
          </div>
          {i.status === "pending" && (
            <div className="flex flex-col items-start gap-2">
              <div className="flex gap-2">
                <Button size="sm" variant="gold" disabled={!i.canDecide || pending} aria-describedby={i.blocked ? `bl-${i.id}` : undefined} onClick={() => decide(i.id, "approve")}><Check aria-hidden="true" size={14} />{t("approve")}</Button>
                <Button size="sm" disabled={!i.canDecide || pending} aria-describedby={i.blocked ? `bl-${i.id}` : undefined} onClick={() => decide(i.id, "reject")}><X aria-hidden="true" size={14} />{t("reject")}</Button>
              </div>
              {i.blocked && <p id={`bl-${i.id}`} className="max-w-xs text-xs text-muted">{i.blocked === "self" ? t("blockedSelf") : t("blockedRole", { role: r(i.routeRole as "manager") })}</p>}
            </div>
          )}
        </div>
        {msg[i.id] && <p role="status" className="mt-2 text-xs text-gold">{msg[i.id]}</p>}
      </Card>
    </li>
  );
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t("pendingTitle")} <bdi>({pendingItems.length})</bdi></h3>
        {pendingItems.length === 0 ? <Card className="text-sm text-muted">{t("noApprovals")}</Card> : <ul className="space-y-3">{pendingItems.map(card)}</ul>}
      </div>
      {history.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-muted">{t("historyTitle")}</h3><ul className="space-y-3">{history.map(card)}</ul></div>}
    </div>
  );
}
