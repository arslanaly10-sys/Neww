import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withSession, getDb } from "@/db/client";
import { approvals, assets, comparableSales, marketSeries, valueHistory, valuations, users } from "@/db/schema";
import { DEMO_TODAY, VALUATION_ASSUMPTIONS as A } from "./assumptions";
import { can } from "./permissions";
import { appendAudit } from "./audit";
import type { CurrentUser } from "./session";
import { makeMarket, runValuation, type ValuationResult } from "./valuation";
import { monthsWindow } from "@/db/seed";

export const TYPES = ["apartment", "villa", "office", "retail", "land", "mixed"] as const;
export const FINISHES = ["core_shell", "semi_finished", "fully_finished", "luxury"] as const;
import { REASON_CODES } from "./reason-codes";
export { REASON_CODES };

export const inputSchema = z.object({
  districtId: z.string().min(1),
  type: z.enum(TYPES),
  areaSqm: z.number().int().min(20).max(20000),
  floor: z.number().int().min(0).max(60).nullable(),
  finish: z.enum(FINISHES),
  buildingAge: z.number().int().min(0).max(150).nullable(),
  address: z.string().trim().max(200).optional(),
});
export const submitSchema = z.object({
  inputs: inputSchema,
  assetId: z.string().regex(/^A-\d{3}$/).nullable(),
  finalValueEgp: z.number().int().positive().nullable(), // null = accept the model estimate
  reasonCode: z.enum(REASON_CODES).nullable(),
  reason: z.string().trim().max(500).nullable(),
});

export type ServiceError = "forbidden" | "invalid" | "reason_required" | "out_of_range" | "not_found" | "self_approval" | "already_approved" | "not_in_review";
export type Result<T> = ({ ok: true } & T) | { ok: false; error: ServiceError };

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

export async function computeValuation(user: CurrentUser, raw: unknown): Promise<Result<{ result: ValuationResult; matchedCompound: string | null; matchedAssetId: string | null }>> {
  if (!can(user.role, "valuation.run")) return { ok: false, error: "forbidden" };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const input = parsed.data;
  const { sales, series, owned } = await withSession(sess(user), async (tx) => ({
    sales: await tx.select().from(comparableSales),
    series: await tx.select().from(marketSeries),
    owned: await tx.select({ id: assets.id, compound: assets.compound }).from(assets),
  }));
  const result = runValuation(input, sales, makeMarket(series));
  // The address is not geocoded. It only matches the name of a sample compound already on record.
  const addr = (input.address ?? "").toLowerCase();
  const hit = addr ? owned.find((o) => addr.includes(o.compound.toLowerCase())) : undefined;
  return { ok: true, result, matchedCompound: hit?.compound ?? null, matchedAssetId: hit?.id ?? null };
}

const nextId = (prefix: string, ids: string[], width: number) =>
  `${prefix}-${String(Math.max(0, ...ids.map((i) => Number(i.split("-")[1]) || 0)) + 1).padStart(width, "0")}`;

/** Propose a valuation. Anyone who may run one can send it for review; nobody confirms their own. */
export async function submitValuation(user: CurrentUser, raw: unknown): Promise<Result<{ id: string; requiredApprovals: number; adjustmentPct: number }>> {
  if (!can(user.role, "valuation.send_for_review")) return { ok: false, error: "forbidden" };
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const p = parsed.data;
  const computed = await computeValuation(user, p.inputs);
  if (!computed.ok) return computed;
  const res = computed.result; // always recomputed on the server; the client's numbers are never trusted
  const final = p.finalValueEgp ?? res.estimateEgp;
  const adjustmentPct = final / res.estimateEgp - 1;
  if (final !== res.estimateEgp) {
    if (!p.reasonCode || !p.reason || p.reason.length < A.adjustment.minReasonLength) return { ok: false, error: "reason_required" };
    if (Math.abs(adjustmentPct) > 0.5) return { ok: false, error: "out_of_range" };
  }
  const required = Math.abs(adjustmentPct) > A.adjustment.secondApproverAbovePct ? 2 : 1;
  const now = new Date();
  // New ids are allocated on the privileged connection: row-level security hides other people's rows from the proposer.
  const priv = await getDb();
  const vids = (await priv.select({ id: valuations.id }).from(valuations)).map((x) => x.id);
  const aids = (await priv.select({ id: approvals.id }).from(approvals)).map((x) => x.id);
  const out = await withSession(sess(user), async (tx) => {
    const id = nextId("V", vids, 4);
    await tx.insert(valuations).values({
      id, assetId: p.assetId, assumptionSetId: res.assumptionSetId, inputs: res.inputs, result: res,
      modelEstimateEgp: res.estimateEgp, finalValueEgp: final,
      adjustmentReasonCode: final !== res.estimateEgp ? p.reasonCode : null, adjustmentReason: final !== res.estimateEgp ? p.reason : null,
      status: "in_review", requiredApprovals: required, approvals: [], proposedBy: user.id, createdAt: now,
    });
    await tx.insert(approvals).values({ id: nextId("AP", aids, 3), kind: "valuation", refId: id, proposedBy: user.id, routeRole: "manager", status: "pending", createdAt: now });
    return id;
  });
  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "valuation.propose", entity: "valuation", entityId: out,
    detail: { assetId: p.assetId, modelEstimateEgp: res.estimateEgp, finalValueEgp: final, adjustmentPct: Math.round(adjustmentPct * 1000) / 10, reasonCode: p.reasonCode, requiredApprovals: required },
  });
  return { ok: true, id: out, requiredApprovals: required, adjustmentPct };
}

export type QueueItem = {
  id: string; assetId: string | null; assetName: string | null; assetNameAr: string | null; status: string;
  modelEstimateEgp: number; finalValueEgp: number | null; adjustmentPct: number; reasonCode: string | null; reason: string | null;
  proposedBy: string; proposerName: string; proposerNameAr: string; requiredApprovals: number; approvedBy: string[]; createdAt: string; confirmedAt: string | null;
};

export async function listValuations(user: CurrentUser): Promise<QueueItem[]> {
  return withSession(sess(user), async (tx) => {
    const rows = await tx.select().from(valuations).orderBy(desc(valuations.createdAt));
    const a = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets);
    const u = await tx.select().from(users); // no row-level security on users; never open a second connection inside a transaction
    return rows.map((v) => {
      const asset = a.find((x) => x.id === v.assetId);
      const prop = u.find((x) => x.id === v.proposedBy);
      return {
        id: v.id, assetId: v.assetId, assetName: asset?.name ?? null, assetNameAr: asset?.nameAr ?? null, status: v.status,
        modelEstimateEgp: v.modelEstimateEgp, finalValueEgp: v.finalValueEgp, adjustmentPct: v.finalValueEgp ? v.finalValueEgp / v.modelEstimateEgp - 1 : 0,
        reasonCode: v.adjustmentReasonCode, reason: v.adjustmentReason, proposedBy: v.proposedBy, proposerName: prop?.name ?? v.proposedBy, proposerNameAr: prop?.nameAr ?? v.proposedBy,
        requiredApprovals: v.requiredApprovals, approvedBy: (v.approvals as { userId: string }[]).map((x) => x.userId),
        createdAt: v.createdAt.toISOString(), confirmedAt: v.confirmedAt?.toISOString() ?? null,
      };
    });
  });
}

/** Approve or reject. Only managers decide, never the proposer, and a second approver is a different person. */
export async function decideValuation(user: CurrentUser, id: string, decision: "approve" | "reject"): Promise<Result<{ status: string; approvals: number; required: number }>> {
  if (!can(user.role, "valuation.confirm")) return { ok: false, error: "forbidden" };
  const now = new Date();
  const out = await withSession(sess(user), async (tx): Promise<Result<{ status: string; approvals: number; required: number; assetId: string | null; finalValueEgp: number | null }>> => {
    const [v] = await tx.select().from(valuations).where(eq(valuations.id, id));
    if (!v) return { ok: false, error: "not_found" };
    if (v.status !== "in_review") return { ok: false, error: "not_in_review" };
    if (v.proposedBy === user.id) return { ok: false, error: "self_approval" };
    const list = v.approvals as { userId: string; at: string }[];
    if (list.some((x) => x.userId === user.id)) return { ok: false, error: "already_approved" };

    if (decision === "reject") {
      await tx.update(valuations).set({ status: "rejected" }).where(eq(valuations.id, id));
      await tx.update(approvals).set({ status: "rejected", decidedBy: user.id, decidedAt: now }).where(and(eq(approvals.kind, "valuation"), eq(approvals.refId, id)));
      return { ok: true, status: "rejected", approvals: list.length, required: v.requiredApprovals, assetId: v.assetId, finalValueEgp: v.finalValueEgp };
    }
    const next = [...list, { userId: user.id, at: now.toISOString() }];
    const done = next.length >= v.requiredApprovals;
    if (!done) {
      await tx.update(valuations).set({ approvals: next }).where(eq(valuations.id, id));
      return { ok: true, status: "in_review", approvals: next.length, required: v.requiredApprovals, assetId: v.assetId, finalValueEgp: v.finalValueEgp };
    }
    await tx.update(valuations).set({ approvals: next, status: "confirmed", confirmedBy: user.id, confirmedAt: now }).where(eq(valuations.id, id));
    await tx.update(approvals).set({ status: "approved", decidedBy: user.id, decidedAt: now }).where(and(eq(approvals.kind, "valuation"), eq(approvals.refId, id)));
    if (v.assetId && v.finalValueEgp) {
      // Confirmation updates the portfolio: the asset's value, source and the latest month of its value history.
      await tx.update(assets).set({ valueEgp: v.finalValueEgp, valueSetOn: DEMO_TODAY, valueSource: id }).where(eq(assets.id, v.assetId));
      const month = monthsWindow().slice(-1)[0];
      await tx.insert(valueHistory).values({ assetId: v.assetId, month, valueEgp: v.finalValueEgp, source: id })
        .onConflictDoUpdate({ target: [valueHistory.assetId, valueHistory.month], set: { valueEgp: v.finalValueEgp, source: id } });
    }
    return { ok: true, status: "confirmed", approvals: next.length, required: v.requiredApprovals, assetId: v.assetId, finalValueEgp: v.finalValueEgp };
  });
  if (!out.ok) return out;
  await appendAudit({
    actorId: user.id, actorRole: user.role, action: decision === "reject" ? "valuation.reject" : out.status === "confirmed" ? "valuation.confirm" : "valuation.approve",
    entity: "valuation", entityId: id, detail: { status: out.status, approvals: out.approvals, required: out.required, assetId: out.assetId, finalValueEgp: out.finalValueEgp },
  });
  return { ok: true, status: out.status, approvals: out.approvals, required: out.required };
}
