import type { DB } from "./client";
import * as t from "./schema";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";

/**
 * Leasing sample data: six months of rent invoices per active lease, payments with a deterministic pattern (most on
 * time, a few tenants late or in arrears), tenant contacts on example domains, and renewals in progress for leases
 * that end within 180 days. Runs after the main seed, so every lease and tenant exists.
 */
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const BILLING_MONTHS = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"];
/** Rent is due on the fifth of the month billed. */
export const dueOnFor = (period: string) => addDays(period, 4);

/** How each lease pays, by its position: most on time, a few late, three in arrears. */
function profile(i: number): "ontime" | "late" | "arrears" | "partial" {
  if ([3, 9].includes(i)) return "arrears";
  if ([6].includes(i)) return "partial";
  if (i % 4 === 1) return "late";
  return "ontime";
}

export async function seedLeasing(db: DB) {
  const leases = (await db.select().from(t.leases)).sort((a, b) => a.id.localeCompare(b.id));
  const tenants = await db.select().from(t.tenants);

  await db.insert(t.tenantContacts).values(tenants.map((x, i) => {
    const slug = x.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    return {
      tenantId: x.id, contactName: `${x.name.replace(/\s*\(.*\)/, "")} accounts`, contactNameAr: `حسابات ${x.nameAr.replace(/\s*\(.*\)/, "")}`,
      email: `accounts@${slug || `tenant-${i + 1}`}.example`, phone: `Sample line ${String(i + 1).padStart(2, "0")}`,
    };
  }));

  const invoices: (typeof t.rentInvoices.$inferInsert)[] = [];
  const payments: (typeof t.rentPayments.$inferInsert)[] = [];
  leases.forEach((l, i) => {
    const kind = profile(i);
    const months = BILLING_MONTHS.filter((m) => m >= l.startDate.slice(0, 7) + "-01" && m <= l.endDate);
    months.forEach((period, k) => {
      const fromEnd = months.length - 1 - k; // 0 = this month
      const amountEgp = l.currency === "USD" ? Math.round(l.monthlyRent * SAMPLE_FX_EGP_PER_USD) : l.monthlyRent;
      const dueOn = dueOnFor(period);
      let paid = amountEgp, paidOn = addDays(dueOn, (i + k) % 3);
      if (kind === "late") paidOn = addDays(dueOn, 12 + ((i + k) % 9));
      if (kind === "arrears" && fromEnd <= (i === 3 ? 2 : 1)) paid = 0;
      if (kind === "partial" && fromEnd <= 1) paid = Math.round(amountEgp / 2);
      if (kind === "late" && fromEnd === 0) paid = 0; // not in yet this month
      if (paidOn > DEMO_TODAY) paid = 0;
      const id = `RI-${l.id}-${period.slice(0, 7)}`;
      invoices.push({
        id, leaseId: l.id, assetId: l.assetId, tenantId: l.tenantId, period, dueOn, amount: l.monthlyRent, currency: l.currency, amountEgp,
        paidEgp: paid, status: paid >= amountEgp ? "paid" : paid > 0 ? "partial" : "open",
        lastReminderOn: kind === "arrears" && fromEnd === 1 ? addDays(dueOn, 10) : null,
      });
      if (paid > 0) payments.push({ id: `RP-seed-${l.id}-${period.slice(0, 7)}`, invoiceId: id, amountEgp: paid, paidOn, method: i % 5 === 0 ? "cheque" : "transfer", recordedBy: "u-manager-1", createdAt: new Date(`${paidOn}T10:00:00Z`) });
    });
  });
  if (invoices.length) await db.insert(t.rentInvoices).values(invoices);
  if (payments.length) await db.insert(t.rentPayments).values(payments);

  const STAGES = ["offered", "negotiating", "not_started", "agreed", "leaving", "negotiating"] as const;
  const soon = leases.filter((l) => { const d = days(DEMO_TODAY, l.endDate); return d >= 0 && d <= 180; });
  if (soon.length) await db.insert(t.leaseRenewals).values(soon.map((l, k) => {
    const status = STAGES[k % STAGES.length];
    const proposed = status === "offered" || status === "negotiating" || status === "agreed";
    return {
      leaseId: l.id, status,
      proposedRent: proposed ? Math.round((l.monthlyRent * (1 + Number(l.annualIndexationPct) / 100)) / 100) * 100 : null,
      proposedEnd: proposed ? addDays(l.endDate, 365 * (status === "agreed" ? 3 : 2)) : null,
      note: status === "leaving" ? "Tenant gave notice; relocating to a larger unit." : status === "agreed" ? "Terms agreed; awaiting signed contract." : "",
      updatedBy: "u-manager-1", updatedAt: new Date(`${addDays(DEMO_TODAY, -(k + 2))}T09:00:00Z`),
    };
  }));
}
