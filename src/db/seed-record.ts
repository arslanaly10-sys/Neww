import type { DB } from "./client";
import * as t from "./schema";

/**
 * The asset record around each sample asset: the portfolio it sits in, who owns it, its buildings and units, version 1
 * of its details, the facts behind them with their sources, and instalment plans for the two newest purchases.
 */
interface FactSeed { field: string; value: string | number | null; unit: string | null; kind: string; label: string; on: string; ref: string | null; status: string }

/** One sourced fact, or nothing when the value is unknown. */
function fact(b: { assetId: string; recordedBy: string }, x: FactSeed): typeof t.assetFacts.$inferInsert | null {
  if (x.value === null) return null;
  const reviewed = x.status !== "unverified";
  return {
    id: `AF-${b.assetId}-${x.field}`, assetId: b.assetId, field: x.field, value: String(x.value), unit: x.unit, sourceKind: x.kind, sourceRef: x.ref, sourceLabel: x.label,
    observedOn: x.on, recordedBy: b.recordedBy, recordedAt: new Date(`${x.on}T09:00:00Z`), status: x.status,
    reviewedBy: reviewed ? "u-analyst" : null, reviewedAt: reviewed ? new Date("2026-10-15T09:00:00Z") : null,
  };
}

export async function seedRecord(db: DB) {
  const at = (d: string) => new Date(`${d}T09:00:00Z`);
  await db.insert(t.portfolios).values({ id: "P-001", name: "Sample Family Office portfolio", nameAr: "محفظة المكتب العائلي التجريبي", ownerId: "u-investor", baseCurrency: "EGP", createdAt: at("2019-01-01") });
  // Villas and plots carry a plot area separate from the built-up area; one shop is still being finished by the developer.
  const { eq, inArray } = await import("drizzle-orm");
  for (const a of await db.select().from(t.assets).where(inArray(t.assets.type, ["villa", "land"]))) {
    await db.update(t.assets).set({ plotAreaSqm: a.type === "land" ? a.areaSqm : Math.round(a.areaSqm * 2.2) }).where(eq(t.assets.id, a.id));
  }
  await db.update(t.assets).set({ status: "under_construction", deliveryOn: "2027-03-31" }).where(eq(t.assets.id, "A-012"));
  const assets = await db.select().from(t.assets);
  const leases = await db.select().from(t.leases);
  const docs = await db.select().from(t.documents);
  const own: (typeof t.ownershipShares.$inferInsert)[] = [];
  const blds: (typeof t.buildings.$inferInsert)[] = [];
  const uns: (typeof t.units.$inferInsert)[] = [];
  const vers: (typeof t.assetVersions.$inferInsert)[] = [];
  const facts: (typeof t.assetFacts.$inferInsert)[] = [];
  let b = 0, u = 0;
  const use = (type: string) => (type === "office" ? "office" : type === "retail" ? "retail" : "residential");
  for (const a of assets) {
    const n = Number(a.id.slice(2));
    const deed = docs.find((d) => d.assetId === a.id && d.kind === "title_deed");
    // Two holdings are shared with the family trust; the rest are held whole.
    if (n % 9 === 4) {
      own.push({ id: `OS-${a.id}-1`, assetId: a.id, holder: "Sample Family Office (fictional)", holderAr: "المكتب العائلي التجريبي (افتراضي)", sharePct: "60", since: a.acquiredOn, sourceDocId: deed?.id ?? null });
      own.push({ id: `OS-${a.id}-2`, assetId: a.id, holder: "Fahmy family trust (fictional)", holderAr: "صندوق عائلة فهمي (افتراضي)", sharePct: "40", since: a.acquiredOn, sourceDocId: deed?.id ?? null });
    } else own.push({ id: `OS-${a.id}-1`, assetId: a.id, holder: "Sample Family Office (fictional)", holderAr: "المكتب العائلي التجريبي (افتراضي)", sharePct: "100", since: a.acquiredOn, sourceDocId: deed?.id ?? null });

    const lease = leases.find((l) => l.assetId === a.id);
    const unitStatus = a.occupancy === "let" ? "let" : a.occupancy === "owner" ? "owner" : "vacant";
    if (a.type !== "land") {
      const bid = `B-${String(++b).padStart(3, "0")}`;
      blds.push({ id: bid, assetId: a.id, name: a.compound, nameAr: a.nameAr.split("،")[0], floors: a.type === "villa" ? 3 : a.type === "mixed" ? 6 : Math.max(4, (a.floor ?? 0) + 3), yearBuilt: a.yearBuilt, structure: "concrete_frame" });
      if (a.type === "mixed") {
        // A mixed-use block: shops on the ground floor, offices and flats above.
        const plan: { label: string; use: string; floor: number }[] = [
          { label: "G-1", use: "retail", floor: 0 }, { label: "G-2", use: "retail", floor: 0 }, { label: "1-A", use: "office", floor: 1 }, { label: "1-B", use: "office", floor: 1 },
          { label: "2-A", use: "office", floor: 2 }, { label: "3-A", use: "residential", floor: 3 }, { label: "4-A", use: "residential", floor: 4 }, { label: "5-A", use: "residential", floor: 5 },
        ];
        const each = Math.round(a.areaSqm / plan.length);
        for (let i = 0; i < plan.length; i++) {
          const x = plan[i];
          const res = x.use === "residential";
          uns.push({ id: `U-${String(++u).padStart(4, "0")}`, assetId: a.id, buildingId: bid, label: x.label, use: x.use, areaSqm: each, floor: x.floor, beds: res ? 3 : null, baths: res ? 2 : 1, status: i < 6 ? "let" : "vacant", leaseId: i === 0 ? lease?.id ?? null : null });
        }
      } else {
        uns.push({ id: `U-${String(++u).padStart(4, "0")}`, assetId: a.id, buildingId: bid, label: a.floor !== null ? `${a.floor}` : "1", use: use(a.type), areaSqm: a.areaSqm, floor: a.floor, beds: a.type === "apartment" ? (a.areaSqm > 180 ? 3 : 2) : a.type === "villa" ? 5 : null, baths: a.type === "apartment" ? 2 : a.type === "villa" ? 4 : 1, status: unitStatus, leaseId: lease?.id ?? null });
      }
    }
    const snapshot = { name: a.name, nameAr: a.nameAr, type: a.type, districtId: a.districtId, compound: a.compound, areaSqm: a.areaSqm, plotAreaSqm: a.plotAreaSqm, floor: a.floor, finish: a.finish, yearBuilt: a.yearBuilt, occupancy: a.occupancy, status: a.status };
    vers.push({ id: `AV-${a.id}-1`, assetId: a.id, version: 1, snapshot, changed: [], reason: "Recorded at acquisition", sourceKind: deed ? "document" : "seed", sourceRef: deed?.id ?? null, actorId: "u-manager-1", at: at(a.acquiredOn) });

    const deedOk = deed?.status === "verified";
    const byVal = a.valueSource.startsWith("V-");
    const base = { assetId: a.id, recordedBy: "u-manager-1" };
    const add = (x: FactSeed) => { const r = fact(base, x); if (r) facts.push(r); };
    add({ field: "area_sqm", value: a.areaSqm, unit: "m²", kind: deed ? "document" : "survey", label: deed ? `Title deed ${deed.id}` : "Developer brochure", on: a.acquiredOn, ref: deed?.id ?? null, status: deedOk ? "verified" : "unverified" });
    add({ field: "year_built", value: a.yearBuilt, unit: null, kind: "survey", label: "Building survey at acquisition", on: a.acquiredOn, ref: null, status: n % 3 ? "verified" : "unverified" });
    add({ field: "finish", value: a.finish, unit: null, kind: "survey", label: "Inspection at acquisition", on: a.acquiredOn, ref: null, status: "unverified" });
    add({ field: "occupancy", value: a.occupancy, unit: null, kind: lease ? "document" : "owner", label: lease ? `Lease ${lease.id}` : "Manager's report", on: "2026-11-01", ref: lease?.id ?? null, status: lease ? "verified" : "unverified" });
    add({ field: "title_status", value: deed ? deed.status : "missing", unit: null, kind: deed ? "document" : "owner", label: deed ? `Title deed ${deed.id}` : "No deed on file", on: deed?.issuedOn ?? a.acquiredOn, ref: deed?.id ?? null, status: deed ? (deedOk ? "verified" : "disputed") : "unverified" });
    add({ field: "value_egp", value: a.valueEgp, unit: "EGP", kind: byVal ? "valuation" : "seed", label: byVal ? `Valuation ${a.valueSource}` : "Opening value (sample)", on: a.valueSetOn, ref: a.valueSource, status: byVal ? "verified" : "unverified" });
    if (a.type === "land") add({ field: "permitted_use", value: n % 2 ? "residential" : "industrial", unit: null, kind: "owner", label: "Owner-reported, not yet checked with the planning authority", on: a.acquiredOn, ref: null, status: "unverified" });
    if (a.plotAreaSqm) add({ field: "plot_area_sqm", value: a.plotAreaSqm, unit: "m²", kind: deed ? "document" : "owner", label: deed ? `Title deed ${deed.id}` : "Owner-reported", on: a.acquiredOn, ref: deed?.id ?? null, status: "unverified" });
  }
  await db.insert(t.ownershipShares).values(own);
  await db.insert(t.buildings).values(blds);
  await db.insert(t.units).values(uns);
  await db.insert(t.assetVersions).values(vers);
  await db.insert(t.assetFacts).values(facts);

  // Instalment plans: the two newest New Capital purchases, paid quarterly to the developer.
  const plan = (assetId: string, start: string, n: number, amount: number, paidUpTo: string) => Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i * 3);
    const due = d.toISOString().slice(0, 10);
    return { id: `IN-${assetId}-${String(i + 1).padStart(2, "0")}`, assetId, seq: i + 1, dueOn: due, amountEgp: amount, paidOn: due <= paidUpTo ? due : null };
  });
  await db.insert(t.installments).values([...plan("A-011", "2024-03-01", 16, 410_000, "2026-09-30"), ...plan("A-012", "2025-01-15", 12, 360_000, "2026-08-31")]);
}
