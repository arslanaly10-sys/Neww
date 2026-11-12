import { assessRisk, type RiskResult } from "./risk";
import { canonical, sha256 } from "./hash";
import type { ScenarioAssumptions } from "./assumptions";

/**
 * Deterministic scenario engine. Pure TypeScript: given the same base data, assumption set and slider values it returns
 * the same numbers, so any saved scenario can be reproduced from its recorded assumptions and hashes.
 *
 * Value of an asset under a scenario = base value x cap-rate factor x vacancy factor x rent-growth factor x FX factor.
 */
export interface ScenarioInputs { fx: number; rate: number; vacancy: number; rentGrowth: number }

export interface BaseAsset {
  id: string; name: string; nameAr: string; districtId: string; type: string; occupancy: string; vacantSince: string | null;
  valueEgp: number; costEgp: number;
  leaseCurrency: string | null; leaseEnd: string | null;
  docs: { kind: string; status: string }[];
  /** Annual rent in EGP-denominated leases, and in USD-denominated leases expressed at the base FX rate, and annual costs (positive number). */
  rentEgp: number; rentUsdAtBase: number; costsEgp: number;
}

export interface AssetOutcome {
  id: string; baseValue: number; value: number; changePct: number;
  /** Net yield on scenario value. Null where the viewer's role may not see per-asset income. */
  yield: number | null; baseYield: number | null; risk: RiskResult["score"]; riskBand: RiskResult["band"]; baseRisk: number;
}
export interface PortfolioOutcome { value: number; baseValue: number; changePct: number; gain: number; netYield: number; baseNetYield: number; avgRisk: number; baseAvgRisk: number; highRiskCount: number }
export interface CaseResult { inputs: ScenarioInputs; portfolio: PortfolioOutcome; assets: AssetOutcome[] }
export interface ScenarioResult { low: CaseResult; central: CaseResult; high: CaseResult }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };

export function applyCaseOffsets(central: ScenarioInputs, offsets: ScenarioInputs, A: ScenarioAssumptions): ScenarioInputs {
  const r = A.sliders;
  return {
    fx: clamp(central.fx + offsets.fx, r.fx[0], r.fx[1]), rate: clamp(central.rate + offsets.rate, r.rate[0], r.rate[1]),
    vacancy: clamp(central.vacancy + offsets.vacancy, r.vacancy[0], r.vacancy[1]), rentGrowth: clamp(central.rentGrowth + offsets.rentGrowth, r.rentGrowth[0], r.rentGrowth[1]),
  };
}

export function valueFactors(a: Pick<BaseAsset, "type" | "occupancy" | "leaseCurrency">, s: ScenarioInputs, A: ScenarioAssumptions) {
  const b = A.base;
  const capBase = (A.capRateByType as Record<string, number>)[a.type] ?? 0.08;
  const capNew = capBase + (A.capRatePassThrough * (s.rate - b.rate)) / 100;
  const cap = clamp(capBase / Math.max(capNew, 0.005), A.capFactorBounds[0], A.capFactorBounds[1]);
  const w = (A.incomeWeight as Record<string, number>)[a.occupancy] ?? 0;
  const vac = 1 - (w * (s.vacancy - b.vacancy)) / 100;
  const rent = 1 + (w * A.rentGrowthPassThrough * (s.rentGrowth - b.rentGrowth)) / 100;
  const linkage = a.leaseCurrency === "USD" ? A.usdLeaseLinkage : ((A.fxLinkage as Record<string, number>)[a.type] ?? 0.15);
  const fx = 1 + linkage * (s.fx / b.fx - 1);
  return { cap, vac, rent, fx, linkage };
}

/** Annual net income under the scenario: rent after the vacancy shock, growth and FX, less costs. */
export function scenarioIncome(a: BaseAsset, s: ScenarioInputs, A: ScenarioAssumptions) {
  const b = A.base;
  const growth = (1 + s.rentGrowth / 100) / (1 + b.rentGrowth / 100);
  const keep = a.occupancy === "let" ? 1 - (s.vacancy - b.vacancy) / 100 : 1;
  return (a.rentEgp + a.rentUsdAtBase * (s.fx / b.fx)) * growth * keep - a.costsEgp;
}

export function runCase(base: BaseAsset[], inputs: ScenarioInputs, A: ScenarioAssumptions, today?: string): CaseResult {
  const baseInputs: ScenarioInputs = { ...A.base };
  const values = base.map((a) => {
    const f = valueFactors(a, inputs, A);
    return a.valueEgp * f.cap * f.vac * f.rent * f.fx;
  });
  const total = values.reduce((s, v) => s + v, 0);
  const baseTotal = base.reduce((s, a) => s + a.valueEgp, 0);
  const shareOf = (districtId: string, vals: number[], tot: number) => vals.reduce((s, v, i) => s + (base[i].districtId === districtId ? v : 0), 0) / tot;

  const assets: AssetOutcome[] = base.map((a, i) => {
    const f = valueFactors(a, inputs, A);
    const risk = assessRisk({
      occupancy: a.occupancy, vacantSince: a.vacantSince, leaseEnd: a.leaseEnd, leaseCurrency: a.leaseCurrency, docs: a.docs,
      districtShare: shareOf(a.districtId, values, total),
      stress: { vacancyShockPct: Math.max(0, inputs.vacancy - A.base.vacancy), fxRatio: inputs.fx / A.base.fx, fxLinkage: f.linkage, valueChange: values[i] / a.valueEgp - 1 },
    }, today);
    const baseRisk = assessRisk({
      occupancy: a.occupancy, vacantSince: a.vacantSince, leaseEnd: a.leaseEnd, leaseCurrency: a.leaseCurrency, docs: a.docs,
      districtShare: shareOf(a.districtId, base.map((x) => x.valueEgp), baseTotal),
    }, today);
    const income = scenarioIncome(a, inputs, A), baseIncome = scenarioIncome(a, baseInputs, A);
    return {
      id: a.id, baseValue: a.valueEgp, value: Math.round(values[i]), changePct: round(values[i] / a.valueEgp - 1, 5),
      yield: round(income / values[i], 6), baseYield: round(baseIncome / a.valueEgp, 6), risk: risk.score, riskBand: risk.band, baseRisk: baseRisk.score,
    };
  });
  const netIncome = base.reduce((s, a) => s + scenarioIncome(a, inputs, A), 0);
  const baseIncome = base.reduce((s, a) => s + scenarioIncome(a, baseInputs, A), 0);
  const wAvg = (xs: number[], ws: number[]) => xs.reduce((s, x, i) => s + x * ws[i], 0) / ws.reduce((s, w) => s + w, 0);
  return {
    inputs,
    portfolio: {
      value: Math.round(total), baseValue: baseTotal, changePct: round(total / baseTotal - 1, 5), gain: Math.round(total - base.reduce((s, a) => s + a.costEgp, 0)),
      netYield: round(netIncome / total, 6), baseNetYield: round(baseIncome / baseTotal, 6),
      avgRisk: round(wAvg(assets.map((x) => x.risk), values), 2), baseAvgRisk: round(wAvg(assets.map((x) => x.baseRisk), base.map((a) => a.valueEgp)), 2),
      highRiskCount: assets.filter((x) => x.riskBand === "high").length,
    },
    assets,
  };
}

export function runScenario(base: BaseAsset[], central: ScenarioInputs, A: ScenarioAssumptions, today?: string): ScenarioResult {
  return {
    low: runCase(base, applyCaseOffsets(central, A.cases.low, A), A, today),
    central: runCase(base, central, A, today),
    high: runCase(base, applyCaseOffsets(central, A.cases.high, A), A, today),
  };
}

/** Hash of the portfolio data a result was computed on, and of the central result itself. */
export const baseHash = (base: BaseAsset[]) => sha256(canonical(base.map((a) => ({ ...a, name: undefined, nameAr: undefined }))));
export const resultHash = (r: ScenarioResult) => sha256(canonical({ low: r.low.portfolio, central: r.central.portfolio, high: r.high.portfolio, assets: r.central.assets.map((a) => [a.id, a.value, a.yield, a.risk]) }));
