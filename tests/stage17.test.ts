import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "17.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { comparableSales, intakes, leads, marketSeries, valuationRuns } from "../src/db/schema";
import { makeMarket } from "../src/lib/valuation";
import { costMethod, deflate, incomeMethod, IntakeSchema, offPlanMethod, runHorus, type Sale } from "../src/lib/horus-engine";
import { getIntakeResult, getRun, listRuns, reviewRun, saveIntakeContact, startAssetRun, submitIntake } from "../src/lib/horus-runs";
import { getAssetRecord } from "../src/lib/asset-record";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst");
const src = { market: { label: "Index", date: "2026-10-01" } };
async function evidence() {
  const db = await getDb();
  return { sales: (await db.select().from(comparableSales)) as Sale[], market: makeMarket(await db.select().from(marketSeries)) };
}

describe("intake", () => {
  it("asks for the right size field per type, and rejects a handover in the past", () => {
    expect(IntakeSchema.safeParse({ type: "apartment", districtId: "maadi" }).success).toBe(false);
    expect(IntakeSchema.safeParse({ type: "land", districtId: "maadi", areaSqm: 500 }).success).toBe(false);
    expect(IntakeSchema.safeParse({ type: "land", districtId: "maadi", plotAreaSqm: 500 }).success).toBe(true);
    expect(IntakeSchema.safeParse({ type: "apartment", districtId: "maadi", areaSqm: 150, status: "off_plan", deliveryOn: "2025-01-01" }).success).toBe(false);
    const p = IntakeSchema.parse({ type: "apartment", districtId: "maadi", areaSqm: "150", floor: "", amenities: ["view"] });
    expect([p.areaSqm, p.floor, p.amenities]).toEqual([150, null, ["view"]]);
  });
});

describe("the engine", () => {
  it("is deterministic and explains itself: methods, weights adding to 1, labelled evidence, range around the value", async () => {
    const { sales, market } = await evidence();
    const i = IntakeSchema.parse({ type: "apartment", districtId: "new-cairo", areaSqm: 180, floor: 4, yearBuilt: 2018, condition: "fully_finished", amenities: ["parking", "view"] });
    const a = runHorus(i, sales, market, src), b = runHorus(i, sales, market, src);
    expect(a).toEqual(b);
    expect(a.modelVersion).toBe("HORUS-2.0.0");
    expect(a.methods.reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1, 2);
    expect(a.lowEgp).toBeLessThan(a.valueEgp);
    expect(a.highEgp).toBeGreaterThan(a.valueEgp);
    expect(a.comps.length).toBe(8);
    expect(a.evidence.transaction + a.evidence.signed + a.evidence.asking).toBe(a.evidence.n);
    for (const c of a.comps) {
      const factor = Object.values(c.adjustments).reduce((p, x) => p * (1 + x), 1);
      expect(Math.abs(c.adjustedPpsqm - c.ppsqm * factor) / c.adjustedPpsqm).toBeLessThan(0.01);
      if (c.evidenceKind === "asking") expect(c.adjustments.asking).toBe(-0.06);
      if (c.paymentTerms === "installments") expect(c.adjustments.terms).toBe(-0.08);
    }
    expect(a.sources.map((s) => s.kind)).toEqual(expect.arrayContaining(["comparables", "index", "assumptions", "cpi"]));
    expect(a.views.usd.value).toBe(Math.round(a.valueEgp / 50));
  });
  it("lowers confidence, and names why, for thin or distant evidence and missing inputs", async () => {
    const { sales, market } = await evidence();
    const good = runHorus(IntakeSchema.parse({ type: "apartment", districtId: "new-cairo", areaSqm: 180, floor: 4, yearBuilt: 2018, condition: "fully_finished" }), sales, market, src);
    const far = runHorus(IntakeSchema.parse({ type: "apartment", districtId: "other", areaSqm: 180 }), sales, market, src);
    expect(far.confidence.score).toBeLessThan(good.confidence.score);
    expect(far.confidence.factors.map((f) => f.id)).toEqual(expect.arrayContaining(["otherRegion", "missingInputs"]));
    expect(far.missing).toEqual(expect.arrayContaining(["yearBuilt", "condition", "floor"]));
    expect(far.highEgp / far.lowEgp).toBeGreaterThan(good.highEgp / good.lowEgp);
    const land = runHorus(IntakeSchema.parse({ type: "land", districtId: "sheikh-zayed", plotAreaSqm: 2000 }), sales, market, src);
    expect(land.methods.find((m) => m.id === "cost")!.weight).toBe(1);
    expect(land.confidence.factors.map((f) => f.id)).toContain("landIndex");
  });
  it("income: capitalised net income with a 5-year cash-flow check", () => {
    const r = incomeMethod(IntakeSchema.parse({ type: "office", districtId: "maadi", areaSqm: 200, monthlyRentEgp: 100000 }))!;
    const noi = 1_200_000 * 0.9 * 0.88;
    expect(r.workings.noi).toBe(Math.round(noi));
    expect(r.value).toBeCloseTo(noi / 0.105, 0);
    expect(r.workings.dcfValue).toBeGreaterThan(0);
    expect(incomeMethod(IntakeSchema.parse({ type: "office", districtId: "maadi", areaSqm: 200 }))).toBeNull();
  });
  it("cost: land plus the depreciated rebuild; villas separate plot from building", () => {
    const r = costMethod(IntakeSchema.parse({ type: "villa", districtId: "new-cairo", areaSqm: 400, plotAreaSqm: 900, yearBuilt: 2016, condition: "fully_finished" }))!;
    expect(r.workings.depreciationPct).toBe(15);
    expect(r.workings.buildingValue).toBe(Math.round(400 * 27000 * 0.85));
    expect(r.value).toBe(Number(r.workings.landValue) + Number(r.workings.buildingValue));
  });
  it("off-plan: the finished value discounted for the wait; instalments in present value below their nominal sum", () => {
    const r = offPlanMethod(IntakeSchema.parse({ type: "apartment", districtId: "new-capital", areaSqm: 150, status: "off_plan", deliveryOn: "2028-11-12", installmentBalanceEgp: 2_400_000, installmentMonthsLeft: 24 }), 10_000_000)!;
    expect(Math.abs(r.value - 10_000_000 / 1.12 / 1.12)).toBeLessThan(5000); // months are counted by days
    expect(Number(r.workings.instalmentsPresentValue)).toBeLessThan(2_400_000);
    expect(r.workings.ownerEquity).toBe(Math.round(r.value - Number(r.workings.instalmentsPresentValue)));
  });
  it("inflation view: deflates to the prices of a past month, clearly with its source", () => {
    expect(deflate(203_100, "2023-01")).toEqual({ valueEgp: 100_000, deflator: 2.031 });
  });
});

describe("the public questionnaire", () => {
  it("saves an illustrative run behind an unguessable id, and turns a contact into a request", async () => {
    const r = await submitIntake({ type: "villa", districtId: "sheikh-zayed", areaSqm: 350, plotAreaSqm: 800, condition: "fully_finished", amenities: ["garden", "pool"] }, "en", "9.9.9.1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toMatch(/^IK-[A-Za-z0-9_-]{12}$/);
    const res = (await getIntakeResult(r.id))!;
    expect(res.run).toMatchObject({ status: "illustrative", createdBy: "public", assetId: null });
    expect(res.run.result.methods.find((m) => m.id === "cost")!.weight).toBeGreaterThan(0);
    expect(await getIntakeResult("IK-doesnotexist00")).toBeNull();
    expect(await saveIntakeContact(r.id, { name: "Mona", email: "mona@sample.test", consent: false }, "en", "9.9.9.1")).toMatchObject({ ok: false, error: "consent" });
    expect(await saveIntakeContact(r.id, { name: "Mona", email: "mona@sample.test", consent: true }, "en", "9.9.9.1")).toEqual({ ok: true });
    const [ik] = await (await getDb()).select().from(intakes).where(eq(intakes.id, r.id));
    const [lead] = await (await getDb()).select().from(leads).where(eq(leads.id, ik.leadId!));
    expect(lead.message).toContain(r.id);
    // Public runs are not visible to investors in the app; managers and analysts see them.
    expect((await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(valuationRuns).where(eq(valuationRuns.id, res.run.id))))).toEqual([]);
  });
  it("rejects invalid answers and types not offered publicly", async () => {
    expect(await submitIntake({ type: "mixed", districtId: "maadi", areaSqm: 900 }, "en", "9.9.9.2")).toMatchObject({ ok: false, error: "invalid" });
    expect(await submitIntake({ type: "apartment", districtId: "maadi" }, "en", "9.9.9.2")).toMatchObject({ ok: false, error: "invalid", fields: ["areaSqm"] });
  });
});

describe("asset runs and review", () => {
  let id = "";
  it("managers and analysts run HORUS on an asset; the snapshot is kept; investors cannot run", async () => {
    expect(await startAssetRun(inv, "A-001")).toEqual({ ok: false, error: "forbidden" });
    const r = await startAssetRun(mgr, "A-014");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    const run = (await getRun(mgr, id))!;
    expect(run).toMatchObject({ status: "in_review", assetId: "A-014", modelVersion: "HORUS-2.0.0" });
    expect(run.inputs.type).toBe("villa");
    expect((await listRuns(mgr, "A-014"))!.map((x) => x.id)).toContain(id);
  });
  it("investors see a run without the rent in its workings", async () => {
    const run = (await getRun(inv, id))!;
    const income = run.result.methods.find((m) => m.id === "income")!;
    expect(income.workings.grossAnnualRent).toBeUndefined();
  });
  it("only an analyst who did not start it signs it off; the estimate joins the record as a verified fact", async () => {
    expect(await reviewRun(mgr, id, { verdict: "signed_off" })).toEqual({ ok: false, error: "forbidden" });
    expect(await reviewRun(an, id, { verdict: "returned" })).toEqual({ ok: false, error: "invalid" });
    expect(await reviewRun(an, id, { verdict: "signed_off", note: "Comparables and land level checked." })).toMatchObject({ ok: true });
    expect(await reviewRun(an, id, { verdict: "signed_off" })).toEqual({ ok: false, error: "closed" });
    const fact = (await getAssetRecord(mgr, "A-014"))!.facts.find((f) => f.field === "horus_estimate")!;
    expect(fact).toMatchObject({ sourceRef: id, status: "verified", reviewedBy: "u-analyst" });
    const own = await startAssetRun(an, "A-001");
    expect(own.ok).toBe(true);
    if (own.ok) expect(await reviewRun(an, own.id, { verdict: "signed_off" })).toEqual({ ok: false, error: "own_run" });
  });
  it("runs cannot be rewritten through the app connection", async () => {
    await expect(withSession({ userId: an.id, role: "analyst" }, (tx) => tx.update(valuationRuns).set({ valueEgp: 1 }).where(eq(valuationRuns.id, id)))).rejects.toThrow();
  });
});
