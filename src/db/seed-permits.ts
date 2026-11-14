import { asc, eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";
import { requiredFor } from "../lib/permits-rules";

/**
 * Permits and legal status for every asset, following the sample requirement list. Most are in order; a few are
 * deliberately not: an unregistered title, a lapsed civil defence approval, a licence about to expire, a permit
 * renewal pending, a refused occupancy certificate and a reconciliation application. One history entry shows a renewal.
 */
export async function seedPermits(db: DB) {
  const at = (d: string) => new Date(`${d}T09:00:00Z`);
  const as = await db.select().from(t.assets).orderBy(asc(t.assets.id));
  const deeds = await db.select().from(t.documents).where(eq(t.documents.kind, "title_deed"));
  const rows: (typeof t.permits.$inferInsert)[] = [];
  let n = 0;
  const id = () => `PM-${String(++n).padStart(3, "0")}`;
  const AUTH = {
    title_registration: "Real Estate Publicity Department (sample)", building_permit: "City planning authority (sample)", occupancy: "City planning authority (sample)",
    civil_defence: "Civil Protection Authority (sample)", commercial_licence: "Local district licensing office (sample)", reconciliation: "Building violations committee (sample)",
  } as const;
  for (const a of as) {
    const k = Number(a.id.slice(2));
    const acquired = a.acquiredOn;
    const base = { assetId: a.id, recordedBy: k % 2 ? "u-manager-1" : "u-manager-2", note: "", verification: k % 10 === 0 ? "unverified" : "verified", reviewedBy: k % 10 === 0 ? null : "u-analyst" } as const;
    const reviewed = (d: string) => (base.reviewedBy ? { reviewedAt: at(d) } : {});
    for (const kind of requiredFor(a.type, a.status)) {
      const ref = `${kind.slice(0, 2).toUpperCase()}-${a.id.slice(2)}-${2000 + (k % 7) * 3}`;
      if (kind === "title_registration") {
        const deed = deeds.find((d) => d.assetId === a.id);
        const form = deed?.status === "verified" ? "registered" : deed?.status === "pending" ? "court_validated" : "primary_contract";
        rows.push({ id: id(), ...base, kind, status: "valid", form, authority: form === "registered" ? AUTH.title_registration : form === "court_validated" ? "Court (sample)" : "Seller (developer)", reference: ref, issuedOn: acquired, documentId: deed?.id ?? null, note: form === "primary_contract" ? "Held on the developer's primary contract; registration not started." : "", recordedAt: at(acquired), ...reviewed(acquired) });
        continue;
      }
      const status = "valid", appliedOn: string | null = null, note = "";
      let issuedOn: string | null = acquired, expiresOn: string | null = null;
      if (kind === "building_permit") { issuedOn = `${Math.min(a.yearBuilt ?? 2015, 2024) - 2}-04-01`; if (a.status === "under_construction") { issuedOn = "2024-02-01"; expiresOn = "2027-02-01"; } }
      if (kind === "occupancy") issuedOn = `${a.yearBuilt ?? 2015}-09-15`;
      if (kind === "civil_defence") { issuedOn = "2026-03-01"; expiresOn = "2027-03-01"; }
      if (kind === "commercial_licence") { issuedOn = "2025-12-15"; expiresOn = "2026-12-15"; }
      if (issuedOn && issuedOn < "2000-01-01") issuedOn = "2000-01-01";
      rows.push({ id: id(), ...base, kind, status, authority: AUTH[kind], reference: ref, issuedOn, expiresOn, appliedOn, note, recordedAt: at(issuedOn ?? acquired), ...reviewed(issuedOn ?? acquired) });
    }
  }
  // The exceptions, applied to the asset's current rows.
  const set = (assetId: string, kind: string, patch: Partial<typeof t.permits.$inferInsert>) => { const r = rows.find((x) => x.assetId === assetId && x.kind === kind); if (r) Object.assign(r, patch); };
  const ready = as.filter((a) => a.status !== "under_construction");
  const office = ready.filter((a) => a.type === "office").map((a) => a.id);
  const retail = ready.filter((a) => a.type === "retail").map((a) => a.id);
  const villa = ready.filter((a) => a.type === "villa").map((a) => a.id);
  // A lapsed civil defence approval on an office, renewed late: history row plus a pending application.
  const lapsed = rows.find((x) => x.assetId === office[0] && x.kind === "civil_defence")!;
  Object.assign(lapsed, { issuedOn: "2025-08-01", expiresOn: "2026-08-01", supersededAt: at("2026-10-05") });
  rows.push({ ...lapsed, id: id(), status: "pending", issuedOn: null, expiresOn: null, appliedOn: "2026-10-05", supersededAt: null, verification: "unverified", reviewedBy: null, reviewedAt: null, note: "Renewal applied for after the approval lapsed; inspection booked.", recordedBy: "u-manager-1", recordedAt: at("2026-10-05") });
  set(office[1], "civil_defence", { issuedOn: "2025-09-01", expiresOn: "2026-09-01", note: "" }); // expired, nobody has acted
  set(retail[0], "commercial_licence", { issuedOn: "2025-12-15", expiresOn: "2026-12-20" }); // expiring soon
  set(retail[1], "occupancy", { status: "refused", issuedOn: null, appliedOn: "2026-06-10", note: "Refused: parking spaces short of the approved plan. Revised plan being prepared." });
  set(villa[0], "building_permit", { note: "An extra floor was added without a permit before purchase." });
  rows.push({ id: id(), assetId: villa[0], kind: "reconciliation", status: "pending", authority: AUTH.reconciliation, reference: "REC-2026-0412", appliedOn: "2026-05-20", note: "Application to reconcile the added floor under the building-violations law; fee estimate pending.", verification: "verified", reviewedBy: "u-analyst", reviewedAt: at("2026-05-25"), recordedBy: "u-manager-2", recordedAt: at("2026-05-20") });
  await db.insert(t.permits).values(rows);
}
