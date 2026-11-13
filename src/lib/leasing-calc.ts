/** Pure leasing arithmetic: overdue days, arrears ageing and collection rate. No database, so it is unit-tested directly. */
export interface InvoiceLike { id: string; period: string; dueOn: string; amountEgp: number; paidEgp: number; status: string }
export type Bucket = "d0_30" | "d31_60" | "d61_90" | "d90p";
export const BUCKETS: Bucket[] = ["d0_30", "d31_60", "d61_90", "d90p"];

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const outstanding = (i: InvoiceLike) => Math.max(0, i.amountEgp - i.paidEgp);
/** Overdue only once the due date has passed and something is still owed. */
export const isOverdue = (i: InvoiceLike, today: string) => outstanding(i) > 0 && i.dueOn < today;
export const bucketOf = (daysOverdue: number): Bucket => (daysOverdue <= 30 ? "d0_30" : daysOverdue <= 60 ? "d31_60" : daysOverdue <= 90 ? "d61_90" : "d90p");

export function aging(invoices: InvoiceLike[], today: string) {
  const buckets: Record<Bucket, number> = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  let total = 0;
  for (const i of invoices) {
    if (!isOverdue(i, today)) continue;
    const owed = outstanding(i);
    buckets[bucketOf(daysBetween(i.dueOn, today))] += owed;
    total += owed;
  }
  return { buckets, total };
}

/** Billed and collected for one billing month, and the rate (null when nothing was billed). */
export function collection(invoices: InvoiceLike[], period: string) {
  const inMonth = invoices.filter((i) => i.period === period);
  const billed = inMonth.reduce((s, i) => s + i.amountEgp, 0);
  const collected = inMonth.reduce((s, i) => s + Math.min(i.paidEgp, i.amountEgp), 0);
  return { billed, collected, rate: billed ? collected / billed : null, count: inMonth.length, paidCount: inMonth.filter((i) => i.status === "paid").length };
}

/** Status after a payment: paid in full, part paid, or still open. */
export const statusAfter = (amountEgp: number, paidEgp: number) => (paidEgp >= amountEgp ? "paid" : paidEgp > 0 ? "partial" : "open");

export const RENEWAL_STAGES = ["not_started", "offered", "negotiating", "agreed", "leaving"] as const;
export type RenewalStage = (typeof RENEWAL_STAGES)[number];
