import { sql } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";
import { ASSETS, DISTRICTS, DISTRICT_TREND, MARKET_SOURCES, TENANTS, UPDATES, USERS, type AssetSeed } from "./seed-data";
import {
  DEMO_TODAY, DISTRICT_PPSQM, MACRO_ASSUMPTIONS, RISK_ASSUMPTIONS, SAMPLE_FX_EGP_PER_USD, SCENARIO_ASSUMPTIONS, VALUATION_ASSUMPTIONS,
} from "@/lib/assumptions";
import { GENESIS_HASH, auditHash, canonical, sha256, type AuditCore } from "@/lib/hash";
import { baseHash, resultHash, runScenario } from "@/lib/scenario";
import { loadScenarioBase } from "@/lib/scenario-data";
import { seedLeasing } from "./seed-leasing";
import { seedFinance } from "./seed-finance";
import { seedWork } from "./seed-work";
import { seedReports } from "./seed-reports";
import { seedNotifications } from "./seed-notifications";
import { seedCalendar } from "./seed-calendar";
import { seedDeals } from "./seed-deals";
import { estimateWithDrivers, makeMarket, marketFactorFromRatio, runValuation, type SaleRow } from "@/lib/valuation";

/** Deterministic PRNG so the demo looks identical on every boot. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 36 first-of-month dates ending at the latest full month before DEMO_TODAY. */
export function monthsWindow(): string[] {
  const end = new Date(`${DEMO_TODAY}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 35; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1 - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const YIELD: Record<string, number> = { apartment: 0.072, villa: 0.058, office: 0.105, retail: 0.115, mixed: 0.095 };

/** Seed-time value. Uses the live valuation engine's own estimator, so seeded values and engine output agree by construction. */
export function baseValue(a: Pick<AssetSeed, "d" | "type" | "area" | "floor" | "finish" | "built">, marketFactor = 1) {
  return estimateWithDrivers(
    { districtId: a.d, type: a.type, areaSqm: a.area, floor: a.floor, finish: a.finish, buildingAge: a.built === null ? null : Math.max(0, 2026 - a.built) },
    marketFactor,
  ).estimateEgp;
}

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())).toISOString().slice(0, 10);
};

export async function seed(db: DB) {
  const r = rng(20261112);
  const months = monthsWindow();
  const now = new Date(`${DEMO_TODAY}T09:00:00Z`);

  // Users and districts
  await db.insert(t.users).values(USERS.map((u) => ({ ...u })));
  await db.insert(t.districts).values(DISTRICTS.map((d) => ({ ...d, lat: String(d.lat), lng: String(d.lng), basePpsqm: DISTRICT_PPSQM[d.id] })));

  // Market series: price index, base 100 at first month, with a distinct last-three-months drift.
  const idx: Record<string, number[]> = {};
  const seriesRows: (typeof t.marketSeries.$inferInsert)[] = [];
  for (const d of DISTRICTS) {
    const tr = DISTRICT_TREND[d.id];
    let v = 100;
    idx[d.id] = months.map((m, i) => {
      if (i > 0) {
        const drift = i >= months.length - 3 ? tr.recent : tr.drift;
        v = v * (1 + (drift + (r() - 0.5) * 2 * tr.vol) / 100);
      }
      seriesRows.push({ districtId: d.id, month: m, priceIndex: v.toFixed(2) });
      return v;
    });
  }
  await db.insert(t.marketSeries).values(seriesRows);
  await db.insert(t.marketSources).values(MARKET_SOURCES.map((s) => ({ ...s, publishedOn: s.publishedOn })));

  // Assumption sets (versioned, hashed)
  const sets = [
    { id: "AS-VAL-1.0.0", kind: "valuation", version: "1.0.0", note: VALUATION_ASSUMPTIONS.note, payload: VALUATION_ASSUMPTIONS },
    { id: "AS-MAC-1.0.0", kind: "macro", version: "1.0.0", note: MACRO_ASSUMPTIONS.note, payload: MACRO_ASSUMPTIONS },
    { id: "AS-RISK-1.1.0", kind: "risk", version: "1.1.0", note: RISK_ASSUMPTIONS.note, payload: RISK_ASSUMPTIONS },
    { id: "AS-SCN-1.0.0", kind: "scenario", version: "1.0.0", note: SCENARIO_ASSUMPTIONS.note, payload: SCENARIO_ASSUMPTIONS },
  ];
  await db.insert(t.assumptionSets).values(
    sets.map((s) => ({ ...s, createdAt: new Date("2026-10-01T08:00:00Z"), author: "u-manager-1", contentHash: sha256(canonical(s.payload)) })),
  );

  // Tenants
  await db.insert(t.tenants).values(TENANTS.map((x, i) => ({ id: `T-${String(i + 1).padStart(3, "0")}`, ...x })));

  // Comparable sales: about 400, last 24 months, price = model-ish with noise.
  const saleTypes = ["apartment", "apartment", "apartment", "villa", "office", "retail", "mixed"] as const;
  const compounds = ["Sample Compound One", "Sample Compound Two", "Sample Compound Three", "Sample Heights", "Sample Gardens", "Sample Court"];
  const saleRows: (typeof t.comparableSales.$inferInsert)[] = [];
  for (let i = 0; i < 400; i++) {
    const d = DISTRICTS[Math.floor(r() * DISTRICTS.length)];
    const type = saleTypes[Math.floor(r() * saleTypes.length)];
    const area = type === "villa" ? 280 + Math.floor(r() * 300) : type === "mixed" ? 700 + Math.floor(r() * 500) : 90 + Math.floor(r() * 300);
    const floor = type === "villa" || type === "mixed" ? null : Math.floor(r() * 10);
    const finishes = ["semi_finished", "fully_finished", "fully_finished", "luxury", "core_shell"] as const;
    const finish = finishes[Math.floor(r() * finishes.length)];
    const built = 1975 + Math.floor(r() * 50);
    const mi = 12 + Math.floor(r() * 24);
    const soldOn = months[mi].slice(0, 8) + String(1 + Math.floor(r() * 27)).padStart(2, "0");
    const idxAt = marketFactorFromRatio(idx[d.id][mi] / idx[d.id][0]);
    const base = baseValue({ d: d.id, type, area, floor, finish, built: Math.min(built, 2026) }, idxAt);
    const price = Math.round((base * (1 + (r() - 0.5) * 0.24)) / 5000) * 5000;
    saleRows.push({
      id: `S-${String(i + 1).padStart(4, "0")}`, districtId: d.id, type, areaSqm: area, floor, finish, yearBuilt: built,
      soldOn, priceEgp: price, compound: compounds[Math.floor(r() * compounds.length)],
    });
  }
  await db.insert(t.comparableSales).values(saleRows);

  const saleList: SaleRow[] = saleRows.map((x) => ({ ...(x as SaleRow) }));
  const market = makeMarket(seriesRows);

  // Assets
  const assetRows: (typeof t.assets.$inferInsert)[] = [];
  const leaseRows: (typeof t.leases.$inferInsert)[] = [];
  const cashRows: (typeof t.cashflows.$inferInsert)[] = [];
  const histRows: (typeof t.valueHistory.$inferInsert)[] = [];
  const docRows: (typeof t.documents.$inferInsert)[] = [];
  const valuationRows: (typeof t.valuations.$inferInsert)[] = [];
  /** Clauses are stored as codes and translated at render time, so the Arabic view is native, not English text. */
  const clauseText = (idx: number) => ({
    break: idx % 3 === 0 ? "after12m90d" : "none",
    renewal: idx % 2 === 0 ? "tenantFirstRight" : "mutual",
    sublet: "consentRequired",
    governingLaw: "egypt",
  });

  let leaseNo = 10;
  let docNo = 100;
  let valNo = 0;
  const missingDeed = new Set([5, 11, 25]);
  const expiredInsurance = new Set([3, 17]);
  const pendingDoc = new Set([9, 22]);

  ASSETS.forEach((a, i) => {
    const id = `A-${String(i + 1).padStart(3, "0")}`;
    const dIdx = idx[a.d];
    const value = baseValue(a, market.now(a.d));
    const yearsHeld = Math.max(0.3, (new Date(DEMO_TODAY).getTime() - new Date(a.acquired).getTime()) / 31557600000);
    const cost = Math.round((value / Math.pow(1.13 + (r() - 0.5) * 0.04, yearsHeld)) / 1000) * 1000;
    const d = DISTRICTS.find((x) => x.id === a.d)!;
    const lat = (d.lat + (r() - 0.5) * 0.04).toFixed(5);
    const lng = (d.lng + (r() - 0.5) * 0.04).toFixed(5);
    const valueSetOn = addMonths(DEMO_TODAY, -(1 + Math.floor(r() * 10)));
    const hasVal = i % 2 === 0;
    let valueSource = "seed";
    if (hasVal) {
      valNo++;
      const vid = `V-${String(valNo).padStart(4, "0")}`;
      valueSource = vid;
      valuationRows.push({
        id: vid, assetId: id, assumptionSetId: "AS-VAL-1.0.0",
        inputs: { district: a.d, type: a.type, areaSqm: a.area, floor: a.floor, finish: a.finish, built: a.built },
        result: runValuation({ districtId: a.d, type: a.type, areaSqm: a.area, floor: a.floor, finish: a.finish, buildingAge: a.built === null ? null : Math.max(0, 2026 - a.built) }, saleList, market),
        modelEstimateEgp: value, finalValueEgp: value, adjustmentReasonCode: null, adjustmentReason: null,
        status: "confirmed", requiredApprovals: 1, approvals: [{ userId: "u-manager-2", at: `${valueSetOn}T11:00:00.000Z` }],
        proposedBy: "u-manager-1", confirmedBy: "u-manager-2",
        createdAt: new Date(`${valueSetOn}T09:00:00Z`), confirmedAt: new Date(`${valueSetOn}T11:00:00Z`),
      });
    }
    assetRows.push({
      id, name: a.name, nameAr: a.nameAr, districtId: a.d, type: a.type, compound: a.compound,
      areaSqm: a.area, floor: a.floor, finish: a.finish, yearBuilt: a.built, acquiredOn: a.acquired,
      costEgp: cost, valueEgp: value, valueSetOn, valueSource,
      occupancy: a.occ, vacantSince: a.vacantSince ?? null, lat, lng,
    });

    // 36-month value history: follows the district index; only months after acquisition.
    months.forEach((m, mi) => {
      if (m < a.acquired.slice(0, 7) + "-01") return;
      const noise = 1 + (r() - 0.5) * 0.01;
      const v = Math.round((value * (dIdx[mi] / dIdx[dIdx.length - 1]) * 0.94 + value * 0.06) * noise / 1000) * 1000;
      histRows.push({ assetId: id, month: m, valueEgp: m === months[months.length - 1] ? value : v, source: "seed-index" });
    });

    // Lease and cash flows
    if (a.lease) {
      leaseNo++;
      const lid = `L-${String(leaseNo).padStart(3, "0")}`;
      const grossYield = YIELD[a.type] ?? 0.07;
      const monthlyEgp = Math.round((value * grossYield) / 12 / 500) * 500;
      const rentCur = a.lease.usd ? Math.round(monthlyEgp / SAMPLE_FX_EGP_PER_USD / 50) * 50 : monthlyEgp;
      leaseRows.push({
        id: lid, assetId: id, tenantId: `T-${String(a.lease.tenant + 1).padStart(3, "0")}`,
        startDate: a.lease.start, endDate: a.lease.end, monthlyRent: rentCur, currency: a.lease.usd ? "USD" : "EGP",
        annualIndexationPct: a.lease.indexation.toFixed(2), depositMonths: a.lease.deposit, clauses: clauseText(i),
      });
      docRows.push({
        id: `D-${++docNo}`, assetId: id, kind: "lease", title: `Lease ${lid}`, status: "verified",
        issuedOn: a.lease.start, expiresOn: a.lease.end,
        sampleFile: i === 0 ? "sample-lease-en.pdf" : i === 12 ? "sample-lease-bilingual.pdf" : null,
      });
      const rentEgp = a.lease.usd ? rentCur * SAMPLE_FX_EGP_PER_USD : rentCur;
      months.slice(-12).forEach((m) => cashRows.push({ id: `C-${id}-${m}-rent`, assetId: id, month: m, kind: "rent", amountEgp: rentEgp }));
    }
    if (a.occ !== "land") {
      months.slice(-12).forEach((m) => {
        const sc = Math.round((a.area * 38 * (1 + (r() - 0.5) * 0.1)) / 10) * 10;
        cashRows.push({ id: `C-${id}-${m}-sc`, assetId: id, month: m, kind: "service_charge", amountEgp: -sc });
        if (parseInt(m.slice(5, 7)) % 3 === 0)
          cashRows.push({ id: `C-${id}-${m}-mt`, assetId: id, month: m, kind: "maintenance", amountEgp: -Math.round(value * 0.0004 * (0.5 + r())) });
      });
      cashRows.push({ id: `C-${id}-tax`, assetId: id, month: months[months.length - 6], kind: "tax", amountEgp: -Math.round(value * 0.0012) });
    }

    // Documents
    const deedStatus = missingDeed.has(i) ? "missing" : pendingDoc.has(i) ? "pending" : "verified";
    docRows.push({
      id: `D-${++docNo}`, assetId: id, kind: "title_deed", title: "Registered title deed", status: deedStatus,
      issuedOn: deedStatus === "missing" ? null : a.acquired, expiresOn: null,
      sampleFile: i === 1 ? "sample-deed-ar.pdf" : null,
    });
    if (a.occ !== "land") {
      const exp = expiredInsurance.has(i);
      docRows.push({
        id: `D-${++docNo}`, assetId: id, kind: "insurance", title: "Property insurance certificate", status: exp ? "expired" : "verified",
        issuedOn: exp ? "2025-10-01" : "2026-05-01", expiresOn: exp ? "2026-10-01" : "2027-05-01", sampleFile: null,
      });
    }
    docRows.push({
      id: `D-${++docNo}`, assetId: id, kind: "valuation_report", title: `Valuation report ${valueSetOn.slice(0, 7)}`,
      status: "verified", issuedOn: valueSetOn, expiresOn: addMonths(valueSetOn, 12), sampleFile: null,
    });
  });

  // Two valuations waiting for review: one from the investor with a large adjustment (needs two approvers), one from a manager.
  const pending: { assetIdx: number; by: string; pct: number; code: string; reason: string }[] = [
    { assetIdx: 1, by: "u-investor", pct: 0.12, code: "recent_comparable", reason: "A nearby unit in the same building sold above the model range last month." },
    { assetIdx: 7, by: "u-manager-2", pct: -0.03, code: "condition", reason: "Survey notes deferred façade maintenance; reduce slightly until works are done." },
  ];
  const pendingApprovals: (typeof t.approvals.$inferInsert)[] = [];
  pending.forEach((p, k) => {
    const a = ASSETS[p.assetIdx];
    const res = runValuation({ districtId: a.d, type: a.type, areaSqm: a.area, floor: a.floor, finish: a.finish, buildingAge: a.built === null ? null : Math.max(0, 2026 - a.built) }, saleList, market);
    const final = Math.round((res.estimateEgp * (1 + p.pct)) / 1000) * 1000;
    const vid = `V-${String(valNo + 1 + k).padStart(4, "0")}`;
    const at = new Date(Date.UTC(2026, 10, 9 + k, 10));
    valuationRows.push({
      id: vid, assetId: `A-${String(p.assetIdx + 1).padStart(3, "0")}`, assumptionSetId: "AS-VAL-1.0.0",
      inputs: res.inputs, result: res, modelEstimateEgp: res.estimateEgp, finalValueEgp: final,
      adjustmentReasonCode: p.code, adjustmentReason: p.reason, status: "in_review",
      requiredApprovals: Math.abs(p.pct) > VALUATION_ASSUMPTIONS.adjustment.secondApproverAbovePct ? 2 : 1, approvals: [],
      proposedBy: p.by, createdAt: at,
    });
    pendingApprovals.push({ id: `AP-${String(k + 1).padStart(3, "0")}`, kind: "valuation", refId: vid, proposedBy: p.by, routeRole: "manager", status: "pending", createdAt: at });
  });

  // A Horus-style draft waiting for a different manager, and a role-change request waiting for the administrator.
  const draftApprovedAt = new Date(Date.UTC(2026, 10, 11, 9));
  pendingApprovals.push(
    { id: "AP-003", kind: "update_draft", refId: "U-012", proposedBy: "u-manager-1", routeRole: "manager", status: "pending", createdAt: draftApprovedAt },
    { id: "AP-004", kind: "role_change", refId: "u-investor", proposedBy: "u-manager-2", routeRole: "admin", status: "pending", note: "Request: let the investor role read income lines for one asset during the Q4 review (demo: the decision is recorded, no role changes).", createdAt: new Date(Date.UTC(2026, 10, 11, 12)) },
  );

  await db.insert(t.assets).values(assetRows);
  await db.insert(t.leases).values(leaseRows);
  await db.insert(t.cashflows).values(cashRows);
  await db.insert(t.documents).values(docRows);
  await db.insert(t.valuations).values(valuationRows);
  await db.insert(t.approvals).values(pendingApprovals);
  await db.insert(t.valueHistory).values(histRows);


  // Investor updates (bilingual)
  await db.insert(t.investorUpdates).values(
    UPDATES.map((u, i) => ({
      id: `U-${String(i + 1).padStart(3, "0")}`,
      postedOn: new Date(Date.UTC(2026, 10, 10 - i * 7)).toISOString().slice(0, 10),
      title: u.title, titleAr: u.titleAr, body: u.body, bodyAr: u.bodyAr,
      status: i === UPDATES.length - 1 ? "draft" : "published",
      authorId: "u-manager-1",
      assetId: u.assetIdx !== undefined ? `A-${String(u.assetIdx + 1).padStart(3, "0")}` : null,
    })),
  );

  // Audit chain genesis: seeded confirmations, each hash includes the previous hash.
  const events: AuditCore[] = [
    { seq: 1, at: "2026-10-01T08:00:00.000Z", actorId: "system", actorRole: "system", action: "seed.genesis", entity: "database", entityId: "seed", detail: { note: "Deterministic sample dataset created", assets: ASSETS.length } },
    { seq: 2, at: "2026-10-01T08:05:00.000Z", actorId: "u-manager-1", actorRole: "manager", action: "assumptions.publish", entity: "assumption_set", entityId: "AS-VAL-1.0.0", detail: { hash: sha256(canonical(VALUATION_ASSUMPTIONS)) } },
    { seq: 3, at: "2026-10-01T08:06:00.000Z", actorId: "u-manager-1", actorRole: "manager", action: "assumptions.publish", entity: "assumption_set", entityId: "AS-MAC-1.0.0", detail: { hash: sha256(canonical(MACRO_ASSUMPTIONS)) } },
    { seq: 4, at: "2026-10-01T08:07:00.000Z", actorId: "u-manager-1", actorRole: "manager", action: "assumptions.publish", entity: "assumption_set", entityId: "AS-RISK-1.1.0", detail: { hash: sha256(canonical(RISK_ASSUMPTIONS)) } },
    ...valuationRows.slice(0, 6).map((v, k): AuditCore => ({
      seq: 5 + k, at: new Date(Date.UTC(2026, 9, 2 + k, 11)).toISOString(), actorId: "u-manager-2", actorRole: "manager",
      action: "valuation.confirm", entity: "valuation", entityId: v.id as string, detail: { assetId: v.assetId, valueEgp: v.finalValueEgp, proposedBy: "u-manager-1" },
    })),
  ];
  pending.forEach((p, k) => events.push({
    seq: events.length + 1, at: new Date(Date.UTC(2026, 10, 9 + k, 10)).toISOString(), actorId: p.by, actorRole: p.by === "u-investor" ? "investor" : "manager",
    action: "valuation.propose", entity: "valuation", entityId: `V-${String(valNo + 1 + k).padStart(4, "0")}`, detail: { assetId: `A-${String(p.assetIdx + 1).padStart(3, "0")}`, adjustmentPct: p.pct * 100, reasonCode: p.code },
  }));
  events.push(
    { seq: 0, at: draftApprovedAt.toISOString(), actorId: "u-manager-1", actorRole: "manager", action: "update.draft", entity: "investor_update", entityId: "U-012", detail: { title: "Draft: year-end investor letter" } },
    { seq: 0, at: new Date(Date.UTC(2026, 10, 11, 12)).toISOString(), actorId: "u-manager-2", actorRole: "manager", action: "role.change.request", entity: "user", entityId: "u-investor", detail: { requested: "income lines read access, one asset", demo: true } },
  );

  // Two saved scenarios, so the register and reproducibility are visible from the first load.
  const scnBase = await loadScenarioBase(db);
  const savedScenarios = [
    { id: "SC-001", name: "Weaker pound", notes: "Pound at 60 per dollar, everything else at the base assumptions.", inputs: { fx: 60, rate: 24, vacancy: 0, rentGrowth: 8 } },
    { id: "SC-002", name: "Rates ease, rents soften", notes: "Policy rate 18, rent growth 4, vacancy shock 8.", inputs: { fx: 50, rate: 18, vacancy: 8, rentGrowth: 4 } },
  ];
  const scnRows = savedScenarios.map((sc, k) => {
    const res = runScenario(scnBase, sc.inputs, SCENARIO_ASSUMPTIONS);
    return { ...sc, ownerId: "u-manager-1", assumptionSetId: "AS-SCN-1.0.0", contentHash: sha256(canonical(SCENARIO_ASSUMPTIONS)), baseHash: baseHash(scnBase), resultHash: resultHash(res), createdAt: new Date(Date.UTC(2026, 9, 20 + k, 9)) };
  });
  await db.insert(t.scenarios).values(scnRows);
  scnRows.forEach((sc) => events.push({ seq: events.length + 1, at: sc.createdAt.toISOString(), actorId: "u-manager-1", actorRole: "manager", action: "scenario.save", entity: "scenario", entityId: sc.id, detail: { name: sc.name, assumptionSet: "AS-SCN-1.0.0", resultHash: sc.resultHash } }));
  events.splice(3, 0, { seq: 0, at: "2026-10-01T08:08:00.000Z", actorId: "u-manager-1", actorRole: "manager", action: "assumptions.publish", entity: "assumption_set", entityId: "AS-SCN-1.0.0", detail: { hash: sha256(canonical(SCENARIO_ASSUMPTIONS)) } });
  events.forEach((e, i) => { e.seq = i + 1; });
  let prev = GENESIS_HASH;
  const auditRows = events.map((e) => {
    const hash = auditHash(e, prev);
    const row = { ...e, at: new Date(e.at), prevHash: prev, hash };
    prev = hash;
    return row;
  });
  await db.insert(t.auditEvents).values(auditRows);
  await seedLeasing(db);
  await seedFinance(db);
  await seedWork(db);
  await seedReports(db);
  await seedNotifications(db);
  await seedCalendar(db);
  await seedDeals(db);
  void now;
  await db.execute(sql`analyze`);
}
