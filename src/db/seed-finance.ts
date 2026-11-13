import type { DB } from "./client";
import * as t from "./schema";
import { monthly, quarterMonths, suggestDistribution } from "@/lib/finance-calc";

/**
 * Finance sample data: a 2026 portfolio budget (built from the year's actuals with deliberate variances, so budget
 * against actual has something to show), a few hand-entered ledger lines, and two paid quarterly distributions.
 * Q3 2026 is left for a manager to propose, so the approval flow can be seen.
 */
const FACTOR: Record<string, number> = { rent: 1.04, service_charge: 1.0, maintenance: 0.8, tax: 1.0 };

export async function seedFinance(db: DB) {
  const cash = await db.select().from(t.cashflows);
  const months2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01`);
  const budget: (typeof t.budgetLines.$inferInsert)[] = [];
  for (const m of months2026) {
    for (const [cat, f] of Object.entries(FACTOR)) {
      const actual = cash.filter((c) => c.month === m && c.kind === cat).reduce((s, c) => s + c.amountEgp, 0);
      // Months without actuals yet (November, December) take the average of the months that have them.
      const months = new Set(cash.filter((c) => c.kind === cat && c.month.startsWith("2026")).map((c) => c.month));
      const avg = cash.filter((c) => c.kind === cat && c.month.startsWith("2026")).reduce((s, c) => s + c.amountEgp, 0) / Math.max(1, months.size);
      const lastActual = [...months].sort().pop() ?? "2026-01-01";
      // Maintenance falls in the last month of each quarter, so only those future months are budgeted for it.
      const due = cat === "maintenance" ? Number(m.slice(5, 7)) % 3 === 0 : cat !== "tax";
      const base = months.has(m) ? actual : m > lastActual && due ? avg : 0;
      if (base) budget.push({ id: `B-${m.slice(0, 7)}-${cat}`, month: m, category: cat, amountEgp: Math.round((base * f) / 1000) * 1000 });
    }
    if (["2026-02-01", "2026-08-01"].includes(m)) budget.push({ id: `B-${m.slice(0, 7)}-insurance`, month: m, category: "insurance", amountEgp: -420_000 });
    budget.push({ id: `B-${m.slice(0, 7)}-management_fee`, month: m, category: "management_fee", amountEgp: -150_000 });
  }
  await db.insert(t.budgetLines).values(budget);

  const entries = [
    { id: "LE-seed-01", assetId: null, entryDate: "2026-02-14", category: "insurance", amountEgp: -436_000, memo: "Portfolio property insurance, first half premium" },
    { id: "LE-seed-02", assetId: null, entryDate: "2026-08-12", category: "insurance", amountEgp: -436_000, memo: "Portfolio property insurance, second half premium" },
    ...months2026.slice(0, 10).map((m, i) => ({ id: `LE-seed-mf-${i + 1}`, assetId: null, entryDate: `${m.slice(0, 8)}28`, category: "management_fee", amountEgp: -150_000, memo: "Property management fee" })),
    { id: "LE-seed-03", assetId: "A-001", entryDate: "2026-08-20", category: "other_income", amountEgp: 64_000, memo: "Parking bays let to a neighbouring office" },
    { id: "LE-seed-04", assetId: "A-005", entryDate: "2026-09-09", category: "maintenance", amountEgp: -212_000, memo: "Lift overhaul after inspection" },
  ];
  await db.insert(t.ledgerEntries).values(entries.map((e) => ({ ...e, createdBy: "u-manager-1", createdAt: new Date(`${e.entryDate}T12:00:00Z`) })));

  // Paid distributions for Q1 and Q2, sized on each quarter's NOI from the ledger (seeded lines plus entries).
  const lines = [
    ...cash.map((c) => ({ month: c.month, category: c.kind, amountEgp: c.amountEgp })),
    ...entries.map((e) => ({ month: `${e.entryDate.slice(0, 7)}-01`, category: e.category, amountEgp: e.amountEgp })),
  ];
  const rows = (["2026-Q1", "2026-Q2"] as const).map((q, i) => {
    const noi = monthly(lines, quarterMonths(q)).reduce((s, r) => s + r.noi, 0);
    const paidOn = i === 0 ? "2026-04-20" : "2026-07-21";
    return {
      id: `DS-00${i + 1}`, period: q, amountEgp: suggestDistribution(noi), basisNoiEgp: noi, status: "paid", note: "",
      proposedBy: "u-manager-1", decidedBy: "u-manager-2", createdAt: new Date(`${paidOn}T09:00:00Z`), paidOn,
    };
  });
  await db.insert(t.distributions).values(rows);
}
