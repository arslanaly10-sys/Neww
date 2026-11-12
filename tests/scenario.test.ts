import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDb } from "../src/db/client";
import { loadScenarioBase } from "../src/lib/scenario-data";
import { applyCaseOffsets, baseHash, resultHash, runCase, runScenario, scenarioIncome, valueFactors, type ScenarioInputs } from "../src/lib/scenario";
import { SCENARIO_ASSUMPTIONS as A } from "../src/lib/assumptions";
import { listScenarios, publishScenarioSet, reproduceScenario, runScenarioForUser, saveScenario, listScenarioSets } from "../src/lib/scenario-service";
import { getAggregateIncome } from "../src/lib/portfolio-data";
import { decideValuation, submitValuation, computeValuation } from "../src/lib/valuation-service";
import { GENESIS_HASH, auditHash } from "../src/lib/hash";
import { auditEvents } from "../src/db/schema";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const investor = U("u-investor", "investor"), m1 = U("u-manager-1", "manager"), m2 = U("u-manager-2", "manager");
const BASE: ScenarioInputs = { ...A.base };

describe("scenario engine", () => {
  it("returns the base values and zero change at the base assumptions", async () => {
    const base = await loadScenarioBase(await getDb());
    const c = runCase(base, BASE, A);
    expect(c.portfolio.changePct).toBe(0);
    for (const a of c.assets) { expect(a.value).toBe(a.baseValue); expect(a.risk).toBe(a.baseRisk); expect(a.yield).toBe(a.baseYield); }
  });
  it("base yield matches the portfolio net yield shown on the Portfolio page", async () => {
    const base = await loadScenarioBase(await getDb());
    const agg = await getAggregateIncome();
    const total = base.reduce((s, a) => s + a.valueEgp, 0);
    expect(runCase(base, BASE, A).portfolio.baseNetYield).toBeCloseTo(agg.net / total, 4);
  });
  it("moves value in the expected direction for every slider", async () => {
    const base = await loadScenarioBase(await getDb());
    const v = (o: Partial<ScenarioInputs>) => runCase(base, { ...BASE, ...o }, A).portfolio.value;
    const v0 = v({});
    expect(v({ rate: 35 })).toBeLessThan(v0);
    expect(v({ rate: 10 })).toBeGreaterThan(v0);
    expect(v({ vacancy: 40 })).toBeLessThan(v0);
    expect(v({ rentGrowth: 25 })).toBeGreaterThan(v0);
    expect(v({ rentGrowth: -5 })).toBeLessThan(v0);
    expect(v({ fx: 70 })).toBeGreaterThan(v0);
    expect(v({ fx: 40 })).toBeLessThan(v0);
  });
  it("vacancy only hits let assets; FX hits dollar-leased assets hardest", async () => {
    const base = await loadScenarioBase(await getDb());
    const c = runCase(base, { ...BASE, vacancy: 40 }, A);
    for (const a of c.assets) {
      const b = base.find((x) => x.id === a.id)!;
      if (b.occupancy === "let") expect(a.value).toBeLessThan(a.baseValue); else expect(a.value).toBe(a.baseValue);
    }
    const fx = runCase(base, { ...BASE, fx: 70 }, A);
    const usd = fx.assets.filter((a) => base.find((x) => x.id === a.id)!.leaseCurrency === "USD");
    expect(usd.length).toBe(2);
    const egpApartment = fx.assets.find((a) => base.find((x) => x.id === a.id)!.type === "apartment" && base.find((x) => x.id === a.id)!.leaseCurrency === "EGP")!;
    for (const a of usd) expect(a.changePct).toBeGreaterThan(egpApartment.changePct);
  });
  it("income reacts to the pound only through dollar rents", async () => {
    const base = await loadScenarioBase(await getDb());
    const egpOnly = base.find((a) => a.rentEgp > 0 && a.rentUsdAtBase === 0)!;
    const usdOne = base.find((a) => a.rentUsdAtBase > 0)!;
    expect(scenarioIncome(egpOnly, { ...BASE, fx: 70 }, A)).toBe(scenarioIncome(egpOnly, BASE, A));
    expect(scenarioIncome(usdOne, { ...BASE, fx: 70 }, A)).toBeGreaterThan(scenarioIncome(usdOne, BASE, A));
  });
  it("low <= central <= high for value, and cases respect the slider bounds", async () => {
    const base = await loadScenarioBase(await getDb());
    const r = runScenario(base, { fx: 50, rate: 24, vacancy: 0, rentGrowth: 8 }, A);
    expect(r.low.portfolio.value).toBeLessThan(r.central.portfolio.value);
    expect(r.central.portfolio.value).toBeLessThan(r.high.portfolio.value);
    const edge = applyCaseOffsets({ fx: 40, rate: 35, vacancy: 0, rentGrowth: -5 }, A.cases.low, A);
    expect(edge).toEqual({ fx: 40, rate: 35, vacancy: 10, rentGrowth: -5 });
    expect(applyCaseOffsets({ fx: 40, rate: 10, vacancy: 0, rentGrowth: 25 }, A.cases.high, A).vacancy).toBe(0);
  });
  it("risk rises under stress and stays at base otherwise", async () => {
    const base = await loadScenarioBase(await getDb());
    const stressed = runCase(base, { fx: 70, rate: 35, vacancy: 40, rentGrowth: -5 }, A);
    expect(stressed.portfolio.avgRisk).toBeGreaterThan(stressed.portfolio.baseAvgRisk);
    expect(stressed.portfolio.highRiskCount).toBeGreaterThanOrEqual(runCase(base, BASE, A).portfolio.highRiskCount);
    const letAsset = stressed.assets.find((a) => base.find((x) => x.id === a.id)!.occupancy === "let")!;
    expect(letAsset.risk).toBeGreaterThan(letAsset.baseRisk);
  });
  it("is deterministic and the hashes change when inputs or base data change", async () => {
    const base = await loadScenarioBase(await getDb());
    const a = resultHash(runScenario(base, { fx: 60, rate: 24, vacancy: 0, rentGrowth: 8 }, A));
    expect(a).toBe(resultHash(runScenario(base, { fx: 60, rate: 24, vacancy: 0, rentGrowth: 8 }, A)));
    expect(a).not.toBe(resultHash(runScenario(base, { fx: 61, rate: 24, vacancy: 0, rentGrowth: 8 }, A)));
    const changed = base.map((x, i) => (i === 0 ? { ...x, valueEgp: x.valueEgp + 1000 } : x));
    expect(baseHash(changed)).not.toBe(baseHash(base));
  });
  it("valueFactors are 1 at the base assumptions", () => {
    const f = valueFactors({ type: "villa", occupancy: "let", leaseCurrency: "USD" }, BASE, A);
    expect([f.cap, f.vac, f.rent, f.fx]).toEqual([1, 1, 1, 1]);
  });
});

describe("scenario service", () => {
  it("hides per-asset yield from the investor but keeps the aggregate", async () => {
    const inv = await runScenarioForUser(investor, { fx: 55, rate: 24, vacancy: 5, rentGrowth: 8 }, null);
    const mgr = await runScenarioForUser(m1, { fx: 55, rate: 24, vacancy: 5, rentGrowth: 8 }, null);
    if (!inv.ok || !mgr.ok) throw new Error("run");
    expect(inv.result.central.assets.every((a) => a.yield === null && a.baseYield === null)).toBe(true);
    expect(mgr.result.central.assets.some((a) => a.yield !== null)).toBe(true);
    expect(inv.result.central.portfolio.netYield).toBe(mgr.result.central.portfolio.netYield);
    expect(inv.result.central.portfolio.value).toBe(mgr.result.central.portfolio.value);
    expect(inv.resultHash).toBe(mgr.resultHash);
  });
  it("rejects values outside the slider ranges", async () => {
    expect(await runScenarioForUser(m1, { fx: 100, rate: 24, vacancy: 0, rentGrowth: 8 }, null)).toEqual({ ok: false, error: "invalid" });
    expect(await runScenarioForUser(m1, { fx: 50, rate: 24, vacancy: -1, rentGrowth: 8 }, null)).toEqual({ ok: false, error: "invalid" });
    expect(await runScenarioForUser(m1, { fx: 50, rate: 24, vacancy: 0, rentGrowth: 8 }, "AS-SCN-9.9.9")).toEqual({ ok: false, error: "not_found" });
  });
  it("lets only managers save; investors can run and reproduce", async () => {
    const inputs = { fx: 62, rate: 20, vacancy: 6, rentGrowth: 10 };
    expect(await saveScenario(investor, { name: "Mine", inputs, setId: "AS-SCN-1.0.0" })).toEqual({ ok: false, error: "forbidden" });
    expect(await saveScenario(m1, { name: "x", inputs, setId: "AS-SCN-1.0.0" })).toEqual({ ok: false, error: "name_required" });
    const saved = await saveScenario(m1, { name: "Test scenario", notes: "n", inputs, setId: "AS-SCN-1.0.0" });
    if (!saved.ok) throw new Error("save");
    expect((await listScenarios(investor)).some((s) => s.id === saved.id)).toBe(true);
    const rep = await reproduceScenario(investor, saved.id);
    expect(rep).toMatchObject({ ok: true, identical: true, assumptionsIntact: true, baseChanged: false });
  });
  it("seeded scenarios reproduce exactly", async () => {
    for (const id of ["SC-001", "SC-002"]) expect(await reproduceScenario(m1, id)).toMatchObject({ ok: true, identical: true });
  });
  it("a confirmed valuation changes the base: assumptions are intact but the result no longer matches", async () => {
    const saved = await saveScenario(m1, { name: "Before valuation", inputs: { fx: 55, rate: 22, vacancy: 0, rentGrowth: 8 }, setId: "AS-SCN-1.0.0" });
    if (!saved.ok) throw new Error("save");
    const inputs = { districtId: "new-cairo", type: "apartment" as const, areaSqm: 185, floor: 4, finish: "fully_finished" as const, buildingAge: 7 };
    const r = await computeValuation(m1, inputs);
    if (!r.ok) throw new Error("val");
    const sub = await submitValuation(investor, { inputs, assetId: "A-001", finalValueEgp: Math.round((r.result.estimateEgp * 1.05) / 1000) * 1000, reasonCode: "condition", reason: "Refurbished kitchen since last valuation." });
    if (!sub.ok) throw new Error("sub");
    await decideValuation(m2, sub.id, "approve");
    const rep = await reproduceScenario(m1, saved.id);
    expect(rep).toMatchObject({ ok: true, identical: false, assumptionsIntact: true, baseChanged: true });
  });
  it("publishes a new assumption version; older scenarios keep reproducing on the old one", async () => {
    expect(await publishScenarioSet(investor, { capRatePassThrough: 0.2, incomeWeightLet: 0.5, rentGrowthPassThrough: 1.5, note: "Investor attempt." })).toEqual({ ok: false, error: "forbidden" });
    expect(await publishScenarioSet(m1, { capRatePassThrough: 0.9, incomeWeightLet: 0.5, rentGrowthPassThrough: 1.5, note: "Too steep a pass-through." })).toEqual({ ok: false, error: "invalid" });
    const pub = await publishScenarioSet(m1, { capRatePassThrough: 0.25, incomeWeightLet: 0.6, rentGrowthPassThrough: 1.5, note: "Stiffer rate pass-through after review." });
    expect(pub).toMatchObject({ ok: true, id: "AS-SCN-1.1.0", version: "1.1.0" });
    const sets = await listScenarioSets();
    expect(sets.map((s) => s.id)).toEqual(["AS-SCN-1.1.0", "AS-SCN-1.0.0"]);
    const a = await runScenarioForUser(m1, { fx: 50, rate: 30, vacancy: 0, rentGrowth: 8 }, "AS-SCN-1.0.0");
    const b = await runScenarioForUser(m1, { fx: 50, rate: 30, vacancy: 0, rentGrowth: 8 }, "AS-SCN-1.1.0");
    if (!a.ok || !b.ok) throw new Error("run");
    expect(b.result.central.portfolio.value).toBeLessThan(a.result.central.portfolio.value); // stiffer pass-through, bigger fall
    expect(await reproduceScenario(m1, "SC-001")).toMatchObject({ ok: true, assumptionsIntact: true, setId: "AS-SCN-1.0.0" }); // still on the old version (the earlier confirmed valuation changed the base, so identical is false here)
  });
  it("keeps the audit chain valid after all of this", async () => {
    const db = await getDb();
    const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
    let prev = GENESIS_HASH;
    for (const e of rows) {
      expect(e.prevHash).toBe(prev);
      expect(e.hash).toBe(auditHash({ seq: e.seq, at: e.at.toISOString(), actorId: e.actorId, actorRole: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail }, prev));
      prev = e.hash;
    }
    expect(rows.filter((e) => e.action === "scenario.save").length).toBeGreaterThanOrEqual(4);
  });
});
