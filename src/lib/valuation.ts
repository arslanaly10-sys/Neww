import { DEMO_TODAY, DISTRICT_PPSQM, VALUATION_ASSUMPTIONS as A } from "./assumptions";

/**
 * Deterministic valuation engine. Pure TypeScript: same inputs, same assumption set, same output.
 * No AI and no randomness. The assumption set id and hash are recorded with every result so it can be reproduced.
 */
export type PropertyType = keyof typeof A.typeFactor;
export type Finish = keyof typeof A.finishFactor;

export interface ValuationInputs {
  districtId: string; type: PropertyType; areaSqm: number; floor: number | null; finish: Finish;
  buildingAge: number | null; address?: string;
}
export interface SaleRow {
  id: string; districtId: string; type: string; areaSqm: number; floor: number | null; finish: string;
  yearBuilt: number | null; soldOn: string; priceEgp: number; compound: string;
}
export interface Market { now(districtId: string): number; at(districtId: string, isoDate: string): number }

export interface Driver { key: "base" | "type" | "finish" | "age" | "floor" | "market"; factor: number | null; valueAfterEgp: number; deltaEgp: number }
export interface Comp extends SaleRow { similarity: number; adjustedBasePpsqm: number; monthsAgo: number; sameDistrict: boolean }
export type ConfidenceLevel = "high" | "medium" | "low";
export interface Reason { id: string; params: Record<string, string | number> }
export interface ValuationResult {
  assumptionSetId: string; asOf: string; inputs: ValuationInputs;
  basePpsqm: number; marketFactor: number; drivers: Driver[];
  estimateEgp: number; lowEgp: number; highEgp: number; spreadPct: number;
  confidence: { level: ConfidenceLevel; dispersion: number | null; reasons: Reason[] };
  comps: Comp[]; compsImpliedEgp: number | null; driftVsCompsPct: number | null;
}

const round = (x: number, step = 1000) => Math.round(x / step) * step;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function ageFactor(age: number | null) {
  if (age === null) return 1;
  const a = A.age;
  const p = Math.min(1, Math.max(0, age) / a.flattenAtYears);
  const curve = 1 - Math.pow(1 - p, 2); // declining, flattens at flattenAtYears
  return 1 + a.newPremium - curve * (1 + a.newPremium - a.floorFactor);
}
export function floorFactor(type: string, floor: number | null) {
  const f = A.floor;
  if (floor === null || (f.exemptTypes as readonly string[]).includes(type)) return 1;
  if (floor === 0) return 1 + f.groundPenalty;
  return 1 + Math.min(f.cap, floor * f.perFloorPremium);
}
export const attributeFactors = (i: Pick<ValuationInputs, "type" | "finish" | "floor" | "buildingAge">) => ({
  type: A.typeFactor[i.type], finish: A.finishFactor[i.finish], age: ageFactor(i.buildingAge), floor: floorFactor(i.type, i.floor),
});

/** Market factor from an index ratio (index at date / index at the first month). */
export const marketFactorFromRatio = (ratio: number) => A.market.weight * ratio + (1 - A.market.weight);

export function makeMarket(series: { districtId: string; month: string; priceIndex: string | number }[]): Market {
  const by = new Map<string, { month: string; v: number }[]>();
  for (const r of series) (by.get(r.districtId) ?? by.set(r.districtId, []).get(r.districtId)!).push({ month: r.month, v: Number(r.priceIndex) });
  for (const arr of by.values()) arr.sort((a, b) => a.month.localeCompare(b.month));
  const at = (d: string, iso: string) => {
    const arr = by.get(d);
    if (!arr?.length) return 1;
    let pick = arr[0];
    for (const p of arr) if (p.month <= iso) pick = p;
    return marketFactorFromRatio(pick.v / arr[0].v);
  };
  return { now: (d) => { const arr = by.get(d); return arr?.length ? marketFactorFromRatio(arr[arr.length - 1].v / arr[0].v) : 1; }, at };
}

/** The hedonic estimate with a step-by-step driver breakdown. Each driver shows its effect in EGP. */
export function estimateWithDrivers(i: ValuationInputs, marketFactor: number) {
  const basePpsqm = DISTRICT_PPSQM[i.districtId];
  if (!basePpsqm) throw new Error(`Unknown district ${i.districtId}`);
  const f = attributeFactors(i);
  const steps: { key: Driver["key"]; factor: number | null }[] = [
    { key: "base", factor: null }, { key: "type", factor: f.type }, { key: "finish", factor: f.finish },
    { key: "age", factor: f.age }, { key: "floor", factor: f.floor }, { key: "market", factor: marketFactor },
  ];
  let v = i.areaSqm * basePpsqm;
  let prev = 0;
  const drivers: Driver[] = steps.map((s) => {
    if (s.factor !== null) v *= s.factor;
    const d = { key: s.key, factor: s.factor, valueAfterEgp: Math.round(v), deltaEgp: Math.round(v - prev) };
    prev = v;
    return d;
  });
  return { basePpsqm, drivers, estimateEgp: round(v) };
}

const monthsBetween = (a: string, b: string) => (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / (30.4375 * 86400000);

/** Pick the most similar sales: same type, same district first, then similar size, recent, same finish. */
export function selectComps(i: ValuationInputs, sales: SaleRow[], market: Market, today = DEMO_TODAY): Comp[] {
  const c = A.comps;
  const subjectBase = DISTRICT_PPSQM[i.districtId];
  const ranked = sales.filter((s) => s.type === i.type).map((s): Comp => {
    const monthsAgo = Math.max(0, monthsBetween(s.soldOn, today));
    const sameDistrict = s.districtId === i.districtId;
    const areaTerm = 1 - Math.min(1, Math.abs(Math.log(s.areaSqm / i.areaSqm)) / Math.log(c.areaLogSpan));
    const recency = Math.max(c.recencyFloor, 1 - monthsAgo / c.recencyHorizonMonths);
    const similarity = (sameDistrict ? 1 : c.otherDistrictPenalty) * (0.4 + 0.6 * areaTerm) * recency * (s.finish === i.finish ? 1 : c.differentFinishPenalty);
    // Strip the comparable's own attributes and market timing, and rescale to the subject district, to get a market-neutral base price.
    const sf = attributeFactors({ type: s.type as PropertyType, finish: s.finish as Finish, floor: s.floor, buildingAge: s.yearBuilt === null ? null : Math.max(0, 2026 - s.yearBuilt) });
    const adj = (s.priceEgp / s.areaSqm / (sf.type * sf.finish * sf.age * sf.floor) / market.at(s.districtId, s.soldOn)) * (subjectBase / DISTRICT_PPSQM[s.districtId]);
    return { ...s, similarity: Math.round(similarity * 1000) / 1000, adjustedBasePpsqm: Math.round(adj), monthsAgo: Math.round(monthsAgo * 10) / 10, sameDistrict };
  });
  ranked.sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
  return ranked.slice(0, c.count);
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const stdev = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

export function runValuation(i: ValuationInputs, sales: SaleRow[], market: Market, assumptionSetId = "AS-VAL-1.0.0", today = DEMO_TODAY): ValuationResult {
  const mf = market.now(i.districtId);
  const { basePpsqm, drivers, estimateEgp } = estimateWithDrivers(i, mf);
  const comps = selectComps(i, sales, market, today);
  const prices = comps.map((c) => c.adjustedBasePpsqm);
  const dispersion = prices.length >= 2 ? stdev(prices) / (prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const medAge = comps.length ? median(comps.map((c) => c.monthsAgo)) : null;
  const allSame = comps.length > 0 && comps.every((c) => c.sameDistrict);

  // Confidence: number of comps, how tightly they agree, how recent, and whether they are from the same district.
  const cf = A.confidence;
  const reasons: Reason[] = [{ id: "compCount", params: { n: comps.length } }];
  if (dispersion !== null) reasons.push({ id: "dispersion", params: { pct: Math.round(dispersion * 1000) / 10 } });
  if (medAge !== null) reasons.push({ id: "recency", params: { months: Math.round(medAge) } });
  reasons.push({ id: allSame ? "sameDistrict" : "mixedDistricts", params: {} });
  let level: ConfidenceLevel = "low";
  if (comps.length >= cf.highMinComps && dispersion !== null && dispersion <= cf.highMaxDispersion && medAge !== null && medAge <= cf.highMaxMedianAgeMonths && allSame) level = "high";
  else if (comps.length >= cf.mediumMinComps && dispersion !== null && dispersion <= cf.mediumMaxDispersion) level = "medium";

  const r = A.range;
  let spread = clamp((dispersion ?? r.maxSpread) * r.dispersionMultiplier, r.minSpread, r.maxSpread);
  if (level === "low") spread = Math.min(r.maxSpread, spread * r.lowConfidenceUplift);

  const f = attributeFactors(i);
  const compsImplied = prices.length ? round(median(prices) * i.areaSqm * f.type * f.finish * f.age * f.floor * mf) : null;
  return {
    assumptionSetId, asOf: today, inputs: i, basePpsqm, marketFactor: Math.round(mf * 10000) / 10000, drivers, estimateEgp,
    lowEgp: round(estimateEgp * (1 - spread)), highEgp: round(estimateEgp * (1 + spread)), spreadPct: Math.round(spread * 1000) / 10,
    confidence: { level, dispersion: dispersion === null ? null : Math.round(dispersion * 1000) / 1000, reasons },
    comps, compsImpliedEgp: compsImplied, driftVsCompsPct: compsImplied ? Math.round((compsImplied / estimateEgp - 1) * 1000) / 10 : null,
  };
}
