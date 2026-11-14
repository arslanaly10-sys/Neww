import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "16.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { withSession } from "../src/db/client";
import { assetFacts, assetVersions, assets, cashflows, installments } from "../src/db/schema";
import { factQueue, getAssetRecord, payInstallment, recordSummary, reviewFact, updateAssetDetails } from "../src/lib/asset-record";
import { getPortfolio } from "../src/lib/access";
import { listNotifications } from "../src/lib/notify";
import { can } from "../src/lib/permissions";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst"), adm = U("u-admin", "admin");

describe("the asset record", () => {
  it("every asset belongs to the portfolio, with ownership adding up to 100%, buildings, units and a first version", async () => {
    const r = (await getAssetRecord(mgr, "A-008"))!;
    expect(r.portfolio!.id).toBe("P-001");
    expect(r.owners.reduce((s, o) => s + o.sharePct, 0)).toBe(100);
    expect(r.buildings.length).toBe(1);
    expect(r.units.length).toBe(8); // the mixed-use block
    expect(r.versions.map((v) => v.version)).toEqual([1]);
    expect(r.facts.find((f) => f.field === "area_sqm")).toMatchObject({ value: String(r.asset.areaSqm), unit: "m²" });
    const plot = (await getAssetRecord(mgr, "A-006"))!; // land
    expect(plot.buildings).toEqual([]);
    expect(plot.asset.plotAreaSqm).toBe(plot.asset.areaSqm);
    for (const a of await getPortfolio(mgr)) {
      const o = (await getAssetRecord(mgr, a.id))!.owners;
      expect(o.reduce((s, x) => s + x.sharePct, 0), a.id).toBe(100);
    }
  });
  it("off-plan instalments: paid, still owed, next due", async () => {
    const r = (await getAssetRecord(inv, "A-012"))!;
    expect(r.asset.status).toBe("under_construction");
    expect(r.planTotals!.total).toBe(12 * 360_000);
    expect(r.planTotals!.paid + r.planTotals!.outstanding).toBe(r.planTotals!.total);
    expect(r.planTotals!.next!.dueOn > "2026-08-31").toBe(true);
    const s = (await recordSummary(inv))!;
    expect(s.outstandingEgp).toBeGreaterThan(0);
    expect(s.verifiedShare).toBeGreaterThan(0);
  });
});

describe("changing details keeps the identity and the history", () => {
  const edit = { name: "Lotus Residences 9C", nameAr: "لوتس ريزيدنس 9 ج", areaSqm: 168, plotAreaSqm: "", floor: 9, finish: "fully_finished", yearBuilt: 2024, occupancy: "vacant", status: "ready", deliveryOn: "", reason: "Remeasured at handover; finishing completed", sourceKind: "survey", sourceRef: "" };
  it("a change makes version 2, new unverified facts, keeps the old ones, and asks analysts to review", async () => {
    expect(await updateAssetDetails(inv, "A-011", edit)).toEqual({ ok: false, error: "forbidden" });
    expect(await updateAssetDetails(mgr, "A-011", { ...edit, reason: "x" })).toEqual({ ok: false, error: "invalid" });
    const r = await updateAssetDetails(mgr, "A-011", edit);
    expect(r).toMatchObject({ ok: true, version: 2 });
    if (!r.ok) return;
    expect(r.changed).toEqual(expect.arrayContaining(["areaSqm", "finish"]));
    const rec = (await getAssetRecord(mgr, "A-011"))!;
    expect(rec.asset.id).toBe("A-011");
    expect(rec.versions.map((v) => v.version)).toEqual([2, 1]);
    expect((rec.versions[1].snapshot as { areaSqm: number }).areaSqm).toBe(165);
    const area = rec.facts.find((f) => f.field === "area_sqm")!;
    expect(area).toMatchObject({ value: "168", status: "unverified", sourceKind: "survey" });
    expect(area.earlier[0].value).toBe("165");
    expect((await listNotifications(an, "en")).find((n) => n.kind === "facts_to_review")!.title).toBe("A-011: 2 facts to review");
    expect(await updateAssetDetails(mgr, "A-011", edit)).toEqual({ ok: false, error: "no_change" });
  });
  it("history cannot be rewritten through the app connection", async () => {
    await expect(withSession({ userId: mgr.id, role: "manager" }, (tx) => tx.update(assetVersions).set({ reason: "x" }).where(eq(assetVersions.assetId, "A-011")))).rejects.toThrow();
    await expect(withSession({ userId: mgr.id, role: "manager" }, (tx) => tx.delete(assetFacts).where(eq(assetFacts.assetId, "A-011")))).rejects.toThrow();
  });
});

describe("analysts review the evidence", () => {
  it("the analyst sees the portfolio but no rent or costs, and cannot change records", async () => {
    expect((await getPortfolio(an)).length).toBe(30);
    expect(await withSession({ userId: an.id, role: "analyst" }, (tx) => tx.select().from(cashflows))).toEqual([]);
    expect(can("analyst", "records.verify")).toBe(true);
    expect(can("analyst", "finance.manage") || can("analyst", "rent.manage") || can("analyst", "records.edit")).toBe(false);
    await expect(withSession({ userId: an.id, role: "analyst" }, (tx) => tx.update(assets).set({ areaSqm: 1 }).where(eq(assets.id, "A-001")).returning({ id: assets.id }))).resolves.toEqual([]);
    expect(await getAssetRecord(adm, "A-001")).toBeNull();
  });
  it("verifies and disputes facts; never one they recorded; a dispute tells the recorder", async () => {
    const q = (await factQueue(an))!;
    const area = q.find((f) => f.assetId === "A-011" && f.field === "area_sqm")!;
    expect(await reviewFact(mgr, area.id, { verdict: "verified" })).toEqual({ ok: false, error: "forbidden" });
    expect(await reviewFact(an, area.id, { verdict: "disputed" })).toEqual({ ok: false, error: "invalid" }); // a dispute needs a note
    expect(await reviewFact(an, area.id, { verdict: "disputed", note: "Survey says 166 m²" })).toMatchObject({ ok: true });
    expect((await listNotifications(mgr, "en")).find((n) => n.kind === "fact_disputed")!.body).toBe("Area needs another look.");
    expect(await reviewFact(an, area.id, { verdict: "verified" })).toMatchObject({ ok: true });
    expect((await getAssetRecord(an, "A-011"))!.facts.find((f) => f.field === "area_sqm")).toMatchObject({ status: "verified", reviewedBy: "u-analyst" });
    // Four eyes: a fact the analyst recorded themselves (simulated) cannot be reviewed by them.
    const own = q.find((f) => f.id !== area.id)!;
    const { getDb } = await import("../src/db/client");
    await (await getDb()).update(assetFacts).set({ recordedBy: "u-analyst" }).where(eq(assetFacts.id, own.id));
    expect(await reviewFact(an, own.id, { verdict: "verified" })).toEqual({ ok: false, error: "own_fact" });
  });
  it("instalments are marked paid by managers only, once", async () => {
    const rows = await withSession({ userId: mgr.id, role: "manager" }, (tx) => tx.select().from(installments).where(eq(installments.assetId, "A-011")));
    const due = rows.find((r) => !r.paidOn)!;
    expect(await payInstallment(an, due.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await payInstallment(mgr, due.id)).toMatchObject({ ok: true });
    expect(await payInstallment(mgr, due.id)).toEqual({ ok: false, error: "no_change" });
  });
});
