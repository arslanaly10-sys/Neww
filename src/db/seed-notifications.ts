import type { DB } from "./client";
import * as t from "./schema";

/** A few notifications per person, so each inbox has something real to show on first sign-in. */
export async function seedNotifications(db: DB) {
  const n = (id: string, userId: string, kind: string, category: string, params: Record<string, string | number>, link: string, at: string, read = false) =>
    ({ id, userId, kind, category, params, link, actorId: null, createdAt: new Date(at), readAt: read ? new Date(at) : null });
  await db.insert(t.notifications).values([
    n("N-seed-01", "u-manager-1", "approval_request", "approvals", { id: "V-0016", what: "valuation" }, "/valuation#queue", "2026-11-09T09:05:00Z"),
    n("N-seed-02", "u-manager-1", "work_reported", "work", { id: "WO-003", title: "Water leak under kitchen sink" }, "/maintenance/WO-003", "2026-11-05T10:00:00Z"),
    n("N-seed-03", "u-manager-1", "work_assigned", "work", { id: "WO-005", title: "Shopfront shutter jammed" }, "/maintenance/WO-005", "2026-11-07T11:00:00Z"),
    n("N-seed-04", "u-manager-1", "report_ready", "reports", { name: "Monthly investor workbook", file: "zmnhoof-investor-2026-11-01-en.xlsx" }, "/reports#scheduled", "2026-11-01T06:00:00Z", true),
    n("N-seed-05", "u-manager-2", "approval_request", "approvals", { id: "U-012", what: "update" }, "/overview/alerts", "2026-11-10T08:30:00Z"),
    n("N-seed-06", "u-manager-2", "work_assigned", "work", { id: "WO-004", title: "Lobby lighting flickering" }, "/maintenance/WO-004", "2026-11-06T09:00:00Z"),
    n("N-seed-07", "u-investor", "distribution_paid", "finance", { id: "DS-002", period: "2026-Q2", amount: "11,120,000" }, "/finance", "2026-07-21T12:00:00Z", true),
    n("N-seed-08", "u-investor", "work_completed", "work", { id: "WO-001", title: "Lift overhaul after inspection" }, "/maintenance/WO-001", "2026-09-09T16:00:00Z"),
    n("N-seed-09", "u-admin", "lead_new", "sales", { name: "Hana Mostafa", company: "Mostafa Holdings (fictional)" }, "/governance#outbox", "2026-11-11T15:20:00Z"),
  ]);
}
