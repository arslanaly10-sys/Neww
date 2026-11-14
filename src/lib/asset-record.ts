import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assetFacts, assets, assetVersions, buildings, calendarEvents, deals, documents, installments, leases, ledgerEntries, ownershipShares, portfolios, tenants, units, users, valuations, workOrders } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { notify } from "./notify";
import type { CurrentUser } from "./session";

/**
 * The asset record. The asset id (A-001) never changes: details change by new versions, facts by new observations,
 * value by new valuations, so the asset carries its whole history. Each important fact keeps its source and date,
 * and analysts verify or dispute it. Everything runs under the reader's row-level security.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export const FACT_FIELDS = ["area_sqm", "plot_area_sqm", "year_built", "finish", "occupancy", "status", "title_status", "permitted_use", "value_egp"] as const;
export const SOURCE_KINDS = ["document", "survey", "owner", "valuation", "import", "manual"] as const;
const EDITABLE = ["name", "nameAr", "areaSqm", "plotAreaSqm", "floor", "finish", "yearBuilt", "occupancy", "status", "deliveryOn"] as const;
const FIELD_OF: Partial<Record<(typeof EDITABLE)[number], string>> = { areaSqm: "area_sqm", plotAreaSqm: "plot_area_sqm", yearBuilt: "year_built", finish: "finish", occupancy: "occupancy", status: "status" };

export async function getAssetRecord(user: CurrentUser, id: string) {
  if (!can(user.role, "asset.view")) return null;
  const money = can(user.role, "asset.income_costs.view");
  const d = await withSession(sess(user), async (tx) => {
    const [a] = await tx.select().from(assets).where(eq(assets.id, String(id)));
    if (!a) return null;
    return {
      a,
      portfolio: (await tx.select().from(portfolios).where(eq(portfolios.id, a.portfolioId)))[0] ?? null,
      owners: await tx.select().from(ownershipShares).where(eq(ownershipShares.assetId, a.id)),
      buildings: await tx.select().from(buildings).where(eq(buildings.assetId, a.id)).orderBy(asc(buildings.id)),
      units: await tx.select({ u: units, tenant: tenants.name, tenantAr: tenants.nameAr }).from(units).leftJoin(leases, eq(leases.id, units.leaseId)).leftJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(units.assetId, a.id)).orderBy(asc(units.id)),
      versions: await tx.select().from(assetVersions).where(eq(assetVersions.assetId, a.id)).orderBy(desc(assetVersions.version)),
      facts: await tx.select().from(assetFacts).where(eq(assetFacts.assetId, a.id)).orderBy(asc(assetFacts.field), desc(assetFacts.recordedAt)),
      plan: await tx.select().from(installments).where(eq(installments.assetId, a.id)).orderBy(asc(installments.seq)),
      people: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users),
      links: {
        leases: (await tx.select({ id: leases.id }).from(leases).where(eq(leases.assetId, a.id))).length,
        documents: (await tx.select({ id: documents.id }).from(documents).where(eq(documents.assetId, a.id))).length,
        valuations: (await tx.select({ id: valuations.id }).from(valuations).where(eq(valuations.assetId, a.id))).length,
        work: (await tx.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.assetId, a.id))).length,
        events: (await tx.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.assetId, a.id))).length,
        deals: (await tx.select({ id: deals.id }).from(deals).where(eq(deals.assetId, a.id))).length,
        expenses: money ? (await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.assetId, a.id))).length : null,
      },
    };
  });
  if (!d) return null;
  const name = (pid: string | null) => d.people.find((p) => p.id === pid);
  const current = d.facts.filter((f) => !f.supersededAt);
  const paid = d.plan.filter((p) => p.paidOn).reduce((s, p) => s + p.amountEgp, 0);
  const owed = d.plan.filter((p) => !p.paidOn);
  return {
    asset: d.a, portfolio: d.portfolio, owners: d.owners.map((o) => ({ ...o, sharePct: Number(o.sharePct) })),
    buildings: d.buildings, units: d.units.map((x) => ({ ...x.u, tenant: x.tenant, tenantAr: x.tenantAr })),
    versions: d.versions.map((v) => ({ ...v, actorName: name(v.actorId)?.name ?? v.actorId, actorNameAr: name(v.actorId)?.nameAr ?? v.actorId })),
    facts: current.map((f) => ({ ...f, recordedByName: name(f.recordedBy)?.name ?? f.recordedBy, recordedByNameAr: name(f.recordedBy)?.nameAr ?? f.recordedBy, reviewedByName: name(f.reviewedBy)?.name ?? null, reviewedByNameAr: name(f.reviewedBy)?.nameAr ?? null, earlier: d.facts.filter((x) => x.field === f.field && x.supersededAt).map((x) => ({ value: x.value, observedOn: x.observedOn, sourceLabel: x.sourceLabel })) })),
    plan: d.plan.map((p) => ({ ...p, state: p.paidOn ? "paid" : p.dueOn < DEMO_TODAY ? "overdue" : "due" })),
    planTotals: d.plan.length ? { total: paid + owed.reduce((s, p) => s + p.amountEgp, 0), paid, outstanding: owed.reduce((s, p) => s + p.amountEgp, 0), next: owed[0] ?? null, overdue: owed.filter((p) => p.dueOn < DEMO_TODAY).length } : null,
    links: d.links, verified: current.filter((f) => f.status === "verified").length, factCount: current.length,
  };
}
export type AssetRecord = NonNullable<Awaited<ReturnType<typeof getAssetRecord>>>;

export type RecordError = "forbidden" | "invalid" | "not_found" | "own_fact" | "no_change";
const int = (max: number) => z.union([z.literal(""), z.coerce.number().int().min(0).max(max)]).optional();
const Update = z.object({
  name: z.string().trim().min(3).max(120), nameAr: z.string().trim().min(2).max(120),
  areaSqm: z.coerce.number().int().positive().max(1e6), plotAreaSqm: int(1e7), floor: int(200), yearBuilt: z.union([z.literal(""), z.coerce.number().int().min(1850).max(2035)]).optional(),
  finish: z.enum(["core_shell", "semi_finished", "fully_finished", "luxury"]), occupancy: z.enum(["let", "vacant", "owner", "land"]),
  status: z.enum(["ready", "under_construction", "off_plan"]), deliveryOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  reason: z.string().trim().min(5).max(300), sourceKind: z.enum(SOURCE_KINDS), sourceRef: z.string().trim().max(60).optional().default(""),
});
const blank = (v: unknown) => (v === "" || v === undefined ? null : v);

/**
 * Change an asset's details. The row is updated, a new version records the full snapshot and what changed, and each
 * changed fact is recorded as a new, unverified observation that supersedes the old one. Analysts are asked to verify.
 */
export async function updateAssetDetails(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; version: number; changed: string[]; auditSeq: number } | { ok: false; error: RecordError }> {
  if (!can(user.role, "records.edit")) return { ok: false, error: "forbidden" };
  const p = Update.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const rec = await getAssetRecord(user, id);
  if (!rec) return { ok: false, error: "not_found" };
  const a = rec.asset;
  const next = { name: v.name, nameAr: v.nameAr, areaSqm: v.areaSqm, plotAreaSqm: blank(v.plotAreaSqm) as number | null, floor: blank(v.floor) as number | null, finish: v.finish, yearBuilt: blank(v.yearBuilt) as number | null, occupancy: v.occupancy, status: v.status, deliveryOn: blank(v.deliveryOn) as string | null };
  const changed = EDITABLE.filter((k) => (a[k] ?? null) !== (next[k] ?? null));
  if (!changed.length) return { ok: false, error: "no_change" };
  const version = (rec.versions[0]?.version ?? 0) + 1;
  const now = new Date();
  const label = v.sourceKind === "document" && v.sourceRef ? `Document ${v.sourceRef}` : v.reason;
  await withSession(sess(user), async (tx) => {
    await tx.update(assets).set({ ...next, vacantSince: next.occupancy === "vacant" ? (a.vacantSince ?? DEMO_TODAY) : null }).where(eq(assets.id, a.id));
    const snapshot = { name: next.name, nameAr: next.nameAr, type: a.type, districtId: a.districtId, compound: a.compound, areaSqm: next.areaSqm, plotAreaSqm: next.plotAreaSqm, floor: next.floor, finish: next.finish, yearBuilt: next.yearBuilt, occupancy: next.occupancy, status: next.status, deliveryOn: next.deliveryOn };
    await tx.insert(assetVersions).values({ id: `AV-${randomBytes(5).toString("hex")}`, assetId: a.id, version, snapshot, changed, reason: v.reason, sourceKind: v.sourceKind, sourceRef: v.sourceRef || null, actorId: user.id, at: now });
    for (const k of changed) {
      const field = FIELD_OF[k];
      if (!field || next[k] === null) continue;
      await tx.update(assetFacts).set({ supersededAt: now }).where(and(eq(assetFacts.assetId, a.id), eq(assetFacts.field, field), isNull(assetFacts.supersededAt)));
      await tx.insert(assetFacts).values({ id: `AF-${randomBytes(5).toString("hex")}`, assetId: a.id, field, value: String(next[k]), unit: field.endsWith("sqm") ? "m²" : null, sourceKind: v.sourceKind, sourceRef: v.sourceRef || null, sourceLabel: label, observedOn: DEMO_TODAY, recordedBy: user.id, recordedAt: now, status: "unverified" });
    }
  });
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "asset.update", entity: "asset", entityId: a.id, detail: { version, changed, reason: v.reason, source: v.sourceKind, sourceRef: v.sourceRef || null } });
  if (changed.some((k) => FIELD_OF[k])) await notify({ to: { roles: ["analyst"] }, kind: "facts_to_review", params: { id: a.id, n: changed.filter((k) => FIELD_OF[k]).length }, link: `/asset/${a.id}/record#facts`, actorId: user.id });
  return { ok: true, version, changed, auditSeq: ev.seq };
}

const Review = z.object({ verdict: z.enum(["verified", "disputed"]), note: z.string().trim().max(300).optional().default("") });

/** Verify or dispute a fact. Analysts only, and never a fact you recorded yourself (four eyes). Disputing needs a note. */
export async function reviewFact(user: CurrentUser, factId: string, raw: unknown): Promise<{ ok: true; auditSeq: number } | { ok: false; error: RecordError }> {
  if (!can(user.role, "records.verify")) return { ok: false, error: "forbidden" };
  const p = Review.safeParse(raw);
  if (!p.success || (p.data.verdict === "disputed" && p.data.note.length < 3)) return { ok: false, error: "invalid" };
  const r = await withSession(sess(user), async (tx) => {
    const [f] = await tx.select().from(assetFacts).where(and(eq(assetFacts.id, String(factId)), isNull(assetFacts.supersededAt)));
    if (!f) return { error: "not_found" as const };
    if (f.recordedBy === user.id) return { error: "own_fact" as const };
    await tx.update(assetFacts).set({ status: p.data.verdict, reviewNote: p.data.note || null, reviewedBy: user.id, reviewedAt: new Date() }).where(eq(assetFacts.id, f.id));
    return { f };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "fact.review", entity: "asset_fact", entityId: r.f.id, detail: { assetId: r.f.assetId, field: r.f.field, value: r.f.value, verdict: p.data.verdict, note: p.data.note || undefined } });
  if (p.data.verdict === "disputed") await notify({ to: { users: [r.f.recordedBy] }, kind: "fact_disputed", params: { id: r.f.assetId, field: r.f.field }, link: `/asset/${r.f.assetId}/record#facts`, actorId: user.id });
  return { ok: true, auditSeq: ev.seq };
}

/** Facts waiting for a reviewer across the portfolio: unverified and disputed, oldest first. */
export async function factQueue(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  const rows = await withSession(sess(user), (tx) => tx.select({ f: assetFacts, name: assets.name, nameAr: assets.nameAr }).from(assetFacts).innerJoin(assets, eq(assets.id, assetFacts.assetId)).where(isNull(assetFacts.supersededAt)).orderBy(asc(assetFacts.recordedAt)));
  return rows.filter((r) => r.f.status !== "verified").map((r) => ({ ...r.f, assetName: r.name, assetNameAr: r.nameAr }));
}

/** Record an instalment as paid today. */
export async function payInstallment(user: CurrentUser, id: string): Promise<{ ok: true; auditSeq: number } | { ok: false; error: RecordError }> {
  if (!can(user.role, "records.edit")) return { ok: false, error: "forbidden" };
  const r = await withSession(sess(user), async (tx) => {
    const [i] = await tx.select().from(installments).where(eq(installments.id, String(id)));
    if (!i) return null;
    if (i.paidOn) return { i, already: true };
    await tx.update(installments).set({ paidOn: DEMO_TODAY }).where(eq(installments.id, i.id));
    return { i, already: false };
  });
  if (!r) return { ok: false, error: "not_found" };
  if (r.already) return { ok: false, error: "no_change" };
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "installment.pay", entity: "installment", entityId: r.i.id, detail: { assetId: r.i.assetId, seq: r.i.seq, amountEgp: r.i.amountEgp } });
  return { ok: true, auditSeq: ev.seq };
}

/** Portfolio-wide record totals for the portfolio page: instalments still owed and how much of the record is verified. */
export async function recordSummary(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  return withSession(sess(user), async (tx) => {
    const plan = await tx.select().from(installments);
    const facts = await tx.select({ status: assetFacts.status }).from(assetFacts).where(isNull(assetFacts.supersededAt));
    const pf = (await tx.select().from(portfolios))[0] ?? null;
    return {
      portfolio: pf,
      outstandingEgp: plan.filter((p) => !p.paidOn).reduce((s, p) => s + p.amountEgp, 0),
      next12Egp: plan.filter((p) => !p.paidOn && p.dueOn <= `${Number(DEMO_TODAY.slice(0, 4)) + 1}${DEMO_TODAY.slice(4)}`).reduce((s, p) => s + p.amountEgp, 0),
      verifiedShare: facts.length ? facts.filter((f) => f.status === "verified").length / facts.length : 0,
      disputed: facts.filter((f) => f.status === "disputed").length,
    };
  });
}
