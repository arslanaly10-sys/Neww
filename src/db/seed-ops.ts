import { eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";

/**
 * Operations sample data: contractors (linked to the work orders that already name them), ratings on finished jobs,
 * inspections past and planned, twelve months of meter readings for a few assets (with one deliberate spike), and
 * capital works at each stage.
 */
export async function seedOps(db: DB) {
  const at = (d: string) => new Date(`${d}T09:00:00Z`);
  const C: (typeof t.contractors.$inferInsert)[] = [
    { id: "CT-001", name: "Nile Lifts (fictional)", nameAr: "نايل للمصاعد (افتراضية)", trade: "lift", email: "service@nile-lifts.example", active: 1, createdAt: at("2023-02-01") },
    { id: "CT-002", name: "CoolAir Services (fictional)", nameAr: "كول إير للخدمات (افتراضية)", trade: "hvac", email: "jobs@coolair.example", active: 1, createdAt: at("2023-05-10") },
    { id: "CT-003", name: "AquaTech (fictional)", nameAr: "أكوا تك (افتراضية)", trade: "plumbing", email: "desk@aquatech.example", active: 1, createdAt: at("2023-09-20") },
    { id: "CT-004", name: "Sparkle Cairo (fictional)", nameAr: "سباركل القاهرة (افتراضية)", trade: "cleaning", email: "hello@sparkle-cairo.example", active: 1, createdAt: at("2024-01-15") },
    { id: "CT-005", name: "Delta Doors (fictional)", nameAr: "دلتا للأبواب (افتراضية)", trade: "general", email: "orders@delta-doors.example", active: 1, createdAt: at("2024-03-01") },
    { id: "CT-006", name: "SunRoof Solar (fictional)", nameAr: "صن روف للطاقة الشمسية (افتراضية)", trade: "solar", email: "projects@sunroof.example", active: 1, createdAt: at("2025-06-01") },
    { id: "CT-007", name: "Volt Electric (fictional)", nameAr: "فولت للكهرباء (افتراضية)", trade: "electrical", email: "team@volt-electric.example", active: 1, createdAt: at("2024-07-07") },
  ];
  await db.insert(t.contractors).values(C);
  // Link the work orders that already name a contractor, and rate the finished ones.
  const wos = await db.select().from(t.workOrders);
  for (const w of wos) {
    const c = C.find((x) => x.name === w.vendor);
    if (!c) continue;
    const n = Number(w.id.slice(3));
    await db.update(t.workOrders).set({ contractorId: c.id, ...(w.status === "done" ? { rating: [4, 5, 3, 4][n % 4], ratedBy: w.assigneeId ?? "u-manager-1" } : {}) }).where(eq(t.workOrders.id, w.id));
  }

  await db.insert(t.inspections).values([
    { id: "IS-001", assetId: "A-005", kind: "safety", scheduledOn: "2026-08-20", inspectorId: "u-manager-2", contractorId: "CT-001", status: "done", result: "issues", doneOn: "2026-08-20", notes: "Annual lift and fire inspection.", createdBy: "u-manager-2", createdAt: at("2026-08-01"),
      findings: [{ area: "Lift", severity: "high", note: "Hoist ropes worn; door sensor slow.", workOrderId: "WO-001" }, { area: "Fire exit", severity: "low", note: "Exit sign bulb out on level 2.", workOrderId: null }] },
    { id: "IS-002", assetId: "A-001", kind: "move_in", scheduledOn: "2026-06-01", inspectorId: "u-manager-1", contractorId: null, status: "done", result: "pass", doneOn: "2026-06-01", notes: "Move-in condition report signed with the tenant.", createdBy: "u-manager-1", createdAt: at("2026-05-25"), findings: [] },
    { id: "IS-003", assetId: "A-008", kind: "routine", scheduledOn: "2026-10-15", inspectorId: "u-manager-1", contractorId: null, status: "done", result: "issues", doneOn: "2026-10-16", notes: "Quarterly walk-through of common areas.", createdBy: "u-manager-1", createdAt: at("2026-10-01"),
      findings: [{ area: "Roof", severity: "medium", note: "Ponding water near the north drain.", workOrderId: null }, { area: "Lobby", severity: "low", note: "Two ceiling tiles stained.", workOrderId: null }] },
    { id: "IS-004", assetId: "A-002", kind: "routine", scheduledOn: "2026-11-15", inspectorId: "u-manager-1", contractorId: null, status: "scheduled", result: null, doneOn: null, notes: "", createdBy: "u-manager-1", createdAt: at("2026-11-01"), findings: [] },
    { id: "IS-005", assetId: "A-012", kind: "handover", scheduledOn: "2027-03-31", inspectorId: "u-manager-2", contractorId: null, status: "scheduled", result: null, doneOn: null, notes: "Snagging at handover from the developer.", createdBy: "u-manager-2", createdAt: at("2026-11-05"), findings: [] },
    { id: "IS-006", assetId: "A-014", kind: "safety", scheduledOn: "2026-12-03", inspectorId: "u-manager-2", contractorId: "CT-007", status: "scheduled", result: null, doneOn: null, notes: "Electrical safety test.", createdBy: "u-manager-2", createdAt: at("2026-11-08"), findings: [] },
  ]);

  // Monthly readings: electricity (kWh) and water (m³), cumulative meters. A-008 has a water spike in September.
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(2025, 10 + i, 28)); return d.toISOString().slice(0, 10); });
  const plan: [string, string, number, number][] = [["A-001", "electricity", 420, 1.9], ["A-001", "water", 18, 22], ["A-008", "electricity", 5200, 1.7], ["A-008", "water", 260, 22], ["A-002", "electricity", 3100, 1.8], ["A-014", "electricity", 1300, 1.9]];
  const rows: (typeof t.utilityReadings.$inferInsert)[] = [];
  for (const [assetId, utility, base, tariff] of plan) {
    let meter = utility === "water" ? 1200 : 25000;
    months.forEach((m, i) => {
      const season = utility === "electricity" ? 1 + 0.45 * Math.max(0, Math.sin(((i + 1) / 12) * Math.PI * 2 - Math.PI / 2)) : 1;
      const spike = assetId === "A-008" && utility === "water" && m.startsWith("2026-09") ? 2.4 : 1;
      const use = Math.round(base * season * spike * (1 + ((i * 7) % 5 - 2) / 40));
      meter += use;
      rows.push({ id: `UR-${assetId}-${utility}-${String(i + 1).padStart(2, "0")}`, assetId, utility, readOn: m, reading: String(meter), costEgp: Math.round(use * tariff), recordedBy: "u-manager-1", createdAt: at(m) });
    });
  }
  await db.insert(t.utilityReadings).values(rows);

  await db.insert(t.capexItems).values([
    { id: "CX-001", assetId: "A-008", title: "Roof waterproofing and drains", titleAr: "عزل السطح وتجديد المصارف", category: "roof", status: "approved", budgetEgp: 1_150_000, spentEgp: 0, usefulLifeYears: 15, expectedUpliftEgp: null, startOn: "2026-12-01", contractorId: "CT-005", proposedBy: "u-manager-1", decidedBy: "u-manager-2", note: "Follows the October inspection (ponding near the north drain).", createdAt: at("2026-10-20") },
    { id: "CX-002", assetId: "A-002", title: "Replace floor 6 chillers", titleAr: "استبدال وحدات التبريد في الدور السادس", category: "mep", status: "proposed", budgetEgp: 2_400_000, spentEgp: 0, usefulLifeYears: 12, expectedUpliftEgp: 1_500_000, startOn: "2027-02-01", contractorId: "CT-002", proposedBy: "u-manager-1", decidedBy: null, note: "Two of four units failing; repair costs rising.", createdAt: at("2026-11-10") },
    { id: "CX-003", assetId: "A-014", title: "Rooftop solar, 12 kWp", titleAr: "طاقة شمسية على السطح، 12 كيلوواط", category: "solar", status: "in_progress", budgetEgp: 620_000, spentEgp: 410_000, usefulLifeYears: 25, expectedUpliftEgp: 700_000, startOn: "2026-10-01", contractorId: "CT-006", proposedBy: "u-manager-2", decidedBy: "u-manager-1", note: "Annual saving estimated at EGP 85,000 at today's tariff.", createdAt: at("2026-08-15") },
    { id: "CX-004", assetId: "A-005", title: "Lift modernisation", titleAr: "تحديث المصعد", category: "lift", status: "done", budgetEgp: 950_000, spentEgp: 905_000, usefulLifeYears: 20, expectedUpliftEgp: 600_000, startOn: "2026-03-01", completedOn: "2026-05-20", contractorId: "CT-001", proposedBy: "u-manager-2", decidedBy: "u-manager-1", note: "", createdAt: at("2026-01-10") },
    { id: "CX-005", assetId: "A-020", title: "Shopfront and signage renewal", titleAr: "تجديد الواجهة واللافتات", category: "facade", status: "rejected", budgetEgp: 480_000, spentEgp: 0, usefulLifeYears: 10, expectedUpliftEgp: null, startOn: null, contractorId: null, proposedBy: "u-manager-1", decidedBy: "u-manager-2", note: "Rejected: wait for the lease renewal terms first.", createdAt: at("2026-07-01") },
  ]);
}
