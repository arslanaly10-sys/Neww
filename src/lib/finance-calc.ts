/**
 * Pure finance arithmetic: monthly income, costs and net operating income (NOI), budget against actual, a 12-month
 * forecast and a suggested distribution. No database, so every rule here is unit-tested directly.
 * Signs: income is positive, costs are negative.
 */
export const INCOME = ["rent", "other_income"] as const;
export const COSTS = ["service_charge", "maintenance", "tax", "insurance", "management_fee", "other_cost"] as const;
export const CATEGORIES = [...INCOME, ...COSTS] as const;
export type Category = (typeof CATEGORIES)[number];
export const isIncome = (c: string) => (INCOME as readonly string[]).includes(c);

export interface Line { month: string; category: string; amountEgp: number }
export interface MonthTotals { month: string; income: number; costs: number; noi: number }

/** First day of the month a date falls in. */
export const monthOf = (d: string) => `${d.slice(0, 7)}-01`;
export const addMonths = (m: string, n: number) => { const d = new Date(`${m}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10); };
export const quarterOf = (m: string) => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;
export const quarterMonths = (q: string) => { const [y, n] = [q.slice(0, 4), Number(q.slice(6))]; return [0, 1, 2].map((k) => `${y}-${String((n - 1) * 3 + 1 + k).padStart(2, "0")}-01`); };

/** Totals per month, in order, for the months given (months with no lines appear as zero). */
export function monthly(lines: Line[], months: string[]): MonthTotals[] {
  return months.map((m) => {
    const inMonth = lines.filter((l) => l.month === m);
    const income = inMonth.filter((l) => l.amountEgp > 0).reduce((s, l) => s + l.amountEgp, 0);
    const costs = inMonth.filter((l) => l.amountEgp < 0).reduce((s, l) => s + l.amountEgp, 0);
    return { month: m, income, costs, noi: income + costs };
  });
}
export const sum = (rows: MonthTotals[]) => rows.reduce((a, r) => ({ income: a.income + r.income, costs: a.costs + r.costs, noi: a.noi + r.noi }), { income: 0, costs: 0, noi: 0 });

export interface Variance { category: string; budget: number; actual: number; variance: number; pct: number | null; unfavourable: boolean }
/**
 * Budget against actual per category over the same months. Variance is actual minus budget, so a positive variance is
 * good for income and bad for costs (costs are negative: spending more makes the actual more negative).
 */
export function budgetVsActual(budget: Line[], actual: Line[], months: string[]): Variance[] {
  const inRange = (l: Line) => months.includes(l.month);
  return CATEGORIES.map((c) => {
    const b = budget.filter((l) => l.category === c && inRange(l)).reduce((s, l) => s + l.amountEgp, 0);
    const a = actual.filter((l) => l.category === c && inRange(l)).reduce((s, l) => s + l.amountEgp, 0);
    const variance = a - b;
    return { category: c, budget: b, actual: a, variance, pct: b ? variance / Math.abs(b) : null, unfavourable: variance < 0 };
  }).filter((v) => v.budget !== 0 || v.actual !== 0);
}

export interface ForecastLease { id: string; monthlyRentEgp: number; endDate: string; renewal: { status: string; proposedRentEgp: number | null } | null }
export interface ForecastMonth { month: string; income: number; costs: number; noi: number; leasesEnding: string[] }
/**
 * The next `n` months. Rent: each lease pays its current rent until it ends; after that it continues at the proposed
 * rent when a renewal is offered, negotiating or agreed, at the current rent when renewal has not started, and stops
 * when the tenant is leaving. Costs: the average of each cost category over the trailing months given.
 */
export function forecast(leases: ForecastLease[], trailingCosts: Line[], trailingMonths: number, from: string, n = 12): ForecastMonth[] {
  const costPerMonth = trailingCosts.filter((l) => l.amountEgp < 0).reduce((s, l) => s + l.amountEgp, 0) / Math.max(1, trailingMonths);
  return Array.from({ length: n }, (_, k) => {
    const m = addMonths(from, k);
    let income = 0;
    const ending: string[] = [];
    for (const l of leases) {
      if (monthOf(l.endDate) === m) ending.push(l.id);
      if (m <= l.endDate) { income += l.monthlyRentEgp; continue; }
      const s = l.renewal?.status ?? "not_started";
      if (s === "leaving") continue;
      income += (s === "offered" || s === "negotiating" || s === "agreed") && l.renewal?.proposedRentEgp ? l.renewal.proposedRentEgp : l.monthlyRentEgp;
    }
    const costs = Math.round(costPerMonth);
    return { month: m, income: Math.round(income), costs, noi: Math.round(income) + costs, leasesEnding: ending };
  });
}

/** Suggested distribution: a share of the quarter's NOI after a cash reserve, rounded down to the nearest 10,000. */
export const PAYOUT = { ratio: 0.8, reservePct: 0.05 } as const;
export function suggestDistribution(quarterNoi: number, opts: { ratio: number; reservePct: number } = PAYOUT) {
  if (quarterNoi <= 0) return 0;
  return Math.floor((quarterNoi * (1 - opts.reservePct) * opts.ratio) / 10_000) * 10_000;
}
