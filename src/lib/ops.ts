import "server-only";
import { randomBytes } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assets, capexItems, contractors, inspections, users, utilityReadings, workOrderEvents, workOrders } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { notify } from "./notify";
import { createWork } from "./work";
import type { CurrentUser } from "./session";

/**
 * Operations: contractors and how they perform, inspections and their findings, meter readings and consumption,
 * and capital works. Managers change them; investors read contractors and inspections; costs (utilities, capital
 * works) are for managers and analysts. Every change is audited.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export type OpsError = "forbidden" | "invalid" | "not_found" | "closed" | "own" | "lower" | "taken";
export const TRADES = ["plumbing", "electrical", "hvac", "lift", "cleaning", "general", "solar"] as const;
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

// ---------------------------------------------------------------- contractors

export interface ContractorView { id: string; name: string; nameAr: string; trade: string; email: string; active: boolean; jobs: number; done: number; open: number; onTimePct: number | null; avgDays: number | null; costVariancePct: number | null; rating: number | null; ratings: number }

/** Contractors with performance from their jobs: on time against the due date, days to finish, cost against estimate, ratings. */
export function contractorStats(c: { id: string }, jobs: { contractorId: string | null; status: string; dueOn: string | null; completedOn: string | null; createdAt: Date; estimateEgp: number | null; actualEgp: number | null; rating: number | null }[], money: boolean) {
  const mine = jobs.filter((j) => j.contractorId === c.id);
  const done = mine.filter((j) => j.status === "done" && j.completedOn);
  const timed = done.filter((j) => j.dueOn);
  const costed = done.filter((j) => j.estimateEgp && j.actualEgp !== null);
  const rated = done.filter((j) => j.rating);
  return {
    jobs: mine.length, done: done.length, open: mine.filter((j) => !["done", "cancelled"].includes(j.status)).length,
    onTimePct: timed.length ? Math.round((timed.filter((j) => j.completedOn! <= j.dueOn!).length / timed.length) * 100) : null,
    avgDays: done.length ? Math.round(done.reduce((s, j) => s + days(j.createdAt.toISOString().slice(0, 10), j.completedOn!), 0) / done.length) : null,
    costVariancePct: money && costed.length ? Math.round((costed.reduce((s, j) => s + (j.actualEgp! - j.estimateEgp!) / j.estimateEgp!, 0) / costed.length) * 1000) / 10 : null,
    rating: rated.length ? Math.round((rated.reduce((s, j) => s + j.rating!, 0) / rated.length) * 10) / 10 : null, ratings: rated.length,
  };
}

export async function listContractors(user: CurrentUser): Promise<ContractorView[] | null> {
  if (!can(user.role, "work.report") && user.role !== "analyst") return null;
  const money = can(user.role, "asset.income_costs.view");
  const d = await withSession(sess(user), async (tx) => ({ c: await tx.select().from(contractors).orderBy(asc(contractors.id)), w: await tx.select().from(workOrders) }));
  return d.c.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, trade: c.trade, email: c.email, active: c.active === 1, ...contractorStats(c, d.w, money) }));
}

const NewContractor = z.object({ name: z.string().trim().min(2).max(100), nameAr: z.string().trim().max(100).optional().default(""), trade: z.enum(TRADES), email: z.string().trim().email().max(120) });
export async function createContractor(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = NewContractor.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const all = await withSession(sess(user), (tx) => tx.select({ id: contractors.id, name: contractors.name }).from(contractors));
  if (all.some((c) => c.name.toLowerCase() === p.data.name.toLowerCase())) return { ok: false, error: "taken" };
  const id = `CT-${String(Math.max(0, ...all.map((c) => Number(c.id.slice(3)))) + 1).padStart(3, "0")}`;
  await withSession(sess(user), (tx) => tx.insert(contractors).values({ id, name: p.data.name, nameAr: p.data.nameAr || p.data.name, trade: p.data.trade, email: p.data.email, active: 1, createdAt: new Date() }));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "contractor.create", entity: "contractor", entityId: id, detail: { name: p.data.name, trade: p.data.trade } });
  return { ok: true, id };
}

/** Put a contractor on a job (or take them off). The work order's timeline records it. */
export async function assignContractor(user: CurrentUser, workId: string, contractorId: string | null): Promise<{ ok: true } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  return withSession(sess(user), async (tx) => {
    const [w] = await tx.select().from(workOrders).where(eq(workOrders.id, String(workId)));
    if (!w) return { ok: false as const, error: "not_found" as const };
    if (w.status === "done" || w.status === "cancelled") return { ok: false as const, error: "closed" as const };
    const c = contractorId ? (await tx.select().from(contractors).where(eq(contractors.id, String(contractorId))))[0] : null;
    if (contractorId && !c) return { ok: false as const, error: "invalid" as const };
    await tx.update(workOrders).set({ contractorId: c?.id ?? null, vendor: c?.name ?? "", updatedAt: new Date() }).where(eq(workOrders.id, w.id));
    await tx.insert(workOrderEvents).values({ id: `WE-${randomBytes(5).toString("hex")}`, workOrderId: w.id, kind: "assigned", text: "", detail: { assigneeId: w.assigneeId, vendor: c?.name ?? "" }, actorId: user.id, at: new Date() });
    return { ok: true as const };
  });
}

/** Rate a finished job 1 to 5. It counts towards the contractor's rating. */
export async function rateWork(user: CurrentUser, workId: string, rating: number): Promise<{ ok: true; auditSeq: number } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { ok: false, error: "invalid" };
  const w = await withSession(sess(user), async (tx) => (await tx.select().from(workOrders).where(eq(workOrders.id, String(workId))))[0]);
  if (!w) return { ok: false, error: "not_found" };
  if (w.status !== "done" || !w.contractorId) return { ok: false, error: "closed" };
  await withSession(sess(user), (tx) => tx.update(workOrders).set({ rating: r, ratedBy: user.id }).where(eq(workOrders.id, w.id)));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "work.rate", entity: "work_order", entityId: w.id, detail: { contractorId: w.contractorId, rating: r } });
  return { ok: true, auditSeq: ev.seq };
}

// ---------------------------------------------------------------- inspections

export const INSPECTION_KINDS = ["routine", "safety", "move_in", "move_out", "handover"] as const;
export interface Finding { area: string; severity: "low" | "medium" | "high"; note: string; workOrderId: string | null }

export async function listInspections(user: CurrentUser, assetId?: string) {
  if (!can(user.role, "asset.view")) return null;
  const d = await withSession(sess(user), async (tx) => ({
    i: await tx.select().from(inspections).where(assetId ? eq(inspections.assetId, assetId) : undefined).orderBy(desc(inspections.scheduledOn)),
    a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
    u: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr, role: users.role, status: users.status }).from(users),
    c: await tx.select({ id: contractors.id, name: contractors.name, nameAr: contractors.nameAr }).from(contractors),
  }));
  return {
    items: d.i.map((x) => ({ ...x, findings: (x.findings as Finding[]) ?? [], overdue: x.status === "scheduled" && x.scheduledOn < DEMO_TODAY, asset: d.a.find((a) => a.id === x.assetId) ?? null, inspector: d.u.find((u) => u.id === x.inspectorId) ?? null, contractor: d.c.find((c) => c.id === x.contractorId) ?? null })),
    assets: d.a, managers: d.u.filter((u) => u.role === "manager" && u.status !== "deactivated"), contractors: d.c,
  };
}

const Schedule = z.object({ assetId: z.string().regex(/^A-\d{3}$/), kind: z.enum(INSPECTION_KINDS), scheduledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), inspectorId: z.string().max(40), contractorId: z.union([z.literal(""), z.string().max(20)]).optional().default(""), notes: z.string().trim().max(500).optional().default("") });

export async function scheduleInspection(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Schedule.safeParse(raw);
  if (!p.success || p.data.scheduledOn < DEMO_TODAY) return { ok: false, error: "invalid" };
  const list = (await listInspections(user))!;
  if (!list.assets.some((a) => a.id === p.data.assetId) || !list.managers.some((m) => m.id === p.data.inspectorId)) return { ok: false, error: "invalid" };
  if (p.data.contractorId && !list.contractors.some((c) => c.id === p.data.contractorId)) return { ok: false, error: "invalid" };
  const id = `IS-${String(Math.max(0, ...list.items.map((x) => Number(x.id.slice(3)))) + 1).padStart(3, "0")}`;
  await withSession(sess(user), (tx) => tx.insert(inspections).values({ id, assetId: p.data.assetId, kind: p.data.kind, scheduledOn: p.data.scheduledOn, inspectorId: p.data.inspectorId, contractorId: p.data.contractorId || null, status: "scheduled", findings: [], notes: p.data.notes, createdBy: user.id, createdAt: new Date() }));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "inspection.schedule", entity: "inspection", entityId: id, detail: { assetId: p.data.assetId, kind: p.data.kind, on: p.data.scheduledOn } });
  await notify({ to: { users: [p.data.inspectorId] }, kind: "inspection_assigned", params: { id, asset: p.data.assetId, date: p.data.scheduledOn }, link: "/maintenance/inspections", actorId: user.id });
  return { ok: true, id };
}

const Record = z.object({
  result: z.enum(["pass", "issues", "fail"]), notes: z.string().trim().max(1000).optional().default(""),
  findings: z.array(z.object({ area: z.string().trim().min(2).max(80), severity: z.enum(["low", "medium", "high"]), note: z.string().trim().min(3).max(300), createWork: z.boolean().optional().default(false) })).max(20).default([]),
});

/** Record what an inspection found. Each finding can become a maintenance request in the same step. */
export async function recordInspection(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; created: string[]; auditSeq: number } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Record.safeParse(raw);
  if (!p.success || (p.data.result !== "pass" && !p.data.findings.length)) return { ok: false, error: "invalid" };
  const [ins] = await withSession(sess(user), (tx) => tx.select().from(inspections).where(eq(inspections.id, String(id))));
  if (!ins) return { ok: false, error: "not_found" };
  if (ins.status !== "scheduled") return { ok: false, error: "closed" };
  const created: string[] = [];
  const findings: Finding[] = [];
  for (const f of p.data.findings) {
    let workOrderId: string | null = null;
    if (f.createWork) {
      const w = await createWork(user, { kind: "maintenance", assetId: ins.assetId, title: `${f.area}: ${f.note}`.slice(0, 120), description: `From inspection ${ins.id}.`, category: "other", priority: f.severity === "high" ? "high" : "normal" });
      if (w.ok) { workOrderId = w.id; created.push(w.id); }
    }
    findings.push({ area: f.area, severity: f.severity, note: f.note, workOrderId });
  }
  await withSession(sess(user), (tx) => tx.update(inspections).set({ status: "done", result: p.data.result, findings, notes: p.data.notes || ins.notes, doneOn: DEMO_TODAY }).where(eq(inspections.id, ins.id)));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "inspection.record", entity: "inspection", entityId: ins.id, detail: { result: p.data.result, findings: findings.length, workOrders: created } });
  return { ok: true, created, auditSeq: ev.seq };
}

// ---------------------------------------------------------------- utilities

export const UTILITIES = ["electricity", "water", "gas"] as const;
export const UTILITY_UNIT = { electricity: "kWh", water: "m³", gas: "m³" } as const;
export interface Period { from: string; to: string; use: number; costEgp: number | null; anomaly: boolean }

/** Consumption between consecutive readings; a period more than half again above the average of the three before it is flagged. */
export function consumption(readings: { readOn: string; reading: number; costEgp: number | null }[]): Period[] {
  const r = [...readings].sort((a, b) => a.readOn.localeCompare(b.readOn));
  const out: Period[] = [];
  for (let i = 1; i < r.length; i++) {
    const use = Math.round((r[i].reading - r[i - 1].reading) * 100) / 100;
    const prev = out.slice(-3).map((p) => p.use);
    const avg = prev.length === 3 ? prev.reduce((s, x) => s + x, 0) / 3 : null;
    out.push({ from: r[i - 1].readOn, to: r[i].readOn, use, costEgp: r[i].costEgp, anomaly: avg !== null && use > avg * 1.5 });
  }
  return out;
}

export async function listUtilities(user: CurrentUser) {
  if (!can(user.role, "asset.view") || user.role === "investor") return null;
  const d = await withSession(sess(user), async (tx) => ({ r: await tx.select().from(utilityReadings).orderBy(asc(utilityReadings.readOn)), a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets) }));
  const keys = [...new Set(d.r.map((x) => `${x.assetId}|${x.utility}`))];
  return {
    meters: keys.map((k) => {
      const [assetId, utility] = k.split("|");
      const rs = d.r.filter((x) => x.assetId === assetId && x.utility === utility).map((x) => ({ readOn: x.readOn, reading: Number(x.reading), costEgp: x.costEgp }));
      const periods = consumption(rs);
      return { assetId, utility: utility as (typeof UTILITIES)[number], asset: d.a.find((a) => a.id === assetId) ?? null, last: rs.at(-1) ?? null, periods, anomalies: periods.filter((p) => p.anomaly).length, yearCostEgp: periods.reduce((s, p) => s + (p.costEgp ?? 0), 0) };
    }),
    assets: d.a,
  };
}

const Reading = z.object({ assetId: z.string().regex(/^A-\d{3}$/), utility: z.enum(UTILITIES), readOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reading: z.coerce.number().positive().max(1e10), costEgp: z.union([z.literal(""), z.coerce.number().int().min(0).max(1e9)]).optional().default("") });

/** Record a meter reading. It must be later, and not lower, than the last reading of the same meter. */
export async function addReading(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; anomaly: boolean } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Reading.safeParse(raw);
  if (!p.success || p.data.readOn > DEMO_TODAY) return { ok: false, error: "invalid" };
  const prev = await withSession(sess(user), (tx) => tx.select().from(utilityReadings).where(eq(utilityReadings.assetId, p.data.assetId)));
  const same = prev.filter((x) => x.utility === p.data.utility).sort((a, b) => a.readOn.localeCompare(b.readOn));
  const last = same.at(-1);
  if (last && (p.data.readOn <= last.readOn || p.data.reading < Number(last.reading))) return { ok: false, error: "lower" };
  const id = `UR-${randomBytes(5).toString("hex")}`;
  await withSession(sess(user), (tx) => tx.insert(utilityReadings).values({ id, assetId: p.data.assetId, utility: p.data.utility, readOn: p.data.readOn, reading: String(p.data.reading), costEgp: p.data.costEgp === "" ? null : p.data.costEgp, recordedBy: user.id, createdAt: new Date() }));
  const periods = consumption([...same.map((x) => ({ readOn: x.readOn, reading: Number(x.reading), costEgp: x.costEgp })), { readOn: p.data.readOn, reading: p.data.reading, costEgp: null }]);
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "utility.reading", entity: "utility_reading", entityId: id, detail: { assetId: p.data.assetId, utility: p.data.utility, reading: p.data.reading } });
  return { ok: true, id, anomaly: periods.at(-1)?.anomaly ?? false };
}

// ---------------------------------------------------------------- capital works

export const CAPEX_CATEGORIES = ["roof", "mep", "facade", "interior", "lift", "solar", "landscape", "other"] as const;

export async function listCapex(user: CurrentUser) {
  if (!can(user.role, "asset.view") || user.role === "investor") return null;
  const d = await withSession(sess(user), async (tx) => ({
    x: await tx.select().from(capexItems).orderBy(desc(capexItems.createdAt)),
    a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
    u: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users),
    c: await tx.select({ id: contractors.id, name: contractors.name, nameAr: contractors.nameAr }).from(contractors),
  }));
  const items = d.x.map((x) => ({ ...x, asset: d.a.find((a) => a.id === x.assetId) ?? null, proposer: d.u.find((u) => u.id === x.proposedBy) ?? null, decider: d.u.find((u) => u.id === x.decidedBy) ?? null, contractor: d.c.find((c) => c.id === x.contractorId) ?? null, overBudget: x.spentEgp > x.budgetEgp }));
  const live = items.filter((x) => ["approved", "in_progress", "done"].includes(x.status));
  return { items, assets: d.a, contractors: d.c, totals: { approvedBudget: live.reduce((s, x) => s + x.budgetEgp, 0), spent: live.reduce((s, x) => s + x.spentEgp, 0), awaiting: items.filter((x) => x.status === "proposed").length } };
}

const Propose = z.object({ assetId: z.string().regex(/^A-\d{3}$/), title: z.string().trim().min(4).max(120), titleAr: z.string().trim().max(120).optional().default(""), category: z.enum(CAPEX_CATEGORIES), budgetEgp: z.coerce.number().int().positive().max(1e11), usefulLifeYears: z.union([z.literal(""), z.coerce.number().int().min(1).max(60)]).optional().default(""), expectedUpliftEgp: z.union([z.literal(""), z.coerce.number().int().min(0).max(1e11)]).optional().default(""), startOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().default(""), contractorId: z.union([z.literal(""), z.string().max(20)]).optional().default(""), note: z.string().trim().max(500).optional().default("") });

/** Propose capital works. Another manager approves or rejects them. */
export async function proposeCapex(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Propose.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const all = await withSession(sess(user), (tx) => tx.select({ id: capexItems.id }).from(capexItems));
  const id = `CX-${String(Math.max(0, ...all.map((c) => Number(c.id.slice(3)))) + 1).padStart(3, "0")}`;
  try {
    await withSession(sess(user), (tx) => tx.insert(capexItems).values({ id, assetId: v.assetId, title: v.title, titleAr: v.titleAr || null, category: v.category, status: "proposed", budgetEgp: v.budgetEgp, spentEgp: 0, usefulLifeYears: v.usefulLifeYears === "" ? null : v.usefulLifeYears, expectedUpliftEgp: v.expectedUpliftEgp === "" ? null : v.expectedUpliftEgp, startOn: v.startOn || null, contractorId: v.contractorId || null, proposedBy: user.id, note: v.note, createdAt: new Date() }));
  } catch { return { ok: false, error: "invalid" }; }
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "capex.propose", entity: "capex", entityId: id, detail: { assetId: v.assetId, budgetEgp: v.budgetEgp, category: v.category } });
  await notify({ to: { roles: ["manager"] }, kind: "approval_request", params: { id, what: "capex" }, link: "/maintenance/capex", actorId: user.id });
  return { ok: true, id };
}

/** Approve or reject proposed capital works: a different manager from the one who proposed them. */
export async function decideCapex(user: CurrentUser, id: string, decision: "approve" | "reject", note = ""): Promise<{ ok: true; auditSeq: number } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  if (decision !== "approve" && decision !== "reject") return { ok: false, error: "invalid" };
  const [x] = await withSession(sess(user), (tx) => tx.select().from(capexItems).where(eq(capexItems.id, String(id))));
  if (!x) return { ok: false, error: "not_found" };
  if (x.status !== "proposed") return { ok: false, error: "closed" };
  if (x.proposedBy === user.id) return { ok: false, error: "own" };
  if (decision === "reject" && String(note).trim().length < 5) return { ok: false, error: "invalid" };
  await withSession(sess(user), (tx) => tx.update(capexItems).set({ status: decision === "approve" ? "approved" : "rejected", decidedBy: user.id, note: String(note).trim() || x.note }).where(eq(capexItems.id, x.id)));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: decision === "approve" ? "capex.approve" : "capex.reject", entity: "capex", entityId: x.id, detail: { budgetEgp: x.budgetEgp, note: String(note).trim() || undefined } });
  await notify({ to: { users: [x.proposedBy] }, kind: "approval_decided", params: { id: x.id, outcome: decision === "approve" ? "approved" : "rejected" }, link: "/maintenance/capex", actorId: user.id });
  return { ok: true, auditSeq: ev.seq };
}

const Progress = z.object({ status: z.enum(["in_progress", "done"]), spentEgp: z.coerce.number().int().min(0).max(1e11) });

/** Record progress: started, money spent, finished. Only approved or running works move on. */
export async function updateCapex(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; overBudget: boolean } | { ok: false; error: OpsError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Progress.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const [x] = await withSession(sess(user), (tx) => tx.select().from(capexItems).where(eq(capexItems.id, String(id))));
  if (!x) return { ok: false, error: "not_found" };
  if (!["approved", "in_progress"].includes(x.status)) return { ok: false, error: "closed" };
  if (p.data.spentEgp < x.spentEgp) return { ok: false, error: "lower" };
  await withSession(sess(user), (tx) => tx.update(capexItems).set({ status: p.data.status, spentEgp: p.data.spentEgp, startOn: x.startOn ?? DEMO_TODAY, completedOn: p.data.status === "done" ? DEMO_TODAY : null }).where(eq(capexItems.id, x.id)));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: p.data.status === "done" ? "capex.complete" : "capex.progress", entity: "capex", entityId: x.id, detail: { spentEgp: p.data.spentEgp, budgetEgp: x.budgetEgp } });
  return { ok: true, overBudget: p.data.spentEgp > x.budgetEgp };
}

