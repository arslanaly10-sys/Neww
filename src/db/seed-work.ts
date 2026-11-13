import type { DB } from "./client";
import * as t from "./schema";

/**
 * Maintenance and task sample data: work orders across the portfolio in every state, two of them overdue, one
 * reported by the investor, and finished ones carrying their cost (the lift overhaul is the ledger line already seeded).
 */
type Seed = {
  kind: "maintenance" | "task"; assetId: string | null; title: string; description: string; category: string; priority: string; status: string;
  assigneeId: string | null; vendor?: string; dueOn: string | null; estimateEgp?: number; actualEgp?: number; ledgerEntryId?: string;
  reportedBy: string; created: string; completedOn?: string; notes?: [string, string, string][]; // [actor, date, text]
};

const W: Seed[] = [
  { kind: "maintenance", assetId: "A-005", title: "Lift overhaul after inspection", description: "Inspector flagged worn hoist ropes and a slow door sensor.", category: "lift", priority: "high", status: "done", assigneeId: "u-manager-2", vendor: "Nile Lifts (fictional)", dueOn: "2026-09-15", estimateEgp: 200_000, actualEgp: 212_000, ledgerEntryId: "LE-seed-04", reportedBy: "u-manager-2", created: "2026-08-28", completedOn: "2026-09-09", notes: [["u-manager-2", "2026-09-09", "Ropes replaced, sensor recalibrated, certificate issued."]] },
  { kind: "maintenance", assetId: "A-002", title: "Air conditioning failing on floor 6", description: "Tenant reports two of four units blowing warm air.", category: "hvac", priority: "urgent", status: "in_progress", assigneeId: "u-manager-1", vendor: "CoolAir Services (fictional)", dueOn: "2026-11-14", estimateEgp: 85_000, reportedBy: "u-manager-1", created: "2026-11-09", notes: [["u-manager-1", "2026-11-10", "Technician visited; compressor part ordered, arriving Thursday."]] },
  { kind: "maintenance", assetId: "A-014", title: "Water leak under kitchen sink", description: "Slow leak, cabinet floor swollen.", category: "plumbing", priority: "high", status: "open", assigneeId: null, dueOn: "2026-11-08", estimateEgp: 9_000, reportedBy: "u-investor", created: "2026-11-05" },
  { kind: "maintenance", assetId: "A-009", title: "Lobby lighting flickering", description: "", category: "electrical", priority: "normal", status: "open", assigneeId: "u-manager-2", dueOn: "2026-11-20", estimateEgp: 6_500, reportedBy: "u-manager-2", created: "2026-11-06" },
  { kind: "maintenance", assetId: "A-020", title: "Shopfront shutter jammed", description: "Shutter will not close fully; security risk overnight.", category: "structural", priority: "urgent", status: "open", assigneeId: "u-manager-1", vendor: "Delta Doors (fictional)", dueOn: "2026-11-10", estimateEgp: 14_000, reportedBy: "u-manager-1", created: "2026-11-07" },
  { kind: "maintenance", assetId: "A-011", title: "Roof waterproofing before winter", description: "Membrane cracked at two drains.", category: "structural", priority: "normal", status: "on_hold", assigneeId: "u-manager-2", vendor: "", dueOn: "2026-12-15", estimateEgp: 160_000, reportedBy: "u-manager-2", created: "2026-10-20", notes: [["u-manager-2", "2026-10-28", "On hold until the building association approves the shared roof works."]] },
  { kind: "maintenance", assetId: "A-001", title: "Deep clean before new tenant", description: "", category: "cleaning", priority: "low", status: "done", assigneeId: "u-manager-1", vendor: "Sparkle Cairo (fictional)", dueOn: "2026-10-30", estimateEgp: 7_000, actualEgp: 6_800, reportedBy: "u-manager-1", created: "2026-10-22", completedOn: "2026-10-29" },
  { kind: "maintenance", assetId: "A-017", title: "Intercom not working", description: "", category: "electrical", priority: "normal", status: "in_progress", assigneeId: "u-manager-2", dueOn: "2026-11-18", estimateEgp: 4_200, reportedBy: "u-manager-2", created: "2026-11-03" },
  { kind: "task", assetId: null, title: "Renew portfolio insurance", description: "Collect three quotes; the current policy ends 31 January.", category: "admin", priority: "high", status: "in_progress", assigneeId: "u-manager-1", dueOn: "2026-12-20", reportedBy: "u-manager-1", created: "2026-10-30" },
  { kind: "task", assetId: "A-025", title: "Chase missing title deed from the registry", description: "", category: "admin", priority: "high", status: "open", assigneeId: "u-manager-2", dueOn: "2026-11-30", reportedBy: "u-manager-2", created: "2026-11-02" },
  { kind: "task", assetId: null, title: "Prepare Q4 investor letter", description: "", category: "admin", priority: "normal", status: "open", assigneeId: "u-manager-1", dueOn: "2026-12-10", reportedBy: "u-manager-1", created: "2026-11-11" },
  { kind: "maintenance", assetId: "A-028", title: "Annual boiler service", description: "", category: "hvac", priority: "low", status: "open", assigneeId: null, dueOn: "2026-12-05", estimateEgp: 3_500, reportedBy: "u-manager-2", created: "2026-11-01" },
  { kind: "maintenance", assetId: "A-004", title: "Pool pump replacement", description: "", category: "plumbing", priority: "normal", status: "done", assigneeId: "u-manager-2", vendor: "AquaTech (fictional)", dueOn: "2026-10-15", estimateEgp: 28_000, actualEgp: 31_500, reportedBy: "u-manager-2", created: "2026-10-01", completedOn: "2026-10-12" },
  { kind: "maintenance", assetId: "A-010", title: "Repaint fire exit signage", description: "", category: "other", priority: "low", status: "cancelled", assigneeId: null, dueOn: null, reportedBy: "u-manager-1", created: "2026-09-18", notes: [["u-manager-1", "2026-09-25", "Cancelled: covered by the building's own fire-safety contract."]] },
];

export async function seedWork(db: DB) {
  const at = (d: string, h = 9) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
  await db.insert(t.workOrders).values(W.map((w, i) => ({
    id: `WO-${String(i + 1).padStart(3, "0")}`, kind: w.kind, assetId: w.assetId, title: w.title, description: w.description, category: w.category, priority: w.priority, status: w.status,
    assigneeId: w.assigneeId, vendor: w.vendor ?? "", dueOn: w.dueOn, estimateEgp: w.estimateEgp ?? null, actualEgp: w.actualEgp ?? null, ledgerEntryId: w.ledgerEntryId ?? null,
    reportedBy: w.reportedBy, createdAt: at(w.created), updatedAt: at(w.completedOn ?? w.notes?.at(-1)?.[1] ?? w.created, 15), completedOn: w.completedOn ?? null,
  })));
  const events: (typeof t.workOrderEvents.$inferInsert)[] = [];
  W.forEach((w, i) => {
    const id = `WO-${String(i + 1).padStart(3, "0")}`;
    events.push({ id: `WE-${id}-0`, workOrderId: id, kind: "created", text: "", detail: { priority: w.priority }, actorId: w.reportedBy, at: at(w.created) });
    if (w.assigneeId) events.push({ id: `WE-${id}-1`, workOrderId: id, kind: "assigned", text: "", detail: { assigneeId: w.assigneeId, vendor: w.vendor ?? "" }, actorId: w.assigneeId, at: at(w.created, 11) });
    (w.notes ?? []).forEach(([actor, d, text], k) => events.push({ id: `WE-${id}-n${k}`, workOrderId: id, kind: "note", text, detail: {}, actorId: actor, at: at(d, 12) }));
    if (w.status !== "open") events.push({ id: `WE-${id}-s`, workOrderId: id, kind: w.status === "done" ? "completed" : "status", text: "", detail: { status: w.status, actualEgp: w.actualEgp ?? null }, actorId: w.assigneeId ?? w.reportedBy, at: at(w.completedOn ?? w.notes?.at(-1)?.[1] ?? w.created, 16) });
  });
  await db.insert(t.workOrderEvents).values(events);
}
