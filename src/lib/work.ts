import "server-only";
import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assets, users, workOrderEvents, workOrders } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { addLedgerEntry } from "./finance";
import { DEMO_TODAY } from "./assumptions";
import type { CurrentUser } from "./session";
import { notify } from "./notify";

/**
 * Maintenance and tasks. Everyone who can see assets sees the work on them; investors may report a maintenance
 * request and add notes, and never see costs. Managers assign, schedule, move and complete work. Completing a
 * maintenance job with a cost writes that cost to the finance ledger, so the books and the work stay in step.
 */
export const STATUSES = ["open", "in_progress", "on_hold", "done", "cancelled"] as const;
export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export const WORK_CATEGORIES = ["plumbing", "electrical", "hvac", "lift", "structural", "cleaning", "admin", "other"] as const;
export type WorkStatus = (typeof STATUSES)[number];
const ACTIVE: string[] = ["open", "in_progress", "on_hold"];
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

/** Overdue: still active and past its due date. */
export const isOverdue = (w: { status: string; dueOn: string | null }, today = DEMO_TODAY) => ACTIVE.includes(w.status) && !!w.dueOn && w.dueOn < today;
const PRI_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
/** Board order inside a column: overdue first, then priority, then the soonest due date. */
export const boardOrder = <T extends { status: string; dueOn: string | null; priority: string }>(a: T, b: T) =>
  Number(isOverdue(b)) - Number(isOverdue(a)) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");

export interface WorkView {
  id: string; kind: string; assetId: string | null; assetName: string | null; assetNameAr: string | null; title: string; description: string; category: string; priority: string; status: WorkStatus;
  assigneeId: string | null; assigneeName: string | null; assigneeNameAr: string | null; vendor: string; dueOn: string | null; overdue: boolean;
  estimateEgp: number | null; actualEgp: number | null; ledgerEntryId: string | null; reportedBy: string; reporterName: string; reporterNameAr: string; createdAt: string; completedOn: string | null;
}

async function load(user: CurrentUser) {
  return withSession(sess(user), async (tx) => ({
    w: await tx.select().from(workOrders).orderBy(asc(workOrders.id)),
    a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
    u: (await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr, role: users.role, status: users.status }).from(users)),
  }));
}

export async function listWork(user: CurrentUser) {
  if (!can(user.role, "work.report")) return null;
  const money = can(user.role, "work.manage");
  const d = await load(user);
  const a = new Map(d.a.map((x) => [x.id, x]));
  const u = new Map(d.u.map((x) => [x.id, x]));
  const items: WorkView[] = d.w.map((w) => ({
    id: w.id, kind: w.kind, assetId: w.assetId, assetName: w.assetId ? a.get(w.assetId)?.name ?? null : null, assetNameAr: w.assetId ? a.get(w.assetId)?.nameAr ?? null : null,
    title: w.title, description: w.description, category: w.category, priority: w.priority, status: w.status as WorkStatus,
    assigneeId: w.assigneeId, assigneeName: w.assigneeId ? u.get(w.assigneeId)?.name ?? null : null, assigneeNameAr: w.assigneeId ? u.get(w.assigneeId)?.nameAr ?? null : null,
    vendor: w.vendor, dueOn: w.dueOn, overdue: isOverdue(w), estimateEgp: money ? w.estimateEgp : null, actualEgp: money ? w.actualEgp : null, ledgerEntryId: money ? w.ledgerEntryId : null,
    reportedBy: w.reportedBy, reporterName: u.get(w.reportedBy)?.name ?? w.reportedBy, reporterNameAr: u.get(w.reportedBy)?.nameAr ?? w.reportedBy,
    createdAt: w.createdAt.toISOString(), completedOn: w.completedOn,
  }));
  const managers = d.u.filter((x) => x.role === "manager" && x.status !== "deactivated").map((x) => ({ id: x.id, name: x.name, nameAr: x.nameAr }));
  return { items, money, managers, assets: d.a };
}

export async function getWorkOrder(user: CurrentUser, id: string) {
  const all = await listWork(user);
  const w = all?.items.find((x) => x.id === id);
  if (!all || !w) return null;
  const ev = await withSession(sess(user), (tx) => tx.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderId, id)).orderBy(asc(workOrderEvents.at)));
  const d = await load(user);
  const u = new Map(d.u.map((x) => [x.id, x]));
  const events = ev.map((e) => {
    const detail = { ...(e.detail as Record<string, unknown>) };
    if (!all.money) { delete detail.actualEgp; delete detail.estimateEgp; }
    return { id: e.id, kind: e.kind, text: e.text, detail, at: e.at.toISOString(), actorName: u.get(e.actorId)?.name ?? e.actorId, actorNameAr: u.get(e.actorId)?.nameAr ?? e.actorId };
  });
  return { work: w, events, managers: all.managers, money: all.money };
}

export type WorkError = "forbidden" | "invalid" | "not_found" | "closed";
const event = (workOrderId: string, actorId: string, kind: string, text = "", detail: Record<string, unknown> = {}) => ({ id: `WE-${randomBytes(5).toString("hex")}`, workOrderId, actorId, kind, text, detail, at: new Date() });

const Create = z.object({
  kind: z.enum(["maintenance", "task"]).default("maintenance"),
  assetId: z.union([z.literal(""), z.string().regex(/^A-\d{3}$/)]).optional(),
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(WORK_CATEGORIES),
  priority: z.enum(PRIORITIES).default("normal"),
  assigneeId: z.union([z.literal(""), z.string().max(40)]).optional(),
  dueOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  estimateEgp: z.union([z.literal(""), z.coerce.number().int().positive().max(1e10)]).optional(),
});

export async function createWork(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: WorkError }> {
  if (!can(user.role, "work.report")) return { ok: false, error: "forbidden" };
  const p = Create.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const manager = can(user.role, "work.manage");
  const v = p.data;
  // A maintenance request needs an asset; investors report maintenance only, at normal priority, unassigned.
  if (v.kind === "maintenance" && !v.assetId) return { ok: false, error: "invalid" };
  if (!manager && (v.kind !== "maintenance" || v.priority !== "normal" || v.assigneeId || v.dueOn || v.estimateEgp)) return { ok: false, error: "forbidden" };
  if (v.dueOn && v.dueOn < DEMO_TODAY) return { ok: false, error: "invalid" };
  const list = await listWork(user);
  if (v.assigneeId && !list!.managers.some((m) => m.id === v.assigneeId)) return { ok: false, error: "invalid" };
  const next = Math.max(0, ...list!.items.map((x) => Number(x.id.slice(3)))) + 1;
  const id = `WO-${String(next).padStart(3, "0")}`;
  const now = new Date();
  await withSession(sess(user), async (tx) => {
    await tx.insert(workOrders).values({
      id, kind: v.kind, assetId: v.assetId || null, title: v.title, description: v.description, category: v.category, priority: v.priority, status: "open",
      assigneeId: v.assigneeId || null, vendor: "", dueOn: v.dueOn || null, estimateEgp: v.estimateEgp === "" || v.estimateEgp === undefined ? null : v.estimateEgp,
      reportedBy: user.id, createdAt: now, updatedAt: now,
    });
    await tx.insert(workOrderEvents).values(event(id, user.id, "created", "", { priority: v.priority }));
  });
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "work.create", entity: "work_order", entityId: id, detail: { kind: v.kind, assetId: v.assetId || null, priority: v.priority, category: v.category } });
  if (!manager) await notify({ to: { roles: ["manager"] }, kind: "work_reported", params: { id, title: v.title }, link: `/maintenance/${id}`, actorId: user.id });
  if (v.assigneeId) await notify({ to: { users: [v.assigneeId] }, kind: "work_assigned", params: { id, title: v.title }, link: `/maintenance/${id}`, actorId: user.id });
  return { ok: true, id, auditSeq: ev.seq };
}

const Update = z.object({
  status: z.enum(["open", "in_progress", "on_hold", "cancelled"]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.union([z.literal(""), z.string().max(40)]).optional(),
  vendor: z.string().trim().max(120).optional(),
  dueOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  estimateEgp: z.union([z.literal(""), z.coerce.number().int().positive().max(1e10)]).optional(),
});

/** Change status, priority, assignment, due date or estimate. Each change becomes one timeline entry. */
export async function updateWork(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; changed: string[]; auditSeq: number | null } | { ok: false; error: WorkError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Update.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const list = (await listWork(user))!;
  const cur = list.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  if (cur.status === "done" || cur.status === "cancelled") return { ok: false, error: "closed" };
  if (v.assigneeId && !list.managers.some((m) => m.id === v.assigneeId)) return { ok: false, error: "invalid" };
  const set: Partial<typeof workOrders.$inferInsert> = {};
  const evs: ReturnType<typeof event>[] = [];
  if (v.status && v.status !== cur.status) { set.status = v.status; evs.push(event(id, user.id, "status", "", { from: cur.status, to: v.status })); }
  if (v.priority && v.priority !== cur.priority) { set.priority = v.priority; evs.push(event(id, user.id, "priority", "", { from: cur.priority, to: v.priority })); }
  const assignee = v.assigneeId === undefined ? cur.assigneeId : v.assigneeId || null;
  const vendor = v.vendor === undefined ? cur.vendor : v.vendor;
  if (assignee !== cur.assigneeId || vendor !== cur.vendor) { set.assigneeId = assignee; set.vendor = vendor; evs.push(event(id, user.id, "assigned", "", { assigneeId: assignee, vendor })); }
  const due = v.dueOn === undefined ? cur.dueOn : v.dueOn || null;
  if (due !== cur.dueOn) { set.dueOn = due; evs.push(event(id, user.id, "due", "", { from: cur.dueOn, to: due })); }
  const est = v.estimateEgp === undefined ? cur.estimateEgp : v.estimateEgp === "" ? null : v.estimateEgp;
  if (est !== cur.estimateEgp) { set.estimateEgp = est; evs.push(event(id, user.id, "estimate", "", { estimateEgp: est })); }
  if (!evs.length) return { ok: true, changed: [], auditSeq: null };
  await withSession(sess(user), async (tx) => {
    await tx.update(workOrders).set({ ...set, updatedAt: new Date() }).where(eq(workOrders.id, id));
    await tx.insert(workOrderEvents).values(evs);
  });
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "work.update", entity: "work_order", entityId: id, detail: { changes: evs.map((e) => ({ kind: e.kind, ...e.detail })) } });
  if (assignee && assignee !== cur.assigneeId) await notify({ to: { users: [assignee] }, kind: "work_assigned", params: { id, title: cur.title }, link: `/maintenance/${id}`, actorId: user.id });
  return { ok: true, changed: evs.map((e) => e.kind), auditSeq: ev.seq };
}

const Complete = z.object({ actualEgp: z.union([z.literal(""), z.coerce.number().int().min(0).max(1e10)]).optional(), note: z.string().trim().max(500).default("") });

/** Mark work done. A maintenance job's actual cost is written to the finance ledger as a maintenance line. */
export async function completeWork(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; ledgerEntryId: string | null; auditSeq: number } | { ok: false; error: WorkError }> {
  if (!can(user.role, "work.manage")) return { ok: false, error: "forbidden" };
  const p = Complete.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const cur = (await listWork(user))!.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  if (cur.status === "done" || cur.status === "cancelled") return { ok: false, error: "closed" };
  const cost = p.data.actualEgp === "" || p.data.actualEgp === undefined ? null : p.data.actualEgp;
  let ledgerEntryId: string | null = null;
  if (cost && cur.kind === "maintenance") {
    const r = await addLedgerEntry(user, { category: "maintenance", amountEgp: cost, entryDate: DEMO_TODAY, assetId: cur.assetId ?? "", memo: `${cur.id}: ${cur.title}`.slice(0, 200) });
    if (!r.ok) return { ok: false, error: "invalid" };
    ledgerEntryId = r.id;
  }
  await withSession(sess(user), async (tx) => {
    await tx.update(workOrders).set({ status: "done", actualEgp: cost, ledgerEntryId, completedOn: DEMO_TODAY, updatedAt: new Date() }).where(eq(workOrders.id, id));
    await tx.insert(workOrderEvents).values(event(id, user.id, "completed", p.data.note, { actualEgp: cost, ledgerEntryId }));
  });
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "work.complete", entity: "work_order", entityId: id, detail: { actualEgp: cost, ledgerEntryId, estimateEgp: cur.estimateEgp } });
  await notify({ to: { users: [cur.reportedBy] }, kind: "work_completed", params: { id, title: cur.title }, link: `/maintenance/${id}`, actorId: user.id });
  return { ok: true, ledgerEntryId, auditSeq: ev.seq };
}

/** A note on the timeline. Investors and managers alike; notes are never edited. */
export async function addWorkNote(user: CurrentUser, id: string, text: string): Promise<{ ok: true } | { ok: false; error: WorkError }> {
  if (!can(user.role, "work.report")) return { ok: false, error: "forbidden" };
  const t = String(text ?? "").trim();
  if (t.length < 2 || t.length > 1000) return { ok: false, error: "invalid" };
  const cur = (await listWork(user))!.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  await withSession(sess(user), (tx) => tx.insert(workOrderEvents).values(event(id, user.id, "note", t)));
  return { ok: true };
}
