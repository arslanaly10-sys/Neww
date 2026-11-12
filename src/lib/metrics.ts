import type { PortfolioRow } from "./access";

/** Deterministic portfolio arithmetic. The AI never does this; it calls these functions. */
export function portfolioMetrics(rows: PortfolioRow[]) {
  const value = rows.reduce((s, r) => s + r.valueEgp, 0);
  const cost = rows.reduce((s, r) => s + r.costEgp, 0);
  const incomeUnits = rows.filter((r) => r.lease).length;
  const byDistrict = new Map<string, { id: string; name: string; nameAr: string; value: number; count: number }>();
  for (const r of rows) {
    const e = byDistrict.get(r.districtId) ?? { id: r.districtId, name: r.district.name, nameAr: r.district.nameAr, value: 0, count: 0 };
    e.value += r.valueEgp; e.count += 1;
    byDistrict.set(r.districtId, e);
  }
  const byType = new Map<string, { id: string; value: number; count: number }>();
  for (const r of rows) {
    const e = byType.get(r.type) ?? { id: r.type, value: 0, count: 0 };
    e.value += r.valueEgp; e.count += 1;
    byType.set(r.type, e);
  }
  return {
    byType: [...byType.values()].sort((a, b) => b.value - a.value),
    value, cost, gain: value - cost, gainPct: cost ? (value - cost) / cost : 0, count: rows.length, incomeUnits,
    allocation: [...byDistrict.values()].sort((a, b) => b.value - a.value),
  };
}

export type Sentiment = "cooling" | "stable" | "warming";
export function momentum3m(series: number[]) {
  const n = series.length;
  return n >= 4 ? series[n - 1] / series[n - 4] - 1 : 0;
}
export const sentiment = (m: number): Sentiment => (m < -0.01 ? "cooling" : m > 0.01 ? "warming" : "stable");
