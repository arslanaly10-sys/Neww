/**
 * Which permits and approvals each kind of asset needs, and how a permit's state is judged. Pure, so the same rules
 * run on the server, in tests and in the browser. The requirement list is a sample policy for this demo, written
 * with Egyptian practice in mind; confirm it with a local lawyer before relying on it.
 */
export const PERMIT_KINDS = ["title_registration", "building_permit", "occupancy", "civil_defence", "commercial_licence", "reconciliation"] as const;
export type PermitKind = (typeof PERMIT_KINDS)[number];
export const PERMIT_STATUSES = ["valid", "pending", "expired", "refused", "missing"] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];
export const TITLE_FORMS = ["registered", "court_validated", "primary_contract"] as const;
export type TitleForm = (typeof TITLE_FORMS)[number];

/** Kinds required by asset type. Reconciliation is never required up front: it appears only when a violation does. */
export const REQUIRED: Record<string, readonly PermitKind[]> = {
  apartment: ["title_registration", "building_permit"],
  villa: ["title_registration", "building_permit", "occupancy"],
  office: ["title_registration", "building_permit", "occupancy", "civil_defence"],
  retail: ["title_registration", "building_permit", "occupancy", "civil_defence", "commercial_licence"],
  mixed: ["title_registration", "building_permit", "occupancy", "civil_defence"],
  land: ["title_registration"],
};
/** Under construction: no occupancy certificate yet, and no civil defence or licence until it opens. */
export function requiredFor(type: string, status: string): PermitKind[] {
  const base = [...(REQUIRED[type] ?? ["title_registration"])];
  return status === "under_construction" ? base.filter((k) => k === "title_registration" || k === "building_permit") : base;
}

export const EXPIRING_DAYS = 90;
export type PermitState = "ok" | "expiring" | "pending" | "attention" | "action";

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * The state of one permit on a date. Expired by date counts as expired whatever was recorded. A title held only on a
 * primary contract is valid but needs attention (it limits a sale or a mortgage).
 */
export function permitState(p: { status: string; expiresOn: string | null; form?: string | null; kind: string } | null, today: string): { state: PermitState; days: number | null; reason: string } {
  if (!p || p.status === "missing") return { state: "action", days: null, reason: "missing" };
  if (p.status === "refused") return { state: "action", days: null, reason: "refused" };
  if (p.status === "expired") return { state: "action", days: null, reason: "expired" };
  if (p.status === "pending") return { state: "pending", days: null, reason: "pending" };
  const days = p.expiresOn ? dayDiff(today, p.expiresOn) : null;
  if (days !== null && days < 0) return { state: "action", days, reason: "expired" };
  if (days !== null && days <= EXPIRING_DAYS) return { state: "expiring", days, reason: "expiring" };
  if (p.kind === "title_registration" && p.form && p.form !== "registered") return { state: "attention", days, reason: p.form };
  return { state: "ok", days, reason: "valid" };
}

const RANK: Record<PermitState, number> = { ok: 0, attention: 1, expiring: 2, pending: 3, action: 4 };
/** An asset's overall state is its worst permit; the score is the share of required permits in order. */
export function assetCompliance(required: readonly string[], states: Record<string, PermitState>) {
  const list = required.map((k) => states[k] ?? "action");
  const worst = list.reduce<PermitState>((w, s) => (RANK[s] > RANK[w] ? s : w), "ok");
  const good = list.filter((s) => s === "ok" || s === "attention").length;
  return { state: worst, score: required.length ? good / required.length : 1, good, required: required.length };
}
