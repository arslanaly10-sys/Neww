import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { assets, auditEvents, valuations, valueHistory } from "../src/db/schema";
import { estimateWithDrivers, makeMarket, runValuation, selectComps, marketFactorFromRatio, type SaleRow, type ValuationInputs } from "../src/lib/valuation";
import { computeValuation, decideValuation, submitValuation } from "../src/lib/valuation-service";
import { GENESIS_HASH, auditHash } from "../src/lib/hash";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const investor = U("u-investor", "investor"), m1 = U("u-manager-1", "manager"), m2 = U("u-manager-2", "manager"), admin = U("u-admin", "admin");

const inputs: ValuationInputs = { districtId: "new-cairo", type: "apartment", areaSqm: 150, floor: 4, finish: "fully_finished", buildingAge: 5 };
const flat = makeMarket([{ districtId: "new-cairo", month: "2023-11-01", priceIndex: 100 }, { districtId: "new-cairo", month: "2026-10-01", priceIndex: 130 }]);
const sale = (i: number, over: Partial<SaleRow> = {}): SaleRow => ({ id: `S-${i}`, districtId: "new-cairo", type: "apartment", areaSqm: 150, floor: 4, finish: "fully_finished", yearBuilt: 2021, soldOn: "2026-08-01", priceEgp: 14_000_000, compound: "X", ...over });

describe("valuation engine", () => {
  it("is deterministic", () => {
    const sales = [1, 2, 3, 4, 5, 6].map((i) => sale(i, { priceEgp: 14_000_000 + i * 100_000 }));
    expect(JSON.stringify(runValuation(inputs, sales, flat))).toBe(JSON.stringify(runValuation(inputs, sales, flat)));
  });
  it("drivers multiply out to the estimate and the last driver ends at it", () => {
    const e = estimateWithDrivers(inputs, 1.2);
    const product = e.drivers.filter((d) => d.factor !== null).reduce((p, d) => p * (d.factor as number), 1);
    expect(Math.abs(inputs.areaSqm * e.basePpsqm * product - e.estimateEgp)).toBeLessThan(1000);
    expect(e.drivers[e.drivers.length - 1].valueAfterEgp).toBeCloseTo(e.estimateEgp, -3);
    expect(e.drivers.reduce((s, d) => s + d.deltaEgp, 0)).toBeCloseTo(e.drivers[e.drivers.length - 1].valueAfterEgp, -1);
  });
  it("applies floor, finish, type and age in the expected direction", () => {
    const v = (o: Partial<ValuationInputs>) => estimateWithDrivers({ ...inputs, ...o }, 1).estimateEgp;
    expect(v({ floor: 0 })).toBeLessThan(v({ floor: 4 }));
    expect(v({ floor: 10 })).toBeGreaterThan(v({ floor: 4 }));
    expect(v({ finish: "luxury" })).toBeGreaterThan(v({ finish: "core_shell" }));
    expect(v({ buildingAge: 40 })).toBeLessThan(v({ buildingAge: 0 }));
    expect(v({ type: "villa", floor: 0 })).toBe(v({ type: "villa", floor: 30 })); // villas ignore floor
    expect(v({ buildingAge: 25 })).toBe(v({ buildingAge: 60 })); // age curve flattens at 25 years
  });
  it("market factor is damped", () => expect(marketFactorFromRatio(1.5)).toBeCloseTo(0.94 * 1.5 + 0.06, 10));
  it("selects at most five comps, preferring the same district", () => {
    const sales = [...[1, 2, 3, 4, 5, 6].map((i) => sale(i, { districtId: "maadi" })), sale(7), sale(8)];
    const c = selectComps(inputs, sales, flat);
    expect(c).toHaveLength(5);
    expect(c[0].sameDistrict).toBe(true);
    expect(c.filter((x) => x.sameDistrict).length).toBeGreaterThanOrEqual(2);
  });
  it("gives high confidence for five tight, recent, same-district comps", () => {
    const sales = [1, 2, 3, 4, 5].map((i) => sale(i, { priceEgp: 14_000_000 + i * 20_000 }));
    expect(runValuation(inputs, sales, flat).confidence.level).toBe("high");
  });
  it("gives low confidence and the widest cap when there are no comps", () => {
    const r = runValuation({ ...inputs, type: "land", floor: null }, [], flat);
    expect(r.confidence.level).toBe("low");
    expect(r.spreadPct).toBe(25);
    expect(r.compsImpliedEgp).toBeNull();
  });
  it("widens the range when comparables disagree", () => {
    const tight = runValuation(inputs, [1, 2, 3, 4, 5].map((i) => sale(i, { priceEgp: 14_000_000 + i * 10_000 })), flat);
    const loose = runValuation(inputs, [1, 2, 3, 4, 5].map((i) => sale(i, { priceEgp: 10_000_000 + i * 1_500_000 })), flat);
    expect(loose.spreadPct).toBeGreaterThan(tight.spreadPct);
    expect(loose.lowEgp).toBeLessThan(loose.estimateEgp);
    expect(loose.highEgp).toBeGreaterThan(loose.estimateEgp);
  });
  it("rejects an unknown district", () => expect(() => estimateWithDrivers({ ...inputs, districtId: "nowhere" }, 1)).toThrow());
});

describe("valuation workflow", () => {
  it("investor may run but the result is recomputed on the server", async () => {
    const r = await computeValuation(investor, { ...inputs });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.comps).toHaveLength(5);
  });
  it("the administrator cannot run a valuation", async () => {
    expect((await computeValuation(admin, inputs)).ok).toBe(false);
  });
  it("rejects invalid input", async () => {
    expect(await computeValuation(investor, { ...inputs, areaSqm: -5 })).toEqual({ ok: false, error: "invalid" });
  });
  it("requires a coded and written reason for any adjustment", async () => {
    const r = await computeValuation(investor, inputs);
    if (!r.ok) throw new Error("setup");
    const base = { inputs, assetId: null, finalValueEgp: r.result.estimateEgp + 500_000, reasonCode: null, reason: null };
    expect(await submitValuation(investor, base)).toEqual({ ok: false, error: "reason_required" });
    expect(await submitValuation(investor, { ...base, reasonCode: "condition", reason: "short" })).toEqual({ ok: false, error: "reason_required" });
    expect(await submitValuation(investor, { ...base, finalValueEgp: r.result.estimateEgp * 3, reasonCode: "condition", reason: "A long enough written reason." })).toEqual({ ok: false, error: "out_of_range" });
  });
  it("small adjustment needs one approval; the proposer cannot confirm; another manager can; the portfolio and audit update", async () => {
    const db = await getDb();
    const [asset] = await db.select().from(assets).where(eq(assets.id, "A-003"));
    const r = await computeValuation(m1, { districtId: asset.districtId, type: asset.type, areaSqm: asset.areaSqm, floor: asset.floor, finish: asset.finish, buildingAge: 8 });
    if (!r.ok) throw new Error("setup");
    const final = Math.round((r.result.estimateEgp * 1.04) / 1000) * 1000;
    const sub = await submitValuation(m1, { inputs: { districtId: asset.districtId, type: asset.type, areaSqm: asset.areaSqm, floor: asset.floor, finish: asset.finish, buildingAge: 8 }, assetId: "A-003", finalValueEgp: final, reasonCode: "recent_comparable", reason: "Neighbouring villa sold higher last month." });
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    expect(sub.requiredApprovals).toBe(1);

    expect(await decideValuation(m1, sub.id, "approve")).toEqual({ ok: false, error: "self_approval" }); // separation of duties
    expect(await decideValuation(investor, sub.id, "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(await decideValuation(admin, sub.id, "approve")).toEqual({ ok: false, error: "forbidden" });
    const done = await decideValuation(m2, sub.id, "approve");
    expect(done).toMatchObject({ ok: true, status: "confirmed" });

    const [after] = await db.select().from(assets).where(eq(assets.id, "A-003"));
    expect(after.valueEgp).toBe(final);
    expect(after.valueSource).toBe(sub.id);
    const [hist] = await db.select().from(valueHistory).where(sql`${valueHistory.assetId} = 'A-003' and ${valueHistory.source} = ${sub.id}`);
    expect(hist.valueEgp).toBe(final);
    expect(await decideValuation(m2, sub.id, "approve")).toEqual({ ok: false, error: "not_in_review" });

    const events = await db.select().from(auditEvents).orderBy(auditEvents.seq);
    expect(events.filter((e) => e.entityId === sub.id).map((e) => e.action)).toEqual(["valuation.propose", "valuation.confirm"]);
    let prev = GENESIS_HASH;
    for (const e of events) {
      expect(e.prevHash).toBe(prev);
      expect(e.hash).toBe(auditHash({ seq: e.seq, at: e.at.toISOString(), actorId: e.actorId, actorRole: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail }, prev));
      prev = e.hash;
    }
  });
  it("an adjustment above 10% needs two different managers; an investor's proposal can be approved by both", async () => {
    const db = await getDb();
    const r = await computeValuation(investor, inputs);
    if (!r.ok) throw new Error("setup");
    const sub = await submitValuation(investor, { inputs, assetId: null, finalValueEgp: Math.round((r.result.estimateEgp * 1.15) / 1000) * 1000, reasonCode: "location_premium", reason: "Corner unit with garden frontage." });
    if (!sub.ok) throw new Error("setup");
    expect(sub.requiredApprovals).toBe(2);
    expect(await decideValuation(m1, sub.id, "approve")).toMatchObject({ ok: true, status: "in_review", approvals: 1, required: 2 });
    expect(await decideValuation(m1, sub.id, "approve")).toEqual({ ok: false, error: "already_approved" });
    expect(await decideValuation(m2, sub.id, "approve")).toMatchObject({ ok: true, status: "confirmed" });
    const [v] = await db.select().from(valuations).where(eq(valuations.id, sub.id));
    expect(v.status).toBe("confirmed");
  });
  it("a rejection ends the review and leaves the asset untouched", async () => {
    const db = await getDb();
    const [before] = await db.select().from(assets).where(eq(assets.id, "A-001"));
    const r = await computeValuation(investor, inputs);
    if (!r.ok) throw new Error("setup");
    const sub = await submitValuation(investor, { inputs, assetId: "A-001", finalValueEgp: null, reasonCode: null, reason: null });
    if (!sub.ok) throw new Error("setup");
    expect(await decideValuation(m2, sub.id, "reject")).toMatchObject({ ok: true, status: "rejected" });
    const [after] = await db.select().from(assets).where(eq(assets.id, "A-001"));
    expect(after.valueEgp).toBe(before.valueEgp);
  });
  it("the database itself refuses a proposer updating their own valuation, even if the app were bypassed", async () => {
    const { withSession } = await import("../src/db/client");
    const rows = await withSession({ role: "manager", userId: "u-manager-2" }, (tx) => tx.execute(sql`update valuations set status = 'confirmed' where proposed_by = 'u-manager-2' and status = 'in_review' returning id`));
    expect(rows.rows).toHaveLength(0);
  });
});
