import { ALERT_ASSUMPTIONS as A, SCENARIO_ASSUMPTIONS, DEMO_TODAY } from "./assumptions";
import type { Role } from "./permissions";

/**
 * Deterministic alert rules. Alerts are computed from the data, never typed in, and they clear on their own when the
 * cause is gone. Only a snooze (with a reason) is stored.
 */
export type AlertKind = "lease_renewal" | "missing_document" | "valuation_drift" | "vacancy_cost";
export type Severity = "high" | "medium" | "low";
export interface AlertCandidate { key: string; kind: AlertKind; assetId: string; severity: Severity; routeRole: "manager" | "investor"; detail: Record<string, string | number | null> }

export interface AlertInput {
  assets: { id: string; type: string; occupancy: string; vacantSince: string | null; valueEgp: number }[];
  leases: { id: string; assetId: string; endDate: string }[];
  docs: { id: string; assetId: string; kind: string; status: string; expiresOn: string | null }[];
  /** Comparable-sales implied value versus the asset's value, in percent. Only supplied for managers. */
  drift: Map<string, number>;
}
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const sevRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Cost of a vacancy so far: what the asset would have earned at its market cap rate, for the months it has stood empty. */
export function vacancyCostEgp(valueEgp: number, type: string, vacantDays: number) {
  const cap = (SCENARIO_ASSUMPTIONS.capRateByType as Record<string, number>)[type] ?? 0.08;
  return Math.round(((valueEgp * cap) / 12) * (vacantDays / 30.4375) / 1000) * 1000;
}

export function computeAlerts(i: AlertInput, today = DEMO_TODAY): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const l of i.leases) {
    const d = days(today, l.endDate);
    if (d <= A.leaseRenewalDays) out.push({ key: `lease_renewal:${l.assetId}`, kind: "lease_renewal", assetId: l.assetId, routeRole: "manager", severity: d <= A.leaseHighDays ? "high" : d <= A.leaseMediumDays ? "medium" : "low", detail: { leaseId: l.id, endDate: l.endDate, days: d } });
  }
  for (const x of i.docs) {
    if (x.status === "missing" || x.status === "expired")
      out.push({ key: `missing_document:${x.id}`, kind: "missing_document", assetId: x.assetId, routeRole: "manager", severity: x.kind === "title_deed" || x.status === "expired" ? "high" : "medium", detail: { docId: x.id, docKind: x.kind, status: x.status, expiresOn: x.expiresOn } });
  }
  for (const [assetId, pct] of i.drift) {
    if (Math.abs(pct) >= A.valuationDriftPct) out.push({ key: `valuation_drift:${assetId}`, kind: "valuation_drift", assetId, routeRole: "manager", severity: Math.abs(pct) >= A.valuationDriftHighPct ? "high" : "medium", detail: { driftPct: Math.round(pct * 10) / 10 } });
  }
  for (const a of i.assets) {
    if (a.occupancy !== "vacant" || !a.vacantSince) continue;
    const d = days(a.vacantSince, today);
    if (d > A.vacancyDays) out.push({ key: `vacancy_cost:${a.id}`, kind: "vacancy_cost", assetId: a.id, routeRole: "manager", severity: d > A.vacancyHighDays ? "high" : d > A.vacancyMediumDays ? "medium" : "low", detail: { days: d, costEgp: vacancyCostEgp(a.valueEgp, a.type, d) } });
  }
  return out.sort((x, y) => sevRank[x.severity] - sevRank[y.severity] || x.kind.localeCompare(y.kind) || x.assetId.localeCompare(y.assetId));
}

export const visibleKind = (kind: AlertKind, role: Role) => (A.visibleTo[kind] as readonly string[]).includes(role);
