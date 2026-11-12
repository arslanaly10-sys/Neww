import type { Role } from "./permissions";

/**
 * Simulated activity. Events are generated from a seeded sequence, so a demo shows the same story every time, and they
 * never touch the database or the audit log. Every event is flagged simulated. Role filtering happens here, on the server:
 * an investor's events carry no rent amounts, and the administrator only ever gets system events.
 */
export type FeedKind = "rent_receipt" | "valuation_change" | "new_enquiry" | "system";
export interface FeedEvent {
  seq: number; kind: FeedKind; simulated: true; at: string;
  assetId: string | null; assetName: string | null; assetNameAr: string | null;
  tenant: string | null; amountEgp: number | null; currency: string | null; changePct: number | null; channel: string | null; prospect: string | null; systemKey: string | null;
}
export interface FeedAsset { id: string; name: string; nameAr: string; occupancy: string; tenant: string | null; monthlyRent: number | null; currency: string | null }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const KINDS: FeedKind[] = ["rent_receipt", "new_enquiry", "valuation_change"];
const SYSTEM = ["chain_checkpoint", "cache_refresh", "backup_ok"];
const CHANNELS = ["web", "phone", "broker"];

/** Gap before event `seq` (milliseconds): 20 to 40 seconds, deterministic. The first event comes quickly. */
export function gapMs(seq: number, fixed?: number) {
  if (fixed) return fixed;
  if (seq === 0) return 3000;
  return Math.round(20000 + rng(7000 + seq)() * 20000);
}

export function feedEvent(seq: number, role: Role, assets: FeedAsset[], nowIso: string): FeedEvent {
  const r = rng(20261112 + seq * 977);
  const base: FeedEvent = { seq, kind: "system", simulated: true, at: nowIso, assetId: null, assetName: null, assetNameAr: null, tenant: null, amountEgp: null, currency: null, changePct: null, channel: null, prospect: null, systemKey: null };
  if (role === "admin" || assets.length === 0) return { ...base, systemKey: SYSTEM[seq % SYSTEM.length] };
  const kind = KINDS[seq % KINDS.length];
  const pool = kind === "rent_receipt" ? assets.filter((a) => a.occupancy === "let" && a.monthlyRent) : kind === "new_enquiry" ? assets.filter((a) => a.occupancy === "vacant") : assets;
  const list = pool.length ? pool : assets;
  const a = list[Math.floor(r() * list.length)];
  const common = { ...base, kind, assetId: a.id, assetName: a.name, assetNameAr: a.nameAr };
  if (kind === "rent_receipt") return { ...common, tenant: a.tenant, amountEgp: role === "manager" ? a.monthlyRent : null, currency: role === "manager" ? a.currency : null };
  if (kind === "valuation_change") return { ...common, changePct: Math.round((r() * 2.1 + 0.3) * (r() < 0.35 ? -1 : 1) * 10) / 10 };
  return { ...common, channel: CHANNELS[Math.floor(r() * CHANNELS.length)], prospect: `P-${100 + Math.floor(r() * 900)}` };
}
