"use client";
import { useLocale, useTranslations } from "next-intl";
import type { ApprovalItem } from "@/lib/approvals-service";
import { dateFmt, money, type Currency, listSep } from "@/lib/format";
import { Badge, Card } from "../ui";
import { DecisionControl, type DecisionFact } from "../decision";

export function ApprovalsQueue({ items, currency, fx }: { items: ApprovalItem[]; currency: Currency; fx: number }) {
  const t = useTranslations("al");
  const r = useTranslations("roles");
  const locale = useLocale();
  const ar = locale === "ar";
  const dc = useTranslations("decide");
  const pendingItems = items.filter((i) => i.status === "pending");
  const history = items.filter((i) => i.status !== "pending").slice(0, 6);

  const M = (n: number) => money(n, currency, locale, { fx });
  /** What the decision sheet restates, per kind of approval. */
  const decision = (i: ApprovalItem): { facts: DecisionFact[]; effect: string; title: string; reason: string | null } => {
    const s = i.summary;
    const who = { label: dc("fProposedBy"), value: ar ? i.proposerNameAr : i.proposerName };
    if (i.kind === "valuation") {
      const left = Number(s.required) - Number(s.approved);
      const asset = String((ar ? s.assetAr : s.asset) ?? "–");
      return {
        title: `${i.refId}, ${asset}`, reason: s.reason ? String(s.reason) : null,
        effect: left <= 1 ? dc("effectConfirmAsset") : dc("effectPartial", { n: left - 1 }),
        facts: [
          { label: dc("fAsset"), value: asset },
          { label: dc("fModel"), value: M(Number(s.modelEstimateEgp)) },
          { label: dc("fFinal"), value: M(Number(s.finalValueEgp ?? s.modelEstimateEgp)), strong: true },
          { label: dc("fAdjustment"), value: `${Number(s.adjustmentPct) > 0 ? "+" : ""}${s.adjustmentPct}%` },
          { label: dc("fApprovals"), value: dc("approvalsValue", { n: Number(s.approved), m: Number(s.required) }) },
          who,
        ],
      };
    }
    if (i.kind === "distribution") return {
      title: `${i.refId}, ${String(s.period ?? "")}`, reason: s.note ? String(s.note) : null, effect: dc("effectDistribution"),
      facts: [
        { label: dc("fPeriod"), value: String(s.period ?? "") },
        { label: dc("fAmount"), value: M(Number(s.amountEgp)), strong: true },
        { label: dc("fNoi"), value: M(Number(s.basisNoiEgp)) },
        { label: dc("fPayout"), value: `${Math.round((Number(s.amountEgp) / Number(s.basisNoiEgp)) * 100)}%` },
        who,
      ],
    };
    if (i.kind === "update_draft") return { title: String((ar ? s.titleAr : s.title) ?? i.refId), reason: null, effect: dc("effectPublish"), facts: [{ label: dc("fUpdate"), value: String((ar ? s.titleAr : s.title) ?? i.refId) }, who] };
    return { title: String((ar ? s.targetAr : s.target) ?? i.refId), reason: i.note ?? null, effect: dc("effectRole"), facts: [{ label: dc("fPerson"), value: String((ar ? s.targetAr : s.target) ?? i.refId) }, who] };
  };

  const summary = (i: ApprovalItem) => {
    const s = i.summary;
    if (i.kind === "valuation") return t("a_valuation", { id: i.refId, asset: String((ar ? s.assetAr : s.asset) ?? "–"), model: money(Number(s.modelEstimateEgp), currency, locale, { fx, compact: true }), final: money(Number(s.finalValueEgp ?? s.modelEstimateEgp), currency, locale, { fx, compact: true }), adj: `${Number(s.adjustmentPct) > 0 ? "+" : ""}${s.adjustmentPct}%`, n: Number(s.approved), m: Number(s.required) });
    if (i.kind === "update_draft") return t("a_update", { title: String((ar ? s.titleAr : s.title) ?? i.refId) });
    if (i.kind === "distribution") return t("a_distribution", { id: i.refId, period: String(s.period ?? ""), amount: money(Number(s.amountEgp), currency, locale, { fx, compact: true }), noi: money(Number(s.basisNoiEgp), currency, locale, { fx, compact: true }) });
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
          {i.status === "pending" && (() => {
            const d = decision(i);
            return <DecisionControl kind="approval" id={i.id} title={d.title} facts={d.facts} effect={d.effect} reason={d.reason}
              blockedReason={i.canDecide ? null : i.blocked === "self" ? t("blockedSelf") : t("blockedRole", { role: r(i.routeRole as "manager") })} />;
          })()}
        </div>
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
