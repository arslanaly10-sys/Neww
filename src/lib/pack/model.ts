import "server-only";
import { desc } from "drizzle-orm";
import { getDb, withSession } from "@/db/client";
import { auditEvents, assets, valuations } from "@/db/schema";
import { DEMO_TODAY } from "../assumptions";
import { getPortfolio, getDocuments } from "../access";
import { getAggregateIncome, getHistory } from "../portfolio-data";
import { portfolioMetrics } from "../metrics";
import { assessRisk } from "../risk";
import { canonical, sha256 } from "../hash";
import type { CurrentUser } from "../session";

/**
 * Everything that appears in an investor pack, gathered through the viewer's row-level security.
 * No per-asset income or cost figures are included, so the same pack is safe for the investor role.
 */
export interface PackModel {
  version: "1.0"; asOf: string; lang: "en" | "ar"; currency: "EGP" | "USD"; fx: number; role: string; holder: string;
  summary: { assets: number; valueEgp: number; costEgp: number; gainEgp: number; gainPct: number; incomeUnits: number; vacant: number; netYieldPct: number };
  performance: { months: { month: string; value: number; cost: number }[]; changePct: number };
  allocation: { byType: { id: string; value: number; share: number }[]; byDistrict: { id: string; name: string; nameAr: string; value: number; share: number }[] };
  risks: { id: string; name: string; nameAr: string; district: string; districtAr: string; valueEgp: number; score: number; band: string; top: { key: string; score: number; reason: { id: string; params: Record<string, string | number> } }[] }[];
  valuations: { id: string; assetId: string | null; asset: string; assetAr: string; on: string; modelEstimateEgp: number; finalValueEgp: number | null; adjustmentPct: number; status: string }[];
  pendingValuations: number;
  audit: { events: number; headSeq: number; headHash: string; excerpt: { seq: number; at: string; action: string; entityId: string; hash: string }[] };
}

export async function buildPackModel(user: CurrentUser, lang: "en" | "ar", currency: "EGP" | "USD", fx: number): Promise<PackModel> {
  const [rows, history, agg, docs] = await Promise.all([getPortfolio(user), getHistory(user), getAggregateIncome(), getDocuments(user)]);
  const m = portfolioMetrics(rows);
  const first = history.find((h) => h.value > 0) ?? history[0], last = history[history.length - 1];

  const risks = rows.map((r) => {
    const share = (m.allocation.find((d) => d.id === r.districtId)?.value ?? 0) / m.value;
    const rk = assessRisk({ occupancy: r.occupancy, vacantSince: r.vacantSince, leaseEnd: r.lease?.endDate ?? null, leaseCurrency: r.lease?.currency ?? null, docs: docs.filter((d) => d.assetId === r.id), districtShare: share });
    return { id: r.id, name: r.name, nameAr: r.nameAr, district: r.district.name, districtAr: r.district.nameAr, valueEgp: r.valueEgp, score: rk.score, band: rk.band, top: [...rk.drivers].sort((a, b) => b.contribution - a.contribution).slice(0, 2).map((d) => ({ key: d.key, score: d.score, reason: d.reason })) };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 6);

  const vals = await withSession({ userId: user.id, role: user.role }, async (tx) => {
    const v = await tx.select().from(valuations).orderBy(desc(valuations.createdAt));
    const a = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets);
    return { v, a };
  });
  const confirmed = vals.v.filter((x) => x.status === "confirmed").slice(0, 8);

  // The audit chain head and the finance-relevant events only. The full log is for the administrator.
  const db = await getDb();
  const [head] = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
  const all = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq));
  const excerpt = all.filter((e) => /^(valuation\.(confirm|approve|reject|propose)|scenario\.save|document\.confirm|pack\.generate|assumptions\.publish)/.test(e.action)).slice(0, 8)
    .map((e) => ({ seq: e.seq, at: e.at.toISOString().slice(0, 10), action: e.action, entityId: e.entityId, hash: e.hash.slice(0, 16) }));

  return {
    version: "1.0", asOf: DEMO_TODAY, lang, currency, fx, role: user.role, holder: "Sample Family Office",
    summary: { assets: m.count, valueEgp: m.value, costEgp: m.cost, gainEgp: m.gain, gainPct: m.gainPct, incomeUnits: m.incomeUnits, vacant: rows.filter((r) => r.occupancy === "vacant").length, netYieldPct: agg.net / m.value },
    performance: { months: history.map((h) => ({ month: h.month, value: h.value, cost: h.cost })), changePct: last.value / first.value - 1 },
    allocation: {
      byType: m.byType.map((t) => ({ id: t.id, value: t.value, share: t.value / m.value })),
      byDistrict: m.allocation.map((d) => ({ id: d.id, name: d.name, nameAr: d.nameAr, value: d.value, share: d.value / m.value })),
    },
    risks,
    valuations: confirmed.map((v) => ({ id: v.id, assetId: v.assetId, asset: vals.a.find((x) => x.id === v.assetId)?.name ?? "–", assetAr: vals.a.find((x) => x.id === v.assetId)?.nameAr ?? "–", on: (v.confirmedAt ?? v.createdAt).toISOString().slice(0, 10), modelEstimateEgp: v.modelEstimateEgp, finalValueEgp: v.finalValueEgp, adjustmentPct: v.finalValueEgp ? v.finalValueEgp / v.modelEstimateEgp - 1 : 0, status: v.status })),
    pendingValuations: vals.v.filter((x) => x.status === "in_review").length,
    audit: { events: head?.seq ?? 0, headSeq: head?.seq ?? 0, headHash: head?.hash ?? "", excerpt },
  };
}

/** Content hash covers what the reader sees. The verification hash binds it to the audit chain head at the time of issue. */
export const contentHash = (m: PackModel) => sha256(canonical({ ...m, audit: { ...m.audit, headHash: undefined, headSeq: undefined, events: undefined } }));
export const verificationHash = (content: string, m: PackModel) => sha256(`${content}:${m.audit.headSeq}:${m.audit.headHash}`);
