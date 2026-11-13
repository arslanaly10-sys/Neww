import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withSession } from "@/db/client";
import { distributions, approvals, investorUpdates, users, valuations, assets } from "@/db/schema";
import { can } from "./permissions";
import { appendAudit } from "./audit";
import { DEMO_TODAY } from "./assumptions";
import { decideValuation } from "./valuation-service";
import type { CurrentUser } from "./session";

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export type ApprovalError = "forbidden" | "not_found" | "self_approval" | "not_pending" | "invalid";

export interface ApprovalItem {
  id: string; kind: "valuation" | "update_draft" | "role_change" | "document" | "distribution"; refId: string; status: string; createdAt: string; decidedAt: string | null;
  proposedBy: string; proposerName: string; proposerNameAr: string; routeRole: string; note: string | null;
  summary: Record<string, string | number | null>;
  canDecide: boolean; blocked: "role" | "self" | null;
}

export async function listApprovals(user: CurrentUser): Promise<ApprovalItem[]> {
  return withSession(sess(user), async (tx) => {
    const rows = await tx.select().from(approvals).orderBy(desc(approvals.createdAt));
    const u = await tx.select().from(users);
    const vals = user.role === "admin" ? [] : await tx.select().from(valuations);
    const ups = user.role === "admin" ? [] : await tx.select().from(investorUpdates);
    const ass = user.role === "admin" ? [] : await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets);
    const dists = user.role === "admin" ? [] : await tx.select().from(distributions);
    return rows.map((r): ApprovalItem => {
      const p = u.find((x) => x.id === r.proposedBy);
      const summary: ApprovalItem["summary"] = {};
      if (r.kind === "valuation") {
        const v = vals.find((x) => x.id === r.refId);
        if (v) Object.assign(summary, { assetId: v.assetId, asset: ass.find((x) => x.id === v.assetId)?.name ?? null, assetAr: ass.find((x) => x.id === v.assetId)?.nameAr ?? null, modelEstimateEgp: v.modelEstimateEgp, finalValueEgp: v.finalValueEgp, adjustmentPct: v.finalValueEgp ? Math.round((v.finalValueEgp / v.modelEstimateEgp - 1) * 1000) / 10 : 0, required: v.requiredApprovals, approved: (v.approvals as unknown[]).length, reason: v.adjustmentReason });
      } else if (r.kind === "update_draft") {
        const d = ups.find((x) => x.id === r.refId);
        if (d) Object.assign(summary, { title: d.title, titleAr: d.titleAr, body: d.body, bodyAr: d.bodyAr });
      } else if (r.kind === "distribution") {
        const d = dists.find((x) => x.id === r.refId);
        if (d) Object.assign(summary, { period: d.period, amountEgp: d.amountEgp, basisNoiEgp: d.basisNoiEgp, note: d.note });
      } else if (r.kind === "role_change") {
        const t = u.find((x) => x.id === r.refId);
        Object.assign(summary, { target: t?.name ?? r.refId, targetAr: t?.nameAr ?? r.refId, targetRole: t?.role ?? null });
      }
      const pending = r.status === "pending";
      const roleOk = r.routeRole === user.role && can(user.role, "approvals.decide");
      const self = r.proposedBy === user.id;
      return {
        id: r.id, kind: r.kind as ApprovalItem["kind"], refId: r.refId, status: r.status, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
        proposedBy: r.proposedBy, proposerName: p?.name ?? r.proposedBy, proposerNameAr: p?.nameAr ?? r.proposedBy, routeRole: r.routeRole, note: r.note, summary,
        canDecide: pending && roleOk && !self, blocked: !pending ? null : !roleOk ? "role" : self ? "self" : null,
      };
    });
  });
}

/** Decide any approval. Valuations go through the valuation service, which owns their two-approver rule. */
export async function decideApproval(user: CurrentUser, id: string, decision: "approve" | "reject", note = ""): Promise<{ ok: true; status: string; detail?: string; auditSeq: number } | { ok: false; error: ApprovalError }> {
  if (!can(user.role, "approvals.decide")) return { ok: false, error: "forbidden" };
  if (decision !== "approve" && decision !== "reject") return { ok: false, error: "invalid" };
  const item = (await listApprovals(user)).find((x) => x.id === id);
  if (!item) return { ok: false, error: "not_found" };
  if (item.status !== "pending") return { ok: false, error: "not_pending" };
  if (item.routeRole !== user.role) return { ok: false, error: "forbidden" };
  if (item.proposedBy === user.id) return { ok: false, error: "self_approval" };

  if (item.kind === "valuation") {
    const r = await decideValuation(user, item.refId, decision, note);
    if (!r.ok) return { ok: false, error: r.error === "self_approval" ? "self_approval" : r.error === "forbidden" ? "forbidden" : r.error === "not_in_review" ? "not_pending" : "not_found" };
    return { ok: true, status: r.status, detail: `${r.approvals}/${r.required}`, auditSeq: r.auditSeq };
  }

  const now = new Date();
  const status = decision === "approve" ? "approved" : "rejected";
  await withSession(sess(user), async (tx) => {
    await tx.update(approvals).set({ status, decidedBy: user.id, decidedAt: now }).where(and(eq(approvals.id, id), eq(approvals.status, "pending")));
    if (item.kind === "distribution") {
      await tx.update(distributions).set({ status: decision === "approve" ? "approved" : "rejected", decidedBy: user.id }).where(eq(distributions.id, item.refId));
    }
    if (item.kind === "update_draft") {
      await tx.update(investorUpdates).set(decision === "approve" ? { status: "published", postedOn: DEMO_TODAY } : { status: "rejected" }).where(eq(investorUpdates.id, item.refId));
    }
  });
  const n = String(note ?? "").trim().slice(0, 500);
  const ev = await appendAudit({
    actorId: user.id, actorRole: user.role,
    action: item.kind === "update_draft" ? (decision === "approve" ? "update.publish" : "update.reject") : item.kind === "distribution" ? (decision === "approve" ? "distribution.approve" : "distribution.reject") : "role.change.decide",
    entity: item.kind === "update_draft" ? "investor_update" : item.kind === "distribution" ? "distribution" : "user", entityId: item.refId,
    detail: { approval: id, decision, proposedBy: item.proposedBy, ...(item.kind === "role_change" ? { recordedOnly: true } : {}), ...(n ? { note: n } : {}) },
  });
  return { ok: true, status, auditSeq: ev.seq };
}
