import { DEMO_TODAY, RISK_ASSUMPTIONS as R } from "./assumptions";

/** Deterministic asset risk model. No AI, no randomness. Every driver returns its own score and reason. */
export type DriverKey = keyof typeof R.weights;
export interface RiskDriver { key: DriverKey; score: number; weight: number; contribution: number; reason: { id: string; params: Record<string, string | number> } }
export interface RiskResult { score: number; band: "low" | "medium" | "high"; drivers: RiskDriver[]; version: string }

const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const clamp = (x: number) => Math.max(0, Math.min(100, x));

export interface RiskInput {
  occupancy: string; vacantSince: string | null;
  leaseEnd: string | null; leaseCurrency: string | null;
  docs: { kind: string; status: string }[];
  districtShare: number; // share of portfolio value 0..1
  /** Scenario stress. Omitted in the base case. */
  stress?: { vacancyShockPct: number; fxRatio: number; fxLinkage: number; valueChange: number };
}

export function assessRisk(i: RiskInput, today = DEMO_TODAY): RiskResult {
  const drivers: RiskDriver[] = [];
  const push = (key: DriverKey, score: number, reason: RiskDriver["reason"]) => {
    const s = Math.round(clamp(score));
    drivers.push({ key, score: s, weight: R.weights[key], contribution: s * R.weights[key], reason });
  };

  const st = i.stress;
  // Vacancy: days vacant against the full-score horizon. Land and owner-occupied carry no vacancy cost.
  // Under a scenario, a let asset also carries the vacancy shock itself.
  if (i.occupancy === "vacant" && i.vacantSince) {
    const d = days(i.vacantSince, today);
    push("vacancy", (d / R.vacancyFullScoreDays) * 100, { id: "vacancyDays", params: { days: d } });
  } else if (i.occupancy === "let" && st && st.vacancyShockPct > 0) {
    push("vacancy", st.vacancyShockPct * R.stress.vacancyScorePerPoint, { id: "vacancyShock", params: { pct: st.vacancyShockPct } });
  } else push("vacancy", 0, { id: i.occupancy === "let" ? "vacancyNone" : "vacancyNa", params: {} });

  // Lease expiry: 100 at or past expiry, 0 at 365+ days remaining.
  if (i.leaseEnd) {
    const d = days(today, i.leaseEnd);
    const s = d <= R.leaseExpiryFullScoreDays ? 100 : ((R.leaseExpiryZeroScoreDays - d) / R.leaseExpiryZeroScoreDays) * 100;
    push("leaseExpiry", s, d < 0 ? { id: "leaseEnded", params: { days: -d } } : { id: "leaseEnds", params: { days: d } });
  } else push("leaseExpiry", 0, { id: "leaseNa", params: {} });

  // Documents: points per gap, capped.
  const pts = i.docs.reduce((s, d) => s + (d.status === "missing" ? R.documentPoints.missing : d.status === "expired" ? R.documentPoints.expired : d.status === "pending" ? R.documentPoints.pending : 0), 0);
  const gaps = i.docs.filter((d) => d.status !== "verified").length;
  push("documents", pts, { id: gaps ? "docGaps" : "docsClear", params: { n: gaps } });

  // FX: a USD-denominated lease is exposed to the pound; EGP leases carry no direct exposure.
  // Under a scenario, any move in the rate adds exposure in proportion to the asset's dollar linkage.
  const fxMove = st ? Math.min(R.stress.fxScoreCap, st.fxLinkage * Math.abs(st.fxRatio - 1) * R.stress.fxScorePerUnitRatio) : 0;
  push("fx", (i.leaseCurrency === "USD" ? R.fxUsdLeaseScore : 0) + fxMove, i.leaseCurrency === "USD" ? { id: "fxUsd", params: {} } : fxMove > 0 ? { id: "fxMove", params: { pct: Math.round(Math.abs((st?.fxRatio ?? 1) - 1) * 1000) / 10 } } : { id: "fxNone", params: {} });

  // Concentration: district share above the floor scales to 100 at the full-score share.
  const c = ((i.districtShare - R.concentrationFloorShare) / (R.concentrationFullShare - R.concentrationFloorShare)) * 100;
  push("concentration", c, { id: "concShare", params: { pct: Math.round(i.districtShare * 1000) / 10 } });

  // Value pressure: how far the scenario pushes this asset's value below its base value. Zero in the base case.
  const drop = st ? Math.max(0, -st.valueChange) : 0;
  push("valuePressure", drop * R.stress.valuePressureScorePerUnitDrop, drop > 0 ? { id: "pressureDrop", params: { pct: Math.round(drop * 1000) / 10 } } : { id: "pressureNone", params: {} });

  const score = Math.round(drivers.reduce((s, d) => s + d.contribution, 0));
  return { score, band: score < R.bands.low ? "low" : score < R.bands.medium ? "medium" : "high", drivers, version: R.version };
}
